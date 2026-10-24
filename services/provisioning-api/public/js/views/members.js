// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Household Members View (#/t/:slug/members)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, renderSpinner } from '../ui.js';

export async function renderMembers(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-4xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-weight: 500;">Loading household members...</p>
    </div>
  `;

  let tenantData, membersData;
  try {
    [tenantData, membersData] = await Promise.all([
      api.getTenant(slug),
      api.getMembers(slug),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 2rem auto;">
        <div class="banner banner-danger">
          <strong>Failed to load members:</strong> ${err.message}
        </div>
        <button id="back-home-btn" class="btn btn-secondary">← Back to Household</button>
      </div>
    `;
    container.querySelector('#back-home-btn')?.addEventListener('click', () => router.navigate(`#/t/${slug}`));
    return;
  }

  const tenant = tenantData.tenant || {};
  const members = membersData.members || [];
  const limits = tenantData.limits || { seats: { used: 1, max: 1 } };
  const callerRole = tenantData.callerRole || 'member';
  const isOwner = callerRole === 'owner';
  const isSeatLimitReached = limits.seats.used >= limits.seats.max;
  const seatPct = Math.min(100, Math.round((limits.seats.used / limits.seats.max) * 100));

  container.innerHTML = `
    <div>
      <div class="page-header">
        <div>
          <h1>Household Members</h1>
          <p style="margin-bottom: 0;">
            Manage access and permissions for family members and administrators (${limits.seats.used} of ${limits.seats.max} seats used).
          </p>
        </div>
        <div class="page-header-actions">
          <a href="#/t/${slug}" class="btn btn-secondary btn-sm">← Dashboard</a>
        </div>
      </div>

      <!-- Add Member Form Card -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 0.2rem;">Add Household Member</h3>
            <p style="font-size: 0.8125rem; margin-bottom: 0; color: var(--text-muted);">
              Invite an existing registered SIFT user to collaborate in your household.
            </p>
          </div>
          <div style="font-size: 0.8125rem; color: var(--text-secondary); font-weight: 600;">
            Capacity: ${limits.seats.used} / ${limits.seats.max} Seats
          </div>
        </div>

        ${isSeatLimitReached ? `
          <div class="banner banner-warning">
            <span>
              <strong>Seat Quota Reached:</strong> All ${limits.seats.max} seats are currently assigned on the ${tenant.plan} plan.
              <a href="#/t/${slug}/plan" class="inline-link" style="margin-left: var(--space-sm);">Upgrade to Family Plan →</a>
            </span>
          </div>
        ` : `
          <form id="add-member-form">
            <div id="add-member-error" class="banner banner-danger" style="display: none;"></div>

            <div class="form-row">
              <div class="form-group" style="flex: 2; min-width: 240px;">
                <label for="member-email">Account Email</label>
                <input type="email" id="member-email" required placeholder="family.member@example.com">
                <div class="form-hint">The user must have an existing account registered in SIFT.</div>
              </div>

              <div class="form-group" style="flex: 1; min-width: 180px;">
                <label for="member-role">Household Role</label>
                <select id="member-role">
                  <option value="member">Member (view & control devices)</option>
                  ${isOwner ? '<option value="admin">Admin (manage devices & members)</option>' : ''}
                </select>
                <div class="form-hint">Permissions tier for this household.</div>
              </div>
            </div>

            <button type="submit" id="add-member-btn" class="btn btn-primary btn-sm">
              + Add Member to Household
            </button>
          </form>
        `}
      </div>

      <!-- Members Data Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div class="table-container" style="border: none; border-radius: 0;">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Date Joined</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${members.map(m => {
                const isCurrentMemberOwner = m.role === 'owner';
                const initial = (m.display_name || m.email || 'U').charAt(0).toUpperCase();

                let roleBadgeClass = 'badge-role';
                if (isCurrentMemberOwner) roleBadgeClass = 'badge-online';
                else if (m.role === 'admin') roleBadgeClass = 'badge-pending';

                return `
                  <tr>
                    <td>
                      <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-teal) 100%); color: #fff; font-weight: 700; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                          ${initial}
                        </div>
                        <div>
                          <strong style="color: var(--text-main); font-weight: 600;">${m.display_name}</strong>
                          <div class="form-hint" style="margin-top: 1px;">${m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="badge ${roleBadgeClass}">
                        ${m.role}
                      </span>
                    </td>
                    <td style="font-size: 0.8125rem;">${new Date(m.joined_at).toLocaleDateString()}</td>
                    <td style="text-align: right;">
                      ${isOwner && !isCurrentMemberOwner ? `
                        <button class="btn btn-secondary btn-sm change-role-btn" data-id="${m.account_id}" data-role="${m.role}">
                          Change Role
                        </button>
                        <button class="btn btn-danger btn-sm remove-member-btn" data-id="${m.account_id}" data-name="${m.display_name}">
                          Remove
                        </button>
                      ` : isCurrentMemberOwner ? `
                        <span class="badge badge-online" style="font-size: 0.725rem;">Primary Owner</span>
                      ` : '—'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Add member submission
  const addForm = container.querySelector('#add-member-form');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorBanner = container.querySelector('#add-member-error');
      const addBtn = container.querySelector('#add-member-btn');
      errorBanner.style.display = 'none';
      addBtn.disabled = true;

      const email = container.querySelector('#member-email').value.trim();
      const role = container.querySelector('#member-role').value;

      try {
        await api.addMember(slug, email, role);
        toast(`Added ${email} to household`, 'success');
        renderMembers(container, slug, router);
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to add member.';
        errorBanner.style.display = 'block';
        addBtn.disabled = false;
      }
    });
  }

  // Change role handlers
  container.querySelectorAll('.change-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.id;
      const currentRole = btn.dataset.role;
      const newRole = currentRole === 'admin' ? 'member' : 'admin';

      if (!confirm(`Change role of this user from ${currentRole} to ${newRole}?`)) {
        return;
      }

      try {
        await api.updateMemberRole(slug, accountId, newRole);
        toast(`Updated role to ${newRole}`, 'success');
        renderMembers(container, slug, router);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  // Remove member handlers
  container.querySelectorAll('.remove-member-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const accountId = btn.dataset.id;
      const name = btn.dataset.name;

      if (!confirm(`Are you sure you want to remove ${name} from this household?`)) {
        return;
      }

      try {
        await api.removeMember(slug, accountId);
        toast(`Removed ${name}`, 'info');
        renderMembers(container, slug, router);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}
