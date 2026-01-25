export class HUDStyles {
  private static instance: HUDStyles;
  private styleSheet?: HTMLStyleElement;

  private readonly styles = `
    .hud-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      font-family: 'Courier New', monospace;
      color: white;
      z-index: 100;
    }

    .objectives-panel {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(10, 10, 14, 0.28);
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      min-width: 240px;
    }

    .objectives-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(255, 255, 255, 0.3);
      padding-bottom: 5px;
    }

    .zone-item {
      margin: 8px 0;
      padding: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 3px;
    }

    .zone-name {
      font-weight: bold;
      text-transform: uppercase;
    }

    .zone-status {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .zone-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid white;
    }

    .zone-neutral { background: #888; }
    .zone-us { background: #0066cc; }
    .zone-opfor { background: #cc0000; }
    .zone-contested {
      background: linear-gradient(90deg, #0066cc 50%, #cc0000 50%);
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }

    .capture-progress {
      width: 100px;
      height: 4px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 3px;
    }

    .capture-bar {
      height: 100%;
      background: white;
      transition: width 0.3s ease;
    }

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

    .zone-distance {
      font-size: 10px;
      color: #aaa;
      margin-left: 5px;
    }

    .game-status {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(10, 10, 14, 0.28);
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      padding: 8px 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      font-size: 14px;
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
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 10, 14, 0.6);
      backdrop-filter: blur(8px) saturate(1.2);
      -webkit-backdrop-filter: blur(8px) saturate(1.2);
      padding: 12px 24px;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-radius: 12px;
      pointer-events: none;
      z-index: 105;
    }

    .timer-display {
      font-family: 'Courier New', monospace;
      font-size: 32px;
      font-weight: bold;
      color: white;
      text-align: center;
      letter-spacing: 2px;
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

    /* Hit markers */
    .hit-marker-container {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 120;
    }

    .hit-marker {
      position: absolute;
      width: 20px;
      height: 20px;
      transform: translate(-50%, -50%) rotate(45deg);
      opacity: 0.0;
    }

    /* Normal hit - white X */
    .hit-marker.normal {
      border: 2.5px solid rgba(255, 255, 255, 0.95);
      animation: hitFlashNormal 300ms ease-out forwards;
    }

    /* Headshot - yellow/gold X, larger */
    .hit-marker.headshot {
      border: 3px solid rgba(255, 215, 0, 1);
      width: 24px;
      height: 24px;
      box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
      animation: hitFlashHeadshot 350ms ease-out forwards;
    }

    /* Kill - red X with expansion */
    .hit-marker.kill {
      border: 3.5px solid rgba(255, 68, 68, 1);
      width: 26px;
      height: 26px;
      box-shadow: 0 0 12px rgba(255, 68, 68, 0.8);
      animation: hitFlashKill 400ms ease-out forwards;
    }

    @keyframes hitFlashNormal {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(45deg) scale(0.7);
      }
      20% {
        opacity: 1;
        transform: translate(-50%, -50%) rotate(45deg) scale(1.1);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(45deg) scale(1.3);
      }
    }

    @keyframes hitFlashHeadshot {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(45deg) scale(0.6);
        box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
      }
      15% {
        opacity: 1;
        transform: translate(-50%, -50%) rotate(45deg) scale(1.15);
        box-shadow: 0 0 16px rgba(255, 215, 0, 0.9);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(45deg) scale(1.4);
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
      }
    }

    @keyframes hitFlashKill {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(45deg) scale(0.5);
        box-shadow: 0 0 12px rgba(255, 68, 68, 0.8);
      }
      12% {
        opacity: 1;
        transform: translate(-50%, -50%) rotate(45deg) scale(1.25);
        box-shadow: 0 0 24px rgba(255, 68, 68, 1);
      }
      30% {
        opacity: 0.9;
        transform: translate(-50%, -50%) rotate(45deg) scale(1.15);
        box-shadow: 0 0 20px rgba(255, 68, 68, 0.9);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) rotate(45deg) scale(1.6);
        box-shadow: 0 0 28px rgba(255, 68, 68, 0.2);
      }
    }

    /* Kill counter */
    .kill-counter {
      position: absolute;
      bottom: 16px;
      left: 16px;
      background: rgba(10, 10, 14, 0.28);
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      font-size: 12px;
      color: white;
      min-width: 120px;
      text-align: center;
    }

    .kill-counter .kill-count { color: #ffffff; font-weight: bold; }
    .kill-counter .death-count { color: #aaaaaa; }
    .kill-counter .kd-ratio { color: #88ff88; margin-top: 2px; font-size: 11px; }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    /* Ammo display */
    .ammo-display {
      position: absolute;
      bottom: 20px;
      right: 280px;
      background: rgba(10, 10, 14, 0.28);
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      min-width: 120px;
      text-align: center;
    }

    .ammo-counter {
      font-size: 24px;
      font-weight: bold;
      color: white;
      display: flex;
      justify-content: center;
      align-items: baseline;
      gap: 8px;
    }

    .ammo-magazine {
      font-size: 28px;
      transition: color 0.3s ease;
    }

    .ammo-separator {
      font-size: 20px;
      color: #666;
    }

    .ammo-reserve {
      font-size: 20px;
      color: #aaa;
    }

    .ammo-status {
      font-size: 11px;
      margin-top: 4px;
      height: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      transition: color 0.3s ease;
    }

    /* Interaction prompt */
    .interaction-prompt {
      animation: pulse 2s infinite !important;
    }

    @keyframes pulse {
      0% { border-color: rgba(255, 255, 255, 0.6); }
      50% { border-color: rgba(255, 255, 255, 1.0); }
      100% { border-color: rgba(255, 255, 255, 0.6); }
    }
  `;

  static getInstance(): HUDStyles {
    if (!HUDStyles.instance) {
      HUDStyles.instance = new HUDStyles();
    }
    return HUDStyles.instance;
  }

  inject(): void {
    if (!this.styleSheet) {
      this.styleSheet = document.createElement('style');
      this.styleSheet.textContent = this.styles;
      document.head.appendChild(this.styleSheet);
    }
  }

  dispose(): void {
    if (this.styleSheet && this.styleSheet.parentNode) {
      this.styleSheet.parentNode.removeChild(this.styleSheet);
      this.styleSheet = undefined;
    }
  }
}