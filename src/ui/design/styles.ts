/**
 * Shared style utilities - glass panels, touch-safe, button variants,
 * media helpers, and shared keyframe animations.
 */

import { colors, fontStack, borderRadius, zIndex } from './tokens';

/** Glass morphism background mixin */
export function glassPanel(opacity = 0.4): string {
  return `
    background: rgba(20, 35, 50, ${opacity});
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid ${colors.glassBorder};
    border-radius: ${borderRadius.xl};
  `;
}

/** HUD-style glass (darker, thinner) */
export function hudGlass(): string {
  return `
    background: ${colors.hudGlass};
    backdrop-filter: blur(6px) saturate(1.1);
    -webkit-backdrop-filter: blur(6px) saturate(1.1);
    border: 1px solid ${colors.hudBorder};
    border-radius: ${borderRadius.md};
  `;
}

/** Touch-safe interaction styles */
export function touchSafe(minHeight = '44px'): string {
  return `
    min-height: ${minHeight};
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    -webkit-user-select: none;
  `;
}

/** Button style variants */
export function buttonStyle(variant: 'primary' | 'secondary' | 'ghost' = 'primary'): string {
  const base = `
    padding: 0.75rem 2rem;
    font-family: ${fontStack.ui};
    font-weight: 400;
    border-radius: ${borderRadius.pill};
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    ${touchSafe()}
  `;

  switch (variant) {
    case 'primary':
      return `${base}
        background: linear-gradient(135deg, ${colors.secondary}, ${colors.primary});
        color: white;
        border: 1px solid ${colors.glassBorderBright};
        font-weight: 500;
      `;
    case 'secondary':
      return `${base}
        background: ${colors.buttonBg};
        color: ${colors.textPrimary};
        border: 1px solid ${colors.glassBorder};
      `;
    case 'ghost':
      return `${base}
        background: rgba(255, 255, 255, 0.05);
        color: ${colors.textPrimary};
        border: 1px solid rgba(255, 255, 255, 0.1);
      `;
  }
}

/** Media query helper */
export function media(maxWidth: number, styles: string): string {
  return `@media (max-width: ${maxWidth}px) { ${styles} }`;
}

/** Shared keyframe animations */
export const sharedAnimations = `
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
