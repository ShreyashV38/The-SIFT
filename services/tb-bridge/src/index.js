// ---------------------------------------------------------------------------
// CloudNest — tb-bridge (Magistrala -> ThingsBoard Telemetry Forwarder)
// ---------------------------------------------------------------------------
// FR-04: Device telemetry routes through Magistrala MQTT to HA and ThingsBoard
// FR-07: Platform administrators can view platform-wide telemetry in ThingsBoard
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
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '15000', 10),

  // Magistrala MQTT broker
  magistralaMqttUrl: process.env.MAGISTRALA_MQTT_URL || 'mqtt://magistrala-mqtt.platform.svc.cluster.local:1883',
  magistralaObserverClientId: process.env.MAGISTRALA_OBSERVER_CLIENT_ID || 'tb-bridge-observer',
  magistralaObserverSecret: process.env.MAGISTRALA_OBSERVER_SECRET || 'observer-secret',

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
  subscribedChannels: 0,
  startTime: new Date().toISOString(),
};

// Channel mapping: channelId -> { slug, workspaceId }
const activeChannels = new Map();

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

  // 1. Try ThingsBoard Gateway MQTT first
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
        logger.error('Failed to publish to ThingsBoard Gateway', { error: err.message, deviceName });
        metrics.forwardErrors++;
      } else {
        metrics.messagesForwarded++;
      }
    });
    return;
  }

  // 2. HTTP Fallback if Gateway MQTT is disconnected or not configured
  try {
    const fetch = (await import('node-fetch')).default;
    const url = `${CONFIG.tbHttpUrl}/api/v1/${CONFIG.tbGatewayToken}/telemetry`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceName,
        ...telemetryData,
      }),
    });
    if (res.ok) {
      metrics.messagesForwarded++;
    } else {
      metrics.forwardErrors++;
      logger.warn('ThingsBoard HTTP post returned non-200', { status: res.status });
    }
  } catch (err) {
    metrics.forwardErrors++;
    logger.error('Failed to forward telemetry to ThingsBoard via HTTP', { error: err.message });
  }
}

// Parse incoming payload (SenML or standard JSON)
function parseTelemetry(payloadBuffer) {
  try {
    const text = payloadBuffer.toString('utf8');
    const parsed = JSON.parse(text);

    // If SenML format: [{"n": "temperature", "v": 22.5}, ...]
    if (Array.isArray(parsed)) {
      const data = {};
      for (const item of parsed) {
        if (item.n) {
          data[item.n] = item.v !== undefined ? item.v : (item.vs || item.vb);
        }
      }
      return data;
    }

    // Standard JSON object: { temperature: 22.5, humidity: 45 }
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
function initMagistralaClient() {
  logger.info('Connecting to Magistrala MQTT broker', { url: CONFIG.magistralaMqttUrl });
  mgClient = mqtt.connect(CONFIG.magistralaMqttUrl, {
    clientId: CONFIG.magistralaObserverClientId,
    username: CONFIG.magistralaObserverClientId,
    password: CONFIG.magistralaObserverSecret,
    reconnectPeriod: 5000,
  });

  mgClient.on('connect', () => {
    logger.info('Connected to Magistrala MQTT broker');
    // Subscribe to existing channels
    resubscribeChannels();
  });

  mgClient.on('message', (topic, payload) => {
    // Topic formats in Magistrala:
    // "channels/<channelId>/messages" or "channels/<channelId>/messages/<subtopic>"
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

    // Device identification: subtopic or payload device property or default
    const devId = telemetry.device || subtopic || 'sensor';
    const deviceName = `${tenantSlug}/${devId}`;

    forwardToThingsBoard(deviceName, telemetry);
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
    const topic = `channels/${channelId}/messages/#`;
    mgClient.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        logger.error('Failed to subscribe to channel', { channelId, slug: info.slug, error: err.message });
      } else {
        logger.info('Subscribed to tenant telemetry channel', { channelId, slug: info.slug, topic });
      }
    });
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

        // Subscribe immediately if connected
        if (mgClient && mgClient.connected) {
          const topic = `channels/${obs.telemetryChannelId}/messages/#`;
          mgClient.subscribe(topic, { qos: 1 }, (err) => {
            if (!err) {
              logger.info('Subscribed to new tenant telemetry channel', {
                slug: obs.slug,
                channelId: obs.telemetryChannelId,
              });
            }
          });
        }
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
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Start services
initThingsBoardClient();
initMagistralaClient();

// Periodic polling
setInterval(pollProvisioningApi, CONFIG.pollIntervalMs);
// Initial poll immediately
pollProvisioningApi();

app.listen(CONFIG.port, () => {
  logger.info(`CloudNest tb-bridge listening on port ${CONFIG.port}`);
});
