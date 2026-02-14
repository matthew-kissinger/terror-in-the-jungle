/**
 * Enhanced hit marker feedback system with animations and screen effects
 */

export type HitMarkerType = 'hit' | 'headshot' | 'kill';

export class HitMarkerFeedback {
  private container: HTMLDivElement;
  private vignetteOverlay: HTMLDivElement;

  constructor() {
    // Create hit marker container
    this.container = document.createElement('div');
    this.container.className = 'hit-marker-feedback-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 200;
    `;

    // Create vignette overlay for kill flashes
    this.vignetteOverlay = document.createElement('div');
    this.vignetteOverlay.className = 'hit-feedback-vignette';
    this.vignetteOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      opacity: 0;
      z-index: 199;
      background: radial-gradient(circle at center, transparent 0%, rgba(255, 0, 0, 0.3) 100%);
    `;

    this.injectStyles();
  }

  private injectStyles(): void {
    const styleId = 'hit-marker-feedback-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Base hit marker - crosshair style */
      .hit-marker-cross {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 30px;
        height: 30px;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .hit-marker-cross::before,
      .hit-marker-cross::after {
        content: '';
        position: absolute;
        background: white;
        box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
      }

      /* Horizontal line */
      .hit-marker-cross::before {
        top: 50%;
        left: 0;
        width: 100%;
        height: 3px;
        transform: translateY(-50%);
      }

      /* Vertical line */
      .hit-marker-cross::after {
        left: 50%;
        top: 0;
        width: 3px;
        height: 100%;
        transform: translateX(-50%);
      }

      /* Normal hit animation */
      @keyframes hitFlash {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
        20% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.3);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1.0);
        }
      }

      .hit-marker-hit {
        animation: hitFlash 300ms ease-out forwards;
      }

      .hit-marker-hit::before,
      .hit-marker-hit::after {
        background: rgba(255, 255, 255, 0.9);
      }

      /* Headshot marker - gold */
      @keyframes headshotFlash {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8) rotate(0deg);
        }
        15% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.4) rotate(5deg);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1.1) rotate(0deg);
        }
      }

      .hit-marker-headshot {
        animation: headshotFlash 350ms ease-out forwards;
      }

      .hit-marker-headshot::before,
      .hit-marker-headshot::after {
        background: rgba(212, 163, 68, 0.95);
        box-shadow:
          0 0 4px rgba(212, 163, 68, 0.5),
          0 0 2px rgba(0, 0, 0, 0.9);
      }

      /* Kill marker - X shape */
      @keyframes killFlash {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.7) rotate(0deg);
        }
        10% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.5) rotate(10deg);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1.2) rotate(0deg);
        }
      }

      .hit-marker-kill {
        animation: killFlash 400ms ease-out forwards;
      }

      .hit-marker-kill::before,
      .hit-marker-kill::after {
        background: rgba(201, 86, 74, 0.95);
        box-shadow:
          0 0 5px rgba(201, 86, 74, 0.6),
          0 0 3px rgba(0, 0, 0, 0.9);
      }

      .hit-marker-kill::before {
        transform: translate(-50%, -50%) rotate(45deg);
      }

      .hit-marker-kill::after {
        transform: translate(-50%, -50%) rotate(-45deg);
      }

      /* Screen flash animations */
      @keyframes killVignettePulse {
        0% {
          opacity: 0;
        }
        20% {
          opacity: 0.4;
        }
        100% {
          opacity: 0;
        }
      }

      @keyframes headshotVignettePulse {
        0% {
          opacity: 0;
        }
        20% {
          opacity: 0.3;
        }
        100% {
          opacity: 0;
        }
      }

      .vignette-kill {
        background: radial-gradient(circle at center, transparent 0%, rgba(201, 86, 74, 0.25) 100%);
        animation: killVignettePulse 400ms ease-out forwards;
      }

      .vignette-headshot {
        background: radial-gradient(circle at center, transparent 0%, rgba(212, 163, 68, 0.15) 100%);
        animation: headshotVignettePulse 350ms ease-out forwards;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show hit marker with enhanced animations
   */
  showHitMarker(type: HitMarkerType = 'hit'): void {
    // Create marker element
    const marker = document.createElement('div');
    marker.className = `hit-marker-cross hit-marker-${type}`;

    this.container.appendChild(marker);

    // Screen flash for headshots and kills
    if (type === 'headshot' || type === 'kill') {
      this.showScreenFlash(type);
    }

    // Remove after animation completes
    const duration = type === 'kill' ? 400 : type === 'headshot' ? 350 : 300;
    setTimeout(() => {
      if (marker.parentNode) {
        marker.parentNode.removeChild(marker);
      }
    }, duration);
  }

  /**
   * Show screen flash effect
   */
  private showScreenFlash(type: 'headshot' | 'kill'): void {
    // Reset classes
    this.vignetteOverlay.className = 'hit-feedback-vignette';

    // Add appropriate class
    if (type === 'kill') {
      this.vignetteOverlay.classList.add('vignette-kill');
    } else if (type === 'headshot') {
      this.vignetteOverlay.classList.add('vignette-headshot');
    }

    // Remove class after animation
    const duration = type === 'kill' ? 400 : 350;
    setTimeout(() => {
      this.vignetteOverlay.className = 'hit-feedback-vignette';
    }, duration);
  }

  attachToDOM(): void {
    document.body.appendChild(this.vignetteOverlay);
    document.body.appendChild(this.container);
  }

  dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    if (this.vignetteOverlay.parentElement) {
      this.vignetteOverlay.parentElement.removeChild(this.vignetteOverlay);
    }

    // Remove injected styles
    const styleElement = document.getElementById('hit-marker-feedback-styles');
    if (styleElement) {
      styleElement.remove();
    }
  }
}
