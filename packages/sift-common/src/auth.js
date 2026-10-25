const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers?.cookie;
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx !== -1) {
      cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return cookies;
}

function createAuth({ jwtSecret, jwtExpiresIn = '24h', cookieSecure = false, internalToken, apiKey }) {
  function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key || !safeCompare(key, apiKey)) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Invalid or missing API key' },
      });
    }
    next();
  }

  function generateToken(account) {
    return jwt.sign(
      { sub: account.id, email: account.email },
      jwtSecret,
      { expiresIn: jwtExpiresIn }
    );
  }

  function setSessionCookie(res, token) {
    const secure = cookieSecure ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `sift_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`
    );
  }

  function clearSessionCookie(res) {
    const secure = cookieSecure ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `sift_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
    );
  }

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

    if (isCookieAuth && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (req.headers['x-sift-csrf'] !== '1') {
        return res.status(403).json({
          error: { code: 'CSRF', message: 'CSRF header missing or invalid. Expected X-SIFT-CSRF: 1' },
        });
      }
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);
      req.user = { accountId: decoded.sub, email: decoded.email };
      req.isCookieAuth = isCookieAuth;
      next();
    } catch {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired session token' },
      });
    }
  }

  function requireInternalToken(req, res, next) {
    const token = req.headers['x-internal-token'];
    if (!token || !safeCompare(token, internalToken)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Invalid or missing X-Internal-Token' },
      });
    }
    next();
  }

  function verifyToken(token) {
    return jwt.verify(token, jwtSecret);
  }

  return {
    requireApiKey,
    generateToken,
    setSessionCookie,
    clearSessionCookie,
    requireAuth,
    requireInternalToken,
    verifyToken,
    safeCompare,
    parseCookies,
  };
}

module.exports = { createAuth, safeCompare, parseCookies };
