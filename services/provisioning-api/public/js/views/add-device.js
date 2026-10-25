// ---------------------------------------------------------------------------
// The-SIFT Cloud Portal — Cloud Hardware Provisioning Wizard (#/t/:slug/devices/new)
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
} from '../ui.js';

export async function renderAddDevice(container, slug, router) {
  let step = 1;
  let deviceState = {
    name: '',
    platform: 'esp32', // 'esp32' | 'cloud-client'
    kind: 'sensor',    // 'sensor' | 'switch'
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
        <button id="back-btn" class="btn btn-secondary">Back to Hardware Directory</button>
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
      <div style="max-width: 820px; margin: 0.5rem auto;">
        <div class="stepper-nav">
          <div class="stepper-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
            <div class="step-circle">1</div>
            <span class="step-label">Device Identity &amp; Profile</span>
          </div>
          <div class="stepper-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
            <div class="step-circle">2</div>
            <span class="step-label">One-Time Credentials Vault</span>
          </div>
          <div class="stepper-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}">
            <div class="step-circle">3</div>
            <span class="step-label">Cloud Connectivity Verification</span>
          </div>
          <div class="stepper-step ${step === 4 ? 'active' : ''}">
            <div class="step-circle">4</div>
            <span class="step-label">Telemetry Verified</span>
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

  // Step 1: Device Identity & Telemetry Profile
  function renderStep1(el) {
    if (isLimitReached) {
      el.innerHTML = `
        <div class="card">
          <div class="banner banner-danger">
            <strong>Hardware Quota Reached:</strong> This household has allocated all ${limits.devices.max} device slots on the ${tenantData.tenant.plan} tier.
          </div>
          <p>Upgrade your household infrastructure tier to provision additional hardware endpoints.</p>
          <div style="display: flex; gap: 8px;">
            <a href="#/t/${slug}/plan" class="btn btn-primary">Upgrade Infrastructure Tier</a>
            <a href="#/t/${slug}/devices" class="btn btn-secondary">Back to Devices</a>
          </div>
        </div>
      `;
      return;
    }

    function getPlaceholder() {
      return deviceState.kind === 'sensor'
        ? 'hvac-zone-1-sensor'
        : 'main-breaker-relay-01';
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>1. Device Identity &amp; Telemetry Profile</h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              Provision a dedicated Magistrala Thing identity and bind it to your household telemetry and command channels.
            </p>
          </div>
        </div>

        <div id="step1-error" class="banner banner-danger" style="display: none;"></div>

        <form id="step1-form">
          <!-- Hardware Class -->
          <div class="form-group">
            <label>Hardware Class</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-md);">
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
                    <strong style="color: var(--text-main); font-size: 0.875rem;">ESP32 / Embedded MCU</strong>
                    <span class="badge badge-role">FIRMWARE</span>
                  </div>
                  <div style="font-size: 0.78125rem; color: var(--text-secondary);">
                    Flash generated C++ Arduino / PlatformIO firmware over 2.4 GHz WiFi.
                  </div>
                </div>
              </label>

              <label class="platform-choice-card platform-card-option ${deviceState.platform === 'cloud-client' ? 'selected' : ''}">
                <input type="radio" name="dev-platform-radio" value="cloud-client" ${deviceState.platform === 'cloud-client' ? 'checked' : ''} style="margin-top: 4px; accent-color: var(--accent);">
                <div class="choice-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"/>
                    <line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                </div>
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
                    <strong style="color: var(--text-main); font-size: 0.875rem;">Cloud MQTT Verification Client</strong>
                    <span class="badge badge-online">CLOUD TEST</span>
                  </div>
                  <div style="font-size: 0.78125rem; color: var(--text-secondary);">
                    Verify cloud channel connectivity using <code>sift-device-client.js</code>.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <!-- Sensor / Actuator Type -->
          <div class="form-group">
            <label>Telemetry &amp; Control Profile</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-md);">
              <label class="platform-choice-card kind-card-option ${deviceState.kind === 'sensor' ? 'selected' : ''}">
                <input type="radio" name="dev-kind-radio" value="sensor" ${deviceState.kind === 'sensor' ? 'checked' : ''} style="margin-top: 4px; accent-color: var(--accent);">
                <div class="choice-card-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
                  </svg>
                </div>
                <div style="flex: 1;">
                  <strong style="color: var(--text-main); font-size: 0.875rem;">Telemetry Sensor</strong>
                  <div style="font-size: 0.78125rem; color: var(--text-secondary); margin-top: 4px;">
                    Publishes SenML / JSON environmental metrics (temperature, humidity) to the cloud telemetry channel.
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
                  <strong style="color: var(--text-main); font-size: 0.875rem;">Relay / Switch Actuator</strong>
                  <div style="font-size: 0.78125rem; color: var(--text-secondary); margin-top: 4px;">
                    Subscribes to the cloud command channel for bidirectional ON/OFF relay actuation.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <!-- Device Name -->
          <div class="form-group">
            <label for="dev-name">Device Identifier Name</label>
            <input type="text" id="dev-name" required value="${deviceState.name}" placeholder="${getPlaceholder()}" maxlength="40">
            <div class="form-hint">1–40 characters. Automatically discovered in Home Assistant Cloud via MQTT Discovery.</div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-xl);">
            <a href="#/t/${slug}/devices" class="btn btn-secondary">Cancel</a>
            <button type="submit" id="step1-submit" class="btn btn-primary">
              Provision Hardware &amp; Issue Credentials
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
      submitBtn.textContent = 'Allocating Magistrala Thing...';

      try {
        const res = await api.createDevice(slug, nameVal, kindVal);
        registeredData = res;
        deviceState.name = nameVal;
        deviceState.kind = kindVal;
        step = 2;
        render();
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to provision hardware.';
        errorBanner.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Provision Hardware & Issue Credentials';
      }
    });
  }

  // Step 2: One-Time Cloud Credentials Vault
  function renderStep2(el) {
    const creds = registeredData?.credentials || {};
    const dev = registeredData?.device || {};
    const brokerHost = resolveMqttHost(creds.mqttHost || configData?.mqtt?.host);
    const brokerPort = creds.mqttPort || configData?.mqtt?.port || 1883;
    const thingId = creds.clientId || creds.device_id || `dev_${dev.id}`;
    const thingSecret = creds.secret || creds.device_secret || '';
    const telemetryTopic = creds.telemetryTopic || `channels/${tenantData?.tenant?.mg_chan_telemetry || 'telemetry'}/messages`;
    const commandTopic = creds.commandTopic || `channels/${tenantData?.tenant?.mg_chan_commands || 'commands'}/messages`;
    const channelId = (telemetryTopic.split('/')[1]) || tenantData?.tenant?.mg_chan_telemetry || 'channel';

    el.innerHTML = `
      <div class="card">
        <div class="banner banner-warning">
          <strong>One-Time Cloud Credentials Vault:</strong> Store your Thing Secret / Access Key immediately. For security, the secret is hashed and never displayed again after you leave this screen.
        </div>

        <div class="card-header">
          <div>
            <h2>2. Provisioned Credentials: <span class="mono" style="color: var(--accent);">${dev.name}</span></h2>
            <p style="font-size: 0.8125rem; margin-bottom: 0;">
              Bind these Magistrala parameters to your ESP32 firmware or MQTT client.
            </p>
          </div>
          <span class="badge badge-role">${dev.kind}</span>
        </div>

        <div style="background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-md); border: 1px solid var(--border); margin-bottom: var(--space-lg);">
          <div style="margin-bottom: var(--space-md);">
            <div class="data-label">Cloud MQTT Broker Endpoint</div>
            <div class="copy-box">
              <span>${brokerHost}:${brokerPort}</span>
              <button type="button" id="copy-host-btn" class="btn btn-secondary btn-sm">Copy Endpoint</button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-md); margin-bottom: var(--space-md);">
            <div>
              <div class="data-label">Thing ID (MQTT Username / Client ID)</div>
              <div class="copy-box">
                <span>${thingId}</span>
                <button type="button" id="copy-client-btn" class="btn btn-secondary btn-sm">Copy Thing ID</button>
              </div>
            </div>

            <div>
              <div class="data-label">Channel ID</div>
              <div class="copy-box">
                <span>${channelId}</span>
                <button type="button" id="copy-chan-btn" class="btn btn-secondary btn-sm">Copy Channel</button>
              </div>
            </div>
          </div>

          <div style="margin-bottom: var(--space-md);">
            <div class="data-label">Thing Secret / Access Key (Displayed Once)</div>
            <div class="copy-box">
              <span id="secret-masked-val" style="color: var(--warning-text); font-weight: 600;">••••••••••••••••••••••••••••••••</span>
              <span id="secret-raw-val" style="display: none; color: var(--warning-text); font-weight: 600;">${thingSecret}</span>
              <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button type="button" id="toggle-secret-btn" class="btn btn-secondary btn-sm">Reveal</button>
                <button type="button" id="copy-sec-btn" class="btn btn-secondary btn-sm">Copy Secret</button>
              </div>
            </div>
          </div>

          <div style="margin-bottom: var(--space-md);">
            <div class="data-label">Telemetry Publish Topic</div>
            <div class="copy-box">
              <span>${telemetryTopic}</span>
              <button type="button" id="copy-tel-btn" class="btn btn-secondary btn-sm">Copy Topic</button>
            </div>
          </div>

          <div>
            <div class="data-label">Command Subscribe Topic</div>
            <div class="copy-box">
              <span>${commandTopic}</span>
              <button type="button" id="copy-cmd-btn" class="btn btn-secondary btn-sm">Copy Topic</button>
            </div>
          </div>
        </div>

        <!-- Optional WiFi Embed & Artifact Downloads -->
        <div class="card" style="background: var(--bg-surface); margin-bottom: var(--space-lg);">
          <h3 style="margin-bottom: 4px;">Hardware Firmware &amp; Cloud Verification Artifacts</h3>
          <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: var(--space-md);">
            Optionally embed 2.4 GHz WiFi credentials into the generated <code>sift-device.ino</code> firmware (processed strictly in-browser):
          </p>

          <div class="form-row">
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
              <label for="sketch-wifi-ssid">WiFi SSID (2.4 GHz)</label>
              <input type="text" id="sketch-wifi-ssid" placeholder="Facility_IoT_2.4G" value="${deviceState.wifiSsid}">
            </div>
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
              <label for="sketch-wifi-pass">WiFi Passphrase</label>
              <input type="password" id="sketch-wifi-pass" placeholder="••••••••" value="${deviceState.wifiPassword}">
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: var(--space-md);">
            <button type="button" id="download-sketch-btn" class="btn btn-primary btn-sm">
              Download ESP32 Firmware (sift-device.ino)
            </button>
            <button type="button" id="download-json-btn" class="btn btn-secondary btn-sm">
              Download Cloud Config (sift-device.json)
            </button>
            <button type="button" id="download-cli-btn" class="btn btn-secondary btn-sm">
              Download Cloud Verification Client (sift-device-client.js)
            </button>
          </div>
        </div>

        <div class="form-group" style="padding-top: var(--space-sm); border-top: 1px solid var(--border);">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
            <input type="checkbox" id="saved-creds-check" style="width: 16px; height: 16px; accent-color: var(--accent);">
            <span style="font-size: 0.84375rem; color: var(--text-main);">I have securely stored the one-time Thing Secret and downloaded the required configuration artifacts.</span>
          </label>
        </div>

        <button type="button" id="continue-to-step3" class="btn btn-primary" disabled>
          Proceed to Cloud Connectivity Verification
        </button>
      </div>
    `;

    el.querySelector('#copy-host-btn')?.addEventListener('click', function() {
      copyToClipboard(`${brokerHost}:${brokerPort}`, this, 'Copy Endpoint');
    });
    el.querySelector('#copy-client-btn')?.addEventListener('click', function() {
      copyToClipboard(thingId, this, 'Copy Thing ID');
    });
    el.querySelector('#copy-chan-btn')?.addEventListener('click', function() {
      copyToClipboard(channelId, this, 'Copy Channel');
    });
    el.querySelector('#copy-sec-btn')?.addEventListener('click', function() {
      copyToClipboard(thingSecret, this, 'Copy Secret');
    });
    el.querySelector('#copy-tel-btn')?.addEventListener('click', function() {
      copyToClipboard(telemetryTopic, this, 'Copy Topic');
    });
    el.querySelector('#copy-cmd-btn')?.addEventListener('click', function() {
      copyToClipboard(commandTopic, this, 'Copy Topic');
    });

    const toggleSecretBtn = el.querySelector('#toggle-secret-btn');
    const maskedEl = el.querySelector('#secret-masked-val');
    const rawEl = el.querySelector('#secret-raw-val');
    toggleSecretBtn?.addEventListener('click', () => {
      const hidden = rawEl.style.display === 'none';
      rawEl.style.display = hidden ? 'inline' : 'none';
      maskedEl.style.display = hidden ? 'none' : 'inline';
      toggleSecretBtn.textContent = hidden ? 'Mask' : 'Reveal';
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
        mqttClientId: thingId,
        mqttUsername: creds.username || thingId,
        mqttPassword: thingSecret,
        telemetryTopic,
        commandTopic,
        deviceId: creds.device_id || dev.id,
        publishIntervalMs: 10000,
      });

      downloadBlob('sift-device.ino', code, 'text/x-c');
      toast('sift-device.ino firmware downloaded', 'success');
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
          clientId: thingId,
          username: creds.username || thingId,
          password: thingSecret,
          telemetryTopic,
          commandTopic,
        },
        publishIntervalSeconds: 10,
      };

      downloadBlob('sift-device.json', JSON.stringify(configObj, null, 2), 'application/json');
      toast('sift-device.json configuration downloaded', 'success');
    });

    el.querySelector('#download-cli-btn')?.addEventListener('click', () => {
      downloadBlob('sift-device-client.js', generateOneDeviceScript(), 'text/javascript');
      toast('sift-device-client.js verification client downloaded', 'success');
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

  // Step 3: Hardware & Cloud Connectivity Verification
  function renderStep3(el) {
    const devId = registeredData?.device?.id;
    const creds = registeredData?.credentials || {};
    const brokerHost = resolveMqttHost(creds.mqttHost || configData?.mqtt?.host);
    const brokerPort = creds.mqttPort || configData?.mqtt?.port || 1883;
    const thingId = creds.clientId || creds.device_id || `dev_${devId}`;
    const telemetryTopic = creds.telemetryTopic || `channels/${tenantData?.tenant?.mg_chan_telemetry || 'telemetry'}/messages`;
    let activeTab = deviceState.platform === 'cloud-client' ? 'cloud-client' : 'esp32';

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>3. Hardware &amp; Cloud Connectivity Verification</h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              Transmit an initial SenML or JSON payload to the cloud broker to verify end-to-end channel binding.
            </p>
          </div>
        </div>

        <!-- Code Tabs -->
        <div class="filter-pills" style="margin-bottom: var(--space-lg);">
          <button type="button" id="tab-esp32" class="filter-pill ${activeTab === 'esp32' ? 'active' : ''}">
            ESP32 Arduino / PlatformIO Firmware
          </button>
          <button type="button" id="tab-mqtt" class="filter-pill ${activeTab === 'mqtt' ? 'active' : ''}">
            MQTT TLS/TCP Configuration
          </button>
          <button type="button" id="tab-client" class="filter-pill ${activeTab === 'cloud-client' ? 'active' : ''}">
            Cloud Verification Client (sift-device-client.js)
          </button>
        </div>

        <div id="tab-instructions"></div>

        <!-- Live Telemetry Listener -->
        <div class="card" style="background: var(--bg-surface); text-align: center; padding: var(--space-2xl); margin-top: var(--space-xl); margin-bottom: 0;">
          <div id="status-indicator">
            ${renderSpinner()}
            <h3 style="margin-top: 12px;">Awaiting Initial Cloud Telemetry Packet...</h3>
            <p class="mono" style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: 0;">
              LISTENING ON TOPIC: ${telemetryTopic}
            </p>
          </div>
          <div id="troubleshoot-hint" style="display: none; margin-top: var(--space-lg);" class="banner banner-info">
            Need help verifying your MQTT payload schema? Open the <a href="#/help/esp32" class="inline-link" style="font-weight: 600;">Cloud Documentation Hub</a>.
          </div>
        </div>
      </div>
    `;

    const instructionsEl = el.querySelector('#tab-instructions');

    function renderInstructions() {
      if (activeTab === 'esp32') {
        instructionsEl.innerHTML = `
          <div style="background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <ol style="margin-left: 1.25rem; font-size: 0.84375rem; line-height: 1.85; color: var(--text-secondary);">
              <li>Open <code>sift-device.ino</code> in <strong>Arduino IDE 2</strong> or PlatformIO.</li>
              <li>Ensure the <strong>PubSubClient</strong> library (v2.8+) is installed.</li>
              <li>Select <strong>ESP32 Dev Module</strong> and flash the firmware to your microcontroller.</li>
              <li>Monitor serial output at <code>115200 baud</code> until <code>Published (ok)</code> is logged.</li>
            </ol>
          </div>
        `;
      } else if (activeTab === 'mqtt') {
        const mosqCmd = `mosquitto_pub -h ${brokerHost} -p ${brokerPort} -u "${thingId}" -P "<THING_SECRET>" -t "${telemetryTopic}" -m '{"id":"${thingId}","temperature":24.2,"humidity":48}'`;
        instructionsEl.innerHTML = `
          <div style="background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div class="data-label">Publish Verification Packet via MQTT CLI</div>
            <div class="copy-box" style="margin-top: 6px;">
              <code>${mosqCmd}</code>
              <button type="button" id="copy-mosq-btn" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>
        `;
        instructionsEl.querySelector('#copy-mosq-btn')?.addEventListener('click', function() {
          copyToClipboard(mosqCmd, this, 'Copy');
        });
      } else {
        const nodeCmd = 'npm install mqtt && node sift-device-client.js --config ./sift-device.json';
        instructionsEl.innerHTML = `
          <div style="background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <p style="font-size: 0.84375rem; margin-bottom: var(--space-sm);">
              Execute the standalone Cloud Verification Client with your downloaded <code>sift-device.json</code> profile:
            </p>
            <div class="copy-box" style="margin-bottom: var(--space-md);">
              <code>${nodeCmd}</code>
              <button type="button" id="copy-run-cmd" class="btn btn-secondary btn-sm">Copy</button>
            </div>
            <button type="button" id="redownload-cli-btn" class="btn btn-secondary btn-sm">
              Download Cloud Verification Client (sift-device-client.js)
            </button>
          </div>
        `;
        instructionsEl.querySelector('#copy-run-cmd')?.addEventListener('click', function() {
          copyToClipboard(nodeCmd, this, 'Copy');
        });
        instructionsEl.querySelector('#redownload-cli-btn')?.addEventListener('click', () => {
          downloadBlob('sift-device-client.js', generateOneDeviceScript(), 'text/javascript');
          toast('sift-device-client.js downloaded', 'success');
        });
      }
    }

    renderInstructions();

    const setTab = (tabName) => {
      activeTab = tabName;
      el.querySelector('#tab-esp32').classList.toggle('active', tabName === 'esp32');
      el.querySelector('#tab-mqtt').classList.toggle('active', tabName === 'mqtt');
      el.querySelector('#tab-client').classList.toggle('active', tabName === 'cloud-client');
      renderInstructions();
    };

    el.querySelector('#tab-esp32').addEventListener('click', () => setTab('esp32'));
    el.querySelector('#tab-mqtt').addEventListener('click', () => setTab('mqtt'));
    el.querySelector('#tab-client').addEventListener('click', () => setTab('cloud-client'));

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
  }

  // Step 4: Telemetry Verified
  function renderStep4(el) {
    const dev = registeredData?.device || {};
    const cloudDomain = resolveCloudDomain(configData?.tenantDomain);
    const haUrl = resolveHaUrl(slug, tenantData?.urls?.homeAssistant || tenantData?.tenant?.url, cloudDomain);

    el.innerHTML = `
      <div class="card" style="text-align: center; padding: var(--space-3xl) var(--space-xl);">
        <div style="margin-bottom: var(--space-md);">
          <span class="badge badge-online" style="font-size: 0.78125rem; padding: 6px 14px;">
            <span class="led-dot led-emerald"></span>
            <span>CLOUD TELEMETRY VERIFIED</span>
          </span>
        </div>
        <h2>${dev.name} is Online</h2>
        <p style="font-size: 0.875rem; max-width: 480px; margin: 0 auto var(--space-xl) auto;">
          Initial telemetry packet authenticated and ingested into your isolated household workspace.
        </p>

        <div class="card" style="background: var(--bg-surface); max-width: 500px; margin: 0 auto var(--space-xl) auto; text-align: left;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span class="data-label">Handshake Timestamp</span>
            <span class="mono" style="font-size: 0.78125rem;">${new Date(dev.firstConnectedAt || Date.now()).toLocaleTimeString()}</span>
          </div>
          ${dev.lastValue ? `
            <div class="data-label" style="margin-top: 12px;">Ingested Telemetry Payload</div>
            <div class="terminal-box" style="margin-top: 6px;">${JSON.stringify(dev.lastValue, null, 2)}</div>
          ` : ''}

          ${dev.kind === 'switch' ? `
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border);">
              <div class="data-label" style="margin-bottom: 6px;">Actuator Command Verification</div>
              <div style="display: flex; gap: 8px;">
                <button type="button" id="send-on-btn" class="btn btn-primary btn-sm">Dispatch ON</button>
                <button type="button" id="send-off-btn" class="btn btn-secondary btn-sm">Dispatch OFF</button>
              </div>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: var(--space-sm); justify-content: center; flex-wrap: wrap;">
          <a href="${haUrl}" target="_blank" rel="noopener" class="btn btn-primary">
            Launch Home Assistant Cloud
          </a>
          <a href="#/t/${slug}/devices" class="btn btn-secondary">
            Return to Hardware Directory
          </a>
        </div>
      </div>
    `;

    if (dev.kind === 'switch') {
      el.querySelector('#send-on-btn')?.addEventListener('click', async () => {
        try {
          await api.sendTestCommand(slug, dev.id, 'ON');
          toast('Dispatched ON command to actuator', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      el.querySelector('#send-off-btn')?.addEventListener('click', async () => {
        try {
          await api.sendTestCommand(slug, dev.id, 'OFF');
          toast('Dispatched OFF command to actuator', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }
  }

  render();
}
