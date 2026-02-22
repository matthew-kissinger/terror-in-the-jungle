/**
 * Weapon-related HUD styles - hit markers, kill counter, ammo display, interaction prompt
 * Positioning is handled by CSS Grid slots in HUDLayoutStyles.ts
 */
import { colors, fontStack } from '../design/tokens';

export const HUDWeaponStyles = `
  /* Hit markers - in center grid slot */
  .hit-marker-container {
    position: relative;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .hit-marker {
    position: absolute;
    width: 18px;
    height: 18px;
    transform: translate(-50%, -50%) rotate(45deg);
    opacity: 0.0;
  }

  /* Normal hit - subtle white */
  .hit-marker.normal {
    border: 2px solid rgba(220, 225, 230, 0.85);
    animation: hitFlashNormal 280ms ease-out forwards;
  }

  /* Headshot - warm amber */
  .hit-marker.headshot {
    border: 2.5px solid rgba(212, 163, 68, 0.95);
    width: 22px;
    height: 22px;
    box-shadow: 0 0 6px rgba(212, 163, 68, 0.4);
    animation: hitFlashHeadshot 320ms ease-out forwards;
  }

  /* Kill - muted red */
  .hit-marker.kill {
    border: 3px solid rgba(201, 86, 74, 0.95);
    width: 24px;
    height: 24px;
    box-shadow: 0 0 8px rgba(201, 86, 74, 0.5);
    animation: hitFlashKill 380ms ease-out forwards;
  }

  @keyframes hitFlashNormal {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(45deg) scale(0.7);
    }
    20% {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(45deg) scale(1.05);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(45deg) scale(1.2);
    }
  }

  @keyframes hitFlashHeadshot {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(45deg) scale(0.6);
    }
    15% {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(45deg) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(45deg) scale(1.3);
    }
  }

  @keyframes hitFlashKill {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(45deg) scale(0.5);
    }
    12% {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(45deg) scale(1.15);
    }
    30% {
      opacity: 0.9;
      transform: translate(-50%, -50%) rotate(45deg) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(45deg) scale(1.4);
    }
  }

  /* Kill counter - hidden, PersonalStatsPanel shows K/D instead */
  .kill-counter {
    display: none;
  }

  /* Ammo display - positioned by grid slot [data-region="ammo"] */
  .ammo-display {
    background: ${colors.hudGlass};
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    padding: 6px 14px;
    border-radius: 4px;
    border: 1px solid ${colors.hudBorder};
    min-width: 80px;
    text-align: center;
    font-family: ${fontStack.hud};
  }

  .ammo-counter {
    font-size: 20px;
    font-weight: 700;
    color: rgba(220, 225, 230, 0.9);
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 4px;
  }

  .ammo-magazine {
    font-size: 22px;
    transition: color 0.3s ease;
  }

  .ammo-separator {
    font-size: 14px;
    color: rgba(220, 225, 230, 0.25);
    font-weight: 300;
  }

  .ammo-reserve {
    font-size: 15px;
    color: rgba(220, 225, 230, 0.45);
  }

  .ammo-status {
    font-size: 10px;
    margin-top: 2px;
    min-height: 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    transition: color 0.3s ease;
  }

  .ammo-status:empty {
    display: none;
  }

  /* Interaction prompt */
  .interaction-prompt {
    animation: interactionPulse 2s infinite !important;
  }

  @keyframes interactionPulse {
    0% { border-color: rgba(220, 225, 230, 0.3); }
    50% { border-color: rgba(220, 225, 230, 0.6); }
    100% { border-color: rgba(220, 225, 230, 0.3); }
  }

  /* Touch device: adjust ammo sizing (no repositioning - grid handles it) */
  @media (pointer: coarse) {
    .ammo-display {
      min-width: auto;
      padding: 4px 10px;
    }

    .ammo-magazine { font-size: 18px; }
    .ammo-separator { font-size: 12px; }
    .ammo-reserve { font-size: 13px; }
    .kill-counter { display: none; }
  }
`;
