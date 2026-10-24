// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Plan & Billing View (#/t/:slug/plan)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, renderSpinner } from '../ui.js';

export async function renderPlan(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-weight: 500;">Loading household plan & quota...</p>
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

  const seatPct = Math.min(100, Math.round((limits.seats.used / limits.seats.max) * 100));
  const devicePct = Math.min(100, Math.round((limits.devices.used / limits.devices.max) * 100));

  container.innerHTML = `
    <div>
      <div class="page-header">
        <div>
          <h1>Plan & Quota Limits</h1>
          <p style="margin-bottom: 0;">Review household capacity or modify subscription tier.</p>
        </div>
        <div class="page-header-actions">
          <a href="#/t/${slug}" class="btn btn-secondary btn-sm">← Dashboard</a>
        </div>
      </div>

      <!-- Current Usage Summary Card -->
      <div class="card">
        <h3 style="margin-bottom: var(--space-lg);">Current Resource Utilization</h3>
        <div class="stat-grid" style="margin-bottom: 0;">
          <div class="stat-card">
            <div class="stat-label">Seat Occupancy</div>
            <div class="stat-value">${limits.seats.used} <span style="font-size: 1.1rem; color: var(--text-dim); font-weight: normal;">/ ${limits.seats.max}</span></div>
            <div class="stat-hint">${limits.seats.used >= limits.seats.max ? 'Full capacity' : `${limits.seats.max - limits.seats.used} seat(s) available`}</div>
            <div style="margin-top: 0.75rem; height: 4px; background: var(--border-subtle); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: ${seatPct}%; height: 100%; background: var(--brand-navy); border-radius: var(--radius-full);"></div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Smart Device Quota</div>
            <div class="stat-value">${limits.devices.used} <span style="font-size: 1.1rem; color: var(--text-dim); font-weight: normal;">/ ${limits.devices.max}</span></div>
            <div class="stat-hint">${limits.devices.max - limits.devices.used} slot(s) open</div>
            <div style="margin-top: 0.75rem; height: 4px; background: var(--border-subtle); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: ${devicePct}%; height: 100%; background: var(--brand-teal); border-radius: var(--radius-full);"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Plan Comparison Cards -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 0.2rem;">Available Tiers</h3>
            <p style="font-size: 0.8125rem; margin-bottom: 0; color: var(--text-muted);">
              ${isOwner ? 'You are the household owner and can upgrade or downgrade tiers.' : 'Only the household owner can modify subscription tiers.'}
            </p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: var(--space-xl); margin: var(--space-lg) 0;">
          <!-- Single Plan Card -->
          <div class="plan-card ${currentPlan === 'single' ? 'plan-selected' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <h3 style="font-size: 1.25rem; margin-bottom: 0;">Single Plan</h3>
              ${currentPlan === 'single' ? `
                <span class="badge badge-online">Current Plan</span>
              ` : ''}
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-md);">
              Designed for individual apartments or personal testing.
            </p>

            <ul class="feature-list">
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span><strong>${plans.single.seats} Seat</strong> maximum</span>
              </li>
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span><strong>${plans.single.devices} Devices</strong> maximum</span>
              </li>
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span>Dedicated isolated Home Assistant</span>
              </li>
            </ul>

            <div style="margin-top: var(--space-xl);">
              ${currentPlan === 'single' ? `
                <span class="form-hint" style="color: var(--brand-teal); font-weight: 600;">Active Subscription Tier</span>
              ` : isOwner ? `
                <button id="switch-single-btn" class="btn btn-secondary btn-sm btn-full">Downgrade to Single</button>
              ` : '<span class="form-hint">Owner action only</span>'}
            </div>
          </div>

          <!-- Family Plan Card -->
          <div class="plan-card ${currentPlan === 'family' ? 'plan-selected' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div>
                <h3 style="font-size: 1.25rem; margin-bottom: 0;">Family Plan</h3>
                <span style="font-size: 0.7rem; color: var(--brand-teal); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Multi-User Collaboration</span>
              </div>
              ${currentPlan === 'family' ? `
                <span class="badge badge-online">Current Plan</span>
              ` : ''}
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-md);">
              Designed for full homes with multiple family members and expanded hardware capacity.
            </p>

            <ul class="feature-list">
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span><strong>${plans.family.seats} Seats</strong> (Add family members)</span>
              </li>
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span><strong>${plans.family.devices} Devices</strong> maximum</span>
              </li>
              <li>
                <span style="color: var(--brand-teal); font-weight: 700;">✓</span>
                <span>Role-based access control (Admin / Member)</span>
              </li>
            </ul>

            <div style="margin-top: var(--space-xl);">
              ${currentPlan === 'family' ? `
                <span class="form-hint" style="color: var(--brand-teal); font-weight: 600;">Active Subscription Tier</span>
              ` : isOwner ? `
                <button id="switch-family-btn" class="btn btn-primary btn-sm btn-full">Upgrade to Family Plan →</button>
              ` : '<span class="form-hint">Owner action only</span>'}
            </div>
          </div>
        </div>
      </div>

      <!-- Delete Household Danger Zone -->
      ${isOwner ? `
        <div class="card danger-zone">
          <h3>Danger Zone: Permanently Delete Household</h3>
          <p style="font-size: 0.85rem; color: var(--danger-text); margin-bottom: var(--space-lg);">
            Permanently destroys this household instance, terminates its Home Assistant container, revokes all device credentials, and removes memberships. This action cannot be reversed.
          </p>

          <form id="delete-tenant-form" style="max-width: 460px;">
            <div class="form-group">
              <label for="confirm-slug">To confirm deletion, type the slug "<strong>${tenant.slug}</strong>":</label>
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
