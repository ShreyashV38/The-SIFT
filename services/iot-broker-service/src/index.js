// ---------------------------------------------------------------------------
// The-SIFT — IoT Broker Microservice Entrypoint (services/iot-broker-service)
// ---------------------------------------------------------------------------
// Handles Magistrala thing/channel provisioning, ThingsBoard synchronization,
// and device lifecycle management (/v1/tenants/:slug/devices & /api/v1/devices).
// ---------------------------------------------------------------------------

const express = require('express');
const { createServiceLogger, createAuth } = require('@sift/common');
const config = require('./config');
const { initDb, getDb } = require('./db');
const devicesRouter = require('./routes/devices');
const { handleInternalDevicesSeen, handleInternalObservers, publishHADiscovery, unpublishHADiscovery } = require('./routes/devices');
const magistrala = require('./services/magistrala');
const thingsboard = require('./services/thingsboard');

const logger = createServiceLogger(config.serviceName);
const auth = createAuth(config);
const app = express();

app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    integration: magistrala.getIntegrationStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (req, res) => {
  try {
    getDb().prepare('SELECT 1').get();
    res.json({ status: 'ready', service: config.serviceName });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

// Mount device routes under /v1/tenants and /api/v1/tenants and /api/devices
app.use('/v1/tenants', devicesRouter);
app.use('/api/v1/tenants', devicesRouter);
app.use('/api/v1/devices', devicesRouter);
app.use('/api/devices', devicesRouter);

// Internal routes for tenant workspace provisioning and telemetry reporting
app.post('/internal/devices/seen', auth.requireInternalToken, handleInternalDevicesSeen);
app.get('/internal/observers', handleInternalObservers);

app.post('/internal/workspaces', auth.requireInternalToken, async (req, res) => {
  try {
    const { slug, displayName } = req.body || {};
    if (!slug || !displayName) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'slug and displayName are required' } });
    }
    const workspace = await magistrala.createWorkspace(slug, displayName);
    const channels = await magistrala.createTenantChannels(workspace.id, slug);
    res.status(201).json({
      workspaceId: workspace.id,
      telemetryChannelId: channels.telemetry.id,
      commandChannelId: channels.commands.id,
      mode: channels.mode || workspace.mode,
    });
  } catch (err) {
    logger.error('Internal workspace creation failed', { error: err.message });
    res.status(502).json({ error: { code: 'PROVISIONING_FAILED', message: err.message } });
  }
});

app.delete('/internal/workspaces/:workspaceId', auth.requireInternalToken, async (req, res) => {
  try {
    await magistrala.deleteWorkspace(req.params.workspaceId);
    res.json({ status: 'deleted' });
  } catch (err) {
    logger.warn('Internal workspace deletion failed', { error: err.message });
    res.status(502).json({ error: { code: 'IOT_ERROR', message: err.message } });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Not found: ${req.method} ${req.originalUrl}` } });
});

async function main() {
  await initDb();
  app.listen(config.port, () => {
    logger.info(`${config.serviceName} listening`, { port: config.port });
  });
}

if (require.main === module && process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    logger.error('Failed to start iot-broker-service', { error: err.message });
    process.exit(1);
  });
}

module.exports = {
  app,
  devicesRouter,
  magistrala,
  thingsboard,
  handleInternalDevicesSeen,
  handleInternalObservers,
  publishHADiscovery,
  unpublishHADiscovery,
};
