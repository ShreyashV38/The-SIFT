const crypto = require('crypto');
const config = require('../config');
const { createServiceLogger } = require('@sift/common');

const logger = createServiceLogger(config.serviceName);
let adminToken = null;
let tokenExpiry = 0;
let lastMode = 'unknown';

function syntheticFallback(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let parsedBody = {};
  if (options.body) {
    try { parsedBody = JSON.parse(options.body); } catch { /* ignore */ }
  }
  if (path.includes('/tokens/issue')) {
    return { access_token: 'dev-token-' + crypto.randomBytes(16).toString('hex') };
  }
  if (path === '/domains' && method === 'POST') {
    return {
      id: 'mg-domain-' + crypto.randomUUID().slice(0, 8),
      name: parsedBody.name || 'sift-tenant',
      alias: parsedBody.alias || 'tenant',
    };
  }
  if (path.includes('/channels') && method === 'POST' && !path.includes('/clients/')) {
    return { id: 'mg-chan-' + crypto.randomUUID().slice(0, 8), name: parsedBody.name || 'channel' };
  }
  if (path.includes('/clients') && method === 'POST' && !path.includes('/connect')) {
    const secret = 'sec_' + crypto.randomBytes(16).toString('hex');
    return {
      id: 'mg-dev-' + crypto.randomUUID().slice(0, 8),
      name: parsedBody.name || 'iot-device',
      secret,
      credentials: { secret },
    };
  }
  if (path.includes('/secret') && method === 'PATCH') {
    const secret = 'sec_' + crypto.randomBytes(16).toString('hex');
    return { secret, credentials: { secret } };
  }
  return { status: 'ok' };
}

async function fetchJson(path, options = {}) {
  const fetch = (await import('node-fetch')).default;
  const url = `${config.magistralaUrl}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      timeout: 3000,
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    if (!res.ok) {
      const err = new Error(`Magistrala API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    lastMode = 'live';
    return { data: body, mode: 'live' };
  } catch (err) {
    if (!config.allowSyntheticFallback) throw err;
    logger.warn('Magistrala unavailable — using synthetic fallback', {
      path,
      error: err.message,
    });
    lastMode = 'synthetic';
    return { data: syntheticFallback(path, options), mode: 'synthetic' };
  }
}

async function getAdminToken() {
  if (adminToken && Date.now() < tokenExpiry) return adminToken;
  const { data } = await fetchJson('/users/tokens/issue', {
    method: 'POST',
    body: JSON.stringify({
      identity: config.magistralaAdminEmail,
      secret: config.magistralaAdminPassword,
    }),
  });
  adminToken = data.access_token || 'dev-admin-token';
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  return adminToken;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createWorkspace(slug, displayName) {
  const token = await getAdminToken();
  const { data, mode } = await fetchJson('/domains', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      name: `sift-${slug}`,
      alias: slug,
      metadata: { sift_tenant: slug, displayName },
    }),
  });
  logger.info('Magistrala workspace created', { slug, workspaceId: data.id, mode });
  return { ...data, workspace: data, mode };
}

async function createChannel(workspaceId, name, metadata = {}) {
  const token = await getAdminToken();
  const { data, mode } = await fetchJson(`/domains/${workspaceId}/channels`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name, metadata }),
  });
  logger.info('Magistrala channel created', { name, channelId: data.id, mode });
  return { ...data, channel: data, mode };
}

async function createTenantChannels(workspaceId, slug) {
  const token = await getAdminToken();
  const tel = await fetchJson(`/domains/${workspaceId}/channels`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name: `${slug}-telemetry`, metadata: { type: 'telemetry', tenant: slug } }),
  });
  const cmd = await fetchJson(`/domains/${workspaceId}/channels`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name: `${slug}-commands`, metadata: { type: 'commands', tenant: slug } }),
  });
  return {
    telemetry: tel.data,
    commands: cmd.data,
    mode: tel.mode === 'synthetic' || cmd.mode === 'synthetic' ? 'synthetic' : 'live',
  };
}

async function createDevice(workspaceId, deviceName, metadata = {}) {
  const token = await getAdminToken();
  const { data, mode } = await fetchJson(`/domains/${workspaceId}/clients`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name: deviceName, metadata }),
  });
  logger.info('Magistrala device created', { deviceName, clientId: data.id, mode });
  return { ...data, device: data, mode };
}

async function connectDeviceToChannel(workspaceId, deviceId, channelId) {
  const token = await getAdminToken();
  await fetchJson(`/domains/${workspaceId}/channels/${channelId}/clients/${deviceId}/connect`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  logger.info('Device connected to channel', { deviceId, channelId });
}

async function rotateDeviceSecret(workspaceId, deviceId) {
  const token = await getAdminToken();
  const { data, mode } = await fetchJson(`/domains/${workspaceId}/clients/${deviceId}/secret`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  logger.info('Device secret rotated', { deviceId, mode });
  return { ...data, result: data, mode };
}

async function disableDevice(workspaceId, deviceId) {
  const token = await getAdminToken();
  await fetchJson(`/domains/${workspaceId}/clients/${deviceId}/disable`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  logger.info('Device disabled', { deviceId });
}

async function deleteWorkspace(workspaceId) {
  const token = await getAdminToken();
  await fetchJson(`/domains/${workspaceId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  logger.info('Magistrala workspace deleted', { workspaceId });
}

function getIntegrationStatus() {
  return {
    magistralaUrl: config.magistralaUrl,
    mode: lastMode,
    syntheticAllowed: config.allowSyntheticFallback,
    note: lastMode === 'synthetic'
      ? 'Operating in synthetic fallback — Magistrala is not live'
      : lastMode === 'live'
        ? 'Live Magistrala responses observed'
        : 'No Magistrala calls yet',
  };
}

module.exports = {
  createWorkspace,
  createChannel,
  createTenantChannels,
  createDevice,
  connectDeviceToChannel,
  rotateDeviceSecret,
  disableDevice,
  deleteWorkspace,
  getIntegrationStatus,
};
