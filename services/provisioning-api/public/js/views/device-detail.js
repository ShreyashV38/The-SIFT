// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Device Detail View (#/t/:slug/devices/:id)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard, formatRelativeTime, renderSpinner } from '../ui.js';

export async function renderDeviceDetail(container, slug, deviceId, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-weight: 500;">Loading device configuration...</p>
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
          <strong>Failed to load device:</strong> ${err.message}
        </div>
        <button id="back-devices-btn" class="btn btn-secondary">← Back to Devices</button>
      </div>
    `;
    container.querySelector('#back-devices-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}/devices`));
    return;
  }

  const device = deviceRes.device || {};
  const callerRole = tenantData.callerRole || 'member';
  const isAdmin = callerRole === 'admin' || callerRole === 'owner';

  const telemetryTopic = `channels/${tenantData.tenant.mg_chan_telemetry || 'telemetry'}/messages`;
  const commandTopic = `channels/${tenantData.tenant.mg_chan_commands || 'commands'}/messages`;

  let statusBadge = '';
  if (device.status === 'online') {
    statusBadge = `
      <span class="badge badge-online">
        <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--success); box-shadow:0 0 6px rgba(16,185,129,0.8);"></span>
        Online
      </span>
    `;
  } else if (device.status === 'pending') {
    statusBadge = '<span class="badge badge-pending">Pending Connection</span>';
  } else if (device.status === 'revoked') {
    statusBadge = '<span class="badge badge-revoked">Revoked</span>';
  } else {
    statusBadge = '<span class="badge badge-offline">○ Offline</span>';
  }

  // Format telemetry metrics
  let telemetryItems = [];
  if (device.lastValue && typeof device.lastValue === 'object') {
    Object.keys(device.lastValue).forEach(key => {
      if (key !== 'id') {
        telemetryItems.push({ key, val: device.lastValue[key] });
      }
    });
  }

  container.innerHTML = `
    <div>
      <div class="page-header">
        <div>
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem; flex-wrap: wrap;">
            <h1>${device.name}</h1>
            <span class="badge badge-role">${device.kind}</span>
            ${statusBadge}
          </div>
          <p style="margin-bottom: 0;">
            <span class="data-label" style="display: inline; text-transform: none; letter-spacing: normal;">Client ID:</span>
            <code style="margin-left: 0.25rem;">${device.mgClientId || 'dev_' + device.id}</code>
          </p>
        </div>
        <div class="page-header-actions">
          <a href="#/t/${slug}/devices" class="btn btn-secondary btn-sm">← Back to Devices</a>
        </div>
      </div>

      <!-- Secret rotation banner if just rotated -->
      <div id="new-secret-card" class="card" style="display: none; border-color: var(--warning-border); background: #FFFDF7;">
        <div class="banner banner-warning">
          <strong>New Device Secret Generated:</strong> Save this new secret immediately. It will not be shown again.
        </div>
        <div class="data-label" style="margin-bottom: 0.35rem;">New Device Secret</div>
        <div class="copy-box">
          <span id="new-secret-val" style="color: var(--warning-text); font-weight: 700; font-family: var(--font-mono);"></span>
          <button id="copy-new-secret-btn" class="btn btn-secondary btn-sm">Copy</button>
        </div>
      </div>

      <!-- Live Telemetry Inspector Card -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 0.2rem;">Telemetry & Live State</h3>
            <span class="data-label" style="margin-bottom: 0;">Last received: ${formatRelativeTime(device.lastSeenAt)}</span>
          </div>
        </div>

        ${telemetryItems.length > 0 ? `
          <div class="stat-grid" style="margin-bottom: var(--space-lg);">
            ${telemetryItems.map(item => `
              <div class="stat-card">
                <div class="stat-label">${item.key}</div>
                <div class="stat-value" style="font-size: 1.5rem; font-family: var(--font-mono); color: var(--brand-teal);">
                  ${item.val} <span style="font-size: 1rem; color: var(--text-muted);">${item.key.toLowerCase().includes('temp') ? '°C' : item.key.toLowerCase().includes('hum') ? '%' : ''}</span>
                </div>
                <div class="stat-hint">Active reading stream</div>
              </div>
            `).join('')}
          </div>
        ` : (device.lastValue ? `
          <div style="margin-bottom: var(--space-lg); padding: var(--space-md); background: var(--bg-surface-alt); border-radius: var(--radius-sm);">
            <div class="data-label">State Value</div>
            <div class="data-value" style="font-size: 1.25rem; color: var(--brand-teal); font-family: var(--font-mono);">${String(device.lastValue)}</div>
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-xl) var(--space-md); margin-bottom: var(--space-lg);">
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0;">
              No telemetry received from this device yet. Flash your ESP32 sketch or run <code>one-device.js</code> to stream readings.
            </p>
          </div>
        `)}

        ${device.lastValue ? `
          <div class="data-label" style="margin-bottom: 0.35rem;">Raw Telemetry Payload</div>
          <div class="terminal-box" style="margin-bottom: var(--space-lg);">
            ${JSON.stringify(device.lastValue, null, 2)}
          </div>
        ` : ''}

        ${device.kind === 'switch' && device.status !== 'revoked' ? `
          <hr class="section-divider">
          <h4>Switch Relay Control</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-md);">
            Publish an MQTT command to toggle physical relay GPIO or virtual switch state:
          </p>
          <div style="display: flex; gap: var(--space-sm);">
            <button id="cmd-on-btn" class="btn btn-primary btn-sm">Turn ON</button>
            <button id="cmd-off-btn" class="btn btn-secondary btn-sm">Turn OFF</button>
          </div>
        ` : ''}
      </div>

      <!-- Device Configuration & Identifiers -->
      <div class="card">
        <h3 style="margin-bottom: var(--space-lg);">Connection Channels & Identifiers</h3>

        <div class="info-grid" style="margin-bottom: var(--space-lg);">
          <div class="info-item">
            <div class="data-label">Magistrala Client ID</div>
            <div class="data-value" style="font-family: var(--font-mono); font-size: 0.85rem;">${device.mgClientId || 'dev_' + device.id}</div>
          </div>

          <div class="info-item">
            <div class="data-label">First Connected</div>
            <div class="data-value" style="font-size: 0.85rem;">
              ${device.firstConnectedAt ? new Date(device.firstConnectedAt).toLocaleString() : 'Not connected yet'}
            </div>
          </div>

          <div class="info-item">
            <div class="data-label">Last Ping / Heartbeat</div>
            <div class="data-value" style="font-size: 0.85rem;">
              ${formatRelativeTime(device.lastSeenAt)}
            </div>
          </div>
        </div>

        <div style="margin-bottom: var(--space-md);">
          <div class="data-label" style="margin-bottom: 0.35rem;">Telemetry MQTT Topic (Publish)</div>
          <div class="copy-box">
            <span>${telemetryTopic}</span>
            <button id="copy-tel-btn" class="btn btn-secondary btn-sm">Copy</button>
          </div>
        </div>

        <div>
          <div class="data-label" style="margin-bottom: 0.35rem;">Command MQTT Topic (Subscribe)</div>
          <div class="copy-box">
            <span>${commandTopic}</span>
            <button id="copy-cmd-btn" class="btn btn-secondary btn-sm">Copy</button>
          </div>
        </div>
      </div>

      <!-- Device Actions for Admin/Owner -->
      ${isAdmin && device.status !== 'revoked' ? `
        <div class="card danger-zone">
          <h3>Administrative Controls</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--space-lg);">
            Rotate the device authentication key or permanently revoke its access from the MQTT broker.
          </p>

          <div style="display: flex; gap: var(--space-md); flex-wrap: wrap;">
            <button id="rotate-secret-btn" class="btn btn-secondary btn-sm">Rotate Secret</button>
            <button id="revoke-device-btn" class="btn btn-danger btn-sm">Revoke Device</button>
          </div>
        </div>
      ` : ''}

      <div style="margin-top: var(--space-xl);">
        <a href="#/help/esp32" class="inline-link" style="font-size: 0.875rem;">
          View ESP32 & Virtual Simulator Setup Instructions →
        </a>
      </div>
    </div>
  `;

  // Copy topic buttons
  container.querySelector('#copy-tel-btn')?.addEventListener('click', function() {
    copyToClipboard(telemetryTopic, this);
  });
  container.querySelector('#copy-cmd-btn')?.addEventListener('click', function() {
    copyToClipboard(commandTopic, this);
  });

  // Switch commands
  container.querySelector('#cmd-on-btn')?.addEventListener('click', async () => {
    try {
      await api.sendTestCommand(slug, deviceId, 'ON');
      toast('Command "ON" published to device', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#cmd-off-btn')?.addEventListener('click', async () => {
    try {
      await api.sendTestCommand(slug, deviceId, 'OFF');
      toast('Command "OFF" published to device', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Rotate secret handler
  container.querySelector('#rotate-secret-btn')?.addEventListener('click', async () => {
    if (!confirm(`Are you sure you want to rotate the secret for "${device.name}"? The device will lose connection until updated with the new credentials.`)) {
      return;
    }

    try {
      const res = await api.rotateDeviceSecret(slug, deviceId);
      const newSecretCard = container.querySelector('#new-secret-card');
      const newSecretVal = container.querySelector('#new-secret-val');
      const copyBtn = container.querySelector('#copy-new-secret-btn');

      newSecretVal.textContent = res.secret;
      newSecretCard.style.display = 'block';
      copyBtn.onclick = function() {
        copyToClipboard(res.secret, this);
      };

      toast('Device secret rotated successfully', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Revoke device handler
  container.querySelector('#revoke-device-btn')?.addEventListener('click', async () => {
    if (!confirm(`Revoke device "${device.name}"? It will be disconnected immediately and prevented from reconnecting.`)) {
      return;
    }

    try {
      await api.revokeDevice(slug, deviceId);
      toast('Device revoked', 'info');
      router.navigate(`#/t/${slug}/devices`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
