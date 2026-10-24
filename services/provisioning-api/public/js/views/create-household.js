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
      <div style="max-width: 680px; margin: 1.5rem auto;">
        <div class="stepper-nav">
          <div class="stepper-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
            <div class="step-circle">1</div>
            <span class="step-label">Name & Slug</span>
          </div>
          <div class="stepper-step ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
            <div class="step-circle">2</div>
            <span class="step-label">Choose Plan</span>
          </div>
          <div class="stepper-step ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}">
            <div class="step-circle">3</div>
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
        <h2>Household Details</h2>
        <p>Give your smart home instance a friendly name and a unique web identifier.</p>

        <div id="step1-error" class="banner banner-danger" style="display: none;"></div>

        <form id="step1-form">
          <div class="form-group">
            <label for="house-name">Household Name</label>
            <input type="text" id="house-name" required value="${formState.displayName}" placeholder="Maple Cottage" maxlength="50">
            <div class="form-hint">A human-readable label shown on dashboards.</div>
          </div>

          <div class="form-group">
            <label for="house-slug">Household Slug (Subdomain)</label>
            <input type="text" id="house-slug" required value="${formState.slug}" placeholder="maple-cottage" pattern="^[a-z0-9][a-z0-9-]{1,29}[a-z0-9]$">
            <div class="form-hint">3-30 chars, lowercase letters, numbers, hyphens. Used in your URL: &lt;slug&gt;.localtest.me</div>
          </div>

          <button type="submit" class="btn btn-primary">
            Next: Select Plan →
          </button>
        </form>
      </div>
    `;

    const nameInput = el.querySelector('#house-name');
    const slugInput = el.querySelector('#house-slug');
    const form = el.querySelector('#step1-form');
    const errorBanner = el.querySelector('#step1-error');

    // Auto-generate slug from name if slug hasn't been manually edited
    nameInput.addEventListener('input', () => {
      if (!slugInput.dataset.manual) {
        const auto = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        slugInput.value = auto;
      }
    });

    slugInput.addEventListener('input', () => {
      slugInput.dataset.manual = 'true';
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const slugVal = slugInput.value.trim().toLowerCase();
      const nameVal = nameInput.value.trim();

      if (!/^[a-z0-9][a-z0-9-]{1,29}[a-z0-9]$/.test(slugVal)) {
        errorBanner.textContent = 'Slug must be 3-30 lowercase characters and numbers, without leading or trailing hyphens.';
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
        <h2>Choose Your Plan</h2>
        <p>Select the capacity for household members and smart devices.</p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="card plan-card ${formState.plan === 'single' ? 'plan-selected' : ''}" id="plan-single" style="cursor: pointer; border: 2px solid ${formState.plan === 'single' ? 'var(--primary)' : 'var(--border)'};">
            <h3>Single Plan</h3>
            <p style="font-size: 0.85rem;">Ideal for personal apartments and individual testing.</p>
            <ul style="list-style: none; font-size: 0.85rem; margin: 1rem 0;">
              <li>👤 <strong>${singleLimit.seats} Member</strong> (Owner)</li>
              <li>⚡ <strong>${singleLimit.devices} Devices</strong> maximum</li>
              <li>🔒 Isolated Namespace & Pod</li>
            </ul>
            <span class="badge ${formState.plan === 'single' ? 'badge-online' : 'badge-offline'}">
              ${formState.plan === 'single' ? 'Selected' : 'Select'}
            </span>
          </div>

          <div class="card plan-card ${formState.plan === 'family' ? 'plan-selected' : ''}" id="plan-family" style="cursor: pointer; border: 2px solid ${formState.plan === 'family' ? 'var(--primary)' : 'var(--border)'};">
            <h3>Family Plan</h3>
            <p style="font-size: 0.85rem;">Collaborative household with multi-user access.</p>
            <ul style="list-style: none; font-size: 0.85rem; margin: 1rem 0;">
              <li>👥 <strong>${familyLimit.seats} Members</strong> (Shared Home)</li>
              <li>⚡ <strong>${familyLimit.devices} Devices</strong> maximum</li>
              <li>🔒 Isolated Namespace & Pod</li>
            </ul>
            <span class="badge ${formState.plan === 'family' ? 'badge-online' : 'badge-offline'}">
              ${formState.plan === 'family' ? 'Selected' : 'Select'}
            </span>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem;">
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
      <div class="card" style="text-align: center; padding: 2.5rem 1.5rem;">
        <span class="spinner" style="width: 42px; height: 42px; margin-bottom: 1.5rem;"></span>
        <h2>Creating ${formState.displayName}...</h2>
        <p>Allocating isolated namespace, IoT workspace channels, and launching Home Assistant.</p>

        <div id="live-steps" style="text-align: left; max-width: 440px; margin: 1.5rem auto;">
          <div class="checklist-item">
            <span class="check-icon done">✓</span>
            <span>Allocating Tenant Workspace in Magistrala</span>
          </div>
          <div class="checklist-item">
            <span class="check-icon done">✓</span>
            <span>Generating Telemetry & Command Channels</span>
          </div>
          <div class="checklist-item">
            <span class="check-icon todo" id="step-ns">⏳</span>
            <span>Enforcing NetworkPolicies & Quotas</span>
          </div>
          <div class="checklist-item">
            <span class="check-icon todo" id="step-ha">⏳</span>
            <span>Spinning Up Home Assistant Pod</span>
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
          🎉 <strong>Household Ready!</strong> Your smart home instance has been provisioned.
        </div>

        <h2>${tenant.displayName} (${tenant.slug})</h2>
        <p>Your Home Assistant instance is running and connected to the IoT message broker.</p>

        <div class="card" style="background: var(--bg-card); margin: 1.25rem 0;">
          <h3>Home Assistant Access</h3>
          <p style="font-size: 0.85rem; margin-bottom: 1rem;">All members of your household log in with these shared credentials:</p>

          <div style="font-size: 0.85rem; margin-bottom: 0.5rem;"><strong>URL:</strong></div>
          <div class="copy-box">
            <span>${haUrl}</span>
            <button id="copy-url-btn" class="btn btn-secondary btn-sm">Copy</button>
          </div>

          <div style="font-size: 0.85rem; margin-bottom: 0.5rem;"><strong>Username:</strong></div>
          <div class="copy-box">
            <span>${haCreds.username || 'admin'}</span>
            <button id="copy-user-btn" class="btn btn-secondary btn-sm">Copy</button>
          </div>

          <div style="font-size: 0.85rem; margin-bottom: 0.5rem;"><strong>Password:</strong></div>
          <div class="copy-box">
            <span id="ha-pass-mask">•••••••••••••</span>
            <span id="ha-pass-clear" style="display: none;">${haCreds.password || 'CloudNest2026!'}</span>
            <div style="display: flex; gap: 0.25rem;">
              <button id="reveal-pass-btn" class="btn btn-secondary btn-sm">Show</button>
              <button id="copy-pass-btn" class="btn btn-secondary btn-sm">Copy</button>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
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
