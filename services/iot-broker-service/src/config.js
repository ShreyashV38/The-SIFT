module.exports = {
  serviceName: 'iot-broker-service',
  port: parseInt(process.env.PORT || '3004', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://sift_iot:sift_iot@localhost:5432/sift_iot',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  internalToken: process.env.INTERNAL_TOKEN || 'sift-internal-secret-token',
  jwtSecret: process.env.JWT_SECRET || 'change-me-to-a-random-string',
  magistralaUrl: process.env.MAGISTRALA_URL || 'http://localhost:9000',
  magistralaAdminEmail: process.env.MAGISTRALA_ADMIN_EMAIL || 'admin@sift.local',
  magistralaAdminPassword: process.env.MAGISTRALA_ADMIN_PASSWORD || 'change-me',
  allowSyntheticFallback: process.env.IOT_ALLOW_SYNTHETIC !== 'false',
};
