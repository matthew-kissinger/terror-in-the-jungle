import { colors } from '../design/tokens';

export const MINIMAP_SIZE = 200;
export const DEFAULT_WORLD_SIZE = 300;

export const MINIMAP_STYLES = `
  .minimap-container {
    width: clamp(110px, 13vw, 180px);
    height: clamp(110px, 13vw, 180px);
    border: 1px solid ${colors.hudBorder};
    border-radius: 6px;
    overflow: hidden;
    background: ${colors.hudGlass};
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: all 0.3s ease-in-out;
    position: relative;
  }

  @media (max-width: 1024px) {
    .minimap-container {
      width: 130px;
      height: 130px;
      border-radius: 5px;
    }
  }

  @media (max-width: 480px) {
    .minimap-container {
      width: 100px;
      height: 100px;
      border-radius: 4px;
    }
  }

  /* Ensure no extra spacing on mobile — sits snug in its grid slot */
  @media (pointer: coarse) {
    .minimap-container {
      margin: 0;
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
