const { createLogger, format, transports } = require('winston');

function createServiceLogger(serviceName) {
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

  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
      redactSecrets(),
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.json()
    ),
    defaultMeta: { service: serviceName },
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
}

module.exports = { createServiceLogger };
