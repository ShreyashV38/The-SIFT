/*
 * CloudNest — ESP32 Virtual / Hardware Client
 * 
 * Demonstrates:
 * - FR-05: Device registration credentials used for MQTT authentication
 * - FR-04: Periodic telemetry publication to tenant's telemetry channel
 * - FR-14: Device shared across all tenant household members
 * - FR-15: Subscribes to command channel and responds to Home Assistant downlinks
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Magistrala MQTT Broker Configuration
const char* MQTT_SERVER   = "192.168.1.100"; // Or cluster loadbalancer IP / hostname
const int   MQTT_PORT     = 1883;

// Credentials returned once upon registration via Provisioning API (FR-05)
const char* DEVICE_CLIENT_ID   = "YOUR_DEVICE_CLIENT_ID";
const char* DEVICE_SECRET      = "YOUR_DEVICE_SECRET";
const char* TELEMETRY_CHANNEL  = "YOUR_TELEMETRY_CHANNEL_ID";
const char* COMMAND_CHANNEL    = "YOUR_COMMAND_CHANNEL_ID";

// Hardware Configuration
const int LED_PIN = 2; // Onboard LED

WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastMsgTime = 0;
const long interval = 10000; // 10 seconds

void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected! IP address: ");
  Serial.println(WiFi.localIP());
}

// Callback when a downlink command arrives from Home Assistant (FR-15)
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Command received on topic: ");
  Serial.println(topic);

  char message[256];
  if (length >= sizeof(message)) length = sizeof(message) - 1;
  memcpy(message, payload, length);
  message[length] = '\0';
  Serial.print("Payload: ");
  Serial.println(message);

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (!error) {
    if (doc.containsKey("power")) {
      const char* power = doc["power"];
      if (strcmp(power, "ON") == 0) {
        digitalWrite(LED_PIN, HIGH);
        Serial.println("Actuator turned ON");
      } else {
        digitalWrite(LED_PIN, LOW);
        Serial.println("Actuator turned OFF");
      }
    }
  } else {
    // Check plain text
    if (strcmp(message, "ON") == 0) {
      digitalWrite(LED_PIN, HIGH);
    } else if (strcmp(message, "OFF") == 0) {
      digitalWrite(LED_PIN, LOW);
    }
  }
}

void reconnect() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection to Magistrala...");
    // Connect with device client ID and secret (FR-05, FR-08)
    if (mqttClient.connect(DEVICE_CLIENT_ID, DEVICE_CLIENT_ID, DEVICE_SECRET)) {
      Serial.println("Connected to Magistrala!");

      // Subscribe to command channel (FR-15)
      char commandTopic[128];
      snprintf(commandTopic, sizeof(commandTopic), "channels/%s/messages/#", COMMAND_CHANNEL);
      mqttClient.subscribe(commandTopic, 1);
      Serial.print("Subscribed to command channel: ");
      Serial.println(commandTopic);
    } else {
      Serial.print("Connection failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" (Check credentials per FR-08). Retrying in 5s...");
      delay(5000);
    }
  }
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  setupWiFi();

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(callback);
}

void loop() {
  if (!mqttClient.connected()) {
    reconnect();
  }
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastMsgTime > interval) {
    lastMsgTime = now;

    // Read sensor (or simulated values)
    float temperature = 22.0 + (random(-20, 20) / 10.0);
    float humidity = 45.0 + (random(-50, 50) / 10.0);

    StaticJsonDocument<256> doc;
    doc["device"] = "esp32-living-room";
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;
    doc["state"] = digitalRead(LED_PIN) == HIGH ? "ON" : "OFF";
    doc["uptime_sec"] = millis() / 1000;

    char buffer[256];
    serializeJson(doc, buffer);

    char telemetryTopic[128];
    snprintf(telemetryTopic, sizeof(telemetryTopic), "channels/%s/messages/esp32", TELEMETRY_CHANNEL);

    Serial.print("Publishing telemetry to: ");
    Serial.println(telemetryTopic);
    mqttClient.publish(telemetryTopic, buffer);
  }
}
