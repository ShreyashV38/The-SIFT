// ---------------------------------------------------------------------------
// The-SIFT Smart Home Portal — Household Members (#/t/:slug/members)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast, renderSpinner, copyToClipboard, resolveCloudDomain } from '../ui.js';

function getStoredPendingInvites(slug) {
  try {
    return JSON.parse(localStorage.getItem(`sift-pending-invites-${slug}`) || '[]');
  } catch {
    return [];
  }
}

function savePendingInvite(slug, invite) {
  const list = getStoredPendingInvites(slug).filter(i => i.email.toLowerCase() !== invite.email.toLowerCase());
  list.unshift(invite);
  try {
    localStorage.setItem(`sift-pending-invites-${slug}`, JSON.stringify(list.slice(0, 15)));
  } catch {
    // ignore storage errors
  }
}

function removePendingInvite(slug, email) {
  const list = getStoredPendingInvites(slug).filter(i => i.email.toLowerCase() !== email.toLowerCase());
  try {
    localStorage.setItem(`sift-pending-invites-${slug}`, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

export async function renderMembers(container, slug, router) {
  container.innerHTML = `
    <div style="text-align: center; padding: var(--space-3xl) var(--space-xl);">
      ${renderSpinner()}
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-size: 0.85rem;">Loading household members...</p>
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
          <strong>Could not load members:</strong> ${err.message}
        </div>
        <button id="back-home-btn" class="btn btn-secondary btn-sm">Back to Overview</button>
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
  const isAdminOrOwner = callerRole === 'owner' || callerRole === 'admin';
  const isSeatLimitReached = limits.seats.used >= limits.seats.max;
  const isSinglePlan = (tenant.plan || 'single') === 'single';
  const cloudDomain = resolveCloudDomain();
  const baseOrigin = window.location.origin && !window.location.origin.includes('null')
    ? window.location.origin
    : `https://${cloudDomain}`;

  // Reconcile stored pending invites against active members
  const activeEmails = new Set(members.map(m => (m.email || '').toLowerCase()));
  const pendingInvites = getStoredPendingInvites(slug).filter(inv => !activeEmails.has(inv.email.toLowerCase()));

  container.innerHTML = `
    <div>
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1>Household Members</h1>
          <p style="margin-bottom: 0; font-size: 0.84375rem;">
            Share access to your smart home with family members (<span class="mono">${limits.seats.used} / ${limits.seats.max}</span> seats used).
          </p>
        </div>
        <div class="page-header-actions">
          <a href="#/t/${slug}/plan" class="btn btn-secondary btn-sm">Change Plan</a>
        </div>
      </div>

      <!-- Add a Member Card -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 style="margin-bottom: 2px;">Add a Member</h3>
            <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 0;">
              Invite a family member to view live readings, control switches, and open Home Assistant.
            </p>
          </div>
          <span class="badge ${isSeatLimitReached ? 'badge-pending' : 'badge-online'}">
            <span class="led-dot ${isSeatLimitReached ? 'led-amber' : 'led-emerald'}"></span>
            ${limits.seats.used} / ${limits.seats.max} Seats
          </span>
        </div>

        ${isSeatLimitReached ? `
          <div class="banner banner-warning" style="margin-bottom: 0;">
            <div>
              ${isSinglePlan
                ? `<strong>The Single Plan supports 1 member.</strong> Upgrade to the Family Plan (up to 6 members) to invite family members.`
                : `<strong>All ${limits.seats.max} member seats are currently in use.</strong> Remove an existing member to free up a seat.`}
              ${isSinglePlan ? `
                <div style="margin-top: 0.65rem;">
                  <a href="#/t/${slug}/plan" class="btn btn-primary btn-sm">Upgrade to Family Plan</a>
                </div>
              ` : ''}
            </div>
          </div>
        ` : !isAdminOrOwner ? `
          <div class="banner banner-info" style="margin-bottom: 0;">
            <div>
              Only the household owner or an admin can invite new members.
            </div>
          </div>
        ` : `
          <form id="add-member-form">
            <div id="add-member-error" class="banner banner-danger" style="display: none;"></div>

            <div class="form-row">
              <div class="form-group" style="flex: 2; min-width: 240px;">
                <label for="member-email">Email Address</label>
                <input type="email" id="member-email" required placeholder="family.member@example.com">
                <div class="form-hint">If they don't have an account yet, we'll send them an invitation email.</div>
              </div>

              <div class="form-group" style="flex: 1; min-width: 220px;">
                <label for="member-role">Role</label>
                <select id="member-role">
                  <option value="member">Member — Can view and control all household devices</option>
                  ${isOwner ? '<option value="admin">Admin — Can also add devices and invite members</option>' : ''}
                </select>
              </div>
            </div>

            <button type="submit" id="add-member-btn" class="btn btn-primary btn-sm">
              Add Member
            </button>
          </form>
        `}
      </div>

      <!-- Members List Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h3 style="margin-bottom: 2px;">Members</h3>
            <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: 0;">People who currently have access to this household.</p>
          </div>
        </div>

        <div class="table-container" style="border: none; border-radius: 0;">
          <table>
            <thead>
              <tr>
                <th>Name &amp; Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${members.map(m => {
                const isCurrentMemberOwner = m.role === 'owner';
                const initial = (m.display_name || m.email || 'U').charAt(0).toUpperCase();

                let roleBadge = `<span class="badge badge-role">Member</span>`;
                if (isCurrentMemberOwner) {
                  roleBadge = `<span class="badge badge-online"><span class="led-dot led-emerald"></span>Owner</span>`;
                } else if (m.role === 'admin') {
                  roleBadge = `<span class="badge badge-pending"><span class="led-dot led-amber"></span>Admin</span>`;
                }

                return `
                  <tr>
                    <td>
                      <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="user-avatar-initial" style="width: 32px; height: 32px; font-size: 0.8rem;">
                          ${initial}
                        </div>
                        <div>
                          <div style="font-weight: 600; color: var(--text-main); font-size: 0.875rem;">${m.display_name || 'Member'}</div>
                          <div style="font-size: 0.75rem; color: var(--text-muted);">${m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>${roleBadge}</td>
                    <td class="mono" style="font-size: 0.775rem; color: var(--text-secondary);">
                      ${m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                    </td>
                    <td style="text-align: right;">
                      ${isOwner && !isCurrentMemberOwner ? `
                        <div style="display: inline-flex; gap: 0.4rem;">
                          <button class="btn btn-secondary btn-sm change-role-btn" data-id="${m.account_id}" data-role="${m.role}">
                            ${m.role === 'admin' ? 'Make Member' : 'Make Admin'}
                          </button>
                          <button class="btn btn-danger btn-sm remove-member-btn" data-id="${m.account_id}" data-name="${m.display_name || m.email}">
                            Remove
                          </button>
                        </div>
                      ` : isCurrentMemberOwner ? `
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Household Owner</span>
                      ` : '—'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pending Invitations Table -->
      ${pendingInvites.length > 0 ? `
        <div class="card" style="padding: 0; overflow: hidden;">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <h3 style="margin-bottom: 2px;">Pending Invitations</h3>
              <p style="font-size: 0.78125rem; color: var(--text-muted); margin-bottom: 0;">Share the invite link with family members who still need to create an account.</p>
            </div>
          </div>

          <div class="table-container" style="border: none; border-radius: 0;">
            <table>
              <thead>
                <tr>
                  <th>Invited Email</th>
                  <th>Role</th>
                  <th>Sent</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${pendingInvites.map(inv => {
                  const inviteUrl = `${baseOrigin}/#/register?invite=${encodeURIComponent(slug)}&email=${encodeURIComponent(inv.email)}`;
                  return `
                    <tr>
                      <td style="font-size: 0.84375rem; color: var(--text-main);">${inv.email}</td>
                      <td><span class="badge badge-pending">Pending ${(inv.role || 'member')}</span></td>
                      <td class="mono" style="font-size: 0.75rem; color: var(--text-muted);">
                        ${new Date(inv.sentAt).toLocaleDateString()}
                      </td>
                      <td style="text-align: right;">
                        <div style="display: inline-flex; gap: 6px;">
                          <button class="btn btn-secondary btn-sm copy-invite-url-btn" data-url="${inviteUrl}">Copy Invite Link</button>
                          <button class="btn btn-ghost btn-sm clear-invite-btn" data-email="${inv.email}">Dismiss</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Copy specific invite URL buttons
  container.querySelectorAll('.copy-invite-url-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      copyToClipboard(this.dataset.url, this, 'Copy Invite Link');
    });
  });

  // Dismiss pending invite
  container.querySelectorAll('.clear-invite-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      removePendingInvite(slug, this.dataset.email);
      renderMembers(container, slug, router);
    });
  });

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
        removePendingInvite(slug, email);
        toast(`Added ${email} to your household`, 'success');
        renderMembers(container, slug, router);
      } catch (err) {
        const msg = err.message || 'Could not add member.';
        if (err.code === 'ACCOUNT_NOT_FOUND' || msg.toLowerCase().includes('invitation email')) {
          savePendingInvite(slug, { email, role, sentAt: Date.now() });
          toast(`Invitation email sent to ${email}`, 'info');
          renderMembers(container, slug, router);
          return;
        }
        errorBanner.textContent = msg;
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

      if (!confirm(`Change this member's role to ${newRole}?`)) {
        return;
      }

      try {
        await api.updateMemberRole(slug, accountId, newRole);
        toast(`Role updated to ${newRole}`, 'success');
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

      if (!confirm(`Remove ${name} from your household?`)) {
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
