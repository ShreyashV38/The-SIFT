const { createServiceLogger } = require('./logger');
const { createAuth, safeCompare, parseCookies } = require('./auth');
const { createPool, migrate, ensureOutboxAndIdempotency, getDb } = require('./db');
const { createEventBus, STREAM_KEY } = require('./events');
const { fetchJson, createInternalClient } = require('./http');

const PLANS = {
  single: { seats: 1, devices: 10 },
  family: { seats: 6, devices: 30 },
};

const ROLE_RANK = { owner: 3, admin: 2, member: 1 };

function createRbac({ getDbFn = getDb, logger } = {}) {
  function requireRole(minRole = 'member') {
    const minRank = ROLE_RANK[minRole] || 1;

    return (req, res, next) => {
      const { slug } = req.params;
      const accountId = req.user?.accountId;

      if (!slug || !accountId) {
        return res.status(400).json({ error: 'Missing tenant slug or authentication' });
      }

      const db = getDbFn();
      const tenant = db.prepare(
        'SELECT id, slug, display_name, plan, status, mg_workspace_id, mg_chan_telemetry, mg_chan_commands, ha_namespace FROM tenants WHERE slug = ? AND status = ?'
      ).get(slug, 'active');

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const membership = db.prepare(
        'SELECT id, role, status FROM memberships WHERE tenant_id = ? AND account_id = ? AND status = ?'
      ).get(tenant.id, accountId, 'active');

      if (!membership) {
        if (logger) logger.warn('Access denied: not a member', { slug, accountId });
        return res.status(403).json({ error: 'You are not a member of this tenant' });
      }

      const callerRank = ROLE_RANK[membership.role] || 0;
      if (callerRank < minRank) {
        if (logger) {
          logger.warn('Access denied: insufficient role', {
            slug, accountId, role: membership.role, required: minRole,
          });
        }
        return res.status(403).json({
          error: `Requires ${minRole} role or higher. You are: ${membership.role}`,
        });
      }

      req.tenant = tenant;
      req.membership = membership;
      next();
    };
  }

  return { requireRole, ROLE_RANK };
}

module.exports = {
  createServiceLogger,
  createAuth,
  createRbac,
  safeCompare,
  parseCookies,
  createPool,
  migrate,
  ensureOutboxAndIdempotency,
  getDb,
  createEventBus,
  STREAM_KEY,
  fetchJson,
  createInternalClient,
  PLANS,
  ROLE_RANK,
};
