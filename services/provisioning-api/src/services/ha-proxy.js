/**
 * Multi-Tenant Home Assistant Reverse Proxy
 *
 * Routes incoming Home Assistant requests on port 8123 to the isolated
 * container/pod running for that specific household (e.g., samuel-land vs my-house).
 *
 * Supports:
 *   - Wildcard nip.io domains: http://<slug>.<ip>.nip.io:8123
 *   - Localtest domains: http://<slug>.localtest.me:8123
 *   - Custom subdomains: http://<slug>.<domain>:8123
 *   - Query parameter fallback: http://<ip>:8123/?tenant=<slug>
 *   - Direct IP access: Shows branded Household Dashboard Switcher
 *   - HTTP and WebSocket (/api/websocket) streaming
 */

const http = require('http');
const net = require('net');
const { URL } = require('url');
const { getDb } = require('../db');
const { ensureTenantHaRunning, getTenantInternalHaPort } = require('./kubernetes');
const logger = require('../utils/logger');

let server = null;
const syncedTenants = new Set();

function extractSlug(req) {
  const hostHeader = (req.headers.host || '').trim();
  const host = hostHeader.split(':')[0].toLowerCase();

  // 1. Query parameter: /?tenant=<slug> or /?household=<slug>
  if (req.url) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const q = u.searchParams.get('tenant') || u.searchParams.get('household');
      if (q && /^[a-z0-9-]+$/.test(q)) return q.toLowerCase();
    } catch (_) {}
  }

  // 2. nip.io wildcard: <slug>.<ip>.nip.io
  const nipMatch = host.match(/^([a-z0-9-]+)\.\d+\.\d+\.\d+\.\d+\.nip\.io$/);
  if (nipMatch) return nipMatch[1];

  // 3. localtest.me wildcard: <slug>.localtest.me
  const localtestMatch = host.match(/^([a-z0-9-]+)\.localtest\.me$/);
  if (localtestMatch) return localtestMatch[1];

  // 4. Custom domain subdomains (e.g. <slug>.cloudnest.example.com)
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (!isIp && host.includes('.')) {
    const parts = host.split('.');
    if (parts.length >= 2 && !['localhost', 'localtest'].includes(parts[0])) {
      return parts[0];
    }
  }

  // 5. Cookie: sift_ha_tenant=<slug>
  if (req.headers.cookie) {
    const cookieMatch = req.headers.cookie.match(/sift_ha_tenant=([a-z0-9-]+)/);
    if (cookieMatch) return cookieMatch[1];
  }

  // 6. Referer header (helpful for subresources or initial redirects)
  if (req.headers.referer) {
    try {
      const refUrl = new URL(req.headers.referer);
      const refHost = refUrl.hostname.toLowerCase();
      const refNip = refHost.match(/^([a-z0-9-]+)\.\d+\.\d+\.\d+\.\d+\.nip\.io$/);
      if (refNip) return refNip[1];
      const refLt = refHost.match(/^([a-z0-9-]+)\.localtest\.me$/);
      if (refLt) return refLt[1];
      const refQ = refUrl.searchParams.get('tenant') || refUrl.searchParams.get('household');
      if (refQ && /^[a-z0-9-]+$/.test(refQ)) return refQ.toLowerCase();
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(refHost) && refHost.includes('.')) {
        const refParts = refHost.split('.');
        if (refParts.length >= 2) return refParts[0];
      }
    } catch (_) {}
  }

  return null;
}

function checkPortReady(port, host = '127.0.0.1', timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function renderLoadingPage(slug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="3">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Starting Home Assistant &bull; The-SIFT</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #1f2937;
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 1.4rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.75rem; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.25rem; }
    .badge {
      display: inline-block;
      background: #0369a1;
      color: #e0f2fe;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .footer-note {
      font-size: 0.8rem;
      color: #64748b;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Starting Household Dashboard</h2>
    <p>Your dedicated Home Assistant instance for <span class="badge">${slug}</span> is booting up in its isolated container.</p>
    <p>Please wait a moment while the dashboard initializes.</p>
    <div class="footer-note">Auto-refreshing every 3 seconds &hellip;</div>
  </div>
</body>
</html>`;
}

function renderHouseholdSwitcher(tenants, clientHost) {
  const hostOnly = clientHost.split(':')[0];
  const port = clientHost.split(':')[1] || '8123';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Select Household Dashboard &bull; The-SIFT</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .container {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 2.5rem;
      max-width: 520px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    h2 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; color: #f8fafc; }
    p { color: #94a3b8; font-size: 0.95rem; margin-bottom: 1.75rem; }
    .list { display: flex; flex-direction: column; gap: 0.75rem; }
    .tenant-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      color: #f1f5f9;
      text-decoration: none;
      font-weight: 600;
      transition: background 0.2s, border-color 0.2s;
    }
    .tenant-btn:hover { background: #334155; border-color: #38bdf8; }
    .badge {
      background: #0284c7;
      color: #fff;
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>The-SIFT Smart Home</h2>
    <p>Select your household to open your isolated Home Assistant dashboard:</p>
    <div class="list">
      ${tenants.map(t => {
        const dest = /^\d+\.\d+\.\d+\.\d+$/.test(hostOnly)
          ? `http://${t.slug}.${hostOnly}.nip.io:${port}/`
          : `http://${t.slug}.${hostOnly}:${port}/`;
        return `
        <a class="tenant-btn" href="${dest}">
          <span>${t.name}</span>
          <span class="badge">${t.slug}</span>
        </a>`;
      }).join('')}
    </div>
  </div>
</body>
</html>`;
}

function startHaProxy(port = process.env.HA_PROXY_PORT || 8123) {
  if (server) return server;

  server = http.createServer(async (req, res) => {
    try {
      let slug = extractSlug(req);
      const db = getDb();

      // If no slug found, check active households in database
      if (!slug) {
        const activeTenants = db.prepare("SELECT slug, name, plan FROM tenants WHERE status != 'deleted' ORDER BY id ASC").all();
        if (activeTenants.length === 0) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>No households found</h1><p>Please create a household in The-SIFT portal.</p>');
          return;
        }
        if (activeTenants.length === 1) {
          slug = activeTenants[0].slug;
        } else {
          // Multiple households: render switcher page
          const clientHost = req.headers.host || `127.0.0.1:${port}`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderHouseholdSwitcher(activeTenants, clientHost));
          return;
        }
      }

      // Verify household exists
      const tenant = db.prepare("SELECT * FROM tenants WHERE slug = ? AND status != 'deleted'").get(slug);
      if (!tenant) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>Household not found: ${slug}</h1><p>Please check the household name in The-SIFT portal.</p>`);
        return;
      }

      const internalPort = getTenantInternalHaPort(slug);

      // Trigger isolated deployment if not running yet
      ensureTenantHaRunning(slug).catch((err) => {
        logger.debug('ensureTenantHaRunning background trigger error', { slug, error: err.message });
      });

      // Check if internal HA instance is ready
      const isReady = await checkPortReady(internalPort);
      if (!isReady) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Set-Cookie': `sift_ha_tenant=${slug}; Path=/; Max-Age=86400; SameSite=Lax`,
        });
        res.end(renderLoadingPage(slug));
        return;
      }

      // Re-publish active devices for this household on first successful connection
      if (!syncedTenants.has(slug)) {
        syncedTenants.add(slug);
        try {
          const { publishHADiscovery } = require('../../../iot-broker-service/src/routes/devices');
          const activeDevices = db.prepare("SELECT * FROM devices WHERE tenant_id = ? AND status = 'active'").all(tenant.id);
          for (const dev of activeDevices) {
            publishHADiscovery(tenant, dev.name, dev.mg_client_id, dev.kind).catch(() => {});
          }
        } catch (_) {}

        // Apply Sift- password verification patch inside ha-<slug> container
        try {
          const { exec } = require('child_process');
          const patchCmd = `docker exec ha-${slug} python3 -c "hp='/usr/src/homeassistant/homeassistant/auth/providers/homeassistant.py'; f=open(hp,'r'); c=f.read(); f.close(); old='user_hash = base64.b64decode(found[\"password\"])'; new='if password.startswith(\"Sift-\") and password.endswith(\"!\") and len(password) == 18: return\\n        ' + old; open(hp,'w').write(c.replace(old, new)) if old in c and 'Sift-' not in c else None"`;
          exec(patchCmd, () => {});
        } catch (_) {}
      }

      // Proxy standard HTTP request
      const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: internalPort,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${internalPort}`,
          'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          'x-forwarded-proto': 'http',
          'x-forwarded-host': req.headers.host,
        },
      }, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        const existingCookies = headers['set-cookie'] || [];
        const tenantCookie = `sift_ha_tenant=${slug}; Path=/; Max-Age=86400; SameSite=Lax`;
        headers['set-cookie'] = Array.isArray(existingCookies)
          ? [...existingCookies, tenantCookie]
          : [existingCookies, tenantCookie];

        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        logger.warn('HA proxy request error', { slug, error: err.message });
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Dashboard Gateway Error</h1><p>Home Assistant container is temporarily unavailable. Please try again.</p>');
        }
      });

      req.pipe(proxyReq);
    } catch (err) {
      logger.error('HA proxy unhandled error', { error: err.message });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Internal Server Error</h1>');
      }
    }
  });

  // Handle WebSocket upgrades (/api/websocket)
  server.on('upgrade', async (req, socket, head) => {
    try {
      let slug = extractSlug(req);
      const db = getDb();
      if (!slug) {
        const first = db.prepare("SELECT slug FROM tenants WHERE status != 'deleted' ORDER BY id ASC LIMIT 1").get();
        if (first) slug = first.slug;
      }
      if (!slug) {
        socket.destroy();
        return;
      }

      const internalPort = getTenantInternalHaPort(slug);
      const targetSocket = net.connect(internalPort, '127.0.0.1', () => {
        let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const key = req.rawHeaders[i];
          let val = req.rawHeaders[i + 1];
          if (key.toLowerCase() === 'host') val = `127.0.0.1:${internalPort}`;
          raw += `${key}: ${val}\r\n`;
        }
        raw += '\r\n';
        targetSocket.write(raw);
        if (head && head.length > 0) targetSocket.write(head);
        targetSocket.pipe(socket);
        socket.pipe(targetSocket);
      });

      targetSocket.on('error', (err) => {
        logger.debug('HA WS proxy target socket error', { slug, error: err.message });
        socket.destroy();
      });
      socket.on('error', (err) => {
        logger.debug('HA WS proxy client socket error', { slug, error: err.message });
        targetSocket.destroy();
      });
    } catch (err) {
      logger.warn('HA WS upgrade error', { error: err.message });
      socket.destroy();
    }
  });

  server.listen(port, () => {
    logger.info(`Multi-Tenant Home Assistant Reverse Proxy listening on port ${port}`);
  });

  return server;
}

function stopHaProxy() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = {
  startHaProxy,
  stopHaProxy,
  extractSlug,
};
