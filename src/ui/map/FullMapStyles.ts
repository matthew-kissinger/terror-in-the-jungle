/**
 * CSS styles and drawing constants for the Full Map System
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
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    z-index: ${zIndex.fullMap};
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
    background: rgba(20, 20, 25, 0.95);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
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
    color: rgba(255, 255, 255, 0.9);
    font-size: 24px;
    font-weight: bold;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    text-transform: uppercase;
    letter-spacing: 4px;
  }

  .map-legend {
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.7);
    padding: 15px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
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
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 20px;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    cursor: pointer;
    transition: all 0.2s;
  }

  .map-control-button:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .map-instructions {
    position: absolute;
    bottom: 20px;
    left: 20px;
    color: rgba(255, 255, 255, 0.5);
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
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
    color: rgba(255, 255, 255, 0.8);
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    font-weight: bold;
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
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.9);
    font-size: 20px;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
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
    background: rgba(255, 255, 255, 0.35);
    transform: translateX(-50%) scale(0.9);
  }

  /* Mobile close button inside the map */
  .map-close-button {
    position: absolute;
    top: 10px;
    right: 60px;
    z-index: ${zIndex.fullMapOverlay};
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: rgba(255, 80, 80, 0.3);
    border: 1px solid rgba(255, 80, 80, 0.5);
    color: rgba(255, 255, 255, 0.9);
    font-size: 20px;
    font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    pointer-events: auto;
    cursor: pointer;
  }

  .map-close-button:active {
    background: rgba(255, 80, 80, 0.6);
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

// Zone color constants (RGBA values)
export const ZONE_COLORS = {
  US_CONTROLLED: { r: 91, g: 140, b: 201 },
  OPFOR_CONTROLLED: { r: 201, g: 86, b: 74 },
  CONTESTED: { r: 212, g: 163, b: 68 },
  NEUTRAL: { r: 107, g: 119, b: 128 },
} as const;

// Combatant colors
export const COMBATANT_COLORS = {
  US: 'rgba(91, 140, 201, 0.6)',
  OPFOR: 'rgba(201, 86, 74, 0.6)',
  PLAYER: 'rgba(220, 225, 230, 0.95)',
} as const;

// Grid drawing constants
export const GRID_SIZE = 50;
export const GRID_COLOR = 'rgba(255, 255, 255, 0.05)';
export const GRID_LINE_WIDTH = 1;
