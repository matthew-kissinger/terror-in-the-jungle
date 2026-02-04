/**
 * Status display styles - tickets, combat stats, game status, timer, victory screen
 */

export const HUDStatusStyles = `
  .ticket-display {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(10, 10, 14, 0.28);
    backdrop-filter: blur(6px) saturate(1.1);
    -webkit-backdrop-filter: blur(6px) saturate(1.1);
    padding: 8px 16px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    display: flex;
    gap: 24px;
    align-items: center;
  }

  .faction-tickets {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .faction-name {
    font-size: 12px;
    text-transform: uppercase;
    margin-bottom: 5px;
  }

  .ticket-count {
    font-size: 28px;
    font-weight: bold;
  }

  .us-tickets { color: #4488ff; }
  .opfor-tickets { color: #ff4444; }

  .ticket-separator {
    font-size: 24px;
    color: #666;
  }

  .combat-stats {
    position: absolute;
    bottom: 16px;
    right: 16px;
    background: rgba(10, 10, 14, 0.28);
    backdrop-filter: blur(6px) saturate(1.1);
    -webkit-backdrop-filter: blur(6px) saturate(1.1);
    padding: 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    font-size: 12px;
  }

  .stat-line {
    margin: 3px 0;
  }

  .game-status {
    position: absolute;
    top: 70px;
    left: 20px;
    background: rgba(10, 10, 14, 0.28);
    backdrop-filter: blur(6px) saturate(1.1);
    -webkit-backdrop-filter: blur(6px) saturate(1.1);
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    font-size: 12px;
  }

  .phase-setup { border-color: #ffaa00; color: #ffaa00; }
  .phase-combat { border-color: #ff4444; color: #ff4444; }
  .phase-overtime { border-color: #ff0088; color: #ff0088; animation: pulse 0.5s infinite; }
  .phase-ended { border-color: #00ff00; color: #00ff00; }

  .time-remaining {
    font-size: 12px;
    margin-top: 5px;
    opacity: 0.8;
  }

  .bleed-indicator {
    font-size: 10px;
    margin-top: 3px;
    opacity: 0.7;
  }

  .match-timer {
    position: absolute;
    top: 20px;
    left: 20px;
    background: rgba(10, 10, 14, 0.5);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    padding: 8px 14px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 6px;
    pointer-events: none;
    z-index: 105;
  }

  .timer-display {
    font-family: 'Courier New', monospace;
    font-size: 22px;
    font-weight: bold;
    color: white;
    text-align: center;
    letter-spacing: 1px;
    transition: color 0.3s ease, text-shadow 0.3s ease;
  }

  .match-timer.timer-warning {
    border-color: rgba(255, 255, 0, 0.6);
    animation: timerWarningPulse 1s ease-in-out infinite;
  }

  .match-timer.timer-critical {
    border-color: rgba(255, 0, 0, 0.8);
    animation: timerCriticalPulse 0.5s ease-in-out infinite;
  }

  @keyframes timerWarningPulse {
    0%, 100% {
      box-shadow: 0 0 10px rgba(255, 255, 0, 0.3);
    }
    50% {
      box-shadow: 0 0 20px rgba(255, 255, 0, 0.6);
    }
  }

  @keyframes timerCriticalPulse {
    0%, 100% {
      box-shadow: 0 0 15px rgba(255, 0, 0, 0.4);
    }
    50% {
      box-shadow: 0 0 30px rgba(255, 0, 0, 0.8);
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
    z-index: 1000;
  }

  .victory-us { border-color: #4488ff; color: #4488ff; }
  .victory-opfor { border-color: #ff4444; color: #ff4444; }
`;
