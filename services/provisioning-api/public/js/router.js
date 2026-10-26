// ---------------------------------------------------------------------------
// The-SIFT Cloud Portal — Client-Side Hash Router & Workspace Shell Controller
// ---------------------------------------------------------------------------

import { api } from './api.js';
import { announce, toast, getCurrentTheme, toggleTheme, formatTierBadge } from './ui.js';
import { renderLogin } from './views/login.js';
import { renderRegister } from './views/register.js';
import { renderCreateHousehold } from './views/create-household.js';
import { renderHome } from './views/home.js';
import { renderDevices } from './views/devices.js';
import { renderAddDevice } from './views/add-device.js';
import { renderDeviceDetail } from './views/device-detail.js';
import { renderMembers } from './views/members.js';
import { renderPlan } from './views/plan.js';
import { renderHelp } from './views/help.js';

const ICONS = {
  overview: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  devices: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`,
  members: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  plan: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  docs: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  sun: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  logout: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
};

class Router {
  constructor(appContainer, headerNavContainer) {
    this.container = appContainer;
    this.headerNav = headerNavContainer;
    this.shellRoot = document.getElementById('shell-root');
    this.sidebarSwitcher = document.getElementById('sidebar-switcher');
    this.sidebarNav = document.getElementById('sidebar-nav');
    this.sidebarFooter = document.getElementById('sidebar-footer');
    this.topbarActions = document.getElementById('topbar-actions');
    this.session = null;
    this.currentSlug = null;
    this.pageIntervals = new Set(); // Page-scoped polling timers, cleared on navigation

    this.initMobileDrawer();
  }

  // Register a page-scoped setInterval id so it is cleared when the user navigates away
  registerInterval(intervalId) {
    if (intervalId != null) this.pageIntervals.add(intervalId);
    return intervalId;
  }

  clearPageIntervals() {
    this.pageIntervals.forEach(id => clearInterval(id));
    this.pageIntervals.clear();
  }

  initMobileDrawer() {
    const openBtn = document.getElementById('sidebar-open-btn');
    const closeBtn = document.getElementById('sidebar-close-btn');
    const backdrop = document.getElementById('sidebar-backdrop');

    const closeDrawer = () => {
      this.shellRoot?.classList.remove('sidebar-open');
    };

    openBtn?.addEventListener('click', () => {
      this.shellRoot?.classList.add('sidebar-open');
    });
    closeBtn?.addEventListener('click', closeDrawer);
    backdrop?.addEventListener('click', closeDrawer);
  }

  async init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    await this.refreshSession();
    this.handleRoute();
  }

  async refreshSession() {
    try {
      this.session = await api.getMe();
      if (this.session && this.session.tenants && this.session.tenants.length > 0) {
        const exists = this.session.tenants.some(t => t.slug === this.currentSlug);
        if (!this.currentSlug || !exists) {
          this.currentSlug = this.session.tenants[0].slug;
        }
      } else {
        this.currentSlug = null;
      }
    } catch {
      this.session = null;
      this.currentSlug = null;
    }
    this.renderHeader();
  }

  resolveViewLabel(hash) {
    if (hash === '#/login') return 'Sign In';
    if (hash === '#/register') return 'Create Account';
    if (hash === '#/create-household') return 'Create Household';
    if (hash.startsWith('#/help')) return 'Help Guide';

    const tenantMatch = hash.match(/^#\/t\/([^/]+)(?:\/(.*))?$/);
    if (tenantMatch) {
      const subpath = tenantMatch[2] || '';
      if (!subpath) return 'Overview';
      if (subpath === 'devices') return 'Devices';
      if (subpath === 'devices/new') return 'Add Device';
      if (subpath.startsWith('devices/')) return 'Device Details';
      if (subpath === 'members') return 'Members';
      if (subpath === 'plan') return 'Plan';
    }
    return 'Overview';
  }

  renderThemeToggleButton() {
    const isLight = getCurrentTheme() === 'light';
    return `
      <button type="button" id="theme-toggle-btn" class="theme-toggle-btn" aria-label="Toggle color theme" title="Switch between Dark Mode and Light Mode">
        ${isLight ? ICONS.moon : ICONS.sun}
        <span>${isLight ? 'Dark Mode' : 'Light Mode'}</span>
      </button>
    `;
  }

  bindThemeToggle(rootEl) {
    const btn = rootEl?.querySelector('#theme-toggle-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        toggleTheme();
        this.renderHeader();
      });
    }
  }

  renderHeader() {
    if (!this.headerNav) return;

    const currentHash = window.location.hash || '#/';
    const viewLabel = this.resolveViewLabel(currentHash);

    // Unauthenticated Mode
    if (!this.session) {
      this.shellRoot?.classList.add('auth-mode');
      this.shellRoot?.classList.remove('sidebar-open');

      const isLogin = currentHash === '#/login';
      const isRegister = currentHash === '#/register';
      const isHelp = currentHash.startsWith('#/help');

      this.headerNav.innerHTML = `
        <a href="#/login" class="brand-link" style="margin-right: 12px;">
          <span class="brand-glyph" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </span>
          <span class="brand-title">The-SIFT</span>
        </a>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">${viewLabel}</span>
      `;

      if (this.topbarActions) {
        this.topbarActions.innerHTML = `
          <a href="#/help" class="btn btn-ghost btn-sm ${isHelp ? 'active' : ''}">Help</a>
          <a href="#/login" class="btn ${isLogin ? 'btn-secondary' : 'btn-ghost'} btn-sm">Sign In</a>
          <a href="#/register" class="btn ${isRegister ? 'btn-primary' : 'btn-secondary'} btn-sm">Register</a>
          ${this.renderThemeToggleButton()}
        `;
        this.bindThemeToggle(this.topbarActions);
      }
      return;
    }

    // Authenticated Workspace Shell Mode
    this.shellRoot?.classList.remove('auth-mode');

    const tenants = this.session.tenants || [];
    const activeTenant = tenants.find(t => t.slug === this.currentSlug) || tenants[0] || null;
    const user = this.session.account || {};
    const userName = user.displayName || user.email || 'User';
    const userEmail = user.email || '';
    const userInitial = userName.charAt(0).toUpperCase();
    const activeRole = activeTenant?.role || 'member';
    const tierBadge = formatTierBadge(activeTenant?.plan || 'single');

    // Topbar Breadcrumb
    this.headerNav.innerHTML = `
      <span class="crumb-root">The-SIFT</span>
      ${activeTenant ? `
        <span class="crumb-sep">/</span>
        <a href="#/t/${activeTenant.slug}" class="crumb-tenant">${activeTenant.displayName || activeTenant.slug}</a>
      ` : ''}
      <span class="crumb-sep">/</span>
      <span class="crumb-current">${viewLabel}</span>
    `;

    // Topbar Right Actions
    if (this.topbarActions) {
      this.topbarActions.innerHTML = `
        ${this.renderThemeToggleButton()}
      `;
      this.bindThemeToggle(this.topbarActions);
    }

    // Sidebar Household Switcher
    if (this.sidebarSwitcher) {
      if (tenants.length > 0 && activeTenant) {
        this.sidebarSwitcher.innerHTML = `
          <div class="switcher-label-row">
            <span class="switcher-label">Active Household</span>
            <span class="badge badge-tier">${tierBadge}</span>
          </div>
          <div class="switcher-control">
            <select id="sidebar-household-select" class="switcher-select" aria-label="Select Household Workspace">
              ${tenants.map(t => `
                <option value="${t.slug}" ${t.slug === activeTenant.slug ? 'selected' : ''}>
                  ${t.displayName || t.slug}
                </option>
              `).join('')}
              <option value="__new__">+ New Household...</option>
            </select>
          </div>
          <div class="switcher-meta">
            <span class="switcher-slug">${activeTenant.slug}</span>
            <a href="#/create-household" class="inline-link" style="font-size: 0.725rem; font-weight: 600;">+ New</a>
          </div>
        `;

        const selectEl = this.sidebarSwitcher.querySelector('#sidebar-household-select');
        selectEl?.addEventListener('change', (e) => {
          const val = e.target.value;
          if (val === '__new__') {
            this.navigate('#/create-household');
          } else if (val) {
            this.currentSlug = val;
            this.navigate(`#/t/${val}`);
          }
        });
      } else {
        this.sidebarSwitcher.innerHTML = `
          <a href="#/create-household" class="btn btn-primary btn-sm btn-full">
            ${ICONS.plus}
            <span>New Household</span>
          </a>
        `;
      }
    }

    // Sidebar Navigation Links
    if (this.sidebarNav) {
      const slug = activeTenant?.slug || this.currentSlug;
      const isOverview = Boolean(slug && currentHash === `#/t/${slug}`);
      const isDevices = Boolean(slug && currentHash.startsWith(`#/t/${slug}/devices`));
      const isMembers = Boolean(slug && currentHash === `#/t/${slug}/members`);
      const isPlan = Boolean(slug && currentHash === `#/t/${slug}/plan`);
      const isHelp = currentHash.startsWith('#/help');

      this.sidebarNav.innerHTML = `
        <div class="nav-section-title">Household</div>
        ${slug ? `
          <a href="#/t/${slug}" class="sidebar-link ${isOverview ? 'active' : ''}">
            ${ICONS.overview}
            <span>Overview</span>
          </a>
          <a href="#/t/${slug}/devices" class="sidebar-link ${isDevices ? 'active' : ''}">
            ${ICONS.devices}
            <span>Devices</span>
          </a>
          <a href="#/t/${slug}/members" class="sidebar-link ${isMembers ? 'active' : ''}">
            ${ICONS.members}
            <span>Members</span>
          </a>
          <a href="#/t/${slug}/plan" class="sidebar-link ${isPlan ? 'active' : ''}">
            ${ICONS.plan}
            <span>Plan</span>
          </a>
        ` : `
          <a href="#/create-household" class="sidebar-link ${currentHash === '#/create-household' ? 'active' : ''}">
            ${ICONS.plus}
            <span>Create Household</span>
          </a>
        `}
        <div class="nav-section-title" style="margin-top: 12px;">Resources</div>
        <a href="#/help" class="sidebar-link ${isHelp ? 'active' : ''}">
          ${ICONS.docs}
          <span>Help</span>
        </a>
      `;

      this.sidebarNav.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', () => {
          this.shellRoot?.classList.remove('sidebar-open');
        });
      });
    }

    // Sidebar User Footer
    if (this.sidebarFooter) {
      this.sidebarFooter.innerHTML = `
        <div class="user-profile-row">
          <span class="user-avatar-initial">${userInitial}</span>
          <div class="user-meta">
            <div class="user-name" title="${userName}">${userName}</div>
            <div class="user-email" title="${userEmail}">${userEmail}</div>
          </div>
          <span class="badge badge-role">${activeRole}</span>
        </div>
        <button type="button" id="logout-btn" class="btn btn-secondary btn-sm btn-full">
          ${ICONS.logout}
          <span>Sign Out</span>
        </button>
      `;

      const logoutBtn = this.sidebarFooter.querySelector('#logout-btn');
      logoutBtn?.addEventListener('click', async () => {
        try {
          await api.logout();
          this.session = null;
          this.currentSlug = null;
          this.renderHeader();
          toast('Signed out of The-SIFT', 'info');
          this.navigate('#/login');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }
  }

  navigate(hash) {
    if (window.location.hash === hash) {
      this.handleRoute();
    } else {
      window.location.hash = hash;
    }
  }

  async handleRoute() {
    // Stop any live-polling timers owned by the previous view
    this.clearPageIntervals();
    window.scrollTo(0, 0);
    this.renderHeader();
    const hash = window.location.hash || '#/';

    // Public Help route
    if (hash === '#/help' || hash === '#/help/esp32' || hash.startsWith('#/help')) {
      announce('Navigated to Help Guide');
      renderHelp(this.container, this);
      return;
    }

    // Public Auth routes
    if (hash === '#/login') {
      if (this.session) {
        this.navigate('#/');
        return;
      }
      announce('Navigated to sign in');
      renderLogin(this.container, this);
      return;
    }

    if (hash === '#/register') {
      if (this.session) {
        this.navigate('#/');
        return;
      }
      announce('Navigated to account registration');
      renderRegister(this.container, this);
      return;
    }

    // Protected routes require session
    if (!this.session) {
      this.navigate('#/login');
      return;
    }

    // Root route: redirect based on household membership
    if (hash === '#/' || hash === '#') {
      const tenants = this.session.tenants || [];
      if (tenants.length === 0) {
        this.navigate('#/create-household');
      } else {
        this.currentSlug = this.currentSlug || tenants[0].slug;
        this.navigate(`#/t/${this.currentSlug}`);
      }
      return;
    }

    // Create household wizard
    if (hash === '#/create-household') {
      announce('Navigated to create household');
      renderCreateHousehold(this.container, this);
      return;
    }

    // Tenant-specific routes: #/t/:slug/...
    const tenantMatch = hash.match(/^#\/t\/([^/]+)(?:\/(.*))?$/);
    if (tenantMatch) {
      const slug = decodeURIComponent(tenantMatch[1]);
      const subpath = tenantMatch[2] || '';
      this.currentSlug = slug;
      this.renderHeader();

      if (!subpath) {
        announce(`Navigated to ${slug} overview`);
        renderHome(this.container, slug, this);
        return;
      }

      if (subpath === 'devices/new') {
        announce('Navigated to add device');
        renderAddDevice(this.container, slug, this);
        return;
      }

      if (subpath === 'devices') {
        announce('Navigated to smart devices');
        renderDevices(this.container, slug, this);
        return;
      }

      const devDetailMatch = subpath.match(/^devices\/([^/]+)$/);
      if (devDetailMatch) {
        const deviceId = devDetailMatch[1];
        announce(`Navigated to device details for device ${deviceId}`);
        renderDeviceDetail(this.container, slug, deviceId, this);
        return;
      }

      if (subpath === 'members') {
        announce('Navigated to household members');
        renderMembers(this.container, slug, this);
        return;
      }

      if (subpath === 'plan') {
        announce('Navigated to household plan');
        renderPlan(this.container, slug, this);
        return;
      }
    }

    // Fallback: 404
    this.container.innerHTML = `
      <div class="card empty-state" style="max-width: 480px; margin: 3rem auto;">
        <div class="empty-state-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <h2>Page Not Found</h2>
        <p>The page you are looking for could not be found.</p>
        <a href="#/" class="btn btn-primary" style="margin-top: var(--space-md);">Go to Overview</a>
      </div>
    `;
  }
}

export function initRouter(appContainer, headerNavContainer) {
  const router = new Router(appContainer, headerNavContainer);
  router.init();
  return router;
}
