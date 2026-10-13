// ---------------------------------------------------------------------------
// CloudNest Provisioning API — Configuration
// ---------------------------------------------------------------------------
// Reads from environment variables with sensible defaults for local dev.
// Secrets must come from env vars (K8s Secrets in production).
// ---------------------------------------------------------------------------

const config = {
  // Server
  port: parseInt(process.env.PROVISIONING_API_PORT || '3000', 10),

  // Platform API key — used for admin-level operations (tenant creation)
  apiKey: process.env.PROVISIONING_API_KEY || 'change-me-to-a-random-string',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'change-me-to-a-random-string',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',

  // SQLite database path
  dbPath: process.env.DB_PATH || './data/cloudnest.db',

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

  // Home Assistant
  haImageTag: process.env.HA_IMAGE_TAG || '2025.1.0',

  // Domain
  domain: process.env.DOMAIN || 'localtest.me',

  // Plan limits (can be overridden via env)
  plans: {
    single: { seats: 1, devices: 10 },
    family: { seats: 6, devices: 30 },
  },

  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),   // 15 min
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  loginRateLimitMaxRequests: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
};

module.exports = config;
