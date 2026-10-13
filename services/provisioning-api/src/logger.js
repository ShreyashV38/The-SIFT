// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Logger
// ---------------------------------------------------------------------------
// Winston-based structured logger. Redacts secrets from output (R7).
// ---------------------------------------------------------------------------

const { createLogger, format, transports } = require('winston');

// Redact sensitive fields from log output
const redactSecrets = format((info) => {
  const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization'];
  if (typeof info.message === 'string') {
    for (const key of sensitiveKeys) {
      const regex = new RegExp(`("${key}"\\s*:\\s*")[^"]*"`, 'gi');
      info.message = info.message.replace(regex, `$1[REDACTED]"`);
    }
  }
  return info;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    redactSecrets(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'provisioning-api' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, service, ...rest }) => {
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} [${service}] ${level}: ${message}${extra}`;
        })
      ),
    }),
  ],
});

module.exports = logger;
