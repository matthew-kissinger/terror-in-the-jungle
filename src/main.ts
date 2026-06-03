// Fonts - self-hosted via fontsource (woff2, latin subset only)
// Field Journal faces: Special Elite (stamp), Courier Prime (body), Caveat (hand).
import '@fontsource/special-elite/latin-400.css';
import '@fontsource/courier-prime/latin-400.css';
import '@fontsource/courier-prime/latin-700.css';
import '@fontsource/courier-prime/latin-400-italic.css';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/caveat/latin-600.css';
import '@fontsource/caveat/latin-700.css';

// UI Engine theme - CSS custom properties available globally before any UI creates
import './ui/engine/theme.css';

import { bootstrapGame } from './core/bootstrap';
import { Logger } from './utils/Logger';

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

registerServiceWorker();

bootstrapGame().catch((err) => {
  Logger.error('bootstrap', 'Bootstrap entry failed', err);
});
