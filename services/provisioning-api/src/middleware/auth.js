// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Authentication Middleware
// ---------------------------------------------------------------------------
// Two auth mechanisms:
//   1. X-API-Key header: for admin/platform operations (tenant creation)
//   2. Bearer JWT:       for authenticated user operations
// FR-11: password-based login returning JWT
// ---------------------------------------------------------------------------

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

// Constant-time comparison to prevent timing attacks (security model T-API-1)
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Middleware: require valid X-API-Key header
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || !safeCompare(key, config.apiKey)) {
    logger.warn('API key authentication failed', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}

// Middleware: require valid Bearer JWT token
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = {
      accountId: decoded.sub,
      email: decoded.email,
    };
    next();
  } catch (err) {
    logger.warn('JWT verification failed', { error: err.message, ip: req.ip });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Generate a JWT for an authenticated account
function generateToken(account) {
  return jwt.sign(
    { sub: account.id, email: account.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

module.exports = { requireApiKey, requireAuth, generateToken };
