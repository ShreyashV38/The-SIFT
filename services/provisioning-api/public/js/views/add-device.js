// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Add Device Wizard (#/t/:slug/devices/new)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard, downloadBlob, generateSketch, renderSpinner } from '../ui.js';

export async function renderAddDevice(container, slug, router) {
  let step = 1;
  let deviceState = {
    name: '',
    kind: 'sensor',
    wifiSsid: '',
    wifiPassword: '',
  };
  let configData = null;
  let tenantData = null;
  let registeredData = null;
  let pollInterval = null;

  try {
    [configData, tenantData] = await Promise.all([
      api.getConfig(),
      api.getTenant(slug),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <div class="banner banner-danger">
          <strong>Error:</strong> ${err.message}
        </div>
        <button id="back-btn" class="btn btn-secondary">← Back to Devices</button>
      </div>
    `;
    container.querySelector('#back-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}/devices`));
    return;
  }

  // Cleanup polling when navigating away
  const originalHash = window.location.hash;
  const hashChecker = () => {
    if (window.location.hash !== originalHash && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
      window.removeEventListener('hashchange', hashChecker);
    }
  };
  window.addEventListener('hashchange', hashChecker);

  const limits = tenantData.limits || { devices: { used: 0, max: 10 } };
  const isLimitReached = limits.devices.used >= limits.devices.max;

  function render() {
    container.innerHTML = `
      <div style="max-width: 720px; margin: 1.5rem auto;">
        <div class="stepper-nav">
          <div class="stepper-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
            <div class="step-circle">1</div>
            <span class="step-label">Name & Type</span>
          </div>
          <div class="stepper-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
            <div class="step-circle">2</div>
            <span class="step-label">Credentials</span>
          </div>
          <div class="stepper-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}">
            <div class="step-circle">3</div>
            <span class="step-label">Connect</span>
          </div>
          <div class="stepper-step ${step === 4 ? 'active' : ''}">
            <div class="step-circle">4</div>
            <span class="step-label">Connected</span>
          </div>
        </div>

        <div id="step-content"></div>
      </div>
    `;

    const stepContainer = container.querySelector('#step-content');
    if (step === 1) renderStep1(stepContainer);
    else if (step === 2) renderStep2(stepContainer);
    else if (step === 3) renderStep3(stepContainer);
    else if (step === 4) renderStep4(stepContainer);
  }

  // Step 1: Name and Kind
  function renderStep1(el) {
    if (isLimitReached) {
      el.innerHTML = `
        <div class="card">
          <div class="banner banner-danger">
            <strong>Plan Limit Reached:</strong> Your household has reached the maximum of ${limits.devices.max} devices for the ${tenantData.tenant.plan} plan.
          </div>
          <p>To register additional devices, upgrade your plan on the Plan & Billing page.</p>
          <div style="display: flex; gap: 0.5rem;">
            <a href="#/t/${slug}/plan" class="btn btn-primary">Upgrade Plan →</a>
            <a href="#/t/${slug}/devices" class="btn btn-secondary">Back to Devices</a>
          </div>
        </div>
      `;
      return;
    }

    const warnings = configData.warnings || [];

    el.innerHTML = `
      <div class="card">
        <h2>Add a Smart Device</h2>
        <p>A device is any ESP32 board, or a virtual sensor simulator running on your computer.</p>

        ${warnings.length > 0 ? `
          <div class="banner banner-warning">
            <div>
              <strong>⚠️ Network Configuration Notice:</strong>
              <div style="font-size: 0.8rem; margin-top: 0.25rem;">${warnings.join('<br>')}</div>
            </div>
          </div>
        ` : ''}

        <div id="step1-error" class="banner banner-danger" style="display: none;"></div>

        <form id="step1-form">
          <div class="form-group">
            <label for="dev-name">Device Name</label>
            <input type="text" id="dev-name" required value="${deviceState.name}" placeholder="Living Room Temperature" maxlength="40">
            <div class="form-hint">A friendly label (1-40 characters).</div>
          </div>

          <div class="form-group">
            <label for="dev-kind">Device Kind</label>
            <select id="dev-kind">
              <option value="sensor" ${deviceState.kind === 'sensor' ? 'selected' : ''}>Sensor (transmits temperature & humidity telemetry)</option>
              <option value="switch" ${deviceState.kind === 'switch' ? 'selected' : ''}>Switch (toggles an LED / Relay via commands)</option>
            </select>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem;">
            <a href="#/t/${slug}/devices" class="btn btn-secondary">Cancel</a>
            <button type="submit" id="step1-submit" class="btn btn-primary">
              Register & Generate Credentials →
            </button>
          </div>
        </form>
      </div>
    `;

    const form = el.querySelector('#step1-form');
    const submitBtn = el.querySelector('#step1-submit');
    const errorBanner = el.querySelector('#step1-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner.style.display = 'none';

      const nameVal = el.querySelector('#dev-name').value.trim();
      const kindVal = el.querySelector('#dev-kind').value;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Registering device...';

      try {
        const res = await api.createDevice(slug, nameVal, kindVal);
        registeredData = res;
        deviceState.name = nameVal;
        deviceState.kind = kindVal;
        step = 2;
        render();
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to register device.';
        errorBanner.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register & Generate Credentials →';
      }
    });
  }

  // Step 2: Credentials (Shown Once)
  function renderStep2(el) {
    const creds = registeredData?.credentials || {};
    const dev = registeredData?.device || {};

    el.innerHTML = `
      <div class="card">
        <div class="banner banner-danger">
          <strong>⚠️ Save These Credentials Now:</strong> These secrets are shown only once. They are never stored in browser history or logs.
        </div>

        <h2>Device Credentials: ${dev.name}</h2>
        <p>Use these settings in your ESP32 sketch or virtual device config file.</p>

        <div style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-sm); margin: 1rem 0;">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">MQTT BROKER HOST & PORT</div>
          <div class="copy-box">
            <span>${creds.mqttHost || '127.0.0.1'}:${creds.mqttPort || 1883}</span>
            <button id="copy-host-btn" class="btn btn-secondary btn-sm">Copy Host</button>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">CLIENT ID & USERNAME</div>
          <div class="copy-box">
            <span>${creds.clientId || creds.device_id}</span>
            <button id="copy-client-btn" class="btn btn-secondary btn-sm">Copy ID</button>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">DEVICE SECRET (PASSWORD)</div>
          <div class="copy-box">
            <span style="color: var(--warning);">${creds.secret || creds.device_secret}</span>
            <button id="copy-sec-btn" class="btn btn-secondary btn-sm">Copy Secret</button>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">TELEMETRY TOPIC</div>
          <div class="copy-box">
            <span>${creds.telemetryTopic}</span>
            <button id="copy-tel-btn" class="btn btn-secondary btn-sm">Copy Topic</button>
          </div>

          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">COMMAND TOPIC</div>
          <div class="copy-box">
            <span>${creds.commandTopic}</span>
            <button id="copy-cmd-btn" class="btn btn-secondary btn-sm">Copy Topic</button>
          </div>
        </div>

        <!-- Optional WiFi prefill for sketch -->
        <div class="card" style="background: var(--bg-surface); border: 1px dashed var(--border); margin: 1.25rem 0;">
          <h3>Optional: Embed WiFi into Downloadable Sketch</h3>
          <p style="font-size: 0.8rem;">Your WiFi details are never sent to the server; they are embedded directly into the sketch inside your browser.</p>

          <div class="form-row">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="sketch-wifi-ssid">WiFi SSID (2.4 GHz)</label>
              <input type="text" id="sketch-wifi-ssid" placeholder="HomeNetwork_2.4G" value="${deviceState.wifiSsid}">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label for="sketch-wifi-pass">WiFi Password</label>
              <input type="password" id="sketch-wifi-pass" placeholder="••••••••" value="${deviceState.wifiPassword}">
            </div>
          </div>
        </div>

        <!-- Download Buttons -->
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem;">
          <button id="download-sketch-btn" class="btn btn-secondary">
            📥 Download sift-device.ino (ESP32)
          </button>
          <button id="download-json-btn" class="btn btn-secondary">
            📥 Download sift-device.json (Virtual)
          </button>
          <a href="/tools/one-device.js" download="one-device.js" class="btn btn-secondary">
            📥 Download one-device.js (CLI)
          </a>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; user-select: none;">
            <input type="checkbox" id="saved-creds-check">
            <span>I have saved these credentials / downloaded my files.</span>
          </label>
        </div>

        <button id="continue-to-step3" class="btn btn-primary" disabled>
          Continue to Connection Guide →
        </button>
      </div>
    `;

    // Copy handlers
    el.querySelector('#copy-host-btn').addEventListener('click', function() {
      copyToClipboard(creds.mqttHost || '127.0.0.1', this);
    });
    el.querySelector('#copy-client-btn').addEventListener('click', function() {
      copyToClipboard(creds.clientId || creds.device_id, this);
    });
    el.querySelector('#copy-sec-btn').addEventListener('click', function() {
      copyToClipboard(creds.secret || creds.device_secret, this);
    });
    el.querySelector('#copy-tel-btn').addEventListener('click', function() {
      copyToClipboard(creds.telemetryTopic, this);
    });
    el.querySelector('#copy-cmd-btn').addEventListener('click', function() {
      copyToClipboard(creds.commandTopic, this);
    });

    // Download sketch
    el.querySelector('#download-sketch-btn').addEventListener('click', () => {
      const ssid = el.querySelector('#sketch-wifi-ssid').value.trim();
      const pass = el.querySelector('#sketch-wifi-pass').value;
      deviceState.wifiSsid = ssid;
      deviceState.wifiPassword = pass;

      const code = generateSketch({
        deviceName: dev.name,
        deviceKind: dev.kind,
        wifiSsid: ssid,
        wifiPassword: pass,
        mqttHost: creds.mqttHost || '127.0.0.1',
        mqttPort: creds.mqttPort || 1883,
        mqttClientId: creds.clientId,
        mqttUsername: creds.username || creds.clientId,
        mqttPassword: creds.secret || creds.password,
        telemetryTopic: creds.telemetryTopic,
        commandTopic: creds.commandTopic,
        deviceId: creds.device_id || dev.id,
        publishIntervalMs: 10000,
      });

      downloadBlob('sift-device.ino', code, 'text/x-c');
      toast('sift-device.ino generated & downloaded', 'success');
    });

    // Download JSON config
    el.querySelector('#download-json-btn').addEventListener('click', () => {
      const configObj = {
        schema: 1,
        tenant: slug,
        device: {
          id: String(creds.device_id || dev.id),
          name: dev.name,
          kind: dev.kind,
        },
        mqtt: {
          host: creds.mqttHost || '127.0.0.1',
          port: creds.mqttPort || 1883,
          tls: false,
          clientId: creds.clientId,
          username: creds.username || creds.clientId,
          password: creds.secret || creds.password,
          telemetryTopic: creds.telemetryTopic,
          commandTopic: creds.commandTopic,
        },
        publishIntervalSeconds: 10,
      };

      downloadBlob('sift-device.json', JSON.stringify(configObj, null, 2), 'application/json');
      toast('sift-device.json generated & downloaded', 'success');
    });

    const check = el.querySelector('#saved-creds-check');
    const continueBtn = el.querySelector('#continue-to-step3');
    check.addEventListener('change', () => {
      continueBtn.disabled = !check.checked;
    });

    continueBtn.addEventListener('click', () => {
      step = 3;
      render();
    });
  }

  // Step 3: Connect & Poll Live
  function renderStep3(el) {
    const devId = registeredData?.device?.id;
    let activeTab = 'esp32';

    el.innerHTML = `
      <div class="card">
        <h2>Connect Your Device</h2>
        <p>Transmit your first telemetry payload to verify the connection.</p>

        <!-- Tabs -->
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
          <button id="tab-esp32" class="btn ${activeTab === 'esp32' ? 'btn-primary' : 'btn-secondary'} btn-sm">
            I Have an ESP32 Board
          </button>
          <button id="tab-virtual" class="btn ${activeTab === 'virtual' ? 'btn-primary' : 'btn-secondary'} btn-sm">
            Virtual Device (No Hardware)
          </button>
        </div>

        <div id="tab-instructions"></div>

        <!-- Live Connection Status Box -->
        <div class="card" style="background: var(--bg-card); text-align: center; padding: 1.5rem; margin-top: 1.5rem;">
          <div id="status-indicator">
            ${renderSpinner()}
            <h3 style="margin-top: 0.75rem;">Waiting for the first message...</h3>
            <p style="font-size: 0.85rem;">Checking status every 3 seconds. Start your device to transmit.</p>
          </div>
          <div id="troubleshoot-hint" style="display: none; margin-top: 1rem;" class="banner banner-warning">
            Still waiting after several attempts? Check our <a href="#/help/esp32" style="color: inherit; text-decoration: underline;">troubleshooting guide</a>.
          </div>
        </div>
      </div>
    `;

    const instructionsEl = el.querySelector('#tab-instructions');

    function renderInstructions() {
      if (activeTab === 'esp32') {
        instructionsEl.innerHTML = `
          <ol style="margin-left: 1.25rem; font-size: 0.85rem; line-height: 1.8;">
            <li>Open the downloaded <code>sift-device.ino</code> in <strong>Arduino IDE 2</strong> (accept the folder prompt).</li>
            <li>Ensure <strong>PubSubClient</strong> library (v2.8+) is installed via the Library Manager.</li>
            <li>Select board: <strong>ESP32 Dev Module</strong> and select your board's COM port.</li>
            <li>If you didn't embed WiFi credentials, fill in <code>WIFI_SSID</code> and <code>WIFI_PASSWORD</code>.</li>
            <li>Click <strong>Upload</strong> (hold the BOOT button if upload doesn't start automatically).</li>
            <li>Open <strong>Serial Monitor at 115200 baud</strong>. You should see <code>WiFi connected</code> then <code>Published (ok)</code>.</li>
          </ol>
        `;
      } else {
        instructionsEl.innerHTML = `
          <div style="font-size: 0.85rem; line-height: 1.7;">
            <p>Ensure you have downloaded both <code>sift-device.json</code> and <code>one-device.js</code> into the same directory.</p>
            <p>Open PowerShell or Terminal in that folder and run:</p>
            <div class="copy-box" style="margin: 0.5rem 0;">
              <code>npm install mqtt && node one-device.js --config .\\sift-device.json</code>
              <button id="copy-run-cmd" class="btn btn-secondary btn-sm">Copy</button>
            </div>
            <p class="form-hint">The virtual device will connect, transmit simulated sensor telemetry, and listen for commands.</p>
          </div>
        `;
        instructionsEl.querySelector('#copy-run-cmd')?.addEventListener('click', function() {
          copyToClipboard('npm install mqtt && node one-device.js --config .\\sift-device.json', this);
        });
      }
    }

    renderInstructions();

    el.querySelector('#tab-esp32').addEventListener('click', () => {
      activeTab = 'esp32';
      el.querySelector('#tab-esp32').className = 'btn btn-primary btn-sm';
      el.querySelector('#tab-virtual').className = 'btn btn-secondary btn-sm';
      renderInstructions();
    });

    el.querySelector('#tab-virtual').addEventListener('click', () => {
      activeTab = 'virtual';
      el.querySelector('#tab-esp32').className = 'btn btn-secondary btn-sm';
      el.querySelector('#tab-virtual').className = 'btn btn-primary btn-sm';
      renderInstructions();
    });

    // Start live polling every 3 seconds (Section 8)
    let pollCount = 0;
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      pollCount++;
      if (pollCount > 10) {
        const hint = el.querySelector('#troubleshoot-hint');
        if (hint) hint.style.display = 'block';
      }

      try {
        const statusRes = await api.getDeviceStatus(slug, devId);
        const deviceData = statusRes.device || {};

        if (deviceData.firstConnectedAt || deviceData.status === 'online') {
          clearInterval(pollInterval);
          pollInterval = null;
          registeredData.device = deviceData;
          step = 4;
          render();
        }
      } catch (err) {
        // Continue polling silently
      }
    }, 3000);
  }

  // Step 4: Done
  function renderStep4(el) {
    const dev = registeredData?.device || {};
    const haUrl = tenantData?.urls?.homeAssistant || `http://${slug}.localtest.me:8123`;

    el.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.5rem 1.5rem;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
        <h2>Device Connected!</h2>
        <p>Telemetry was successfully received from <strong>${dev.name}</strong>.</p>

        <div class="card" style="background: var(--bg-card); max-width: 480px; margin: 1.5rem auto; text-align: left;">
          <div style="font-size: 0.85rem; margin-bottom: 0.5rem;">
            <strong>Status:</strong> <span class="badge badge-online">● Connected Online</span>
          </div>
          <div style="font-size: 0.85rem; margin-bottom: 0.5rem;">
            <strong>First Connected:</strong> ${new Date(dev.firstConnectedAt || Date.now()).toLocaleTimeString()}
          </div>
          ${dev.lastValue ? `
            <div style="font-size: 0.85rem; margin-bottom: 0.5rem;">
              <strong>Latest Telemetry:</strong>
              <code style="color: var(--info); font-family: var(--font-mono);">${JSON.stringify(dev.lastValue)}</code>
            </div>
          ` : ''}

          ${dev.kind === 'switch' ? `
            <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border);">
              <strong>Test Command:</strong>
              <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <button id="send-on-btn" class="btn btn-secondary btn-sm">Turn ON</button>
                <button id="send-off-btn" class="btn btn-secondary btn-sm">Turn OFF</button>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="banner banner-info" style="max-width: 480px; margin: 0 auto 1.5rem auto; text-align: left;">
          💡 <strong>Home Assistant Tip:</strong> Search for "${dev.name}" in Home Assistant under <em>Settings → Devices & services → Entities</em>.
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <a href="${haUrl}" target="_blank" rel="noopener" class="btn btn-primary">
            Open Home Assistant ↗
          </a>
          <a href="#/t/${slug}/devices" class="btn btn-secondary">
            Back to Devices
          </a>
        </div>
      </div>
    `;

    // Test command handlers for switch
    if (dev.kind === 'switch') {
      el.querySelector('#send-on-btn')?.addEventListener('click', async () => {
        try {
          await api.sendTestCommand(slug, dev.id, 'ON');
          toast('Command "ON" published to device', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      el.querySelector('#send-off-btn')?.addEventListener('click', async () => {
        try {
          await api.sendTestCommand(slug, dev.id, 'OFF');
          toast('Command "OFF" published to device', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }
  }

  render();
}
