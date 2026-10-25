// ---------------------------------------------------------------------------
// The-SIFT Cloud Portal — Hardware Inspector & Credentials Vault (#/t/:slug/devices/:id)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import {
  toast,
  copyToClipboard,
  downloadBlob,
  generateOneDeviceScript,
  formatRelativeTime,
  renderSpinner,
  resolveMqttHost,
} from '../ui.js';

export async function renderDeviceDetail(container, slug, deviceId, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-family: var(--font-mono); font-size: 0.8125rem;">
        INSPECTING HARDWARE TELEMETRY STATE...
      </p>
    </div>
  `;

  let tenantData, deviceRes, configData;
  try {
    [tenantData, deviceRes, configData] = await Promise.all([
      api.getTenant(slug),
      api.getDeviceStatus(slug, deviceId),
      api.getConfig().catch(() => ({})),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 2rem auto;">
        <div class="banner banner-danger">
          <strong>Hardware Inspection Failed:</strong> ${err.message}
        </div>
        <button id="back-devices-btn" class="btn btn-secondary">Back to Hardware Directory</button>
      </div>
    `;
    container.querySelector('#back-devices-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}/devices`));
    return;
  }

  const device = deviceRes.device || {};
  const callerRole = tenantData.callerRole || 'member';
  const isAdmin = callerRole === 'admin' || callerRole === 'owner';

  const brokerHost = resolveMqttHost(configData?.mqtt?.host);
  const brokerPort = configData?.mqtt?.port || 1883;
  const thingId = device.mgClientId || `dev_${device.id}`;
  const telemetryTopic = `channels/${tenantData.tenant.mg_chan_telemetry || 'telemetry'}/messages`;
  const commandTopic = `channels/${tenantData.tenant.mg_chan_commands || 'commands'}/messages`;

  let statusPill = '';
  if (device.status === 'online') {
    statusPill = `<span class="badge badge-online"><span class="led-dot led-emerald"></span>ONLINE</span>`;
  } else if (device.status === 'pending') {
    statusPill = `<span class="badge badge-pending"><span class="led-dot led-amber"></span>PENDING HANDSHAKE</span>`;
  } else if (device.status === 'revoked') {
    statusPill = `<span class="badge badge-revoked"><span class="led-dot led-rose"></span>REVOKED</span>`;
  } else {
    statusPill = `<span class="badge badge-offline"><span class="led-dot led-muted"></span>OFFLINE</span>`;
  }

  let telemetryItems = [];
  if (device.lastValue && typeof device.lastValue === 'object') {
    Object.keys(device.lastValue).forEach(key => {
      if (key !== 'id') {
        telemetryItems.push({ key, val: device.lastValue[key] });
      }
    });
  }

  const senmlPreview = JSON.stringify(
    [
      { bn: `${thingId}:`, n: 'temperature', u: 'Cel', v: 24.2 },
      { n: 'humidity', u: '%RH', v: 48.5 },
    ],
    null,
    2
  );

  container.innerHTML = `
    <div>
      <div class="page-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
            <h1>${device.name}</h1>
            <span class="badge badge-role">${device.kind}</span>
            ${statusPill}
          </div>
          <p style="margin-bottom: 0; font-size: 0.8125rem;">
            <span class="data-label" style="display: inline;">Magistrala Thing ID:</span>
            <code style="margin-left: 4px;">${thingId}</code>
          </p>
        </div>
        <div class="page-header-actions">
          <button type="button" id="download-verify-client-btn" class="btn btn-secondary btn-sm">
            Download Verification Client (sift-device-client.js)
          </button>
          <a href="#/t/${slug}/devices" class="btn btn-secondary btn-sm">Back to Hardware</a>
        </div>
      </div>

      <!-- Rotated Secret Vault Alert -->
      <div id="new-secret-card" class="card" style="display: none; border-color: var(--warning-border);">
        <div class="banner banner-warning">
          <strong>Rotated Thing Secret Issued:</strong> Copy and store this new secret immediately. It is displayed only once.
        </div>
        <div class="data-label">New Thing Secret / Access Key</div>
        <div class="copy-box">
          <span id="new-secret-val" style="color: var(--warning-text); font-weight: 600;"></span>
          <button type="button" id="copy-new-secret-btn" class="btn btn-secondary btn-sm">Copy Secret</button>
        </div>
      </div>

      <!-- Live Telemetry Readout Card -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 2px;">Live Telemetry Readout</h3>
            <span class="data-label">Last Packet Ingested: ${formatRelativeTime(device.lastSeenAt)}</span>
          </div>
        </div>

        ${telemetryItems.length > 0 ? `
          <div class="stat-grid" style="margin-bottom: var(--space-lg);">
            ${telemetryItems.map(item => `
              <div class="stat-card">
                <div class="stat-label">${item.key}</div>
                <div class="stat-value">
                  ${item.val} <span style="font-size: 0.9rem; color: var(--text-muted);">${item.key.toLowerCase().includes('temp') ? '°C' : item.key.toLowerCase().includes('hum') ? '%' : ''}</span>
                </div>
                <div class="stat-hint">Verified MQTT stream</div>
              </div>
            `).join('')}
          </div>
        ` : (device.lastValue ? `
          <div style="margin-bottom: var(--space-lg); padding: var(--space-md); background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div class="data-label">Current State</div>
            <div class="data-value mono" style="font-size: 1.25rem; color: var(--led-emerald);">${String(device.lastValue)}</div>
          </div>
        ` : `
          <div class="empty-state" style="padding: var(--space-xl) var(--space-md);">
            <p style="color: var(--text-muted); font-size: 0.84375rem; margin-bottom: 0;">
              No telemetry packets received yet. Publish a SenML or JSON payload to <code>${telemetryTopic}</code>.
            </p>
          </div>
        `)}

        ${device.lastValue ? `
          <div class="data-label">Raw Ingested Payload</div>
          <div class="terminal-box" style="margin-bottom: var(--space-md);">${JSON.stringify(device.lastValue, null, 2)}</div>
        ` : ''}

        ${device.kind === 'switch' && device.status !== 'revoked' ? `
          <hr class="section-divider">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div>
              <h4 style="margin-bottom: 2px;">Cloud Command Dispatch (Actuator Control)</h4>
              <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: 0;">
                Publish an immediate state transition command to <code>${commandTopic}</code>.
              </p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" id="cmd-on-btn" class="btn btn-primary btn-sm">Dispatch ON</button>
              <button type="button" id="cmd-off-btn" class="btn btn-secondary btn-sm">Dispatch OFF</button>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Cloud Channel Binding & SenML Schema -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 2px;">Cloud Channel Topology &amp; SenML Schema</h3>
            <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: 0;">
              Production MQTT broker endpoints and standardized telemetry payload format.
            </p>
          </div>
        </div>

        <div class="info-grid" style="margin-bottom: var(--space-lg);">
          <div class="info-item">
            <div class="data-label">Cloud Broker Endpoint</div>
            <div class="data-value mono" style="font-size: 0.8125rem;">${brokerHost}:${brokerPort}</div>
          </div>
          <div class="info-item">
            <div class="data-label">Initial Handshake</div>
            <div class="data-value mono" style="font-size: 0.8125rem;">
              ${device.firstConnectedAt ? new Date(device.firstConnectedAt).toLocaleString() : 'Awaiting connection'}
            </div>
          </div>
          <div class="info-item">
            <div class="data-label">Last Heartbeat</div>
            <div class="data-value mono" style="font-size: 0.8125rem;">${formatRelativeTime(device.lastSeenAt)}</div>
          </div>
        </div>

        <div style="margin-bottom: var(--space-md);">
          <div class="data-label">Telemetry Publish Topic</div>
          <div class="copy-box">
            <span>${telemetryTopic}</span>
            <button type="button" id="copy-tel-btn" class="btn btn-secondary btn-sm">Copy Topic</button>
          </div>
        </div>

        <div style="margin-bottom: var(--space-lg);">
          <div class="data-label">Command Subscribe Topic</div>
          <div class="copy-box">
            <span>${commandTopic}</span>
            <button type="button" id="copy-cmd-btn" class="btn btn-secondary btn-sm">Copy Topic</button>
          </div>
        </div>

        <div class="data-label">SenML Telemetry Payload Specification</div>
        <div class="terminal-box">${senmlPreview}</div>
      </div>

      <!-- Administrative Controls -->
      ${isAdmin && device.status !== 'revoked' ? `
        <div class="card danger-zone">
          <h3 style="margin-bottom: 4px;">Hardware Security &amp; Access Control</h3>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: var(--space-lg);">
            Rotate the Magistrala Thing Secret or permanently revoke this hardware endpoint from publishing to the household broker.
          </p>

          <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
            <button type="button" id="rotate-secret-btn" class="btn btn-secondary btn-sm">Rotate Thing Secret</button>
            <button type="button" id="revoke-device-btn" class="btn btn-danger btn-sm">Revoke Hardware Endpoint</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  container.querySelector('#copy-tel-btn')?.addEventListener('click', function() {
    copyToClipboard(telemetryTopic, this, 'Copy Topic');
  });
  container.querySelector('#copy-cmd-btn')?.addEventListener('click', function() {
    copyToClipboard(commandTopic, this, 'Copy Topic');
  });

  container.querySelector('#download-verify-client-btn')?.addEventListener('click', () => {
    downloadBlob('sift-device-client.js', generateOneDeviceScript(), 'text/javascript');
    toast('sift-device-client.js downloaded', 'success');
  });

  container.querySelector('#cmd-on-btn')?.addEventListener('click', async () => {
    try {
      await api.sendTestCommand(slug, deviceId, 'ON');
      toast('Dispatched ON command to device', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#cmd-off-btn')?.addEventListener('click', async () => {
    try {
      await api.sendTestCommand(slug, deviceId, 'OFF');
      toast('Dispatched OFF command to device', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#rotate-secret-btn')?.addEventListener('click', async () => {
    if (!confirm(`Rotate Thing Secret for "${device.name}"? Existing firmware must be updated with the new secret.`)) {
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
        copyToClipboard(res.secret, this, 'Copy Secret');
      };

      toast('Thing Secret rotated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#revoke-device-btn')?.addEventListener('click', async () => {
    if (!confirm(`Permanently revoke hardware endpoint "${device.name}"?`)) {
      return;
    }

    try {
      await api.revokeDevice(slug, deviceId);
      toast('Hardware endpoint revoked', 'info');
      router.navigate(`#/t/${slug}/devices`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
