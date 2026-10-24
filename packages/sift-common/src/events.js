const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const STREAM_KEY = process.env.EVENT_STREAM_KEY || 'sift.events';

function createEventBus({ redisUrl, serviceName, logger, pool }) {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  let publisherRunning = false;
  let consumerRunning = false;
  let consumerHandlers = new Map();

  async function connect() {
    if (redis.status === 'wait' || redis.status === 'end') {
      await redis.connect();
    }
  }

  async function enqueue(client, eventType, payload, eventId = uuidv4()) {
    const q = client || pool;
    await q.query(
      `INSERT INTO event_outbox (id, event_type, payload) VALUES ($1, $2, $3)`,
      [eventId, eventType, JSON.stringify(payload)]
    );
    return eventId;
  }

  async function publishPending() {
    const { rows } = await pool.query(
      `SELECT id, event_type, payload, attempts
       FROM event_outbox
       WHERE published_at IS NULL AND attempts < 20
       ORDER BY created_at ASC
       LIMIT 50`
    );

    for (const row of rows) {
      try {
        await redis.xadd(
          STREAM_KEY,
          '*',
          'eventId', row.id,
          'eventType', row.event_type,
          'payload', typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload),
          'source', serviceName,
          'ts', new Date().toISOString()
        );
        await pool.query(
          `UPDATE event_outbox SET published_at = NOW(), last_error = NULL WHERE id = $1`,
          [row.id]
        );
      } catch (err) {
        await pool.query(
          `UPDATE event_outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1`,
          [row.id, err.message]
        );
        logger.warn('Failed to publish outbox event', {
          eventId: row.id,
          eventType: row.event_type,
          error: err.message,
        });
      }
    }
  }

  function startPublisher(intervalMs = 1000) {
    if (publisherRunning) return;
    publisherRunning = true;
    const tick = async () => {
      if (!publisherRunning) return;
      try {
        await publishPending();
      } catch (err) {
        logger.warn('Outbox publisher tick failed', { error: err.message });
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  }

  async function ensureGroup(group) {
    try {
      await redis.xgroup('CREATE', STREAM_KEY, group, '0', 'MKSTREAM');
    } catch (err) {
      if (!String(err.message).includes('BUSYGROUP')) throw err;
    }
  }

  function on(eventType, handler) {
    if (!consumerHandlers.has(eventType)) consumerHandlers.set(eventType, []);
    consumerHandlers.get(eventType).push(handler);
  }

  async function processMessage(group, id, fields) {
    const map = {};
    for (let i = 0; i < fields.length; i += 2) map[fields[i]] = fields[i + 1];

    const eventId = map.eventId;
    const eventType = map.eventType;
    let payload = {};
    try {
      payload = JSON.parse(map.payload || '{}');
    } catch {
      payload = {};
    }

    const already = await pool.query('SELECT 1 FROM processed_events WHERE event_id = $1', [eventId]);
    if (already.rowCount > 0) {
      await redis.xack(STREAM_KEY, group, id);
      return;
    }

    const handlers = consumerHandlers.get(eventType) || [];
    const wildcards = consumerHandlers.get('*') || [];
    for (const handler of [...handlers, ...wildcards]) {
      await handler({ eventId, eventType, payload, source: map.source });
    }

    await pool.query(
      `INSERT INTO processed_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [eventId, eventType]
    );
    await redis.xack(STREAM_KEY, group, id);
  }

  function startConsumer(group, intervalMs = 1000) {
    if (consumerRunning) return;
    consumerRunning = true;
    const consumer = `${serviceName}-${process.pid}`;

    const tick = async () => {
      if (!consumerRunning) return;
      try {
        await ensureGroup(group);
        const results = await redis.xreadgroup(
          'GROUP', group, consumer,
          'COUNT', 20,
          'BLOCK', 500,
          'STREAMS', STREAM_KEY, '>'
        );
        if (results) {
          for (const [, messages] of results) {
            for (const [id, fields] of messages) {
              try {
                await processMessage(group, id, fields);
              } catch (err) {
                logger.error('Event handler failed', {
                  id,
                  error: err.message,
                });
              }
            }
          }
        }
      } catch (err) {
        if (!String(err.message).includes('Connection is closed')) {
          logger.warn('Event consumer tick failed', { error: err.message });
        }
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  }

  async function close() {
    publisherRunning = false;
    consumerRunning = false;
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }

  return {
    connect,
    enqueue,
    startPublisher,
    startConsumer,
    on,
    close,
    redis,
    STREAM_KEY,
  };
}

module.exports = { createEventBus, STREAM_KEY };
