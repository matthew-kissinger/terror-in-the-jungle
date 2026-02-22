/**
 * Status display styles - tickets, combat stats, game status, timer, victory screen
 */
import { colors, zIndex, fontStack } from '../design/tokens';

export const HUDStatusStyles = `
  .ticket-display {
    position: absolute;
    top: calc(12px + env(safe-area-inset-top, 0px));
    left: 50%;
    transform: translateX(-50%);
    background: ${colors.hudGlass};
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 6px 20px;
    border: 1px solid ${colors.hudBorder};
    border-radius: 6px;
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .faction-tickets {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .faction-name {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    margin-bottom: 2px;
    letter-spacing: 1px;
    color: rgba(220, 225, 230, 0.5);
  }

  .ticket-count {
    font-size: 24px;
    font-weight: 700;
    font-family: ${fontStack.hud};
  }

  .us-tickets { color: ${colors.us}; }
  .opfor-tickets { color: ${colors.opfor}; }

  .ticket-separator {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.2);
    font-weight: 300;
  }

  /* Combat stats - hidden to reduce clutter, info available in scoreboard */
  .combat-stats {
    display: none;
  }

  .stat-line {
    margin: 2px 0;
  }

  .game-status {
    position: absolute;
    top: calc(58px + env(safe-area-inset-top, 0px));
    left: max(var(--hud-edge-inset, 16px), env(safe-area-inset-left, 0px));
    background: ${colors.hudGlass};
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    padding: 4px 10px;
    border: 1px solid ${colors.hudBorder};
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .phase-setup { border-color: rgba(212, 163, 68, 0.3); color: ${colors.warning}; }
  .phase-combat { border-color: rgba(201, 86, 74, 0.3); color: ${colors.opfor}; }
  .phase-overtime { border-color: rgba(184, 58, 94, 0.3); color: ${colors.critical}; animation: pulse 0.5s infinite; }
  .phase-ended { border-color: rgba(92, 184, 92, 0.3); color: ${colors.success}; }

  .time-remaining {
    font-size: 11px;
    margin-top: 4px;
    opacity: 0.6;
  }

  .bleed-indicator {
    font-size: 10px;
    margin-top: 2px;
    opacity: 0.5;
  }

  .match-timer {
    position: absolute;
    top: calc(14px + env(safe-area-inset-top, 0px));
    left: max(var(--hud-edge-inset, 16px), env(safe-area-inset-left, 0px));
    background: ${colors.hudGlass};
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 4px 12px;
    border: 1px solid ${colors.hudBorder};
    border-radius: 4px;
    pointer-events: none;
    z-index: ${zIndex.hudStatus};
  }

  .timer-display {
    font-family: ${fontStack.hud};
    font-size: 20px;
    font-weight: 700;
    color: rgba(220, 225, 230, 0.9);
    text-align: center;
    letter-spacing: 1.5px;
    transition: color 0.3s ease;
  }

  .match-timer.timer-warning .timer-display {
    color: ${colors.warning};
  }

  .match-timer.timer-critical .timer-display {
    color: ${colors.danger};
  }

  .match-timer.timer-warning {
    border-color: rgba(212, 163, 68, 0.3);
  }

  .match-timer.timer-critical {
    border-color: rgba(201, 86, 74, 0.4);
    animation: timerCriticalPulse 1s ease-in-out infinite;
  }

  @keyframes timerWarningPulse {
    0%, 100% {
      box-shadow: 0 0 6px rgba(212, 163, 68, 0.2);
    }
    50% {
      box-shadow: 0 0 12px rgba(212, 163, 68, 0.4);
    }
  }

  @keyframes timerCriticalPulse {
    0%, 100% {
      box-shadow: 0 0 8px rgba(201, 86, 74, 0.2);
    }
    50% {
      box-shadow: 0 0 16px rgba(201, 86, 74, 0.5);
    }
  }

  .victory-screen {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 40px;
    font-size: 32px;
    border-radius: 10px;
    text-align: center;
    border: 3px solid;
    z-index: ${zIndex.victoryScreen};
  }

  .victory-us { border-color: ${colors.us}; color: ${colors.us}; }
  .victory-opfor { border-color: ${colors.opfor}; color: ${colors.opfor}; }

  /* Mobile responsive adjustments */
  @media (max-width: 768px) {
    .combat-stats {
      bottom: 160px;
      font-size: 10px;
      padding: 4px 8px;
    }

    .game-status {
      top: calc(46px + env(safe-area-inset-top, 0px));
      font-size: 10px;
      padding: 3px 8px;
    }

    .match-timer {
      top: calc(10px + env(safe-area-inset-top, 0px));
      padding: 3px 10px;
    }

    .timer-display {
      font-size: 16px;
    }

    .victory-screen {
      padding: 24px;
      font-size: 24px;
      width: 85vw;
      max-width: 400px;
    }

    .ticket-display {
      padding: 4px 12px;
      gap: 12px;
    }

    .ticket-count {
      font-size: 20px;
    }
  }

  @media (max-width: 480px) {
    .combat-stats {
      display: none;
    }

    .game-status {
      top: calc(40px + env(safe-area-inset-top, 0px));
      font-size: 9px;
    }

    .match-timer {
      top: calc(8px + env(safe-area-inset-top, 0px));
      padding: 2px 8px;
    }

    .timer-display {
      font-size: 14px;
    }

    .victory-screen {
      padding: 16px;
      font-size: 20px;
      width: 90vw;
      border-radius: 6px;
    }

    .ticket-display {
      padding: 3px 8px;
      gap: 10px;
    }

    .ticket-count {
      font-size: 16px;
    }

    .faction-name {
      font-size: 9px;
    }
  }
`;
