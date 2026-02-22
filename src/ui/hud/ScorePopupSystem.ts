import { Logger } from '../../utils/Logger';

interface ScorePopup {
  element: HTMLDivElement;
  active: boolean;
  startTime: number;
  points: number;
  type: 'capture' | 'defend' | 'secured' | 'kill' | 'headshot' | 'assist';
  stackIndex: number; // For vertical stacking
}

export class ScorePopupSystem {
  private pool: ScorePopup[] = [];
  private container: HTMLDivElement;
  private readonly POOL_SIZE = 20; // Increased for more simultaneous popups
  private readonly ANIMATION_DURATION = 2000; // Increased to 2 seconds
  private activePopups: ScorePopup[] = []; // Track active popups for stacking

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
        type: 'capture',
        stackIndex: 0
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
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
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
          transform: translate(-50%, -50%) scale(0.5);
          bottom: 50%;
        }
        15% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.3);
        }
        20% {
          transform: translate(-50%, -50%) scale(1.0);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, calc(-50% - 150px)) scale(0.9);
          bottom: auto;
        }
      }

      .score-popup {
        animation: scorePopupFloat 2s ease-out forwards;
      }

      .score-popup.capture {
        color: rgba(91, 140, 201, 0.95);
        font-size: 28px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 6px rgba(91, 140, 201, 0.4);
      }

      .score-popup.defend {
        color: rgba(212, 163, 68, 0.95);
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 4px rgba(212, 163, 68, 0.3);
      }

      .score-popup.secured {
        color: rgba(92, 184, 92, 0.95);
        font-size: 32px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 6px rgba(92, 184, 92, 0.4);
      }

      .score-popup.kill {
        color: rgba(220, 225, 230, 0.95);
        font-size: 26px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 5px rgba(220, 225, 230, 0.3);
      }

      .score-popup.headshot {
        color: rgba(212, 163, 68, 0.95);
        font-size: 24px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 5px rgba(212, 163, 68, 0.4);
      }

      .score-popup.assist {
        color: rgba(154, 168, 178, 0.95);
        font-size: 20px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 3px rgba(154, 168, 178, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  spawn(type: 'capture' | 'defend' | 'secured' | 'kill' | 'headshot' | 'assist', points: number, multiplier?: number): void {
    // Find inactive popup from pool
    let popup = this.pool.find(p => !p.active);

    if (!popup) {
      Logger.warn('ui', ' Score popup pool exhausted');
      return;
    }

    // Calculate stack index (how many active popups exist)
    const stackIndex = this.activePopups.length;

    // Activate and configure
    popup.active = true;
    popup.startTime = performance.now();
    popup.points = points;
    popup.type = type;
    popup.stackIndex = stackIndex;

    // Add to active popups for stacking
    this.activePopups.push(popup);

    // Set text and style
    const element = popup.element;
    let typeText = '';

    switch (type) {
      case 'capture':
        typeText = `+${points} ZONE CAPTURED`;
        break;
      case 'defend':
        typeText = `+${points} DEFEND`;
        break;
      case 'secured':
        typeText = `+${points} ZONE SECURED`;
        break;
      case 'kill':
        if (multiplier && multiplier > 1) {
          const bonusPoints = Math.round(points * (multiplier - 1));
          typeText = `+${points + bonusPoints} KILL (x${multiplier.toFixed(1)})`;
        } else {
          typeText = `+${points} KILL`;
        }
        break;
      case 'headshot':
        typeText = `+${points} HEADSHOT BONUS`;
        break;
      case 'assist':
        typeText = `+${points} CAPTURE ASSIST`;
        break;
    }

    element.textContent = typeText;
    element.className = 'score-popup';
    element.classList.add(type);

    // Apply vertical offset based on stack index (40px per popup)
    const verticalOffset = stackIndex * 45;
    element.style.bottom = `calc(50% + ${verticalOffset}px)`;

    // Force reflow to restart animation
    element.style.display = 'block';
    void element.offsetWidth; // Trigger reflow
  }

  update(): void {
    const now = performance.now();

    // Update all active popups
    for (const popup of this.pool) {
      if (!popup.active) continue;

      const elapsed = now - popup.startTime;

      // Deactivate after animation completes
      if (elapsed >= this.ANIMATION_DURATION) {
        popup.active = false;
        popup.element.style.display = 'none';
      }
    }

    // Clean up activePopups array (remove deactivated popups)
    this.activePopups = this.activePopups.filter(p => p.active);
  }

  attachToDOM(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
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
