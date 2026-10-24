// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Login View (#/login)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast } from '../ui.js';

export function renderLogin(container, router) {
  container.innerHTML = `
    <div style="max-width: 420px; margin: 3rem auto;">
      <div class="card">
        <h1 style="text-align: center; margin-bottom: 0.5rem;">Welcome to SIFT</h1>
        <p style="text-align: center; margin-bottom: 1.5rem;">Sign in to your smart home portal</p>

        <div id="login-error" class="banner banner-danger" style="display: none;"></div>

        <form id="login-form">
          <div class="form-group">
            <label for="login-email">Email Address</label>
            <input type="email" id="login-email" required autocomplete="email" placeholder="name@example.com">
          </div>

          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" required autocomplete="current-password" placeholder="••••••••">
          </div>

          <button type="submit" id="login-btn" class="btn btn-primary btn-full">
            Sign In
          </button>
        </form>

        <div style="text-align: center; margin-top: 1.25rem; font-size: 0.85rem; color: var(--text-muted);">
          Don't have an account? <a href="#/register" style="color: var(--primary);">Register here</a>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const btn = container.querySelector('#login-btn');
  const errorBanner = container.querySelector('#login-error');
  const emailInput = container.querySelector('#login-email');
  const passwordInput = container.querySelector('#login-password');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBanner.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      const res = await api.login(email, password);
      toast(`Welcome back, ${res.account.displayName}!`, 'success');
      await router.refreshSession();
      router.navigate('#/');
    } catch (err) {
      errorBanner.textContent = err.message || 'Login failed. Please check your credentials.';
      errorBanner.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}
