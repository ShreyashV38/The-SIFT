// ---------------------------------------------------------------------------
// CloudNest — Accounts & Auth Routes (Phase 6C + Email 2FA)
// ---------------------------------------------------------------------------
// FR-11: register, login (salted bcrypt hashes), logout, me
// 2FA:   Mandatory email OTP on every login
// Email: Welcome email on registration, login alerts on success
// Supports session cookies (sift_session) for portal + JWT for API/CLI
// ---------------------------------------------------------------------------

const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { getDb } = require('../db');
const { generateToken, requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const config = require('../config');
const logger = require('../logger');
const email = require('../services/email');

const router = Router();
const SALT_ROUNDS = 12;

// Generate a cryptographically secure N-digit OTP code
function generateOtp(length = 6) {
  const digits = '0123456789';
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += digits[bytes[i] % 10];
  }
  return code;
}

// POST /register
// Body: { email, displayName, password }
router.post('/register', async (req, res) => {
  try {
    const { email: userEmail, displayName, password } = req.body || {};

    if (!userEmail || !displayName || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'email, displayName, and password are required' },
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Password must be between 8 and 128 characters' },
      });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Invalid email address format' },
      });
    }

    const db = getDb();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(userEmail);
    if (existing) {
      return res.status(409).json({
        error: { code: 'ALREADY_EXISTS', message: 'An account with this email already exists' },
      });
    }

    // Hash password (FR-11: salted bcrypt hashes)
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = db.prepare(
      'INSERT INTO accounts (email, display_name, password_hash) VALUES (?, ?, ?)'
    ).run(userEmail.trim().toLowerCase(), displayName.trim(), passwordHash);

    const account = db.prepare('SELECT id, email, display_name, created_at FROM accounts WHERE id = ?')
      .get(result.lastInsertRowid);

    logger.info('Account registered', { accountId: account.id, email: account.email });

    // Send welcome email (non-blocking)
    email.sendWelcome(account.email, account.display_name).catch(() => {});

    // Registration does NOT auto-login (user must go through OTP on login)
    res.status(201).json({
      account: {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
        createdAt: account.created_at,
      },
      message: 'Account created successfully. Please log in to continue.',
    });
  } catch (err) {
    logger.error('Account registration failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// POST /login  (Step 1 — validates credentials, sends OTP email)
// Body: { email, password }
// Returns: { otpRequired: true, otpToken: <temp-token> }
router.post('/login', async (req, res) => {
  try {
    const { email: userEmail, password } = req.body || {};

    if (!userEmail || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'email and password are required' },
      });
    }

    const db = getDb();
    const account = db.prepare(
      'SELECT id, email, display_name, password_hash, status FROM accounts WHERE email = ?'
    ).get(userEmail.trim().toLowerCase());

    if (!account || account.status !== 'active') {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' },
      });
    }

    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' },
      });
    }

    // Generate OTP code
    const otpCode = generateOtp(config.otpLength);
    const expiresAt = new Date(Date.now() + config.otpExpirySeconds * 1000).toISOString();

    // Invalidate any existing unused OTPs for this account
    db.prepare("UPDATE otp_codes SET used = 1 WHERE account_id = ? AND used = 0").run(account.id);

    // Store OTP
    db.prepare(
      'INSERT INTO otp_codes (account_id, code, expires_at) VALUES (?, ?, ?)'
    ).run(account.id, otpCode, expiresAt);

    // Create a temporary OTP token (short-lived JWT just for OTP verification)
    const jwt = require('jsonwebtoken');
    const otpToken = jwt.sign(
      { sub: account.id, email: account.email, purpose: 'otp' },
      config.jwtSecret,
      { expiresIn: `${config.otpExpirySeconds}s` }
    );

    // Send OTP via email (non-blocking for response, but we await to confirm send)
    const sent = await email.sendOtp(account.email, otpCode, account.display_name);

    logger.info('OTP sent for login', { accountId: account.id, email: account.email, sent });

    res.json({
      otpRequired: true,
      otpToken,
      message: sent
        ? `A verification code has been sent to ${account.email}`
        : 'OTP generated but email delivery may be delayed. Check your inbox.',
      email: account.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'), // Mask email
    });
  } catch (err) {
    logger.error('Login failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// POST /verify-otp  (Step 2 — verifies OTP code, issues session)
// Body: { otpToken, code }
router.post('/verify-otp', async (req, res) => {
  try {
    const { otpToken, code } = req.body || {};

    if (!otpToken || !code) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'otpToken and code are required' },
      });
    }

    // Verify the OTP token
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(otpToken, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({
        error: { code: 'OTP_EXPIRED', message: 'OTP has expired. Please log in again.' },
      });
    }

    if (decoded.purpose !== 'otp') {
      return res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid OTP token' },
      });
    }

    const db = getDb();
    const accountId = decoded.sub;

    // Find valid, unused OTP for this account
    const otp = db.prepare(
      "SELECT id, code, expires_at FROM otp_codes WHERE account_id = ? AND used = 0 ORDER BY created_at DESC LIMIT 1"
    ).get(accountId);

    if (!otp) {
      return res.status(401).json({
        error: { code: 'OTP_INVALID', message: 'No valid OTP found. Please log in again.' },
      });
    }

    // Check expiry
    if (new Date(otp.expires_at) < new Date()) {
      db.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").run(otp.id);
      return res.status(401).json({
        error: { code: 'OTP_EXPIRED', message: 'OTP has expired. Please log in again.' },
      });
    }

    // Check code match
    if (otp.code !== code.trim()) {
      return res.status(401).json({
        error: { code: 'OTP_INVALID', message: 'Invalid verification code. Please try again.' },
      });
    }

    // Mark OTP as used
    db.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").run(otp.id);

    // Get account details
    const account = db.prepare(
      'SELECT id, email, display_name FROM accounts WHERE id = ? AND status = ?'
    ).get(accountId, 'active');

    if (!account) {
      return res.status(404).json({
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    // Issue full session token
    const sessionToken = generateToken(account);
    setSessionCookie(res, sessionToken);

    logger.info('OTP verified — login successful', { accountId: account.id, email: account.email });

    // Send login alert email (non-blocking)
    const ip = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
    email.sendLoginAlert(account.email, account.display_name, ip).catch(() => {});

    // Cleanup old expired OTPs (housekeeping, non-blocking)
    try {
      db.prepare("DELETE FROM otp_codes WHERE used = 1 OR expires_at < datetime('now', '-1 hour')").run();
    } catch (_) { /* ignore cleanup errors */ }

    res.json({
      account: {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
      },
      token: sessionToken,
    });
  } catch (err) {
    logger.error('OTP verification failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// POST /resend-otp  (Resend OTP for the same login session)
// Body: { otpToken }
router.post('/resend-otp', async (req, res) => {
  try {
    const { otpToken } = req.body || {};

    if (!otpToken) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'otpToken is required' },
      });
    }

    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(otpToken, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({
        error: { code: 'OTP_EXPIRED', message: 'Session expired. Please log in again.' },
      });
    }

    if (decoded.purpose !== 'otp') {
      return res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
      });
    }

    const db = getDb();
    const accountId = decoded.sub;

    const account = db.prepare(
      'SELECT id, email, display_name FROM accounts WHERE id = ? AND status = ?'
    ).get(accountId, 'active');

    if (!account) {
      return res.status(404).json({
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    // Invalidate previous OTPs
    db.prepare("UPDATE otp_codes SET used = 1 WHERE account_id = ? AND used = 0").run(accountId);

    // Generate new OTP
    const otpCode = generateOtp(config.otpLength);
    const expiresAt = new Date(Date.now() + config.otpExpirySeconds * 1000).toISOString();

    db.prepare(
      'INSERT INTO otp_codes (account_id, code, expires_at) VALUES (?, ?, ?)'
    ).run(accountId, otpCode, expiresAt);

    const sent = await email.sendOtp(account.email, otpCode, account.display_name);

    logger.info('OTP resent', { accountId: account.id, email: account.email, sent });

    res.json({
      message: sent
        ? `New code sent to ${account.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')}`
        : 'New code generated. Check your inbox.',
    });
  } catch (err) {
    logger.error('OTP resend failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'Logged out successfully' });
});

// GET /me  (requires auth)
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const account = db.prepare(
    'SELECT id, email, display_name, created_at FROM accounts WHERE id = ? AND status = ?'
  ).get(req.user.accountId, 'active');

  if (!account) {
    return res.status(404).json({
      error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
    });
  }

  // Fetch tenant memberships with rich metadata for portal
  const memberships = db.prepare(`
    SELECT m.role, m.joined_at, t.slug, t.display_name as tenant_name, t.plan, t.status
    FROM memberships m JOIN tenants t ON m.tenant_id = t.id
    WHERE m.account_id = ? AND m.status = 'active' AND t.status = 'active'
    ORDER BY m.joined_at ASC
  `).all(req.user.accountId);

  const tenants = memberships.map(m => ({
    slug: m.slug,
    displayName: m.tenant_name,
    role: m.role,
    plan: m.plan,
    status: m.status,
    joinedAt: m.joined_at,
  }));

  res.json({
    account: {
      id: account.id,
      email: account.email,
      displayName: account.display_name,
      createdAt: account.created_at,
    },
    tenants,
    memberships,
  });
});

module.exports = router;
