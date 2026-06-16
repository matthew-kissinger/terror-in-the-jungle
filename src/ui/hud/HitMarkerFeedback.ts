// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Enhanced hit marker feedback system with animations and screen effects
 */

import { zIndex } from '../design/tokens';

type HitMarkerType = 'hit' | 'headshot' | 'kill';
type ScreenFlashType = Exclude<HitMarkerType, 'hit'>;

const HIT_MARKER_CLASS_BY_TYPE: Record<HitMarkerType, string> = {
  hit: 'hit-marker-cross hit-marker-hit',
  headshot: 'hit-marker-cross hit-marker-headshot',
  kill: 'hit-marker-cross hit-marker-kill',
};

const HIT_MARKER_DURATION_MS_BY_TYPE: Record<HitMarkerType, number> = {
  hit: 300,
  headshot: 350,
  kill: 400,
};

const SCREEN_FLASH_CLASS_BY_TYPE: Record<ScreenFlashType, string> = {
  headshot: 'vignette-headshot',
  kill: 'vignette-kill',
};

const SCREEN_FLASH_DURATION_MS_BY_TYPE: Record<ScreenFlashType, number> = {
  headshot: 350,
  kill: 400,
};

export class HitMarkerFeedback {
  private container: HTMLDivElement;
  private vignetteOverlay: HTMLDivElement;
  private markerPool: HTMLDivElement[] = [];
  private markerTimeouts = new Map<HTMLDivElement, number>();
  private vignetteTimer?: number;
  private readonly MARKER_POOL_SIZE = 16;

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
      z-index: ${zIndex.hudFeedback};
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
      z-index: ${zIndex.hudOverlay};
      background: radial-gradient(circle at center, transparent 0%, rgba(158, 59, 46, 0.3) 100%);
    `;

    this.injectStyles();

    for (let i = 0; i < this.MARKER_POOL_SIZE; i++) {
      this.markerPool.push(this.createMarkerElement());
    }
  }

  private createMarkerElement(): HTMLDivElement {
    const marker = document.createElement('div');
    marker.className = 'hit-marker-cross';
    return marker;
  }

  private acquireMarker(): HTMLDivElement {
    const pooled = this.markerPool.pop();
    if (pooled) {
      return pooled;
    }

    const oldestActiveMarker = this.markerTimeouts.keys().next().value;
    if (oldestActiveMarker) {
      this.releaseMarker(oldestActiveMarker);
      return this.markerPool.pop() ?? oldestActiveMarker;
    }

    return this.createMarkerElement();
  }

  private releaseMarker(marker: HTMLDivElement): void {
    const timeoutId = this.markerTimeouts.get(marker);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      this.markerTimeouts.delete(marker);
    }

    marker.remove();
    marker.className = 'hit-marker-cross';

    if (this.markerPool.length < this.MARKER_POOL_SIZE) {
      this.markerPool.push(marker);
    }
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
        will-change: transform, opacity;
        backface-visibility: hidden;
      }

      .hit-marker-cross::before,
      .hit-marker-cross::after {
        content: '';
        position: absolute;
        background: rgba(231, 217, 186, 0.95);
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
        background: rgba(231, 217, 186, 0.9);
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
        background: rgba(168, 116, 42, 0.95);
        box-shadow:
          0 0 4px rgba(168, 116, 42, 0.5),
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
        background: rgba(158, 59, 46, 0.95);
        box-shadow:
          0 0 5px rgba(158, 59, 46, 0.6),
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
        background: radial-gradient(circle at center, transparent 0%, rgba(158, 59, 46, 0.25) 100%);
        animation: killVignettePulse 400ms ease-out forwards;
      }

      .vignette-headshot {
        background: radial-gradient(circle at center, transparent 0%, rgba(168, 116, 42, 0.15) 100%);
        animation: headshotVignettePulse 350ms ease-out forwards;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show hit marker with enhanced animations
   */
  showHitMarker(type: HitMarkerType = 'hit'): void {
    const marker = this.acquireMarker();
    marker.className = HIT_MARKER_CLASS_BY_TYPE[type];

    this.container.appendChild(marker);

    // Screen flash for headshots and kills
    if (type === 'headshot' || type === 'kill') {
      this.showScreenFlash(type);
    }

    // Remove after animation completes
    const duration = HIT_MARKER_DURATION_MS_BY_TYPE[type];
    const timeoutId = window.setTimeout(() => {
      this.releaseMarker(marker);
    }, duration);
    this.markerTimeouts.set(marker, timeoutId);
  }

  /**
   * Show screen flash effect
   */
  private showScreenFlash(type: ScreenFlashType): void {
    if (this.vignetteTimer !== undefined) {
      window.clearTimeout(this.vignetteTimer);
      this.vignetteTimer = undefined;
    }

    // Reset classes
    this.vignetteOverlay.className = 'hit-feedback-vignette';

    this.vignetteOverlay.classList.add(SCREEN_FLASH_CLASS_BY_TYPE[type]);

    // Remove class after animation
    const duration = SCREEN_FLASH_DURATION_MS_BY_TYPE[type];
    this.vignetteTimer = window.setTimeout(() => {
      this.vignetteOverlay.className = 'hit-feedback-vignette';
      this.vignetteTimer = undefined;
    }, duration);
  }

  attachToDOM(parent?: HTMLElement): void {
    const target = parent ?? document.body;
    target.appendChild(this.vignetteOverlay);
    target.appendChild(this.container);
  }

  dispose(): void {
    const activeMarkers = Array.from(this.markerTimeouts.keys());
    for (const marker of activeMarkers) {
      this.releaseMarker(marker);
    }
    this.markerPool.length = 0;

    if (this.vignetteTimer !== undefined) {
      window.clearTimeout(this.vignetteTimer);
      this.vignetteTimer = undefined;
    }

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
