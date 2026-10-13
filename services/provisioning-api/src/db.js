// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Database Setup (SQLite)
// ---------------------------------------------------------------------------
// Uses better-sqlite3 for synchronous, transactional SQLite access.
// Schema matches the ER diagram in HOW_IT_WORKS.md section 4b.
// Secrets (Magistrala client secrets, HA tokens) are stored ONLY in
// Kubernetes Secrets — never in this database (decision D16).
// ---------------------------------------------------------------------------

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');

let db;

function getDb() {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  // Foreign keys must be explicitly enabled in SQLite
  db.pragma('foreign_keys = ON');

  initSchema();
  logger.info('Database initialized', { path: config.dbPath });
  return db;
}

function initSchema() {
  db.exec(`
    -- Accounts: platform users (FR-11)
    CREATE TABLE IF NOT EXISTS accounts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Tenants: household accounts (FR-01)
    CREATE TABLE IF NOT EXISTS tenants (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      slug              TEXT    NOT NULL UNIQUE,
      display_name      TEXT    NOT NULL,
      plan              TEXT    NOT NULL DEFAULT 'single' CHECK(plan IN ('single','family')),
      status            TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleting','deleted')),
      mg_workspace_id   TEXT,
      mg_chan_telemetry  TEXT,
      mg_chan_commands   TEXT,
      ha_namespace       TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      deleted_at        TEXT
    );

    -- Memberships: links accounts to tenants with roles (FR-13)
    CREATE TABLE IF NOT EXISTS memberships (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
      account_id  INTEGER NOT NULL REFERENCES accounts(id),
      role        TEXT    NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
      status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','removed')),
      joined_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, account_id)
    );

    -- Devices: IoT devices belonging to tenants (FR-05)
    CREATE TABLE IF NOT EXISTS devices (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id       INTEGER NOT NULL REFERENCES tenants(id),
      name            TEXT    NOT NULL,
      kind            TEXT    NOT NULL DEFAULT 'simulator' CHECK(kind IN ('simulator','esp32','other')),
      mg_client_id    TEXT,
      status          TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      last_seen_at    TEXT
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_memberships_tenant  ON memberships(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_account ON memberships(account_id);
    CREATE INDEX IF NOT EXISTS idx_devices_tenant      ON devices(tenant_id);
  `);
}

module.exports = { getDb };
