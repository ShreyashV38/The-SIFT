// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Create Household Wizard (#/create-household)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard } from '../ui.js';

export async function renderCreateHousehold(container, router) {
  let step = 1;
  let formState = {
    displayName: '',
    slug: '',
    plan: 'single',
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

  function render() {
    container.innerHTML = `
      <div style="max-width: 720px; margin: 1.5rem auto;">
        <div class="stepper-nav">
          <div class="stepper-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
            <div class="step-circle">${step > 1 ? '✓' : '1'}</div>
            <span class="step-label">Name & Domain</span>
          </div>
          <div class="stepper-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
            <div class="step-circle">${step > 2 ? '✓' : '2'}</div>
            <span class="step-label">Select Plan</span>
          </div>
          <div class="stepper-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}">
            <div class="step-circle">${step > 3 ? '✓' : '3'}</div>
            <span class="step-label">Provisioning</span>
          </div>
          <div class="stepper-step ${step === 4 ? 'active' : ''}">
            <div class="step-circle">4</div>
            <span class="step-label">Ready</span>
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

  // Step 1: Name and slug
  function renderStep1(el) {
    el.innerHTML = `
      <div class="card">
        <h2>Create a Household Workspace</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Give your smart home environment a friendly name and a dedicated subdomain.
        </p>

        <div id="step1-error" class="banner banner-danger" style="display: none;"></div>

        <form id="step1-form">
          <div class="form-group">
            <label for="house-name">Household Friendly Name</label>
            <input type="text" id="house-name" required value="${formState.displayName}" placeholder="e.g. Maple Cottage" maxlength="50">
            <div class="form-hint">Displayed at the top of your dashboard and member invites.</div>
          </div>

          <div class="form-group">
            <label for="house-slug">Household Subdomain Slug</label>
            <input type="text" id="house-slug" required value="${formState.slug}" placeholder="e.g. maple-cottage" pattern="^[a-z0-9][a-z0-9-]{1,29}[a-z0-9]$">
            <div class="form-hint">
              Live Domain: <code id="slug-preview" style="background: none; font-weight: 700; color: var(--brand-teal);">${formState.slug || 'maple-cottage'}.localtest.me</code>
            </div>
          </div>

          <div style="margin-top: var(--space-xl); display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn-primary">
              Next: Select Capacity Tier →
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
        if (slugPreview) slugPreview.textContent = (auto || 'subdomain') + '.localtest.me';
      }
    });

    slugInput.addEventListener('input', () => {
      slugInput.dataset.manual = 'true';
      if (slugPreview) slugPreview.textContent = (slugInput.value.trim().toLowerCase() || 'subdomain') + '.localtest.me';
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

  // Step 2: Choose plan
  function renderStep2(el) {
    const plans = configData.plans || {};
    const singleLimit = plans.single || { seats: 1, devices: 10 };
    const familyLimit = plans.family || { seats: 6, devices: 30 };

    el.innerHTML = `
      <div class="card">
        <h2>Choose Capacity Tier</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Select the quota allocated for family members and smart devices in this household.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-lg); margin-bottom: var(--space-xl);">
          <!-- Single Card -->
          <div class="card plan-card ${formState.plan === 'single' ? 'plan-selected' : ''}" id="plan-single" style="margin-bottom: 0; cursor: pointer;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
              <h3 style="margin-bottom: 0;">Single Plan</h3>
              <span class="badge ${formState.plan === 'single' ? 'badge-online' : 'badge-offline'}">
                ${formState.plan === 'single' ? '● Selected' : 'Select'}
              </span>
            </div>
            <p style="font-size: 0.8125rem; color: var(--text-muted);">Ideal for personal apartments and individual testing.</p>

            <ul class="feature-list" style="margin: var(--space-md) 0;">
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span><strong>${singleLimit.seats} Member</strong> (Household Owner)</span>
              </li>
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span><strong>${singleLimit.devices} Smart Devices</strong> maximum</span>
              </li>
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span>Isolated Home Assistant Pod</span>
              </li>
            </ul>
          </div>

          <!-- Family Card -->
          <div class="card plan-card ${formState.plan === 'family' ? 'plan-selected' : ''}" id="plan-family" style="margin-bottom: 0; cursor: pointer;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
              <div>
                <h3 style="margin-bottom: 0;">Family Plan</h3>
                <span style="font-size: 0.68rem; color: var(--brand-teal); font-weight: 700; text-transform: uppercase;">Multi-User</span>
              </div>
              <span class="badge ${formState.plan === 'family' ? 'badge-online' : 'badge-offline'}">
                ${formState.plan === 'family' ? '● Selected' : 'Select'}
              </span>
            </div>
            <p style="font-size: 0.8125rem; color: var(--text-muted);">Collaborative household with multi-user access.</p>

            <ul class="feature-list" style="margin: var(--space-md) 0;">
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span><strong>${familyLimit.seats} Members</strong> (Invite Family)</span>
              </li>
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span><strong>${familyLimit.devices} Smart Devices</strong> maximum</span>
              </li>
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span>Role-based administration</span>
              </li>
            </ul>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button type="button" id="step2-back" class="btn btn-secondary">← Back</button>
          <button type="button" id="step2-next" class="btn btn-primary">Start Provisioning →</button>
        </div>
      </div>
    `;

    el.querySelector('#plan-single').addEventListener('click', () => {
      formState.plan = 'single';
      renderStep2(el);
    });

    el.querySelector('#plan-family').addEventListener('click', () => {
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

  // Step 3: Live progress
  function renderStep3(el) {
    el.innerHTML = `
      <div class="card" style="text-align: center; padding: var(--space-3xl) var(--space-xl);">
        <span class="spinner" style="width: 44px; height: 44px; margin-bottom: var(--space-lg);"></span>
        <h2>Creating ${formState.displayName}...</h2>
        <p style="color: var(--text-muted); font-size: 0.95rem;">
          Allocating isolated namespace, creating IoT channels, and launching dedicated Home Assistant.
        </p>

        <div id="live-steps" style="text-align: left; max-width: 460px; margin: var(--space-2xl) auto 0 auto; background: var(--bg-surface-alt); padding: var(--space-lg); border-radius: var(--radius-md); border: 1px solid var(--border);">
          <div class="checklist-item">
            <span class="check-icon done">✓</span>
            <span style="font-size: 0.875rem;">Allocating Tenant Workspace & Channel Topology</span>
          </div>
          <div class="checklist-item">
            <span class="check-icon done">✓</span>
            <span style="font-size: 0.875rem;">Generating MQTT Telemetry & Command Channels</span>
          </div>
          <div class="checklist-item">
            <span class="check-icon done">✓</span>
            <span style="font-size: 0.875rem;">Enforcing RBAC Access Policies & Resource Quotas</span>
          </div>
          <div class="checklist-item">
            <span class="check-icon done">✓</span>
            <span style="font-size: 0.875rem;">Spinning Up Isolated Home Assistant Pod</span>
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
            <strong>Provisioning Failed:</strong> ${err.message}
          </div>
          <p>An error occurred while provisioning your household resources.</p>
          <button id="retry-btn" class="btn btn-secondary">← Back & Retry</button>
        </div>
      `;
      el.querySelector('#retry-btn').addEventListener('click', () => {
        step = 1;
        render();
      });
    }
  }

  // Step 4: Ready
  function renderStep4(el) {
    const tenant = createdData?.tenant || {};
    const haCreds = createdData?.haCredentials || {};
    const haUrl = tenant.url || `http://${tenant.slug}.localtest.me:8123`;

    el.innerHTML = `
      <div class="card">
        <div class="banner banner-success">
          <strong>Household Initialized:</strong> Your isolated smart home instance has been provisioned.
        </div>

        <h2>${tenant.displayName} (${tenant.slug})</h2>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Your Home Assistant instance is operational and connected to the IoT telemetry message broker.
        </p>

        <div class="card" style="background: var(--bg-surface-alt); margin: var(--space-lg) 0; border: 1px solid var(--border);">
          <h3 style="margin-bottom: var(--space-xs);">Home Assistant Shared Credentials</h3>
          <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: var(--space-md);">
            All members of your household log in with these shared credentials:
          </p>

          <div style="margin-bottom: var(--space-sm);">
            <div class="data-label" style="margin-bottom: 0.25rem;">Access URL</div>
            <div class="copy-box">
              <span>${haUrl}</span>
              <button id="copy-url-btn" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>

          <div style="margin-bottom: var(--space-sm);">
            <div class="data-label" style="margin-bottom: 0.25rem;">Username</div>
            <div class="copy-box">
              <span>${haCreds.username || 'admin'}</span>
              <button id="copy-user-btn" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>

          <div>
            <div class="data-label" style="margin-bottom: 0.25rem;">Password</div>
            <div class="copy-box">
              <span id="ha-pass-mask">•••••••••••••</span>
              <span id="ha-pass-clear" style="display: none; font-weight: 700; color: var(--brand-teal);">${haCreds.password || 'CloudNest2026!'}</span>
              <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
                <button id="reveal-pass-btn" class="btn btn-secondary btn-sm">Show</button>
                <button id="copy-pass-btn" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: var(--space-md); flex-wrap: wrap;">
          <a href="${haUrl}" target="_blank" rel="noopener" class="btn btn-secondary">
            Open Home Assistant ↗
          </a>
          <button id="go-home-btn" class="btn btn-primary">
            Go to Household Dashboard →
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
        revealBtn.textContent = 'Hide';
      } else {
        clearSpan.style.display = 'none';
        maskSpan.style.display = 'inline';
        revealBtn.textContent = 'Show';
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
