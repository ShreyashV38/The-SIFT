// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Database Setup (Delegates to @sift/common)
// ---------------------------------------------------------------------------

const { getDb: getSharedDb } = require('@sift/common');
const config = require('./config');
const logger = require('./logger');

function getDb() {
  return getSharedDb(config.dbPath || undefined, logger);
}

module.exports = { getDb };
