// ---------------------------------------------------------------------------
// The-SIFT Cloud Platform — Production Cloud Documentation Hub (#/help/esp32)
// ---------------------------------------------------------------------------

import { copyToClipboard, resolveCloudDomain, resolveMqttHost } from '../ui.js';

export function renderHelp(container) {
  const cloudDomain = resolveCloudDomain();
  const mqttHost = resolveMqttHost();

  const senmlClimatePayload = JSON.stringify([
    { bn: 'urn:dev:ow:sift-env-01:', bt: 1730000000, n: 'temperature', u: 'Cel', v: 23.4 },
    { n: 'humidity', u: '%RH', v: 46.8 },
  ], null, 2);

  const jsonBridgePayload = JSON.stringify({
    id: 'living_room_climate_01',
    temperature: 23.4,
    humidity: 46.8,
    battery: 98,
  }, null, 2);

  const commandDownlinkPayload = JSON.stringify({
    id: 'living_room_climate_01',
    command: 'SET_STATE',
    state: 'ON',
    target_temp: 22.0,
  }, null, 2);

  container.innerHTML = `
    <div>
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1>Cloud Architecture & Hardware Documentation</h1>
          <p class="page-subtitle">
            Technical reference for multi-tenant cloud isolation, ESP32 MQTT onboarding, SenML telemetry schemas, and RBAC security boundaries.
          </p>
        </div>
        <div class="page-header-actions">
          <span class="badge badge-online"><span class="led-dot led-emerald"></span>CLOUD SPEC v2.4</span>
          <a href="#/" class="btn btn-secondary btn-sm">Back to Workspace</a>
        </div>
      </div>

      <!-- Search & Category Filter Bar -->
      <div class="card" style="padding: var(--space-md) var(--space-lg); margin-bottom: var(--space-lg);">
        <div class="action-bar" style="margin-bottom: 0;">
          <div class="search-input-wrap" style="max-width: 360px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" id="docs-search-input" placeholder="Search architecture, MQTT, SenML, Home Assistant, RBAC...">
          </div>

          <div class="filter-pills" id="docs-tab-pills">
            <button type="button" class="filter-pill active" data-doc-tab="all">All Specifications</button>
            <button type="button" class="filter-pill" data-doc-tab="architecture">1. Cloud Isolation</button>
            <button type="button" class="filter-pill" data-doc-tab="esp32">2. ESP32 & MQTT</button>
            <button type="button" class="filter-pill" data-doc-tab="senml">3. SenML Schema</button>
            <button type="button" class="filter-pill" data-doc-tab="ha-cloud">4. Home Assistant Cloud</button>
            <button type="button" class="filter-pill" data-doc-tab="rbac">5. RBAC Matrix</button>
          </div>
        </div>
      </div>

      <!-- Documentation Sections Container -->
      <div id="docs-sections-container" style="display: flex; flex-direction: column; gap: var(--space-lg);">

        <!-- 1. Household Cloud Architecture & Isolation -->
        <section class="card doc-section" data-doc-section="architecture" style="margin-bottom: 0;">
          <div class="card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="badge badge-accent mono">SECTION 01</span>
                <span class="badge badge-online"><span class="led-dot led-emerald"></span>KUBERNETES NAMESPACE ISOLATED</span>
              </div>
              <div class="card-title" style="font-size: 1.05rem;">Household Cloud Architecture & Multi-Tenant Isolation</div>
              <div class="card-subtitle">Strict hardware-to-cloud tenant segregation across compute, network, and messaging planes.</div>
            </div>
          </div>

          <div class="grid-3" style="margin-bottom: var(--space-md);">
            <div style="padding: var(--space-md); background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <div class="mono" style="font-size: 0.72rem; color: var(--accent-primary); font-weight: 600; margin-bottom: 0.35rem;">01 / COMPUTE PLANE</div>
              <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-primary); margin-bottom: 0.35rem;">Dedicated K8s Namespace</div>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">
                Every household provisions an isolated Kubernetes namespace (<code class="mono">tenant-&lt;slug&gt;</code>) governed by strict <code class="mono">ResourceQuota</code>, <code class="mono">LimitRange</code>, and zero-trust <code class="mono">NetworkPolicy</code> boundaries.
              </p>
            </div>

            <div style="padding: var(--space-md); background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <div class="mono" style="font-size: 0.72rem; color: var(--led-emerald); font-weight: 600; margin-bottom: 0.35rem;">02 / MESSAGING PLANE</div>
              <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-primary); margin-bottom: 0.35rem;">Magistrala IoT Partition</div>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">
                Each household receives a dedicated Magistrala telemetry Channel. Hardware Things authenticate with unique cryptographic Thing Secrets and can publish only to their authorized channel topic.
              </p>
            </div>

            <div style="padding: var(--space-md); background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <div class="mono" style="font-size: 0.72rem; color: var(--led-amber); font-weight: 600; margin-bottom: 0.35rem;">03 / APPLICATION PLANE</div>
              <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-primary); margin-bottom: 0.35rem;">Telemetry Bridge & HA Pod</div>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;">
                The cloud Telemetry Bridge normalizes incoming MQTT messages and auto-discovers entities inside the household's dedicated Home Assistant instance at <code class="mono">https://&lt;slug&gt;.${cloudDomain}</code>.
              </p>
            </div>
          </div>

          <div class="terminal-box" style="font-size: 0.75rem;">
            <span class="term-muted"># End-to-End Cloud Telemetry & Command Dataflow</span><br>
            [ESP32 / Hardware Node] ──(MQTT / TLS :1883)──► [Magistrala mProxy (${mqttHost})]<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;channels/&lt;channel_id&gt;/messages/senml<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼<br>
            [Home Assistant Cloud (&lt;slug&gt;.${cloudDomain})] ◄──(Auto-Discovery)── [SIFT Telemetry Bridge]
          </div>
        </section>

        <!-- 2. Connecting ESP32 & MQTT Hardware -->
        <section class="card doc-section" data-doc-section="esp32" style="margin-bottom: 0;">
          <div class="card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="badge badge-accent mono">SECTION 02</span>
                <span class="badge badge-neutral mono">MQTT v3.1.1 / TLS</span>
              </div>
              <div class="card-title" style="font-size: 1.05rem;">Connecting ESP32 & MQTT Hardware to the Cloud Broker</div>
              <div class="card-subtitle">Step-by-step firmware flashing and cloud connectivity verification workflow.</div>
            </div>
          </div>

          <div class="grid-2" style="margin-bottom: var(--space-md);">
            <div>
              <h4 style="font-size: 0.85rem; margin-bottom: 0.5rem; color: var(--text-primary);">Hardware & Toolchain Requirements</h4>
              <ul class="feature-list">
                <li>
                  <span class="feature-check">01</span>
                  <span><strong>Microcontroller:</strong> ESP32-WROOM-32, ESP32-S3, or NodeMCU-32S with 2.4 GHz Wi-Fi connectivity.</span>
                </li>
                <li>
                  <span class="feature-check">02</span>
                  <span><strong>Arduino / PlatformIO:</strong> Install the official Espressif <code class="mono">esp32</code> board package and <code class="mono">PubSubClient</code> (&ge; v2.8).</span>
                </li>
                <li>
                  <span class="feature-check">03</span>
                  <span><strong>Cloud Credentials:</strong> Generate a <code class="mono">Thing ID</code>, <code class="mono">Thing Secret</code>, and <code class="mono">Channel ID</code> from the household <strong>Provision Device</strong> wizard.</span>
                </li>
                <li>
                  <span class="feature-check">04</span>
                  <span><strong>Cloud Verification Client:</strong> Use the downloadable <code class="mono">sift-device-client.js</code> utility from any device page to verify cloud broker routing prior to flashing physical silicon.</span>
                </li>
              </ul>
            </div>

            <div>
              <h4 style="font-size: 0.85rem; margin-bottom: 0.5rem; color: var(--text-primary);">Espressif Board Manager Index URL</h4>
              <div class="copy-box" style="margin-bottom: var(--space-md);">
                <code>https://espressif.github.io/arduino-esp32/package_esp32_index.json</code>
                <button id="copy-esp32-index-btn" class="btn btn-secondary btn-xs">Copy URL</button>
              </div>

              <h4 style="font-size: 0.85rem; margin-bottom: 0.5rem; color: var(--text-primary);">Cloud Broker Endpoint Parameters</h4>
              <div class="kv-grid">
                <div class="kv-row">
                  <span class="kv-key">Cloud MQTT Host</span>
                  <span class="kv-val">${mqttHost}</span>
                </div>
                <div class="kv-row">
                  <span class="kv-key">MQTT TCP / TLS Ports</span>
                  <span class="kv-val">1883 (TCP) / 8883 (TLS)</span>
                </div>
                <div class="kv-row">
                  <span class="kv-key">MQTT Username</span>
                  <span class="kv-val">&lt;Thing ID&gt;</span>
                </div>
                <div class="kv-row">
                  <span class="kv-key">MQTT Password</span>
                  <span class="kv-val">&lt;Thing Secret&gt;</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 3. SenML Telemetry Payload Schema -->
        <section class="card doc-section" data-doc-section="senml" style="margin-bottom: 0;">
          <div class="card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="badge badge-accent mono">SECTION 03</span>
                <span class="badge badge-neutral mono">RFC 8428 SENML + JSON</span>
              </div>
              <div class="card-title" style="font-size: 1.05rem;">SenML & Bridge Telemetry Payload Specifications</div>
              <div class="card-subtitle">Standardized payload schemas for uplink sensor telemetry and downlink actuator commands.</div>
            </div>
          </div>

          <div class="grid-3">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <span class="mono" style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary);">A. RFC 8428 SenML Array</span>
                <button class="btn btn-secondary btn-xs copy-doc-payload" data-payload="${encodeURIComponent(senmlClimatePayload)}">Copy JSON</button>
              </div>
              <pre class="terminal-box" style="margin: 0; font-size: 0.74rem; min-height: 170px;">${senmlClimatePayload}</pre>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <span class="mono" style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary);">B. Normalized Telemetry JSON</span>
                <button class="btn btn-secondary btn-xs copy-doc-payload" data-payload="${encodeURIComponent(jsonBridgePayload)}">Copy JSON</button>
              </div>
              <pre class="terminal-box" style="margin: 0; font-size: 0.74rem; min-height: 170px;">${jsonBridgePayload}</pre>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                <span class="mono" style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary);">C. Actuator Downlink Command</span>
                <button class="btn btn-secondary btn-xs copy-doc-payload" data-payload="${encodeURIComponent(commandDownlinkPayload)}">Copy JSON</button>
              </div>
              <pre class="terminal-box" style="margin: 0; font-size: 0.74rem; min-height: 170px;">${commandDownlinkPayload}</pre>
            </div>
          </div>
        </section>

        <!-- 4. Home Assistant Cloud Portal Integration -->
        <section class="card doc-section" data-doc-section="ha-cloud" style="margin-bottom: 0;">
          <div class="card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="badge badge-accent mono">SECTION 04</span>
                <span class="badge badge-online"><span class="led-dot led-emerald"></span>AUTO-DISCOVERY ENABLED</span>
              </div>
              <div class="card-title" style="font-size: 1.05rem;">Home Assistant Cloud Portal Integration</div>
              <div class="card-subtitle">Zero-configuration entity registration and bidirectional state synchronization.</div>
            </div>
          </div>

          <div class="grid-2">
            <div style="padding: var(--space-md); background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <h4 style="font-size: 0.85rem; margin-bottom: 0.4rem; color: var(--text-primary);">Automatic Entity Discovery</h4>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                As soon as a provisioned device publishes its first telemetry frame to <code class="mono">channels/&lt;channel_id&gt;/messages/senml</code>, the SIFT Telemetry Bridge synthesizes Home Assistant MQTT Discovery descriptors and binds the sensor or actuator to your household instance.
              </p>
              <div class="mono" style="font-size: 0.74rem; color: var(--accent-primary);">
                Portal Endpoint: https://&lt;household-slug&gt;.${cloudDomain}
              </div>
            </div>

            <div style="padding: var(--space-md); background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <h4 style="font-size: 0.85rem; margin-bottom: 0.4rem; color: var(--text-primary);">Initial Administrator Credentials</h4>
              <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                Your dedicated Home Assistant pod is pre-seeded during namespace provisioning. Retrieve the generated administrator username and initial password from the <strong>Home Assistant Cloud Launchpad</strong> on your Household Overview page.
              </p>
              <div class="mono" style="font-size: 0.74rem; color: var(--led-emerald);">
                TLS Termination: Traefik Cloud Ingress + Automated Certs
              </div>
            </div>
          </div>
        </section>

        <!-- 5. Role-Based Access Control (Admin, Member, Guest Matrix) -->
        <section class="card doc-section" data-doc-section="rbac" style="margin-bottom: 0; padding: 0; overflow: hidden;">
          <div style="padding: var(--space-lg) var(--space-xl); border-bottom: 1px solid var(--border-subtle);">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span class="badge badge-accent mono">SECTION 05</span>
              <span class="badge badge-neutral mono">ZERO-TRUST RBAC</span>
            </div>
            <div class="card-title" style="font-size: 1.05rem;">Role-Based Access Control (Admin, Member, Guest Matrix)</div>
            <div class="card-subtitle">Granular capability enforcement across the Provisioning API, Identity Service, and IoT Broker Service.</div>
          </div>

          <div class="table-container" style="border: none; border-radius: 0;">
            <table>
              <thead>
                <tr>
                  <th>Platform Capability</th>
                  <th>Owner / Admin</th>
                  <th>Household Member</th>
                  <th>Guest (Invited / Read Scope)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>View Household Overview & Telemetry Readouts</strong></td>
                  <td><span class="badge badge-online"><span class="led-dot led-emerald"></span>Allowed</span></td>
                  <td><span class="badge badge-online"><span class="led-dot led-emerald"></span>Allowed</span></td>
                  <td><span class="badge badge-neutral">Read-Only Preview</span></td>
                </tr>
                <tr>
                  <td><strong>Launch Home Assistant Cloud Portal</strong></td>
                  <td><span class="badge badge-online"><span class="led-dot led-emerald"></span>Allowed</span></td>
                  <td><span class="badge badge-online"><span class="led-dot led-emerald"></span>Allowed</span></td>
                  <td><span class="badge badge-danger">Restricted</span></td>
                </tr>
                <tr>
                  <td><strong>Dispatch Downlink Actuator Commands</strong></td>
                  <td><span class="badge badge-online"><span class="led-dot led-emerald"></span>Allowed</span></td>
                  <td><span class="badge badge-online"><span class="led-dot led-emerald"></span>Allowed</span></td>
                  <td><span class="badge badge-danger">Restricted</span></td>
                </tr>
                <tr>
                  <td><strong>Provision Hardware & Rotate Thing Secrets</strong></td>
                  <td><span class="badge badge-online"><span class="led-dot led-emerald"></span>Allowed</span></td>
                  <td><span class="badge badge-danger">Admin Only</span></td>
                  <td><span class="badge badge-danger">Restricted</span></td>
                </tr>
                <tr>
                  <td><strong>Invite Members & Modify RBAC Roles</strong></td>
                  <td><span class="badge badge-online"><span class="led-dot led-emerald"></span>Allowed</span></td>
                  <td><span class="badge badge-danger">Owner / Admin Only</span></td>
                  <td><span class="badge badge-danger">Restricted</span></td>
                </tr>
                <tr>
                  <td><strong>Modify Infrastructure Tier & Decommission Namespace</strong></td>
                  <td><span class="badge badge-accent"><span class="led-dot led-cobalt"></span>Primary Owner Only</span></td>
                  <td><span class="badge badge-danger">Owner Only</span></td>
                  <td><span class="badge badge-danger">Restricted</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  `;

  // Copy board manager URL
  container.querySelector('#copy-esp32-index-btn')?.addEventListener('click', function () {
    copyToClipboard('https://espressif.github.io/arduino-esp32/package_esp32_index.json', this);
  });

  // Copy JSON payload examples
  container.querySelectorAll('.copy-doc-payload').forEach(btn => {
    btn.addEventListener('click', function () {
      const text = decodeURIComponent(this.dataset.payload || '');
      copyToClipboard(text, this);
    });
  });

  // Tab filter pills & live search
  const searchInput = container.querySelector('#docs-search-input');
  const tabPills = container.querySelectorAll('#docs-tab-pills .filter-pill');
  const sections = container.querySelectorAll('.doc-section');
  let activeTab = 'all';

  function applyDocFilters() {
    const query = (searchInput?.value || '').trim().toLowerCase();
    sections.forEach(sec => {
      const sectionKey = sec.dataset.docSection;
      const matchesTab = activeTab === 'all' || sectionKey === activeTab;
      const matchesQuery = !query || sec.textContent.toLowerCase().includes(query);
      sec.style.display = matchesTab && matchesQuery ? 'block' : 'none';
    });
  }

  tabPills.forEach(pill => {
    pill.addEventListener('click', () => {
      tabPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeTab = pill.dataset.docTab || 'all';
      applyDocFilters();
    });
  });

  searchInput?.addEventListener('input', applyDocFilters);
}
