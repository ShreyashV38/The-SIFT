const path = require('path');
const { PLANS } = require('@sift/common');

module.exports = {
  serviceName: 'iot-broker-service',
  port: parseInt(process.env.IOT_BROKER_PORT || process.env.PORT || '3004', 10),
  dbPath: process.env.DB_PATH || path.resolve(__dirname, '../../../data/cloudnest.db'),
  databaseUrl: process.env.DATABASE_URL || 'postgres://sift_iot:sift_iot@localhost:5432/sift_iot',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  internalToken: process.env.INTERNAL_TOKEN || 'sift-internal-secret-token',
  jwtSecret: process.env.JWT_SECRET || 'change-me-to-a-random-string',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  magistralaUrl: process.env.MAGISTRALA_URL || 'http://magistrala-things.platform.svc.cluster.local',
  magistralaAdminEmail: process.env.MAGISTRALA_ADMIN_EMAIL || 'admin@sift.local',
  magistralaAdminPassword: process.env.MAGISTRALA_ADMIN_PASSWORD || 'change-me',
  tbUrl: process.env.TB_URL || 'http://thingsboard.observability.svc.cluster.local:8080',
  tbAdminEmail: process.env.TB_ADMIN_EMAIL || 'tenant@thingsboard.org',
  tbAdminPassword: process.env.TB_ADMIN_PASSWORD || 'change-me',
  tbGatewayToken: process.env.TB_GATEWAY_TOKEN || 'change-me',
  mqttUrl: process.env.MQTT_URL || 'mqtt://magistrala-mqtt.platform.svc.cluster.local:1883',
  mqttPublicHost: process.env.MQTT_PUBLIC_HOST || 'host.wokwi.internal',
  mqttPublicPort: parseInt(process.env.MQTT_PUBLIC_PORT || '1883', 10),
  offlineAfterSeconds: parseInt(process.env.OFFLINE_AFTER_SECONDS || '90', 10),
  plans: PLANS,
  allowSyntheticFallback: process.env.IOT_ALLOW_SYNTHETIC !== 'false',
};
