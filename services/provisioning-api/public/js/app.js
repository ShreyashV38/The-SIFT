// ---------------------------------------------------------------------------
// The SIFT Tenant Portal — SPA Application Bootstrap (Phase 6C)
// ---------------------------------------------------------------------------
// Compliant with CSP script-src 'self' (no inline scripts)

import { initRouter } from './router.js';

function bootstrap() {
  const appContainer = document.getElementById('app');
  const headerNav = document.getElementById('header-nav');
  if (appContainer && headerNav) {
    initRouter(appContainer, headerNav);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
