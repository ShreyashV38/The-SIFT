// ---------------------------------------------------------------------------
// CloudNest — ThingsBoard CE API Client
// ---------------------------------------------------------------------------
// Manages device registrations in ThingsBoard for platform-wide monitoring.
// FR-07: platform admins view telemetry in ThingsBoard
// The tb-bridge service (separate) forwards MQTT telemetry to TB.
// This client only handles device provisioning in TB.
// ---------------------------------------------------------------------------

const config = require('../config');
const logger = require('../logger');

let tbToken = null;
let tbTokenExpiry = 0;

async function fetchJson(path, options = {}) {
  const fetch = (await import('node-fetch')).default;
  const url = `${config.tbUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    const err = new Error(`ThingsBoard API ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function getTbToken() {
  if (tbToken && Date.now() < tbTokenExpiry) return tbToken;

  const body = await fetchJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: config.tbAdminEmail,
      password: config.tbAdminPassword,
    }),
  });

  tbToken = body.token;
  tbTokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  logger.info('ThingsBoard token refreshed');
  return tbToken;
}

// Create a device in ThingsBoard (for telemetry visualization)
async function createDevice(tenantSlug, deviceName) {
  const token = await getTbToken();
  const device = await fetchJson('/api/device', {
    method: 'POST',
    headers: { 'X-Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      name: `${tenantSlug}/${deviceName}`,
      type: 'cloudnest-iot',
      label: deviceName,
      additionalInfo: {
        description: `CloudNest tenant: ${tenantSlug}`,
      },
    }),
  });
  logger.info('ThingsBoard device created', { tenantSlug, deviceName, tbDeviceId: device.id?.id });
  return device;
}

// Get device credentials (access token) from ThingsBoard
async function getDeviceCredentials(tbDeviceId) {
  const token = await getTbToken();
  const creds = await fetchJson(`/api/device/${tbDeviceId}/credentials`, {
    headers: { 'X-Authorization': `Bearer ${token}` },
  });
  return creds;
}

// Delete a device from ThingsBoard
async function deleteDevice(tbDeviceId) {
  const token = await getTbToken();
  await fetchJson(`/api/device/${tbDeviceId}`, {
    method: 'DELETE',
    headers: { 'X-Authorization': `Bearer ${token}` },
  });
  logger.info('ThingsBoard device deleted', { tbDeviceId });
}

module.exports = { createDevice, getDeviceCredentials, deleteDevice };
