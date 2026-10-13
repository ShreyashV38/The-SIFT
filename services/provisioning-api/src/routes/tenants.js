// ---------------------------------------------------------------------------
// CloudNest — Tenants Routes
// ---------------------------------------------------------------------------
// FR-01: tenant creation (API-key authenticated)
// FR-02: auto-creates Magistrala workspace + channels
// FR-03: auto-deploys isolated HA instance
// FR-12: plan enforcement (seat/device limits)
// ---------------------------------------------------------------------------

const { Router } = require('express');
const { getDb } = require('../db');
const { requireApiKey, requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const magistrala = require('../services/magistrala');
const kubernetes = require('../services/kubernetes');
const config = require('../config');
const logger = require('../logger');

const router = Router();

// Validate slug format
function isValidSlug(slug) {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug);
}

// POST /v1/tenants
// Creates a new tenant. Requires API key + authenticated user (who becomes owner).
// Body: { slug, displayName, plan? }
router.post('/', requireApiKey, requireAuth, async (req, res) => {
  try {
    const { slug, displayName, plan = 'single' } = req.body;
    const accountId = req.user.accountId;

    // Validate input
    if (!slug || !displayName) {
      return res.status(400).json({ error: 'slug and displayName are required' });
    }
    if (!isValidSlug(slug)) {
      return res.status(400).json({
        error: 'slug must be 3-32 chars, lowercase alphanumeric and hyphens, cannot start/end with hyphen',
      });
    }
    if (!config.plans[plan]) {
      return res.status(400).json({ error: `Invalid plan. Options: ${Object.keys(config.plans).join(', ')}` });
    }

    const db = getDb();

    // Check slug uniqueness
    const existing = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug);
    if (existing) {
      return res.status(409).json({ error: 'A tenant with this slug already exists' });
    }

    // --- Step 1: Create Magistrala workspace + channels (FR-02) ---
    let mgWorkspace, mgChannels;
    try {
      mgWorkspace = await magistrala.createWorkspace(slug, displayName);
      mgChannels = await magistrala.createTenantChannels(mgWorkspace.id, slug);
    } catch (err) {
      logger.error('Magistrala provisioning failed', { slug, error: err.message });
      return res.status(502).json({ error: 'Failed to create IoT workspace. Please try again.' });
    }

    // --- Step 2: Insert tenant record ---
    const namespace = `tenant-${slug}`;
    const result = db.prepare(`
      INSERT INTO tenants (slug, display_name, plan, mg_workspace_id, mg_chan_telemetry, mg_chan_commands, ha_namespace)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(slug, displayName, plan, mgWorkspace.id, mgChannels.telemetry.id, mgChannels.commands.id, namespace);

    const tenantId = result.lastInsertRowid;

    // --- Step 3: Create owner membership (FR-13) ---
    db.prepare(
      'INSERT INTO memberships (tenant_id, account_id, role) VALUES (?, ?, ?)'
    ).run(tenantId, accountId, 'owner');

    // --- Step 4: Deploy HA instance in isolated namespace (FR-03) ---
    let deployment;
    try {
      deployment = kubernetes.deployTenant(slug, {
        clientId: mgWorkspace.id,        // Magistrala credentials for HA MQTT client
        secret: '',                       // Will be set via K8s Secret
        telemetryChannel: mgChannels.telemetry.id,
        commandChannel: mgChannels.commands.id,
      });
    } catch (err) {
      logger.error('Kubernetes deployment failed', { slug, error: err.message });
      // Still return success — tenant is created, deployment can be retried
      deployment = { url: `https://${slug}.${config.domain}`, namespace, status: 'deployment_pending' };
    }

    logger.info('Tenant created', { slug, tenantId, plan });

    res.status(201).json({
      tenant: {
        id: tenantId,
        slug,
        displayName,
        plan,
        namespace,
        url: deployment.url || `https://${slug}.${config.domain}`,
      },
      magistrala: {
        workspaceId: mgWorkspace.id,
        telemetryChannelId: mgChannels.telemetry.id,
        commandChannelId: mgChannels.commands.id,
      },
    });
  } catch (err) {
    logger.error('Tenant creation failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/tenants/:slug
// Requires authenticated user who is a member
router.get('/:slug', requireAuth, requireRole('member'), (req, res) => {
  const db = getDb();
  const tenant = db.prepare(`
    SELECT id, slug, display_name, plan, status, ha_namespace, created_at
    FROM tenants WHERE id = ?
  `).get(req.tenant.id);

  const memberCount = db.prepare(
    "SELECT COUNT(*) as count FROM memberships WHERE tenant_id = ? AND status = 'active'"
  ).get(req.tenant.id).count;

  const deviceCount = db.prepare(
    "SELECT COUNT(*) as count FROM devices WHERE tenant_id = ? AND status = 'active'"
  ).get(req.tenant.id).count;

  const planLimits = config.plans[tenant.plan];

  res.json({
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      displayName: tenant.display_name,
      plan: tenant.plan,
      status: tenant.status,
      namespace: tenant.ha_namespace,
      url: `https://${tenant.slug}.${config.domain}`,
      createdAt: tenant.created_at,
    },
    usage: {
      members: memberCount,
      maxMembers: planLimits.seats,
      devices: deviceCount,
      maxDevices: planLimits.devices,
    },
  });
});

// PUT /v1/tenants/:slug/plan
// Change plan. Owner only. Rejects downgrade if current usage exceeds new limits.
// FR-12: seat and device limits enforced
router.put('/:slug/plan', requireAuth, requireRole('owner'), (req, res) => {
  const { plan } = req.body;

  if (!plan || !config.plans[plan]) {
    return res.status(400).json({ error: `Invalid plan. Options: ${Object.keys(config.plans).join(', ')}` });
  }

  const db = getDb();
  const newLimits = config.plans[plan];

  // Check current usage against new limits
  const memberCount = db.prepare(
    "SELECT COUNT(*) as count FROM memberships WHERE tenant_id = ? AND status = 'active'"
  ).get(req.tenant.id).count;

  const deviceCount = db.prepare(
    "SELECT COUNT(*) as count FROM devices WHERE tenant_id = ? AND status = 'active'"
  ).get(req.tenant.id).count;

  if (memberCount > newLimits.seats) {
    return res.status(409).json({
      error: `Cannot downgrade: ${memberCount} active members exceed ${plan} plan limit of ${newLimits.seats} seats`,
    });
  }

  if (deviceCount > newLimits.devices) {
    return res.status(409).json({
      error: `Cannot downgrade: ${deviceCount} active devices exceed ${plan} plan limit of ${newLimits.devices} devices`,
    });
  }

  db.prepare('UPDATE tenants SET plan = ? WHERE id = ?').run(plan, req.tenant.id);

  logger.info('Tenant plan changed', { slug: req.params.slug, plan });

  res.json({ message: 'Plan updated', plan });
});

// DELETE /v1/tenants/:slug
// Owner only. Deletes tenant, all memberships, devices, and K8s resources.
router.delete('/:slug', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const db = getDb();
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenant.id);

    // Mark as deleting
    db.prepare("UPDATE tenants SET status = 'deleting' WHERE id = ?").run(req.tenant.id);

    // Remove K8s resources
    try {
      kubernetes.deleteTenant(tenant.slug);
    } catch (err) {
      logger.warn('K8s cleanup failed', { slug: tenant.slug, error: err.message });
    }

    // Remove Magistrala workspace
    try {
      if (tenant.mg_workspace_id) {
        await magistrala.deleteWorkspace(tenant.mg_workspace_id);
      }
    } catch (err) {
      logger.warn('Magistrala cleanup failed', { slug: tenant.slug, error: err.message });
    }

    // Soft-delete in DB
    db.prepare("UPDATE tenants SET status = 'deleted', deleted_at = datetime('now') WHERE id = ?").run(req.tenant.id);
    db.prepare("UPDATE memberships SET status = 'removed' WHERE tenant_id = ?").run(req.tenant.id);
    db.prepare("UPDATE devices SET status = 'revoked' WHERE tenant_id = ?").run(req.tenant.id);

    logger.info('Tenant deleted', { slug: tenant.slug });
    res.json({ message: 'Tenant deleted' });
  } catch (err) {
    logger.error('Tenant deletion failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /v1/tenants
// List active tenants for the authenticated user, or all tenants if called with API key
router.get('/', (req, res, next) => {
  // If API key is provided, bypass user auth
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === config.apiKey) {
    const db = getDb();
    const tenants = db.prepare("SELECT id, slug, display_name, plan, status, ha_namespace, created_at FROM tenants WHERE status = 'active'").all();
    return res.json({ tenants });
  }
  // Otherwise require JWT auth
  requireAuth(req, res, () => {
    const db = getDb();
    const tenants = db.prepare(`
      SELECT t.id, t.slug, t.display_name, t.plan, t.status, t.ha_namespace, t.created_at, m.role
      FROM tenants t
      JOIN memberships m ON m.tenant_id = t.id
      WHERE m.account_id = ? AND m.status = 'active' AND t.status = 'active'
    `).all(req.user.accountId);
    res.json({ tenants });
  });
});

// GET /internal/observers
// Cluster-internal endpoint queried by tb-bridge to get active channel mappings
router.get('/internal/observers', (req, res) => {
  const db = getDb();
  const observers = db.prepare(`
    SELECT slug, mg_workspace_id as workspaceId, mg_chan_telemetry as telemetryChannelId, mg_chan_commands as commandChannelId
    FROM tenants
    WHERE status = 'active' AND mg_chan_telemetry IS NOT NULL
  `).all();
  res.json({ observers });
});

module.exports = router;
