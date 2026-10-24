async function fetchJson(url, options = {}) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body, headers: res.headers };
}

function createInternalClient({ baseUrl, internalToken }) {
  async function request(path, options = {}) {
    return fetchJson(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'X-Internal-Token': internalToken,
        ...(options.headers || {}),
      },
    });
  }

  return {
    get: (path) => request(path, { method: 'GET' }),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (path) => request(path, { method: 'DELETE' }),
  };
}

module.exports = { fetchJson, createInternalClient };
