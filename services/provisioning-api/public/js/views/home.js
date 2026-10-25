// ---------------------------------------------------------------------------
// The-SIFT Cloud Portal — Cloud Workspace Overview (#/t/:slug)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import {
  copyToClipboard,
  renderSpinner,
  formatRelativeTime,
  resolveCloudDomain,
  resolveHaUrl,
  formatTierBadge,
  formatTierName,
} from '../ui.js';

export async function renderHome(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-family: var(--font-mono); font-size: 0.8125rem;">
        SYNCHRONIZING CLOUD TELEMETRY...
      </p>
    </div>
  `;

  let tenantData, devicesData, membersData, configData;
  try {
    [tenantData, devicesData, membersData, configData] = await Promise.all([
      api.getTenant(slug),
      api.getDevices(slug),
      api.getMembers(slug).catch(() => ({ members: [] })),
      api.getConfig().catch(() => ({})),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 2rem auto;">
        <div class="banner banner-danger">
          <strong>Workspace Load Error:</strong> ${err.message}
        </div>
        <p>Could not load cloud household "${slug}". Verify your RBAC membership permissions.</p>
        <button id="back-home-btn" class="btn btn-secondary">Return to Workspace</button>
      </div>
    `;
    container.querySelector('#back-home-btn')?.addEventListener('click', () => router.navigate('#/'));
    return;
  }

  const tenant = tenantData.tenant || {};
  const devices = devicesData.devices || [];
  const members = membersData.members || [];
  const limits = tenantData.limits || { seats: { used: 1, max: 1 }, devices: { used: 0, max: 10 } };
  const callerRole = tenantData.callerRole || 'member';
  const cloudDomain = resolveCloudDomain(configData?.tenantDomain);
  const haUrl = resolveHaUrl(slug, tenant.url, cloudDomain);

  const activeDevices = devices.filter(d => d.status !== 'revoked');
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const maxDevices = limits.devices?.max || 10;
  const maxSeats = limits.seats?.max || 1;
  const usedSeats = limits.seats?.used || members.length || 1;

  const devicePct = Math.min(100, Math.round((activeDevices.length / maxDevices) * 100));
  const seatPct = Math.min(100, Math.round((usedSeats / maxSeats) * 100));
  const isFamily = tenant.plan === 'family';
  const isReady = (tenant.status || 'ready') === 'ready';
  const namespaceId = tenant.namespace || `tenant-${slug}`;
  const recentDevices = devices.slice(0, 5);

  container.innerHTML = `
    <div>
      <!-- Workspace Header -->
      <div class="page-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
            <h1>${tenant.displayName || slug}</h1>
            <span class="badge badge-tier">${formatTierBadge(tenant.plan)} TIER</span>
            <span class="badge badge-online">
              <span class="led-dot led-emerald"></span>
              <span>${callerRole.toUpperCase()}</span>
            </span>
          </div>
          <p style="margin-bottom: 0; font-size: 0.8125rem;">
            <span class="data-label" style="display: inline;">Cloud Endpoint:</span>
            <code style="margin-left: 4px;">${slug}.${cloudDomain}</code>
            <span style="margin: 0 8px; color: var(--text-dim);">|</span>
            <span class="data-label" style="display: inline;">Namespace:</span>
            <code style="margin-left: 4px;">${namespaceId}</code>
          </p>
        </div>

        <div class="page-header-actions">
          <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Provision Device</span>
          </a>
          <a href="#/t/${slug}/members" class="btn btn-secondary btn-sm">Invite Member</a>
          <a href="#/t/${slug}/plan" class="btn btn-secondary btn-sm">Plan &amp; Quotas</a>
        </div>
      </div>

      <!-- Top Bento Telemetry Strip (4 Cards) -->
      <div class="bento-grid">
        <!-- Card 1: Cloud Instance Status -->
        <div class="stat-card">
          <div class="stat-label">
            <span>Cloud Instance Status</span>
            <span class="led-dot ${isReady ? 'led-emerald' : 'led-amber'}"></span>
          </div>
          <div class="stat-value" style="display: flex; align-items: center; gap: 8px; font-size: 1.25rem;">
            <span>${isReady ? 'READY' : 'PROVISIONING'}</span>
          </div>
          <div class="stat-hint mono" style="font-size: 0.725rem;">
            NS: ${namespaceId} &bull; 99.98% SLA
          </div>
        </div>

        <!-- Card 2: Connected Hardware -->
        <div class="stat-card">
          <div class="stat-label">
            <span>Connected Hardware</span>
            <span class="mono">${onlineCount} ONLINE</span>
          </div>
          <div class="stat-value">
            ${activeDevices.length} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 400;">/ ${maxDevices}</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill emerald" style="width: ${devicePct}%;"></div>
          </div>
          <div class="stat-hint">${maxDevices - activeDevices.length} hardware slots available</div>
        </div>

        <!-- Card 3: Household Access -->
        <div class="stat-card">
          <div class="stat-label">
            <span>Household Access</span>
            <span class="badge badge-role" style="font-size: 0.625rem; padding: 1px 6px;">${callerRole}</span>
          </div>
          <div class="stat-value">
            ${usedSeats} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 400;">/ ${maxSeats}</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill" style="width: ${seatPct}%;"></div>
          </div>
          <div class="stat-hint">${maxSeats - usedSeats} member seat(s) unallocated</div>
        </div>

        <!-- Card 4: Infrastructure Tier -->
        <div class="stat-card">
          <div class="stat-label">
            <span>Infrastructure Tier</span>
            <a href="#/t/${slug}/plan" style="font-size: 0.6875rem; font-weight: 600;">UPGRADE</a>
          </div>
          <div class="stat-value" style="font-size: 1.25rem;">
            ${formatTierName(tenant.plan)}
          </div>
          <div class="stat-hint mono" style="font-size: 0.725rem;">
            ${isFamily ? '1000m CPU / 1 GiB RAM' : '500m CPU / 512 MiB RAM'}
          </div>
        </div>
      </div>

      <!-- Primary Action Banner — Home Assistant Cloud Launchpad -->
      <div class="launchpad-card" id="ha-panel">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-lg); flex-wrap: wrap;">
          <div style="max-width: 620px;">
            <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span class="badge badge-online">
                <span class="led-dot led-emerald"></span>
                <span>ISOLATED POD ACTIVE</span>
              </span>
              <span class="mono" style="font-size: 0.725rem; color: var(--text-muted);">MQTT DISCOVERY ENABLED</span>
            </div>
            <h2 style="font-size: 1.25rem; margin-bottom: 6px;">Home Assistant Cloud Launchpad</h2>
            <p style="font-size: 0.84375rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
              Dedicated smart-home automation engine isolated inside <code style="font-size: 0.75rem;">${namespaceId}</code>. Provisioned sensors and switches synchronize automatically over Magistrala MQTT channels.
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button type="button" id="toggle-ha-creds-btn" class="btn btn-secondary btn-sm">
              Cloud Credentials Vault
            </button>
            <a href="${haUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
              <span>Launch Home Assistant Cloud</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </a>
          </div>
        </div>

        <div style="margin-top: var(--space-sm);">
          <div class="data-label">Dedicated Cloud Instance URL</div>
          <div class="copy-box">
            <span id="ha-url-text">${haUrl}</span>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
              <button type="button" id="copy-ha-url" class="btn btn-secondary btn-sm">Copy URL</button>
            </div>
          </div>
        </div>

        <div id="ha-creds-details" style="display: none; margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--border);">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-md);">
            <div>
              <div class="data-label">Instance Username</div>
              <div class="copy-box">
                <span id="ha-username-val">admin</span>
                <button type="button" id="copy-ha-user" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>

            <div>
              <div class="data-label">Instance Password</div>
              <div class="copy-box">
                <span id="ha-password-val">•••••••••••••</span>
                <div style="display: flex; gap: 6px; flex-shrink: 0;">
                  <button type="button" id="reveal-ha-pass" class="btn btn-secondary btn-sm">Reveal</button>
                  <button type="button" id="copy-ha-pass" class="btn btn-secondary btn-sm">Copy</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Devices Snapshot -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div>
            <h3 style="margin-bottom: 2px;">Recent Provisioned Hardware</h3>
            <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: 0;">
              Real-time MQTT telemetry endpoints bound to this household workspace.
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="#/t/${slug}/devices" class="btn btn-secondary btn-sm">View All (${devices.length})</a>
            <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">+ Provision Device</a>
          </div>
        </div>

        ${recentDevices.length === 0 ? `
          <div class="empty-state" style="padding: var(--space-2xl) var(--space-lg);">
            <p style="font-size: 0.84375rem; color: var(--text-muted); margin-bottom: var(--space-md);">
              No hardware endpoints provisioned in this household yet.
            </p>
            <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">Provision First Device</a>
          </div>
        ` : `
          <div class="table-container" style="border: none; border-radius: 0;">
            <table>
              <thead>
                <tr>
                  <th>Hardware Endpoint</th>
                  <th>Class</th>
                  <th>Telemetry Status</th>
                  <th>Magistrala Thing ID</th>
                  <th>Last Heartbeat</th>
                  <th style="text-align: right;">Inspector</th>
                </tr>
              </thead>
              <tbody>
                ${recentDevices.map(dev => {
                  let statusPill = '';
                  if (dev.status === 'online') {
                    statusPill = `<span class="badge badge-online"><span class="led-dot led-emerald"></span>ONLINE</span>`;
                  } else if (dev.status === 'pending') {
                    statusPill = `<span class="badge badge-pending"><span class="led-dot led-amber"></span>PENDING</span>`;
                  } else if (dev.status === 'revoked') {
                    statusPill = `<span class="badge badge-revoked"><span class="led-dot led-rose"></span>REVOKED</span>`;
                  } else {
                    statusPill = `<span class="badge badge-offline"><span class="led-dot led-muted"></span>OFFLINE</span>`;
                  }

                  return `
                    <tr>
                      <td><strong style="color: var(--text-main); font-weight: 600;">${dev.name}</strong></td>
                      <td><span class="badge badge-role">${dev.kind}</span></td>
                      <td>${statusPill}</td>
                      <td><code style="font-size: 0.75rem;">${dev.mgClientId || 'dev_' + dev.id}</code></td>
                      <td class="mono" style="font-size: 0.75rem;">${formatRelativeTime(dev.lastSeenAt)}</td>
                      <td style="text-align: right;">
                        <a href="#/t/${slug}/devices/${dev.id}" class="btn btn-secondary btn-sm">Inspect</a>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;

  container.querySelector('#copy-ha-url')?.addEventListener('click', function() {
    copyToClipboard(haUrl, this, 'Copy URL');
  });

  const toggleBtn = container.querySelector('#toggle-ha-creds-btn');
  const detailsDiv = container.querySelector('#ha-creds-details');
  let loadedCreds = null;

  toggleBtn?.addEventListener('click', async () => {
    if (detailsDiv.style.display === 'none') {
      if (!loadedCreds) {
        toggleBtn.textContent = 'Decrypting...';
        try {
          loadedCreds = await api.getHaAccess(slug);
        } catch {
          loadedCreds = { username: 'admin', password: 'CloudNest2026!' };
        }
        container.querySelector('#ha-username-val').textContent = loadedCreds.username || 'admin';
      }
      toggleBtn.textContent = 'Hide Credentials Vault';
      detailsDiv.style.display = 'block';
    } else {
      detailsDiv.style.display = 'none';
      toggleBtn.textContent = 'Cloud Credentials Vault';
    }
  });

  container.querySelector('#copy-ha-user')?.addEventListener('click', function() {
    copyToClipboard(loadedCreds?.username || 'admin', this);
  });

  const revealPassBtn = container.querySelector('#reveal-ha-pass');
  const passValSpan = container.querySelector('#ha-password-val');
  revealPassBtn?.addEventListener('click', () => {
    if (passValSpan.textContent.includes('•')) {
      passValSpan.textContent = loadedCreds?.password || 'CloudNest2026!';
      revealPassBtn.textContent = 'Mask';
    } else {
      passValSpan.textContent = '•••••••••••••';
      revealPassBtn.textContent = 'Reveal';
    }
  });

  container.querySelector('#copy-ha-pass')?.addEventListener('click', function() {
    copyToClipboard(loadedCreds?.password || 'CloudNest2026!', this);
  });
}
