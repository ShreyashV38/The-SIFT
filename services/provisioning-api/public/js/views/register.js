// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Register View (#/register)
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast } from '../ui.js';

const eyeOpenSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
`;

const eyeOffSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
`;

export function renderRegister(container, router) {
  container.innerHTML = `
    <div class="auth-container">
      <div class="card auth-card">
        <div style="margin-bottom: var(--space-xl); text-align: center;">
          <div style="display: inline-block; padding: 4px; border-radius: var(--radius-md); background: var(--bg-surface-alt); border: 1px solid var(--border); box-shadow: var(--shadow-sm); margin-bottom: var(--space-md);">
            <img src="logo.jpg" alt="The SIFT Logo" style="width: 52px; height: 52px; object-fit: cover; border-radius: var(--radius-sm); display: block;">
          </div>
          <h1>Create an Account</h1>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Set up your SIFT platform credentials</p>
        </div>

        <div id="register-error" class="banner banner-danger" style="display: none;"></div>

        <form id="register-form">
          <div class="form-group">
            <label for="reg-name">Full Display Name</label>
            <input type="text" id="reg-name" required placeholder="Alex Smith" maxlength="60">
            <div class="form-hint">Displayed to your household members.</div>
          </div>

          <div class="form-group">
            <label for="reg-email">Email Address</label>
            <input type="email" id="reg-email" required placeholder="alex@example.com">
            <div class="form-hint">Used for login and 2FA verification codes.</div>
          </div>

          <div class="form-group">
            <label for="reg-password">Password (min 8 characters)</label>
            <div class="password-wrapper">
              <input type="password" id="reg-password" required minlength="8" maxlength="128" placeholder="••••••••">
              <button type="button" class="password-toggle-btn" id="toggle-reg-pass" aria-label="Show password" title="Show password">
                ${eyeOpenSvg}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label for="reg-confirm">Confirm Password</label>
            <div class="password-wrapper">
              <input type="password" id="reg-confirm" required minlength="8" maxlength="128" placeholder="••••••••">
              <button type="button" class="password-toggle-btn" id="toggle-reg-confirm" aria-label="Show password" title="Show password">
                ${eyeOpenSvg}
              </button>
            </div>
          </div>

          <button type="submit" id="reg-btn" class="btn btn-primary btn-full" style="margin-top: var(--space-md); padding: 0.65rem;">
            Create Account & Continue →
          </button>
        </form>

        <div class="auth-footer">
          Already have an account? <a href="#/login" class="inline-link">Sign in</a>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#register-form');
  const btn = container.querySelector('#reg-btn');
  const errorBanner = container.querySelector('#register-error');

  // Password visibility toggles
  const passInput = container.querySelector('#reg-password');
  const togglePassBtn = container.querySelector('#toggle-reg-pass');
  togglePassBtn?.addEventListener('click', () => {
    const isPass = passInput.type === 'password';
    passInput.type = isPass ? 'text' : 'password';
    togglePassBtn.innerHTML = isPass ? eyeOffSvg : eyeOpenSvg;
    togglePassBtn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
  });

  const confirmInput = container.querySelector('#reg-confirm');
  const toggleConfirmBtn = container.querySelector('#toggle-reg-confirm');
  toggleConfirmBtn?.addEventListener('click', () => {
    const isPass = confirmInput.type === 'password';
    confirmInput.type = isPass ? 'text' : 'password';
    toggleConfirmBtn.innerHTML = isPass ? eyeOffSvg : eyeOpenSvg;
    toggleConfirmBtn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBanner.style.display = 'none';

    const name = container.querySelector('#reg-name').value.trim();
    const email = container.querySelector('#reg-email').value.trim();
    const password = passInput.value;
    const confirm = confirmInput.value;

    if (password !== confirm) {
      errorBanner.textContent = 'Passwords do not match.';
      errorBanner.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      await api.register(email, name, password);
      toast('Account registered successfully! Please sign in.', 'success');
      // Redirect to login — 2FA OTP is mandatory, so user goes through login flow
      router.navigate('#/login');
    } catch (err) {
      errorBanner.textContent = err.message || 'Registration failed.';
      errorBanner.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account & Continue →';
    }
  });
}
