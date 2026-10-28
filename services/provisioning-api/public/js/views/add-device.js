// ---------------------------------------------------------------------------
// The-SIFT Smart Home Portal — Add Device Wizard (#/t/:slug/devices/new)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import {
  toast,
  copyToClipboard,
  downloadBlob,
  generateSketch,
  generateOneDeviceScript,
  renderSpinner,
  resolveMqttHost,
  resolveCloudDomain,
  resolveHaUrl,
  renderRequiredLibrariesCallout,
} from '../ui.js';

export async function renderAddDevice(container, slug, router) {
  let step = 1;
  let deviceState = {
    name: '',
    platform: 'virtual', // 'virtual' | 'esp32'
    kind: 'sensor',      // 'sensor' | 'switch'
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
      <div class="card" style="max-width: 600px; margin: 2rem auto;">
        <div class="banner banner-danger">
          <strong>Error:</strong> ${err.message}
        </div>
        <button id="back-btn" class="btn btn-secondary">&larr; Back to Devices</button>
      </div>
    `;
    container.querySelector('#back-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}/devices`));
    return;
  }

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
      <div style="max-width: 780px; margin: 0.5rem auto;">
        <div class="stepper-nav">
          <div class="stepper-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
            <div class="step-circle">1</div>
            <span class="step-label">Device Details</span>
          </div>
          <div class="stepper-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
            <div class="step-circle">2</div>
            <span class="step-label">Download Setup Files</span>
          </div>
          <div class="stepper-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}">
            <div class="step-circle">3</div>
            <span class="step-label">Connect</span>
          </div>
          <div class="stepper-step ${step === 4 ? 'active' : ''}">
            <div class="step-circle">4</div>
            <span class="step-label">Connected!</span>
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

  // Step 1: Device Details
  function renderStep1(el) {
    if (isLimitReached) {
      el.innerHTML = `
        <div class="card">
          <div class="banner banner-danger">
            <strong>Device Limit Reached:</strong> Your household has reached the maximum of ${limits.devices.max} devices on your current plan.
          </div>
          <p>Switch to the Family Plan to add up to 30 smart devices.</p>
          <div style="display: flex; gap: 8px;">
            <a href="#/t/${slug}/plan" class="btn btn-primary">View Plans</a>
            <a href="#/t/${slug}/devices" class="btn btn-secondary">Back to Devices</a>
          </div>
        </div>
      `;
      return;
    }

    function getPlaceholder() {
      return deviceState.kind === 'sensor'
        ? 'e.g. Living Room Sensor'
        : 'e.g. Hallway Light Switch';
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Add a Smart Device</h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              Choose how you want to connect your device and give it a name.
            </p>
          </div>
        </div>

        <div id="step1-error" class="banner banner-danger" style="display: none;"></div>

        <form id="step1-form">
          <!-- Connection Method -->
          <div class="form-group">
            <label>How are you connecting this device?</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-md);">
              <label class="platform-choice-card platform-card-option ${deviceState.platform === 'virtual' ? 'selected' : ''}">
                <input type="radio" name="dev-platform-radio" value="virtual" ${deviceState.platform === 'virtual' ? 'checked' : ''} style="margin-top: 4px; accent-color: var(--accent);">
                <div class="choice-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"/>
                    <line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                </div>
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
                    <strong style="color: var(--text-main); font-size: 0.875rem;">Virtual Device (Run on PC)</strong>
                    <span class="badge badge-online">EASY TEST</span>
                  </div>
                  <div style="font-size: 0.78125rem; color: var(--text-secondary);">
                    No hardware needed. Run a lightweight script on your computer to simulate a real device.
                  </div>
                </div>
              </label>

              <label class="platform-choice-card platform-card-option ${deviceState.platform === 'esp32' ? 'selected' : ''}">
                <input type="radio" name="dev-platform-radio" value="esp32" ${deviceState.platform === 'esp32' ? 'checked' : ''} style="margin-top: 4px; accent-color: var(--accent);">
                <div class="choice-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2"/>
                    <rect x="9" y="9" width="6" height="6"/>
                    <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
                    <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
                  </svg>
                </div>
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
                    <strong style="color: var(--text-main); font-size: 0.875rem;">ESP32 / ESP8266 Hardware</strong>
                    <span class="badge badge-role">HARDWARE</span>
                  </div>
                  <div style="font-size: 0.78125rem; color: var(--text-secondary);">
                    Download a ready-to-upload Arduino sketch for physical ESP32 or ESP8266 boards over Wi-Fi.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <!-- Device Type -->
          <div class="form-group">
            <label>What kind of device is it?</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-md);">
              <label class="platform-choice-card kind-card-option ${deviceState.kind === 'sensor' ? 'selected' : ''}">
                <input type="radio" name="dev-kind-radio" value="sensor" ${deviceState.kind === 'sensor' ? 'checked' : ''} style="margin-top: 4px; accent-color: var(--accent);">
                <div class="choice-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
                  </svg>
                </div>
                <div style="flex: 1;">
                  <strong style="color: var(--text-main); font-size: 0.875rem;">Sensor (Temperature &amp; Humidity)</strong>
                  <div style="font-size: 0.78125rem; color: var(--text-secondary); margin-top: 4px;">
                    Sends live temperature and humidity readings to your household dashboard.
                  </div>
                </div>
              </label>

              <label class="platform-choice-card kind-card-option ${deviceState.kind === 'switch' ? 'selected' : ''}">
                <input type="radio" name="dev-kind-radio" value="switch" ${deviceState.kind === 'switch' ? 'checked' : ''} style="margin-top: 4px; accent-color: var(--accent);">
                <div class="choice-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="1" y="5" width="22" height="14" rx="7" ry="7"/>
                    <circle cx="16" cy="12" r="3"/>
                  </svg>
                </div>
                <div style="flex: 1;">
                  <strong style="color: var(--text-main); font-size: 0.875rem;">Smart Switch (ON / OFF)</strong>
                  <div style="font-size: 0.78125rem; color: var(--text-secondary); margin-top: 4px;">
                    Can be toggled ON or OFF remotely from your dashboard or Home Assistant.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <!-- Device Name -->
          <div class="form-group">
            <label for="dev-name">Device Name</label>
            <input type="text" id="dev-name" required value="${deviceState.name}" placeholder="${getPlaceholder()}" maxlength="40">
            <div class="form-hint">Give your device a friendly name (1–40 characters).</div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-xl);">
            <a href="#/t/${slug}/devices" class="btn btn-secondary">Cancel</a>
            <button type="submit" id="step1-submit" class="btn btn-primary">
              Create Device &rarr;
            </button>
          </div>
        </form>
      </div>
    `;

    const form = el.querySelector('#step1-form');
    const submitBtn = el.querySelector('#step1-submit');
    const errorBanner = el.querySelector('#step1-error');
    const nameInput = el.querySelector('#dev-name');
    const platformInputs = el.querySelectorAll('input[name="dev-platform-radio"]');
    const kindInputs = el.querySelectorAll('input[name="dev-kind-radio"]');

    platformInputs.forEach(r => {
      r.addEventListener('change', (e) => {
        deviceState.platform = e.target.value;
        el.querySelectorAll('.platform-card-option').forEach(card => {
          const radio = card.querySelector('input[name="dev-platform-radio"]');
          card.classList.toggle('selected', Boolean(radio && radio.checked));
        });
      });
    });

    kindInputs.forEach(r => {
      r.addEventListener('change', (e) => {
        deviceState.kind = e.target.value;
        el.querySelectorAll('.kind-card-option').forEach(card => {
          const radio = card.querySelector('input[name="dev-kind-radio"]');
          card.classList.toggle('selected', Boolean(radio && radio.checked));
        });
        if (nameInput && !nameInput.value) {
          nameInput.placeholder = getPlaceholder();
        }
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner.style.display = 'none';

      const nameVal = nameInput.value.trim();
      const kindVal = deviceState.kind;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating device...';

      try {
        const res = await api.createDevice(slug, nameVal, kindVal);
        registeredData = res;
        deviceState.name = nameVal;
        deviceState.kind = kindVal;
        step = 2;
        render();
      } catch (err) {
        errorBanner.textContent = err.message || 'Could not create device.';
        errorBanner.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Device →';
      }
    });
  }

  // Step 2: Download Setup Files
  function renderStep2(el) {
    const creds = registeredData?.credentials || {};
    const dev = registeredData?.device || {};
    const brokerHost = resolveMqttHost(creds.mqttHost || configData?.mqtt?.host);
    const brokerPort = creds.mqttPort || configData?.mqtt?.port || 1883;
    const deviceIdVal = creds.clientId || creds.device_id || `dev_${dev.id}`;
    const secretKeyVal = creds.secret || creds.device_secret || '';
    const telemetryTopic = creds.telemetryTopic || `channels/${tenantData?.tenant?.mg_chan_telemetry || 'telemetry'}/messages`;
    const commandTopic = creds.commandTopic || `channels/${tenantData?.tenant?.mg_chan_commands || 'commands'}/messages`;
    const isVirtual = deviceState.platform === 'virtual';
    const runCommand = 'npm install mqtt && node one-device.js --config ./sift-device.json';

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Download Setup Files for <span style="color: var(--accent);">${dev.name}</span></h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              ${isVirtual
                ? 'Download the two files below into the same folder on your computer to run your virtual smart device.'
                : 'Enter your Wi-Fi details and download the ready-to-upload Arduino sketch for your ESP32 or ESP8266 board.'}
            </p>
          </div>
          <span class="badge badge-role">${dev.kind === 'switch' ? 'Switch' : 'Sensor'}</span>
        </div>

        ${isVirtual ? `
          <!-- Virtual Device Download Section -->
          <div style="background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-md); border: 1px solid var(--border); margin-bottom: var(--space-lg);">
            <h3 style="margin-bottom: 6px;">Step A: Save Both Files into a Folder</h3>
            <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
              Your device connection key is already built into <code>sift-device.json</code>.
            </p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: var(--space-lg);">
              <button type="button" id="download-json-btn" class="btn btn-primary">
                1. Download Device Config (sift-device.json)
              </button>
              <button type="button" id="download-cli-btn" class="btn btn-secondary">
                2. Download Simulator Script (one-device.js)
              </button>
            </div>

            <h3 style="margin-bottom: 6px;">Step B: Command to Run on Your PC</h3>
            <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 8px;">
              Open a terminal in the folder where you saved both files and run:
            </p>
            <div class="copy-box">
              <code>${runCommand}</code>
              <button type="button" id="copy-run-cmd-step2" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>
        ` : `
          <!-- ESP32 Download Section -->
          <div style="background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-md); border: 1px solid var(--border); margin-bottom: var(--space-lg);">
            <h3 style="margin-bottom: 6px;">Wi-Fi Settings (Optional)</h3>
            <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: var(--space-md);">
              Enter your 2.4 GHz Wi-Fi name and password so they are pre-filled inside your Arduino sketch:
            </p>

            <div class="form-row">
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label for="sketch-wifi-ssid">Wi-Fi Name (SSID)</label>
                <input type="text" id="sketch-wifi-ssid" placeholder="MyHome_2.4G" value="${deviceState.wifiSsid}">
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label for="sketch-wifi-pass">Wi-Fi Password</label>
                <input type="password" id="sketch-wifi-pass" placeholder="••••••••" value="${deviceState.wifiPassword}">
              </div>
            </div>

            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: var(--space-md);">
              <button type="button" id="download-sketch-btn" class="btn btn-primary">
                Download Sketch (sift-device.ino)
              </button>
            </div>

            ${renderRequiredLibrariesCallout('margin-top: var(--space-md); margin-bottom: 0;')}
          </div>
        `}

        <!-- Collapsible Manual Credentials for Advanced Users -->
        <details style="margin-bottom: var(--space-lg); background: var(--bg-surface); padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
          <summary style="cursor: pointer; font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary);">
            Need manual connection credentials? Click to view
          </summary>
          <div style="margin-top: var(--space-md); display: grid; gap: var(--space-sm);">
            <div>
              <div class="data-label">Device ID</div>
              <div class="copy-box">
                <span>${deviceIdVal}</span>
                <button type="button" id="copy-client-btn" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>
            <div>
              <div class="data-label">Device Secret Key (Shown Once)</div>
              <div class="copy-box">
                <span style="color: var(--warning-text); font-weight: 600;">${secretKeyVal}</span>
                <button type="button" id="copy-sec-btn" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>
            <div>
              <div class="data-label">Broker Address</div>
              <div class="copy-box">
                <span>${brokerHost}:${brokerPort}</span>
                <button type="button" id="copy-host-btn" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>
          </div>
        </details>

        <div class="form-group" style="padding-top: var(--space-sm); border-top: 1px solid var(--border);">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
            <input type="checkbox" id="saved-creds-check" style="width: 16px; height: 16px; accent-color: var(--accent);">
            <span style="font-size: 0.84375rem; color: var(--text-main);">I have downloaded my setup files</span>
          </label>
        </div>

        <button type="button" id="continue-to-step3" class="btn btn-primary" disabled>
          Next: Connect Device &rarr;
        </button>
      </div>
    `;

    el.querySelector('#copy-run-cmd-step2')?.addEventListener('click', function () {
      copyToClipboard(runCommand, this, 'Copy');
    });
    el.querySelector('#copy-host-btn')?.addEventListener('click', function () {
      copyToClipboard(`${brokerHost}:${brokerPort}`, this, 'Copy');
    });
    el.querySelector('#copy-client-btn')?.addEventListener('click', function () {
      copyToClipboard(deviceIdVal, this, 'Copy');
    });
    el.querySelector('#copy-sec-btn')?.addEventListener('click', function () {
      copyToClipboard(secretKeyVal, this, 'Copy');
    });

    el.querySelector('#download-sketch-btn')?.addEventListener('click', () => {
      const ssid = el.querySelector('#sketch-wifi-ssid')?.value.trim() || deviceState.wifiSsid;
      const pass = el.querySelector('#sketch-wifi-pass')?.value || deviceState.wifiPassword;
      deviceState.wifiSsid = ssid;
      deviceState.wifiPassword = pass;

      const code = generateSketch({
        deviceName: dev.name,
        deviceKind: dev.kind,
        wifiSsid: ssid,
        wifiPassword: pass,
        mqttHost: brokerHost,
        mqttPort: brokerPort,
        mqttClientId: deviceIdVal,
        mqttUsername: creds.username || deviceIdVal,
        mqttPassword: secretKeyVal,
        telemetryTopic,
        commandTopic,
        deviceId: creds.device_id || dev.id,
        publishIntervalMs: 10000,
      });

      downloadBlob('sift-device.ino', code, 'text/x-c');
      toast('Downloaded sift-device.ino', 'success');
    });

    el.querySelector('#download-json-btn')?.addEventListener('click', () => {
      const configObj = {
        schema: 1,
        tenant: slug,
        device: {
          id: String(creds.device_id || dev.id),
          name: dev.name,
          kind: dev.kind,
        },
        mqtt: {
          host: brokerHost,
          port: brokerPort,
          tls: false,
          clientId: deviceIdVal,
          username: creds.username || deviceIdVal,
          password: secretKeyVal,
          telemetryTopic,
          commandTopic,
        },
        publishIntervalSeconds: 10,
      };

      downloadBlob('sift-device.json', JSON.stringify(configObj, null, 2), 'application/json');
      toast('Downloaded sift-device.json', 'success');
    });

    el.querySelector('#download-cli-btn')?.addEventListener('click', () => {
      downloadBlob('one-device.js', generateOneDeviceScript(), 'text/javascript');
      toast('Downloaded one-device.js', 'success');
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

  // Step 3: Connect
  function renderStep3(el) {
    const devId = registeredData?.device?.id;
    const isVirtual = deviceState.platform === 'virtual';
    const nodeCmd = 'npm install mqtt && node one-device.js --config ./sift-device.json';

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Connect Your Device</h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              Follow the quick steps below to start your device. This page will automatically advance as soon as the first reading arrives.
            </p>
          </div>
        </div>

        ${isVirtual ? `
          <div style="background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <ol style="margin-left: 1.25rem; font-size: 0.84375rem; line-height: 1.85; color: var(--text-secondary); margin-bottom: var(--space-md);">
              <li>Place both <code>sift-device.json</code> and <code>one-device.js</code> in the same folder on your computer.</li>
              <li>Open a terminal (PowerShell or Command Prompt) in that folder.</li>
              <li>Run the command below:</li>
            </ol>
            <div class="copy-box">
              <code>${nodeCmd}</code>
              <button type="button" id="copy-run-cmd" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>
        ` : `
          <div style="background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-sm); border: 1px solid var(--border);">
            ${renderRequiredLibrariesCallout('margin-bottom: var(--space-md);')}
            <ol style="margin-left: 1.25rem; font-size: 0.84375rem; line-height: 1.85; color: var(--text-secondary); margin-bottom: 0;">
              <li>Open <code>sift-device.ino</code> in <strong>Arduino IDE</strong>.</li>
              <li>Install the required libraries listed above (one-time setup).</li>
              <li>Select your ESP32 or ESP8266 board and USB port under the <em>Tools</em> menu.</li>
              <li>Click <strong>Upload</strong> to flash the sketch to your board.</li>
            </ol>
          </div>
        `}

        <!-- Waiting Card -->
        <div class="card" style="background: var(--bg-surface); text-align: center; padding: var(--space-2xl); margin-top: var(--space-xl); margin-bottom: 0;">
          <div id="status-indicator">
            ${renderSpinner()}
            <h3 style="margin-top: 12px;">Waiting for your device to connect...</h3>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0;">
              Listening for the first reading from <strong>${deviceState.name}</strong>
            </p>
          </div>
          <div id="troubleshoot-hint" style="display: none; margin-top: var(--space-lg);" class="banner banner-info">
            Need help connecting? Check our step-by-step <a href="#/help" class="inline-link" style="font-weight: 600;">Help Guide</a>.
          </div>
        </div>
      </div>
    `;

    el.querySelector('#copy-run-cmd')?.addEventListener('click', function () {
      copyToClipboard(nodeCmd, this, 'Copy');
    });

    let pollCount = 0;
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      pollCount++;
      if (pollCount > 8) {
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
      } catch {
        // Continue polling
      }
    }, 3000);
    router.registerInterval?.(pollInterval);
  }

  // Step 4: Connected!
  function renderStep4(el) {
    const dev = registeredData?.device || {};
    const cloudDomain = resolveCloudDomain(configData?.tenantDomain);
    const haUrl = resolveHaUrl(slug, tenantData?.urls?.homeAssistant || tenantData?.tenant?.url, cloudDomain);

    let summaryReading = 'Connected and active';
    if (dev.lastValue && typeof dev.lastValue === 'object') {
      if (dev.lastValue.temperature !== undefined) {
        summaryReading = `Temperature: ${dev.lastValue.temperature} °C${dev.lastValue.humidity !== undefined ? `  |  Humidity: ${dev.lastValue.humidity} %` : ''}`;
      } else if (dev.lastValue.state !== undefined) {
        summaryReading = `Switch State: ${dev.lastValue.state}`;
      }
    }

    el.innerHTML = `
      <div class="card" style="text-align: center; padding: var(--space-3xl) var(--space-xl);">
        <div style="margin-bottom: var(--space-md);">
          <span class="badge badge-online" style="font-size: 0.78125rem; padding: 6px 14px;">
            <span class="led-dot led-emerald"></span>
            <span>ONLINE</span>
          </span>
        </div>
        <h2>Device Connected!</h2>
        <p style="font-size: 0.875rem; max-width: 480px; margin: 0 auto var(--space-xl) auto;">
          <strong>${dev.name}</strong> is now connected to your household and ready in Home Assistant.
        </p>

        <div class="card" style="background: var(--bg-surface); max-width: 480px; margin: 0 auto var(--space-xl) auto; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="data-label">Live Reading</span>
            <span class="mono" style="font-size: 0.875rem; font-weight: 600; color: var(--led-emerald);">${summaryReading}</span>
          </div>

          ${dev.kind === 'switch' ? `
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border);">
              <div class="data-label" style="margin-bottom: 6px;">Test Your Smart Switch</div>
              <div style="display: flex; gap: 8px;">
                <button type="button" id="send-on-btn" class="btn btn-primary btn-sm">Turn ON</button>
                <button type="button" id="send-off-btn" class="btn btn-secondary btn-sm">Turn OFF</button>
              </div>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: var(--space-sm); justify-content: center; flex-wrap: wrap;">
          <a href="${haUrl}" target="_blank" rel="noopener" class="btn btn-primary">
            Open Home Assistant
          </a>
          <a href="#/t/${slug}/devices" class="btn btn-secondary">
            Back to Devices
          </a>
        </div>
      </div>
    `;

    if (dev.kind === 'switch') {
      el.querySelector('#send-on-btn')?.addEventListener('click', async () => {
        try {
          await api.sendTestCommand(slug, dev.id, 'ON');
          toast(`Turned ON "${dev.name}"`, 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      el.querySelector('#send-off-btn')?.addEventListener('click', async () => {
        try {
          await api.sendTestCommand(slug, dev.id, 'OFF');
          toast(`Turned OFF "${dev.name}"`, 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }
  }

  render();
}
