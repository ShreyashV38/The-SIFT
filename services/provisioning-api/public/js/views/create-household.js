// ---------------------------------------------------------------------------
// The-SIFT Cloud Portal — Provision Household Workspace (#/create-household)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard, resolveCloudDomain, resolveHaUrl } from '../ui.js';

export async function renderCreateHousehold(container, router) {
  let step = 1;
  let formState = {
    displayName: '',
    slug: '',
    plan: 'single',
    tierUi: 'free', // 'free' -> 'single', 'home' -> 'family', 'pro' -> 'family'
  };
  let configData = null;
  let createdData = null;

  try {
    configData = await api.getConfig();
  } catch {
    configData = {
      plans: {
        single: { seats: 1, devices: 10 },
        family: { seats: 6, devices: 30 },
      },
    };
  }

  const cloudDomain = resolveCloudDomain(configData?.tenantDomain);

  function render() {
    container.innerHTML = `
      <div style="max-width: 820px; margin: 0.5rem auto;">
        <div class="stepper-nav">
          <div class="stepper-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
            <div class="step-circle">${step > 1 ? '1' : '1'}</div>
            <span class="step-label">Workspace Identity</span>
          </div>
          <div class="stepper-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
            <div class="step-circle">2</div>
            <span class="step-label">Infrastructure Tier</span>
          </div>
          <div class="stepper-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}">
            <div class="step-circle">3</div>
            <span class="step-label">Cloud Orchestration</span>
          </div>
          <div class="stepper-step ${step === 4 ? 'active' : ''}">
            <div class="step-circle">4</div>
            <span class="step-label">Instance Ready</span>
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

  function renderStep1(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Provision Isolated Cloud Household</h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              Deploys a dedicated Kubernetes namespace, Magistrala MQTT domain, and isolated Home Assistant Cloud pod.
            </p>
          </div>
        </div>

        <div id="step1-error" class="banner banner-danger" style="display: none;"></div>

        <form id="step1-form">
          <div class="form-group">
            <label for="house-name">Household Workspace Name</label>
            <input type="text" id="house-name" required value="${formState.displayName}" placeholder="e.g. Alpine Residence" maxlength="50">
            <div class="form-hint">Displayed across your telemetry console and member RBAC invitations.</div>
          </div>

          <div class="form-group">
            <label for="house-slug">Cloud Subdomain Slug</label>
            <input type="text" id="house-slug" class="mono" required value="${formState.slug}" placeholder="alpine-residence" pattern="^[a-z0-9][a-z0-9-]{1,29}[a-z0-9]$">
            <div class="form-hint" style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>Cloud Endpoint Preview:</span>
              <code id="slug-preview" style="color: var(--accent); font-weight: 600;">https://${formState.slug || 'alpine-residence'}.${cloudDomain}</code>
            </div>
          </div>

          <div style="margin-top: var(--space-xl); display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn-primary">
              Select Infrastructure Tier
            </button>
          </div>
        </form>
      </div>
    `;

    const nameInput = el.querySelector('#house-name');
    const slugInput = el.querySelector('#house-slug');
    const slugPreview = el.querySelector('#slug-preview');
    const form = el.querySelector('#step1-form');
    const errorBanner = el.querySelector('#step1-error');

    nameInput.addEventListener('input', () => {
      if (!slugInput.dataset.manual) {
        const auto = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        slugInput.value = auto;
        if (slugPreview) slugPreview.textContent = `https://${auto || 'workspace'}.${cloudDomain}`;
      }
    });

    slugInput.addEventListener('input', () => {
      slugInput.dataset.manual = 'true';
      const val = slugInput.value.trim().toLowerCase() || 'workspace';
      if (slugPreview) slugPreview.textContent = `https://${val}.${cloudDomain}`;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const slugVal = slugInput.value.trim().toLowerCase();
      const nameVal = nameInput.value.trim();

      if (!/^[a-z0-9][a-z0-9-]{1,29}[a-z0-9]$/.test(slugVal)) {
        errorBanner.textContent = 'Slug must be 3-30 lowercase alphanumeric characters and hyphens, without leading or trailing hyphens.';
        errorBanner.style.display = 'block';
        return;
      }

      formState.displayName = nameVal;
      formState.slug = slugVal;
      step = 2;
      render();
    });
  }

  function renderStep2(el) {
    const plans = configData.plans || {};
    const singleLimit = plans.single || { seats: 1, devices: 10 };
    const familyLimit = plans.family || { seats: 6, devices: 30 };

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Select Infrastructure Resource Tier</h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              Choose hardware device quotas, RBAC member seats, and pod compute ceilings.
            </p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-md); margin-bottom: var(--space-xl);">
          <!-- Free (Single) Tier -->
          <div class="plan-card ${formState.tierUi === 'free' ? 'plan-selected' : ''}" id="tier-free">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 6px;">
              <span class="badge badge-tier">FREE</span>
              <span class="badge ${formState.tierUi === 'free' ? 'badge-online' : 'badge-offline'}">
                <span class="led-dot ${formState.tierUi === 'free' ? 'led-emerald' : 'led-muted'}"></span>
                ${formState.tierUi === 'free' ? 'Selected' : 'Select'}
              </span>
            </div>
            <h3 style="margin-bottom: 4px;">Single Starter</h3>
            <p style="font-size: 0.78125rem; color: var(--text-secondary);">Individual developer &amp; studio apartment deployment.</p>
            <ul class="feature-list" style="margin-top: var(--space-sm); width: 100%;">
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>${singleLimit.seats} Operator Seat</strong></span></li>
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>${singleLimit.devices} MQTT Devices</strong></span></li>
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>500m CPU / 512 MiB</strong> Pod</span></li>
            </ul>
          </div>

          <!-- Home (Family) Tier -->
          <div class="plan-card ${formState.tierUi === 'home' ? 'plan-selected' : ''}" id="tier-home">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 6px;">
              <span class="badge badge-role">HOME</span>
              <span class="badge ${formState.tierUi === 'home' ? 'badge-online' : 'badge-offline'}">
                <span class="led-dot ${formState.tierUi === 'home' ? 'led-emerald' : 'led-muted'}"></span>
                ${formState.tierUi === 'home' ? 'Selected' : 'Select'}
              </span>
            </div>
            <h3 style="margin-bottom: 4px;">Household Cloud</h3>
            <p style="font-size: 0.78125rem; color: var(--text-secondary);">Multi-user household with full RBAC &amp; automation.</p>
            <ul class="feature-list" style="margin-top: var(--space-sm); width: 100%;">
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>${familyLimit.seats} Household Seats</strong></span></li>
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>${familyLimit.devices} MQTT Devices</strong></span></li>
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>1000m CPU / 1 GiB</strong> Pod</span></li>
            </ul>
          </div>

          <!-- Pro Tier (Maps to family capacity on backend) -->
          <div class="plan-card ${formState.tierUi === 'pro' ? 'plan-selected' : ''}" id="tier-pro">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 6px;">
              <span class="badge badge-tier">PRO</span>
              <span class="badge ${formState.tierUi === 'pro' ? 'badge-online' : 'badge-offline'}">
                <span class="led-dot ${formState.tierUi === 'pro' ? 'led-emerald' : 'led-muted'}"></span>
                ${formState.tierUi === 'pro' ? 'Selected' : 'Select'}
              </span>
            </div>
            <h3 style="margin-bottom: 4px;">Pro Telemetry</h3>
            <p style="font-size: 0.78125rem; color: var(--text-secondary);">High-frequency SenML telemetry &amp; priority HA compute.</p>
            <ul class="feature-list" style="margin-top: var(--space-sm); width: 100%;">
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>${familyLimit.seats} Operator Seats</strong></span></li>
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>${familyLimit.devices} MQTT Devices</strong></span></li>
              <li><span class="mono" style="color: var(--led-emerald);">[x]</span> <span><strong>Dedicated K8s Quota</strong></span></li>
            </ul>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button type="button" id="step2-back" class="btn btn-secondary">Back</button>
          <button type="button" id="step2-next" class="btn btn-primary">Initialize Cloud Namespace</button>
        </div>
      </div>
    `;

    el.querySelector('#tier-free').addEventListener('click', () => {
      formState.tierUi = 'free';
      formState.plan = 'single';
      renderStep2(el);
    });

    el.querySelector('#tier-home').addEventListener('click', () => {
      formState.tierUi = 'home';
      formState.plan = 'family';
      renderStep2(el);
    });

    el.querySelector('#tier-pro').addEventListener('click', () => {
      formState.tierUi = 'pro';
      formState.plan = 'family';
      renderStep2(el);
    });

    el.querySelector('#step2-back').addEventListener('click', () => {
      step = 1;
      render();
    });

    el.querySelector('#step2-next').addEventListener('click', async () => {
      step = 3;
      render();
      await executeProvisioning();
    });
  }

  function renderStep3(el) {
    el.innerHTML = `
      <div class="card" style="text-align: center; padding: var(--space-3xl) var(--space-xl);">
        <span class="spinner" style="width: 36px; height: 36px; margin-bottom: var(--space-lg);"></span>
        <h2>Orchestrating Cloud Namespace <span class="mono" style="color: var(--accent);">tenant-${formState.slug}</span></h2>
        <p style="font-size: 0.875rem; max-width: 520px; margin: 0 auto var(--space-xl) auto;">
          Applying Kubernetes NetworkPolicies, provisioning Magistrala channels, and booting your isolated Home Assistant Cloud pod.
        </p>

        <div style="text-align: left; max-width: 480px; margin: 0 auto; background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-md); border: 1px solid var(--border);">
          <div class="checklist-item">
            <span class="led-dot led-emerald" style="margin-top: 6px;"></span>
            <span class="mono" style="font-size: 0.78125rem;">[01/04] Allocating Magistrala IoT Domain &amp; Channel Topology</span>
          </div>
          <div class="checklist-item">
            <span class="led-dot led-emerald" style="margin-top: 6px;"></span>
            <span class="mono" style="font-size: 0.78125rem;">[02/04] Binding Telemetry &amp; Command Topic ACLs</span>
          </div>
          <div class="checklist-item">
            <span class="led-dot led-emerald" style="margin-top: 6px;"></span>
            <span class="mono" style="font-size: 0.78125rem;">[03/04] Enforcing Kubernetes ResourceQuota &amp; NetworkPolicy</span>
          </div>
          <div class="checklist-item">
            <span class="led-dot led-amber" style="margin-top: 6px;"></span>
            <span class="mono" style="font-size: 0.78125rem;">[04/04] Deploying Home Assistant Cloud Container</span>
          </div>
        </div>
      </div>
    `;
  }

  async function executeProvisioning() {
    try {
      const res = await api.createTenant(formState.slug, formState.displayName, formState.plan);
      createdData = res;
      step = 4;
      render();
    } catch (err) {
      toast(err.message || 'Provisioning failed', 'error');
      const el = container.querySelector('#step-content');
      el.innerHTML = `
        <div class="card">
          <div class="banner banner-danger">
            <strong>Cloud Provisioning Error:</strong> ${err.message}
          </div>
          <p>The cloud control plane encountered an error while allocating your household namespace.</p>
          <button id="retry-btn" class="btn btn-secondary">Back &amp; Retry</button>
        </div>
      `;
      el.querySelector('#retry-btn').addEventListener('click', () => {
        step = 1;
        render();
      });
    }
  }

  function renderStep4(el) {
    const tenant = createdData?.tenant || {};
    const haCreds = createdData?.haCredentials || {};
    const haUrl = resolveHaUrl(tenant.slug, tenant.url, cloudDomain);

    el.innerHTML = `
      <div class="card">
        <div class="banner banner-success">
          <span class="led-dot led-emerald" style="margin-right: 6px;"></span>
          <strong>Cloud Workspace Operational:</strong> Namespace <code style="background:transparent;border:none;padding:0;">${tenant.namespace || 'tenant-' + tenant.slug}</code> is live.
        </div>

        <h2>${tenant.displayName} <span class="mono" style="font-size: 0.95rem; color: var(--text-muted);">(${tenant.slug})</span></h2>
        <p style="font-size: 0.84375rem;">
          Your isolated Home Assistant Cloud instance is online and bridged to your household MQTT channels.
        </p>

        <div class="card" style="background: var(--bg-surface); margin: var(--space-lg) 0;">
          <h3 style="margin-bottom: 4px;">Home Assistant Cloud Credentials Vault</h3>
          <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: var(--space-md);">
            Use these pre-seeded credentials to sign in to your dedicated Home Assistant Cloud portal:
          </p>

          <div style="margin-bottom: var(--space-sm);">
            <div class="data-label">Home Assistant Cloud Endpoint</div>
            <div class="copy-box">
              <span>${haUrl}</span>
              <button id="copy-url-btn" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>

          <div style="margin-bottom: var(--space-sm);">
            <div class="data-label">Administrator Username</div>
            <div class="copy-box">
              <span>${haCreds.username || 'admin'}</span>
              <button id="copy-user-btn" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>

          <div>
            <div class="data-label">Initial Password</div>
            <div class="copy-box">
              <span id="ha-pass-mask">•••••••••••••</span>
              <span id="ha-pass-clear" style="display: none; font-weight: 600; color: var(--led-emerald);">${haCreds.password || 'CloudNest2026!'}</span>
              <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button id="reveal-pass-btn" class="btn btn-secondary btn-sm">Reveal</button>
                <button id="copy-pass-btn" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
          <a href="${haUrl}" target="_blank" rel="noopener" class="btn btn-secondary">
            Launch Home Assistant Cloud
          </a>
          <button id="go-home-btn" class="btn btn-primary">
            Open Workspace Overview
          </button>
        </div>
      </div>
    `;

    el.querySelector('#copy-url-btn').addEventListener('click', function() {
      copyToClipboard(haUrl, this);
    });

    el.querySelector('#copy-user-btn').addEventListener('click', function() {
      copyToClipboard(haCreds.username || 'admin', this);
    });

    const revealBtn = el.querySelector('#reveal-pass-btn');
    const maskSpan = el.querySelector('#ha-pass-mask');
    const clearSpan = el.querySelector('#ha-pass-clear');
    revealBtn.addEventListener('click', () => {
      if (clearSpan.style.display === 'none') {
        clearSpan.style.display = 'inline';
        maskSpan.style.display = 'none';
        revealBtn.textContent = 'Mask';
      } else {
        clearSpan.style.display = 'none';
        maskSpan.style.display = 'inline';
        revealBtn.textContent = 'Reveal';
      }
    });

    el.querySelector('#copy-pass-btn').addEventListener('click', function() {
      copyToClipboard(haCreds.password || 'CloudNest2026!', this);
    });

    el.querySelector('#go-home-btn').addEventListener('click', async () => {
      await router.refreshSession();
      router.navigate(`#/t/${tenant.slug}`);
    });
  }

  render();
}
