const path = require('path');
const { PLANS } = require('@sift/common');

module.exports = {
  serviceName: 'identity-service',
  port: parseInt(process.env.IDENTITY_PORT || process.env.PORT || '3001', 10),
  dbPath: process.env.DB_PATH || path.resolve(__dirname, '../../../data/cloudnest.db'),
  databaseUrl: process.env.DATABASE_URL || 'postgres://sift_identity:sift_identity@localhost:5432/sift_identity',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'change-me-to-a-random-string',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  internalToken: process.env.INTERNAL_TOKEN || 'sift-internal-secret-token',
  householdUrl: process.env.HOUSEHOLD_SERVICE_URL || 'http://localhost:3002',
  skipOtp: process.env.SKIP_OTP === 'true',
  emailUser: process.env.GMAIL_USER || 'nitollwaat@gmail.com',
  emailPass: process.env.GMAIL_APP_PASSWORD || 'ayqlzdpeubunibya',
  otpLength: 6,
  otpExpirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10),
  loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '30', 10),
  plans: PLANS,
};
