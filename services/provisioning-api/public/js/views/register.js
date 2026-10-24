// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Register View (#/register)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast } from '../ui.js';

export function renderRegister(container, router) {
  container.innerHTML = `
    <div style="max-width: 460px; margin: 2rem auto;">
      <div class="card">
        <h1 style="text-align: center; margin-bottom: 0.5rem;">Create an Account</h1>
        <p style="text-align: center; margin-bottom: 1rem;">Set up your SIFT platform credentials</p>

        <div class="banner banner-info" style="margin-bottom: 1.25rem;">
          <span>ℹ️ <strong>Student Project:</strong> Do not reuse a real or sensitive password. Plain HTTP local demonstration.</span>
        </div>

        <div id="register-error" class="banner banner-danger" style="display: none;"></div>

        <form id="register-form">
          <div class="form-group">
            <label for="reg-name">Display Name</label>
            <input type="text" id="reg-name" required placeholder="Alex Smith" maxlength="60">
          </div>

          <div class="form-group">
            <label for="reg-email">Email Address</label>
            <input type="email" id="reg-email" required placeholder="alex@example.com">
          </div>

          <div class="form-group">
            <label for="reg-password">Password (min 8 characters)</label>
            <input type="password" id="reg-password" required minlength="8" maxlength="128" placeholder="••••••••">
          </div>

          <div class="form-group">
            <label for="reg-confirm">Confirm Password</label>
            <input type="password" id="reg-confirm" required minlength="8" maxlength="128" placeholder="••••••••">
          </div>

          <button type="submit" id="reg-btn" class="btn btn-primary btn-full">
            Register & Continue
          </button>
        </form>

        <div style="text-align: center; margin-top: 1.25rem; font-size: 0.85rem; color: var(--text-muted);">
          Already have an account? <a href="#/login" style="color: var(--primary);">Sign in</a>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#register-form');
  const btn = container.querySelector('#reg-btn');
  const errorBanner = container.querySelector('#register-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBanner.style.display = 'none';

    const name = container.querySelector('#reg-name').value.trim();
    const email = container.querySelector('#reg-email').value.trim();
    const password = container.querySelector('#reg-password').value;
    const confirm = container.querySelector('#reg-confirm').value;

    if (password !== confirm) {
      errorBanner.textContent = 'Passwords do not match.';
      errorBanner.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      await api.register(email, name, password);
      // Log in immediately to establish session
      await api.login(email, password);
      toast('Account registered successfully!', 'success');
      await router.refreshSession();
      router.navigate('#/create-household');
    } catch (err) {
      errorBanner.textContent = err.message || 'Registration failed.';
      errorBanner.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Register & Continue';
    }
  });
}
