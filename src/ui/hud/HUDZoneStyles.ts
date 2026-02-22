/**
 * Zone and objectives panel styles
 */
import { colors, fontStack } from '../design/tokens';

export const HUDZoneStyles = `
  .objectives-panel {
    position: absolute;
    top: calc(220px + env(safe-area-inset-top, 0px));
    right: max(var(--hud-edge-inset, 16px), env(safe-area-inset-right, 0px));
    background: ${colors.hudGlass};
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    padding: 8px 10px;
    border: 1px solid ${colors.hudBorder};
    border-radius: 4px;
    min-width: 180px;
    max-width: 220px;
    font-family: ${fontStack.hud};
  }

  .objectives-title {
    font-size: 10px;
    font-weight: 700;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    border-bottom: 1px solid ${colors.hudBorder};
    padding-bottom: 4px;
    color: ${colors.textMuted};
  }

  .zone-item {
    margin: 4px 0;
    padding: 3px 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 3px;
  }

  .zone-name {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 0.5px;
    color: rgba(220, 225, 230, 0.85);
  }

  .zone-status {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .zone-status-text {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: rgba(220, 225, 230, 0.7);
    text-transform: uppercase;
  }

  .zone-icon {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.3);
  }

  .zone-neutral { background: ${colors.textMuted}; }
  .zone-us { background: ${colors.us}; }
  .zone-opfor { background: ${colors.opfor}; }
  .zone-contested {
    background: linear-gradient(90deg, ${colors.us} 50%, ${colors.opfor} 50%);
    animation: pulse 1s infinite;
  }

  .capture-progress {
    width: 80px;
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 2px;
  }

  .capture-bar {
    height: 100%;
    background: rgba(220, 225, 230, 0.5);
    transition: width 0.3s ease;
  }

  .zone-distance {
    font-size: 9px;
    color: rgba(220, 225, 230, 0.35);
    margin-left: 4px;
    font-weight: 600;
  }

  .zone-empty {
    font-size: 10px;
    color: rgba(220, 225, 230, 0.45);
    padding: 4px 2px 2px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  /* Mobile responsive adjustments */
  @media (max-width: 1024px) {
    .objectives-panel {
      min-width: 150px;
      max-width: 180px;
      top: calc(170px + env(safe-area-inset-top, 0px));
      padding: 6px 8px;
    }

    .objectives-title {
      font-size: 9px;
      margin-bottom: 4px;
    }

    .zone-name {
      font-size: 11px;
    }

    .capture-progress {
      width: 60px;
    }
  }

  @media (max-width: 480px) {
    .objectives-panel {
      min-width: 120px;
      max-width: 40vw;
      top: calc(140px + env(safe-area-inset-top, 0px));
      padding: 4px 6px;
      font-size: 10px;
    }

    .objectives-title {
      font-size: 8px;
      margin-bottom: 3px;
      padding-bottom: 2px;
    }

    .zone-item {
      margin: 2px 0;
      padding: 2px 4px;
    }

    .zone-name {
      font-size: 10px;
    }

    .capture-progress {
      width: 40px;
    }
  }

  /* Hide objectives panel on touch devices to avoid overlap with action buttons */
  @media (pointer: coarse) {
    .objectives-panel {
      display: none;
    }
  }
`;
