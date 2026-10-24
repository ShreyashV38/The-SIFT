// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Help & Troubleshooting View (#/help/esp32)
// ---------------------------------------------------------------------------

import { copyToClipboard } from '../ui.js';

export function renderHelp(container, router) {
  container.innerHTML = `
    <div style="max-width: 900px; margin: 1rem auto;">
      <div class="page-header">
        <div>
          <h1>Device Connection & Troubleshooting Guide</h1>
          <p style="margin-bottom: 0;">
            Comprehensive reference for provisioning physical ESP32 boards and virtual telemetry sensors into SIFT.
          </p>
        </div>
        <div class="page-header-actions">
          <a href="#/" class="btn btn-secondary btn-sm">← Overview</a>
        </div>
      </div>

      <!-- Quick Prerequisites -->
      <div class="card">
        <h3 style="margin-bottom: var(--space-md);">1. Hardware & System Prerequisites</h3>
        <ul class="feature-list" style="margin-bottom: 0;">
          <li>
            <span class="badge badge-role">Board</span>
            <span><strong>ESP32 Development Board</strong> (ESP32 Dev Module, NodeMCU-32S, ESP-WROOM-32).</span>
          </li>
          <li>
            <span class="badge badge-role">Cable</span>
            <span><strong>Data-Capable USB Cable</strong> (Micro-USB or USB-C. Charge-only cables will not be detected by your computer).</span>
          </li>
          <li>
            <span class="badge badge-role">WiFi</span>
            <span><strong>2.4 GHz WiFi Network</strong> (ESP32 microcontrollers do not support 5 GHz networks).</span>
          </li>
          <li>
            <span class="badge badge-role">Software</span>
            <span><strong>Arduino IDE 2</strong> (for hardware microcontrollers) or <strong>Node.js LTS</strong> (for CLI simulator).</span>
          </li>
          <li>
            <span class="badge badge-role">Auth</span>
            <span><strong>Credentials</strong> generated from the SIFT Add-Device Wizard.</span>
          </li>
        </ul>
      </div>

      <!-- Step by Step Arduino Guide -->
      <div class="card">
        <h3 style="margin-bottom: var(--space-md);">2. Physical ESP32 Step-by-Step Setup</h3>
        <ol style="margin-left: 1.25rem; font-size: 0.875rem; line-height: 1.9; color: var(--text-secondary);">
          <li>Download and install <strong>Arduino IDE 2</strong> from official sources.</li>
          <li>In Arduino IDE, open <em>File → Preferences</em> and add the ESP32 Board Manager URL:
            <div class="copy-box" style="margin: 0.4rem 0;">
              <code>https://espressif.github.io/arduino-esp32/package_esp32_index.json</code>
              <button id="copy-board-url" class="btn btn-secondary btn-sm">Copy URL</button>
            </div>
          </li>
          <li>Under <em>Tools → Board → Boards Manager</em>, search for <code>esp32</code> by Espressif and click <strong>Install</strong>.</li>
          <li>Under <em>Tools → Manage Libraries</em>, search for <code>PubSubClient</code> by Nick O'Leary and click <strong>Install</strong> (version 2.8 or newer).</li>
          <li>Open the downloaded <code>sift-device.ino</code> file. If prompted to move to a folder, click <strong>OK</strong>.</li>
          <li>Select your board: <em>Tools → Board → ESP32 Arduino → ESP32 Dev Module</em> and choose your board's serial COM port under <em>Tools → Port</em>.</li>
          <li>Click <strong>Upload</strong>. (If you see "Connecting......", press and hold the physical <strong>BOOT</strong> button on your ESP32 until the flashing percentage begins).</li>
          <li>Open <em>Tools → Serial Monitor</em> and set the baud rate to <strong>115200</strong>.</li>
        </ol>
      </div>

      <!-- Expected Serial Output -->
      <div class="card">
        <h3 style="margin-bottom: 0.35rem;">3. Expected Serial Monitor Output</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-md);">
          When the sketch boots successfully, the Serial Monitor prints the following connection log:
        </p>
        <div class="terminal-box">
WiFi connecting to Home_2.4G<br>
....<br>
WiFi connected: 192.168.1.145<br>
MQTT connecting...<br>
MQTT connected<br>
Published (ok): {"id":"dev_01","temperature":24.5}<br>
Published (ok): {"id":"dev_01","temperature":24.6}
        </div>
      </div>

      <!-- Virtual Device Guide -->
      <div class="card">
        <h3 style="margin-bottom: 0.35rem;">4. Virtual Sensor Simulator (No Hardware Required)</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-md);">
          If you do not have physical hardware, you can simulate a real device using the lightweight Node.js CLI tool:
        </p>
        <ol style="margin-left: 1.25rem; font-size: 0.875rem; line-height: 1.8; color: var(--text-secondary);">
          <li>Install <strong>Node.js LTS</strong> if not already present on your machine.</li>
          <li>Save both <code>sift-device.json</code> and <code>one-device.js</code> into a folder.</li>
          <li>Run the following command:</li>
        </ol>
        <div class="copy-box" style="margin-top: 0.6rem;">
          <code>npm install mqtt && node one-device.js --config .\\sift-device.json</code>
          <button id="copy-run-cmd" class="btn btn-secondary btn-sm">Copy</button>
        </div>
      </div>

      <!-- Troubleshooting Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 1.25rem; border-bottom: 1px solid var(--border);">
          <h3 style="margin-bottom: 0.25rem;">5. Troubleshooting & Diagnostics</h3>
          <p style="font-size: 0.8125rem; margin-bottom: 0; color: var(--text-muted);">
            Common connection, upload, and broker issues and how to resolve them:
          </p>
        </div>

        <div class="table-container" style="border: none; border-radius: 0;">
          <table>
            <thead>
              <tr>
                <th style="width: 28%;">Symptom</th>
                <th style="width: 28%;">Likely Cause</th>
                <th>Recommended Fix</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Port not listed in Arduino IDE</strong></td>
                <td>Charge-only USB cable or missing USB-to-UART driver</td>
                <td>Use a verified data cable; install CP210x or CH340 driver for your board model.</td>
              </tr>
              <tr>
                <td><strong>Upload stuck on "Connecting......"</strong></td>
                <td>Board not in flashing bootloader mode</td>
                <td>Hold the physical <strong>BOOT</strong> button on the ESP32 while the IDE connects, release once flashing begins.</td>
              </tr>
              <tr>
                <td><strong>Serial prints dots then restarts</strong></td>
                <td>Incorrect WiFi credentials or 5 GHz network</td>
                <td>Verify SSID and password; ensure network is 2.4 GHz (ESP32 does not support 5 GHz).</td>
              </tr>
              <tr>
                <td><code>MQTT failed, rc=-2</code></td>
                <td>Board cannot reach MQTT host IP</td>
                <td>Host must be computer's LAN IP (not localhost); allow inbound TCP port 1883 in Windows Firewall.</td>
              </tr>
              <tr>
                <td><code>MQTT failed, rc=-4</code></td>
                <td>Connection timeout</td>
                <td>Ensure ESP32 and computer running SIFT are connected to the same subnet / router.</td>
              </tr>
              <tr>
                <td><code>rc=4</code> or <code>rc=5</code></td>
                <td>Bad credentials or revoked device</td>
                <td>Use the exact credentials generated by the wizard, or rotate the device secret on the device detail page.</td>
              </tr>
              <tr>
                <td><code>Published (FAILED)</code></td>
                <td>Payload larger than default client buffer</td>
                <td>Ensure <code>mqtt.setBufferSize(512);</code> remains present in the sketch setup function.</td>
              </tr>
              <tr>
                <td><strong>Serial says Published (ok) but portal says Waiting</strong></td>
                <td>Wrong topic or missing <code>"id"</code> in payload</td>
                <td>Check telemetry topic matches wizard; ensure payload JSON contains the string <code>"id"</code> field.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Protocol & Security Standard Banner -->
      <div class="banner banner-info" style="margin-top: 1.5rem;">
        <div>
          <strong>Security & Isolation Architecture:</strong>
          All MQTT telemetry traffic is strictly segregated per household tenant using Magistrala topic boundaries and tenant tokens. In cloud deployments, broker communication is encrypted via TLS (MQTTS).
        </div>
      </div>
    </div>
  `;

  container.querySelector('#copy-board-url')?.addEventListener('click', function() {
    copyToClipboard('https://espressif.github.io/arduino-esp32/package_esp32_index.json', this);
  });

  container.querySelector('#copy-run-cmd')?.addEventListener('click', function() {
    copyToClipboard('npm install mqtt && node one-device.js --config .\\sift-device.json', this);
  });
}
