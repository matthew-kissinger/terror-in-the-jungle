/**
 * CSS styles and drawing constants for the Full Map System.
 *
 * Field Journal: the tactical map is a manila paper map you pull out over the
 * battlefield — the sheet (`.map-content`) is parchment with ink chrome, sitting
 * on a dark dim backdrop. The header floats above the sheet on the dim, so it
 * stays light; everything inside the sheet is ink-on-paper.
 */

import { zIndex } from '../design/tokens';

export const MAP_STYLES = `
  .full-map-container {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(26, 20, 12, 0.82);
    backdrop-filter: blur(10px);
    z-index: ${zIndex.fullMapAboveTouch};
    pointer-events: none;
  }

  .full-map-container.visible {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .map-content {
    position: relative;
    width: 800px;
    height: 800px;
    background: linear-gradient(180deg, var(--paper-lt), var(--paper));
    border: 1px solid var(--paper-edge);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(20, 14, 6, 0.6);
    pointer-events: auto;
  }

  .map-canvas {
    width: 100%;
    height: 100%;
    border-radius: 10px;
  }

  .map-header {
    position: absolute;
    top: -50px;
    left: 0;
    right: 0;
    text-align: center;
    color: var(--paper-lt);
    font-size: 24px;
    font-weight: 400;
    font-family: var(--type-stamp);
    text-transform: uppercase;
    letter-spacing: 4px;
    text-shadow: 1px 1px 0 rgba(20, 14, 6, 0.6);
  }

  .map-legend {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: rgba(231, 217, 186, 0.88);
    padding: 15px;
    border-radius: 8px;
    border: 1px solid var(--paper-edge);
    color: var(--ink-soft);
    font-family: var(--type);
    font-size: 12px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .legend-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }

  .map-controls {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .map-control-button {
    width: 40px;
    height: 40px;
    background: rgba(231, 217, 186, 0.72);
    border: 1px solid var(--paper-edge);
    border-radius: 8px;
    color: var(--ink);
    font-size: 20px;
    font-family: var(--type-stamp);
    cursor: pointer;
    transition: all 0.2s;
  }

  .map-control-button:hover {
    background: rgba(231, 217, 186, 0.95);
    border-color: var(--ink-faint);
  }

  .map-instructions {
    position: absolute;
    bottom: 20px;
    left: 20px;
    color: var(--ink-faint);
    font-family: var(--type);
    font-size: 12px;
  }

  .compass-rose {
    position: absolute;
    top: 20px;
    left: 20px;
    width: 80px;
    height: 80px;
  }

  .compass-direction {
    position: absolute;
    color: var(--ink-soft);
    font-family: var(--type-stamp);
    font-weight: 400;
    font-size: 16px;
  }

  .compass-n { top: 0; left: 50%; transform: translateX(-50%); }
  .compass-s { bottom: 0; left: 50%; transform: translateX(-50%); }
  .compass-e { right: 0; top: 50%; transform: translateY(-50%); }
  .compass-w { left: 0; top: 50%; transform: translateY(-50%); }

  /* Mobile map toggle button */
  .map-toggle-button {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: ${zIndex.touchMenu};
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(231, 217, 186, 0.85);
    border: 2px solid var(--paper-edge);
    color: var(--ink);
    font-size: 20px;
    font-family: var(--type-stamp);
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    pointer-events: auto;
    user-select: none;
    -webkit-user-select: none;
    cursor: pointer;
  }

  .map-toggle-button:active {
    background: rgba(231, 217, 186, 0.98);
    transform: translateX(-50%) scale(0.9);
  }

  /* Mobile close button inside the map */
  .map-close-button {
    position: fixed;
    top: max(12px, env(safe-area-inset-top, 0px));
    right: max(12px, env(safe-area-inset-right, 0px));
    z-index: ${zIndex.fullMapOverlay + 1};
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(158, 59, 46, 0.32);
    border: 1px solid rgba(158, 59, 46, 0.55);
    color: var(--paper-lt);
    font-size: 20px;
    font-family: var(--type-stamp);
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    pointer-events: auto;
    cursor: pointer;
    padding: 0;
  }

  .map-close-button:active {
    background: rgba(158, 59, 46, 0.6);
  }

  /* Touch-action on map canvas for gesture handling */
  .map-canvas {
    touch-action: none;
  }

  /* Responsive map content for mobile */
  @media (max-width: 900px) {
    .map-content {
      width: 95vw;
      height: 95vw;
      max-width: 800px;
      max-height: 800px;
    }

    .map-legend {
      padding: 8px;
      font-size: 10px;
      bottom: 10px;
      right: 10px;
    }

    .map-instructions {
      font-size: 10px;
      bottom: 10px;
      left: 10px;
    }

    .compass-rose {
      width: 50px;
      height: 50px;
      top: 10px;
      left: 10px;
    }

    .compass-direction {
      font-size: 12px;
    }

    .map-header {
      font-size: 16px;
      top: -36px;
    }
  }
`;

// Map size constants
export const MAP_SIZE = 800;
export const BASE_WORLD_SIZE = 400; // Zone Control world size as baseline for scaling

// Zoom constants
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 30; // High enough for 21km worlds (~1px/unit at zoom 26)

// Zone color constants (RGBA values) — Field Journal: ALLIED green, HOSTILE red,
// CONTESTED warn amber, NEUTRAL ink-faint.
export const ZONE_COLORS = {
  BLUFOR_CONTROLLED: { r: 79, g: 107, b: 58 },
  OPFOR_CONTROLLED: { r: 158, g: 59, b: 46 },
  CONTESTED: { r: 168, g: 116, b: 42 },
  NEUTRAL: { r: 138, g: 126, b: 107 },
} as const;

// Combatant colors. PLAYER reads as ink on the manila sheet (distinct from the
// green/red faction dots); faction dots are the field-green / stamp-red pair.
export const COMBATANT_COLORS = {
  US: 'rgba(79, 107, 58, 0.8)',
  OPFOR: 'rgba(158, 59, 46, 0.8)',
  PLAYER: 'rgba(43, 38, 32, 0.95)',
} as const;

// Grid drawing constants — faint ink rule on parchment.
export const GRID_SIZE = 50;
export const GRID_COLOR = 'rgba(90, 70, 40, 0.14)';
export const GRID_LINE_WIDTH = 1;
