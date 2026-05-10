// Fonts - self-hosted via fontsource (woff2, latin subset only)
import '@fontsource/teko/latin-400.css';
import '@fontsource/teko/latin-500.css';
import '@fontsource/teko/latin-700.css';
import '@fontsource/rajdhani/latin-400.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource-variable/jetbrains-mono/wght.css';

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
