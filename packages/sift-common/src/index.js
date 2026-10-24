const { createServiceLogger } = require('./logger');
const { createAuth, safeCompare, parseCookies } = require('./auth');
const { createPool, migrate, ensureOutboxAndIdempotency } = require('./db');
const { createEventBus, STREAM_KEY } = require('./events');
const { fetchJson, createInternalClient } = require('./http');

const PLANS = {
  single: { seats: 1, devices: 10 },
  family: { seats: 6, devices: 30 },
};

const ROLE_RANK = { owner: 3, admin: 2, member: 1 };

module.exports = {
  createServiceLogger,
  createAuth,
  safeCompare,
  parseCookies,
  createPool,
  migrate,
  ensureOutboxAndIdempotency,
  createEventBus,
  STREAM_KEY,
  fetchJson,
  createInternalClient,
  PLANS,
  ROLE_RANK,
};
