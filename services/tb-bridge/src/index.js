// ---------------------------------------------------------------------------
// CloudNest — tb-bridge (Magistrala -> ThingsBoard & Internal Status Forwarder)
// ---------------------------------------------------------------------------
// FR-04: Device telemetry routes through Magistrala MQTT to HA and ThingsBoard
// FR-07: Platform administrators can view platform-wide telemetry in ThingsBoard
// Phase 6C: Device seen reporter (POST /internal/devices/seen on port 8081)
// ---------------------------------------------------------------------------

const mqtt = require('mqtt');
const express = require('express');
const winston = require('winston');

// Logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  defaultMeta: { service: 'tb-bridge' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...rest }) => {
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} [${service}] ${level}: ${message}${extra}`;
        })
      ),
    }),
  ],
});

// Config
const CONFIG = {
  port: parseInt(process.env.PORT || '3001', 10),
  provisioningApiUrl: process.env.PROVISIONING_API_URL || 'http://cloudnest-provisioning-api.provisioning.svc.cluster.local:3000',
  internalApiUrl: process.env.INTERNAL_API_URL || 'http://cloudnest-provisioning-api.provisioning.svc.cluster.local:8081',
  internalToken: process.env.INTERNAL_TOKEN || 'sift-internal-secret-token',
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '15000', 10),

  // Magistrala MQTT broker
  magistralaMqttUrl: process.env.MAGISTRALA_MQTT_URL || 'mqtt://magistrala-mqtt.platform.svc.cluster.local:1883',
  magistralaObserverClientId: process.env.MAGISTRALA_OBSERVER_CLIENT_ID || 'tb-bridge-observer',
  magistralaObserverSecret: process.env.MAGISTRALA_OBSERVER_SECRET || 'observer-secret',
  mqttShareGroup: process.env.MQTT_SHARE_GROUP || 'sift-bridge',
  useSharedSubscriptions: process.env.USE_SHARED_SUBSCRIPTIONS === 'true',

  // ThingsBoard
  tbMqttUrl: process.env.TB_MQTT_URL || 'mqtt://thingsboard.observability.svc.cluster.local:1883',
  tbGatewayToken: process.env.TB_GATEWAY_TOKEN || 'tb-gateway-token',
  tbHttpUrl: process.env.TB_HTTP_URL || 'http://thingsboard.observability.svc.cluster.local:8080',
};

// Metrics
const metrics = {
  messagesReceived: 0,
  messagesForwarded: 0,
  forwardErrors: 0,
  parseErrors: 0,
  unknownDevices: 0,
  reportsSent: 0,
  reportsFailed: 0,
  subscribedChannels: 0,
  startTime: new Date().toISOString(),
};

// Channel mapping: channelId -> { slug, workspaceId }
const activeChannels = new Map();

// Pending activity reports batch for Phase 6C (POST /internal/devices/seen)
let pendingReports = [];

// Initialize ThingsBoard MQTT Gateway client
let tbMqttClient = null;
function initThingsBoardClient() {
  logger.info('Connecting to ThingsBoard MQTT broker', { url: CONFIG.tbMqttUrl });
  tbMqttClient = mqtt.connect(CONFIG.tbMqttUrl, {
    username: CONFIG.tbGatewayToken,
    clientId: 'cloudnest-tb-bridge',
    reconnectPeriod: 5000,
  });

  tbMqttClient.on('connect', () => {
    logger.info('Connected to ThingsBoard Gateway MQTT');
  });

  tbMqttClient.on('error', (err) => {
    logger.error('ThingsBoard MQTT connection error', { error: err.message });
  });

  tbMqttClient.on('close', () => {
    logger.warn('ThingsBoard MQTT connection closed');
  });
}

// Forward telemetry to ThingsBoard (Gateway API)
async function forwardToThingsBoard(deviceName, telemetryData) {
  metrics.messagesReceived++;

  if (tbMqttClient && tbMqttClient.connected) {
    const payload = {
      [deviceName]: [
        {
          ts: Date.now(),
          values: telemetryData,
        },
      ],
    };

    tbMqttClient.publish('v1/gateway/telemetry', JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        metrics.forwardErrors++;
        logger.error('Failed to forward telemetry via MQTT', { deviceName, error: err.message });
      } else {
        metrics.messagesForwarded++;
      }
    });
  } else {
    // Fallback: HTTP Gateway API
    try {
      const fetch = (await import('node-fetch')).default;
      const url = `${CONFIG.tbHttpUrl}/api/v1/${CONFIG.tbGatewayToken}/telemetry`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [deviceName]: [{ ts: Date.now(), values: telemetryData }] }),
      });
      if (res.ok) {
        metrics.messagesForwarded++;
      } else {
        metrics.forwardErrors++;
      }
    } catch {
      metrics.forwardErrors++;
    }
  }
}

// Flush batched device reports to Provisioning API (Phase 6C section 6.3)
async function flushReports() {
  if (pendingReports.length === 0) return;

  const batch = pendingReports.slice(0, 100);
  pendingReports = pendingReports.slice(100);

  try {
    const fetch = (await import('node-fetch')).default;
    // Attempt internal API port 8081 first, fallback to main port 3000
    const primaryUrl = `${CONFIG.internalApiUrl}/internal/devices/seen`;
    const fallbackUrl = `${CONFIG.provisioningApiUrl}/internal/devices/seen`;

    let res;
    try {
      res = await fetch(primaryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': CONFIG.internalToken,
        },
        body: JSON.stringify({ reports: batch }),
      });
    } catch {
      res = await fetch(fallbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': CONFIG.internalToken,
        },
        body: JSON.stringify({ reports: batch }),
      });
    }

    if (res && res.ok) {
      metrics.reportsSent += batch.length;
    } else {
      metrics.reportsFailed += batch.length;
    }
  } catch (err) {
    metrics.reportsFailed += batch.length;
    logger.warn('Failed to send device seen reports', { error: err.message });
  }
}

// Flush reports every 2 seconds (Section 6.3)
setInterval(flushReports, 2000);

// Helper: parse SenML or JSON telemetry payloads
function parseTelemetry(payload) {
  try {
    const text = payload.toString();
    const parsed = JSON.parse(text);

    // SenML format: [ { bn: "dev1:", n: "temp", v: 22.5, t: 1000 } ]
    if (Array.isArray(parsed)) {
      const data = {};
      for (const rec of parsed) {
        if (rec.n && rec.v !== undefined) {
          data[rec.n] = rec.v;
        }
      }
      return data;
    }

    // Standard JSON object: { id: "dev_x", temperature: 22.5, humidity: 45 }
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

// Initialize Magistrala MQTT client
let mgClient = null;

function subscribeChannelTopic(channelId, slug) {
  if (!mgClient || !mgClient.connected) return;
  const rawTopic = `channels/${channelId}/messages/#`;
  const sharedTopic = CONFIG.useSharedSubscriptions
    ? `$share/${CONFIG.mqttShareGroup}/${rawTopic}`
    : rawTopic;

  mgClient.subscribe(sharedTopic, { qos: 1 }, (err) => {
    if (err && CONFIG.useSharedSubscriptions) {
      // Fallback to standard subscription if broker does not support $share
      mgClient.subscribe(rawTopic, { qos: 1 }, (fallbackErr) => {
        if (fallbackErr) {
          logger.error('Failed to subscribe to channel', { channelId, slug, error: fallbackErr.message });
        } else {
          logger.info('Subscribed to tenant telemetry channel (fallback)', { channelId, slug, topic: rawTopic });
        }
      });
    } else if (err) {
      logger.error('Failed to subscribe to channel', { channelId, slug, error: err.message });
    } else {
      logger.info('Subscribed to tenant telemetry channel', { channelId, slug, topic: sharedTopic });
    }
  });
}

function initMagistralaClient() {
  const replicaSuffix = process.env.HOSTNAME || process.pid;
  const clientId = `${CONFIG.magistralaObserverClientId}-${replicaSuffix}`;
  logger.info('Connecting to Magistrala MQTT broker', { url: CONFIG.magistralaMqttUrl, clientId });
  mgClient = mqtt.connect(CONFIG.magistralaMqttUrl, {
    clientId,
    username: CONFIG.magistralaObserverClientId,
    password: CONFIG.magistralaObserverSecret,
    reconnectPeriod: 5000,
  });

  mgClient.on('connect', () => {
    logger.info('Connected to Magistrala MQTT broker');
    resubscribeChannels();
  });

  mgClient.on('message', (topic, payload) => {
    const match = topic.match(/^channels\/([^/]+)\/messages(?:\/(.+))?$/);
    if (!match) return;

    const channelId = match[1];
    const subtopic = match[2];

    const channelInfo = activeChannels.get(channelId);
    const tenantSlug = channelInfo ? channelInfo.slug : 'unknown';

    const telemetry = parseTelemetry(payload);
    if (!telemetry) {
      metrics.parseErrors++;
      return;
    }

    // Device identification (Section 6.3)
    const deviceId = telemetry.id || telemetry.deviceId || telemetry.device || subtopic;
    if (!deviceId) {
      metrics.unknownDevices++;
    } else {
      // Queue report for Provisioning API (Phase 6C)
      pendingReports.push({
        tenantSlug,
        deviceId: String(deviceId),
        ts: new Date().toISOString(),
        values: telemetry,
      });
    }

    const devName = `${tenantSlug}/${deviceId || 'sensor'}`;
    forwardToThingsBoard(devName, telemetry);
  });

  mgClient.on('error', (err) => {
    logger.error('Magistrala MQTT error', { error: err.message });
  });

  mgClient.on('close', () => {
    logger.warn('Magistrala MQTT connection closed');
  });
}

function resubscribeChannels() {
  if (!mgClient || !mgClient.connected) return;

  for (const [channelId, info] of activeChannels.entries()) {
    subscribeChannelTopic(channelId, info.slug);
  }
  metrics.subscribedChannels = activeChannels.size;
}

// Poll Provisioning API for new tenant channels
async function pollProvisioningApi() {
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`${CONFIG.provisioningApiUrl}/internal/observers`);
    if (!res.ok) {
      logger.warn('Poll provisioning API returned status', { status: res.status });
      return;
    }

    const data = await res.json();
    const observers = data.observers || [];

    let newCount = 0;
    for (const obs of observers) {
      if (obs.telemetryChannelId && !activeChannels.has(obs.telemetryChannelId)) {
        activeChannels.set(obs.telemetryChannelId, {
          slug: obs.slug,
          workspaceId: obs.workspaceId,
        });
        newCount++;

        subscribeChannelTopic(obs.telemetryChannelId, obs.slug);
      }
    }

    if (newCount > 0) {
      metrics.subscribedChannels = activeChannels.size;
      logger.info(`Discovered ${newCount} new tenant telemetry channel(s). Total: ${activeChannels.size}`);
    }
  } catch (err) {
    logger.warn('Could not poll provisioning API (will retry)', { error: err.message });
  }
}

// Express server for health and metrics
const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tb-bridge',
    mgMqttConnected: !!(mgClient && mgClient.connected),
    tbMqttConnected: !!(tbMqttClient && tbMqttClient.connected),
    subscribedChannels: activeChannels.size,
  });
});

app.get('/metrics', (req, res) => {
  res.json({
    ...metrics,
    subscribedChannels: activeChannels.size,
    pendingReports: pendingReports.length,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Start services
initThingsBoardClient();
initMagistralaClient();

setInterval(pollProvisioningApi, CONFIG.pollIntervalMs);
pollProvisioningApi();

app.listen(CONFIG.port, () => {
  logger.info(`CloudNest tb-bridge listening on port ${CONFIG.port}`);
});
