const { createPool, migrate, ensureOutboxAndIdempotency, getDb: getSharedDb, createServiceLogger } = require('@sift/common');
const config = require('./config');

const logger = createServiceLogger(config.serviceName);
let pool;

function getDb() {
  return getSharedDb(config.dbPath || undefined, logger);
}

function getPool() {
  if (!pool) pool = createPool(config.databaseUrl, logger);
  return pool;
}

async function initDb() {
  if (process.env.USE_POSTGRES === 'true') {
    const p = getPool();
    await p.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await migrate(p, [
      ['001_iot', `
        CREATE TABLE IF NOT EXISTS workspaces (
          id SERIAL PRIMARY KEY,
          tenant_slug TEXT NOT NULL UNIQUE,
          mg_workspace_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          mode TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live','synthetic')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS channels (
          id SERIAL PRIMARY KEY,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
          kind TEXT NOT NULL CHECK (kind IN ('telemetry','commands')),
          mg_channel_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(workspace_id, kind)
        );
        CREATE TABLE IF NOT EXISTS clients (
          id SERIAL PRIMARY KEY,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
          name TEXT NOT NULL,
          mg_client_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
          mode TEXT NOT NULL DEFAULT 'live',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(workspace_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_clients_workspace ON clients(workspace_id);
        CREATE TABLE IF NOT EXISTS devices (
          id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'simulator' CHECK (kind IN ('simulator','esp32','other','sensor','switch')),
          mg_client_id TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          first_connected_at TIMESTAMPTZ,
          last_seen_at TIMESTAMPTZ,
          last_value_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_name_active
          ON devices(tenant_id, name) WHERE status != 'revoked';
      `],
    ], logger);
    await ensureOutboxAndIdempotency(p);
    return p;
  }
  return getDb();
}

module.exports = { getDb, getPool, initDb };
