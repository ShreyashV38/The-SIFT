// ---------------------------------------------------------------------------
// The-SIFT Smart Home Portal — UI Utilities & Helpers
// ---------------------------------------------------------------------------
// - Toast notifications with automatic dismiss and aria-live announcements
// - Copy helper with visual feedback
// - Theme persistence (Dark Mode default / Light Mode)
// - Dynamic Domain & Broker Endpoint Resolution
// - In-browser Blob file downloads (sift-device.ino, sift-device.json, one-device.js)
// ---------------------------------------------------------------------------

const THEME_STORAGE_KEY = 'sift-theme';

export function getCurrentTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', normalized === 'light' ? '#F8FAFC' : '#08090C');
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage quota errors
  }
  return normalized;
}

export function initTheme() {
  return applyTheme(getCurrentTheme());
}

export function toggleTheme() {
  const next = getCurrentTheme() === 'light' ? 'dark' : 'light';
  return applyTheme(next);
}

// Dynamic Cloud Domain & Endpoint Resolution
export function resolveCloudDomain(configuredDomain) {
  const host = (typeof window !== 'undefined' && window.location && window.location.hostname)
    ? window.location.hostname
    : '';
  if (configuredDomain && typeof configuredDomain === 'string' && configuredDomain.trim()) {
    return configuredDomain.trim();
  }
  return host || 'sift-cloud.io';
}

export function resolveMqttHost(configuredHost) {
  const host = (typeof window !== 'undefined' && window.location && window.location.hostname)
    ? window.location.hostname
    : 'mqtt.sift-cloud.io';
  if (!configuredHost || typeof configuredHost !== 'string') {
    return host;
  }
  const clean = configuredHost.trim();
  const loopbackHosts = ['host.wokwi.internal', 'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];
  if (!clean || loopbackHosts.includes(clean.toLowerCase())) {
    return host;
  }
  return clean;
}

export function resolveHaUrl(slug, tenantUrl, configuredDomain) {
  if (tenantUrl && typeof tenantUrl === 'string' && tenantUrl.trim()) {
    return tenantUrl.trim();
  }
  const domain = resolveCloudDomain(configuredDomain);
  return `https://${slug}.${domain}`;
}

export function formatTierBadge(plan) {
  if (!plan) return 'SINGLE';
  const p = String(plan).toLowerCase();
  if (p === 'family') return 'FAMILY';
  return 'SINGLE';
}

export function formatTierName(plan) {
  if (!plan) return 'Single Plan';
  const p = String(plan).toLowerCase();
  if (p === 'family') return 'Family Plan';
  return 'Single Plan';
}

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

  const iconSvg = type === 'success'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--led-emerald)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>`
    : type === 'error'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--led-rose)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  const span = document.createElement('span');
  span.textContent = message;
  el.innerHTML = iconSvg;
  el.appendChild(span);

  container.appendChild(el);
  announce(message);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all 0.25s ease';
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// Copy to clipboard helper
export async function copyToClipboard(text, buttonEl, originalLabel = 'Copy') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
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
      const prev = buttonEl.textContent;
      buttonEl.textContent = 'Copied';
      buttonEl.classList.add('btn-primary');
      setTimeout(() => {
        buttonEl.textContent = originalLabel || prev;
        buttonEl.classList.remove('btn-primary');
      }, 1800);
    }
    toast('Copied to clipboard', 'success', 2000);
  } catch {
    toast('Failed to copy to clipboard', 'error');
  }
}

// Download file generated purely in the browser using Blob
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

// Escape strings for C/C++ string literals
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

// Render the "Required Libraries" callout shown next to ESP32 firmware downloads
export function renderRequiredLibrariesCallout(extraStyle = '') {
  return `
    <div class="banner banner-info" role="note" aria-label="Required Arduino libraries" style="display: block; ${extraStyle}">
      <strong style="display: block; margin-bottom: 4px;">Required Libraries (install before compiling)</strong>
      <div style="font-size: 0.8125rem; line-height: 1.7;">
        <strong>Arduino IDE:</strong> Go to <em>Sketch &rarr; Include Library &rarr; Manage Libraries...</em>
        (or click the <strong>Library Manager</strong> icon on the left sidebar), then search for and install:
        <ul style="margin: 4px 0 0 1.25rem;">
          <li><code>PubSubClient</code> <span style="color: var(--text-muted);">(by Nick O'Leary)</span></li>
          <li><code>DHT sensor library for ESPx</code> <span style="color: var(--text-muted);">(by beegee_tokyo)</span></li>
        </ul>
      </div>
    </div>
  `;
}

// Generate ESP32 Arduino / PlatformIO Firmware Sketch
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
  const ssid = escapeCString(wifiSsid || 'YOUR_WIFI_SSID');
  const pass = escapeCString(wifiPassword || 'YOUR_WIFI_PASSWORD');
  const host = escapeCString(resolveMqttHost(mqttHost));
  const port = parseInt(mqttPort || 1883, 10);
  const clientId = escapeCString(mqttClientId || '');
  const username = escapeCString(mqttUsername || clientId);
  const password = escapeCString(mqttPassword || '');
  const tTopic = escapeCString(telemetryTopic || '');
  const cTopic = escapeCString(commandTopic || '');
  const devId = escapeCString(deviceId || '');
  const kind = escapeCString(deviceKind || 'sensor');

  return `// The-SIFT Cloud Hardware Firmware for: ${deviceName} (${deviceKind})
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
 *
 *  Telemetry payload depends on DEVICE_KIND:
 *    "switch" -> {"id":"<DEVICE_ID>","state":"ON|OFF","temperature":24.5}
 *    "sensor" -> {"id":"<DEVICE_ID>","temperature":24.5}
 * ==========================================================================
 */
#include <WiFi.h>
#include <PubSubClient.h>

// ---- 1. WiFi Network Configuration (2.4 GHz) ----
const char* WIFI_SSID     = "${ssid}";
const char* WIFI_PASSWORD = "${pass}";

// ---- 2. The-SIFT Cloud Broker Credentials ----
const char*    MQTT_HOST       = "${host}";
const uint16_t MQTT_PORT       = ${port};
const char*    MQTT_CLIENT_ID  = "${clientId}";
const char*    MQTT_USERNAME   = "${username}";
const char*    MQTT_PASSWORD   = "${password}";
const char*    TOPIC_TELEMETRY = "${tTopic}";
const char*    TOPIC_COMMAND   = "${cTopic}";
const char*    DEVICE_ID       = "${devId}";
const char*    DEVICE_KIND     = "${kind}";
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
  Serial.printf("Connecting to WiFi %s\\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (millis() - start > 20000) {
      Serial.println("\\nWiFi timeout, restarting MCU");
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
  Serial.printf("Cloud command received: %s\\n", msg);
  if (strcmp(DEVICE_KIND, "switch") != 0) return;
  if (strcmp(msg, "ON") == 0) switchOn = true;
  else if (strcmp(msg, "OFF") == 0) switchOn = false;
  else return;
  digitalWrite(LED_BUILTIN, switchOn ? HIGH : LOW);
  publishState();
}

void publishState() {
  char body[160];

  // Refresh sensor value simulation (or read real DHT22 sensor here)
  temperature += ((int)random(-5, 6)) / 10.0f;
  if (temperature < 15) temperature = 15;
  if (temperature > 35) temperature = 35;

  if (strcmp(DEVICE_KIND, "switch") == 0) {
    // SWITCH mode: Sends BOTH switch state AND sensor readings
    snprintf(body, sizeof(body), "{\\"id\\":\\"%s\\",\\"state\\":\\"%s\\",\\"temperature\\":%.1f}", 
             DEVICE_ID, switchOn ? "ON" : "OFF", temperature);
  } else {
    // SENSOR mode: Sends ONLY sensor readings (no button state)
    snprintf(body, sizeof(body), "{\\"id\\":\\"%s\\",\\"temperature\\":%.1f}", 
             DEVICE_ID, temperature);
  }

  bool ok = mqtt.publish(TOPIC_TELEMETRY, body);
  Serial.printf("Published (%s): %s\\n", ok ? "ok" : "FAILED", body);
}

void connectMqtt() {
  int delayMs = 1000;
  while (!mqtt.connected()) {
    Serial.println("Connecting to The-SIFT Cloud MQTT...");
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

// Generate Virtual Device Simulator Script (one-device.js) in-browser
export function generateOneDeviceScript() {
  const defaultBrokerHost = resolveMqttHost('');
  return `#!/usr/bin/env node
// ---------------------------------------------------------------------------
// The-SIFT Virtual Device Simulator — one-device.js
// ---------------------------------------------------------------------------
// Simulates a smart home sensor or switch for your household.
// Usage:
//   npm install mqtt
//   node one-device.js --config ./sift-device.json
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');

const args = process.argv.slice(2);
let configPath = 'sift-device.json';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' && args[i + 1]) {
    configPath = args[i + 1];
    i++;
  }
}

const resolvedPath = path.resolve(process.cwd(), configPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(\`Error: Configuration file not found at \${resolvedPath}\`);
  console.error('Download sift-device.json from The-SIFT Smart Home Portal.');
  console.error('Usage: node one-device.js --config ./sift-device.json');
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
} catch (err) {
  console.error(\`Error parsing JSON in \${resolvedPath}:\`, err.message);
  process.exit(1);
}

const device = cfg.device || {};
const mqttCfg = cfg.mqtt || {};
const deviceId = device.id || 'dev_unknown';
const deviceName = device.name || 'Smart Device';
const deviceKind = device.kind || 'sensor';
const intervalSec = cfg.publishIntervalSeconds || 10;

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];
const cfgHost = (mqttCfg.host || '').trim();
const brokerHost = (!cfgHost || LOOPBACK_HOSTS.includes(cfgHost.toLowerCase()))
  ? '${defaultBrokerHost}'
  : cfgHost;
const brokerPort = mqttCfg.port || 1883;

console.log('========================================================');
console.log(\` The-SIFT Smart Device: \${deviceName} (\${deviceKind})\`);
console.log(\` Broker:    \${brokerHost}:\${brokerPort}\`);
console.log(\` Device ID: \${deviceId}\`);
console.log('========================================================\\n');

let currentTemp = 24.0;
let switchState = 'OFF';

const brokerUrl = \`\${mqttCfg.tls ? 'mqtts' : 'mqtt'}://\${brokerHost}:\${brokerPort}\`;
console.log(\`Connecting to Cloud MQTT endpoint \${brokerUrl}...\`);

const client = mqtt.connect(brokerUrl, {
  clientId: mqttCfg.clientId,
  username: mqttCfg.username || mqttCfg.clientId,
  password: mqttCfg.password,
  reconnectPeriod: 2000,
});

client.on('connect', () => {
  console.log('Cloud MQTT session established');

  if (mqttCfg.commandTopic) {
    client.subscribe(mqttCfg.commandTopic, { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to subscribe to command channel:', err.message);
      } else {
        console.log(\`Subscribed to command channel: \${mqttCfg.commandTopic}\`);
      }
    });
  }

  publishState();
});

client.on('message', (topic, payload) => {
  const msg = payload.toString().trim();
  console.log(\`Cloud command received: \${msg}\`);

  if (deviceKind === 'switch') {
    if (msg === 'ON' || msg === '{"state":"ON"}' || msg === '{"switch":true}') {
      switchState = 'ON';
    } else if (msg === 'OFF' || msg === '{"state":"OFF"}' || msg === '{"switch":false}') {
      switchState = 'OFF';
    }
    console.log(\`Actuator relay state updated: \${switchState}\`);
    publishState();
  }
});

client.on('error', (err) => {
  console.error(\`MQTT error (\${client.reconnecting ? 'reconnecting' : 'fault'}): \${err.message}\`);
});

client.on('offline', () => {
  console.log('MQTT link offline, reconnecting...');
});

function publishState() {
  if (!client.connected) return;

  // Refresh simulated temperature (random walk clamped to 15.0 - 35.0 C)
  const delta = (Math.floor(Math.random() * 11) - 5) / 10.0;
  currentTemp = parseFloat((currentTemp + delta).toFixed(1));
  if (currentTemp < 15.0) currentTemp = 15.0;
  if (currentTemp > 35.0) currentTemp = 35.0;

  let payloadObj;
  if (deviceKind === 'switch') {
    // SWITCH mode: Sends BOTH switch state AND sensor readings
    payloadObj = {
      id: deviceId,
      state: switchState,
      temperature: currentTemp,
    };
  } else {
    // SENSOR mode: Sends ONLY sensor readings (no switch state)
    payloadObj = {
      id: deviceId,
      temperature: currentTemp,
    };
  }

  const payloadStr = JSON.stringify(payloadObj);
  client.publish(mqttCfg.telemetryTopic, payloadStr, { qos: 1 }, (err) => {
    if (err) {
      console.log(\`Published (FAILED): \${payloadStr}\`);
    } else {
      console.log(\`Published (ok): \${payloadStr}\`);
    }
  });
}

setInterval(publishState, intervalSec * 1000);

process.on('SIGINT', () => {
  console.log('\\nClosing Cloud Verification session...');
  client.end(false, () => {
    console.log('Session closed.');
    process.exit(0);
  });
});
`;
}
