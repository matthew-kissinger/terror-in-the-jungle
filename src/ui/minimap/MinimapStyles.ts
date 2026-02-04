export const MINIMAP_SIZE = 200;
export const DEFAULT_WORLD_SIZE = 300;

export const MINIMAP_STYLES = `
  .minimap-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 200px;
    height: 200px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 14px;
    overflow: hidden;
    background: rgba(10, 10, 14, 0.28);
    backdrop-filter: blur(6px) saturate(1.1);
    -webkit-backdrop-filter: blur(6px) saturate(1.1);
    z-index: 120;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
  }

  .minimap-canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
  }

  .minimap-legend {
    position: absolute;
    bottom: 6px;
    left: 6px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 9px;
    font-family: 'Courier New', monospace;
    pointer-events: none;
  }
`;
