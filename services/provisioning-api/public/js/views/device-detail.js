// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Device Detail View (#/t/:slug/devices/:id)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard, formatRelativeTime, renderSpinner } from '../ui.js';

export async function renderDeviceDetail(container, slug, deviceId, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      ${renderSpinner()}
      <p style="margin-top: 0.5rem;">Loading device configuration...</p>
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
      <div class="card">
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
  if (device.status === 'online') statusBadge = '<span class="badge badge-online">● Online</span>';
  else if (device.status === 'pending') statusBadge = '<span class="badge badge-pending">⏳ Pending Connection</span>';
  else if (device.status === 'revoked') statusBadge = '<span class="badge badge-revoked">✕ Revoked</span>';
  else statusBadge = '<span class="badge badge-offline">○ Offline</span>';

  container.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h1>${device.name}</h1>
          <p>Kind: <span class="badge badge-role">${device.kind}</span> • Status: ${statusBadge}</p>
        </div>

        <a href="#/t/${slug}/devices" class="btn btn-secondary btn-sm">
          ← Back to Devices
        </a>
      </div>

      <!-- Secret rotation banner if just rotated -->
      <div id="new-secret-card" class="card" style="display: none; background: var(--bg-card); border-color: var(--warning);">
        <div class="banner banner-warning">
          <strong>⚠️ Secret Rotated:</strong> Save this new secret immediately. It will not be shown again.
        </div>
        <div style="font-size: 0.85rem; margin-bottom: 0.35rem;"><strong>New Device Secret:</strong></div>
        <div class="copy-box">
          <span id="new-secret-val" style="color: var(--warning); font-weight: 600;"></span>
          <button id="copy-new-secret-btn" class="btn btn-secondary btn-sm">Copy</button>
        </div>
      </div>

      <!-- Device Configuration & Status -->
      <div class="card">
        <h3>Device Information</h3>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1rem 0;">
          <div>
            <div style="font-size: 0.8rem; color: var(--text-dim);">DEVICE IDENTIFIER</div>
            <div style="font-family: var(--font-mono); font-size: 0.9rem; margin-top: 0.25rem;">
              ${device.mgClientId || 'dev_' + device.id}
            </div>
          </div>

          <div>
            <div style="font-size: 0.8rem; color: var(--text-dim);">FIRST CONNECTED</div>
            <div style="font-size: 0.9rem; margin-top: 0.25rem;">
              ${device.firstConnectedAt ? new Date(device.firstConnectedAt).toLocaleString() : 'Not connected yet'}
            </div>
          </div>

          <div>
            <div style="font-size: 0.8rem; color: var(--text-dim);">LAST SEEN</div>
            <div style="font-size: 0.9rem; margin-top: 0.25rem;">
              ${formatRelativeTime(device.lastSeenAt)}
            </div>
          </div>
        </div>

        <div style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 1rem;">
          <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 0.25rem;">TELEMETRY MQTT TOPIC</div>
          <div class="copy-box">
            <span>${telemetryTopic}</span>
            <button id="copy-tel-btn" class="btn btn-secondary btn-sm">Copy</button>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 0.25rem;">COMMAND MQTT TOPIC</div>
          <div class="copy-box">
            <span>${commandTopic}</span>
            <button id="copy-cmd-btn" class="btn btn-secondary btn-sm">Copy</button>
          </div>
        </div>

        ${device.kind === 'switch' && device.status !== 'revoked' ? `
          <div style="margin-top: 1.25rem; border-top: 1px solid var(--border); padding-top: 1rem;">
            <h4>Send Test Command (Switch Control)</h4>
            <p style="font-size: 0.85rem;">Publish an MQTT command to toggle the physical or virtual relay:</p>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
              <button id="cmd-on-btn" class="btn btn-secondary btn-sm">Turn ON</button>
              <button id="cmd-off-btn" class="btn btn-secondary btn-sm">Turn OFF</button>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Device Actions for Admin/Owner -->
      ${isAdmin && device.status !== 'revoked' ? `
        <div class="card" style="border-color: rgba(239, 68, 68, 0.2);">
          <h3>Administrative Actions</h3>
          <p style="font-size: 0.85rem;">Manage security credentials or revoke device access.</p>

          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1rem;">
            <button id="rotate-secret-btn" class="btn btn-secondary btn-sm">
              🔑 Rotate Secret
            </button>
            <button id="revoke-device-btn" class="btn btn-danger btn-sm">
              ✕ Revoke Device
            </button>
          </div>
        </div>
      ` : ''}

      <div style="margin-top: 1.5rem;">
        <a href="#/help/esp32" class="btn btn-secondary btn-sm">
          📖 View ESP32 & Virtual Device Setup Instructions →
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
    if (!confirm('Are you sure you want to rotate the device secret? The device will lose connection until re-flashed or reconfigured with the new secret.')) {
      return;
    }
    try {
      const res = await api.rotateDeviceSecret(slug, deviceId);
      const newSecret = res.secret || res.credentials?.secret;

      const newSecretCard = container.querySelector('#new-secret-card');
      const valSpan = container.querySelector('#new-secret-val');
      valSpan.textContent = newSecret;
      newSecretCard.style.display = 'block';

      container.querySelector('#copy-new-secret-btn').addEventListener('click', function() {
        copyToClipboard(newSecret, this);
      });

      toast('Secret rotated successfully', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Revoke device handler
  container.querySelector('#revoke-device-btn')?.addEventListener('click', async () => {
    if (!confirm(`Are you sure you want to revoke "${device.name}"? It will be disconnected immediately and prevented from accessing MQTT.`)) {
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
