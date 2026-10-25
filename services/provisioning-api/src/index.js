// ---------------------------------------------------------------------------
// The-SIFT — Tenant Provisioning Service & API Gateway (services/provisioning-api)
// ---------------------------------------------------------------------------
// Core K8s Tenant Provisioning Service (/v1/tenants) + API Gateway routing
// to identity-service (/v1/auth, /v1/accounts, /v1/tenants/:slug/members)
// and iot-broker-service (/v1/tenants/:slug/devices, /internal/devices/seen).
// ---------------------------------------------------------------------------

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { getDb } = require('./db');
const { safeCompare } = require('./middleware/auth');

const tenantsRouter = require('./routes/tenants');
const { accountsRouter, membersRouter } = require('sift-identity-service');
const { devicesRouter, handleInternalDevicesSeen, handleInternalObservers } = require('sift-iot-broker-service');

const app = express();

// Security headers (Phase 6C section 6.1)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const globalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const isLoopback = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1' || req.hostname === 'localhost';
    if (process.env.NODE_ENV !== 'production' && isLoopback) {
      return true;
    }
    return (
      req.path.startsWith('/js/') ||
      req.path.endsWith('.css') ||
      req.path.endsWith('.js') ||
      req.path.endsWith('.jpg') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.ico') ||
      req.path === '/' ||
      req.path === '/health' ||
      req.path === '/ready'
    );
  },
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.loginRateLimitMaxRequests || 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV !== 'production' && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
  },
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please wait 1 minute before trying again.' } },
});

app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    });
  });
  next();
});

// Serve static web portal at GET / (Task 7: /tools is no longer publicly hosted)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Health & readiness probes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cloudnest-provisioning-api',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (req, res) => {
  try {
    getDb().prepare('SELECT 1').get();
    res.json({ status: 'ready', service: 'cloudnest-provisioning-api' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

app.get('/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cloudnest-provisioning-api',
    timestamp: new Date().toISOString(),
  });
});

// GET /v1/config (public)
app.get('/v1/config', (req, res) => {
  const warnings = [];
  const host = config.mqttPublicHost || '';

  if (['localhost', '127.0.0.1', 'host.docker.internal', ''].includes(host.toLowerCase())) {
    warnings.push(
      `MQTT host is set to "${host || 'empty'}" — an ESP32 cannot reach this address over WiFi. For physical hardware, set PUBLIC_MQTT_HOST in .env to your computer's LAN IP (e.g. 192.168.1.x).`
    );
  }

  res.json({
    mqtt: {
      host: config.mqttPublicHost,
      port: config.mqttPublicPort,
      tls: false,
    },
    tenantDomain: config.domain,
    offlineAfterSeconds: config.offlineAfterSeconds,
    plans: config.plans,
    warnings,
  });
});

// Plans info endpoint (public)
app.get('/v1/plans', (req, res) => {
  res.json({ plans: config.plans });
});

// Identity Service routes (mounted via API gateway)
app.use('/v1/auth/login', authLimiter);
app.use('/v1/auth', accountsRouter);
app.use('/v1/accounts/login', authLimiter);
app.use('/v1/accounts', accountsRouter);
app.use('/api/v1/auth', accountsRouter);
app.use('/api/v1/accounts', accountsRouter);
app.use('/api/accounts', accountsRouter);

app.post('/v1/auth/verify-otp', (req, res, next) => { req.url = '/verify-otp'; accountsRouter(req, res, next); });
app.post('/v1/auth/resend-otp', (req, res, next) => { req.url = '/resend-otp'; accountsRouter(req, res, next); });

app.get('/v1/me', (req, res, next) => {
  req.url = '/me';
  accountsRouter(req, res, next);
});

// Tenant Provisioning routes (owned by this service) + Gateway routes to Members & Devices
app.use('/v1/tenants', tenantsRouter);
app.use('/v1/tenants', membersRouter);
app.use('/v1/tenants', devicesRouter);

app.use('/api/v1/tenants', tenantsRouter);
app.use('/api/v1/tenants', membersRouter);
app.use('/api/v1/tenants', devicesRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/members', membersRouter);
app.use('/api/devices', devicesRouter);

function requireInternalToken(req, res, next) {
  const token = req.headers['x-internal-token'];
  if (!token || !safeCompare(token, config.internalToken)) {
    logger.warn('Internal authentication failed', { ip: req.ip });
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Invalid or missing X-Internal-Token' },
    });
  }
  next();
}

app.post('/internal/devices/seen', requireInternalToken, handleInternalDevicesSeen);
app.get('/internal/observers', handleInternalObservers);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Not found: ${req.method} ${req.originalUrl}` },
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  });
});

// Internal API Server — Port 8081
const internalApp = express();
internalApp.use(express.json({ limit: '256kb' }));

internalApp.get('/internal/health', (req, res) => {
  res.json({ status: 'ok', service: 'cloudnest-internal-api', port: config.internalPort });
});

internalApp.get('/internal/observers', requireInternalToken, handleInternalObservers);
internalApp.post('/internal/devices/seen', requireInternalToken, handleInternalDevicesSeen);

try {
  getDb();
  logger.info('Database initialized successfully');
} catch (err) {
  logger.error('Failed to initialize database', { error: err.message });
  process.exit(1);
}

if (require.main === module && process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    logger.info(`CloudNest Provisioning API listening on port ${config.port}`);
  });

  internalApp.listen(config.internalPort, () => {
    logger.info(`CloudNest Internal API listening on port ${config.internalPort}`);
  });

  if (config.mqttUrl) {
    try {
      const mqtt = require('mqtt');
      const localMqtt = mqtt.connect(config.mqttUrl, {
        clientId: `provisioning-api-telemetry-observer-${process.pid}`,
        reconnectPeriod: 3000,
      });

      localMqtt.on('connect', () => {
        logger.info('Live MQTT telemetry observer connected', { url: config.mqttUrl });
        localMqtt.subscribe('channels/+/messages', (err) => {
          if (err) logger.warn('Failed to subscribe to MQTT telemetry channels', { error: err.message });
        });
      });

      localMqtt.on('message', (topic, payload) => {
        try {
          const body = JSON.parse(payload.toString());
          const devId = body.id || body.deviceId;
          if (!devId) return;

          const db = getDb();
          const found = db.prepare(
            "SELECT id FROM devices WHERE (id = ? OR mg_client_id = ?) AND status = 'active'"
          ).get(devId, devId);

          if (found) {
            const now = new Date().toISOString();
            db.prepare(`
              UPDATE devices
              SET first_connected_at = COALESCE(first_connected_at, ?),
                  last_seen_at = ?,
                  last_value_json = ?
              WHERE id = ?
            `).run(now, now, payload.toString().slice(0, 2048), found.id);
            logger.info('Device telemetry recorded via MQTT observer', { deviceId: found.id, mgClientId: devId });
          }
        } catch {
          // ignore non-json
        }
      });

      localMqtt.on('error', (err) => {
        logger.debug('Local MQTT observer error (non-fatal)', { error: err.message });
      });
    } catch (err) {
      logger.warn('Failed to initialize local MQTT observer', { error: err.message });
    }
  }
}

module.exports = { app, internalApp };
