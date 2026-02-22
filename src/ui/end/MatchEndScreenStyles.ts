/**
 * CSS styles for the Match End Screen
 * Uses design tokens for consistent theming.
 */

import { colors, zIndex, fontStack } from '../design/tokens';

export const MATCH_END_SCREEN_STYLES = `
  .match-end-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Use flex-start + auto margins instead of justify-content: center
       so the container scrolls when content exceeds viewport height */
    justify-content: flex-start;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    z-index: ${zIndex.modal};
    color: ${colors.textPrimary};
    font-family: ${fontStack.hud};
    animation: fadeIn 0.5s ease-out;
    box-sizing: border-box;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .match-end-screen.victory {
    background: rgba(8, 18, 12, 0.9);
  }

  .match-end-screen.defeat {
    background: rgba(18, 8, 8, 0.9);
  }

  .end-screen-header {
    text-align: center;
    margin-top: auto;
    margin-bottom: 2rem;
    animation: slideDown 0.6s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .end-screen-title {
    font-size: 4rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin-bottom: 0.5rem;
    text-shadow: 0 0 20px currentColor;
  }

  .victory .end-screen-title {
    color: ${colors.success};
  }

  .defeat .end-screen-title {
    color: ${colors.danger};
  }

  .end-screen-subtitle {
    font-size: 1.5rem;
    opacity: 0.8;
    letter-spacing: 0.1em;
  }

  .stats-panel {
    background: ${colors.glassBgDense};
    border: 1px solid ${colors.glassBorderBright};
    border-radius: 12px;
    padding: 2rem;
    width: 90%;
    max-width: 800px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    animation: fadeInUp 0.8s ease-out 0.2s backwards;
    flex-shrink: 0;
  }

  /* Responsive Adjustments */
  @media (max-width: 768px) {
    .match-end-screen {
      padding: 1rem env(safe-area-inset-right, 0px) 1rem env(safe-area-inset-left, 0px);
    }

    .end-screen-header {
      margin-bottom: 1rem;
    }

    .end-screen-title {
      font-size: 2.5rem;
      letter-spacing: 0.1em;
    }

    .end-screen-subtitle {
      font-size: 1.2rem;
    }

    .stats-panel {
      grid-template-columns: 1fr;
      padding: 1.5rem;
      gap: 1.5rem;
    }

    .stats-column {
      gap: 1rem;
    }

    .faction-tickets {
      font-size: 1.5rem;
    }

    .ticket-comparison {
      padding: 0.5rem;
      gap: 0.5rem;
    }

    .vs-divider {
      font-size: 1rem;
    }

    .end-screen-actions {
      flex-direction: column;
      width: 90%;
      max-width: 300px;
      margin-top: 1rem;
    }

    .end-screen-button {
      width: 100%;
      padding: 0.8rem 1.5rem;
    }
  }

  @media (max-width: 480px) {
    .match-end-screen {
      padding: 0.5rem env(safe-area-inset-right, 0px) 0.5rem env(safe-area-inset-left, 0px);
    }

    .end-screen-header {
      margin-bottom: 0.75rem;
    }

    .end-screen-title {
      font-size: 1.5rem;
      letter-spacing: 0.05em;
    }

    .end-screen-subtitle {
      font-size: 0.9rem;
    }

    .stats-panel {
      padding: 0.75rem;
      width: 95%;
      gap: 1rem;
    }

    .stats-section-title {
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .stat-row {
      font-size: 0.9rem;
    }

    .award-badge {
      padding: 0.8rem;
      min-width: 120px;
    }

    .award-name {
      font-size: 0.8rem;
    }

    .award-value {
      font-size: 1rem;
    }

    .awards-section {
      margin-top: 1rem;
    }

    .awards-title {
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
    }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .victory .stats-panel {
    border-color: ${colors.success};
  }

  .defeat .stats-panel {
    border-color: ${colors.danger};
  }

  .stats-column {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .stats-section {
    margin-bottom: 0.5rem;
  }

  .stats-section-title {
    font-size: 1.1rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin-bottom: 0.75rem;
    color: ${colors.primary};
    border-bottom: 1px solid ${colors.glassBorderBright};
    padding-bottom: 0.5rem;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    padding: 0.3rem 0;
    font-size: 1.0rem;
  }

  .stat-label {
    opacity: 0.8;
  }

  .stat-value {
    font-weight: bold;
    color: ${colors.primary};
  }

  .stat-value.highlight {
    color: ${colors.success};
  }

  .ticket-comparison {
    display: flex;
    justify-content: space-around;
    margin: 1rem 0;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
  }

  .faction-score {
    text-align: center;
  }

  .faction-name {
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.7;
    margin-bottom: 0.5rem;
  }

  .faction-tickets {
    font-size: 2rem;
    font-weight: bold;
  }

  .faction-score.us .faction-tickets {
    color: ${colors.us};
  }

  .faction-score.opfor .faction-tickets {
    color: ${colors.opfor};
  }

  .vs-divider {
    display: flex;
    align-items: center;
    font-size: 1.5rem;
    opacity: 0.5;
  }

  .end-screen-actions {
    margin-top: 2rem;
    margin-bottom: auto;
    display: flex;
    gap: 1rem;
    animation: fadeInUp 1s ease-out 0.4s backwards;
    flex-shrink: 0;
    padding-bottom: 1rem;
  }

  .end-screen-button {
    background: ${colors.buttonBg};
    border: 1px solid ${colors.glassBorderBright};
    color: ${colors.textPrimary};
    padding: 1rem 2rem;
    font-size: 1.1rem;
    font-family: ${fontStack.hud};
    text-transform: uppercase;
    letter-spacing: 0.1em;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.3s ease;
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
    min-height: 48px;
  }

  .end-screen-button:hover {
    background: ${colors.buttonHover};
    border-color: ${colors.primary};
    transform: translateY(-2px);
    box-shadow: 0 5px 15px ${colors.glassBorder};
  }

  .end-screen-button.primary {
    background: ${colors.buttonHover};
    border-color: ${colors.primary};
  }

  .end-screen-button.primary:hover {
    background: ${colors.secondary};
  }

  .end-screen-button:active {
    transform: scale(0.96);
    transition: transform 0.1s ease;
  }

  .awards-section {
    margin-top: 2rem;
    animation: fadeInUp 1s ease-out 0.6s backwards;
  }

  .awards-title {
    text-align: center;
    font-size: 1.5rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin-bottom: 1rem;
    color: ${colors.primary};
  }

  .awards-container {
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .award-badge {
    background: ${colors.glassBg};
    border: 1px solid ${colors.glassBorderBright};
    border-radius: 8px;
    padding: 1rem 1.5rem;
    min-width: 150px;
    text-align: center;
    transition: all 0.3s ease;
  }

  .victory .award-badge {
    border-color: ${colors.success};
  }

  .defeat .award-badge {
    border-color: ${colors.danger};
  }

  .award-badge:hover {
    transform: translateY(-3px);
    box-shadow: 0 5px 15px ${colors.glassBorder};
  }

  .victory .award-badge:hover {
    box-shadow: 0 5px 15px ${colors.success};
  }

  .defeat .award-badge:hover {
    box-shadow: 0 5px 15px ${colors.danger};
  }

  .award-name {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.5rem;
    color: ${colors.textPrimary};
    font-weight: bold;
  }

  .award-value {
    font-size: 1.2rem;
    color: ${colors.primary};
    font-weight: bold;
  }

  .victory .award-value {
    color: ${colors.success};
  }

  .defeat .award-value {
    color: ${colors.danger};
  }
`;
