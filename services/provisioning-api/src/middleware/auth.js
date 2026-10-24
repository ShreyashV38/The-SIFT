// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Authentication Middleware (Phase 6C Updated)
// ---------------------------------------------------------------------------
// Auth mechanisms:
//   1. X-API-Key header: for admin/platform operations
//   2. Bearer JWT:       for CLI / API / automated test operations
//   3. sift_session:     httpOnly SameSite cookie for Portal browser sessions
// CSRF defense:
//   State-changing requests with cookie auth must send X-SIFT-CSRF: 1
// ---------------------------------------------------------------------------

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

// Constant-time comparison to prevent timing attacks
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Simple cookie parser helper
function parseCookies(req) {
  const cookies = {};
  const header = req.headers?.cookie;
  if (!header) return cookies;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx !== -1) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

// Middleware: require valid X-API-Key header
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || !safeCompare(key, config.apiKey)) {
    logger.warn('API key authentication failed', { ip: req.ip });
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Invalid or missing API key' },
    });
  }
  next();
}

// Middleware: require valid auth via Bearer JWT or sift_session cookie
function requireAuth(req, res, next) {
  let token = null;
  let isCookieAuth = false;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const cookies = parseCookies(req);
    if (cookies.sift_session) {
      token = cookies.sift_session;
      isCookieAuth = true;
    }
  }

  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Missing or invalid authentication credentials' },
    });
  }

  // CSRF validation on cookie-authenticated state-changing requests (P5 / section 5)
  if (isCookieAuth && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const csrfHeader = req.headers['x-sift-csrf'];
    if (csrfHeader !== '1') {
      logger.warn('CSRF check failed: missing X-SIFT-CSRF header', { ip: req.ip, method: req.method, path: req.path });
      return res.status(403).json({
        error: { code: 'CSRF', message: 'CSRF header missing or invalid. Expected X-SIFT-CSRF: 1' },
      });
    }
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = {
      accountId: decoded.sub,
      email: decoded.email,
    };
    req.isCookieAuth = isCookieAuth;
    next();
  } catch (err) {
    logger.warn('Token verification failed', { error: err.message, ip: req.ip });
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired session token' },
    });
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

// Set session cookie in response (8 hour expiry)
function setSessionCookie(res, token) {
  const isSecure = config.cookieSecure ? '; Secure' : '';
  // Max-age: 8 hours = 28800 seconds
  res.setHeader(
    'Set-Cookie',
    `sift_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${isSecure}`
  );
}

// Clear session cookie on logout
function clearSessionCookie(res) {
  const isSecure = config.cookieSecure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `sift_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isSecure}`
  );
}

module.exports = {
  requireApiKey,
  requireAuth,
  generateToken,
  safeCompare,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
};
