// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Household Home View (#/t/:slug)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard, renderSpinner } from '../ui.js';

export async function renderHome(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      ${renderSpinner()}
      <p style="margin-top: 0.5rem;">Loading household dashboard...</p>
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
      <div class="card">
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

  // Checklist computation (Section 7)
  const isCreated = tenant.status === 'ready' || tenant.status === 'active';
  const hasDevice = devices.length > 0;
  const hasConnectedDevice = devices.some(d => d.firstConnectedAt);
  const isFamily = tenant.plan === 'family';
  const hasMultiMembers = members.length >= 2;

  container.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1>${tenant.displayName}</h1>
          <p>
            Slug: <code style="font-family: var(--font-mono); color: var(--primary);">${tenant.slug}</code> •
            Plan: <span class="badge badge-role">${tenant.plan}</span> •
            Your Role: <span class="badge badge-online">${callerRole}</span>
          </p>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">
            + Add Device
          </a>
          <a href="#/t/${slug}/devices" class="btn btn-secondary btn-sm">
            View Devices (${devices.length})
          </a>
          ${callerRole !== 'member' ? `
            <a href="#/t/${slug}/members" class="btn btn-secondary btn-sm">
              Members (${members.length})
            </a>
          ` : ''}
          <a href="#/help/esp32" class="btn btn-secondary btn-sm">
            📖 Help & Guide
          </a>
        </div>
      </div>

      <!-- Getting-Started Checklist -->
      <div class="card">
        <h3>🚀 Getting-Started Checklist</h3>
        <p style="font-size: 0.85rem; margin-bottom: 0.75rem;">Step-by-step progress for setting up your household automation.</p>

        <div class="checklist-item">
          <span class="check-icon done">✓</span>
          <div>
            <strong>Household created</strong>
            <div class="form-hint">Isolated namespace & Home Assistant initialized.</div>
          </div>
        </div>

        <div class="checklist-item">
          <span class="check-icon ${hasDevice ? 'done' : 'todo'}">${hasDevice ? '✓' : '2'}</span>
          <div>
            <strong>Add your first device</strong>
            <div class="form-hint">${hasDevice ? `Registered ${devices.length} device(s).` : '<a href="#/t/' + slug + '/devices/new" style="color: var(--primary);">Add an ESP32 or virtual device now →</a>'}</div>
          </div>
        </div>

        <div class="checklist-item">
          <span class="check-icon ${hasConnectedDevice ? 'done' : 'todo'}">${hasConnectedDevice ? '✓' : '3'}</span>
          <div>
            <strong>Connect device & verify telemetry</strong>
            <div class="form-hint">${hasConnectedDevice ? 'Telemetry received and verified online!' : 'Run sketch or virtual device to transmit live sensor telemetry.'}</div>
          </div>
        </div>

        ${isFamily ? `
          <div class="checklist-item">
            <span class="check-icon ${hasMultiMembers ? 'done' : 'todo'}">${hasMultiMembers ? '✓' : '4'}</span>
            <div>
              <strong>Invite household members</strong>
              <div class="form-hint">${hasMultiMembers ? `${members.length} members in household.` : '<a href="#/t/' + slug + '/members" style="color: var(--primary);">Add family members by email →</a>'}</div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Home Assistant Access Panel -->
      <div class="card" id="ha-panel">
        <div class="card-header">
          <h3>🏠 Home Assistant Access</h3>
          <button id="toggle-ha-creds-btn" class="btn btn-secondary btn-sm">Show Credentials</button>
        </div>

        <p style="font-size: 0.85rem;">Everyone in your household uses this one shared login for Home Assistant dashboards.</p>

        <div style="margin-top: 1rem;">
          <div style="font-size: 0.85rem; margin-bottom: 0.35rem;"><strong>Home Assistant URL:</strong></div>
          <div class="copy-box">
            <span id="ha-url-text">${tenant.url || 'http://' + slug + '.localtest.me:8123'}</span>
            <div style="display: flex; gap: 0.25rem;">
              <a href="${tenant.url || 'http://' + slug + '.localtest.me:8123'}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Open ↗</a>
              <button id="copy-ha-url" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>

          <div id="ha-creds-details" style="display: none; margin-top: 0.75rem;">
            <div style="font-size: 0.85rem; margin-bottom: 0.35rem;"><strong>Username:</strong></div>
            <div class="copy-box">
              <span id="ha-username-val">admin</span>
              <button id="copy-ha-user" class="btn btn-secondary btn-sm">Copy</button>
            </div>

            <div style="font-size: 0.85rem; margin-bottom: 0.35rem;"><strong>Password:</strong></div>
            <div class="copy-box">
              <span id="ha-password-val">•••••••••••••</span>
              <div style="display: flex; gap: 0.25rem;">
                <button id="reveal-ha-pass" class="btn btn-secondary btn-sm">Reveal</button>
                <button id="copy-ha-pass" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Usage & Limits -->
      <div class="card">
        <h3>📊 Household Capacity</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
          <div class="card" style="background: var(--bg-card); margin-bottom: 0;">
            <div style="font-size: 0.8rem; color: var(--text-dim);">SEAT LIMIT</div>
            <div style="font-size: 1.5rem; font-weight: 700; margin: 0.25rem 0;">
              ${limits.seats.used} / ${limits.seats.max}
            </div>
            <div class="form-hint">${isFamily ? 'Family plan capacity' : 'Single plan (1 seat)'}</div>
          </div>

          <div class="card" style="background: var(--bg-card); margin-bottom: 0;">
            <div style="font-size: 0.8rem; color: var(--text-dim);">DEVICE LIMIT</div>
            <div style="font-size: 1.5rem; font-weight: 700; margin: 0.25rem 0;">
              ${limits.devices.used} / ${limits.devices.max}
            </div>
            <div class="form-hint">Connected sensors & switches</div>
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
}
