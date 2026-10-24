// ---------------------------------------------------------------------------
// SIFT Tenant Portal — UI Utilities (Phase 6C)
// ---------------------------------------------------------------------------
// - Toast notifications with automatic dismiss and aria-live announcements
// - Copy helper with visual feedback
// - In-browser Blob file downloads (sift-device.ino, sift-device.json)
// - C string escaping for ESP32 Arduino sketches
// - Relative time calculations
// ---------------------------------------------------------------------------

// Announce message to assistive technology
export function announce(message) {
  const liveRegion = document.getElementById('aria-live-region');
  if (liveRegion) {
    liveRegion.textContent = message;
  }
}

// Show toast notification
export function toast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;

  container.appendChild(el);
  announce(message);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// Copy to clipboard helper
export async function copyToClipboard(text, buttonEl, originalLabel = 'Copy') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older environments
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    if (buttonEl) {
      buttonEl.textContent = 'Copied!';
      buttonEl.classList.add('btn-primary');
      setTimeout(() => {
        buttonEl.textContent = originalLabel;
        buttonEl.classList.remove('btn-primary');
      }, 2000);
    }
    toast('Copied to clipboard', 'success', 2000);
  } catch (err) {
    toast('Failed to copy to clipboard', 'error');
  }
}

// Download file generated purely in the browser using Blob (P4 / Section 8)
export function downloadBlob(filename, textContent, mimeType = 'text/plain') {
  const blob = new Blob([textContent], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Escape strings for C/C++ string literals (Section 9.1)
export function escapeCString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// Format relative time (e.g. "3s ago", "5m ago")
export function formatRelativeTime(isoString) {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'Unknown';

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Render loading spinner HTML string
export function renderSpinner() {
  return `<span class="spinner" aria-hidden="true"></span>`;
}

// Generate ESP32 Arduino Sketch template (Section 9.1)
export function generateSketch({
  deviceName,
  deviceKind,
  wifiSsid,
  wifiPassword,
  mqttHost,
  mqttPort,
  mqttClientId,
  mqttUsername,
  mqttPassword,
  telemetryTopic,
  commandTopic,
  deviceId,
  publishIntervalMs = 10000,
}) {
  const ssid = escapeCString(wifiSsid || 'YOUR_WIFI_NAME');
  const pass = escapeCString(wifiPassword || 'YOUR_WIFI_PASSWORD');
  const host = escapeCString(mqttHost || '127.0.0.1');
  const port = parseInt(mqttPort || 1883, 10);
  const clientId = escapeCString(mqttClientId || '');
  const username = escapeCString(mqttUsername || clientId);
  const password = escapeCString(mqttPassword || '');
  const tTopic = escapeCString(telemetryTopic || '');
  const cTopic = escapeCString(commandTopic || '');
  const devId = escapeCString(deviceId || '');
  const kind = escapeCString(deviceKind || 'sensor');

  return `// SIFT device sketch for: ${deviceName} (${deviceKind})
#include <WiFi.h>
#include <PubSubClient.h>

// ---- 1. Your WiFi (2.4 GHz only) ----
const char* WIFI_SSID     = "${ssid}";
const char* WIFI_PASSWORD = "${pass}";

// ---- 2. SIFT connection (generated, keep private) ----
const char*    MQTT_HOST       = "${host}";
const uint16_t MQTT_PORT       = ${port};
const char*    MQTT_CLIENT_ID  = "${clientId}";
const char*    MQTT_USERNAME   = "${username}";
const char*    MQTT_PASSWORD   = "${password}";
const char*    TOPIC_TELEMETRY = "${tTopic}";
const char*    TOPIC_COMMAND   = "${cTopic}";
const char*    DEVICE_ID       = "${devId}";
const char*    DEVICE_KIND     = "${kind}";   // "sensor" or "switch"
const unsigned long PUBLISH_EVERY_MS = ${publishIntervalMs};

#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

WiFiClient net;
PubSubClient mqtt(net);
bool switchOn = false;
float temperature = 24.0;
unsigned long lastPublish = 0;

void publishState();

void connectWifi() {
  Serial.printf("WiFi connecting to %s\\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (millis() - start > 20000) {
      Serial.println("\\nWiFi failed, restarting");
      ESP.restart();
    }
  }
  Serial.printf("\\nWiFi connected: %s\\n", WiFi.localIP().toString().c_str());
}

void onMessage(char* topic, byte* payload, unsigned int length) {
  char msg[32];
  unsigned int n = length < sizeof(msg) - 1 ? length : sizeof(msg) - 1;
  memcpy(msg, payload, n);
  msg[n] = 0;
  Serial.printf("Command received: %s\\n", msg);
  if (strcmp(DEVICE_KIND, "switch") != 0) return;
  if (strcmp(msg, "ON") == 0) switchOn = true;
  else if (strcmp(msg, "OFF") == 0) switchOn = false;
  else return;
  digitalWrite(LED_BUILTIN, switchOn ? HIGH : LOW);
  publishState();
}

void publishState() {
  char body[160];
  if (strcmp(DEVICE_KIND, "switch") == 0) {
    snprintf(body, sizeof(body), "{\\"id\\":\\"%s\\",\\"state\\":\\"%s\\"}", DEVICE_ID, switchOn ? "ON" : "OFF");
  } else {
    temperature += ((int)random(-5, 6)) / 10.0f;   // simulated reading: replace with your sensor
    if (temperature < 15) temperature = 15;
    if (temperature > 35) temperature = 35;
    snprintf(body, sizeof(body), "{\\"id\\":\\"%s\\",\\"temperature\\":%.1f}", DEVICE_ID, temperature);
  }
  bool ok = mqtt.publish(TOPIC_TELEMETRY, body);
  Serial.printf("Published (%s): %s\\n", ok ? "ok" : "FAILED", body);
}

void connectMqtt() {
  int delayMs = 1000;
  while (!mqtt.connected()) {
    Serial.println("MQTT connecting...");
    if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("MQTT connected");
      mqtt.subscribe(TOPIC_COMMAND);
      publishState();
      return;
    }
    Serial.printf("MQTT failed, rc=%d, retry in %d ms\\n", mqtt.state(), delayMs);
    delay(delayMs);
    if (delayMs < 30000) delayMs *= 2;
    if (WiFi.status() != WL_CONNECTED) connectWifi();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  connectWifi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);
  mqtt.setCallback(onMessage);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();
  if (millis() - lastPublish >= PUBLISH_EVERY_MS) {
    lastPublish = millis();
    publishState();
  }
}
`;
}
