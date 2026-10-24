// ---------------------------------------------------------------------------
// SIFT Tenant Portal — API Client (Phase 6C)
// ---------------------------------------------------------------------------
// Features:
// - Automatic CSRF header injection (X-SIFT-CSRF: 1) on state-changing requests
// - httpOnly cookie session support (credentials: 'same-origin')
// - Unified error normalization matching BRD & Phase 6C contract
// ---------------------------------------------------------------------------

let cachedConfig = null;

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  // State-changing requests must send X-SIFT-CSRF: 1 and JSON content-type (P5 / Section 5)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-SIFT-CSRF'] = '1';
    if (!headers['Content-Type'] && options.body) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const fetchOptions = {
    ...options,
    method,
    headers,
    credentials: 'same-origin', // Sends sift_session cookie
  };

  let res;
  try {
    res = await fetch(path, fetchOptions);
  } catch (netErr) {
    throw {
      code: 'NETWORK_ERROR',
      message: 'Failed to connect to the server. Please check your network or server status.',
      status: 0,
    };
  }

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    let errorCode = 'API_ERROR';
    let errorMessage = `Request failed with status ${res.status}`;
    let errorDetails = {};

    if (data && typeof data === 'object') {
      if (data.error && typeof data.error === 'object') {
        errorCode = data.error.code || errorCode;
        errorMessage = data.error.message || errorMessage;
        errorDetails = data.error.details || {};
      } else if (typeof data.error === 'string') {
        errorMessage = data.error;
      }
    }

    const err = new Error(errorMessage);
    err.code = errorCode;
    err.status = res.status;
    err.details = errorDetails;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),

  // Configuration
  async getConfig() {
    if (!cachedConfig) {
      cachedConfig = await this.get('/v1/config');
    }
    return cachedConfig;
  },

  // Auth & Session
  async getMe() {
    return this.get('/v1/me');
  },

  async register(email, displayName, password) {
    return this.post('/v1/auth/register', { email, displayName, password });
  },

  async login(email, password) {
    return this.post('/v1/auth/login', { email, password });
  },

  async logout() {
    return this.post('/v1/auth/logout', {});
  },

  // Tenants
  async getTenant(slug) {
    return this.get(`/v1/tenants/${encodeURIComponent(slug)}`);
  },

  async createTenant(slug, displayName, plan) {
    return this.post('/v1/tenants', { slug, displayName, plan });
  },

  async deleteTenant(slug) {
    return this.delete(`/v1/tenants/${encodeURIComponent(slug)}`);
  },

  async getHaAccess(slug) {
    return this.get(`/v1/tenants/${encodeURIComponent(slug)}/ha-access`);
  },

  async updatePlan(slug, plan) {
    return this.patch(`/v1/tenants/${encodeURIComponent(slug)}/plan`, { plan });
  },

  // Devices
  async getDevices(slug) {
    return this.get(`/v1/tenants/${encodeURIComponent(slug)}/devices`);
  },

  async getDeviceStatus(slug, deviceId) {
    return this.get(`/v1/tenants/${encodeURIComponent(slug)}/devices/${deviceId}/status`);
  },

  async createDevice(slug, name, kind) {
    return this.post(`/v1/tenants/${encodeURIComponent(slug)}/devices`, { name, kind });
  },

  async rotateDeviceSecret(slug, deviceId) {
    return this.post(`/v1/tenants/${encodeURIComponent(slug)}/devices/${deviceId}/rotate-secret`, {});
  },

  async revokeDevice(slug, deviceId) {
    return this.delete(`/v1/tenants/${encodeURIComponent(slug)}/devices/${deviceId}`);
  },

  async sendTestCommand(slug, deviceId, state) {
    return this.post(`/v1/tenants/${encodeURIComponent(slug)}/devices/${deviceId}/test-command`, { state });
  },

  // Members
  async getMembers(slug) {
    return this.get(`/v1/tenants/${encodeURIComponent(slug)}/members`);
  },

  async addMember(slug, email, role) {
    return this.post(`/v1/tenants/${encodeURIComponent(slug)}/members`, { email, role });
  },

  async updateMemberRole(slug, memberId, role) {
    return this.patch(`/v1/tenants/${encodeURIComponent(slug)}/members/${memberId}`, { role });
  },

  async removeMember(slug, memberId) {
    return this.delete(`/v1/tenants/${encodeURIComponent(slug)}/members/${memberId}`);
  },
};
