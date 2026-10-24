// ---------------------------------------------------------------------------
// CloudNest — Devices Routes (Phase 6C Updated)
// ---------------------------------------------------------------------------
// FR-05: device registration, secret rotation, revocation
// FR-12: device limits enforced per plan
// FR-14: devices belong to tenant, shared by all members
// Phase 6C: status computation (pending/online/offline/revoked),
//           GET /devices/:id/status, POST /devices/:id/test-command,
//           credentials format matching Phase 6C contract
// ---------------------------------------------------------------------------

const { Router } = require('express');
const mqtt = require('mqtt');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const magistrala = require('../services/magistrala');
const thingsboard = require('../services/thingsboard');
const config = require('../config');
const logger = require('../logger');

const router = Router();

// Helper: compute device status at read time (never stored)
// Section 5.3: 'revoked' if revoked; else 'pending' if firstConnectedAt is null;
// else 'online' if now minus lastSeenAt is at most offlineAfterSeconds; else 'offline'
function computeDeviceStatus(device, offlineAfterSeconds = config.offlineAfterSeconds) {
  if (device.status === 'revoked') {
    return 'revoked';
  }
  if (!device.first_connected_at) {
    return 'pending';
  }
  if (device.last_seen_at) {
    const lastSeenMs = Date.parse(device.last_seen_at);
    if (!isNaN(lastSeenMs)) {
      const diffSec = (Date.now() - lastSeenMs) / 1000;
      if (diffSec <= offlineAfterSeconds) {
        return 'online';
      }
      return 'offline';
    }
  }
  return 'pending';
}

// Helper: parse last value json safely
function parseLastValue(lastValueJson) {
  if (!lastValueJson) return null;
  try {
    return JSON.parse(lastValueJson);
  } catch {
    return { raw: lastValueJson };
  }
}

// Helper: format device for client response (never returns secret)
function formatDevice(device) {
  return {
    id: device.id,
    name: device.name,
    kind: device.kind || 'sensor',
    mgClientId: device.mg_client_id,
    status: computeDeviceStatus(device),
    firstConnectedAt: device.first_connected_at || null,
    lastSeenAt: device.last_seen_at || null,
    lastValue: parseLastValue(device.last_value_json),
    createdAt: device.created_at,
  };
}

// GET /v1/tenants/:slug/devices
// Any member can list devices (FR-14: shared devices)
router.get('/:slug/devices', requireAuth, requireRole('member'), (req, res) => {
  const db = getDb();
  const rawDevices = db.prepare(`
    SELECT id, name, kind, mg_client_id, status, created_at, first_connected_at, last_seen_at, last_value_json
    FROM devices WHERE tenant_id = ? AND status != 'deleted'
    ORDER BY created_at DESC
  `).all(req.tenant.id);

  const devices = rawDevices.map(formatDevice);

  const tenant = db.prepare('SELECT plan FROM tenants WHERE id = ?').get(req.tenant.id);
  const planLimits = config.plans[tenant.plan] || { devices: 10 };

  const activeCount = devices.filter(d => d.status !== 'revoked').length;

  res.json({
    devices,
    usage: {
      count: activeCount,
      max: planLimits.devices,
    },
  });
});

// GET /v1/tenants/:slug/devices/:id/status
// Phase 6C: Polling endpoint for live connection status in add-device wizard
router.get('/:slug/devices/:id/status', requireAuth, requireRole('member'), (req, res) => {
  const deviceId = parseInt(req.params.id, 10);
  const db = getDb();

  const device = db.prepare(`
    SELECT id, name, kind, mg_client_id, status, created_at, first_connected_at, last_seen_at, last_value_json
    FROM devices WHERE id = ? AND tenant_id = ?
  `).get(deviceId, req.tenant.id);

  if (!device) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Device not found' },
    });
  }

  res.json({
    device: formatDevice(device),
  });
});

// POST /v1/tenants/:slug/devices
// Register a new device. Requires admin or owner.
// Body: { name, kind? }  (kind: 'sensor' | 'switch' | 'simulator' | 'esp32')
router.post('/:slug/devices', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, kind = 'sensor' } = req.body || {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Device name is required (1-40 characters)' },
      });
    }

    const cleanName = name.trim();
    if (cleanName.length < 1 || cleanName.length > 40) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Device name must be 1 to 40 characters' },
      });
    }

    const validKinds = ['sensor', 'switch', 'simulator', 'esp32', 'other'];
    if (!validKinds.includes(kind)) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: `Invalid kind. Must be one of: ${validKinds.join(', ')}` },
      });
    }

    const db = getDb();
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);
    const planLimits = config.plans[tenant.plan] || { devices: 10 };

    // Enforce device limits (FR-12)
    const deviceCount = db.prepare(
      "SELECT COUNT(*) as count FROM devices WHERE tenant_id = ? AND status = 'active'"
    ).get(req.tenant.id).count;

    if (deviceCount >= planLimits.devices) {
      return res.status(409).json({
        error: {
          code: 'PLAN_LIMIT',
          message: `Device limit reached. ${tenant.plan} plan allows ${planLimits.devices} devices. Current: ${deviceCount}`,
          details: { currentDevices: deviceCount, maxDevices: planLimits.devices },
        },
      });
    }

    // Create device in Magistrala (FR-05)
    let mgDevice;
    try {
      mgDevice = await magistrala.createDevice(tenant.mg_workspace_id, cleanName, {
        tenant: tenant.slug,
        kind,
      });

      // Connect to telemetry channel (publish)
      await magistrala.connectDeviceToChannel(
        tenant.mg_workspace_id, mgDevice.id, tenant.mg_chan_telemetry
      );

      // Connect to command channel (subscribe)
      await magistrala.connectDeviceToChannel(
        tenant.mg_workspace_id, mgDevice.id, tenant.mg_chan_commands
      );
    } catch (err) {
      logger.error('Magistrala device creation failed', { error: err.message });
      return res.status(502).json({
        error: { code: 'IOT_ERROR', message: 'Failed to create device in IoT platform' },
      });
    }

    // Create device in ThingsBoard (for monitoring, FR-07)
    try {
      await thingsboard.createDevice(tenant.slug, cleanName);
    } catch (err) {
      logger.warn('ThingsBoard device creation failed (non-critical)', { error: err.message });
    }

    // Save to local DB
    const result = db.prepare(
      'INSERT INTO devices (tenant_id, name, kind, mg_client_id) VALUES (?, ?, ?, ?)'
    ).run(req.tenant.id, cleanName, kind, mgDevice.id);

    const newDeviceId = result.lastInsertRowid;

    logger.info('Device registered', {
      slug: tenant.slug,
      deviceName: cleanName,
      deviceId: newDeviceId,
    });

    // Publish HA MQTT Discovery payloads
    try {
      await publishHADiscovery(tenant, cleanName, mgDevice.id);
    } catch (err) {
      logger.warn('HA MQTT Discovery publish failed (non-critical)', { error: err.message });
    }

    const secret = mgDevice.credentials?.secret || mgDevice.secret;
    const telemetryTopic = `channels/${tenant.mg_chan_telemetry}/messages`;
    const commandTopic = `channels/${tenant.mg_chan_commands}/messages`;

    // Credentials shown once (P4 / Section 5.2)
    res.setHeader('Cache-Control', 'no-store');

    res.status(201).json({
      device: {
        id: newDeviceId,
        name: cleanName,
        kind,
        status: 'pending',
      },
      device_id: mgDevice.id,
      device_secret: secret,
      credentials: {
        mqttHost: config.mqttPublicHost,
        mqttPort: config.mqttPublicPort,
        tls: false,
        clientId: mgDevice.id,
        username: mgDevice.id,
        password: secret,
        secret,
        clientSecret: secret,
        device_id: mgDevice.id,
        device_secret: secret,
        mqtt_host: config.mqttPublicHost,
        mqtt_port: config.mqttPublicPort,
        telemetryTopic,
        commandTopic,
        telemetry_topic: telemetryTopic,
        command_topic: commandTopic,
        note: 'Save these credentials now — the secret is never shown again.',
      },
      shownOnce: true,
    });
  } catch (err) {
    logger.error('Device registration failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// Publish Home Assistant MQTT Discovery payloads for automatic entity creation
async function publishHADiscovery(tenant, deviceName, deviceId) {
  const mqttUrl = config.mqttUrl;
  const uniqueId = deviceId;
  const telemetryTopic = `channels/${tenant.mg_chan_telemetry}/messages`;
  const commandTopic = `channels/${tenant.mg_chan_commands}/messages`;

  const client = mqtt.connect(mqttUrl, {
    clientId: `discovery-${Date.now()}`,
    connectTimeout: 5000,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error('MQTT discovery publish timeout'));
    }, 10000);

    client.on('connect', () => {
      const discoveryPayloads = [
        {
          topic: `homeassistant/sensor/${uniqueId}_temp/config`,
          payload: {
            name: `${deviceName} Temperature`,
            unique_id: `${uniqueId}_temp`,
            state_topic: telemetryTopic,
            value_template: '{{ value_json.temperature }}',
            unit_of_measurement: '°C',
            device_class: 'temperature',
            device: {
              identifiers: [uniqueId],
              name: deviceName,
              manufacturer: 'CloudNest',
              model: 'ESP32 IoT Sensor',
            },
          },
        },
        {
          topic: `homeassistant/sensor/${uniqueId}_humidity/config`,
          payload: {
            name: `${deviceName} Humidity`,
            unique_id: `${uniqueId}_humidity`,
            state_topic: telemetryTopic,
            value_template: '{{ value_json.humidity }}',
            unit_of_measurement: '%',
            device_class: 'humidity',
            device: {
              identifiers: [uniqueId],
              name: deviceName,
              manufacturer: 'CloudNest',
              model: 'ESP32 IoT Sensor',
            },
          },
        },
        {
          topic: `homeassistant/switch/${uniqueId}_switch/config`,
          payload: {
            name: `${deviceName} Switch`,
            unique_id: `${uniqueId}_switch`,
            state_topic: telemetryTopic,
            command_topic: commandTopic,
            value_template: '{{ value_json.state }}',
            payload_on: 'ON',
            payload_off: 'OFF',
            state_on: 'ON',
            state_off: 'OFF',
            device: {
              identifiers: [uniqueId],
              name: deviceName,
              manufacturer: 'CloudNest',
              model: 'ESP32 IoT Sensor',
            },
          },
        },
      ];

      let published = 0;
      for (const { topic, payload } of discoveryPayloads) {
        client.publish(topic, JSON.stringify(payload), { retain: true, qos: 1 }, (err) => {
          if (err) logger.warn('Discovery publish error', { topic, error: err.message });
          published++;
          if (published === discoveryPayloads.length) {
            clearTimeout(timeout);
            client.end();
            resolve();
          }
        });
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      client.end(true);
      reject(err);
    });
  });
}

// POST /v1/tenants/:slug/devices/:deviceId/rotate-secret
// Rotate device credentials. Requires admin or owner. (FR-05)
router.post('/:slug/devices/:deviceId/rotate-secret', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId, 10);
    const db = getDb();

    const device = db.prepare(
      "SELECT * FROM devices WHERE id = ? AND tenant_id = ? AND status = 'active'"
    ).get(deviceId, req.tenant.id);

    if (!device) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Device not found' },
      });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);

    // Rotate in Magistrala
    const result = await magistrala.rotateDeviceSecret(tenant.mg_workspace_id, device.mg_client_id);
    const newSecret = result.credentials?.secret || result.secret;

    logger.info('Device secret rotated', { slug: tenant.slug, deviceId });

    res.setHeader('Cache-Control', 'no-store');

    res.json({
      message: 'Secret rotated. Save the new credentials now.',
      secret: newSecret,
      credentials: {
        mqttHost: config.mqttPublicHost,
        mqttPort: config.mqttPublicPort,
        tls: false,
        clientId: device.mg_client_id,
        username: device.mg_client_id,
        password: newSecret,
        secret: newSecret,
        clientSecret: newSecret,
      },
      shownOnce: true,
    });
  } catch (err) {
    logger.error('Secret rotation failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// DELETE /v1/tenants/:slug/devices/:deviceId
// Revoke a device. Requires admin or owner. (FR-05)
router.delete('/:slug/devices/:deviceId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId, 10);
    const db = getDb();

    const device = db.prepare(
      "SELECT * FROM devices WHERE id = ? AND tenant_id = ? AND status = 'active'"
    ).get(deviceId, req.tenant.id);

    if (!device) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Device not found' },
      });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);

    // Disable in Magistrala
    try {
      await magistrala.disableDevice(tenant.mg_workspace_id, device.mg_client_id);
    } catch (err) {
      logger.warn('Magistrala device disable failed', { error: err.message });
    }

    // Soft-delete locally (mark status as revoked)
    db.prepare("UPDATE devices SET status = 'revoked' WHERE id = ?").run(deviceId);

    logger.info('Device revoked', { slug: tenant.slug, deviceId });

    res.json({ message: 'Device revoked' });
  } catch (err) {
    logger.error('Device revocation failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// POST /v1/tenants/:slug/devices/:deviceId/test-command (SHOULD S1)
// Sends a test command ("ON" or "OFF") to a switch device via MQTT
router.post('/:slug/devices/:deviceId/test-command', requireAuth, requireRole('member'), async (req, res) => {
  try {
    const deviceId = parseInt(req.params.deviceId, 10);
    const { state } = req.body || {};

    if (!['ON', 'OFF'].includes(state)) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Command state must be "ON" or "OFF"' },
      });
    }

    const db = getDb();
    const device = db.prepare(
      "SELECT * FROM devices WHERE id = ? AND tenant_id = ? AND status = 'active'"
    ).get(deviceId, req.tenant.id);

    if (!device) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Device not found' },
      });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);
    const commandTopic = `channels/${tenant.mg_chan_commands}/messages`;

    // Publish command
    const client = mqtt.connect(config.mqttUrl, {
      clientId: `cmd-${Date.now()}`,
      connectTimeout: 4000,
    });

    client.on('connect', () => {
      client.publish(commandTopic, state, { qos: 1 }, (err) => {
        client.end();
        if (err) {
          logger.error('Failed to publish test command', { error: err.message });
          return res.status(502).json({
            error: { code: 'MQTT_ERROR', message: 'Failed to deliver command to device' },
          });
        }
        res.json({ message: `Command ${state} sent successfully to ${device.name}` });
      });
    });

    client.on('error', (err) => {
      client.end(true);
      logger.error('MQTT error while sending test command', { error: err.message });
      res.status(502).json({
        error: { code: 'MQTT_ERROR', message: 'Failed to connect to MQTT broker' },
      });
    });
  } catch (err) {
    logger.error('Test command failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

module.exports = router;
