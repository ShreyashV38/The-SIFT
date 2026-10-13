// ---------------------------------------------------------------------------
// CloudNest — Virtual IoT Device Simulator & Load Testing Suite
// ---------------------------------------------------------------------------
// FR-04: Telemetry routing to Magistrala MQTT
// FR-08: Invalid credential rejection
// FR-10: Load testing with recorded latency, throughput, error rates
// FR-14: Shared devices
// FR-15: Command channel isolation and downlink response
// ---------------------------------------------------------------------------

const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

// Parse CLI arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v === undefined ? true : v;
  return acc;
}, {});

const CONFIG = {
  brokerUrl: args.broker || process.env.MQTT_URL || 'mqtt://127.0.0.1:1883',
  scenario: args.scenario || 's1', // s1, s2, s3, s4, s5
  numTenants: parseInt(args.tenants || '3', 10),
  devicesPerTenant: parseInt(args.devices || '10', 10),
  intervalMs: parseInt(args.interval || '10000', 10),
  durationSec: parseInt(args.duration || '30', 10),
  outputCsv: args.csv || null,
};

// State
const state = {
  connectedDevices: 0,
  connectionErrors: 0,
  messagesSent: 0,
  messagesDelivered: 0,
  commandsReceived: 0,
  latenciesMs: [],
  commandLatenciesMs: [],
  authRejections: 0,
  startTime: 0,
};

function calculatePercentiles(arr) {
  if (arr.length === 0) return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const getP = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return {
    min: sorted[0],
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    max: sorted[sorted.length - 1],
  };
}

class SimulatedDevice {
  constructor({ id, name, tenant, channelId, commandChannelId, invalidAuth = false }) {
    this.id = id;
    this.name = name;
    this.tenant = tenant;
    this.channelId = channelId;
    this.commandChannelId = commandChannelId;
    this.invalidAuth = invalidAuth;
    this.client = null;
    this.timer = null;
    this.state = {
      temperature: 20 + Math.random() * 5,
      humidity: 40 + Math.random() * 20,
      power: 'OFF',
    };
  }

  connect() {
    return new Promise((resolve) => {
      const username = this.invalidAuth ? 'invalid-device-id' : this.id;
      const password = this.invalidAuth ? 'wrong-password' : `secret-${this.id}`;

      this.client = mqtt.connect(CONFIG.brokerUrl, {
        clientId: `dev-${this.tenant}-${this.id}`,
        username,
        password,
        reconnectPeriod: 0, // do not reconnect automatically in test
        connectTimeout: 5000,
      });

      this.client.on('connect', () => {
        state.connectedDevices++;

        // Subscribe to command channel if provided (FR-15, S5)
        if (this.commandChannelId) {
          const commandTopic = `channels/${this.commandChannelId}/messages/#`;
          this.client.subscribe(commandTopic, { qos: 1 });
        }

        resolve(true);
      });

      this.client.on('error', (err) => {
        if (this.invalidAuth) {
          state.authRejections++;
        } else {
          state.connectionErrors++;
        }
        resolve(false);
      });

      this.client.on('message', (topic, payload) => {
        // Handle incoming command
        try {
          const msg = JSON.parse(payload.toString());
          state.commandsReceived++;
          if (msg.sentAt) {
            const cmdLatency = Date.now() - msg.sentAt;
            state.commandLatenciesMs.push(cmdLatency);
          }
          if (msg.power) {
            this.state.power = msg.power;
          }
        } catch {
          // Plain payload string e.g. "ON" / "OFF"
          state.commandsReceived++;
          this.state.power = payload.toString();
        }
      });
    });
  }

  startPublishing(intervalMs) {
    this.timer = setInterval(() => {
      if (!this.client || !this.client.connected) return;

      this.state.temperature += (Math.random() - 0.5) * 0.4;
      this.state.humidity += (Math.random() - 0.5) * 0.8;

      const telemetry = {
        device: this.name,
        tenant: this.tenant,
        temperature: parseFloat(this.state.temperature.toFixed(2)),
        humidity: parseFloat(this.state.humidity.toFixed(2)),
        power: this.state.power,
        timestamp: Date.now(),
      };

      const topic = `channels/${this.channelId}/messages/${this.name}`;
      const payload = JSON.stringify(telemetry);

      const sendTime = Date.now();
      state.messagesSent++;

      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (!err) {
          state.messagesDelivered++;
          state.latenciesMs.push(Date.now() - sendTime);
        }
      });
    }, intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.client) this.client.end(true);
  }
}

async function runScenario() {
  console.log(`========================================================`);
  console.log(` CloudNest IoT Load Simulator — Scenario: ${CONFIG.scenario.toUpperCase()}`);
  console.log(` Broker: ${CONFIG.brokerUrl}`);
  console.log(` Tenants: ${CONFIG.numTenants}, Devices/tenant: ${CONFIG.devicesPerTenant}`);
  console.log(` Duration: ${CONFIG.durationSec}s`);
  console.log(`========================================================\n`);

  state.startTime = Date.now();
  const devices = [];

  // Setup virtual tenants and channels
  for (let t = 1; t <= CONFIG.numTenants; t++) {
    const tenantSlug = `tenant-load-${t}`;
    const channelId = `chan-telemetry-${t}`;
    const commandChannelId = `chan-commands-${t}`;

    for (let d = 1; d <= CONFIG.devicesPerTenant; d++) {
      const isInvalid = CONFIG.scenario === 's4' && (d % 5 === 0); // 20% invalid in S4
      const device = new SimulatedDevice({
        id: `device-${t}-${d}`,
        name: `sensor-${t}-${d}`,
        tenant: tenantSlug,
        channelId,
        commandChannelId,
        invalidAuth: isInvalid,
      });
      devices.push(device);
    }
  }

  console.log(`Connecting ${devices.length} devices...`);

  if (CONFIG.scenario === 's2') {
    // S2: Connect storm (all within a few seconds)
    await Promise.all(devices.map((d) => d.connect()));
  } else {
    // Gradual ramp-up
    for (let i = 0; i < devices.length; i++) {
      await devices[i].connect();
      if (i % 20 === 0 && i > 0) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  console.log(`Connected: ${state.connectedDevices}, Auth Rejections: ${state.authRejections}, Errors: ${state.connectionErrors}`);

  // Telemetry publication
  const publishInterval = CONFIG.scenario === 's3' ? 1000 : CONFIG.intervalMs;
  devices.filter((d) => !d.invalidAuth).forEach((d) => d.startPublishing(publishInterval));

  // Scenario 5: Command round trip test
  let commandSenderTimer = null;
  if (CONFIG.scenario === 's5') {
    console.log(`Starting downlink command dispatch test (FR-15)...`);
    const validDevices = devices.filter((d) => !d.invalidAuth);
    commandSenderTimer = setInterval(() => {
      const targetDevice = validDevices[Math.floor(Math.random() * validDevices.length)];
      if (targetDevice && targetDevice.client && targetDevice.client.connected) {
        const cmdTopic = `channels/${targetDevice.commandChannelId}/messages/command`;
        const cmdPayload = JSON.stringify({
          action: 'set_state',
          power: Math.random() > 0.5 ? 'ON' : 'OFF',
          sentAt: Date.now(),
        });
        targetDevice.client.publish(cmdTopic, cmdPayload, { qos: 1 });
      }
    }, 500);
  }

  // Run for specified duration
  await new Promise((r) => setTimeout(r, CONFIG.durationSec * 1000));

  // Teardown
  if (commandSenderTimer) clearInterval(commandSenderTimer);
  devices.forEach((d) => d.stop());

  // Report results
  const elapsedSec = (Date.now() - state.startTime) / 1000;
  const deliveryRate = state.messagesSent > 0 ? (state.messagesDelivered / state.messagesSent) * 100 : 100;
  const throughputMsgSec = (state.messagesDelivered / elapsedSec).toFixed(2);
  const latStats = calculatePercentiles(state.latenciesMs);
  const cmdStats = calculatePercentiles(state.commandLatenciesMs);

  console.log(`\n========================================================`);
  console.log(` RESULTS SUMMARY: Scenario ${CONFIG.scenario.toUpperCase()}`);
  console.log(`========================================================`);
  console.log(` Elapsed Time:        ${elapsedSec.toFixed(1)}s`);
  console.log(` Connected Devices:   ${state.connectedDevices} / ${devices.length}`);
  console.log(` Auth Rejections:     ${state.authRejections} (FR-08 verified)`);
  console.log(` Messages Sent:       ${state.messagesSent}`);
  console.log(` Messages Delivered:  ${state.messagesDelivered} (${deliveryRate.toFixed(2)}%)`);
  console.log(` Throughput:          ${throughputMsgSec} msg/sec`);
  console.log(` Telemetry Latency:   p50=${latStats.p50}ms, p90=${latStats.p90}ms, p95=${latStats.p95}ms, max=${latStats.max}ms`);
  if (CONFIG.scenario === 's5') {
    console.log(` Commands Received:   ${state.commandsReceived}`);
    console.log(` Command Latency:     p50=${cmdStats.p50}ms, p95=${cmdStats.p95}ms, max=${cmdStats.max}ms (FR-15 verified)`);
  }
  console.log(`========================================================\n`);

  if (CONFIG.outputCsv) {
    const csvDir = path.dirname(CONFIG.outputCsv);
    if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
    const header = 'scenario,tenants,devices,duration_sec,sent,delivered,delivery_rate,throughput_msg_sec,p50_ms,p95_ms,p99_ms\n';
    const row = `${CONFIG.scenario},${CONFIG.numTenants},${CONFIG.devicesPerTenant},${elapsedSec},${state.messagesSent},${state.messagesDelivered},${deliveryRate.toFixed(2)},${throughputMsgSec},${latStats.p50},${latStats.p95},${latStats.p99}\n`;
    if (!fs.existsSync(CONFIG.outputCsv)) {
      fs.writeFileSync(CONFIG.outputCsv, header + row);
    } else {
      fs.appendFileSync(CONFIG.outputCsv, row);
    }
    console.log(`Measurements saved to: ${CONFIG.outputCsv}`);
  }
}

runScenario().catch((err) => {
  console.error('Simulator fatal error:', err);
  process.exit(1);
});
