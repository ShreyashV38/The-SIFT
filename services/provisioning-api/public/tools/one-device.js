#!/usr/bin/env node
// ---------------------------------------------------------------------------
// SIFT Virtual Device CLI — one-device.js (Phase 6C)
// ---------------------------------------------------------------------------
// Usage:
//   npm install mqtt
//   node one-device.js --config .\sift-device.json
//
// Reads the generated sift-device.json configuration, connects to MQTT,
// publishes simulated telemetry with device ID every publishIntervalSeconds,
// subscribes to the command topic, toggles virtual switch, and prints
// lines identical to the ESP32 Serial Monitor.
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
  console.error(`Error: Configuration file not found at ${resolvedPath}`);
  console.error('Make sure you have downloaded sift-device.json from the SIFT Portal.');
  console.error('Usage: node one-device.js --config .\\sift-device.json');
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
} catch (err) {
  console.error(`Error parsing JSON in ${resolvedPath}:`, err.message);
  process.exit(1);
}

const device = cfg.device || {};
const mqttCfg = cfg.mqtt || {};
const deviceId = device.id || 'dev_unknown';
const deviceName = device.name || 'Virtual Device';
const deviceKind = device.kind || 'sensor';
const intervalSec = cfg.publishIntervalSeconds || 10;

console.log('========================================================');
console.log(` SIFT Virtual Device: ${deviceName} (${deviceKind})`);
console.log(` Target Broker: ${mqttCfg.host}:${mqttCfg.port}`);
console.log(` Device ID:     ${deviceId}`);
console.log('========================================================\n');

let currentTemp = 24.0;
let switchState = 'OFF';

// Resolve host: host.wokwi.internal only exists inside Wokwi QEMU; on native Windows/host OS use 127.0.0.1
let brokerHost = mqttCfg.host || '127.0.0.1';
if (brokerHost === 'host.wokwi.internal' || brokerHost === 'localhost') {
  brokerHost = '127.0.0.1';
}

const brokerUrl = `${mqttCfg.tls ? 'mqtts' : 'mqtt'}://${brokerHost}:${mqttCfg.port || 1883}`;
console.log(`MQTT connecting to ${brokerUrl}...`);

const client = mqtt.connect(brokerUrl, {
  clientId: mqttCfg.clientId,
  username: mqttCfg.username || mqttCfg.clientId,
  password: mqttCfg.password,
  reconnectPeriod: 2000,
});

client.on('connect', () => {
  console.log('MQTT connected');

  if (mqttCfg.commandTopic) {
    client.subscribe(mqttCfg.commandTopic, { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to subscribe to command topic:', err.message);
      } else {
        console.log(`Subscribed to command topic: ${mqttCfg.commandTopic}`);
      }
    });
  }

  publishState();
});

client.on('message', (topic, payload) => {
  const msg = payload.toString().trim();
  console.log(`Command received: ${msg}`);

  if (deviceKind === 'switch') {
    if (msg === 'ON' || msg === '{"state":"ON"}' || msg === '{"switch":true}') {
      switchState = 'ON';
    } else if (msg === 'OFF' || msg === '{"state":"OFF"}' || msg === '{"switch":false}') {
      switchState = 'OFF';
    }
    console.log(`Virtual switch state is now: ${switchState}`);
    publishState();
  }
});

client.on('error', (err) => {
  console.error(`MQTT failed, rc=${client.reconnecting ? 'reconnecting' : 'error'}: ${err.message}`);
});

client.on('offline', () => {
  console.log('MQTT offline, retrying...');
});

function publishState() {
  if (!client.connected) return;

  let payloadObj;
  if (deviceKind === 'switch') {
    payloadObj = {
      id: deviceId,
      state: switchState,
    };
  } else {
    const delta = (Math.floor(Math.random() * 11) - 5) / 10.0;
    currentTemp = parseFloat((currentTemp + delta).toFixed(1));
    if (currentTemp < 15.0) currentTemp = 15.0;
    if (currentTemp > 35.0) currentTemp = 35.0;

    payloadObj = {
      id: deviceId,
      temperature: currentTemp,
      humidity: Math.floor(45 + Math.random() * 15),
    };
  }

  const payloadStr = JSON.stringify(payloadObj);
  client.publish(mqttCfg.telemetryTopic, payloadStr, { qos: 1 }, (err) => {
    if (err) {
      console.log(`Published (FAILED): ${payloadStr}`);
    } else {
      console.log(`Published (ok): ${payloadStr}`);
    }
  });
}

setInterval(publishState, intervalSec * 1000);

process.on('SIGINT', () => {
  console.log('\nDisconnecting virtual device...');
  client.end(false, () => {
    console.log('Virtual device stopped.');
    process.exit(0);
  });
});
