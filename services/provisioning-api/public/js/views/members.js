// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Household Members View (#/t/:slug/members)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, renderSpinner } from '../ui.js';

export async function renderMembers(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      ${renderSpinner()}
      <p style="margin-top: 0.5rem;">Loading household members...</p>
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
      <div class="card">
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

  container.innerHTML = `
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h1>Household Members</h1>
          <p>Manage shared access for family and administrators (${limits.seats.used} / ${limits.seats.max} seats used).</p>
        </div>

        <a href="#/t/${slug}" class="btn btn-secondary btn-sm">
          ← Household Home
        </a>
      </div>

      <!-- Add Member Form -->
      <div class="card">
        <h3>Add Household Member</h3>
        <p style="font-size: 0.85rem;">Directly add an existing user account to your household.</p>

        ${isSeatLimitReached ? `
          <div class="banner banner-warning">
            <strong>Seat Limit Reached:</strong> All ${limits.seats.max} seats are currently assigned on your ${tenant.plan} plan.
            <a href="#/t/${slug}/plan" style="color: inherit; text-decoration: underline; margin-left: 0.5rem;">Upgrade Plan →</a>
          </div>
        ` : `
          <form id="add-member-form" style="margin-top: 1rem;">
            <div id="add-member-error" class="banner banner-danger" style="display: none;"></div>

            <div class="form-row">
              <div class="form-group" style="flex: 2;">
                <label for="member-email">Account Email</label>
                <input type="email" id="member-email" required placeholder="family.member@example.com">
                <div class="form-hint">The user must have already registered an account in SIFT.</div>
              </div>

              <div class="form-group" style="flex: 1;">
                <label for="member-role">Household Role</label>
                <select id="member-role">
                  <option value="member">Member (view & use devices)</option>
                  ${isOwner ? '<option value="admin">Admin (manage devices & members)</option>' : ''}
                </select>
              </div>
            </div>

            <button type="submit" id="add-member-btn" class="btn btn-primary btn-sm">
              + Add Member
            </button>
          </form>
        `}
      </div>

      <!-- Members Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Joined</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${members.map(m => {
                const isCurrentMemberOwner = m.role === 'owner';
                return `
                  <tr>
                    <td>
                      <strong>${m.display_name}</strong>
                      <div class="form-hint">${m.email}</div>
                    </td>
                    <td>
                      <span class="badge ${isCurrentMemberOwner ? 'badge-online' : 'badge-role'}">
                        ${m.role}
                      </span>
                    </td>
                    <td>${new Date(m.joined_at).toLocaleDateString()}</td>
                    <td style="text-align: right;">
                      ${isOwner && !isCurrentMemberOwner ? `
                        <button class="btn btn-secondary btn-sm change-role-btn" data-id="${m.account_id}" data-role="${m.role}">
                          Change Role
                        </button>
                        <button class="btn btn-danger btn-sm remove-member-btn" data-id="${m.account_id}" data-name="${m.display_name}">
                          Remove
                        </button>
                      ` : isCurrentMemberOwner ? `
                        <span class="form-hint">Primary Owner</span>
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
