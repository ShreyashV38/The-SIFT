// ---------------------------------------------------------------------------
// The-SIFT Smart Home Portal — Getting Started & Help Guide (#/help)
// ---------------------------------------------------------------------------

import { copyToClipboard } from '../ui.js';

export function renderHelp(container) {
  const simCommand = 'npm install mqtt && node one-device.js --config ./sift-device.json';
  const arduinoBoardUrl = 'https://espressif.github.io/arduino-esp32/package_esp32_index.json';

  container.innerHTML = `
    <div style="max-width: 860px; margin: 0.5rem auto;">
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1>How to Use The-SIFT (Step-by-Step Guide)</h1>
          <p style="margin-bottom: 0; font-size: 0.875rem; color: var(--text-secondary);">
            Follow these 5 simple steps to set up your account, create a household, connect your devices, and open Home Assistant.
          </p>
        </div>
        <div class="page-header-actions">
          <a href="#/" class="btn btn-secondary btn-sm">&larr; Back to Overview</a>
        </div>
      </div>

      <!-- Step 1: Create an Account & Sign In -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-sm);">
          <span class="badge badge-tier">STEP 1</span>
          <h3 style="margin-bottom: 0;">Create an Account &amp; Sign In</h3>
        </div>
        <ol style="margin-left: 1.25rem; font-size: 0.875rem; line-height: 1.85; color: var(--text-secondary);">
          <li>
            If you are new to The-SIFT, click <a href="#/register" class="inline-link" style="font-weight: 600;">Register</a>, enter your full name, email address, and a password (at least 8 characters), then click <strong>Create Account</strong>.
          </li>
          <li>
            Go to <a href="#/login" class="inline-link" style="font-weight: 600;">Sign In</a> and enter your email address and password.
          </li>
          <li>
            Check your email inbox for a <strong>6-digit verification code</strong>, enter it on the screen, and click <strong>Verify &amp; Sign In</strong>.
          </li>
        </ol>
      </div>

      <!-- Step 2: Create Your Household & Choose a Plan -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-sm);">
          <span class="badge badge-tier">STEP 2</span>
          <h3 style="margin-bottom: 0;">Create Your Household &amp; Choose a Plan</h3>
        </div>
        <ol style="margin-left: 1.25rem; font-size: 0.875rem; line-height: 1.85; color: var(--text-secondary);">
          <li>
            After signing in for the first time, you'll be taken to <a href="#/create-household" class="inline-link" style="font-weight: 600;">Create Household</a> (or you can click <strong>+ New</strong> in the left sidebar at any time).
          </li>
          <li>
            Enter a <strong>Household Name</strong> (for example, <em>Smith Home</em>). This automatically fills in your short <strong>Household ID (Slug)</strong>.
          </li>
          <li>
            Choose one of the two household plans:
            <ul style="margin: 6px 0 6px 1.25rem;">
              <li><strong>Single Plan:</strong> 1 Member and up to 10 Devices (ideal for personal apartments and individual testing).</li>
              <li><strong>Family Plan:</strong> Up to 6 Members and up to 30 Devices (ideal for sharing access with family members).</li>
            </ul>
          </li>
          <li>
            Click <strong>Start Provisioning &rarr;</strong> and wait a few seconds for your smart home hub to finish setting up.
          </li>
        </ol>
      </div>

      <!-- Step 3: Add a Smart Device (Virtual Simulator or ESP32) -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-sm);">
          <span class="badge badge-tier">STEP 3</span>
          <h3 style="margin-bottom: 0;">Add a Smart Device (Virtual Simulator or ESP32)</h3>
        </div>
        <ol style="margin-left: 1.25rem; font-size: 0.875rem; line-height: 1.85; color: var(--text-secondary);">
          <li>
            Open the <strong>Devices</strong> tab in the left sidebar and click <strong>+ Add Device</strong>.
          </li>
          <li>
            Choose <strong>Virtual Device (Run on PC)</strong> if you want to test right away on your computer without physical hardware, or <strong>ESP32 Microcontroller</strong> if you have an ESP32 board.
          </li>
          <li>
            Select <strong>Sensor (Temperature &amp; Humidity)</strong> or <strong>Smart Switch (ON / OFF)</strong>, give it a friendly name (such as <em>Living Room Sensor</em>), and click <strong>Create Device &rarr;</strong>.
          </li>
          <li>
            <strong>If using a Virtual Device on your PC:</strong>
            Download both <code>sift-device.json</code> and <code>one-device.js</code> into the same folder, open a terminal in that folder, and run:
            <div class="copy-box" style="margin: 8px 0;">
              <code>${simCommand}</code>
              <button type="button" id="copy-sim-cmd" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </li>
          <li>
            <strong>If using a physical ESP32 board:</strong>
            Enter your 2.4 GHz Wi-Fi name and password, download <code>sift-device.ino</code>, and upload it in <strong>Arduino IDE</strong> (with the <code>esp32</code> board package and <code>PubSubClient</code> library installed).
            <div style="margin-top: 6px; font-size: 0.8125rem; color: var(--text-muted);">
              Arduino ESP32 Board Manager URL:
            </div>
            <div class="copy-box" style="margin-top: 4px;">
              <code>${arduinoBoardUrl}</code>
              <button type="button" id="copy-board-url" class="btn btn-secondary btn-sm">Copy URL</button>
            </div>
          </li>
          <li>
            Check <em>"I have downloaded my setup files"</em> and click <strong>Next: Connect Device &rarr;</strong>. Within a few seconds of starting your device, the page will automatically advance to <strong>Device Connected!</strong>
          </li>
        </ol>
      </div>

      <!-- Step 4: Open Home Assistant & Log In -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-sm);">
          <span class="badge badge-tier">STEP 4</span>
          <h3 style="margin-bottom: 0;">Open Home Assistant &amp; Log In</h3>
        </div>
        <ol style="margin-left: 1.25rem; font-size: 0.875rem; line-height: 1.85; color: var(--text-secondary);">
          <li>
            Go to your household <strong>Overview</strong> page from the left sidebar.
          </li>
          <li>
            In the <strong>Home Assistant Dashboard</strong> card, click <strong>Show Login Details</strong> to reveal your household's shared Home Assistant <strong>Username</strong> (<code>admin</code>) and <strong>Password</strong>.
          </li>
          <li>
            Click <strong>Open Home Assistant</strong> to launch your smart home dashboard in a new browser tab.
          </li>
          <li>
            Copy and paste the username and password to sign in. Your connected sensors and smart switches will appear automatically on the dashboard!
          </li>
        </ol>
      </div>

      <!-- Step 5: Invite Family Members & Control Devices Together -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-sm);">
          <span class="badge badge-tier">STEP 5</span>
          <h3 style="margin-bottom: 0;">Invite Family Members &amp; Control Devices Together</h3>
        </div>
        <ol style="margin-left: 1.25rem; font-size: 0.875rem; line-height: 1.85; color: var(--text-secondary);">
          <li>
            If you are on the <strong>Family Plan</strong> (or after upgrading in the <strong>Plan</strong> tab), open the <strong>Members</strong> tab in the left sidebar.
          </li>
          <li>
            Enter your family member's email address, choose their role (<strong>Member</strong> or <strong>Admin</strong>), and click <strong>Add Member</strong>.
          </li>
          <li>
            If they already have an account, they are added right away. If they haven't registered yet, an invitation email is sent and you can also copy their invite link directly from the <strong>Pending Invitations</strong> list.
          </li>
          <li>
            Once added, family members can sign in with their own account to view live sensor readings, turn smart switches ON or OFF, and open the household's Home Assistant dashboard.
          </li>
        </ol>
      </div>
    </div>
  `;

  container.querySelector('#copy-sim-cmd')?.addEventListener('click', function () {
    copyToClipboard(simCommand, this, 'Copy');
  });

  container.querySelector('#copy-board-url')?.addEventListener('click', function () {
    copyToClipboard(arduinoBoardUrl, this, 'Copy URL');
  });
}
