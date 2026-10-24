const express = require('express');
const rateLimit = require('express-rate-limit');
const { createServiceLogger, createEventBus } = require('@sift/common');
const { initDb, getPool } = require('./db');
const config = require('./config');
const { router: accountsRouter, auth } = require('./routes/accounts');

const logger = createServiceLogger(config.serviceName);
const app = express();

app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production' &&
    (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'),
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts.' } },
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: config.serviceName, timestamp: new Date().toISOString() });
});
app.get('/ready', async (req, res) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ready', service: config.serviceName });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

app.use('/v1/auth/login', authLimiter);
app.use('/v1/accounts/login', authLimiter);
app.use('/v1/auth', accountsRouter);
app.use('/v1/accounts', accountsRouter);
app.get('/v1/me', (req, res, next) => {
  req.url = '/me';
  accountsRouter(req, res, next);
});
app.post('/v1/auth/verify-otp', (req, res, next) => {
  req.url = '/verify-otp';
  accountsRouter(req, res, next);
});
app.post('/v1/auth/resend-otp', (req, res, next) => {
  req.url = '/resend-otp';
  accountsRouter(req, res, next);
});

// Internal routes mounted on same router paths under /internal via accounts router
app.use(accountsRouter);

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Not found: ${req.method} ${req.originalUrl}` } });
});

async function main() {
  await initDb();
  const pool = getPool();
  // Ensure gen_random_uuid available
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  const events = createEventBus({
    redisUrl: config.redisUrl,
    serviceName: config.serviceName,
    logger,
    pool,
  });
  await events.connect();
  events.startPublisher();

  app.listen(config.port, () => {
    logger.info(`${config.serviceName} listening`, { port: config.port, skipOtp: config.skipOtp });
  });
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    logger.error('Failed to start', { error: err.message });
    process.exit(1);
  });
}

module.exports = { app };
