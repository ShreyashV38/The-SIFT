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
  await migrate(p, [
    ['001_accounts', `
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active','suspended','deleted')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS otp_codes (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        code TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_otp_account ON otp_codes(account_id);
    `],
  ], logger);
  await ensureOutboxAndIdempotency(p);
  return p;
}

module.exports = { getPool, initDb };
