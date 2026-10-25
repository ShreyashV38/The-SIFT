const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

function createPool(connectionString, logger) {
  const pool = new Pool({
    connectionString,
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    if (logger) {
      logger.error('Unexpected PostgreSQL pool error', { error: err.message });
    }
  });

  return pool;
}

async function migrate(pool, statements, logger) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const [id, sql] of statements) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
      if (existing.rowCount === 0) {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
        if (logger) logger.info('Applied migration', { id });
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ensureOutboxAndIdempotency(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_outbox (
      id UUID PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
      ON event_outbox (created_at) WHERE published_at IS NULL;

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id UUID PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'single' CHECK(plan IN ('single','family')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleting','deleted')),
      mg_workspace_id TEXT,
      mg_chan_telemetry TEXT,
      mg_chan_commands TEXT,
      ha_namespace TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS devices (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'simulator' CHECK(kind IN ('simulator','esp32','other','sensor','switch')),
      mg_client_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      first_connected_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      last_value_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_name_active
      ON devices(tenant_id, name) WHERE status != 'revoked';
  `);
}

let sqliteDb = null;
let sqliteDbPath = null;

function resolveDefaultDbPath() {
  if (process.env.DB_PATH) {
    return path.resolve(process.env.DB_PATH);
  }
  return path.resolve(__dirname, '../../../data/cloudnest.db');
}

function getDb(customPath, logger) {
  const targetPath = customPath ? path.resolve(customPath) : resolveDefaultDbPath();
  if (sqliteDb && sqliteDbPath === targetPath) {
    return sqliteDb;
  }

  const Database = require('better-sqlite3');
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  sqliteDb = new Database(targetPath);
  sqliteDbPath = targetPath;

  sqliteDb.pragma('busy_timeout = 10000');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.pragma('foreign_keys = ON');

  initSqliteSchema(sqliteDb, logger);
  if (logger) {
    logger.info('Database initialized', { path: targetPath });
  }
  return sqliteDb;
}

function initSqliteSchema(db, logger) {
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

    -- Devices: IoT devices belonging to tenants (FR-05, Phase 6C)
    CREATE TABLE IF NOT EXISTS devices (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id           INTEGER NOT NULL REFERENCES tenants(id),
      name                TEXT    NOT NULL,
      kind                TEXT    NOT NULL DEFAULT 'simulator' CHECK(kind IN ('simulator','esp32','other','sensor','switch')),
      mg_client_id        TEXT,
      status              TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      first_connected_at  TEXT,
      last_seen_at        TEXT,
      last_value_json     TEXT
    );

    -- Indexes and concurrency uniqueness guards
    CREATE INDEX IF NOT EXISTS idx_memberships_tenant  ON memberships(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_account ON memberships(account_id);
    CREATE INDEX IF NOT EXISTS idx_devices_tenant      ON devices(tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_name_active
      ON devices(tenant_id, name) WHERE status != 'revoked';

    -- OTP codes: email-based 2FA for login (FR-2FA)
    CREATE TABLE IF NOT EXISTS otp_codes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  INTEGER NOT NULL REFERENCES accounts(id),
      code        TEXT    NOT NULL,
      expires_at  TEXT    NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_otp_account ON otp_codes(account_id);
  `);

  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='devices'").get();
    if (tableSql && tableSql.sql && !tableSql.sql.includes('sensor')) {
      if (logger) logger.info('Migrating devices table schema to support sensor and switch kinds...');
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE devices_migration (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id           INTEGER NOT NULL REFERENCES tenants(id),
          name                TEXT    NOT NULL,
          kind                TEXT    NOT NULL DEFAULT 'simulator' CHECK(kind IN ('simulator','esp32','other','sensor','switch')),
          mg_client_id        TEXT,
          status              TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
          created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
          first_connected_at  TEXT,
          last_seen_at        TEXT,
          last_value_json     TEXT
        );
        INSERT INTO devices_migration (id, tenant_id, name, kind, mg_client_id, status, created_at)
          SELECT id, tenant_id, name, kind, mg_client_id, status, created_at FROM devices;
        DROP TABLE devices;
        ALTER TABLE devices_migration RENAME TO devices;
        CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
        DROP INDEX IF EXISTS idx_devices_tenant_name_active;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_name_active
          ON devices(tenant_id, name) WHERE status != 'revoked';
        PRAGMA foreign_keys = ON;
      `);
    } else {
      const tableInfo = db.prepare('PRAGMA table_info(devices)').all();
      const colNames = tableInfo.map((c) => c.name);
      if (!colNames.includes('first_connected_at')) {
        db.exec('ALTER TABLE devices ADD COLUMN first_connected_at TEXT');
      }
      if (!colNames.includes('last_value_json')) {
        db.exec('ALTER TABLE devices ADD COLUMN last_value_json TEXT');
      }
      const idxSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_devices_tenant_name_active'").get();
      if (!idxSql || !idxSql.sql || !idxSql.sql.includes('revoked')) {
        db.exec(`
          DROP INDEX IF EXISTS idx_devices_tenant_name_active;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_tenant_name_active
            ON devices(tenant_id, name) WHERE status != 'revoked';
        `);
      }
    }
  } catch (err) {
    if (logger) logger.warn('Migration warning on devices table', { error: err.message });
  }

  // Self-heal ephemeral otp_codes table or indexes if a prior force-kill / OneDrive sync left a malformed page
  try {
    db.prepare('SELECT count(*) FROM otp_codes').get();
  } catch (err) {
    if (logger) logger.warn('Rebuilding malformed otp_codes table', { error: err.message });
    try {
      db.exec(`
        DROP INDEX IF EXISTS idx_otp_account;
        DROP TABLE IF EXISTS otp_codes;
        CREATE TABLE IF NOT EXISTS otp_codes (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id  INTEGER NOT NULL REFERENCES accounts(id),
          code        TEXT    NOT NULL,
          expires_at  TEXT    NOT NULL,
          used        INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_otp_account ON otp_codes(account_id);
        REINDEX;
      `);
    } catch (healErr) {
      if (logger) logger.error('Failed to self-heal otp_codes table', { error: healErr.message });
    }
  }
}

module.exports = { createPool, migrate, ensureOutboxAndIdempotency, getDb };
