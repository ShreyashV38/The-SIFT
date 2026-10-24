// ---------------------------------------------------------------------------
// CloudNest — Accounts & Auth Routes (Phase 6C Updated)
// ---------------------------------------------------------------------------
// FR-11: register, login (salted bcrypt hashes), logout, me
// Supports session cookies (sift_session) for portal + JWT for API/CLI
// ---------------------------------------------------------------------------

const { Router } = require('express');
const bcrypt = require('bcrypt');
const { getDb } = require('../db');
const { generateToken, requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const logger = require('../logger');

const router = Router();
const SALT_ROUNDS = 12;

// POST /register
// Body: { email, displayName, password }
router.post('/register', async (req, res) => {
  try {
    const { email, displayName, password } = req.body || {};

    if (!email || !displayName || !password) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Invalid email address format' },
      });
    }

    const db = getDb();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({
        error: { code: 'ALREADY_EXISTS', message: 'An account with this email already exists' },
      });
    }

    // Hash password (FR-11: salted bcrypt hashes)
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = db.prepare(
      'INSERT INTO accounts (email, display_name, password_hash) VALUES (?, ?, ?)'
    ).run(email.trim().toLowerCase(), displayName.trim(), passwordHash);

    const account = db.prepare('SELECT id, email, display_name, created_at FROM accounts WHERE id = ?')
      .get(result.lastInsertRowid);

    logger.info('Account registered', { accountId: account.id, email: account.email });

    const token = generateToken(account);
    setSessionCookie(res, token);

    res.status(201).json({
      account: {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
        createdAt: account.created_at,
      },
      token,
    });
  } catch (err) {
    logger.error('Account registration failed', { error: err.message });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});

// POST /login
// Body: { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'email and password are required' },
      });
    }

    const db = getDb();
    const account = db.prepare(
      'SELECT id, email, display_name, password_hash, status FROM accounts WHERE email = ?'
    ).get(email.trim().toLowerCase());

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

    const token = generateToken(account);
    setSessionCookie(res, token);

    logger.info('Account login successful', { accountId: account.id, email: account.email });

    res.json({
      account: {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
      },
      token,
    });
  } catch (err) {
    logger.error('Login failed', { error: err.message });
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
