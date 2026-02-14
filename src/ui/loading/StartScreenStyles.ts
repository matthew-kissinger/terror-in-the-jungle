/**
 * Start screen styles - all visual styling for the start/menu screen.
 * Uses design tokens for consistency.
 */

import { colors, zIndex, borderRadius, fontStack, breakpoints } from '../design/tokens';

export function getStartScreenStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap');

    #loading-screen {
      position: fixed;
      inset: 0;
      background-image: url('./assets/background.png');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: ${zIndex.loadingScreen};
      font-family: 'Rajdhani', ${fontStack.ui};
      color: ${colors.textPrimary};
      transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: auto;
      padding: 1rem;
    }

    #loading-screen::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(10, 20, 30, 0.15) 0%, rgba(5, 10, 18, 0.7) 100%);
      pointer-events: none;
    }

    #loading-screen.hidden {
      opacity: 0;
      pointer-events: none;
    }

    /* ---- Main content card ---- */
    .loading-content {
      text-align: center;
      max-width: 90%;
      width: 720px;
      max-height: 92vh;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 2rem 2.5rem;
      background: rgba(8, 16, 24, 0.55);
      backdrop-filter: blur(16px) saturate(1.2);
      -webkit-backdrop-filter: blur(16px) saturate(1.2);
      border-radius: ${borderRadius.xl};
      border: 1px solid rgba(127, 180, 217, 0.12);
      box-shadow:
        0 24px 48px rgba(0, 0, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .loading-content::-webkit-scrollbar { width: 6px; }
    .loading-content::-webkit-scrollbar-track { background: transparent; }
    .loading-content::-webkit-scrollbar-thumb {
      background: rgba(127, 180, 217, 0.25);
      border-radius: 3px;
    }

    /* ---- Title ---- */
    .game-title {
      font-family: 'Rajdhani', ${fontStack.ui};
      font-size: clamp(1.6rem, 5vw, 2.8rem);
      font-weight: 700;
      color: ${colors.textPrimary};
      text-shadow:
        0 0 40px rgba(127, 180, 217, 0.3),
        0 2px 0 rgba(0, 0, 0, 0.3);
      margin: 0;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      line-height: 1.1;
      animation: ss-fadeInUp 0.8s ease-out;
    }

    .subtitle {
      font-size: clamp(0.7rem, 1.4vw, 0.9rem);
      color: ${colors.textSecondary};
      margin: 0;
      font-weight: 500;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      opacity: 0.6;
      animation: ss-fadeInUp 0.8s ease-out 0.15s backwards;
    }

    /* ---- Loading progress ---- */
    .loading-section {
      position: relative;
    }

    .loading-bar {
      width: 100%;
      height: 3px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 2px;
      overflow: hidden;
      position: relative;
      margin: 0.5rem 0;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, ${colors.secondary}, ${colors.primary}, ${colors.accent});
      background-size: 200% 100%;
      animation: ss-shimmer 3s ease-in-out infinite;
      transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 2px;
      box-shadow: 0 0 12px ${colors.primary};
    }

    .percent-text {
      position: absolute;
      top: -22px;
      right: 0;
      font-size: 0.8rem;
      font-weight: 500;
      color: ${colors.textSecondary};
      letter-spacing: 0.05em;
      font-variant-numeric: tabular-nums;
    }

    .phase-text {
      font-size: 0.8rem;
      color: ${colors.textSecondary};
      margin: 0.5rem 0;
      height: 20px;
      opacity: 0.6;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 500;
    }

    /* ---- Tips ---- */
    .tip-container {
      margin: 0;
      padding: 0.6rem 0.8rem;
      background: rgba(255, 255, 255, 0.03);
      border-left: 2px solid rgba(127, 180, 217, 0.4);
      border-radius: 0 ${borderRadius.sm} ${borderRadius.sm} 0;
    }

    .tip-label {
      font-size: 0.65rem;
      color: ${colors.primary};
      margin-bottom: 0.15rem;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      font-weight: 600;
    }

    .tip-text {
      font-size: 0.8rem;
      color: ${colors.textSecondary};
      line-height: 1.5;
      animation: ss-fadeIn 0.5s ease-in;
    }

    /* ---- Mode selection ---- */
    .mode-selection-container {
      display: none;
      margin: 0.5rem 0;
      animation: ss-fadeInUp 0.5s ease-out 0.2s backwards;
    }

    .mode-selection-container.visible {
      display: block;
    }

    .mode-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    /* ---- Mode card ---- */
    .mode-card {
      background: rgba(12, 22, 32, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: ${borderRadius.lg};
      padding: 0.9rem 1rem;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      min-height: 44px;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      position: relative;
      overflow: hidden;
      text-align: left;
    }

    .mode-card::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      opacity: 0;
      transition: opacity 0.25s;
      pointer-events: none;
    }

    .mode-card:hover {
      border-color: rgba(127, 180, 217, 0.3);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    .mode-card:hover::after {
      opacity: 1;
      background: linear-gradient(135deg, rgba(127, 180, 217, 0.04), transparent);
    }

    .mode-card.selected {
      border-color: ${colors.primary};
      background: rgba(127, 180, 217, 0.08);
      box-shadow:
        0 0 0 1px rgba(127, 180, 217, 0.15),
        0 4px 16px rgba(127, 180, 217, 0.1);
    }

    .mode-card.selected .mode-card-indicator {
      opacity: 1;
    }

    .mode-card-header {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .mode-card-title {
      color: ${colors.primary};
      font-size: 1.05rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      line-height: 1.2;
    }

    .mode-card-subtitle {
      color: ${colors.textSecondary};
      font-size: 0.6rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      opacity: 0.5;
      font-weight: 500;
    }

    .mode-card-description {
      color: ${colors.textSecondary};
      font-size: 0.75rem;
      line-height: 1.4;
      margin-bottom: 0.5rem;
      opacity: 0.8;
    }

    .mode-card-features {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .mode-feature {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 0.1rem 0.45rem;
      border-radius: 3px;
      font-size: 0.6rem;
      color: ${colors.textSecondary};
      letter-spacing: 0.04em;
      font-weight: 500;
      text-transform: uppercase;
    }

    .mode-card-indicator {
      position: absolute;
      top: 0.6rem;
      right: 0.6rem;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${colors.primary};
      opacity: 0;
      transition: opacity 0.2s;
      box-shadow: 0 0 8px ${colors.primary};
    }

    /* TDM variant */
    .mode-card.team-deathmatch-card .mode-card-title { color: ${colors.tdmAccent}; }
    .mode-card.team-deathmatch-card.selected {
      border-color: ${colors.tdmAccent};
      background: rgba(232, 90, 90, 0.06);
      box-shadow:
        0 0 0 1px rgba(232, 90, 90, 0.12),
        0 4px 16px rgba(232, 90, 90, 0.08);
    }
    .mode-card.team-deathmatch-card .mode-feature {
      border-color: rgba(232, 90, 90, 0.15);
    }

    .selected-mode-display {
      text-align: center;
      color: ${colors.textSecondary};
      font-size: 0.75rem;
      margin-top: 0.25rem;
      letter-spacing: 0.06em;
      opacity: 0.5;
    }

    .selected-mode-display strong {
      color: ${colors.primary};
      font-weight: 600;
    }

    /* ---- Menu buttons ---- */
    .menu-buttons {
      display: none;
      flex-direction: column;
      gap: 0.6rem;
      margin: 0;
      align-items: center;
      animation: ss-fadeInUp 0.5s ease-out 0.3s backwards;
    }

    .menu-buttons.visible {
      display: flex;
    }

    .menu-button {
      padding: 0.7rem 2rem;
      font-size: 0.85rem;
      font-weight: 600;
      font-family: 'Rajdhani', ${fontStack.ui};
      background: rgba(255, 255, 255, 0.04);
      color: ${colors.textPrimary};
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: ${borderRadius.pill};
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      min-width: 220px;
      min-height: 44px;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      position: relative;
      overflow: hidden;
    }

    .menu-button:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(127, 180, 217, 0.3);
      transform: translateY(-1px);
    }

    .menu-button:active {
      transform: translateY(0);
    }

    .play-button {
      font-size: 1rem;
      padding: 0.85rem 2.5rem;
      min-height: 48px;
      background: linear-gradient(135deg, ${colors.secondary}, ${colors.primary});
      border: 1px solid rgba(127, 180, 217, 0.3);
      color: white;
      font-weight: 700;
      letter-spacing: 0.14em;
      box-shadow: 0 4px 20px rgba(90, 143, 181, 0.25);
    }

    .play-button:hover {
      box-shadow: 0 6px 28px rgba(90, 143, 181, 0.35);
      transform: translateY(-2px);
      border-color: rgba(127, 180, 217, 0.5);
    }

    .secondary-button {
      font-size: 0.8rem;
      padding: 0.6rem 1.5rem;
      min-height: 40px;
      min-width: 180px;
    }

    .button-row {
      display: flex;
      gap: 0.5rem;
      justify-content: center;
    }

    /* ---- Bottom stats ---- */
    .loading-stats {
      position: absolute;
      bottom: 0.75rem;
      left: 0.75rem;
      font-size: 0.65rem;
      color: ${colors.textSecondary};
      opacity: 0.2;
      font-variant-numeric: tabular-nums;
    }

    /* ---- Landscape prompt ---- */
    .landscape-orientation-prompt {
      position: absolute;
      inset: 0;
      z-index: 9;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .landscape-orientation-card {
      pointer-events: auto;
      width: min(92vw, 340px);
      background: rgba(8, 16, 24, 0.94);
      border: 1px solid rgba(127, 180, 217, 0.3);
      border-radius: ${borderRadius.lg};
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
      padding: 1rem;
      text-align: center;
      color: ${colors.textPrimary};
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .landscape-orientation-icon {
      font-size: 1.2rem;
      line-height: 1;
      color: ${colors.primary};
      margin-bottom: 0.3rem;
    }

    .landscape-orientation-text {
      font-size: 0.8rem;
      letter-spacing: 0.04em;
      margin-bottom: 0.5rem;
      opacity: 0.8;
    }

    .landscape-orientation-dismiss {
      appearance: none;
      border: 1px solid rgba(127, 180, 217, 0.3);
      background: rgba(127, 180, 217, 0.1);
      color: ${colors.primary};
      border-radius: ${borderRadius.pill};
      min-height: 44px;
      padding: 0.3rem 0.8rem;
      cursor: pointer;
      touch-action: manipulation;
      font: inherit;
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 600;
    }

    @media (orientation: portrait) and (max-width: ${breakpoints.tablet}px) {
      .landscape-orientation-prompt.visible {
        display: flex;
      }
    }

    /* ---- Error panel ---- */
    .error-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(12, 18, 28, 0.96);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 80, 80, 0.4);
      border-radius: ${borderRadius.xl};
      padding: 1.5rem 2rem;
      max-width: 460px;
      width: 90%;
      z-index: ${zIndex.modalOverlay};
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      animation: ss-errorIn 0.3s ease-out;
    }

    @keyframes ss-errorIn {
      from {
        opacity: 0;
        transform: translate(-50%, -48%);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%);
      }
    }

    .error-panel-title {
      color: ${colors.opforLight};
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      text-align: center;
    }

    .error-panel-message {
      color: ${colors.textSecondary};
      font-size: 0.85rem;
      line-height: 1.6;
      margin-bottom: 1.25rem;
      text-align: center;
    }

    .error-panel-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .error-panel-button {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(127, 180, 217, 0.3);
      color: ${colors.primary};
      padding: 0.6rem 1.25rem;
      border-radius: ${borderRadius.pill};
      cursor: pointer;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      transition: all 0.2s;
      min-height: 40px;
      touch-action: manipulation;
    }

    .error-panel-button:hover {
      background: rgba(127, 180, 217, 0.12);
      transform: translateY(-1px);
    }

    .error-panel-button.primary {
      border-color: rgba(255, 80, 80, 0.4);
      color: ${colors.opforLight};
    }

    .error-panel-button.primary:hover {
      background: rgba(255, 80, 80, 0.12);
    }

    /* ---- Animations ---- */
    @keyframes ss-fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes ss-fadeInUp {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes ss-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    @keyframes ss-fadeOut {
      to {
        opacity: 0;
        transform: scale(1.03);
      }
    }

    /* ---- Responsive ---- */
    @media (max-width: ${breakpoints.tablet}px) {
      .loading-content {
        padding: 1.25rem 1rem;
        width: 95%;
        max-width: 95%;
      }

      .mode-cards {
        grid-template-columns: 1fr;
        gap: 0.5rem;
      }

      .mode-card {
        padding: 0.7rem 0.8rem;
      }

      .menu-button {
        min-width: 180px;
        padding: 0.6rem 1.25rem;
        font-size: 0.78rem;
      }

      .play-button {
        font-size: 0.9rem;
        padding: 0.7rem 1.5rem;
      }

      .button-row {
        flex-direction: column;
        align-items: center;
      }
    }

    @media (max-width: ${breakpoints.phone}px) {
      .loading-content {
        padding: 0.75rem;
      }

      .game-title {
        letter-spacing: 0.1em;
      }

      .mode-card-description {
        display: none;
      }
    }

    @media (min-width: 1200px) {
      .loading-content {
        max-width: 780px;
      }
    }
  `;
}
