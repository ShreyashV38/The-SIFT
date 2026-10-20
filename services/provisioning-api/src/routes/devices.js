// ---------------------------------------------------------------------------
// CloudNest — Devices Routes
// ---------------------------------------------------------------------------
// FR-05: device registration, secret rotation, revocation
// FR-12: device limits enforced per plan
// FR-14: devices belong to tenant, shared by all members
// ---------------------------------------------------------------------------

const { Router } = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const magistrala = require('../services/magistrala');
const thingsboard = require('../services/thingsboard');
const config = require('../config');
const logger = require('../logger');

const router = Router();

// GET /v1/tenants/:slug/devices
// Any member can list devices (FR-14: shared devices)
router.get('/:slug/devices', requireAuth, requireRole('member'), (req, res) => {
  const db = getDb();
  const devices = db.prepare(`
    SELECT id, name, kind, mg_client_id, status, created_at, last_seen_at
    FROM devices WHERE tenant_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(req.tenant.id);

  const tenant = db.prepare('SELECT plan FROM tenants WHERE id = ?').get(req.tenant.id);
  const planLimits = config.plans[tenant.plan];

  res.json({
    devices,
    usage: {
      count: devices.length,
      max: planLimits.devices,
    },
  });
});

// POST /v1/tenants/:slug/devices
// Register a new device. Requires admin or owner.
// Body: { name, kind? }
// FR-05: device credentials shown once
// FR-12: device limits enforced
router.post('/:slug/devices', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, kind = 'simulator' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    if (!['simulator', 'esp32', 'other'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be simulator, esp32, or other' });
    }

    const db = getDb();
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);
    const planLimits = config.plans[tenant.plan];

    // Enforce device limits (FR-12)
    const deviceCount = db.prepare(
      "SELECT COUNT(*) as count FROM devices WHERE tenant_id = ? AND status = 'active'"
    ).get(req.tenant.id).count;

    if (deviceCount >= planLimits.devices) {
      return res.status(409).json({
        error: `Device limit reached. ${tenant.plan} plan allows ${planLimits.devices} devices. Current: ${deviceCount}`,
      });
    }

    // Create device in Magistrala (FR-05)
    let mgDevice;
    try {
      mgDevice = await magistrala.createDevice(tenant.mg_workspace_id, name, {
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
      return res.status(502).json({ error: 'Failed to create device in IoT platform' });
    }

    // Create device in ThingsBoard (for monitoring, FR-07)
    let tbDevice;
    try {
      tbDevice = await thingsboard.createDevice(tenant.slug, name);
    } catch (err) {
      logger.warn('ThingsBoard device creation failed (non-critical)', { error: err.message });
    }

    // Save to local DB
    const result = db.prepare(
      'INSERT INTO devices (tenant_id, name, kind, mg_client_id) VALUES (?, ?, ?, ?)'
    ).run(req.tenant.id, name, kind, mgDevice.id);

    logger.info('Device registered', {
      slug: tenant.slug,
      deviceName: name,
      deviceId: result.lastInsertRowid,
    });

    // Publish HA MQTT Discovery payloads (auto-creates entities in Home Assistant)
    try {
      await publishHADiscovery(tenant, name, mgDevice.id);
    } catch (err) {
      logger.warn('HA MQTT Discovery publish failed (non-critical)', { error: err.message });
    }

    const secret = mgDevice.credentials?.secret || mgDevice.secret;

    // FR-05: credentials shown once
    res.status(201).json({
      device: {
        id: result.lastInsertRowid,
        name,
        kind,
        mgClientId: mgDevice.id,
      },
      device_id: mgDevice.id,
      device_secret: secret,
      credentials: {
        clientId: mgDevice.id,
        clientSecret: secret,
        secret,
        device_id: mgDevice.id,
        device_secret: secret,
        mqttHost: config.mqttPublicHost,
        mqttPort: config.mqttPublicPort,
        mqtt_host: config.mqttPublicHost,
        mqtt_port: config.mqttPublicPort,
        telemetryTopic: `channels/${tenant.mg_chan_telemetry}/messages`,
        commandTopic: `channels/${tenant.mg_chan_commands}/messages`,
        telemetry_topic: `channels/${tenant.mg_chan_telemetry}/messages`,
        command_topic: `channels/${tenant.mg_chan_commands}/messages`,
        note: 'Save these credentials — the secret will not be shown again.',
      },
    });
  } catch (err) {
    logger.error('Device registration failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Publish Home Assistant MQTT Discovery payloads for automatic entity creation
async function publishHADiscovery(tenant, deviceName, deviceId) {
  const mqtt = require('mqtt');
  const mqttUrl = config.mqttUrl;
  const slug = tenant.slug;
  const uniqueId = deviceId; // matches DEVICE_CLIENT_ID
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
      return res.status(404).json({ error: 'Device not found' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);

    // Rotate in Magistrala
    const result = await magistrala.rotateDeviceSecret(tenant.mg_workspace_id, device.mg_client_id);

    const newSecret = result.credentials?.secret || result.secret;

    logger.info('Device secret rotated', { slug: tenant.slug, deviceId });

    res.json({
      message: 'Secret rotated. Save the new credentials.',
      secret: newSecret,
      credentials: {
        clientId: device.mg_client_id,
        secret: newSecret,
        clientSecret: newSecret,
      },
    });
  } catch (err) {
    logger.error('Secret rotation failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
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
      return res.status(404).json({ error: 'Device not found' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);

    // Disable in Magistrala
    try {
      await magistrala.disableDevice(tenant.mg_workspace_id, device.mg_client_id);
    } catch (err) {
      logger.warn('Magistrala device disable failed', { error: err.message });
    }

    // Soft-delete locally
    db.prepare("UPDATE devices SET status = 'revoked' WHERE id = ?").run(deviceId);

    logger.info('Device revoked', { slug: tenant.slug, deviceId });

    res.json({ message: 'Device revoked' });
  } catch (err) {
    logger.error('Device revocation failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
