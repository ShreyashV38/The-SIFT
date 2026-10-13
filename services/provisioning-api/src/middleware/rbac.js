// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Role-Based Access Control Middleware
// ---------------------------------------------------------------------------
// FR-13: The API checks the caller's role on every request.
// Loads the caller's membership for the target tenant and attaches it
// to req.membership. Rejects if not a member or insufficient role.
// ---------------------------------------------------------------------------

const { getDb } = require('../db');
const logger = require('../logger');

// Role hierarchy: owner > admin > member
const ROLE_RANK = { owner: 3, admin: 2, member: 1 };

// Middleware factory: require the caller to be a member of the tenant
// identified by req.params.slug, with at least `minRole` privileges.
//
// Usage: router.post('/:slug/devices', requireRole('admin'), handler)
function requireRole(minRole = 'member') {
  const minRank = ROLE_RANK[minRole] || 1;

  return (req, res, next) => {
    const { slug } = req.params;
    const accountId = req.user?.accountId;

    if (!slug || !accountId) {
      return res.status(400).json({ error: 'Missing tenant slug or authentication' });
    }

    const db = getDb();

    // Look up the tenant
    const tenant = db.prepare(
      'SELECT id, slug, plan, status FROM tenants WHERE slug = ? AND status = ?'
    ).get(slug, 'active');

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Look up the caller's membership in this tenant (FR-13, T-MEM-1)
    const membership = db.prepare(
      'SELECT id, role, status FROM memberships WHERE tenant_id = ? AND account_id = ? AND status = ?'
    ).get(tenant.id, accountId, 'active');

    if (!membership) {
      logger.warn('Access denied: not a member', { slug, accountId });
      return res.status(403).json({ error: 'You are not a member of this tenant' });
    }

    const callerRank = ROLE_RANK[membership.role] || 0;
    if (callerRank < minRank) {
      logger.warn('Access denied: insufficient role', {
        slug, accountId, role: membership.role, required: minRole,
      });
      return res.status(403).json({
        error: `Requires ${minRole} role or higher. You are: ${membership.role}`,
      });
    }

    // Attach tenant and membership to request for downstream handlers
    req.tenant = tenant;
    req.membership = membership;
    next();
  };
}

module.exports = { requireRole, ROLE_RANK };
