/**
 * CSS styles and drawing constants for the Full Map System
 */

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
    z-index: 200;
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
    font-family: 'Courier New', monospace;
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
    font-family: 'Courier New', monospace;
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
    font-family: 'Courier New', monospace;
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
    font-family: 'Courier New', monospace;
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
    font-family: 'Courier New', monospace;
    font-weight: bold;
    font-size: 16px;
  }

  .compass-n { top: 0; left: 50%; transform: translateX(-50%); }
  .compass-s { bottom: 0; left: 50%; transform: translateX(-50%); }
  .compass-e { right: 0; top: 50%; transform: translateY(-50%); }
  .compass-w { left: 0; top: 50%; transform: translateY(-50%); }
`;

// Map size constants
export const MAP_SIZE = 800;
export const BASE_WORLD_SIZE = 400; // Zone Control world size as baseline for scaling

// Zoom constants
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8; // Increased max zoom for Open Frontier

// Zone color constants (RGBA values)
export const ZONE_COLORS = {
  US_CONTROLLED: { r: 68, g: 136, b: 255 },
  OPFOR_CONTROLLED: { r: 255, g: 68, b: 68 },
  CONTESTED: { r: 255, g: 255, b: 68 },
  NEUTRAL: { r: 136, g: 136, b: 136 },
} as const;

// Combatant colors
export const COMBATANT_COLORS = {
  US: 'rgba(68, 136, 255, 0.6)',
  OPFOR: 'rgba(255, 68, 68, 0.6)',
  PLAYER: '#00ff00',
} as const;

// Grid drawing constants
export const GRID_SIZE = 50;
export const GRID_COLOR = 'rgba(255, 255, 255, 0.05)';
export const GRID_LINE_WIDTH = 1;
