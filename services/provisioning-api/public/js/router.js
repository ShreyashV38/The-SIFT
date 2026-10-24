// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Client-Side Hash Router (Phase 6C)
// ---------------------------------------------------------------------------

import { api } from './api.js';
import { announce, toast } from './ui.js';
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

class Router {
  constructor(appContainer, headerNavContainer) {
    this.container = appContainer;
    this.headerNav = headerNavContainer;
    this.session = null;
    this.currentSlug = null;
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
        if (!this.currentSlug) {
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

  renderHeader() {
    if (!this.headerNav) return;

    const currentHash = window.location.hash || '#/';

    if (!this.session) {
      const isLogin = currentHash === '#/login';
      const isRegister = currentHash === '#/register';
      const isHelp = currentHash.startsWith('#/help');

      this.headerNav.innerHTML = `
        <a href="#/login" class="nav-link ${isLogin ? 'active' : ''}">Sign In</a>
        <a href="#/register" class="btn btn-primary btn-sm" style="${isRegister ? 'box-shadow: 0 0 0 2px var(--brand-cyan);' : ''}">Register</a>
        <a href="#/help/esp32" class="nav-link ${isHelp ? 'active' : ''}">Help</a>
      `;
      return;
    }

    const tenants = this.session.tenants || [];
    const user = this.session.account || {};
    const userName = user.displayName || user.email || 'User';
    const userInitial = userName.charAt(0).toUpperCase();

    const isDashboard = Boolean(this.currentSlug && currentHash === `#/t/${this.currentSlug}`);
    const isDevices = Boolean(this.currentSlug && currentHash.startsWith(`#/t/${this.currentSlug}/devices`));
    const isNew = currentHash === '#/create-household';
    const isHelp = currentHash.startsWith('#/help');

    this.headerNav.innerHTML = `
      ${this.currentSlug ? `
        <a href="#/t/${this.currentSlug}" class="nav-link ${isDashboard ? 'active' : ''}">Dashboard</a>
        <a href="#/t/${this.currentSlug}/devices" class="nav-link ${isDevices ? 'active' : ''}">Devices</a>
      ` : ''}
      <a href="#/create-household" class="nav-link ${isNew ? 'active' : ''}">+ New</a>
      <a href="#/help/esp32" class="nav-link ${isHelp ? 'active' : ''}">Help</a>
      <div class="user-chip" title="Logged in as ${userName}">
        <span class="user-avatar-initial">${userInitial}</span>
        <span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${userName}</span>
      </div>
      <button id="logout-btn" class="btn btn-secondary btn-sm" style="background: rgba(255,255,255,0.06); color: var(--text-nav); border-color: rgba(255,255,255,0.15);">
        Sign Out
      </button>
    `;

    // Tenant switcher change listener


    // Logout listener
    const logoutBtn = this.headerNav.querySelector('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await api.logout();
          this.session = null;
          this.currentSlug = null;
          this.renderHeader();
          toast('Signed out successfully', 'info');
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
    window.scrollTo(0, 0);
    this.renderHeader();
    const hash = window.location.hash || '#/';

    // Public Help route
    if (hash === '#/help/esp32' || hash.startsWith('#/help')) {
      announce('Navigated to ESP32 connection guide');
      renderHelp(this.container, this);
      return;
    }

    // Public Auth routes
    if (hash === '#/login') {
      if (this.session) {
        this.navigate('#/');
        return;
      }
      announce('Navigated to login');
      renderLogin(this.container, this);
      return;
    }

    if (hash === '#/register') {
      if (this.session) {
        this.navigate('#/');
        return;
      }
      announce('Navigated to register');
      renderRegister(this.container, this);
      return;
    }

    // Protected routes require session
    if (!this.session) {
      this.navigate('#/login');
      return;
    }

    // Root route: redirect based on household membership (Section 3)
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
      announce('Navigated to create household wizard');
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

      // Home: #/t/:slug
      if (!subpath) {
        announce(`Navigated to ${slug} household home`);
        renderHome(this.container, slug, this);
        return;
      }

      // Add device: #/t/:slug/devices/new
      if (subpath === 'devices/new') {
        announce('Navigated to add device wizard');
        renderAddDevice(this.container, slug, this);
        return;
      }

      // Devices list: #/t/:slug/devices
      if (subpath === 'devices') {
        announce('Navigated to devices list');
        renderDevices(this.container, slug, this);
        return;
      }

      // Device detail: #/t/:slug/devices/:id
      const devDetailMatch = subpath.match(/^devices\/([^/]+)$/);
      if (devDetailMatch) {
        const deviceId = devDetailMatch[1];
        announce(`Navigated to device ${deviceId} configuration`);
        renderDeviceDetail(this.container, slug, deviceId, this);
        return;
      }

      // Members: #/t/:slug/members
      if (subpath === 'members') {
        announce('Navigated to household members');
        renderMembers(this.container, slug, this);
        return;
      }

      // Plan: #/t/:slug/plan
      if (subpath === 'plan') {
        announce('Navigated to plan & limits');
        renderPlan(this.container, slug, this);
        return;
      }
    }

    // Fallback: 404
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <h2>Page Not Found</h2>
        <p>The requested route does not exist.</p>
        <a href="#/" class="btn btn-primary" style="margin-top: var(--space-lg);">Go to Home</a>
      </div>
    `;
  }
}

export function initRouter(appContainer, headerNavContainer) {
  const router = new Router(appContainer, headerNavContainer);
  router.init();
  return router;
}
