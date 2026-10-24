// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Devices List View (#/t/:slug/devices)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { formatRelativeTime, renderSpinner } from '../ui.js';

export async function renderDevices(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-weight: 500;">Loading smart devices...</p>
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
          <strong>Failed to load devices:</strong> ${err.message}
        </div>
        <button id="back-home-btn" class="btn btn-secondary">← Back to Dashboard</button>
      </div>
    `;
    container.querySelector('#back-home-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}`));
    return;
  }

  const allDevices = devicesData.devices || [];
  const usage = devicesData.usage || { count: 0, max: 10 };
  const callerRole = tenantData.callerRole || 'member';
  const canAdd = callerRole === 'admin' || callerRole === 'owner';
  const usagePct = Math.min(100, Math.round((usage.count / usage.max) * 100));

  let searchQuery = '';
  let typeFilter = 'all';
  let statusFilter = 'all';

  function filterDevices() {
    return allDevices.filter(dev => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || 
        (dev.name && dev.name.toLowerCase().includes(q)) ||
        (dev.mgClientId && dev.mgClientId.toLowerCase().includes(q)) ||
        (String(dev.id).includes(q));

      const matchesType = typeFilter === 'all' || dev.kind === typeFilter;
      const matchesStatus = statusFilter === 'all' || dev.status === statusFilter;

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
      let valueStr = '—';
      if (dev.lastValue) {
        if (typeof dev.lastValue === 'object') {
          const keys = Object.keys(dev.lastValue).filter(k => k !== 'id');
          valueStr = keys.map(k => `${k}: ${dev.lastValue[k]}`).join(', ') || JSON.stringify(dev.lastValue);
        } else {
          valueStr = String(dev.lastValue);
        }
      }

      let statusBadge = '';
      if (dev.status === 'online') {
        statusBadge = `
          <span class="badge badge-online">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--success); box-shadow:0 0 6px rgba(16,185,129,0.8);"></span>
            Online
          </span>
        `;
      } else if (dev.status === 'pending') {
        statusBadge = '<span class="badge badge-pending">Pending</span>';
      } else if (dev.status === 'revoked') {
        statusBadge = '<span class="badge badge-revoked">Revoked</span>';
      } else {
        statusBadge = '<span class="badge badge-offline">○ Offline</span>';
      }

      const isSensor = dev.kind === 'sensor';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background: ${isSensor ? 'rgba(28, 114, 147, 0.1)' : 'rgba(46, 230, 214, 0.15)'}; display: flex; align-items: center; justify-content: center; color: var(--brand-teal); flex-shrink: 0;">
                ${isSensor ? `
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
                ` : `
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/></svg>
                `}
              </div>
              <div>
                <strong style="color: var(--text-main); font-weight: 600;">${dev.name}</strong>
                <div class="form-hint" style="font-family: var(--font-mono); font-size: 0.725rem; margin-top: 1px;">
                  ${dev.mgClientId || 'ID: ' + dev.id}
                </div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-role">${dev.kind}</span></td>
          <td>${statusBadge}</td>
          <td style="font-size: 0.8125rem;">${formatRelativeTime(dev.lastSeenAt)}</td>
          <td><span class="telemetry-value" style="max-width: 220px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${valueStr}</span></td>
          <td style="text-align: right;">
            <a href="#/t/${slug}/devices/${dev.id}" class="btn btn-secondary btn-sm">
              Configure →
            </a>
          </td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div>
      <div class="page-header">
        <div>
          <h1>Smart Devices</h1>
          <p style="margin-bottom: 0;">
            Managed microcontrollers and simulated sensors (${usage.count} of ${usage.max} capacity used).
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
              ${((router.session && router.session.tenants && router.session.tenants.length > 0) ? router.session.tenants : (tenantData.tenant ? [tenantData.tenant] : [])).map(t => `<option value="${t.slug}" ${t.slug === slug ? 'selected' : ''}>${t.displayName || t.slug}</option>`).join('')}
              <option value="__new__">+ New Workspace...</option>
            </select>
          </div>
          <a href="#/t/${slug}" class="btn btn-secondary btn-sm">← Dashboard</a>
          ${canAdd ? `
            <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">+ Add New Device</a>
          ` : ''}
        </div>
      </div>

      ${allDevices.length === 0 ? `
        <div class="card empty-state" style="max-width: 540px; margin: 2rem auto;">
          <div class="empty-state-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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
          <h2 style="font-size: 1.35rem;">No devices registered yet</h2>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: var(--space-xl);">
            Connect physical ESP32 boards via WiFi or run our lightweight CLI sensor simulator directly from your computer.
          </p>
          ${canAdd ? `
            <a href="#/t/${slug}/devices/new" class="btn btn-primary">Add Your First Device →</a>
          ` : '<p class="form-hint">Ask your household administrator or owner to add a device.</p>'}
        </div>
      ` : `
        <!-- Filter Controls Bar -->
        <div class="card" style="padding: var(--space-md) var(--space-lg); margin-bottom: var(--space-lg);">
          <div style="display: flex; gap: var(--space-md); flex-wrap: wrap; align-items: center;">
            <div style="flex: 1; min-width: 220px; position: relative;">
              <input type="text" id="device-search-input" placeholder="Search devices by name or client ID..." style="margin-bottom: 0;">
            </div>
            <div style="min-width: 140px;">
              <select id="device-type-filter" style="margin-bottom: 0;">
                <option value="all">All Device Types</option>
                <option value="sensor">Sensors</option>
                <option value="switch">Switches</option>
              </select>
            </div>
            <div style="min-width: 140px;">
              <select id="device-status-filter" style="margin-bottom: 0;">
                <option value="all">All Statuses</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="pending">Pending</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Devices Data Table -->
        <div class="card" style="padding: 0; overflow: hidden;">
          <div class="table-container" style="border: none; border-radius: 0;">
            <table>
              <thead>
                <tr>
                  <th style="min-width: 220px;">Device</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th>Latest Telemetry</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody id="devices-tbody">
              </tbody>
            </table>
          </div>
          <div id="devices-filter-empty" class="empty-state" style="display: none; padding: var(--space-2xl);">
            <p style="color: var(--text-muted); margin-bottom: 0;">No devices match the selected search and filter criteria.</p>
          </div>
        </div>
      `}
    </div>
  `;

  if (allDevices.length > 0) {
    const searchInput = container.querySelector('#device-search-input');
    const typeSelect = container.querySelector('#device-type-filter');
    const statusSelect = container.querySelector('#device-status-filter');

    searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderTableContent();
    });

    typeSelect?.addEventListener('change', (e) => {
      typeFilter = e.target.value;
      renderTableContent();
    });

    statusSelect?.addEventListener('change', (e) => {
      statusFilter = e.target.value;
      renderTableContent();
    });

    renderTableContent();
  }

  const workspaceSwitcher = container.querySelector('#workspace-switcher-select');
  if (workspaceSwitcher) {
    workspaceSwitcher.addEventListener('change', (e) => {
      const selected = e.target.value;
      if (selected === '__new__') {
        router.navigate('#/create-household');
      } else if (selected && selected !== slug) {
        router.currentSlug = selected;
        router.navigate(`#/t/${selected}/devices`);
      }
    });
  }
}
