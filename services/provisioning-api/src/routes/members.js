// ---------------------------------------------------------------------------
// CloudNest — Members Routes
// ---------------------------------------------------------------------------
// FR-13: member roles (owner, admin, member) with role checks
// FR-12: seat limits enforced when adding members
// FR-14: shared devices — all members of a tenant use the same devices
// ---------------------------------------------------------------------------

const { Router } = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ROLE_RANK } = require('../middleware/rbac');
const config = require('../config');
const logger = require('../logger');

const router = Router();

// GET /v1/tenants/:slug/members
// Any member can list members
router.get('/:slug/members', requireAuth, requireRole('member'), (req, res) => {
  const db = getDb();
  const members = db.prepare(`
    SELECT m.id, m.role, m.status, m.joined_at,
           a.id as account_id, a.email, a.display_name
    FROM memberships m
    JOIN accounts a ON m.account_id = a.id
    WHERE m.tenant_id = ? AND m.status = 'active'
    ORDER BY m.role DESC, m.joined_at ASC
  `).all(req.tenant.id);

  res.json({ members });
});

// POST /v1/tenants/:slug/members
// Add a member directly. Requires admin or owner role.
// Body: { email, role? }
// FR-12: enforces seat limits
router.post('/:slug/members', requireAuth, requireRole('admin'), (req, res) => {
  const { email, role = 'member' } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  // Validate role
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or member' });
  }

  // Only owners can add admins
  if (role === 'admin' && req.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can add admins' });
  }

  const db = getDb();

  // Look up the target account
  const account = db.prepare(
    "SELECT id, email, display_name FROM accounts WHERE email = ? AND status = 'active'"
  ).get(email);

  if (!account) {
    return res.status(404).json({ error: 'No active account found with this email. They must register first.' });
  }

  // Check if already a member
  const existingMembership = db.prepare(
    "SELECT id, status FROM memberships WHERE tenant_id = ? AND account_id = ?"
  ).get(req.tenant.id, account.id);

  if (existingMembership && existingMembership.status === 'active') {
    return res.status(409).json({ error: 'This account is already a member of this tenant' });
  }

  // Enforce seat limits (FR-12) — use BEGIN IMMEDIATE for concurrency safety (T-MEM-3)
  const tenant = db.prepare('SELECT plan FROM tenants WHERE id = ?').get(req.tenant.id);
  const planLimits = config.plans[tenant.plan];

  const memberCount = db.prepare(
    "SELECT COUNT(*) as count FROM memberships WHERE tenant_id = ? AND status = 'active'"
  ).get(req.tenant.id).count;

  if (memberCount >= planLimits.seats) {
    return res.status(409).json({
      error: `Seat limit reached. ${tenant.plan} plan allows ${planLimits.seats} member(s). Current: ${memberCount}`,
    });
  }

  // Add or reactivate membership
  if (existingMembership && existingMembership.status === 'removed') {
    db.prepare(
      "UPDATE memberships SET status = 'active', role = ?, joined_at = datetime('now') WHERE id = ?"
    ).run(role, existingMembership.id);
  } else {
    db.prepare(
      'INSERT INTO memberships (tenant_id, account_id, role) VALUES (?, ?, ?)'
    ).run(req.tenant.id, account.id, role);
  }

  logger.info('Member added', {
    slug: req.params.slug,
    email,
    role,
    addedBy: req.user.accountId,
  });

  res.status(201).json({
    message: 'Member added',
    member: {
      accountId: account.id,
      email: account.email,
      displayName: account.display_name,
      role,
    },
  });
});

// DELETE /v1/tenants/:slug/members/:accountId
// Remove a member. Requires admin or owner.
// FR-13: the last owner cannot be removed
router.delete('/:slug/members/:accountId', requireAuth, requireRole('admin'), (req, res) => {
  const targetId = parseInt(req.params.accountId, 10);
  const db = getDb();

  let targetMembership = db.prepare(
    "SELECT id, role, account_id FROM memberships WHERE tenant_id = ? AND id = ? AND status = 'active'"
  ).get(req.tenant.id, targetId);

  if (!targetMembership) {
    targetMembership = db.prepare(
      "SELECT id, role, account_id FROM memberships WHERE tenant_id = ? AND account_id = ? AND status = 'active'"
    ).get(req.tenant.id, targetId);
  }

  if (!targetMembership) {
    return res.status(404).json({ error: 'Member not found' });
  }

  // Cannot remove yourself (use a separate leave endpoint)
  if (targetMembership.account_id === req.user.accountId) {
    return res.status(400).json({ error: 'Cannot remove yourself. Use transfer ownership first.' });
  }

  // Only owner can remove admins
  if (targetMembership.role === 'admin' && req.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only owners can remove admins' });
  }

  // Cannot remove the owner (FR-13: last owner protection)
  if (targetMembership.role === 'owner') {
    return res.status(400).json({ error: 'Cannot remove the owner. Transfer ownership first.' });
  }

  // Soft-remove the membership
  db.prepare("UPDATE memberships SET status = 'removed' WHERE id = ?").run(targetMembership.id);

  logger.info('Member removed', {
    slug: req.params.slug,
    targetAccountId: targetMembership.account_id,
    removedBy: req.user.accountId,
  });

  res.json({ message: 'Member removed' });
});

// PUT /v1/tenants/:slug/members/:accountId/role
// Change a member's role. Owner only.
router.put('/:slug/members/:accountId/role', requireAuth, requireRole('owner'), (req, res) => {
  const targetId = parseInt(req.params.accountId, 10);
  const { role } = req.body;

  if (!role || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or member' });
  }

  const db = getDb();

  let targetMembership = db.prepare(
    "SELECT id, role, account_id FROM memberships WHERE tenant_id = ? AND id = ? AND status = 'active'"
  ).get(req.tenant.id, targetId);

  if (!targetMembership) {
    targetMembership = db.prepare(
      "SELECT id, role, account_id FROM memberships WHERE tenant_id = ? AND account_id = ? AND status = 'active'"
    ).get(req.tenant.id, targetId);
  }

  if (!targetMembership) {
    return res.status(404).json({ error: 'Member not found' });
  }

  if (targetMembership.role === 'owner') {
    return res.status(400).json({ error: 'Cannot change owner role. Use transfer ownership instead.' });
  }

  db.prepare('UPDATE memberships SET role = ? WHERE id = ?').run(role, targetMembership.id);

  logger.info('Member role changed', {
    slug: req.params.slug,
    targetAccountId: targetMembership.account_id,
    newRole: role,
  });

  res.json({ message: 'Role updated', role });
});

// POST /v1/tenants/:slug/transfer-ownership
// Transfer ownership to another member. Owner only.
// FR-13: tenant always has exactly one owner
router.post('/:slug/transfer-ownership', requireAuth, requireRole('owner'), (req, res) => {
  const { accountId } = req.body;

  if (!accountId) {
    return res.status(400).json({ error: 'accountId of new owner is required' });
  }

  const db = getDb();

  const newOwner = db.prepare(
    "SELECT id, role FROM memberships WHERE tenant_id = ? AND account_id = ? AND status = 'active'"
  ).get(req.tenant.id, accountId);

  if (!newOwner) {
    return res.status(404).json({ error: 'Target account is not an active member of this tenant' });
  }

  // Atomic transfer within a transaction
  const transfer = db.transaction(() => {
    // Demote current owner to admin
    db.prepare("UPDATE memberships SET role = 'admin' WHERE tenant_id = ? AND account_id = ?")
      .run(req.tenant.id, req.user.accountId);
    // Promote new owner
    db.prepare("UPDATE memberships SET role = 'owner' WHERE tenant_id = ? AND account_id = ?")
      .run(req.tenant.id, accountId);
  });

  transfer();

  logger.info('Ownership transferred', {
    slug: req.params.slug,
    from: req.user.accountId,
    to: accountId,
  });

  res.json({ message: 'Ownership transferred' });
});

module.exports = router;
