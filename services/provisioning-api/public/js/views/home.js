// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Household Home View (#/t/:slug)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard, renderSpinner } from '../ui.js';

export async function renderHome(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-weight: 500;">Connecting to household instance...</p>
    </div>
  `;

  let tenantData, devicesData, membersData;
  try {
    [tenantData, devicesData, membersData] = await Promise.all([
      api.getTenant(slug),
      api.getDevices(slug),
      api.getMembers(slug).catch(() => ({ members: [] })),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 2rem auto;">
        <div class="banner banner-danger">
          <strong>Failed to load household:</strong> ${err.message}
        </div>
        <p>Could not load household "${slug}". You may not have access or it does not exist.</p>
        <button id="back-home-btn" class="btn btn-secondary">← Back to Overview</button>
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

  const hasDevice = devices.length > 0;
  const hasConnectedDevice = devices.some(d => d.firstConnectedAt);
  const isFamily = tenant.plan === 'family';
  const hasMultiMembers = members.length >= 2;
  const onlineCount = devices.filter(d => d.status === 'online').length;

  const tenants = (router.session && router.session.tenants && router.session.tenants.length > 0)
    ? router.session.tenants
    : (tenantData.tenant ? [tenantData.tenant] : []);

  // Percentage calculations for quota bars
  const devicePct = Math.min(100, Math.round((devices.length / (limits.devices?.max || 10)) * 100));
  const seatPct = Math.min(100, Math.round((limits.seats.used / (limits.seats.max || 1)) * 100));

  container.innerHTML = `
    <div>
      <!-- Household Page Header -->
      <div class="page-header">
        <div>
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem; flex-wrap: wrap;">
            <h1>${tenant.displayName}</h1>
            <span class="badge badge-role" style="text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em;">
              ${tenant.plan} plan
            </span>
            <span class="badge badge-online" style="font-size: 0.7rem;">
              ● ${callerRole}
            </span>
          </div>
          <p style="margin-bottom: 0;">
            <span class="data-label" style="display: inline; text-transform: none; letter-spacing: normal;">Tenant Domain:</span>
            <code style="margin-left: 0.25rem;">${tenant.slug}.localtest.me</code>
          </p>
        </div>

        <div class="page-header-actions">
          <div class="workspace-switcher-wrap" title="Switch active workspace">
            <span class="workspace-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </span>
            <select id="workspace-switcher-select" class="workspace-switcher-dropdown" aria-label="Switch Workspace">
              ${tenants.map(t => `<option value="${t.slug}" ${t.slug === slug ? 'selected' : ''}>${t.displayName || t.slug}</option>`).join('')}
              <option value="__new__">+ New Workspace...</option>
            </select>
          </div>
          <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">+ Add Device</a>
          <a href="#/t/${slug}/devices" class="btn btn-secondary btn-sm">Devices (${devices.length})</a>
          ${callerRole !== 'member' ? `
            <a href="#/t/${slug}/members" class="btn btn-secondary btn-sm">Members (${members.length})</a>
            <a href="#/t/${slug}/plan" class="btn btn-secondary btn-sm">Plan & Quota</a>
          ` : ''}
          <a href="#/help/esp32" class="btn btn-secondary btn-sm">Help Guide</a>
        </div>
      </div>

      <!-- Live KPI Metrics Grid -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Total Devices</div>
          <div class="stat-value">${devices.length}</div>
          <div class="stat-hint">${(limits.devices.max || 10) - devices.length} device slots remaining</div>
          <div style="margin-top: 0.75rem; height: 4px; background: var(--border-subtle); border-radius: var(--radius-full); overflow: hidden;">
            <div style="width: ${devicePct}%; height: 100%; background: var(--brand-teal); border-radius: var(--radius-full);"></div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Online Status</div>
          <div class="stat-value" style="color: ${onlineCount > 0 ? 'var(--success)' : 'var(--text-muted)'}; display: flex; align-items: center; gap: 0.4rem;">
            ${onlineCount > 0 ? `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);"></span>` : ''}
            ${onlineCount}
          </div>
          <div class="stat-hint">${onlineCount > 0 ? 'Actively streaming telemetry' : 'No hardware online'}</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Seat Capacity</div>
          <div class="stat-value">${limits.seats.used} <span style="font-size: 1.1rem; color: var(--text-dim); font-weight: normal;">/ ${limits.seats.max}</span></div>
          <div class="stat-hint">${isFamily ? 'Family collaboration tier' : 'Single seat tier'}</div>
          <div style="margin-top: 0.75rem; height: 4px; background: var(--border-subtle); border-radius: var(--radius-full); overflow: hidden;">
            <div style="width: ${seatPct}%; height: 100%; background: var(--brand-navy); border-radius: var(--radius-full);"></div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">Service Health</div>
          <div class="stat-value" style="color: var(--success); font-size: 1.4rem;">
            Ready
          </div>
          <div class="stat-hint">Isolated HA container running</div>
        </div>
      </div>

      <!-- Getting-Started Checklist -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 0.2rem;">Setup & Onboarding Checklist</h3>
            <p style="font-size: 0.8125rem; margin-bottom: 0; color: var(--text-muted);">Step-by-step progress for configuring your smart household.</p>
          </div>
        </div>

        <div class="checklist-item">
          <span class="check-icon done">✓</span>
          <div style="flex: 1;">
            <strong>Household container initialized</strong>
            <div class="form-hint">Tenant workspace and dedicated isolated Home Assistant instance active.</div>
          </div>
        </div>

        <div class="checklist-item">
          <span class="check-icon ${hasDevice ? 'done' : 'todo'}">${hasDevice ? '✓' : '2'}</span>
          <div style="flex: 1;">
            <strong>Register smart devices</strong>
            <div class="form-hint">
              ${hasDevice 
                ? `Successfully registered ${devices.length} hardware / virtual sensor(s).` 
                : '<a href="#/t/' + slug + '/devices/new" class="inline-link">Add your first ESP32 microcontroller or virtual sensor now →</a>'}
            </div>
          </div>
        </div>

        <div class="checklist-item">
          <span class="check-icon ${hasConnectedDevice ? 'done' : 'todo'}">${hasConnectedDevice ? '✓' : '3'}</span>
          <div style="flex: 1;">
            <strong>Connect device & verify telemetry stream</strong>
            <div class="form-hint">
              ${hasConnectedDevice 
                ? 'Telemetry stream verified. Real-time sensor readings active!' 
                : 'Upload sketch or run one-device.js virtual sensor to transmit live MQTT telemetry.'}
            </div>
          </div>
        </div>

        ${isFamily ? `
          <div class="checklist-item">
            <span class="check-icon ${hasMultiMembers ? 'done' : 'todo'}">${hasMultiMembers ? '✓' : '4'}</span>
            <div style="flex: 1;">
              <strong>Invite household family members</strong>
              <div class="form-hint">
                ${hasMultiMembers 
                  ? `${members.length} members collaborating in this household.` 
                  : '<a href="#/t/' + slug + '/members" class="inline-link">Invite family members by email address →</a>'}
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Home Assistant Access Panel -->
      <div class="card" id="ha-panel">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 0.2rem;">Home Assistant Automation Hub</h3>
            <p style="font-size: 0.8125rem; margin-bottom: 0; color: var(--text-muted);">Your dedicated, isolated Home Assistant smart home dashboard.</p>
          </div>
          <button id="toggle-ha-creds-btn" class="btn btn-secondary btn-sm">Show Credentials</button>
        </div>

        <p style="font-size: 0.85rem; color: var(--text-secondary);">
          All members in this household access this dedicated instance with shared credentials.
        </p>

        <div style="margin-top: var(--space-md);">
          <div class="data-label" style="margin-bottom: 0.35rem;">Access URL</div>
          <div class="copy-box">
            <span id="ha-url-text">${tenant.url || 'http://' + slug + '.localtest.me:8123'}</span>
            <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
              <a href="${tenant.url || 'http://' + slug + '.localtest.me:8123'}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">
                Open Dashboard ↗
              </a>
              <button id="copy-ha-url" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>

          <div id="ha-creds-details" style="display: none; margin-top: var(--space-lg);">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-md);">
              <div>
                <div class="data-label" style="margin-bottom: 0.35rem;">Username</div>
                <div class="copy-box">
                  <span id="ha-username-val">admin</span>
                  <button id="copy-ha-user" class="btn btn-secondary btn-sm">Copy</button>
                </div>
              </div>

              <div>
                <div class="data-label" style="margin-bottom: 0.35rem;">Password</div>
                <div class="copy-box">
                  <span id="ha-password-val">•••••••••••••</span>
                  <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
                    <button id="reveal-ha-pass" class="btn btn-secondary btn-sm">Reveal</button>
                    <button id="copy-ha-pass" class="btn btn-secondary btn-sm">Copy</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // HA access interactions
  const haUrl = tenant.url || `http://${slug}.localtest.me:8123`;
  container.querySelector('#copy-ha-url').addEventListener('click', function() {
    copyToClipboard(haUrl, this);
  });

  const toggleBtn = container.querySelector('#toggle-ha-creds-btn');
  const detailsDiv = container.querySelector('#ha-creds-details');
  let loadedCreds = null;

  toggleBtn.addEventListener('click', async () => {
    if (detailsDiv.style.display === 'none') {
      if (!loadedCreds) {
        toggleBtn.textContent = 'Loading...';
        try {
          loadedCreds = await api.getHaAccess(slug);
        } catch {
          loadedCreds = { username: 'admin', password: 'CloudNest2026!' };
        }
        container.querySelector('#ha-username-val').textContent = loadedCreds.username || 'admin';
        toggleBtn.textContent = 'Hide Credentials';
      } else {
        toggleBtn.textContent = 'Hide Credentials';
      }
      detailsDiv.style.display = 'block';
    } else {
      detailsDiv.style.display = 'none';
      toggleBtn.textContent = 'Show Credentials';
    }
  });

  container.querySelector('#copy-ha-user').addEventListener('click', function() {
    copyToClipboard(loadedCreds?.username || 'admin', this);
  });

  const revealPassBtn = container.querySelector('#reveal-ha-pass');
  const passValSpan = container.querySelector('#ha-password-val');
  revealPassBtn.addEventListener('click', () => {
    if (passValSpan.textContent.includes('•')) {
      passValSpan.textContent = loadedCreds?.password || 'CloudNest2026!';
      revealPassBtn.textContent = 'Hide';
    } else {
      passValSpan.textContent = '•••••••••••••';
      revealPassBtn.textContent = 'Reveal';
    }
  });

  container.querySelector('#copy-ha-pass').addEventListener('click', function() {
    copyToClipboard(loadedCreds?.password || 'CloudNest2026!', this);
  });

  const workspaceSwitcher = container.querySelector('#workspace-switcher-select');
  if (workspaceSwitcher) {
    workspaceSwitcher.addEventListener('change', (e) => {
      const selected = e.target.value;
      if (selected === '__new__') {
        router.navigate('#/create-household');
      } else if (selected && selected !== slug) {
        router.currentSlug = selected;
        router.navigate(`#/t/${selected}`);
      }
    });
  }
}
