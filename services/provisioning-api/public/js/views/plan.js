// ---------------------------------------------------------------------------
// The-SIFT Smart Home Portal — Household Plan (#/t/:slug/plan)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, renderSpinner } from '../ui.js';

export async function renderPlan(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-3xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-size: 0.85rem;">Loading household plan...</p>
    </div>
  `;

  let tenantData, configData;
  try {
    [tenantData, configData] = await Promise.all([
      api.getTenant(slug),
      api.getConfig(),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 2rem auto;">
        <div class="banner banner-danger">
          <strong>Could not load plan:</strong> ${err.message}
        </div>
        <button id="back-home-btn" class="btn btn-secondary btn-sm">Back to Overview</button>
      </div>
    `;
    container.querySelector('#back-home-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}`));
    return;
  }

  const tenant = tenantData.tenant || {};
  const currentPlan = tenant.plan === 'family' ? 'family' : 'single';
  const limits = tenantData.limits || { seats: { used: 1, max: 1 }, devices: { used: 0, max: 10 } };
  const plans = configData.plans || {
    single: { seats: 1, devices: 10 },
    family: { seats: 6, devices: 30 },
  };
  const isOwner = tenantData.callerRole === 'owner';

  const seatPct = Math.min(100, Math.round((limits.seats.used / Math.max(1, limits.seats.max)) * 100));
  const devicePct = Math.min(100, Math.round((limits.devices.used / Math.max(1, limits.devices.max)) * 100));

  container.innerHTML = `
    <div>
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1>Household Plan</h1>
          <p style="margin-bottom: 0; font-size: 0.84375rem;">
            View your current usage and switch between the Single Plan and Family Plan.
          </p>
        </div>
        <div class="page-header-actions">
          <a href="#/t/${slug}" class="btn btn-secondary btn-sm">&larr; Back to Overview</a>
        </div>
      </div>

      <!-- Current Usage Summary (Strictly 2 Cards: Members & Smart Devices) -->
      <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-bottom: var(--space-xl);">
        <div class="stat-card">
          <div class="stat-label">
            <span>Members</span>
            <span class="mono">${seatPct}%</span>
          </div>
          <div class="stat-value">
            ${limits.seats.used} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 400;">/ ${limits.seats.max} seats used</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill" style="width: ${seatPct}%;"></div>
          </div>
          <div class="stat-hint">
            ${limits.seats.used >= limits.seats.max ? 'All member seats in use' : `${limits.seats.max - limits.seats.used} seat(s) available`}
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-label">
            <span>Smart Devices</span>
            <span class="mono">${devicePct}%</span>
          </div>
          <div class="stat-value">
            ${limits.devices.used} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 400;">/ ${limits.devices.max} devices used</span>
          </div>
          <div class="quota-bar">
            <div class="quota-fill emerald" style="width: ${devicePct}%;"></div>
          </div>
          <div class="stat-hint">
            ${Math.max(0, limits.devices.max - limits.devices.used)} device slot(s) available
          </div>
        </div>
      </div>

      <!-- Plan Selection Grid — Strictly Two Plans -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 2px;">Available Plans</h3>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0;">
              ${isOwner
                ? 'Choose the plan that fits your household.'
                : 'Only the household owner can change the household plan.'}
            </p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-lg);">
          <!-- Single Plan -->
          <div class="plan-card ${currentPlan === 'single' ? 'plan-selected' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 6px;">
              <h3 style="margin-bottom: 0;">Single Plan</h3>
              ${currentPlan === 'single' ? `<span class="badge badge-online"><span class="led-dot led-emerald"></span>Current Plan</span>` : ''}
            </div>
            <p style="font-size: 0.8125rem; color: var(--text-secondary);">
              Ideal for personal apartments and individual testing.
            </p>

            <ul class="feature-list" style="margin-top: var(--space-md); width: 100%;">
              <li>
                <span class="badge badge-role">Seat</span>
                <span><strong>${plans.single.seats} Member</strong></span>
              </li>
              <li>
                <span class="badge badge-role">Quota</span>
                <span><strong>${plans.single.devices} Devices</strong></span>
              </li>
            </ul>

            <div style="margin-top: var(--space-lg); width: 100%; padding-top: var(--space-md); border-top: 1px solid var(--border);">
              ${currentPlan === 'single' ? `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Current Plan</button>
              ` : isOwner ? `
                <button id="switch-single-btn" class="btn btn-secondary btn-sm btn-full">
                  Switch to Single Plan
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Owner Only</button>
              `}
            </div>
          </div>

          <!-- Family Plan -->
          <div class="plan-card ${currentPlan === 'family' ? 'plan-selected' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 6px;">
              <h3 style="margin-bottom: 0;">Family Plan</h3>
              ${currentPlan === 'family' ? `<span class="badge badge-online"><span class="led-dot led-emerald"></span>Current Plan</span>` : ''}
            </div>
            <p style="font-size: 0.8125rem; color: var(--text-secondary);">
              Collaborative household with multi-user access.
            </p>

            <ul class="feature-list" style="margin-top: var(--space-md); width: 100%;">
              <li>
                <span class="badge badge-role">Seats</span>
                <span><strong>${plans.family.seats} Members</strong></span>
              </li>
              <li>
                <span class="badge badge-role">Quota</span>
                <span><strong>${plans.family.devices} Devices</strong></span>
              </li>
            </ul>

            <div style="margin-top: var(--space-lg); width: 100%; padding-top: var(--space-md); border-top: 1px solid var(--border);">
              ${currentPlan === 'family' ? `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Current Plan</button>
              ` : isOwner ? `
                <button id="switch-family-btn" class="btn btn-primary btn-sm btn-full">
                  Switch to Family Plan
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Owner Only</button>
              `}
            </div>
          </div>
        </div>
      </div>

      <!-- Delete Household Section -->
      ${isOwner ? `
        <div class="card danger-zone">
          <h3 style="margin-bottom: 4px;">Delete Household</h3>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: var(--space-lg);">
            Permanently delete this household, remove all connected devices, and revoke member access.
          </p>

          <form id="delete-tenant-form" style="max-width: 460px;">
            <div class="form-group">
              <label for="confirm-slug">Type <strong class="mono">${tenant.slug}</strong> to confirm deletion:</label>
              <input type="text" id="confirm-slug" class="mono" required autocomplete="off" placeholder="${tenant.slug}">
            </div>
            <button type="submit" id="delete-tenant-btn" class="btn btn-danger btn-sm" disabled>
              Delete Household
            </button>
          </form>
        </div>
      ` : ''}
    </div>
  `;

  // Switch to Single Plan
  container.querySelector('#switch-single-btn')?.addEventListener('click', async () => {
    if (!confirm(`Switch to the Single Plan? The Single Plan supports up to ${plans.single.seats} member and ${plans.single.devices} devices.`)) {
      return;
    }
    try {
      await api.updatePlan(slug, 'single');
      toast('Switched to Single Plan', 'success');
      await router.refreshSession();
      renderPlan(container, slug, router);
    } catch (err) {
      toast(err.message || 'Could not switch plan', 'error');
    }
  });

  // Switch to Family Plan
  container.querySelector('#switch-family-btn')?.addEventListener('click', async () => {
    try {
      await api.updatePlan(slug, 'family');
      toast('Switched to Family Plan!', 'success');
      await router.refreshSession();
      renderPlan(container, slug, router);
    } catch (err) {
      toast(err.message || 'Could not switch plan', 'error');
    }
  });

  // Delete household form
  const deleteForm = container.querySelector('#delete-tenant-form');
  const confirmInput = container.querySelector('#confirm-slug');
  const deleteBtn = container.querySelector('#delete-tenant-btn');

  if (confirmInput && deleteBtn && deleteForm) {
    confirmInput.addEventListener('input', () => {
      deleteBtn.disabled = confirmInput.value.trim() !== tenant.slug;
    });

    deleteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting household...';

      try {
        await api.deleteTenant(slug);
        toast(`Household "${tenant.slug}" deleted`, 'info');
        await router.refreshSession();
        router.navigate('#/');
      } catch (err) {
        toast(err.message || 'Could not delete household', 'error');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Household';
      }
    });
  }
}
