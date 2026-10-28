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

const LIVE_POLL_INTERVAL_MS = 2000;

function buildStatusPill(device) {
  if (device.status === 'online') {
    return `<span class="badge badge-online"><span class="led-dot led-emerald"></span>Online</span>`;
  }
  if (device.status === 'pending') {
    return `<span class="badge badge-pending"><span class="led-dot led-amber"></span>Waiting for data</span>`;
  }
  if (device.status === 'revoked') {
    return `<span class="badge badge-revoked"><span class="led-dot led-rose"></span>Removed</span>`;
  }
  return `<span class="badge badge-offline"><span class="led-dot led-muted"></span>Offline</span>`;
}

function buildReadingsHtml(device) {
  const readingItems = [];
  const isSwitch = device.kind === 'switch';

  if (device.lastValue && typeof device.lastValue === 'object') {
    if (isSwitch) {
      // Switch devices ONLY display Switch State — never display temperature or humidity
      const stateVal = device.lastValue.state !== undefined
        ? device.lastValue.state
        : (device.lastValue.switch !== undefined ? (device.lastValue.switch ? 'ON' : 'OFF') : undefined);
      if (stateVal !== undefined) {
        readingItems.push({
          label: 'Switch State',
          val: String(stateVal).toUpperCase(),
          unit: '',
        });
      }
    } else if (device.lastSeenAt) {
      // Sensor devices ONLY display real sensor readings when the device has actually sent data
      Object.keys(device.lastValue).forEach(key => {
        const k = key.toLowerCase();
        if (k === 'id' || k === 'deviceid' || k === 'state' || k === 'switch') return;
        const val = device.lastValue[key];
        if (val !== null && val !== undefined && val !== '' && !Number.isNaN(Number(val))) {
          readingItems.push({
            label: formatReadingLabel(key),
            val: Number(val),
            unit: formatReadingUnit(key),
          });
        }
      });
    }
  }

  const bottomMargin = isSwitch && device.status !== 'revoked' ? 'var(--space-lg)' : '0';
  const hintText = device.status === 'online' ? 'Live reading' : 'Last reported reading';

  if (readingItems.length > 0) {
    return `
      <div class="stat-grid" style="margin-bottom: ${bottomMargin};">
        ${readingItems.map(item => `
          <div class="stat-card">
            <div class="stat-label">${item.label}</div>
            <div class="stat-value">
              ${item.val} <span style="font-size: 0.9rem; color: var(--text-muted);">${item.unit}</span>
            </div>
            <div class="stat-hint">${hintText}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="empty-state" style="padding: var(--space-xl) var(--space-md); margin-bottom: ${bottomMargin};">
      <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 0;">
        Waiting for this device to send its first real reading.
      </p>
    </div>
  `;
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

  const statusPill = buildStatusPill(device);
  const typeLabel = device.kind === 'switch' ? 'Switch' : 'Sensor';

  container.innerHTML = `
    <div>
      <!-- Header -->
      <div class="page-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap;">
            <h1>${device.name}</h1>
            <span class="badge badge-role">${typeLabel}</span>
            <span id="device-status-pill">${statusPill}</span>
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
            <span class="data-label" id="device-last-updated">Last updated: ${formatRelativeTime(device.lastSeenAt)}</span>
          </div>
        </div>

        <div id="device-live-readings" aria-live="polite">
          ${buildReadingsHtml(device)}
        </div>

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

  // ---- Live polling: silently refresh status & telemetry every 2 seconds ----
  const routeHash = window.location.hash;
  let lastStatus = device.status;
  let lastReadingsKey = JSON.stringify(device.lastValue ?? null);
  let lastSeenAt = device.lastSeenAt;
  let inFlight = false;

  async function refreshLiveState(force = false) {
    if (window.location.hash !== routeHash || !container.querySelector('#device-live-readings')) {
      clearInterval(pollId);
      return;
    }
    if ((inFlight && !force) || document.hidden) return;
    inFlight = true;

    try {
      const res = await api.getDeviceStatus(slug, deviceId);
      const latest = res.device || {};
      if (window.location.hash !== routeHash) return;

      const pillEl = container.querySelector('#device-status-pill');
      const updatedEl = container.querySelector('#device-last-updated');
      const readingsEl = container.querySelector('#device-live-readings');

      if (latest.lastSeenAt) lastSeenAt = latest.lastSeenAt;
      if (updatedEl) updatedEl.textContent = `Last updated: ${formatRelativeTime(lastSeenAt)}`;

      if (pillEl && (latest.status !== lastStatus || force)) {
        lastStatus = latest.status;
        pillEl.innerHTML = buildStatusPill(latest);
      }

      const readingsKey = JSON.stringify({ v: latest.lastValue ?? null, s: latest.status });
      if (readingsEl && (readingsKey !== lastReadingsKey || force)) {
        lastReadingsKey = readingsKey;
        readingsEl.innerHTML = buildReadingsHtml({ ...device, ...latest });
      }
    } catch {
      // Silent: keep showing the last known values and retry on the next tick
    } finally {
      inFlight = false;
    }
  }

  const pollId = setInterval(() => refreshLiveState(false), LIVE_POLL_INTERVAL_MS);
  router.registerInterval?.(pollId);

  container.querySelector('#cmd-on-btn')?.addEventListener('click', async () => {
    try {
      const readingsEl = container.querySelector('#device-live-readings');
      if (readingsEl) {
        readingsEl.innerHTML = buildReadingsHtml({ ...device, status: lastStatus, lastValue: { state: 'ON' } });
      }
      await api.sendTestCommand(slug, deviceId, 'ON');
      toast(`Turned ON "${device.name}"`, 'success');
      await refreshLiveState(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#cmd-off-btn')?.addEventListener('click', async () => {
    try {
      const readingsEl = container.querySelector('#device-live-readings');
      if (readingsEl) {
        readingsEl.innerHTML = buildReadingsHtml({ ...device, status: lastStatus, lastValue: { state: 'OFF' } });
      }
      await api.sendTestCommand(slug, deviceId, 'OFF');
      toast(`Turned OFF "${device.name}"`, 'success');
      await refreshLiveState(true);
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
    if (!confirm(`Permanently delete "${device.name}" from your household and Home Assistant?`)) {
      return;
    }

    try {
      await api.revokeDevice(slug, deviceId);
      toast(`Permanently deleted "${device.name}"`, 'success');
      router.navigate(`#/t/${slug}/devices`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
