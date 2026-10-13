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

    // FR-05: credentials shown once
    res.status(201).json({
      device: {
        id: result.lastInsertRowid,
        name,
        kind,
        mgClientId: mgDevice.id,
      },
      credentials: {
        clientId: mgDevice.id,
        clientSecret: mgDevice.credentials?.secret || mgDevice.secret,
        mqttHost: config.mqttUrl.replace('mqtt://', ''),
        telemetryTopic: `channels/${tenant.mg_chan_telemetry}/messages`,
        commandTopic: `channels/${tenant.mg_chan_commands}/messages`,
        note: 'Save these credentials — the secret will not be shown again.',
      },
    });
  } catch (err) {
    logger.error('Device registration failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    logger.info('Device secret rotated', { slug: tenant.slug, deviceId });

    res.json({
      message: 'Secret rotated. Save the new credentials.',
      credentials: {
        clientId: device.mg_client_id,
        clientSecret: result.credentials?.secret || result.secret,
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
