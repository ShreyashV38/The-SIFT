// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Main Application Entrypoint
// ---------------------------------------------------------------------------
// FR-01: Tenant provisioning API
// FR-11: User accounts & login
// FR-12: Plans & limits
// FR-13: Member roles & access control
// FR-05: Device management
// ---------------------------------------------------------------------------

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./logger');
const { getDb } = require('./db');

const accountsRouter = require('./routes/accounts');
const tenantsRouter = require('./routes/tenants');
const membersRouter = require('./routes/members');
const devicesRouter = require('./routes/devices');

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Global rate limiting (defense against brute-force / DoS)
const globalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// Specific stricter rate limiter for auth endpoints (FR-11, NFR rate-limiting)
const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.loginRateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

// JSON body parser with size limit
app.use(express.json({ limit: '1mb' }));

// Serve static web dashboard at GET /
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging middleware
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

// Health check endpoint
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

// Plans info endpoint (public)
app.get('/v1/plans', (req, res) => {
  res.json({ plans: config.plans });
});

// Internal observers endpoint for tb-bridge
app.get('/internal/observers', (req, res) => {
  const db = getDb();
  const observers = db.prepare(`
    SELECT slug, mg_workspace_id as workspaceId, mg_chan_telemetry as telemetryChannelId, mg_chan_commands as commandChannelId
    FROM tenants
    WHERE status = 'active' AND mg_chan_telemetry IS NOT NULL
  `).all();
  res.json({ observers });
});

// Mount route modules
app.use('/v1/accounts/login', authLimiter);
app.use('/v1/accounts', accountsRouter);
app.use('/v1/tenants', tenantsRouter);
app.use('/v1/tenants', membersRouter);
app.use('/v1/tenants', devicesRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// Initialize DB schema on start
try {
  getDb();
  logger.info('Database initialized successfully');
} catch (err) {
  logger.error('Failed to initialize database', { error: err.message });
  process.exit(1);
}

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    logger.info(`CloudNest Provisioning API listening on port ${config.port}`);
  });
}

module.exports = app;
