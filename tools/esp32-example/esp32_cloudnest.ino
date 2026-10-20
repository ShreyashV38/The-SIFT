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
 * - DHT22 sensor on GPIO 15 (temperature + humidity)
 * - LED on GPIO 2 (LED_BUILTIN — acts as relay/switch indicator)
 *
 * Instructions:
 * 1. Register a device via POST /v1/tenants/:slug/devices
 * 2. Copy the returned credentials into the placeholders below
 * 3. Run in Wokwi simulator (WiFi: "Wokwi-GUEST", password: "")
 */

#include <WiFi.h>
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
// ======================================================================

// Hardware pins
#define DHT_PIN   15
#define LED_PIN    2  // LED_BUILTIN on ESP32 DevKit

// Telemetry interval
const long TELEMETRY_INTERVAL_MS = 10000; // 10 seconds

// ==================== GLOBALS ====================
DHTesp dht;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastTelemetryTime = 0;
bool switchState = false;

// Synthetic fallback for when DHT reading fails (smooth sine wave)
float syntheticTemp(unsigned long ms) {
  return 22.0 + 3.0 * sin(ms / 30000.0 * 3.14159);
}
float syntheticHumidity(unsigned long ms) {
  return 50.0 + 10.0 * cos(ms / 45000.0 * 3.14159);
}

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

  bool newState = switchState;

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
  switchState = newState;
  digitalWrite(LED_PIN, switchState ? HIGH : LOW);

  Serial.println("--------------------------------------------");
  Serial.print("  Switch State: ");
  Serial.println(switchState ? "ON (LED HIGH)" : "OFF (LED LOW)");
  Serial.println("--------------------------------------------");
  Serial.println();

  // Immediately publish updated state back to telemetry
  publishTelemetry(true);
}

// ==================== Home Assistant MQTT Discovery ====================
void publishHomeAssistantDiscovery() {
  char discTopic[160];
  char payload[512];
  char telemTopic[128];
  char cmdTopic[128];

  snprintf(telemTopic, sizeof(telemTopic), "channels/%s/messages", TELEMETRY_CHANNEL);
  snprintf(cmdTopic, sizeof(cmdTopic), "channels/%s/messages", COMMAND_CHANNEL);

  Serial.println("Publishing Home Assistant MQTT auto-discovery configs...");

  // 1. Temperature Sensor
  snprintf(discTopic, sizeof(discTopic), "homeassistant/sensor/%s_temp/config", DEVICE_CLIENT_ID);
  snprintf(payload, sizeof(payload),
    "{\"name\":\"ESP32 Temperature\",\"unique_id\":\"%s_temp\",\"stat_t\":\"%s\",\"val_tpl\":\"{{ value_json.temperature }}\",\"unit_of_meas\":\"°C\",\"dev_cla\":\"temperature\",\"dev\":{\"ids\":[\"%s\"],\"name\":\"ESP32 IoT Node\",\"mf\":\"CloudNest\"}}",
    DEVICE_CLIENT_ID, telemTopic, DEVICE_CLIENT_ID);
  mqttClient.publish(discTopic, payload, true);

  // 2. Humidity Sensor
  snprintf(discTopic, sizeof(discTopic), "homeassistant/sensor/%s_humidity/config", DEVICE_CLIENT_ID);
  snprintf(payload, sizeof(payload),
    "{\"name\":\"ESP32 Humidity\",\"unique_id\":\"%s_humidity\",\"stat_t\":\"%s\",\"val_tpl\":\"{{ value_json.humidity }}\",\"unit_of_meas\":\"%%\",\"dev_cla\":\"humidity\",\"dev\":{\"ids\":[\"%s\"],\"name\":\"ESP32 IoT Node\",\"mf\":\"CloudNest\"}}",
    DEVICE_CLIENT_ID, telemTopic, DEVICE_CLIENT_ID);
  mqttClient.publish(discTopic, payload, true);

  // 3. Switch Entity
  snprintf(discTopic, sizeof(discTopic), "homeassistant/switch/%s_switch/config", DEVICE_CLIENT_ID);
  snprintf(payload, sizeof(payload),
    "{\"name\":\"ESP32 Switch\",\"unique_id\":\"%s_switch\",\"stat_t\":\"%s\",\"cmd_t\":\"%s\",\"val_tpl\":\"{{ value_json.state }}\",\"pl_on\":\"ON\",\"pl_off\":\"OFF\",\"stat_on\":\"ON\",\"stat_off\":\"OFF\",\"dev\":{\"ids\":[\"%s\"],\"name\":\"ESP32 IoT Node\",\"mf\":\"CloudNest\"}}",
    DEVICE_CLIENT_ID, telemTopic, cmdTopic, DEVICE_CLIENT_ID);
  mqttClient.publish(discTopic, payload, true);

  Serial.println("[OK] Home Assistant Discovery published (retained)");
}

// ==================== MQTT Connection ====================
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT broker (Magistrala)... ");
    Serial.print(MQTT_HOST);
    Serial.print(":");
    Serial.println(MQTT_PORT);

    if (mqttClient.connect(DEVICE_CLIENT_ID, DEVICE_CLIENT_ID, DEVICE_SECRET)) {
      Serial.println("[OK] MQTT Connected!");

      // Subscribe to command channel
      char commandTopic[128];
      snprintf(commandTopic, sizeof(commandTopic), "channels/%s/messages/#", COMMAND_CHANNEL);
      mqttClient.subscribe(commandTopic, 1);
      Serial.print("Subscribed to commands: ");
      Serial.println(commandTopic);
      Serial.println();

      // Announce device entities to Home Assistant via MQTT Discovery
      publishHomeAssistantDiscovery();
    } else {
      Serial.print("[FAIL] rc=");
      Serial.print(mqttClient.state());
      Serial.println(" — Check credentials (FR-08). Retrying in 5s...");
      delay(5000);
    }
  }
}

// ==================== Telemetry ====================
void publishTelemetry(bool isStateUpdate) {
  // Read DHT22 sensor
  TempAndHumidity data = dht.getTempAndHumidity();
  float temperature, humidity;

  if (isnan(data.temperature) || isnan(data.humidity)) {
    // Fallback to synthetic sine wave if DHT read fails
    unsigned long ms = millis();
    temperature = syntheticTemp(ms);
    humidity = syntheticHumidity(ms);
  } else {
    temperature = data.temperature;
    humidity = data.humidity;
  }

  // Build JSON payload
  StaticJsonDocument<256> doc;
  doc["device"] = DEVICE_CLIENT_ID;
  doc["temperature"] = serialized(String(temperature, 1));
  doc["humidity"] = serialized(String(humidity, 1));
  doc["state"] = switchState ? "ON" : "OFF";
  doc["uptime_sec"] = millis() / 1000;

  char buffer[256];
  serializeJson(doc, buffer);

  // Build topic
  char telemetryTopic[128];
  snprintf(telemetryTopic, sizeof(telemetryTopic), "channels/%s/messages", TELEMETRY_CHANNEL);

  if (!isStateUpdate) {
    Serial.print("Publishing telemetry → ");
    Serial.println(telemetryTopic);
    Serial.print("  ");
    Serial.println(buffer);
  } else {
    Serial.print("State update → ");
    Serial.println(buffer);
  }

  mqttClient.publish(telemetryTopic, buffer);
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
  Serial.println("============================================");
  Serial.println();

  // Initialize DHT22 sensor
  dht.setup(DHT_PIN, DHTesp::DHT22);
  Serial.println("DHT22 sensor initialized on GPIO 15");

  // Connect WiFi
  setupWiFi();

  // Configure MQTT
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);

  Serial.println("Setup complete. Starting main loop...");
  Serial.println();
}

// ==================== Loop ====================
void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastTelemetryTime > TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = now;
    publishTelemetry(false);
  }
}
