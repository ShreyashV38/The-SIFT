const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createAuth, createInternalClient, createServiceLogger } = require('@sift/common');
const { getPool } = require('../db');
const config = require('../config');
const email = require('../services/email');

const logger = createServiceLogger(config.serviceName);
const auth = createAuth(config);
const household = createInternalClient({
  baseUrl: config.householdUrl,
  internalToken: config.internalToken,
});

const router = Router();
const SALT_ROUNDS = 12;

function generateOtp(length = 6) {
  const digits = '0123456789';
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) code += digits[bytes[i] % 10];
  return code;
}

async function publishAccountEvent(client, type, account) {
  const { createEventBus } = require('@sift/common');
  // enqueue via outbox using pool client
  await client.query(
    `INSERT INTO event_outbox (id, event_type, payload)
     VALUES (gen_random_uuid(), $1, $2)`,
    [type, JSON.stringify({
      id: account.id,
      email: account.email,
      displayName: account.display_name || account.displayName,
      status: account.status || 'active',
      createdAt: account.created_at || account.createdAt,
    })]
  );
}

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Invalid email address format' },
      });
    }

    const pool = getPool();
    const existing = await pool.query('SELECT id FROM accounts WHERE lower(email) = lower($1)', [userEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({
        error: { code: 'ALREADY_EXISTS', message: 'An account with this email already exists' },
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO accounts (email, display_name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name, status, created_at`,
        [userEmail.trim().toLowerCase(), displayName.trim(), passwordHash]
      );
      const account = result.rows[0];
      await publishAccountEvent(client, 'account.created', account);
      await client.query('COMMIT');

      email.sendWelcome(account.email, account.display_name).catch(() => {});

      const response = {
        account: {
          id: account.id,
          email: account.email,
          displayName: account.display_name,
          createdAt: account.created_at,
        },
        message: 'Account created successfully. Please log in to continue.',
      };

      // Test compatibility: when SKIP_OTP, also issue session on register
      if (config.skipOtp) {
        const token = auth.generateToken(account);
        auth.setSessionCookie(res, token);
        response.token = token;
      }

      res.status(201).json(response);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Registration failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email: userEmail, password } = req.body || {};
    if (!userEmail || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'email and password are required' },
      });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, email, display_name, password_hash, status FROM accounts WHERE lower(email) = lower($1)`,
      [userEmail.trim()]
    );
    const account = rows[0];
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

    if (config.skipOtp) {
      const token = auth.generateToken(account);
      auth.setSessionCookie(res, token);
      return res.json({
        account: { id: account.id, email: account.email, displayName: account.display_name },
        token,
      });
    }

    const otpCode = generateOtp(config.otpLength);
    const expiresAt = new Date(Date.now() + config.otpExpirySeconds * 1000);
    await pool.query(`UPDATE otp_codes SET used = TRUE WHERE account_id = $1 AND used = FALSE`, [account.id]);
    await pool.query(
      `INSERT INTO otp_codes (account_id, code, expires_at) VALUES ($1, $2, $3)`,
      [account.id, otpCode, expiresAt.toISOString()]
    );

    const otpToken = jwt.sign(
      { sub: account.id, email: account.email, purpose: 'otp' },
      config.jwtSecret,
      { expiresIn: `${config.otpExpirySeconds}s` }
    );

    const sent = await email.sendOtp(account.email, otpCode, account.display_name);
    res.json({
      otpRequired: true,
      otpToken,
      message: sent
        ? `A verification code has been sent to ${account.email}`
        : 'OTP generated but email delivery may be delayed. Check your inbox.',
      email: account.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
    });
  } catch (err) {
    logger.error('Login failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { otpToken, code } = req.body || {};
    if (!otpToken || !code) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'otpToken and code are required' },
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(otpToken, config.jwtSecret);
    } catch {
      return res.status(401).json({
        error: { code: 'OTP_EXPIRED', message: 'OTP has expired. Please log in again.' },
      });
    }
    if (decoded.purpose !== 'otp') {
      return res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid OTP token' },
      });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, code, expires_at FROM otp_codes
       WHERE account_id = $1 AND used = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [decoded.sub]
    );
    const otp = rows[0];
    if (!otp) {
      return res.status(401).json({
        error: { code: 'OTP_INVALID', message: 'No valid OTP found. Please log in again.' },
      });
    }
    if (new Date(otp.expires_at) < new Date()) {
      await pool.query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id]);
      return res.status(401).json({
        error: { code: 'OTP_EXPIRED', message: 'OTP has expired. Please log in again.' },
      });
    }
    if (otp.code !== code.trim()) {
      return res.status(401).json({
        error: { code: 'OTP_INVALID', message: 'Invalid verification code. Please try again.' },
      });
    }

    await pool.query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id]);
    const accountRes = await pool.query(
      `SELECT id, email, display_name FROM accounts WHERE id = $1 AND status = 'active'`,
      [decoded.sub]
    );
    const account = accountRes.rows[0];
    if (!account) {
      return res.status(404).json({
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    const sessionToken = auth.generateToken(account);
    auth.setSessionCookie(res, sessionToken);
    email.sendLoginAlert(account.email, account.display_name, req.ip || 'Unknown').catch(() => {});

    res.json({
      account: { id: account.id, email: account.email, displayName: account.display_name },
      token: sessionToken,
    });
  } catch (err) {
    logger.error('OTP verification failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const { otpToken } = req.body || {};
    if (!otpToken) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'otpToken is required' },
      });
    }
    let decoded;
    try {
      decoded = jwt.verify(otpToken, config.jwtSecret);
    } catch {
      return res.status(401).json({
        error: { code: 'OTP_EXPIRED', message: 'Session expired. Please log in again.' },
      });
    }
    if (decoded.purpose !== 'otp') {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
    }

    const pool = getPool();
    const accountRes = await pool.query(
      `SELECT id, email, display_name FROM accounts WHERE id = $1 AND status = 'active'`,
      [decoded.sub]
    );
    const account = accountRes.rows[0];
    if (!account) {
      return res.status(404).json({
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    await pool.query(`UPDATE otp_codes SET used = TRUE WHERE account_id = $1 AND used = FALSE`, [account.id]);
    const otpCode = generateOtp(config.otpLength);
    const expiresAt = new Date(Date.now() + config.otpExpirySeconds * 1000);
    await pool.query(
      `INSERT INTO otp_codes (account_id, code, expires_at) VALUES ($1, $2, $3)`,
      [account.id, otpCode, expiresAt.toISOString()]
    );
    const sent = await email.sendOtp(account.email, otpCode, account.display_name);
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

router.post('/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', auth.requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, email, display_name, created_at FROM accounts WHERE id = $1 AND status = 'active'`,
      [req.user.accountId]
    );
    const account = rows[0];
    if (!account) {
      return res.status(404).json({
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
      });
    }

    let tenants = [];
    let memberships = [];
    try {
      const mem = await household.get(`/internal/accounts/${account.id}/memberships`);
      if (mem.ok) {
        tenants = mem.body.tenants || [];
        memberships = mem.body.memberships || [];
      }
    } catch (err) {
      logger.warn('Could not fetch memberships from household-service', { error: err.message });
    }

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
  } catch (err) {
    logger.error('/me failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// Internal: lookup account by email (for household member invites)
router.get('/internal/accounts/by-email/:email', auth.requireInternalToken, async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, display_name, status FROM accounts
     WHERE lower(email) = lower($1) AND status = 'active'`,
    [req.params.email]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' } });
  }
  res.json({ account: rows[0] });
});

router.get('/internal/accounts/:id', auth.requireInternalToken, async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, email, display_name, status, created_at FROM accounts WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' } });
  }
  res.json({ account: rows[0] });
});

module.exports = { router, auth };
