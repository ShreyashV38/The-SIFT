// ---------------------------------------------------------------------------
// The-SIFT — Members Routes (identity-service)
// ---------------------------------------------------------------------------
// FR-13: member roles (owner, admin, member) with role checks
// FR-12: seat limits enforced when adding members
// FR-14: shared devices — all members of a tenant use the same devices
// Email: notifications on add, remove, role change, invite
// ---------------------------------------------------------------------------

const { Router } = require('express');
const { createAuth, createRbac, createServiceLogger } = require('@sift/common');
const { getDb } = require('../db');
const config = require('../config');
const emailService = require('../services/email');

const logger = createServiceLogger(config.serviceName);
const { requireAuth } = createAuth(config);
const { requireRole } = createRbac({ getDbFn: getDb, logger });

const router = Router();

// GET /v1/tenants/:slug/members
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
router.post('/:slug/members', requireAuth, requireRole('admin'), (req, res) => {
  const { email, role = 'member' } = req.body || {};

  if (!email) {
    return res.status(400).json({
      error: { code: 'VALIDATION', message: 'email is required' },
    });
  }

  const cleanRole = role.toLowerCase();
  if (!['admin', 'member'].includes(cleanRole)) {
    return res.status(400).json({
      error: { code: 'VALIDATION', message: 'role must be admin or member' },
    });
  }

  if (cleanRole === 'admin' && req.membership.role !== 'owner') {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Only owners can add admins' },
    });
  }

  const db = getDb();

  const account = db.prepare(
    "SELECT id, email, display_name FROM accounts WHERE lower(email) = lower(?) AND status = 'active'"
  ).get(email.trim().toLowerCase());

  if (!account) {
    const adder = db.prepare('SELECT display_name FROM accounts WHERE id = ?').get(req.user.accountId);
    const portalUrl = `${req.protocol}://${req.get('host')}/`;
    emailService.sendInviteToRegister(
      email.trim().toLowerCase(),
      req.tenant.display_name,
      adder ? adder.display_name : 'A household admin',
      portalUrl
    ).catch(() => {});

    return res.status(404).json({
      error: {
        code: 'ACCOUNT_NOT_FOUND',
        message: 'No active account found with this email. An invitation email has been sent to them to register.',
      },
    });
  }

  const existingMembership = db.prepare(
    'SELECT id, status FROM memberships WHERE tenant_id = ? AND account_id = ?'
  ).get(req.tenant.id, account.id);

  if (existingMembership && existingMembership.status === 'active') {
    return res.status(409).json({
      error: { code: 'ALREADY_MEMBER', message: 'This account is already a member of this tenant' },
    });
  }

  const tenant = db.prepare('SELECT plan FROM tenants WHERE id = ?').get(req.tenant.id);
  const planLimits = config.plans[tenant.plan] || { seats: 1 };

  const memberCount = db.prepare(
    "SELECT COUNT(*) as count FROM memberships WHERE tenant_id = ? AND status = 'active'"
  ).get(req.tenant.id).count;

  if (memberCount >= planLimits.seats) {
    return res.status(409).json({
      error: {
        code: 'PLAN_LIMIT',
        message: `Seat limit reached. ${tenant.plan} plan allows ${planLimits.seats} member(s). Current: ${memberCount}`,
        details: { currentSeats: memberCount, maxSeats: planLimits.seats },
      },
    });
  }

  if (existingMembership && existingMembership.status === 'removed') {
    db.prepare(
      "UPDATE memberships SET status = 'active', role = ?, joined_at = datetime('now') WHERE id = ?"
    ).run(cleanRole, existingMembership.id);
  } else {
    db.prepare(
      'INSERT INTO memberships (tenant_id, account_id, role) VALUES (?, ?, ?) ON CONFLICT (tenant_id, account_id) DO NOTHING'
    ).run(req.tenant.id, account.id, cleanRole);
  }

  logger.info('Member added', {
    slug: req.params.slug,
    email: account.email,
    role: cleanRole,
    addedBy: req.user.accountId,
  });

  const adder = db.prepare('SELECT display_name FROM accounts WHERE id = ?').get(req.user.accountId);
  emailService.sendMemberAdded(
    account.email,
    account.display_name,
    req.tenant.display_name,
    cleanRole,
    adder ? adder.display_name : 'A household admin'
  ).catch(() => {});

  res.status(201).json({
    message: 'Member added',
    member: {
      accountId: account.id,
      email: account.email,
      displayName: account.display_name,
      role: cleanRole,
    },
  });
});

function handleMemberRoleUpdate(req, res) {
  const targetId = parseInt(req.params.accountId, 10);
  const { role } = req.body || {};

  if (!role || !['admin', 'member'].includes(role.toLowerCase())) {
    return res.status(400).json({
      error: { code: 'VALIDATION', message: 'role must be admin or member' },
    });
  }

  const cleanRole = role.toLowerCase();
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
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Member not found' },
    });
  }

  if (targetMembership.role === 'owner') {
    return res.status(400).json({
      error: { code: 'LAST_OWNER', message: 'Cannot change owner role. Use transfer ownership instead.' },
    });
  }

  db.prepare('UPDATE memberships SET role = ? WHERE id = ?').run(cleanRole, targetMembership.id);

  logger.info('Member role changed', {
    slug: req.params.slug,
    targetAccountId: targetMembership.account_id,
    newRole: cleanRole,
  });

  const targetAccount = db.prepare('SELECT email, display_name FROM accounts WHERE id = ?').get(targetMembership.account_id);
  if (targetAccount) {
    emailService.sendRoleChanged(targetAccount.email, targetAccount.display_name, req.tenant.display_name, cleanRole).catch(() => {});
  }

  res.json({ message: 'Role updated', role: cleanRole });
}

// PUT /v1/tenants/:slug/members/:accountId/role
router.put('/:slug/members/:accountId/role', requireAuth, requireRole('owner'), handleMemberRoleUpdate);
// PATCH /v1/tenants/:slug/members/:accountId
router.patch('/:slug/members/:accountId', requireAuth, requireRole('owner'), handleMemberRoleUpdate);

// DELETE /v1/tenants/:slug/members/:accountId
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
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Member not found' },
    });
  }

  if (targetMembership.account_id === req.user.accountId) {
    return res.status(400).json({
      error: { code: 'VALIDATION', message: 'Cannot remove yourself. Use transfer ownership first.' },
    });
  }

  if (targetMembership.role === 'admin' && req.membership.role !== 'owner') {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Only owners can remove admins' },
    });
  }

  if (targetMembership.role === 'owner') {
    return res.status(400).json({
      error: { code: 'LAST_OWNER', message: 'Cannot remove the owner. Transfer ownership first.' },
    });
  }

  db.prepare("UPDATE memberships SET status = 'removed' WHERE id = ?").run(targetMembership.id);

  logger.info('Member removed', {
    slug: req.params.slug,
    targetAccountId: targetMembership.account_id,
    removedBy: req.user.accountId,
  });

  const removedAccount = db.prepare('SELECT email, display_name FROM accounts WHERE id = ?').get(targetMembership.account_id);
  if (removedAccount) {
    emailService.sendMemberRemoved(removedAccount.email, removedAccount.display_name, req.tenant.display_name).catch(() => {});
  }

  res.json({ message: 'Member removed' });
});

// POST /v1/tenants/:slug/transfer-ownership
router.post('/:slug/transfer-ownership', requireAuth, requireRole('owner'), (req, res) => {
  const { accountId } = req.body || {};

  if (!accountId) {
    return res.status(400).json({
      error: { code: 'VALIDATION', message: 'accountId of new owner is required' },
    });
  }

  const db = getDb();

  const newOwner = db.prepare(
    "SELECT id, role FROM memberships WHERE tenant_id = ? AND account_id = ? AND status = 'active'"
  ).get(req.tenant.id, accountId);

  if (!newOwner) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Target account is not an active member of this tenant' },
    });
  }

  const transfer = db.transaction(() => {
    db.prepare("UPDATE memberships SET role = 'admin' WHERE tenant_id = ? AND account_id = ?")
      .run(req.tenant.id, req.user.accountId);
    db.prepare("UPDATE memberships SET role = 'owner' WHERE tenant_id = ? AND account_id = ?")
      .run(req.tenant.id, accountId);
  });

  transfer();

  logger.info('Ownership transferred', {
    slug: req.params.slug,
    from: req.user.accountId,
    to: accountId,
  });

  const oldOwner = db.prepare('SELECT email, display_name FROM accounts WHERE id = ?').get(req.user.accountId);
  const newOwnerAccount = db.prepare('SELECT email, display_name FROM accounts WHERE id = ?').get(accountId);
  if (newOwnerAccount) {
    emailService.sendOwnershipTransferred(newOwnerAccount.email, newOwnerAccount.display_name, req.tenant.display_name, 'received').catch(() => {});
  }
  if (oldOwner) {
    emailService.sendOwnershipTransferred(oldOwner.email, oldOwner.display_name, req.tenant.display_name, 'transferred').catch(() => {});
  }

  res.json({ message: 'Ownership transferred' });
});

module.exports = router;
module.exports.router = router;
