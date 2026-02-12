/**
 * Weapon-related HUD styles - hit markers, kill counter, ammo display, interaction prompt
 */

export const HUDWeaponStyles = `
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

  /* Mobile responsive adjustments */
  @media (max-width: 768px) {
    .ammo-display {
      right: 50%;
      transform: translateX(50%);
      bottom: 160px;
      min-width: 100px;
    }

    .kill-counter {
      bottom: 160px;
      left: 12px;
      min-width: 100px;
    }
  }

  @media (max-width: 480px) {
    .ammo-display {
      bottom: 170px;
      padding: 8px 12px;
      min-width: 90px;
    }

    .ammo-magazine {
      font-size: 22px;
    }

    .ammo-separator {
      font-size: 16px;
    }

    .ammo-reserve {
      font-size: 16px;
    }

    .kill-counter {
      display: none;
    }
  }
`;
