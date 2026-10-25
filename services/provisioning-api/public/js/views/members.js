// ---------------------------------------------------------------------------
// The-SIFT Cloud Platform — Household Members & RBAC View (#/t/:slug/members)
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
      <p style="margin-top: var(--space-md); color: var(--text-muted); font-size: 0.85rem;">Loading household access directory...</p>
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
          <h1>Access & Role-Based Control</h1>
          <p class="page-subtitle">
            Manage operator permissions, household memberships, and cloud invitation links for <strong>${tenant.name || slug}</strong>.
          </p>
        </div>
        <div class="page-header-actions">
          <span class="badge badge-neutral mono">${limits.seats.used} / ${limits.seats.max} SEATS ASSIGNED</span>
          <a href="#/t/${slug}/plan" class="btn btn-secondary btn-sm">Manage Seat Quota</a>
        </div>
      </div>

      <!-- Split / Stacked Layout: Invite Card + RBAC Matrix -->
      <div class="grid-2" style="margin-bottom: var(--space-lg); align-items: stretch;">
        <!-- Invite Household Member Card -->
        <div class="card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div class="card-header">
              <div>
                <div class="card-title">Invite Household Member</div>
                <div class="card-subtitle">Grant cloud portal & Home Assistant access to an operator or family member.</div>
              </div>
              <span class="badge ${isSeatLimitReached ? 'badge-warning' : 'badge-online'}">
                <span class="led-dot ${isSeatLimitReached ? 'led-amber' : 'led-emerald'}"></span>
                ${isSeatLimitReached ? 'Quota Full' : `${limits.seats.max - limits.seats.used} Open`}
              </span>
            </div>

            ${isSeatLimitReached ? `
              <div class="banner banner-warning" style="margin-bottom: 0;">
                <div>
                  <strong>Seat Quota Reached (${limits.seats.used}/${limits.seats.max}):</strong>
                  All operator seats on your current tier are assigned. Upgrade your infrastructure tier to invite additional members.
                  <div style="margin-top: 0.65rem;">
                    <a href="#/t/${slug}/plan" class="btn btn-primary btn-sm">Upgrade Tier Quota</a>
                  </div>
                </div>
              </div>
            ` : !isAdminOrOwner ? `
              <div class="banner banner-info" style="margin-bottom: 0;">
                <div>
                  <strong>Administrator Permission Required:</strong>
                  Your current role (<span class="mono">${callerRole.toUpperCase()}</span>) has read and control access. Only Household Owners or Admins can invite new members.
                </div>
              </div>
            ` : `
              <form id="add-member-form">
                <div id="add-member-error" class="banner banner-danger" style="display: none;"></div>
                <div id="add-member-invite-notice" class="banner banner-info" style="display: none;"></div>

                <div class="form-group">
                  <label for="member-email">Operator Email Address</label>
                  <input type="email" id="member-email" required placeholder="operator@domain.com">
                  <div class="form-hint">If the operator is not yet registered, a cloud onboarding link will be dispatched.</div>
                </div>

                <div class="form-group">
                  <label for="member-role">Assigned RBAC Role</label>
                  <select id="member-role">
                    <option value="member">Member — View telemetry, inspect hardware & dispatch commands</option>
                    ${isOwner ? '<option value="admin">Admin — Provision hardware, rotate secrets & manage members</option>' : ''}
                  </select>
                </div>

                <button type="submit" id="add-member-btn" class="btn btn-primary btn-full">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                  Authorize / Send Cloud Invite
                </button>
              </form>
            `}
          </div>
        </div>

        <!-- RBAC Permission Matrix Card -->
        <div class="card" style="margin-bottom: 0;">
          <div class="card-header">
            <div>
              <div class="card-title">Role-Based Access Control (RBAC) Tiers</div>
              <div class="card-subtitle">Security boundaries enforced across API gateways and MQTT brokers.</div>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="padding: 0.75rem; background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <strong style="font-size: 0.8125rem; color: var(--text-primary);">Owner / Admin</strong>
                <span class="badge badge-online"><span class="led-dot led-emerald"></span>Full Control</span>
              </div>
              <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0;">
                Provision & revoke hardware credentials, rotate Thing secrets, manage household members, and modify cloud infrastructure tiers.
              </p>
            </div>

            <div style="padding: 0.75rem; background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <strong style="font-size: 0.8125rem; color: var(--text-primary);">Member</strong>
                <span class="badge badge-accent"><span class="led-dot led-cobalt"></span>Standard Access</span>
              </div>
              <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0;">
                Access Home Assistant Cloud portal, inspect real-time SenML telemetry streams, and dispatch actuator commands to active devices.
              </p>
            </div>

            <div style="padding: 0.75rem; background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <strong style="font-size: 0.8125rem; color: var(--text-primary);">Guest (Pending Onboarding)</strong>
                <span class="badge badge-neutral">Read / Invite Scope</span>
              </div>
              <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0;">
                Unregistered recipients receive a cryptographic registration invite URL. Zero access to household telemetry until identity verification completes.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Members Directory Table -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: var(--space-lg) var(--space-xl); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-sm);">
          <div>
            <div class="card-title">Active Members Directory</div>
            <div class="card-subtitle">Verified operators with active access to namespace <span class="mono">tenant-${tenant.slug || slug}</span></div>
          </div>
          <span class="badge badge-online">
            <span class="led-dot led-emerald"></span>
            ${members.length} Active ${members.length === 1 ? 'Operator' : 'Operators'}
          </span>
        </div>

        <div class="table-container" style="border: none; border-radius: 0;">
          <table>
            <thead>
              <tr>
                <th>Operator Identity</th>
                <th>RBAC Role</th>
                <th>Provisioned Date</th>
                <th style="text-align: right;">Access Controls</th>
              </tr>
            </thead>
            <tbody>
              ${members.map(m => {
                const isCurrentMemberOwner = m.role === 'owner';
                const initial = (m.display_name || m.email || 'U').charAt(0).toUpperCase();

                let roleBadge = `<span class="badge badge-accent"><span class="led-dot led-cobalt"></span>MEMBER</span>`;
                if (isCurrentMemberOwner) {
                  roleBadge = `<span class="badge badge-online"><span class="led-dot led-emerald"></span>OWNER</span>`;
                } else if (m.role === 'admin') {
                  roleBadge = `<span class="badge badge-warning"><span class="led-dot led-amber"></span>ADMIN</span>`;
                }

                return `
                  <tr>
                    <td>
                      <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="user-avatar" style="width: 34px; height: 34px; font-size: 0.8rem;">
                          ${initial}
                        </div>
                        <div>
                          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.875rem;">${m.display_name || 'Operator'}</div>
                          <div class="mono" style="font-size: 0.75rem; color: var(--text-muted);">${m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>${roleBadge}</td>
                    <td class="mono" style="font-size: 0.775rem; color: var(--text-secondary);">
                      ${m.joined_at ? new Date(m.joined_at).toISOString().split('T')[0] : '—'}
                    </td>
                    <td style="text-align: right;">
                      ${isOwner && !isCurrentMemberOwner ? `
                        <div style="display: inline-flex; gap: 0.4rem;">
                          <button class="btn btn-secondary btn-xs change-role-btn" data-id="${m.account_id}" data-role="${m.role}">
                            Switch to ${m.role === 'admin' ? 'Member' : 'Admin'}
                          </button>
                          <button class="btn btn-danger btn-xs remove-member-btn" data-id="${m.account_id}" data-name="${m.display_name || m.email}">
                            Revoke
                          </button>
                        </div>
                      ` : isCurrentMemberOwner ? `
                        <span class="badge badge-neutral mono" style="font-size: 0.68rem;">PRIMARY TENANT OWNER</span>
                      ` : `
                        <span class="mono" style="font-size: 0.75rem; color: var(--text-muted);">Read-Only</span>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pending Invitations & Onboarding Links Card -->
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="padding: var(--space-lg) var(--space-xl); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-sm);">
          <div>
            <div class="card-title">Pending Invitations & Cloud Onboarding Links</div>
            <div class="card-subtitle">Share registration links directly with invited operators awaiting account creation.</div>
          </div>
          <button id="copy-direct-invite-btn" class="btn btn-secondary btn-xs">
            Copy Registration Portal URL
          </button>
        </div>

        ${pendingInvites.length === 0 ? `
          <div style="padding: var(--space-xl); text-align: center; color: var(--text-muted); font-size: 0.8125rem;">
            No pending external email invitations. When you invite an unregistered email address above, its onboarding link appears here.
          </div>
        ` : `
          <div class="table-container" style="border: none; border-radius: 0;">
            <table>
              <thead>
                <tr>
                  <th>Invited Email</th>
                  <th>Intended Role</th>
                  <th>Registration Link</th>
                  <th>Dispatched</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${pendingInvites.map(inv => {
                  const inviteUrl = `${baseOrigin}/#/register?invite=${encodeURIComponent(slug)}&email=${encodeURIComponent(inv.email)}`;
                  return `
                    <tr>
                      <td class="mono" style="font-size: 0.8125rem; color: var(--text-primary);">${inv.email}</td>
                      <td>
                        <span class="badge badge-warning">
                          <span class="led-dot led-amber"></span>
                          PENDING ${(inv.role || 'member').toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div style="display: inline-flex; align-items: center; gap: 0.4rem;">
                          <code class="mono" style="font-size: 0.72rem; color: var(--text-secondary); background: var(--bg-canvas); padding: 0.2rem 0.45rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                            ${inviteUrl.length > 48 ? inviteUrl.slice(0, 48) + '...' : inviteUrl}
                          </code>
                          <button class="btn btn-ghost btn-xs copy-invite-url-btn" data-url="${inviteUrl}">Copy Link</button>
                        </div>
                      </td>
                      <td class="mono" style="font-size: 0.75rem; color: var(--text-muted);">
                        ${new Date(inv.sentAt).toISOString().split('T')[0]}
                      </td>
                      <td style="text-align: right;">
                        <button class="btn btn-ghost btn-xs clear-invite-btn" data-email="${inv.email}">Dismiss</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;

  // Copy general registration link
  container.querySelector('#copy-direct-invite-btn')?.addEventListener('click', function () {
    copyToClipboard(`${baseOrigin}/#/register`, this);
  });

  // Copy specific invite URL buttons
  container.querySelectorAll('.copy-invite-url-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      copyToClipboard(this.dataset.url, this);
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
      const inviteNotice = container.querySelector('#add-member-invite-notice');
      const addBtn = container.querySelector('#add-member-btn');
      errorBanner.style.display = 'none';
      inviteNotice.style.display = 'none';
      addBtn.disabled = true;

      const email = container.querySelector('#member-email').value.trim();
      const role = container.querySelector('#member-role').value;

      try {
        await api.addMember(slug, email, role);
        removePendingInvite(slug, email);
        toast(`Authorized ${email} in household`, 'success');
        renderMembers(container, slug, router);
      } catch (err) {
        const msg = err.message || 'Failed to add member.';
        // If backend sent an invitation email because account wasn't registered yet
        if (err.code === 'ACCOUNT_NOT_FOUND' || msg.toLowerCase().includes('invitation email')) {
          savePendingInvite(slug, { email, role, sentAt: Date.now() });
          toast(`Cloud invitation dispatched to ${email}`, 'info');
          renderMembers(container, slug, router);
          return;
        }
        errorBanner.textContent = msg;
        errorBanner.style.display = 'flex';
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

      if (!confirm(`Update operator role from ${currentRole.toUpperCase()} to ${newRole.toUpperCase()}?`)) {
        return;
      }

      try {
        await api.updateMemberRole(slug, accountId, newRole);
        toast(`Role updated to ${newRole.toUpperCase()}`, 'success');
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

      if (!confirm(`Revoke household access for ${name}?`)) {
        return;
      }

      try {
        await api.removeMember(slug, accountId);
        toast(`Revoked access for ${name}`, 'info');
        renderMembers(container, slug, router);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}
