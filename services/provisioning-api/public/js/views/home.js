// ---------------------------------------------------------------------------
// The-SIFT Smart Home Portal — Household Overview (#/t/:slug)
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
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-size: 0.84375rem;">
        Loading household overview...
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
          <strong>Could not load household:</strong> ${err.message}
        </div>
        <p>Please check that you are a member of "${slug}" and try again.</p>
        <button id="back-home-btn" class="btn btn-secondary">Back to Overview</button>
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
  const onlineCount = activeDevices.filter(d => d.status === 'online').length;
  const maxDevices = limits.devices?.max || 10;
  const maxSeats = limits.seats?.max || 1;
  const usedSeats = limits.seats?.used || members.length || 1;

  const devicePct = Math.min(100, Math.round((activeDevices.length / maxDevices) * 100));
  const seatPct = Math.min(100, Math.round((usedSeats / maxSeats) * 100));
  const isReady = (tenant.status || 'ready') === 'ready' || tenant.status === 'active';
  const recentDevices = activeDevices.slice(0, 5);

  container.innerHTML = `
    <div>
      <!-- Household Header -->
      <div class="page-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap;">
            <h1>${tenant.displayName || slug}</h1>
            <span class="badge badge-tier">${formatTierBadge(tenant.plan)} PLAN</span>
            <span class="badge badge-online">
              <span class="led-dot led-emerald"></span>
              <span>${callerRole.toUpperCase()}</span>
            </span>
          </div>
          <p style="margin-bottom: 0; font-size: 0.84375rem; color: var(--text-secondary);">
            Welcome to your smart home overview. Manage your connected devices, family members, and Home Assistant dashboard.
          </p>
        </div>

        <div class="page-header-actions">
          <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Add Device</span>
          </a>
          <a href="#/t/${slug}/members" class="btn btn-secondary btn-sm">Invite Member</a>
          <a href="#/t/${slug}/plan" class="btn btn-secondary btn-sm">Change Plan</a>
        </div>
      </div>

      <!-- Top Summary Cards -->
      <div class="bento-grid">
        <!-- Card 1: Smart Home Hub -->
        <div class="stat-card">
          <div class="stat-label">
            <span>Smart Home Hub</span>
            <span class="led-dot ${isReady ? 'led-emerald' : 'led-amber'}"></span>
          </div>
          <div class="stat-value" style="display: flex; align-items: center; gap: 8px; font-size: 1.25rem;">
            <span>${isReady ? 'Online & Ready' : 'Setting Up'}</span>
          </div>
          <div class="stat-hint">
            Connected to Home Assistant
          </div>
        </div>

        <!-- Card 2: Smart Devices -->
        <div class="stat-card">
          <div class="stat-label">
            <span>Smart Devices</span>
            <span class="mono">${onlineCount} ONLINE</span>
          </div>
          <div class="stat-value">
            ${activeDevices.length} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 400;">/ ${maxDevices}</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill emerald" style="width: ${devicePct}%;"></div>
          </div>
          <div class="stat-hint">${onlineCount} currently online</div>
        </div>

        <!-- Card 3: Household Members -->
        <div class="stat-card">
          <div class="stat-label">
            <span>Household Members</span>
            <span class="badge badge-role" style="font-size: 0.625rem; padding: 1px 6px;">${callerRole}</span>
          </div>
          <div class="stat-value">
            ${usedSeats} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 400;">/ ${maxSeats}</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill" style="width: ${seatPct}%;"></div>
          </div>
          <div class="stat-hint">${Math.max(0, maxSeats - usedSeats)} seat(s) available</div>
        </div>

        <!-- Card 4: Current Plan -->
        <div class="stat-card">
          <div class="stat-label">
            <span>Current Plan</span>
            <a href="#/t/${slug}/plan" style="font-size: 0.6875rem; font-weight: 600;">CHANGE PLAN</a>
          </div>
          <div class="stat-value" style="font-size: 1.25rem;">
            ${formatTierName(tenant.plan)}
          </div>
          <div class="stat-hint">
            Up to ${maxSeats} ${maxSeats === 1 ? 'member' : 'members'} &amp; ${maxDevices} devices
          </div>
        </div>
      </div>

      <!-- Home Assistant Dashboard Card -->
      <div class="launchpad-card" id="ha-panel">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-lg); flex-wrap: wrap;">
          <div style="max-width: 620px;">
            <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span class="badge badge-online">
                <span class="led-dot led-emerald"></span>
                <span>READY</span>
              </span>
            </div>
            <h2 style="font-size: 1.25rem; margin-bottom: 6px;">Home Assistant Dashboard</h2>
            <p style="font-size: 0.84375rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
              Open your household's Home Assistant dashboard to view live sensor readings and control your switches. All members of your household use the login details below.
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button type="button" id="toggle-ha-creds-btn" class="btn btn-secondary btn-sm">
              Show Login Details
            </button>
            <a href="${haUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
              <span>Open Home Assistant</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </a>
          </div>
        </div>

        <div style="margin-top: var(--space-sm);">
          <div class="data-label">Dashboard Web Address</div>
          <div class="copy-box">
            <span id="ha-url-text">${haUrl}</span>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
              <button type="button" id="copy-ha-url" class="btn btn-secondary btn-sm">Copy Link</button>
            </div>
          </div>
        </div>

        <div id="ha-creds-details" style="display: none; margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--border);">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-md);">
            <div>
              <div class="data-label">Username</div>
              <div class="copy-box">
                <span id="ha-username-val">admin</span>
                <button type="button" id="copy-ha-user" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>

            <div>
              <div class="data-label">Password</div>
              <div class="copy-box">
                <span id="ha-password-val">•••••••••••••</span>
                <div style="display: flex; gap: 6px; flex-shrink: 0;">
                  <button type="button" id="reveal-ha-pass" class="btn btn-secondary btn-sm">Show</button>
                  <button type="button" id="copy-ha-pass" class="btn btn-secondary btn-sm">Copy</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Devices Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div>
            <h3 style="margin-bottom: 2px;">Recent Devices</h3>
            <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: 0;">
              Smart sensors and switches connected to your household.
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <a href="#/t/${slug}/devices" class="btn btn-secondary btn-sm">View All (${activeDevices.length})</a>
            <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">+ Add Device</a>
          </div>
        </div>

        ${recentDevices.length === 0 ? `
          <div class="empty-state" style="padding: var(--space-2xl) var(--space-lg);">
            <p style="font-size: 0.84375rem; color: var(--text-muted); margin-bottom: var(--space-md);">
              No smart devices have been added to your household yet.
            </p>
            <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">+ Add First Device</a>
          </div>
        ` : `
          <div class="table-container" style="border: none; border-radius: 0;">
            <table>
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${recentDevices.map(dev => {
                  let statusPill = '';
                  if (dev.status === 'online') {
                    statusPill = `<span class="badge badge-online"><span class="led-dot led-emerald"></span>Online</span>`;
                  } else if (dev.status === 'pending') {
                    statusPill = `<span class="badge badge-pending"><span class="led-dot led-amber"></span>Waiting for data</span>`;
                  } else if (dev.status === 'revoked') {
                    statusPill = `<span class="badge badge-revoked"><span class="led-dot led-rose"></span>Removed</span>`;
                  } else {
                    statusPill = `<span class="badge badge-offline"><span class="led-dot led-muted"></span>Offline</span>`;
                  }

                  const typeLabel = dev.kind === 'switch' ? 'Switch' : 'Sensor';

                  return `
                    <tr>
                      <td><strong style="color: var(--text-main); font-weight: 600;">${dev.name}</strong></td>
                      <td><span class="badge badge-role">${typeLabel}</span></td>
                      <td>${statusPill}</td>
                      <td class="mono" style="font-size: 0.75rem;">${formatRelativeTime(dev.lastSeenAt)}</td>
                      <td style="text-align: right;">
                        <a href="#/t/${slug}/devices/${dev.id}" class="btn btn-secondary btn-sm">View</a>
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

  container.querySelector('#copy-ha-url')?.addEventListener('click', function () {
    copyToClipboard(haUrl, this, 'Copy Link');
  });

  const toggleBtn = container.querySelector('#toggle-ha-creds-btn');
  const detailsDiv = container.querySelector('#ha-creds-details');
  let loadedCreds = null;

  toggleBtn?.addEventListener('click', async () => {
    if (detailsDiv.style.display === 'none') {
      if (!loadedCreds) {
        toggleBtn.textContent = 'Loading...';
        try {
          loadedCreds = await api.getHaAccess(slug);
        } catch {
          loadedCreds = { username: 'admin', password: '' };
        }
        container.querySelector('#ha-username-val').textContent = loadedCreds.username || 'admin';
      }
      toggleBtn.textContent = 'Hide Login Details';
      detailsDiv.style.display = 'block';
    } else {
      detailsDiv.style.display = 'none';
      toggleBtn.textContent = 'Show Login Details';
    }
  });

  container.querySelector('#copy-ha-user')?.addEventListener('click', function () {
    copyToClipboard(loadedCreds?.username || 'admin', this);
  });

  const revealPassBtn = container.querySelector('#reveal-ha-pass');
  const passValSpan = container.querySelector('#ha-password-val');
  revealPassBtn?.addEventListener('click', () => {
    if (passValSpan.textContent.includes('•')) {
      passValSpan.textContent = loadedCreds?.password || '';
      revealPassBtn.textContent = 'Hide';
    } else {
      passValSpan.textContent = '•••••••••••••';
      revealPassBtn.textContent = 'Show';
    }
  });

  container.querySelector('#copy-ha-pass')?.addEventListener('click', function () {
    copyToClipboard(loadedCreds?.password || '', this);
  });
}
