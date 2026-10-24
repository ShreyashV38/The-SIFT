// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Plan & Billing View (#/t/:slug/plan)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, renderSpinner } from '../ui.js';

export async function renderPlan(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      ${renderSpinner()}
      <p style="margin-top: 0.5rem;">Loading household plan & usage...</p>
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
      <div class="card">
        <div class="banner banner-danger">
          <strong>Failed to load plan:</strong> ${err.message}
        </div>
        <button id="back-home-btn" class="btn btn-secondary">← Back to Household</button>
      </div>
    `;
    container.querySelector('#back-home-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}`));
    return;
  }

  const tenant = tenantData.tenant || {};
  const currentPlan = tenant.plan || 'single';
  const limits = tenantData.limits || { seats: { used: 1, max: 1 }, devices: { used: 0, max: 10 } };
  const plans = configData.plans || {
    single: { seats: 1, devices: 10 },
    family: { seats: 6, devices: 30 },
  };
  const isOwner = tenantData.callerRole === 'owner';

  container.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h1>Plan & Quota Limits</h1>
          <p>Review current household capacity or change tier.</p>
        </div>

        <a href="#/t/${slug}" class="btn btn-secondary btn-sm">
          ← Household Home
        </a>
      </div>

      <!-- Current Usage -->
      <div class="card">
        <h3>Current Utilization</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 1rem;">
          <div class="card" style="background: var(--bg-card); margin-bottom: 0;">
            <div style="font-size: 0.8rem; color: var(--text-dim);">SEAT OCCUPANCY</div>
            <div style="font-size: 1.6rem; font-weight: 700; margin: 0.25rem 0;">
              ${limits.seats.used} / ${limits.seats.max}
            </div>
            <div class="form-hint">${limits.seats.used >= limits.seats.max ? 'Capacity full' : `${limits.seats.max - limits.seats.used} seat(s) available`}</div>
          </div>

          <div class="card" style="background: var(--bg-card); margin-bottom: 0;">
            <div style="font-size: 0.8rem; color: var(--text-dim);">DEVICE QUOTA</div>
            <div style="font-size: 1.6rem; font-weight: 700; margin: 0.25rem 0;">
              ${limits.devices.used} / ${limits.devices.max}
            </div>
            <div class="form-hint">${limits.devices.max - limits.devices.used} device slot(s) open</div>
          </div>
        </div>
      </div>

      <!-- Plan Selection -->
      <div class="card">
        <h3>Available Plans</h3>
        <p style="font-size: 0.85rem;">Only the household owner can modify subscription tiers.</p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin: 1.25rem 0;">
          <!-- Single Card -->
          <div class="card plan-card ${currentPlan === 'single' ? 'plan-selected' : ''}" style="border: 2px solid ${currentPlan === 'single' ? 'var(--primary)' : 'var(--border)'};">
            <h3>Single Plan</h3>
            <p style="font-size: 0.85rem;">Standard household account.</p>
            <ul style="list-style: none; font-size: 0.85rem; margin: 1rem 0;">
              <li>👤 <strong>${plans.single.seats} Seat</strong> maximum</li>
              <li>⚡ <strong>${plans.single.devices} Devices</strong> maximum</li>
            </ul>
            ${currentPlan === 'single' ? `
              <span class="badge badge-online">Current Active Plan</span>
            ` : isOwner ? `
              <button id="switch-single-btn" class="btn btn-secondary btn-sm">Downgrade to Single</button>
            ` : '<span class="form-hint">Owner action only</span>'}
          </div>

          <!-- Family Card -->
          <div class="card plan-card ${currentPlan === 'family' ? 'plan-selected' : ''}" style="border: 2px solid ${currentPlan === 'family' ? 'var(--primary)' : 'var(--border)'};">
            <h3>Family Plan</h3>
            <p style="font-size: 0.85rem;">Multi-member household collaboration.</p>
            <ul style="list-style: none; font-size: 0.85rem; margin: 1rem 0;">
              <li>👥 <strong>${plans.family.seats} Seats</strong> (Add family members)</li>
              <li>⚡ <strong>${plans.family.devices} Devices</strong> maximum</li>
            </ul>
            ${currentPlan === 'family' ? `
              <span class="badge badge-online">Current Active Plan</span>
            ` : isOwner ? `
              <button id="switch-family-btn" class="btn btn-primary btn-sm">Upgrade to Family</button>
            ` : '<span class="form-hint">Owner action only</span>'}
          </div>
        </div>
      </div>

      <!-- Delete Household (S2) -->
      ${isOwner ? `
        <div class="card" style="border-color: rgba(239, 68, 68, 0.3);">
          <h3>Danger Zone: Delete Household</h3>
          <p style="font-size: 0.85rem; color: var(--danger);">
            Permanently destroys this household instance, stops its Home Assistant container, deletes all device credentials, and removes memberships.
          </p>

          <form id="delete-tenant-form" style="margin-top: 1rem; max-width: 440px;">
            <div class="form-group">
              <label for="confirm-slug">To confirm, type the slug "<strong>${tenant.slug}</strong>":</label>
              <input type="text" id="confirm-slug" required autocomplete="off" placeholder="${tenant.slug}">
            </div>
            <button type="submit" id="delete-tenant-btn" class="btn btn-danger btn-sm" disabled>
              Permanently Delete Household
            </button>
          </form>
        </div>
      ` : ''}
    </div>
  `;

  // Plan change buttons
  container.querySelector('#switch-single-btn')?.addEventListener('click', async () => {
    if (!confirm('Downgrade to Single Plan? This will enforce a limit of 1 seat and 10 devices.')) {
      return;
    }
    try {
      await api.updatePlan(slug, 'single');
      toast('Plan updated to Single', 'success');
      renderPlan(container, slug, router);
    } catch (err) {
      toast(err.message || 'Cannot downgrade plan', 'error');
    }
  });

  container.querySelector('#switch-family-btn')?.addEventListener('click', async () => {
    try {
      await api.updatePlan(slug, 'family');
      toast('Plan upgraded to Family!', 'success');
      renderPlan(container, slug, router);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Delete household form (S2)
  const deleteForm = container.querySelector('#delete-tenant-form');
  const confirmInput = container.querySelector('#confirm-slug');
  const deleteBtn = container.querySelector('#delete-tenant-btn');

  if (confirmInput && deleteBtn) {
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
        toast(err.message || 'Failed to delete household', 'error');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Permanently Delete Household';
      }
    });
  }
}
