// ---------------------------------------------------------------------------
// CloudNest — Accounts Routes
// ---------------------------------------------------------------------------
// FR-11: register, login (passwords stored as salted bcrypt hashes)
// ---------------------------------------------------------------------------

const { Router } = require('express');
const bcrypt = require('bcrypt');
const { getDb } = require('../db');
const { generateToken } = require('../middleware/auth');
const logger = require('../logger');

const router = Router();
const SALT_ROUNDS = 12;

// POST /v1/accounts/register
// Body: { email, displayName, password }
router.post('/register', async (req, res) => {
  try {
    const { email, displayName, password } = req.body;

    if (!email || !displayName || !password) {
      return res.status(400).json({ error: 'email, displayName, and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const db = getDb();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash password (FR-11: salted hashes only)
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = db.prepare(
      'INSERT INTO accounts (email, display_name, password_hash) VALUES (?, ?, ?)'
    ).run(email, displayName, passwordHash);

    const account = db.prepare('SELECT id, email, display_name, created_at FROM accounts WHERE id = ?')
      .get(result.lastInsertRowid);

    logger.info('Account registered', { accountId: account.id, email });

    const token = generateToken(account);

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /v1/accounts/login
// Body: { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const db = getDb();
    const account = db.prepare(
      'SELECT id, email, display_name, password_hash, status FROM accounts WHERE email = ?'
    ).get(email);

    if (!account || account.status !== 'active') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(account);

    logger.info('Account login', { accountId: account.id, email });

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/accounts/me  (requires auth)
router.get('/me', (req, res) => {
  const db = getDb();
  const account = db.prepare(
    'SELECT id, email, display_name, created_at FROM accounts WHERE id = ? AND status = ?'
  ).get(req.user.accountId, 'active');

  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Also fetch memberships
  const memberships = db.prepare(`
    SELECT m.role, m.joined_at, t.slug, t.display_name as tenant_name, t.plan
    FROM memberships m JOIN tenants t ON m.tenant_id = t.id
    WHERE m.account_id = ? AND m.status = 'active' AND t.status = 'active'
  `).all(req.user.accountId);

  res.json({
    account: {
      id: account.id,
      email: account.email,
      displayName: account.display_name,
      createdAt: account.created_at,
    },
    memberships,
  });
});

module.exports = router;
