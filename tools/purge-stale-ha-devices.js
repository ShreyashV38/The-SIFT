#!/usr/bin/env node
// ---------------------------------------------------------------------------
// The-SIFT — Purge Stale MQTT Discovery Messages & Retained Device Topics
// ---------------------------------------------------------------------------
// Usage:
//   node tools/purge-stale-ha-devices.js [--broker=127.0.0.1:1883] [--prefix=homeassistant]
//
// Subscribes to discovery wildcard topics, collects all retained configuration
// payloads that cause ghost devices to appear in Home Assistant, and publishes
// empty retained messages ("") to permanently purge them from Mosquitto.
// ---------------------------------------------------------------------------

const mqtt = require('mqtt');

const args = process.argv.slice(2);
let brokerHost = process.env.MQTT_HOST || '127.0.0.1';
let brokerPort = parseInt(process.env.MQTT_PORT || '1883', 10);
let targetPrefix = 'homeassistant';

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--broker=')) {
    const parts = arg.slice(9).split(':');
    brokerHost = parts[0];
    if (parts[1]) brokerPort = parseInt(parts[1], 10);
  } else if (arg.startsWith('--prefix=')) {
    targetPrefix = arg.slice(9);
  }
}

const brokerUrl = `mqtt://${brokerHost}:${brokerPort}`;
console.log('========================================================');
console.log(' The-SIFT — Purge Stale MQTT Discovery Messages');
console.log(` Target Broker: ${brokerUrl}`);
console.log(` Target Prefix: ${targetPrefix}/#`);
console.log('========================================================\n');

const client = mqtt.connect(brokerUrl, {
  clientId: `purge-tool-${Date.now()}`,
  clean: true,
  connectTimeout: 5000,
});

const discoveredTopics = new Set();
let listeningTimer = null;

client.on('connect', () => {
  console.log('[1/3] Connected to MQTT broker. Listening for retained messages...');

  // Subscribe to all discovery topics
  client.subscribe([`${targetPrefix}/#`, 'ha_#'], { qos: 1 }, (err) => {
    if (err) {
      console.error('Subscription error:', err.message);
      client.end(true);
      process.exit(1);
    }

    console.log('[2/3] Subscribed to discovery topics. Collecting retained configs for 3 seconds...');

    // Wait 3 seconds to receive all retained messages from the broker
    listeningTimer = setTimeout(purgeCollectedTopics, 3000);
  });
});

client.on('message', (topic, payload, packet) => {
  if (packet.retain) {
    console.log(`  Found retained topic: ${topic}`);
    discoveredTopics.add(topic);
  }
});

function purgeCollectedTopics() {
  if (discoveredTopics.size === 0) {
    console.log('\n[3/3] No retained discovery messages found. Broker is clean!');
    client.end();
    process.exit(0);
  }

  console.log(`\n[3/3] Purging ${discoveredTopics.size} retained discovery topic(s)...`);

  let purged = 0;
  for (const topic of discoveredTopics) {
    // An empty payload with retain=true tells Mosquitto to delete the retained message
    client.publish(topic, '', { retain: true, qos: 1 }, (err) => {
      if (err) {
        console.error(`  [FAIL] Failed to purge: ${topic} (${err.message})`);
      } else {
        console.log(`  [CLEARED] ${topic}`);
      }
      purged++;
      if (purged === discoveredTopics.size) {
        console.log('\n========================================================');
        console.log(` SUCCESS: Purged ${purged} retained topics from MQTT broker.`);
        console.log(' Home Assistant will no longer restore these stale devices.');
        console.log('========================================================\n');
        client.end();
        process.exit(0);
      }
    });
  }
}

client.on('error', (err) => {
  console.error('MQTT error:', err.message);
  client.end(true);
  process.exit(1);
});
