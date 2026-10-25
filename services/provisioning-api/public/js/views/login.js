// ---------------------------------------------------------------------------
// The-SIFT Cloud Portal — Login View (#/login) with Email OTP 2FA
// ---------------------------------------------------------------------------

import { api } from '../api.js';
import { toast } from '../ui.js';

const eyeOpenSvg = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
`;

const eyeOffSvg = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
`;

const brandGlyphSvg = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
`;

const shieldSvg = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
`;

export function renderLogin(container, router) {
  let otpToken = null;
  let maskedEmail = '';

  function renderCredentialsStep() {
    container.innerHTML = `
      <div class="auth-container">
        <div class="card auth-card">
          <div style="margin-bottom: var(--space-xl); text-align: center;">
            <div class="brand-glyph" style="width: 44px; height: 44px; margin: 0 auto var(--space-md) auto; border-radius: var(--radius-md);">
              ${brandGlyphSvg}
            </div>
            <h1 style="font-size: 1.35rem; margin-bottom: 4px;">Sign in to The-SIFT</h1>
            <p style="color: var(--text-secondary); font-size: 0.8125rem; margin-bottom: 0;">
              Precision Hardware-Cloud &amp; Household IoT Plane
            </p>
          </div>

          <div id="login-error" class="banner banner-danger" style="display: none;"></div>

          <form id="login-form">
            <div class="form-group">
              <label for="login-email">Operator Email</label>
              <input type="email" id="login-email" required autocomplete="email" placeholder="operator@company.io">
            </div>

            <div class="form-group">
              <label for="login-password">Password</label>
              <div class="password-wrapper">
                <input type="password" id="login-password" required autocomplete="current-password" placeholder="••••••••••••">
                <button type="button" class="password-toggle-btn" id="toggle-login-pass" aria-label="Show password" title="Show password">
                  ${eyeOpenSvg}
                </button>
              </div>
            </div>

            <button type="submit" id="login-btn" class="btn btn-primary btn-full" style="margin-top: var(--space-md); padding: 0.7rem;">
              Continue to Cloud Workspace
            </button>
          </form>

          <div class="auth-footer">
            New to The-SIFT? <a href="#/register" class="inline-link" style="font-weight: 600;">Create an operator account</a>
          </div>
        </div>
      </div>
    `;

    const form = container.querySelector('#login-form');
    const btn = container.querySelector('#login-btn');
    const errorBanner = container.querySelector('#login-error');
    const emailInput = container.querySelector('#login-email');
    const passwordInput = container.querySelector('#login-password');
    const togglePassBtn = container.querySelector('#toggle-login-pass');

    togglePassBtn?.addEventListener('click', () => {
      const isPass = passwordInput.type === 'password';
      passwordInput.type = isPass ? 'text' : 'password';
      togglePassBtn.innerHTML = isPass ? eyeOffSvg : eyeOpenSvg;
      togglePassBtn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
      togglePassBtn.setAttribute('title', isPass ? 'Hide password' : 'Show password');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Authenticating...';

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      try {
        const res = await api.login(email, password);

        if (res.otpRequired) {
          otpToken = res.otpToken;
          maskedEmail = res.email || email;
          toast('Verification code dispatched to your email', 'info');
          renderOtpStep();
        } else {
          toast('Authenticated with The-SIFT Cloud', 'success');
          await router.refreshSession();
          router.navigate('#/');
        }
      } catch (err) {
        errorBanner.textContent = err.message || 'Authentication failed. Verify your credentials.';
        errorBanner.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Continue to Cloud Workspace';
      }
    });
  }

  function renderOtpStep() {
    container.innerHTML = `
      <div class="auth-container">
        <div class="card auth-card">
          <div style="margin-bottom: var(--space-xl); text-align: center;">
            <div class="brand-glyph" style="width: 44px; height: 44px; margin: 0 auto var(--space-md) auto; border-radius: var(--radius-md);">
              ${shieldSvg}
            </div>
            <h1 style="font-size: 1.35rem; margin-bottom: 4px;">Two-Factor Verification</h1>
            <p style="color: var(--text-secondary); font-size: 0.8125rem; margin-bottom: 0;">
              Enter the 6-digit security code sent to <strong class="mono" style="color: var(--text-main);">${maskedEmail}</strong>
            </p>
          </div>

          <div id="otp-error" class="banner banner-danger" style="display: none;"></div>
          <div id="otp-success" class="banner banner-success" style="display: none;"></div>

          <form id="otp-form">
            <div class="form-group">
              <label for="otp-digit-1" style="text-align: center;">One-Time Security Code</label>
              <div style="display: flex; justify-content: center; gap: 6px; margin: var(--space-md) 0; align-items: center;">
                <input type="text" id="otp-digit-1" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]" autocomplete="one-time-code" autofocus>
                <input type="text" id="otp-digit-2" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
                <input type="text" id="otp-digit-3" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
                <span style="color: var(--text-dim); font-family: var(--font-mono);">-</span>
                <input type="text" id="otp-digit-4" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
                <input type="text" id="otp-digit-5" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
                <input type="text" id="otp-digit-6" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
              </div>
              <input type="hidden" id="otp-code" value="">
            </div>

            <button type="submit" id="otp-btn" class="btn btn-primary btn-full" style="padding: 0.7rem;" disabled>
              Verify &amp; Launch Session
            </button>
          </form>

          <div style="text-align: center; margin-top: var(--space-lg);">
            <button type="button" id="resend-otp-btn" class="btn btn-ghost btn-sm" style="font-size: 0.78125rem;">
              Resend verification code
            </button>
          </div>

          <div class="auth-footer">
            <a href="#/login" id="back-to-login" class="inline-link" style="font-size: 0.8125rem;">Back to operator credentials</a>
          </div>
        </div>
      </div>
    `;

    const form = container.querySelector('#otp-form');
    const btn = container.querySelector('#otp-btn');
    const errorBanner = container.querySelector('#otp-error');
    const successBanner = container.querySelector('#otp-success');
    const resendBtn = container.querySelector('#resend-otp-btn');
    const hiddenInput = container.querySelector('#otp-code');
    const digits = Array.from({ length: 6 }, (_, i) => container.querySelector(`#otp-digit-${i + 1}`));

    container.querySelector('#back-to-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      otpToken = null;
      renderCredentialsStep();
    });

    digits.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val.slice(0, 1);

        if (val && index < 5) {
          digits[index + 1].focus();
        }

        const code = digits.map(d => d.value).join('');
        hiddenInput.value = code;
        btn.disabled = code.length !== 6;

        if (code.length === 6) {
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          digits[index - 1].focus();
          digits[index - 1].value = '';
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        for (let i = 0; i < 6; i++) {
          digits[i].value = pasted[i] || '';
        }
        const code = digits.map(d => d.value).join('');
        hiddenInput.value = code;
        btn.disabled = code.length !== 6;
        if (pasted.length >= 6) {
          digits[5].focus();
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        } else if (pasted.length > 0) {
          digits[Math.min(pasted.length, 5)].focus();
        }
      });
    });

    digits[0]?.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBanner.style.display = 'none';
      successBanner.style.display = 'none';

      const code = hiddenInput.value.trim();
      if (code.length !== 6) return;

      btn.disabled = true;
      btn.textContent = 'Verifying code...';

      try {
        const res = await api.verifyOtp(otpToken, code);
        toast(`Authenticated as ${res.account.displayName}`, 'success');
        await router.refreshSession();
        router.navigate('#/');
      } catch (err) {
        errorBanner.textContent = err.message || 'Invalid verification code.';
        errorBanner.style.display = 'block';
        digits.forEach(d => { d.value = ''; });
        hiddenInput.value = '';
        digits[0].focus();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify & Launch Session';
      }
    });

    resendBtn.addEventListener('click', async () => {
      resendBtn.disabled = true;
      resendBtn.textContent = 'Dispatching code...';
      errorBanner.style.display = 'none';

      try {
        const res = await api.resendOtp(otpToken);
        successBanner.textContent = res.message || 'New verification code dispatched.';
        successBanner.style.display = 'block';
        toast('New verification code sent', 'success');
        digits.forEach(d => { d.value = ''; });
        hiddenInput.value = '';
        btn.disabled = true;
        digits[0].focus();
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to resend code.';
        errorBanner.style.display = 'block';
      } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend verification code';
      }
    });
  }

  renderCredentialsStep();
}
