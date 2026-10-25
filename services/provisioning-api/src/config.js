// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Configuration
// ---------------------------------------------------------------------------
// Reads from environment variables with sensible defaults for local dev.
// Secrets must come from env vars (K8s Secrets in production).
// ---------------------------------------------------------------------------

const path = require('path');

const config = {
  // Server
  port: parseInt(process.env.PROVISIONING_API_PORT || '3000', 10),

  // Platform API key — used for admin-level operations (tenant creation)
  apiKey: process.env.PROVISIONING_API_KEY || 'change-me-to-a-random-string',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'change-me-to-a-random-string',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  // SQLite database path & PostgreSQL connection string
  dbPath: process.env.DB_PATH || path.resolve(__dirname, '../../../data/cloudnest.db'),
  databaseUrl: process.env.DATABASE_URL || '',

  // Microservice URLs (Kubernetes DNS defaults)
  identityServiceUrl: process.env.IDENTITY_SERVICE_URL || 'http://sift-identity-service:3001',
  iotBrokerServiceUrl: process.env.IOT_BROKER_SERVICE_URL || 'http://sift-iot-broker-service:3004',

  // Magistrala
  magistralaUrl: process.env.MAGISTRALA_URL || 'http://magistrala-things.platform.svc.cluster.local',
  magistralaAdminEmail: process.env.MAGISTRALA_ADMIN_EMAIL || 'admin@cloudnest.local',
  magistralaAdminPassword: process.env.MAGISTRALA_ADMIN_PASSWORD || 'change-me',

  // ThingsBoard
  tbUrl: process.env.TB_URL || 'http://thingsboard.observability.svc.cluster.local:8080',
  tbAdminEmail: process.env.TB_ADMIN_EMAIL || 'tenant@thingsboard.org',
  tbAdminPassword: process.env.TB_ADMIN_PASSWORD || 'change-me',
  tbGatewayToken: process.env.TB_GATEWAY_TOKEN || 'change-me',

  // MQTT (Magistrala FluxMQ)
  mqttUrl: process.env.MQTT_URL || 'mqtt://magistrala-mqtt.platform.svc.cluster.local:1883',

  // MQTT public host — returned in device credentials for ESP32 / Wokwi
  // Defaults to host.wokwi.internal for Wokwi VS Code extension; use 127.0.0.1 for local CLI
  mqttPublicHost: process.env.MQTT_PUBLIC_HOST || 'host.wokwi.internal',
  mqttPublicPort: parseInt(process.env.MQTT_PUBLIC_PORT || '1883', 10),

  // Home Assistant — pre-seeded credentials (bypasses onboarding wizard)
  haUsername: process.env.HA_USERNAME || 'admin',
  haPassword: process.env.HA_PASSWORD || 'CloudNest2026!',

  // Home Assistant
  haImageTag: process.env.HA_IMAGE_TAG || '2025.1.0',

  // Domain
  domain: process.env.DOMAIN || 'localtest.me',

  // Plan limits (can be overridden via env)
  plans: {
    single: { seats: 1, devices: 10 },
    family: { seats: 6, devices: 30 },
  },

  // Internal server port & token (Phase 6C: port 8081 for tb-bridge)
  internalPort: parseInt(process.env.INTERNAL_PORT || '8081', 10),
  internalToken: process.env.INTERNAL_TOKEN || 'sift-internal-secret-token',

  // Cookie security setting (false for plain HTTP localtest.me, true in prod)
  cookieSecure: process.env.COOKIE_SECURE === 'true',

  // Device status offline threshold in seconds
  offlineAfterSeconds: parseInt(process.env.OFFLINE_AFTER_SECONDS || '90', 10),

  // Email / Gmail SMTP (Nodemailer)
  emailUser: process.env.GMAIL_USER || 'nitollwaat@gmail.com',
  emailPass: process.env.GMAIL_APP_PASSWORD || 'ayqlzdpeubunibya',

  // OTP (Email 2FA)
  otpLength: 6,
  otpExpirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10), // 5 minutes

  // Reserved slugs that cannot be used for tenant households
  reservedSlugs: ['app', 'portal', 'www', 'admin', 'api', 'platform', 'observability', 'magistrala', 'thingsboard'],

  // Rate limiting (generous in development, customizable via env)
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),   // 15 min
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  loginRateLimitMaxRequests: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '30', 10),
};

const crypto = require('crypto');

config.getTenantHaPassword = function getTenantHaPassword(slug) {
  const hmac = crypto
    .createHmac('sha256', `${config.jwtSecret}:ha-tenant-auth`)
    .update(String(slug).trim().toLowerCase())
    .digest('base64url')
    .slice(0, 12);
  return `Sift-${hmac}!`;
};

module.exports = config;
