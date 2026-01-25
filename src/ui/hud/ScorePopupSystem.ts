interface ScorePopup {
  element: HTMLDivElement;
  active: boolean;
  startTime: number;
  points: number;
  type: 'capture' | 'defend' | 'secured';
}

export class ScorePopupSystem {
  private pool: ScorePopup[] = [];
  private container: HTMLDivElement;
  private readonly POOL_SIZE = 10;
  private readonly ANIMATION_DURATION = 1200; // ms

  constructor() {
    // Create container for score popups
    this.container = document.createElement('div');
    this.container.className = 'score-popups-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 200;
    `;

    // Initialize pool
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const element = this.createPopupElement();
      this.pool.push({
        element,
        active: false,
        startTime: 0,
        points: 0,
        type: 'capture'
      });
      this.container.appendChild(element);
    }

    // Inject CSS
    this.injectStyles();
  }

  private createPopupElement(): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'score-popup';
    element.style.cssText = `
      position: fixed;
      font-family: 'Courier New', monospace;
      font-size: 24px;
      font-weight: bold;
      text-shadow:
        1px 1px 2px rgba(0, 0, 0, 0.9),
        0 0 4px rgba(0, 0, 0, 0.7);
      display: none;
      white-space: nowrap;
      transform: translate(-50%, -50%);
      bottom: 50%;
      left: 50%;
    `;
    return element;
  }

  private injectStyles(): void {
    const styleId = 'score-popup-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes scorePopupFloat {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.6);
          bottom: 50%;
        }
        10% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.2);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, calc(-50% - 120px)) scale(0.8);
          bottom: auto;
        }
      }

      .score-popup {
        animation: scorePopupFloat 1.2s ease-out forwards;
      }

      .score-popup.capture {
        color: #4499ff;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 8px rgba(68, 153, 255, 0.6);
      }

      .score-popup.defend {
        color: #ffff44;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 8px rgba(255, 255, 68, 0.6);
      }

      .score-popup.secured {
        color: #44ff44;
        font-size: 26px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 10px rgba(68, 255, 68, 0.7);
      }
    `;
    document.head.appendChild(style);
  }

  spawn(type: 'capture' | 'defend' | 'secured', points: number): void {
    // Find inactive popup from pool
    let popup = this.pool.find(p => !p.active);

    if (!popup) {
      console.warn('⚠️ Score popup pool exhausted');
      return;
    }

    // Activate and configure
    popup.active = true;
    popup.startTime = performance.now();
    popup.points = points;
    popup.type = type;

    // Set text and style
    const element = popup.element;
    const typeText = type === 'capture' ? '+' + points + ' CAPTURE' :
                     type === 'defend' ? '+' + points + ' DEFEND' :
                     '+' + points + ' ZONE SECURED';
    element.textContent = typeText;
    element.className = 'score-popup';
    element.classList.add(type);

    // Reset position for animation
    element.style.bottom = '50%';

    // Force reflow to restart animation
    element.style.display = 'block';
    void element.offsetWidth; // Trigger reflow
  }

  update(): void {
    const now = performance.now();

    for (const popup of this.pool) {
      if (!popup.active) continue;

      const elapsed = now - popup.startTime;

      // Deactivate after animation completes
      if (elapsed >= this.ANIMATION_DURATION) {
        popup.active = false;
        popup.element.style.display = 'none';
      }
    }
  }

  attachToDOM(): void {
    document.body.appendChild(this.container);
  }

  dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }

    // Remove injected styles
    const styleElement = document.getElementById('score-popup-styles');
    if (styleElement) {
      styleElement.remove();
    }
  }
}
