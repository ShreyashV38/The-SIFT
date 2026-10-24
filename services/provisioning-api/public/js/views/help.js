// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Help & Troubleshooting View (#/help/esp32)
// ---------------------------------------------------------------------------
// Publicly accessible, 100% offline capable (no external CDN or fonts needed)
// ---------------------------------------------------------------------------

export function renderHelp(container, router) {
  container.innerHTML = `
    <div style="max-width: 860px; margin: 1rem auto;">
      <div style="margin-bottom: 1.5rem;">
        <h1>ESP32 & Virtual Device Connection Guide</h1>
        <p>Comprehensive instructions for connecting physical microcontrollers and virtual sensors to SIFT.</p>
      </div>

      <!-- Quick Requirements -->
      <div class="card">
        <h3>1. What You Need</h3>
        <ul style="margin-left: 1.25rem; font-size: 0.9rem; line-height: 1.8;">
          <li><strong>ESP32 Development Board</strong> (e.g. ESP32 Dev Module, NodeMCU-32S, ESP-WROOM-32).</li>
          <li><strong>Data-capable Micro-USB / USB-C Cable</strong> (charge-only cables will not be detected by your computer).</li>
          <li><strong>2.4 GHz WiFi Network</strong> (ESP32 microcontrollers do not support 5 GHz networks).</li>
          <li><strong>Computer</strong> with Arduino IDE 2 installed (or Node.js LTS for the virtual device).</li>
          <li><strong>Connection Credentials</strong> generated from the SIFT Add-Device Wizard.</li>
        </ul>
      </div>

      <!-- Step by Step Arduino Guide -->
      <div class="card">
        <h3>2. Physical ESP32 Step-by-Step Setup</h3>
        <ol style="margin-left: 1.25rem; font-size: 0.9rem; line-height: 1.9;">
          <li>Download and install <strong>Arduino IDE 2</strong> from official sources.</li>
          <li>In Arduino IDE, open <em>File → Preferences</em> and add the ESP32 Board Manager URL:
            <div class="copy-box" style="margin: 0.35rem 0;">
              <code>https://espressif.github.io/arduino-esp32/package_esp32_index.json</code>
            </div>
          </li>
          <li>Under <em>Tools → Board → Boards Manager</em>, search for <code>esp32</code> by Espressif and click <strong>Install</strong>.</li>
          <li>Under <em>Tools → Manage Libraries</em>, search for <code>PubSubClient</code> by Nick O'Leary and click <strong>Install</strong> (version 2.8 or newer).</li>
          <li>Open the downloaded <code>sift-device.ino</code> file. If prompted to move to a folder, click <strong>OK</strong>.</li>
          <li>Select your board: <em>Tools → Board → ESP32 Arduino → ESP32 Dev Module</em> and choose your board's serial COM port under <em>Tools → Port</em>.</li>
          <li>Click <strong>Upload</strong>. (If you see "Connecting......", hold down the <strong>BOOT</strong> button on your ESP32 until the flashing percentage begins).</li>
          <li>Open <em>Tools → Serial Monitor</em> and set the baud rate to <strong>115200</strong>.</li>
        </ol>
      </div>

      <!-- What you should see -->
      <div class="card">
        <h3>3. Expected Serial Output</h3>
        <p style="font-size: 0.85rem;">When the sketch boots successfully, the Serial Monitor prints:</p>
        <div class="copy-box" style="background: #000; color: #a7f3d0; display: block; font-size: 0.8rem; line-height: 1.6;">
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
        <h3>4. Virtual Sensor (No Hardware Required)</h3>
        <p style="font-size: 0.85rem;">If you do not have physical hardware, you can simulate a real device using our lightweight Node.js CLI tool:</p>
        <ol style="margin-left: 1.25rem; font-size: 0.9rem; line-height: 1.8;">
          <li>Install <strong>Node.js LTS</strong> if not already present on your machine.</li>
          <li>Save both <code>sift-device.json</code> and <code>one-device.js</code> into a folder.</li>
          <li>Run the following command:</li>
        </ol>
        <div class="copy-box" style="margin-top: 0.5rem;">
          <code>npm install mqtt && node one-device.js --config .\\sift-device.json</code>
        </div>
      </div>

      <!-- Troubleshooting Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--border);">
          <h3>5. Troubleshooting & Error Codes</h3>
          <p style="font-size: 0.85rem; margin-bottom: 0;">Solutions to common connection, upload, and broker errors:</p>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th style="width: 25%;">Symptom</th>
                <th style="width: 30%;">Likely Cause</th>
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

      <!-- Security Notice -->
      <div class="banner banner-info" style="margin-top: 1.5rem;">
        🔒 <strong>Local Demo Security Notice:</strong> MQTT communication runs over plain TCP (port 1883) in this local development environment. Production cloud deployments encapsulate traffic within TLS (MQTTS).
      </div>
    </div>
  `;
}
