// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Devices List View (#/t/:slug/devices)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { formatRelativeTime, renderSpinner } from '../ui.js';

export async function renderDevices(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      ${renderSpinner()}
      <p style="margin-top: 0.5rem;">Loading devices...</p>
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
      <div class="card">
        <div class="banner banner-danger">
          <strong>Failed to load devices:</strong> ${err.message}
        </div>
        <button id="back-home-btn" class="btn btn-secondary">← Back to Dashboard</button>
      </div>
    `;
    container.querySelector('#back-home-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}`));
    return;
  }

  const devices = devicesData.devices || [];
  const usage = devicesData.usage || { count: 0, max: 10 };
  const callerRole = tenantData.callerRole || 'member';
  const canAdd = callerRole === 'admin' || callerRole === 'owner';

  container.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <h1>Smart Devices</h1>
          <p>Managed IoT hardware and virtual telemetry sensors (${usage.count} / ${usage.max} devices).</p>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <a href="#/t/${slug}" class="btn btn-secondary btn-sm">← Household Home</a>
          ${canAdd ? `
            <a href="#/t/${slug}/devices/new" class="btn btn-primary btn-sm">
              + Add New Device
            </a>
          ` : ''}
        </div>
      </div>

      ${devices.length === 0 ? `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">🔌</div>
          <h2>No devices registered yet</h2>
          <p style="max-width: 420px; margin: 0 auto 1.5rem auto;">
            Connect physical ESP32 microcontrollers or run a virtual sensor CLI on your computer.
          </p>
          ${canAdd ? `
            <a href="#/t/${slug}/devices/new" class="btn btn-primary">
              Add Your First Device →
            </a>
          ` : '<p class="form-hint">Ask your household owner or admin to register a device.</p>'}
        </div>
      ` : `
        <div class="card" style="padding: 0; overflow: hidden;">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th>Latest Telemetry</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${devices.map(dev => {
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
                  if (dev.status === 'online') statusBadge = '<span class="badge badge-online">● Online</span>';
                  else if (dev.status === 'pending') statusBadge = '<span class="badge badge-pending">⏳ Pending</span>';
                  else if (dev.status === 'revoked') statusBadge = '<span class="badge badge-revoked">✕ Revoked</span>';
                  else statusBadge = '<span class="badge badge-offline">○ Offline</span>';

                  return `
                    <tr>
                      <td>
                        <strong>${dev.name}</strong>
                        <div class="form-hint" style="font-family: var(--font-mono);">${dev.mgClientId || 'ID: ' + dev.id}</div>
                      </td>
                      <td><span class="badge badge-role">${dev.kind}</span></td>
                      <td>${statusBadge}</td>
                      <td>${formatRelativeTime(dev.lastSeenAt)}</td>
                      <td><code style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--info);">${valueStr}</code></td>
                      <td style="text-align: right;">
                        <a href="#/t/${slug}/devices/${dev.id}" class="btn btn-secondary btn-sm">
                          Configure
                        </a>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;
}
