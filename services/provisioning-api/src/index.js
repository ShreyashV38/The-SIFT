// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Main Application Entrypoint (Phase 6C Updated)
// ---------------------------------------------------------------------------
// FR-01: Tenant provisioning API
// FR-11: User accounts & login
// FR-12: Plans & limits
// FR-13: Member roles & access control
// FR-05: Device management
// Phase 6C: Tenant Portal static hosting, GET /v1/config,
//           port 8081 internal telemetry reporting (/internal/devices/seen)
// ---------------------------------------------------------------------------

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');
const { getDb } = require('./db');
const { safeCompare } = require('./middleware/auth');

const accountsRouter = require('./routes/accounts');
const tenantsRouter = require('./routes/tenants');
const membersRouter = require('./routes/members');
const devicesRouter = require('./routes/devices');

const app = express();

// Security headers (Phase 6C section 6.1)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Global rate limiting (defense against brute-force / DoS)
const globalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});
app.use(globalLimiter);

// Specific stricter rate limiter for auth endpoints (5 attempts per min, section 6.2)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please wait 1 minute before trying again.' } },
});

// JSON body parser with size limit
app.use(express.json({ limit: '256kb' }));

// Request logging middleware with secret redaction (P4 / Section 11)
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

// Serve static web portal at GET /
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Also serve tools directory statically at /tools
const toolsDir = path.join(__dirname, '..', '..', '..', 'tools', 'simulator');
app.use('/tools', express.static(toolsDir));

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cloudnest-provisioning-api',
    timestamp: new Date().toISOString(),
  });
});

app.get('/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cloudnest-provisioning-api',
    timestamp: new Date().toISOString(),
  });
});

// GET /v1/config (NEW in Phase 6C, public, no auth)
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

// Top-level aliases for Phase 6C auth and user
app.use('/v1/auth/login', authLimiter);
app.use('/v1/auth', accountsRouter);
app.use('/v1/accounts/login', authLimiter);
app.use('/v1/accounts', accountsRouter);

// GET /v1/me alias pointing to accountsRouter /me
app.get('/v1/me', (req, res, next) => {
  req.url = '/me';
  accountsRouter(req, res, next);
});

// Tenant routes
app.use('/v1/tenants', tenantsRouter);
app.use('/v1/tenants', membersRouter);
app.use('/v1/tenants', devicesRouter);

// Auth middleware for internal endpoints
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

// Handler for /internal/devices/seen (Phase 6C section 6.3)
function handleInternalDevicesSeen(req, res) {
  const { reports } = req.body || {};
  if (!Array.isArray(reports)) {
    return res.status(400).json({
      error: { code: 'VALIDATION', message: 'reports must be an array' },
    });
  }

  const db = getDb();
  let accepted = 0;
  let rejected = 0;

  const updateStmt = db.prepare(`
    UPDATE devices
    SET first_connected_at = COALESCE(first_connected_at, ?),
        last_seen_at = ?,
        last_value_json = ?
    WHERE id = ?
  `);

  const lookupStmt = db.prepare(`
    SELECT d.id
    FROM devices d
    JOIN tenants t ON d.tenant_id = t.id
    WHERE t.slug = ? AND (d.id = ? OR d.mg_client_id = ?) AND d.status = 'active'
  `);

  const runBatch = db.transaction((items) => {
    for (const report of items) {
      const { tenantSlug, deviceId, ts, values } = report || {};
      if (!tenantSlug || !deviceId) {
        rejected++;
        continue;
      }

      const found = lookupStmt.get(tenantSlug, deviceId, deviceId);
      if (!found) {
        rejected++;
        continue;
      }

      const reportTime = ts || new Date().toISOString();
      let valueJson = null;
      if (values) {
        try {
          valueJson = JSON.stringify(values).slice(0, 2048);
        } catch {
          valueJson = null;
        }
      }

      updateStmt.run(reportTime, reportTime, valueJson, found.id);
      accepted++;
    }
  });

  try {
    runBatch(reports);
    res.json({ accepted, rejected });
  } catch (err) {
    logger.error('Failed to process device seen reports', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Database batch update failed' } });
  }
}

// Mount internal endpoints on main app (for local testing convenience)
app.post('/internal/devices/seen', requireInternalToken, handleInternalDevicesSeen);

// Fallback for internal observers endpoint (for tb-bridge convenience)
app.get('/internal/observers', (req, res) => {
  const db = getDb();
  const observers = db.prepare(`
    SELECT slug, mg_workspace_id as workspaceId, mg_chan_telemetry as telemetryChannelId, mg_chan_commands as commandChannelId
    FROM tenants
    WHERE status = 'active' AND mg_chan_telemetry IS NOT NULL
  `).all();
  res.json({ observers });
});

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

// ---------------------------------------------------------------------------
// Internal API Server — Port 8081 (Phase 6C section 4.4 & 6.3)
// ---------------------------------------------------------------------------
// Listens on a dedicated internal port for cluster-internal communication
// (tb-bridge device seen reports). Requires X-Internal-Token header.
// ---------------------------------------------------------------------------
const internalApp = express();
internalApp.use(express.json({ limit: '256kb' }));

// Internal health check
internalApp.get('/internal/health', (req, res) => {
  res.json({ status: 'ok', service: 'cloudnest-internal-api', port: config.internalPort });
});

// Internal observers endpoint
internalApp.get('/internal/observers', requireInternalToken, (req, res) => {
  const db = getDb();
  const observers = db.prepare(`
    SELECT slug, mg_workspace_id as workspaceId, mg_chan_telemetry as telemetryChannelId, mg_chan_commands as commandChannelId
    FROM tenants
    WHERE status = 'active' AND mg_chan_telemetry IS NOT NULL
  `).all();
  res.json({ observers });
});

// POST /internal/devices/seen (Phase 6C section 6.3)
internalApp.post('/internal/devices/seen', requireInternalToken, handleInternalDevicesSeen);

// Initialize DB schema on start
try {
  getDb();
  logger.info('Database initialized successfully');
} catch (err) {
  logger.error('Failed to initialize database', { error: err.message });
  process.exit(1);
}

// Start main and internal servers
if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    logger.info(`CloudNest Provisioning API listening on port ${config.port}`);
  });

  internalApp.listen(config.internalPort, () => {
    logger.info(`CloudNest Internal API listening on port ${config.internalPort}`);
  });
}

module.exports = { app, internalApp };
