// ---------------------------------------------------------------------------
// The-SIFT Smart Home Portal — Device Details (#/t/:slug/devices/:id)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import {
  toast,
  copyToClipboard,
  formatRelativeTime,
  renderSpinner,
} from '../ui.js';

function formatReadingLabel(key) {
  const k = String(key).toLowerCase();
  if (k === 'temperature' || k === 'temp') return 'Temperature';
  if (k === 'humidity' || k === 'hum') return 'Humidity';
  if (k === 'state' || k === 'switch') return 'Switch State';
  if (k === 'battery') return 'Battery';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function formatReadingUnit(key) {
  const k = String(key).toLowerCase();
  if (k.includes('temp')) return '°C';
  if (k.includes('hum') || k.includes('battery')) return '%';
  return '';
}

export async function renderDeviceDetail(container, slug, deviceId, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-size: 0.84375rem;">
        Loading device details...
      </p>
    </div>
  `;

  let tenantData, deviceRes;
  try {
    [tenantData, deviceRes] = await Promise.all([
      api.getTenant(slug),
      api.getDeviceStatus(slug, deviceId),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 2rem auto;">
        <div class="banner banner-danger">
          <strong>Could not load device:</strong> ${err.message}
        </div>
        <button id="back-devices-btn" class="btn btn-secondary">&larr; Back to Devices</button>
      </div>
    `;
    container.querySelector('#back-devices-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}/devices`));
    return;
  }

  const device = deviceRes.device || {};
  const callerRole = tenantData.callerRole || 'member';
  const isAdmin = callerRole === 'admin' || callerRole === 'owner';

  let statusPill = '';
  if (device.status === 'online') {
    statusPill = `<span class="badge badge-online"><span class="led-dot led-emerald"></span>Online</span>`;
  } else if (device.status === 'pending') {
    statusPill = `<span class="badge badge-pending"><span class="led-dot led-amber"></span>Waiting for data</span>`;
  } else if (device.status === 'revoked') {
    statusPill = `<span class="badge badge-revoked"><span class="led-dot led-rose"></span>Removed</span>`;
  } else {
    statusPill = `<span class="badge badge-offline"><span class="led-dot led-muted"></span>Offline</span>`;
  }

  const typeLabel = device.kind === 'switch' ? 'Switch' : 'Sensor';

  let readingItems = [];
  if (device.lastValue && typeof device.lastValue === 'object') {
    Object.keys(device.lastValue).forEach(key => {
      if (key !== 'id' && key !== 'deviceId') {
        readingItems.push({
          label: formatReadingLabel(key),
          val: device.lastValue[key],
          unit: formatReadingUnit(key),
        });
      }
    });
  }

  container.innerHTML = `
    <div>
      <!-- Header -->
      <div class="page-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap;">
            <h1>${device.name}</h1>
            <span class="badge badge-role">${typeLabel}</span>
            ${statusPill}
          </div>
          <p style="margin-bottom: 0; font-size: 0.84375rem; color: var(--text-secondary);">
            Added on ${device.createdAt ? new Date(device.createdAt).toLocaleDateString() : '—'}
          </p>
        </div>
        <div class="page-header-actions">
          <a href="#/t/${slug}/devices" class="btn btn-secondary btn-sm">&larr; Back to Devices</a>
        </div>
      </div>

      <!-- New Device Key Warning Box (shown after Reset Device Key) -->
      <div id="new-secret-card" class="card" style="display: none; border-color: var(--warning-border);">
        <div class="banner banner-warning">
          <strong>New Device Secret Key Created:</strong> Copy and save this key now. It is shown only once.
        </div>
        <div class="data-label">New Device Secret Key</div>
        <div class="copy-box">
          <span id="new-secret-val" style="color: var(--warning-text); font-weight: 600;"></span>
          <button type="button" id="copy-new-secret-btn" class="btn btn-secondary btn-sm">Copy Key</button>
        </div>
      </div>

      <!-- Live Status Card -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 2px;">Live Status</h3>
            <span class="data-label">Last updated: ${formatRelativeTime(device.lastSeenAt)}</span>
          </div>
        </div>

        ${readingItems.length > 0 ? `
          <div class="stat-grid" style="margin-bottom: ${device.kind === 'switch' && device.status !== 'revoked' ? 'var(--space-lg)' : '0'};">
            ${readingItems.map(item => `
              <div class="stat-card">
                <div class="stat-label">${item.label}</div>
                <div class="stat-value">
                  ${item.val} <span style="font-size: 0.9rem; color: var(--text-muted);">${item.unit}</span>
                </div>
                <div class="stat-hint">Live reading</div>
              </div>
            `).join('')}
          </div>
        ` : (device.lastValue ? `
          <div style="margin-bottom: ${device.kind === 'switch' && device.status !== 'revoked' ? 'var(--space-lg)' : '0'}; padding: var(--space-md); background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div class="data-label">Current State</div>
            <div class="data-value mono" style="font-size: 1.25rem; color: var(--led-emerald);">${String(device.lastValue)}</div>
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-xl) var(--space-md);">
            <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0;">
              Waiting for this device to send its first reading.
            </p>
          </div>
        `)}

        ${device.kind === 'switch' && device.status !== 'revoked' ? `
          <hr class="section-divider">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div>
              <h4 style="margin-bottom: 2px;">Quick Controls</h4>
              <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0;">
                Toggle this smart switch ON or OFF directly from your dashboard.
              </p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" id="cmd-on-btn" class="btn btn-primary btn-sm">Turn ON</button>
              <button type="button" id="cmd-off-btn" class="btn btn-secondary btn-sm">Turn OFF</button>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Device Settings Card -->
      ${isAdmin && device.status !== 'revoked' ? `
        <div class="card danger-zone">
          <h3 style="margin-bottom: 4px;">Device Settings</h3>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: var(--space-lg);">
            Reset this device's connection key if you are setting it up again, or remove it from your household.
          </p>

          <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
            <button type="button" id="rotate-secret-btn" class="btn btn-secondary btn-sm">Reset Device Key</button>
            <button type="button" id="revoke-device-btn" class="btn btn-danger btn-sm">Remove Device</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  container.querySelector('#cmd-on-btn')?.addEventListener('click', async () => {
    try {
      await api.sendTestCommand(slug, deviceId, 'ON');
      toast(`Turned ON "${device.name}"`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#cmd-off-btn')?.addEventListener('click', async () => {
    try {
      await api.sendTestCommand(slug, deviceId, 'OFF');
      toast(`Turned OFF "${device.name}"`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#rotate-secret-btn')?.addEventListener('click', async () => {
    if (!confirm(`Reset the connection key for "${device.name}"? You will need to update the device with the new key.`)) {
      return;
    }

    try {
      const res = await api.rotateDeviceSecret(slug, deviceId);
      const newSecretCard = container.querySelector('#new-secret-card');
      const newSecretVal = container.querySelector('#new-secret-val');
      const copyBtn = container.querySelector('#copy-new-secret-btn');

      newSecretVal.textContent = res.secret;
      newSecretCard.style.display = 'block';
      copyBtn.onclick = function () {
        copyToClipboard(res.secret, this, 'Copy Key');
      };

      toast('Device key reset', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#revoke-device-btn')?.addEventListener('click', async () => {
    if (!confirm(`Remove "${device.name}" from your household?`)) {
      return;
    }

    try {
      await api.revokeDevice(slug, deviceId);
      toast(`Removed "${device.name}"`, 'info');
      router.navigate(`#/t/${slug}/devices`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
