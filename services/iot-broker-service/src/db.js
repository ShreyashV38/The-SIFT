const { createPool, migrate, ensureOutboxAndIdempotency, createServiceLogger } = require('@sift/common');
const config = require('./config');

const logger = createServiceLogger(config.serviceName);
let pool;

function getPool() {
  if (!pool) pool = createPool(config.databaseUrl, logger);
  return pool;
}

async function initDb() {
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_clients_workspace ON clients(workspace_id);
    `],
  ], logger);
  await ensureOutboxAndIdempotency(p);
  return p;
}

module.exports = { getPool, initDb };
