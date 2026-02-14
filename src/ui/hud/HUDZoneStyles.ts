/**
 * Zone and objectives panel styles
 */
import { colors, fontStack } from '../design/tokens';

export const HUDZoneStyles = `
  .objectives-panel {
    position: absolute;
    top: 220px;
    right: 16px;
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
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 4px;
    color: rgba(220, 225, 230, 0.5);
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

  .zone-icon {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.3);
  }

  .zone-neutral { background: rgba(107, 119, 128, 0.6); }
  .zone-us { background: rgba(91, 140, 201, 0.6); }
  .zone-opfor { background: rgba(201, 86, 74, 0.6); }
  .zone-contested {
    background: linear-gradient(90deg, rgba(91, 140, 201, 0.6) 50%, rgba(201, 86, 74, 0.6) 50%);
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

  /* Mobile responsive adjustments */
  @media (max-width: 1024px) {
    .objectives-panel {
      min-width: 150px;
      max-width: 180px;
      right: 10px;
      top: 170px;
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
      right: 8px;
      top: 140px;
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
`;
