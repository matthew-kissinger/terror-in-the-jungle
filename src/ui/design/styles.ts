/**
 * Shared style utilities - glass panels, touch-safe, button variants,
 * media helpers, and shared keyframe animations.
 */

import { colors, fontStack, zIndex } from './tokens';

/** Shared keyframe animations */
const sharedAnimations = `
  @keyframes ds-fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes ds-fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes ds-fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes ds-pulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  @keyframes ds-pulseGlow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(255, 100, 100, 0.5);
      opacity: 1;
    }
    50% {
      box-shadow: 0 0 15px rgba(255, 100, 100, 0.9);
      opacity: 0.9;
    }
  }

  @keyframes ds-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes ds-gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
`;

/**
 * Inject shared CSS custom properties and keyframes onto :root.
 * Call once at bootstrap before any UI is created.
 */
export function injectSharedStyles(): void {
  if (document.getElementById('ds-shared-styles')) return;

  const style = document.createElement('style');
  style.id = 'ds-shared-styles';
  style.textContent = `
    :root {
      --ds-color-us: ${colors.us};
      --ds-color-opfor: ${colors.opfor};
      --ds-color-primary: ${colors.primary};
      --ds-color-secondary: ${colors.secondary};
      --ds-color-accent: ${colors.accent};
      --ds-color-text-primary: ${colors.textPrimary};
      --ds-color-text-secondary: ${colors.textSecondary};
      --ds-color-success: ${colors.success};
      --ds-color-warning: ${colors.warning};
      --ds-color-danger: ${colors.danger};
      --ds-glass-bg: ${colors.glassBg};
      --ds-glass-border: ${colors.glassBorder};
      --ds-hud-glass: ${colors.hudGlass};
      --ds-hud-border: ${colors.hudBorder};
      --ds-z-hud-base: ${zIndex.hudBase};
      --ds-z-touch-buttons: ${zIndex.touchButtons};
      --ds-z-modal: ${zIndex.modal};
      --ds-font-ui: ${fontStack.ui};
      --ds-font-mono: ${fontStack.mono};
    }

    ${sharedAnimations}
  `;

  document.head.appendChild(style);
}
