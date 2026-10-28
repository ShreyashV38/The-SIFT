/*
 * ==========================================================================
 *  REQUIRED LIBRARIES — install these in your IDE BEFORE compiling
 * ==========================================================================
 *  Arduino IDE:
 *    Sketch -> Include Library -> Manage Libraries...
 *    (or click the Library Manager icon in the left sidebar),
 *    then search for and install:
 *      1. PubSubClient                 (by Nick O'Leary)
 *      2. DHT sensor library for ESPx  (by beegee_tokyo)
 *      3. ArduinoJson v6.x             (by Benoit Blanchon) — parses commands
 *
 *  PlatformIO:
 *    All libraries are already declared under lib_deps in platformio.ini.
 * ==========================================================================
 */

/*
 * CloudNest — ESP32 Virtual IoT Client (Wokwi-Ready)
 * 
 * Demonstrates:
 * - FR-05: Device registration credentials used for MQTT authentication
 * - FR-04: Periodic telemetry publication to tenant's telemetry channel
 * - FR-14: Device shared across all tenant household members
 * - FR-15: Subscribes to command channel and responds to Home Assistant downlinks
 *
 * Hardware (simulated in Wokwi):
 * - DHT22 sensor on GPIO 15 (temperature)
 * - LED on GPIO 2 (LED_BUILTIN — acts as relay/switch indicator)
 *
 * Telemetry payload depends on DEVICE_KIND:
 * - "switch": {"id":"<DEVICE_ID>","state":"ON|OFF","temperature":24.5}
 * - "sensor": {"id":"<DEVICE_ID>","temperature":24.5}
 *
 * Instructions:
 * 1. Register a device via POST /v1/tenants/:slug/devices
 * 2. Copy the returned credentials into the placeholders below
 * 3. Run in Wokwi simulator (WiFi: "Wokwi-GUEST", password: "")
 */

// Dual-Board Compatibility: Auto-detects ESP8266 vs ESP32 board
#if defined(ESP8266)
  #include <ESP8266WiFi.h>
#elif defined(ESP32)
  #include <WiFi.h>
#else
  #include <WiFi.h>
#endif
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHTesp.h>

// ==================== CONFIGURATION ====================
// WiFi — Wokwi provides "Wokwi-GUEST" with open access
const char* WIFI_SSID     = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// MQTT Broker — Magistrala via Wokwi gateway
// For Wokwi VS Code extension: "host.wokwi.internal"
// For local CLI simulator:     "127.0.0.1"
const char* MQTT_HOST = "host.wokwi.internal";
const int   MQTT_PORT = 1883;

// ===== PASTE YOUR DEVICE CREDENTIALS HERE (from provisioning API) =====
const char* DEVICE_CLIENT_ID   = "YOUR_DEVICE_CLIENT_ID";
const char* DEVICE_SECRET      = "YOUR_DEVICE_SECRET";
const char* TELEMETRY_CHANNEL  = "YOUR_TELEMETRY_CHANNEL_ID";
const char* COMMAND_CHANNEL    = "YOUR_COMMAND_CHANNEL_ID";
const char* DEVICE_ID          = "YOUR_DEVICE_ID";
const char* TENANT_SLUG        = "YOUR_TENANT_SLUG";
// Device kind: "switch" (sends state + temperature) or "sensor" (temperature only)
const char* DEVICE_KIND        = "switch";
// ======================================================================

// Hardware pins
#define DHT_PIN   15
#define LED_PIN    2  // LED_BUILTIN on ESP32 DevKit

// Telemetry interval
const long TELEMETRY_INTERVAL_MS = 10000; // 10 seconds

// ==================== GLOBALS ====================
DHTesp dht;
WiFiClient espClient;
PubSubClient mqtt(espClient);

char TOPIC_TELEMETRY[128];   // built in setup() from TELEMETRY_CHANNEL
char TOPIC_COMMAND[128];     // built in setup() from COMMAND_CHANNEL

unsigned long lastTelemetryTime = 0;
bool switchOn = false;
float temperature = 24.0;

void publishState();

// ==================== WiFi ====================
void setupWiFi() {
  Serial.println("============================================");
  Serial.println("  CloudNest ESP32 — Connecting to WiFi");
  Serial.println("============================================");
  Serial.print("SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;
    if (attempts > 40) {
      Serial.println("\n[ERROR] WiFi connection failed! Restarting...");
      ESP.restart();
    }
  }

  Serial.println();
  Serial.println("WiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.println();
}

// ==================== MQTT Callback ====================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.println("============================================");
  Serial.println("  >> COMMAND RECEIVED <<");
  Serial.println("============================================");
  Serial.print("Topic: ");
  Serial.println(topic);

  // Parse payload
  char message[256];
  if (length >= sizeof(message)) length = sizeof(message) - 1;
  memcpy(message, payload, length);
  message[length] = '\0';
  Serial.print("Payload: ");
  Serial.println(message);

  // Sensors have no actuator — ignore ON/OFF commands
  if (strcmp(DEVICE_KIND, "switch") != 0) {
    Serial.println("Ignoring command: DEVICE_KIND is \"sensor\"");
    return;
  }

  bool newState = switchOn;

  // Try JSON parsing first
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (!error) {
    // Handle { "state": "ON" } or { "switch": true } or { "power": "ON" }
    if (doc.containsKey("state")) {
      const char* state = doc["state"];
      newState = (strcmp(state, "ON") == 0);
    } else if (doc.containsKey("switch")) {
      newState = doc["switch"].as<bool>();
    } else if (doc.containsKey("power")) {
      const char* power = doc["power"];
      newState = (strcmp(power, "ON") == 0);
    }
  } else {
    // Plain text: "ON" / "OFF"
    if (strcmp(message, "ON") == 0) {
      newState = true;
    } else if (strcmp(message, "OFF") == 0) {
      newState = false;
    }
  }

  // Apply the switch state
  switchOn = newState;
  digitalWrite(LED_PIN, switchOn ? HIGH : LOW);

  Serial.println("--------------------------------------------");
  Serial.print("  Switch State: ");
  Serial.println(switchOn ? "ON (LED HIGH)" : "OFF (LED LOW)");
  Serial.println("--------------------------------------------");
  Serial.println();

  // Immediately publish updated state back to telemetry
  publishState();
}

// ==================== Home Assistant MQTT Discovery ====================
void publishHomeAssistantDiscovery() {
  char discTopic[160];
  char payload[512];

  Serial.println("Publishing Home Assistant MQTT auto-discovery configs...");

  // 1. Temperature Sensor (published by both "sensor" and "switch" kinds)
  snprintf(discTopic, sizeof(discTopic), "ha_%s/sensor/%s_temp/config", TENANT_SLUG, DEVICE_CLIENT_ID);
  snprintf(payload, sizeof(payload),
    "{\"name\":\"ESP32 Temperature\",\"unique_id\":\"%s_temp\",\"stat_t\":\"%s\",\"val_tpl\":\"{{ value_json.temperature }}\",\"unit_of_meas\":\"°C\",\"dev_cla\":\"temperature\",\"dev\":{\"ids\":[\"%s\"],\"name\":\"ESP32 IoT Node\",\"mf\":\"CloudNest\"}}",
    DEVICE_CLIENT_ID, TOPIC_TELEMETRY, DEVICE_CLIENT_ID);
  mqtt.publish(discTopic, payload, true);

  // 2. Switch Entity (only for "switch" kind — sensors don't report state)
  if (strcmp(DEVICE_KIND, "switch") == 0) {
    snprintf(discTopic, sizeof(discTopic), "ha_%s/switch/%s_switch/config", TENANT_SLUG, DEVICE_CLIENT_ID);
    snprintf(payload, sizeof(payload),
      "{\"name\":\"ESP32 Switch\",\"unique_id\":\"%s_switch\",\"stat_t\":\"%s\",\"cmd_t\":\"%s\",\"val_tpl\":\"{{ value_json.state }}\",\"pl_on\":\"ON\",\"pl_off\":\"OFF\",\"stat_on\":\"ON\",\"stat_off\":\"OFF\",\"dev\":{\"ids\":[\"%s\"],\"name\":\"ESP32 IoT Node\",\"mf\":\"CloudNest\"}}",
      DEVICE_CLIENT_ID, TOPIC_TELEMETRY, TOPIC_COMMAND, DEVICE_CLIENT_ID);
    mqtt.publish(discTopic, payload, true);
  }

  Serial.println("[OK] Home Assistant Discovery published (retained)");
}

// ==================== MQTT Connection ====================
void reconnectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Connecting to MQTT broker (Magistrala)... ");
    Serial.print(MQTT_HOST);
    Serial.print(":");
    Serial.println(MQTT_PORT);

    if (mqtt.connect(DEVICE_CLIENT_ID, DEVICE_CLIENT_ID, DEVICE_SECRET)) {
      Serial.println("[OK] MQTT Connected!");

      // Subscribe to command channel
      char commandTopic[128];
      snprintf(commandTopic, sizeof(commandTopic), "channels/%s/messages/#", COMMAND_CHANNEL);
      mqtt.subscribe(commandTopic, 1);
      Serial.print("Subscribed to commands: ");
      Serial.println(commandTopic);
      Serial.println();

      // Announce device entities to Home Assistant via MQTT Discovery
      publishHomeAssistantDiscovery();

      // Report initial state right away
      publishState();
    } else {
      Serial.print("[FAIL] rc=");
      Serial.print(mqtt.state());
      Serial.println(" — Check credentials (FR-08). Retrying in 5s...");
      delay(5000);
    }
  }
}

// ==================== Telemetry ====================
void publishState() {
  char body[160];

  // Refresh sensor value: read the real DHT22 sensor, and fall back to the
  // random-walk simulation if the read fails.
  TempAndHumidity data = dht.getTempAndHumidity();
  if (!isnan(data.temperature)) {
    temperature = data.temperature;
  } else {
    temperature += ((int)random(-5, 6)) / 10.0f;
    if (temperature < 15) temperature = 15;
    if (temperature > 35) temperature = 35;
  }

  if (strcmp(DEVICE_KIND, "switch") == 0) {
    // SWITCH mode: Sends BOTH switch state AND sensor readings
    snprintf(body, sizeof(body), "{\"id\":\"%s\",\"state\":\"%s\",\"temperature\":%.1f}", 
             DEVICE_ID, switchOn ? "ON" : "OFF", temperature);
  } else {
    // SENSOR mode: Sends ONLY sensor readings (no button state)
    snprintf(body, sizeof(body), "{\"id\":\"%s\",\"temperature\":%.1f}", 
             DEVICE_ID, temperature);
  }

  bool ok = mqtt.publish(TOPIC_TELEMETRY, body);
  Serial.printf("Published (%s): %s\n", ok ? "ok" : "FAILED", body);
}

// ==================== Setup ====================
void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("============================================");
  Serial.println("  CloudNest ESP32 IoT Client v1.0");
  Serial.println("  Platform: The-SIFT / CloudNest");
  Serial.print("  Device kind: ");
  Serial.println(DEVICE_KIND);
  Serial.println("============================================");
  Serial.println();

  // Build MQTT topics
  snprintf(TOPIC_TELEMETRY, sizeof(TOPIC_TELEMETRY), "channels/%s/messages", TELEMETRY_CHANNEL);
  snprintf(TOPIC_COMMAND, sizeof(TOPIC_COMMAND), "channels/%s/messages", COMMAND_CHANNEL);

  // Initialize DHT22 sensor
  dht.setup(DHT_PIN, DHTesp::DHT22);
  Serial.println("DHT22 sensor initialized on GPIO 15");

  // Connect WiFi
  setupWiFi();

  // Configure MQTT
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);

  Serial.println("Setup complete. Starting main loop...");
  Serial.println();
}

// ==================== Loop ====================
void loop() {
  if (!mqtt.connected()) {
    reconnectMQTT();
  }
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastTelemetryTime > TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = now;
    publishState();
  }
}
