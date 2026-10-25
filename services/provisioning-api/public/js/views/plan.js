// ---------------------------------------------------------------------------
// The-SIFT Cloud Platform — Plan, Resource Quotas & Tier Allocation (#/t/:slug/plan)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, renderSpinner, formatTierBadge } from '../ui.js';

export async function renderPlan(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-3xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-size: 0.85rem;">Loading cloud infrastructure tier & resource quotas...</p>
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
          <strong>Failed to load infrastructure plan:</strong> ${err.message}
        </div>
        <button id="back-home-btn" class="btn btn-secondary btn-sm">Back to Overview</button>
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

  // Determine whether user previously selected PRO visual tier on top of 'family' backend plan
  const storedUiTier = localStorage.getItem(`sift-ui-tier-${slug}`);
  const activeTierKey = currentPlan === 'single'
    ? 'free'
    : (storedUiTier === 'pro' ? 'pro' : 'home');

  const seatPct = Math.min(100, Math.round((limits.seats.used / Math.max(1, limits.seats.max)) * 100));
  const devicePct = Math.min(100, Math.round((limits.devices.used / Math.max(1, limits.devices.max)) * 100));

  const cpuCeiling = activeTierKey === 'pro' ? '2000m (2.0 vCPU)' : activeTierKey === 'home' ? '1000m (1.0 vCPU)' : '500m (0.5 vCPU)';
  const ramCeiling = activeTierKey === 'pro' ? '2048 MiB' : activeTierKey === 'home' ? '1024 MiB' : '512 MiB';

  container.innerHTML = `
    <div>
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1>Infrastructure Tier & Resource Quotas</h1>
          <p class="page-subtitle">
            Manage Kubernetes namespace compute limits, hardware telemetry ceilings, and operator seat capacity for <strong>${tenant.name || slug}</strong>.
          </p>
        </div>
        <div class="page-header-actions">
          <span class="badge badge-accent mono">ACTIVE TIER: ${activeTierKey.toUpperCase()}</span>
          <a href="#/t/${slug}" class="btn btn-secondary btn-sm">Back to Overview</a>
        </div>
      </div>

      <!-- Current Resource Utilization Bento Strip -->
      <div class="bento-grid" style="margin-bottom: var(--space-xl);">
        <div class="bento-card">
          <div class="bento-label">
            <span>Hardware Telemetry Slots</span>
            <span class="mono">${devicePct}%</span>
          </div>
          <div class="bento-value">${limits.devices.used} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 400;">/ ${limits.devices.max}</span></div>
          <div class="progress-track">
            <div class="progress-fill ${devicePct >= 90 ? 'progress-fill-danger' : devicePct >= 75 ? 'progress-fill-warning' : 'progress-fill-emerald'}" style="width: ${devicePct}%;"></div>
          </div>
          <div class="bento-meta">
            <span>${Math.max(0, limits.devices.max - limits.devices.used)} slots available</span>
            <a href="#/t/${slug}/devices" class="inline-link">Devices</a>
          </div>
        </div>

        <div class="bento-card">
          <div class="bento-label">
            <span>Operator Seat Quota</span>
            <span class="mono">${seatPct}%</span>
          </div>
          <div class="bento-value">${limits.seats.used} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 400;">/ ${limits.seats.max}</span></div>
          <div class="progress-track">
            <div class="progress-fill ${seatPct >= 100 ? 'progress-fill-warning' : ''}" style="width: ${seatPct}%;"></div>
          </div>
          <div class="bento-meta">
            <span>${limits.seats.used >= limits.seats.max ? 'All seats occupied' : `${limits.seats.max - limits.seats.used} seat(s) open`}</span>
            <a href="#/t/${slug}/members" class="inline-link">Members</a>
          </div>
        </div>

        <div class="bento-card">
          <div class="bento-label">
            <span>Namespace CPU Quota</span>
            <span class="badge badge-online"><span class="led-dot led-emerald"></span>ENFORCED</span>
          </div>
          <div class="bento-value mono" style="font-size: 1.25rem;">${cpuCeiling}</div>
          <div class="bento-meta">
            <span>K8s ResourceQuota</span>
            <span class="mono">tenant-${tenant.slug || slug}</span>
          </div>
        </div>

        <div class="bento-card">
          <div class="bento-label">
            <span>Dedicated Pod Memory</span>
            <span class="badge badge-accent">ISOLATED</span>
          </div>
          <div class="bento-value mono" style="font-size: 1.25rem;">${ramCeiling}</div>
          <div class="bento-meta">
            <span>Home Assistant + Bridge</span>
            <span class="mono">Guaranteed QoS</span>
          </div>
        </div>
      </div>

      <!-- 3-Column Architectural Pricing & Resource Matrix -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Cloud Infrastructure Allocation Matrix</div>
            <div class="card-subtitle">
              ${isOwner
                ? 'Select a cloud tier to dynamically scale Kubernetes ResourceQuotas, MQTT broker rate limits, and household seat capacity.'
                : 'Only the primary Household Owner can modify cloud infrastructure tiers.'}
            </div>
          </div>
          <span class="badge badge-neutral mono">INSTANT ZERO-DOWNTIME SCALING</span>
        </div>

        <div class="grid-3" style="margin-top: var(--space-md);">
          <!-- FREE TIER (Backend: single) -->
          <div class="plan-card ${activeTierKey === 'free' ? 'plan-selected' : ''}">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                <span class="badge badge-neutral mono">FREE TIER</span>
                ${activeTierKey === 'free' ? `<span class="badge badge-online"><span class="led-dot led-emerald"></span>CURRENT</span>` : ''}
              </div>
              <div class="plan-name">Single Sandbox</div>
              <div class="plan-price">$0 <span>/ month</span></div>
              <p class="plan-desc">
                Isolated single-operator cloud namespace for essential smart-home telemetry and hardware prototyping.
              </p>

              <ul class="feature-list">
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>${plans.single.devices} Connected Devices</strong> max</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>${plans.single.seats} Operator Seat</strong> (Owner only)</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>0.5 vCPU / 512 MiB RAM</strong> Pod Quota</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>7-Day</strong> Telemetry State Retention</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>Standard Community</strong> Support</span>
                </li>
              </ul>
            </div>

            <div style="margin-top: var(--space-lg); padding-top: var(--space-md); border-top: 1px solid var(--border-subtle);">
              ${activeTierKey === 'free' ? `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Active Infrastructure Tier</button>
              ` : isOwner ? `
                <button class="btn btn-secondary btn-sm btn-full tier-switch-btn" data-backend-plan="single" data-ui-tier="free" data-label="Free (Single Sandbox)">
                  Scale Down to Free Tier
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Owner Permission Required</button>
              `}
            </div>
          </div>

          <!-- HOME TIER (Backend: family) -->
          <div class="plan-card ${activeTierKey === 'home' ? 'plan-selected' : ''}">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                <span class="badge badge-accent mono">HOME TIER</span>
                ${activeTierKey === 'home' ? `<span class="badge badge-online"><span class="led-dot led-emerald"></span>CURRENT</span>` : `<span class="badge badge-neutral">RECOMMENDED</span>`}
              </div>
              <div class="plan-name">Household Cloud</div>
              <div class="plan-price">$19 <span>/ month</span></div>
              <p class="plan-desc">
                Full-featured residential automation cloud with multi-member RBAC and expanded hardware capacity.
              </p>

              <ul class="feature-list">
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>${plans.family.devices} Connected Devices</strong> max</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>${plans.family.seats} Household Seats</strong> (Admin & Member RBAC)</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>1.0 vCPU / 1024 MiB RAM</strong> Pod Quota</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>30-Day</strong> Telemetry & Command Audit Log</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>Priority Cloud</strong> SLA & mTLS Broker</span>
                </li>
              </ul>
            </div>

            <div style="margin-top: var(--space-lg); padding-top: var(--space-md); border-top: 1px solid var(--border-subtle);">
              ${activeTierKey === 'home' ? `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Active Infrastructure Tier</button>
              ` : isOwner ? `
                <button class="btn btn-primary btn-sm btn-full tier-switch-btn" data-backend-plan="family" data-ui-tier="home" data-label="Home (Household Cloud)">
                  Provision Home Tier
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Owner Permission Required</button>
              `}
            </div>
          </div>

          <!-- PRO TIER (Backend: family + Pro profile) -->
          <div class="plan-card ${activeTierKey === 'pro' ? 'plan-selected' : ''}">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                <span class="badge badge-online mono">PRO TIER</span>
                ${activeTierKey === 'pro' ? `<span class="badge badge-online"><span class="led-dot led-emerald"></span>CURRENT</span>` : ''}
              </div>
              <div class="plan-name">High-Density Fleet</div>
              <div class="plan-price">$49 <span>/ month</span></div>
              <p class="plan-desc">
                High-throughput telemetry ingestion with dedicated compute headroom for dense sensor & actuator deployments.
              </p>

              <ul class="feature-list">
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>${plans.family.devices} High-Frequency Devices</strong> (Burst QoS)</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>${plans.family.seats} Operator Seats</strong> + Full RBAC Matrix</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>2.0 vCPU / 2048 MiB RAM</strong> Dedicated Pod</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>90-Day</strong> SenML Telemetry Retention</span>
                </li>
                <li>
                  <span class="feature-check">✓</span>
                  <span><strong>24/7 Dedicated Engineering</strong> Support</span>
                </li>
              </ul>
            </div>

            <div style="margin-top: var(--space-lg); padding-top: var(--space-md); border-top: 1px solid var(--border-subtle);">
              ${activeTierKey === 'pro' ? `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Active Infrastructure Tier</button>
              ` : isOwner ? `
                <button class="btn btn-primary btn-sm btn-full tier-switch-btn" data-backend-plan="family" data-ui-tier="pro" data-label="Pro (High-Density Fleet)">
                  Upgrade to Pro Tier
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm btn-full" disabled>Owner Permission Required</button>
              `}
            </div>
          </div>
        </div>
      </div>

      <!-- Delete Household Danger Zone -->
      ${isOwner ? `
        <div class="card danger-zone">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-sm); margin-bottom: var(--space-sm);">
            <div>
              <h3 style="margin-bottom: 0.25rem;">Danger Zone: Decommission Cloud Namespace</h3>
              <p style="font-size: 0.8125rem; color: var(--text-secondary); margin: 0;">
                Permanently terminates Kubernetes namespace <code class="mono">tenant-${tenant.slug}</code>, destroys the dedicated Home Assistant instance, revokes all Magistrala Thing credentials, and purges member access.
              </p>
            </div>
            <span class="badge badge-danger"><span class="led-dot led-rose"></span>IRREVERSIBLE</span>
          </div>

          <form id="delete-tenant-form" style="max-width: 480px; margin-top: var(--space-md);">
            <div class="form-group">
              <label for="confirm-slug">Type household identifier <span class="mono" style="color: var(--text-primary);">${tenant.slug}</span> to authorize decommissioning:</label>
              <input type="text" id="confirm-slug" class="input-mono" required autocomplete="off" placeholder="${tenant.slug}">
            </div>
            <button type="submit" id="delete-tenant-btn" class="btn btn-danger btn-sm" disabled>
              Permanently Decommission Household
            </button>
          </form>
        </div>
      ` : ''}
    </div>
  `;

  // Tier switch handlers
  container.querySelectorAll('.tier-switch-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const backendPlan = btn.dataset.backendPlan;
      const uiTier = btn.dataset.uiTier;
      const label = btn.dataset.label;

      if (backendPlan === 'single' && !confirm(`Scale down to ${label}? This enforces a ceiling of ${plans.single.seats} seat and ${plans.single.devices} devices.`)) {
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Applying ResourceQuotas...';

      try {
        if (backendPlan !== currentPlan) {
          await api.updatePlan(slug, backendPlan);
        }
        try {
          localStorage.setItem(`sift-ui-tier-${slug}`, uiTier);
        } catch {
          // ignore storage errors
        }
        toast(`Cloud tier updated to ${label}`, 'success');
        await router.refreshSession();
        renderPlan(container, slug, router);
      } catch (err) {
        toast(err.message || 'Failed to update infrastructure tier', 'error');
        btn.disabled = false;
        btn.textContent = `Switch to ${label}`;
      }
    });
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
      deleteBtn.textContent = 'Decommissioning namespace...';

      try {
        await api.deleteTenant(slug);
        toast(`Namespace "${tenant.slug}" decommissioned`, 'info');
        await router.refreshSession();
        router.navigate('#/');
      } catch (err) {
        toast(err.message || 'Failed to decommission household', 'error');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Permanently Decommission Household';
      }
    });
  }
}
