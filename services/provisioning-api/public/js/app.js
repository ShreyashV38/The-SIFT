// ---------------------------------------------------------------------------
// The-SIFT Cloud Portal — SPA Application Bootstrap
// ---------------------------------------------------------------------------
// Compliant with CSP script-src 'self' (no inline scripts)

import { initRouter } from './router.js';
import { initTheme } from './ui.js';

function bootstrap() {
  initTheme();
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
