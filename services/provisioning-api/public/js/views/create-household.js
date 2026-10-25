// ---------------------------------------------------------------------------
// The-SIFT Smart Home Portal — Create Household Wizard (#/create-household)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, copyToClipboard, resolveCloudDomain, resolveHaUrl } from '../ui.js';

export async function renderCreateHousehold(container, router) {
  let step = 1;
  let formState = {
    displayName: '',
    slug: '',
    plan: 'single', // 'single' | 'family'
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
      <div style="max-width: 780px; margin: 0.5rem auto;">
        <div class="stepper-nav">
          <div class="stepper-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
            <div class="step-circle">1</div>
            <span class="step-label">Name &amp; Slug</span>
          </div>
          <div class="stepper-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
            <div class="step-circle">2</div>
            <span class="step-label">Choose Plan</span>
          </div>
          <div class="stepper-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}">
            <div class="step-circle">3</div>
            <span class="step-label">Setting Up</span>
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

  function renderStep1(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2>Create Your Household</h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              Give your home a name and choose a short web address.
            </p>
          </div>
        </div>

        <div id="step1-error" class="banner banner-danger" style="display: none;"></div>

        <form id="step1-form">
          <div class="form-group">
            <label for="house-name">Household Name</label>
            <input type="text" id="house-name" required value="${formState.displayName}" placeholder="e.g. Smith Home" maxlength="50">
            <div class="form-hint">Displayed in your dashboard and when inviting family members.</div>
          </div>

          <div class="form-group">
            <label for="house-slug">Household ID (Slug)</label>
            <input type="text" id="house-slug" class="mono" required value="${formState.slug}" placeholder="smith-home" pattern="^[a-z0-9][a-z0-9-]{1,29}[a-z0-9]$">
            <div class="form-hint" style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span>Dashboard Web Address:</span>
              <code id="slug-preview" style="color: var(--accent); font-weight: 600;">https://${formState.slug || 'smith-home'}.${cloudDomain}</code>
            </div>
          </div>

          <div style="margin-top: var(--space-xl); display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn-primary">
              Continue to Plan &rarr;
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
        if (slugPreview) slugPreview.textContent = `https://${auto || 'smith-home'}.${cloudDomain}`;
      }
    });

    slugInput.addEventListener('input', () => {
      slugInput.dataset.manual = 'true';
      const val = slugInput.value.trim().toLowerCase() || 'smith-home';
      if (slugPreview) slugPreview.textContent = `https://${val}.${cloudDomain}`;
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const slugVal = slugInput.value.trim().toLowerCase();
      const nameVal = nameInput.value.trim();

      if (!/^[a-z0-9][a-z0-9-]{1,29}[a-z0-9]$/.test(slugVal)) {
        errorBanner.textContent = 'Household ID must be 3–30 lowercase letters, numbers, and hyphens, without leading or trailing hyphens.';
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
            <h2>Choose Your Plan</h2>
            <p style="font-size: 0.84375rem; margin-bottom: 0;">
              Select the plan that fits your household size. You can change this anytime.
            </p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-lg); margin-bottom: var(--space-xl);">
          <!-- Single Plan -->
          <div class="plan-card ${formState.plan === 'single' ? 'plan-selected' : ''}" id="plan-single">
            <h3 style="margin-bottom: 6px;">Single Plan</h3>
            <p style="font-size: 0.8125rem; color: var(--text-secondary);">
              Ideal for personal apartments and individual testing.
            </p>
            <ul class="feature-list" style="margin-top: var(--space-md); width: 100%; margin-bottom: 0;">
              <li>
                <span class="badge badge-role">Seat</span>
                <span><strong>${singleLimit.seats} Member</strong></span>
              </li>
              <li>
                <span class="badge badge-role">Quota</span>
                <span><strong>${singleLimit.devices} Devices</strong></span>
              </li>
            </ul>
          </div>

          <!-- Family Plan -->
          <div class="plan-card ${formState.plan === 'family' ? 'plan-selected' : ''}" id="plan-family">
            <h3 style="margin-bottom: 6px;">Family Plan</h3>
            <p style="font-size: 0.8125rem; color: var(--text-secondary);">
              Collaborative household with multi-user access.
            </p>
            <ul class="feature-list" style="margin-top: var(--space-md); width: 100%; margin-bottom: 0;">
              <li>
                <span class="badge badge-role">Seats</span>
                <span><strong>${familyLimit.seats} Members</strong></span>
              </li>
              <li>
                <span class="badge badge-role">Quota</span>
                <span><strong>${familyLimit.devices} Devices</strong></span>
              </li>
            </ul>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button type="button" id="step2-back" class="btn btn-secondary">&larr; Back</button>
          <button type="button" id="step2-next" class="btn btn-primary">Start Provisioning &rarr;</button>
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

  function renderStep3(el) {
    el.innerHTML = `
      <div class="card" style="text-align: center; padding: var(--space-3xl) var(--space-xl);">
        <span class="spinner" style="width: 36px; height: 36px; margin-bottom: var(--space-lg);"></span>
        <h2>Setting up your smart home...</h2>
        <p style="font-size: 0.875rem; max-width: 480px; margin: 0 auto var(--space-xl) auto;">
          Please wait a moment while we set up <strong>${formState.displayName}</strong> and prepare your Home Assistant dashboard.
        </p>

        <div style="text-align: left; max-width: 440px; margin: 0 auto; background: var(--bg-surface); padding: var(--space-lg); border-radius: var(--radius-md); border: 1px solid var(--border);">
          <div class="checklist-item">
            <span class="led-dot led-emerald" style="margin-top: 6px;"></span>
            <span style="font-size: 0.8125rem;">Creating household workspace</span>
          </div>
          <div class="checklist-item">
            <span class="led-dot led-emerald" style="margin-top: 6px;"></span>
            <span style="font-size: 0.8125rem;">Setting up device communication</span>
          </div>
          <div class="checklist-item">
            <span class="led-dot led-amber" style="margin-top: 6px;"></span>
            <span style="font-size: 0.8125rem;">Preparing your Home Assistant dashboard</span>
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
      toast(err.message || 'Could not create household', 'error');
      const el = container.querySelector('#step-content');
      el.innerHTML = `
        <div class="card">
          <div class="banner banner-danger">
            <strong>Setup Error:</strong> ${err.message}
          </div>
          <p>We couldn't finish creating your household. Please check the name and try again.</p>
          <button id="retry-btn" class="btn btn-secondary">&larr; Back &amp; Try Again</button>
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
          <strong>Your Household is Ready!</strong> ${tenant.displayName} is now set up and ready to use.
        </div>

        <h2>${tenant.displayName}</h2>
        <p style="font-size: 0.84375rem;">
          Your smart home hub and Home Assistant dashboard are ready. Save or copy your login details below.
        </p>

        <div class="card" style="background: var(--bg-surface); margin: var(--space-lg) 0;">
          <h3 style="margin-bottom: 4px;">Home Assistant Login Details</h3>
          <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: var(--space-md);">
            Use these shared household credentials to sign in to your Home Assistant dashboard:
          </p>

          <div style="margin-bottom: var(--space-sm);">
            <div class="data-label">Dashboard Link</div>
            <div class="copy-box">
              <span>${haUrl}</span>
              <button id="copy-url-btn" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>

          <div style="margin-bottom: var(--space-sm);">
            <div class="data-label">Username</div>
            <div class="copy-box">
              <span>${haCreds.username || 'admin'}</span>
              <button id="copy-user-btn" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>

          <div>
            <div class="data-label">Password</div>
            <div class="copy-box">
              <span id="ha-pass-mask">•••••••••••••</span>
              <span id="ha-pass-clear" style="display: none; font-weight: 600; color: var(--led-emerald);">${haCreds.password || ''}</span>
              <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button id="reveal-pass-btn" class="btn btn-secondary btn-sm">Show</button>
                <button id="copy-pass-btn" class="btn btn-secondary btn-sm">Copy</button>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
          <a href="${haUrl}" target="_blank" rel="noopener" class="btn btn-secondary">
            Open Home Assistant
          </a>
          <button id="go-home-btn" class="btn btn-primary">
            Go to Household Overview
          </button>
        </div>
      </div>
    `;

    el.querySelector('#copy-url-btn').addEventListener('click', function () {
      copyToClipboard(haUrl, this);
    });

    el.querySelector('#copy-user-btn').addEventListener('click', function () {
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

    el.querySelector('#copy-pass-btn').addEventListener('click', function () {
      copyToClipboard(haCreds.password || '', this);
    });

    el.querySelector('#go-home-btn').addEventListener('click', async () => {
      await router.refreshSession();
      router.navigate(`#/t/${tenant.slug}`);
    });
  }

  render();
}
