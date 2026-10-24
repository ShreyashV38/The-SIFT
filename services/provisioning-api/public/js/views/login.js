// ---------------------------------------------------------------------------
// SIFT Tenant Portal — Login View (#/login) with Email OTP 2FA
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

const lockSvg = `
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    <circle cx="12" cy="16" r="1"/>
  </svg>
`;

export function renderLogin(container, router) {
  // State for 2FA flow
  let otpToken = null;
  let maskedEmail = '';

  function renderCredentialsStep() {
    container.innerHTML = `
      <div class="auth-container">
        <div class="card auth-card">
          <div style="margin-bottom: var(--space-xl); text-align: center;">
            <div style="display: inline-block; padding: 4px; border-radius: var(--radius-md); background: var(--bg-surface-alt); border: 1px solid var(--border); box-shadow: var(--shadow-sm); margin-bottom: var(--space-md);">
              <img src="logo.jpg" alt="The SIFT Logo" style="width: 52px; height: 52px; object-fit: cover; border-radius: var(--radius-sm); display: block;">
            </div>
            <h1>Welcome to The SIFT</h1>
            <p style="color: var(--text-muted); font-size: 0.9rem;">Sign in to your smart home automation platform</p>
          </div>

          <div id="login-error" class="banner banner-danger" style="display: none;"></div>

          <form id="login-form">
            <div class="form-group">
              <label for="login-email">Account Email Address</label>
              <input type="email" id="login-email" required autocomplete="email" placeholder="name@example.com">
            </div>

            <div class="form-group">
              <label for="login-password">Password</label>
              <div class="password-wrapper">
                <input type="password" id="login-password" required autocomplete="current-password" placeholder="••••••••">
                <button type="button" class="password-toggle-btn" id="toggle-login-pass" aria-label="Show password" title="Show password">
                  ${eyeOpenSvg}
                </button>
              </div>
            </div>

            <button type="submit" id="login-btn" class="btn btn-primary btn-full" style="margin-top: var(--space-md); padding: 0.65rem;">
              Sign In to Household
            </button>
          </form>

          <div class="auth-footer">
            Don't have an account yet? <a href="#/register" class="inline-link">Register here</a>
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
      btn.textContent = 'Verifying credentials...';

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      try {
        const res = await api.login(email, password);

        if (res.otpRequired) {
          // Step 1 complete → show OTP step
          otpToken = res.otpToken;
          maskedEmail = res.email || email;
          toast('Verification code sent to your email', 'info');
          renderOtpStep();
        } else {
          // Fallback if server returns without OTP
          toast(`Welcome back!`, 'success');
          await router.refreshSession();
          router.navigate('#/');
        }
      } catch (err) {
        errorBanner.textContent = err.message || 'Login failed. Please check your credentials.';
        errorBanner.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In to Household';
      }
    });
  }

  function renderOtpStep() {
    container.innerHTML = `
      <div class="auth-container">
        <div class="card auth-card">
          <div style="margin-bottom: var(--space-xl); text-align: center;">
            <div style="width: 60px; height: 60px; border-radius: 50%; background: var(--accent-subtle); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-md) auto; border: 1px solid rgba(28, 114, 147, 0.2);">
              ${lockSvg}
            </div>
            <h1>Two-Factor Verification</h1>
            <p style="color: var(--text-muted); font-size: 0.9rem;">
              Enter the 6-digit authentication code sent to <strong style="color: var(--brand-teal);">${maskedEmail}</strong>
            </p>
          </div>

          <div id="otp-error" class="banner banner-danger" style="display: none;"></div>
          <div id="otp-success" class="banner banner-success" style="display: none;"></div>

          <form id="otp-form">
            <div class="form-group">
              <label for="otp-code" style="text-align: center;">Verification Code</label>
              <div style="display: flex; justify-content: center; gap: 8px; margin: var(--space-md) 0; align-items: center;">
                <input type="text" id="otp-digit-1" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]" autocomplete="one-time-code" autofocus>
                <input type="text" id="otp-digit-2" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
                <input type="text" id="otp-digit-3" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
                <span style="color: var(--text-dim); font-size: 20px; font-weight: bold;">–</span>
                <input type="text" id="otp-digit-4" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
                <input type="text" id="otp-digit-5" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
                <input type="text" id="otp-digit-6" maxlength="1" class="otp-digit-input" inputmode="numeric" pattern="[0-9]">
              </div>
              <!-- Hidden input for form submission -->
              <input type="hidden" id="otp-code" value="">
            </div>

            <button type="submit" id="otp-btn" class="btn btn-primary btn-full" style="padding: 0.65rem;" disabled>
              Verify Code & Sign In
            </button>
          </form>

          <div style="text-align: center; margin-top: var(--space-lg);">
            <p style="color: var(--text-muted); font-size: 0.8125rem; margin-bottom: 0.35rem;">
              Didn't receive the email?
            </p>
            <button type="button" id="resend-otp-btn" class="btn btn-ghost btn-sm" style="font-size: 0.8125rem; color: var(--brand-teal);">
              Resend New Code
            </button>
          </div>

          <div class="auth-footer" style="margin-top: var(--space-md);">
            <a href="#/login" id="back-to-login" class="inline-link" style="font-size: 0.85rem;">← Back to credentials</a>
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

    // Back to login link
    container.querySelector('#back-to-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      otpToken = null;
      renderCredentialsStep();
    });

    // OTP digit input auto-advance + paste support
    digits.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val.slice(0, 1);

        if (val && index < 5) {
          digits[index + 1].focus();
        }

        // Update hidden input
        const code = digits.map(d => d.value).join('');
        hiddenInput.value = code;
        btn.disabled = code.length !== 6;

        // Auto-submit when all 6 digits entered
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

      // Handle paste
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

    // Focus first digit
    digits[0]?.focus();

    // Form submit — verify OTP
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
        toast(`Welcome back, ${res.account.displayName}!`, 'success');
        await router.refreshSession();
        router.navigate('#/');
      } catch (err) {
        errorBanner.textContent = err.message || 'Invalid verification code.';
        errorBanner.style.display = 'block';
        // Clear digits on error
        digits.forEach(d => { d.value = ''; });
        hiddenInput.value = '';
        digits[0].focus();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify Code & Sign In';
      }
    });

    // Resend OTP
    resendBtn.addEventListener('click', async () => {
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending code...';
      errorBanner.style.display = 'none';

      try {
        const res = await api.resendOtp(otpToken);
        successBanner.textContent = res.message || 'New verification code dispatched!';
        successBanner.style.display = 'block';
        toast('New verification code sent', 'success');
        // Clear old digits
        digits.forEach(d => { d.value = ''; });
        hiddenInput.value = '';
        btn.disabled = true;
        digits[0].focus();
      } catch (err) {
        errorBanner.textContent = err.message || 'Failed to resend code. Please try signing in again.';
        errorBanner.style.display = 'block';
      } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend New Code';
      }
    });
  }

  // Start with credentials step
  renderCredentialsStep();
}
