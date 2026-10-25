// ---------------------------------------------------------------------------
// The-SIFT Cloud Portal — Connected Hardware Directory (#/t/:slug/devices)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard, formatRelativeTime, renderSpinner } from '../ui.js';

export async function renderDevices(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-family: var(--font-mono); font-size: 0.8125rem;">
        QUERYING MAGISTRALA HARDWARE REGISTRY...
      </p>
    </div>
  `;

  let devicesData, tenantData;
  try {
    [devicesData, tenantData] = await Promise.all([
      api.getDevices(slug),
      api.getTenant(slug),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 2rem auto;">
        <div class="banner banner-danger">
          <strong>Hardware Registry Error:</strong> ${err.message}
        </div>
        <button id="back-home-btn" class="btn btn-secondary">Back to Overview</button>
      </div>
    `;
    container.querySelector('#back-home-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}`));
    return;
  }

  let allDevices = devicesData.devices || [];
  const usage = devicesData.usage || { count: 0, max: 10 };
  const callerRole = tenantData.callerRole || 'member';
  const canManage = callerRole === 'admin' || callerRole === 'owner';

  let searchQuery = '';
  let statusFilter = 'all'; // 'all' | 'active' | 'revoked'
  let typeFilter = 'all';

  function filterDevices() {
    return allDevices.filter(dev => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        (dev.name && dev.name.toLowerCase().includes(q)) ||
        (dev.mgClientId && dev.mgClientId.toLowerCase().includes(q)) ||
        (String(dev.id).includes(q));

      const matchesType = typeFilter === 'all' || dev.kind === typeFilter;

      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = dev.status !== 'revoked';
      } else if (statusFilter === 'revoked') {
        matchesStatus = dev.status === 'revoked';
      }

      return matchesSearch && matchesType && matchesStatus;
    });
  }

  function renderTableContent() {
    const tableBody = container.querySelector('#devices-tbody');
    const emptyRow = container.querySelector('#devices-filter-empty');
    if (!tableBody) return;

    const filtered = filterDevices();
    if (filtered.length === 0) {
      tableBody.innerHTML = '';
      if (emptyRow) emptyRow.style.display = 'block';
      return;
    }

    if (emptyRow) emptyRow.style.display = 'none';
    tableBody.innerHTML = filtered.map(dev => {
      const thingId = dev.mgClientId || `dev_${dev.id}`;
      const provisionedDate = dev.createdAt
        ? new Date(dev.createdAt).toLocaleDateString()
        : '—';

      let statusPill = '';
      if (dev.status === 'online') {
        statusPill = `<span class="badge badge-online"><span class="led-dot led-emerald"></span>ONLINE</span>`;
      } else if (dev.status === 'pending') {
        statusPill = `<span class="badge badge-pending"><span class="led-dot led-amber"></span>PENDING</span>`;
      } else if (dev.status === 'revoked') {
        statusPill = `<span class="badge badge-revoked"><span class="led-dot led-rose"></span>REVOKED</span>`;
      } else {
        statusPill = `<span class="badge badge-offline"><span class="led-dot led-muted"></span>OFFLINE (${formatRelativeTime(dev.lastSeenAt)})</span>`;
      }

      const isSensor = dev.kind === 'sensor';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="choice-card-icon" style="width: 30px; height: 30px;">
                ${isSensor ? `
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
                ` : `
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/></svg>
                `}
              </div>
              <div>
                <a href="#/t/${slug}/devices/${dev.id}" style="color: var(--text-main); font-weight: 600;">${dev.name}</a>
                <div class="mono" style="font-size: 0.7rem; color: var(--text-muted);">ID #${dev.id}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-role">${dev.kind}</span></td>
          <td>${statusPill}</td>
          <td>
            <div style="display: inline-flex; align-items: center; gap: 6px;">
              <code style="font-size: 0.75rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${thingId}">${thingId}</code>
              <button type="button" class="btn btn-ghost btn-sm copy-thing-btn" data-thing="${thingId}" style="padding: 3px 6px; font-size: 0.6875rem;">
                Copy
              </button>
            </div>
          </td>
          <td class="mono" style="font-size: 0.78125rem;">${provisionedDate}</td>
          <td style="text-align: right;">
            <div style="display: inline-flex; align-items: center; gap: 6px;">
              <a href="#/t/${slug}/devices/${dev.id}" class="btn btn-secondary btn-sm">Inspect</a>
              ${canManage && dev.status !== 'revoked' ? `
                <button type="button" class="btn btn-danger btn-sm revoke-row-btn" data-id="${dev.id}" data-name="${dev.name}">
                  Revoke
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableBody.querySelectorAll('.copy-thing-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        copyToClipboard(this.dataset.thing, this, 'Copy');
      });
    });

    tableBody.querySelectorAll('.revoke-row-btn').forEach(btn => {
      btn.addEventListener('click', async function() {
        const id = this.dataset.id;
        const name = this.dataset.name;
        if (!confirm(`Revoke cloud access for hardware endpoint "${name}"?`)) return;
        try {
          await api.revokeDevice(slug, id);
          toast(`Revoked hardware endpoint "${name}"`, 'info');
          renderDevices(container, slug, router);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  container.innerHTML = `
    <div>
      <div class="page-header">
        <div>
          <h1>Connected Hardware Endpoints</h1>
          <p style="margin-bottom: 0; font-size: 0.84375rem;">
            Provisioned ESP32 microcontrollers and MQTT telemetry nodes (<span class="mono">${usage.count} / ${usage.max}</span> quota allocated).
          </p>
        </div>

        <div class="page-header-actions">
          ${canManage ? `
            <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">+ Provision Device</a>
          ` : ''}
        </div>
      </div>

      ${allDevices.length === 0 ? `
        <div class="card empty-state" style="max-width: 540px; margin: 2rem auto;">
          <div class="empty-state-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
              <rect x="9" y="9" width="6" height="6"/>
              <line x1="9" y1="1" x2="9" y2="4"/>
              <line x1="15" y1="1" x2="15" y2="4"/>
              <line x1="9" y1="20" x2="9" y2="23"/>
              <line x1="15" y1="20" x2="15" y2="23"/>
              <line x1="20" y1="9" x2="23" y2="9"/>
              <line x1="20" y1="14" x2="23" y2="14"/>
              <line x1="1" y1="9" x2="4" y2="9"/>
              <line x1="1" y1="14" x2="4" y2="14"/>
            </svg>
          </div>
          <h2>No Hardware Endpoints Provisioned</h2>
          <p style="font-size: 0.84375rem; max-width: 420px; margin: 0 auto var(--space-xl) auto;">
            Issue Magistrala Thing credentials to connect ESP32 microcontrollers or verify cloud MQTT telemetry pipelines.
          </p>
          ${canManage ? `
            <a href="#/t/${slug}/devices/new" class="btn btn-primary">+ Provision First Device</a>
          ` : '<p class="form-hint">Contact a household administrator or owner to provision hardware.</p>'}
        </div>
      ` : `
        <!-- Action & Filter Bar -->
        <div class="card" style="padding: 12px 16px; margin-bottom: var(--space-lg);">
          <div style="display: flex; gap: var(--space-md); flex-wrap: wrap; align-items: center; justify-content: space-between;">
            <div style="flex: 1; min-width: 240px;">
              <input type="search" id="device-search-input" placeholder="Filter by device name or Magistrala Thing ID...">
            </div>

            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <div class="filter-pills" role="group" aria-label="Filter by status">
                <button type="button" class="filter-pill active" data-status="all">All</button>
                <button type="button" class="filter-pill" data-status="active">Active</button>
                <button type="button" class="filter-pill" data-status="revoked">Revoked</button>
              </div>

              <select id="device-type-filter" style="width: auto; min-width: 140px;">
                <option value="all">All Hardware Classes</option>
                <option value="sensor">Telemetry Sensor</option>
                <option value="switch">Relay / Switch</option>
              </select>
            </div>
          </div>
        </div>

        <!-- High-Density Technical Hardware Table -->
        <div class="card" style="padding: 0; overflow: hidden;">
          <div class="table-container" style="border: none; border-radius: 0;">
            <table>
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>Hardware Class</th>
                  <th>Status</th>
                  <th>Magistrala Thing ID</th>
                  <th>Provisioned Date</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody id="devices-tbody"></tbody>
            </table>
          </div>
          <div id="devices-filter-empty" class="empty-state" style="display: none; padding: var(--space-2xl);">
            <p style="color: var(--text-muted); margin-bottom: 0;">No hardware endpoints match the active filter criteria.</p>
          </div>
        </div>
      `}
    </div>
  `;

  if (allDevices.length > 0) {
    const searchInput = container.querySelector('#device-search-input');
    const typeSelect = container.querySelector('#device-type-filter');
    const statusPills = container.querySelectorAll('.filter-pill');

    searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderTableContent();
    });

    typeSelect?.addEventListener('change', (e) => {
      typeFilter = e.target.value;
      renderTableContent();
    });

    statusPills.forEach(pill => {
      pill.addEventListener('click', () => {
        statusPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        statusFilter = pill.dataset.status;
        renderTableContent();
      });
    });

    renderTableContent();
  }
}
