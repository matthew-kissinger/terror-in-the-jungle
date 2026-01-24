import * as THREE from 'three';

interface DamageNumber {
  element: HTMLDivElement;
  active: boolean;
  worldPos: THREE.Vector3;
  startTime: number;
  damage: number;
  isHeadshot: boolean;
  isKill: boolean;
}

export class DamageNumberSystem {
  private camera: THREE.Camera;
  private pool: DamageNumber[] = [];
  private container: HTMLDivElement;
  private readonly POOL_SIZE = 30;
  private readonly ANIMATION_DURATION = 800; // ms
  private readonly FLOAT_DISTANCE = 60; // pixels to float upward

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    // Create container for damage numbers
    this.container = document.createElement('div');
    this.container.className = 'damage-numbers-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 100;
    `;

    // Initialize pool
    for (let i = 0; i < this.POOL_SIZE; i++) {
      const element = this.createDamageElement();
      this.pool.push({
        element,
        active: false,
        worldPos: new THREE.Vector3(),
        startTime: 0,
        damage: 0,
        isHeadshot: false,
        isKill: false
      });
      this.container.appendChild(element);
    }

    // Inject CSS
    this.injectStyles();
  }

  private createDamageElement(): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'damage-number';
    element.style.cssText = `
      position: absolute;
      font-family: 'Courier New', monospace;
      font-size: 18px;
      font-weight: bold;
      text-shadow:
        1px 1px 2px rgba(0, 0, 0, 0.9),
        0 0 4px rgba(0, 0, 0, 0.7);
      display: none;
      white-space: nowrap;
      transform: translate(-50%, -50%);
    `;
    return element;
  }

  private injectStyles(): void {
    const styleId = 'damage-number-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes damageFloat {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.8);
        }
        15% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.2);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, calc(-50% - 60px)) scale(0.9);
        }
      }

      .damage-number {
        animation: damageFloat 0.8s ease-out forwards;
      }

      .damage-number.normal {
        color: #ffffff;
      }

      .damage-number.headshot {
        color: #ffd700;
        font-size: 20px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 6px rgba(255, 215, 0, 0.6);
      }

      .damage-number.kill {
        color: #ff4444;
        font-size: 22px;
        text-shadow:
          1px 1px 2px rgba(0, 0, 0, 0.9),
          0 0 8px rgba(255, 68, 68, 0.7);
      }
    `;
    document.head.appendChild(style);
  }

  spawn(worldPos: THREE.Vector3, damage: number, isHeadshot: boolean = false, isKill: boolean = false): void {
    // Find inactive damage number from pool
    let damageNumber = this.pool.find(dn => !dn.active);

    if (!damageNumber) {
      console.warn('⚠️ Damage number pool exhausted');
      return;
    }

    // Activate and configure
    damageNumber.active = true;
    damageNumber.worldPos.copy(worldPos);
    damageNumber.startTime = performance.now();
    damageNumber.damage = Math.round(damage);
    damageNumber.isHeadshot = isHeadshot;
    damageNumber.isKill = isKill;

    // Set text and style
    const element = damageNumber.element;
    element.textContent = `-${damageNumber.damage}`;
    element.className = 'damage-number';

    if (isKill) {
      element.classList.add('kill');
    } else if (isHeadshot) {
      element.classList.add('headshot');
    } else {
      element.classList.add('normal');
    }

    // Force reflow to restart animation
    element.style.display = 'block';
    void element.offsetWidth; // Trigger reflow

    // Update initial position
    this.updateDamageNumberPosition(damageNumber);
  }

  update(): void {
    const now = performance.now();

    for (const damageNumber of this.pool) {
      if (!damageNumber.active) continue;

      const elapsed = now - damageNumber.startTime;

      // Deactivate after animation completes
      if (elapsed >= this.ANIMATION_DURATION) {
        damageNumber.active = false;
        damageNumber.element.style.display = 'none';
        continue;
      }

      // Update screen position as world position changes relative to camera
      this.updateDamageNumberPosition(damageNumber);
    }
  }

  private updateDamageNumberPosition(damageNumber: DamageNumber): void {
    // Project world position to screen coordinates
    const screenPos = this.worldToScreen(damageNumber.worldPos);

    // If behind camera or off-screen, hide
    if (screenPos.z > 1 || screenPos.x < 0 || screenPos.x > window.innerWidth ||
        screenPos.y < 0 || screenPos.y > window.innerHeight) {
      damageNumber.element.style.opacity = '0';
      return;
    }

    // Update position
    damageNumber.element.style.left = `${screenPos.x}px`;
    damageNumber.element.style.top = `${screenPos.y}px`;
  }

  private worldToScreen(worldPos: THREE.Vector3): { x: number; y: number; z: number } {
    const vector = worldPos.clone();
    vector.project(this.camera);

    return {
      x: (vector.x * 0.5 + 0.5) * window.innerWidth,
      y: (-vector.y * 0.5 + 0.5) * window.innerHeight,
      z: vector.z
    };
  }

  attachToDOM(): void {
    document.body.appendChild(this.container);
  }

  dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }

    // Remove injected styles
    const styleElement = document.getElementById('damage-number-styles');
    if (styleElement) {
      styleElement.remove();
    }
  }
}
