/**
 * Base HUD styles - container and common animations
 */
import { zIndex, fontStack } from '../design/tokens';

export const HUDBaseStyles = `
  .hud-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    font-family: ${fontStack.hud};
    color: rgba(220, 225, 230, 0.95);
    z-index: ${zIndex.hudBase};
    letter-spacing: 0.2px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(255, 100, 100, 0.5);
      opacity: 1;
    }
    50% {
      box-shadow: 0 0 15px rgba(255, 100, 100, 0.9);
      opacity: 0.9;
    }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
