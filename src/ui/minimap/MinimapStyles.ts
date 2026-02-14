import { colors, zIndex } from '../design/tokens';

export const MINIMAP_SIZE = 200;
export const DEFAULT_WORLD_SIZE = 300;

export const MINIMAP_STYLES = `
  .minimap-container {
    position: fixed;
    top: 16px;
    right: 16px;
    width: clamp(110px, 13vw, 180px);
    height: clamp(110px, 13vw, 180px);
    border: 1px solid ${colors.hudBorder};
    border-radius: 6px;
    overflow: hidden;
    background: ${colors.hudGlass};
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: ${zIndex.hudWeapon};
    transition: all 0.3s ease-in-out;
  }

  @media (max-width: 1024px) {
    .minimap-container {
      width: 130px;
      height: 130px;
      top: 12px;
      right: 10px;
      border-radius: 5px;
    }
  }

  @media (max-width: 480px) {
    .minimap-container {
      width: 100px;
      height: 100px;
      top: 10px;
      right: 8px;
      border-radius: 4px;
    }
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
    bottom: 4px;
    left: 4px;
    color: rgba(220, 225, 230, 0.45);
    font-size: 8px;
    font-family: 'Rajdhani', sans-serif;
    font-weight: 600;
    pointer-events: none;
  }

  @media (max-width: 480px) {
    .minimap-legend {
      display: none;
    }
  }
`;
