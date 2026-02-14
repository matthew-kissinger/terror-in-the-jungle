/**
 * Crosshair UI module for SandboxRenderer.
 * Manages the tactical crosshair overlay with CSS styling.
 */

export class SandboxCrosshairUI {
  private crosshair?: HTMLDivElement;

  showCrosshair(): void {
    if (this.crosshair) return;

    // Create container for complex crosshair
    this.crosshair = document.createElement('div');
    this.crosshair.style.position = 'fixed';
    this.crosshair.style.left = '50%';
    this.crosshair.style.top = '50%';
    this.crosshair.style.transform = 'translate(-50%, -50%)';
    this.crosshair.style.pointerEvents = 'none';
    this.crosshair.style.zIndex = '10';

    // Create tactical crosshair with CSS
    this.crosshair.innerHTML = `
      <style>
        .tactical-crosshair {
          position: relative;
          width: 60px;
          height: 60px;
        }

        /* Center dot */
        .crosshair-dot {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 2px;
          height: 2px;
          background: rgba(220, 225, 230, 0.85);
          box-shadow: 0 0 3px rgba(220, 225, 230, 0.85), 0 0 6px rgba(220, 225, 230, 0.3);
          border-radius: 50%;
          z-index: 2;
        }

        /* Crosshair lines */
        .crosshair-line {
          position: absolute;
          background: rgba(220, 225, 230, 0.85);
          opacity: 0.9;
        }

        .crosshair-line.top {
          width: 2px;
          height: 12px;
          left: 50%;
          top: 8px;
          transform: translateX(-50%);
          box-shadow: 0 0 2px rgba(220, 225, 230, 0.85);
        }

        .crosshair-line.bottom {
          width: 2px;
          height: 12px;
          left: 50%;
          bottom: 8px;
          transform: translateX(-50%);
          box-shadow: 0 0 2px rgba(220, 225, 230, 0.85);
        }

        .crosshair-line.left {
          width: 12px;
          height: 2px;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          box-shadow: 0 0 2px rgba(220, 225, 230, 0.85);
        }

        .crosshair-line.right {
          width: 12px;
          height: 2px;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          box-shadow: 0 0 2px rgba(220, 225, 230, 0.85);
        }

        /* Corner brackets for tactical feel */
        .crosshair-bracket {
          position: absolute;
          border: 1px solid rgba(220, 225, 230, 0.85);
          opacity: 0.5;
        }

        .crosshair-bracket.tl {
          top: 18px;
          left: 18px;
          width: 8px;
          height: 8px;
          border-right: none;
          border-bottom: none;
        }

        .crosshair-bracket.tr {
          top: 18px;
          right: 18px;
          width: 8px;
          height: 8px;
          border-left: none;
          border-bottom: none;
        }

        .crosshair-bracket.bl {
          bottom: 18px;
          left: 18px;
          width: 8px;
          height: 8px;
          border-right: none;
          border-top: none;
        }

        .crosshair-bracket.br {
          bottom: 18px;
          right: 18px;
          width: 8px;
          height: 8px;
          border-left: none;
          border-top: none;
        }

        /* Dynamic spread indicator (for future use) */
        .spread-indicator {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 30px;
          height: 30px;
          border: 1px solid rgba(220, 225, 230, 0.2);
          border-radius: 50%;
          transition: all 0.1s ease;
          pointer-events: none;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.5; }
        }

        .crosshair-line {
          animation: pulse 3s infinite;
        }
      </style>
      <div class="tactical-crosshair">
        <div class="crosshair-dot"></div>
        <div class="crosshair-line top"></div>
        <div class="crosshair-line bottom"></div>
        <div class="crosshair-line left"></div>
        <div class="crosshair-line right"></div>
        <div class="crosshair-bracket tl"></div>
        <div class="crosshair-bracket tr"></div>
        <div class="crosshair-bracket bl"></div>
        <div class="crosshair-bracket br"></div>
        <div class="spread-indicator"></div>
      </div>
    `;

    document.body.appendChild(this.crosshair);
  }

  hideCrosshair(): void {
    if (this.crosshair) {
      this.crosshair.style.display = 'none';
    }
  }

  showCrosshairAgain(): void {
    if (this.crosshair) {
      this.crosshair.style.display = 'block';
    }
  }

  dispose(): void {
    if (this.crosshair && this.crosshair.parentElement) {
      this.crosshair.parentElement.removeChild(this.crosshair);
      this.crosshair = undefined;
    }
  }

  getElement(): HTMLDivElement | undefined {
    return this.crosshair;
  }
}
