// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger



export class PlayerHealthUI {
  private healthDisplay: HTMLDivElement;
  private styleSheet: HTMLStyleElement;
  private healFlashTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly UI_STYLES = `
    .health-display {
      background: rgba(43, 38, 32, 0.78);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 4px 12px;
      border: none;
      border-radius: 50px;
      color: rgba(231, 217, 186, 0.9);
      font-family: var(--font-primary);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.3px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    }

    .health-pct {
      font-variant-numeric: tabular-nums;
      font-size: 14px;
      line-height: 1;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
      min-width: 36px;
      text-align: center;
    }

    .health-bar {
      width: clamp(60px, 12vw, 100px);
      height: 4px;
      background: rgba(231, 217, 186, 0.14);
      border-radius: 2px;
      overflow: hidden;
    }

    .health-fill {
      height: 100%;
      background: rgba(79, 107, 58, 0.9);
      transition: width 0.3s ease, background-color 0.3s ease;
      border-radius: 2px;
    }

    .low-health {
      animation: redPulse 1s infinite;
    }

    @keyframes redPulse {
      0%, 100% { box-shadow: 0 0 0 rgba(158, 59, 46, 0); }
      50% { box-shadow: 0 0 12px rgba(158, 59, 46, 0.4); }
    }

    .spawn-protection {
      animation: protectionPulse 0.5s infinite;
    }

    @keyframes protectionPulse {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1.0; }
    }

    /* Bandage supply pip, tucked against the health pill (active-healing MVP). */
    .health-bandages {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      line-height: 1;
      color: rgba(231, 217, 186, 0.7);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
    }

    .health-bandages.depleted {
      color: rgba(231, 217, 186, 0.3);
    }

    .health-bandage-icon {
      color: rgba(158, 59, 46, 0.85);
      font-weight: 700;
    }

    /* Brief green flash on the health pill when a bandage heals. */
    .heal-flash {
      animation: healFlash 0.55s ease-out;
    }

    @keyframes healFlash {
      0% { box-shadow: 0 0 0 rgba(79, 107, 58, 0); }
      35% { box-shadow: 0 0 14px rgba(79, 107, 58, 0.55); }
      100% { box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35); }
    }

    @media (max-width: 480px) {
      .health-display {
        padding: 3px 10px;
        font-size: 12px;
      }
      .health-pct {
        font-size: 12px;
        min-width: 30px;
      }
      .health-bar {
        width: clamp(50px, 10vw, 80px);
        height: 3px;
      }
    }

    /* On touch, match minimap width exactly so they align as one column */
    @media (pointer: coarse) and (max-width: 480px) {
      .health-display {
        width: 100px;
        box-sizing: border-box;
      }
    }
    @media (pointer: coarse) and (min-width: 481px) and (max-width: 1024px) {
      .health-display {
        width: 130px;
        box-sizing: border-box;
      }
    }
  `;

  constructor() {
    this.healthDisplay = document.createElement('div');
    this.healthDisplay.className = 'health-display';

    this.styleSheet = document.createElement('style');
    this.styleSheet.textContent = this.UI_STYLES;

    this.setupUIContent();
  }

  private setupUIContent(): void {
    this.healthDisplay.innerHTML = `
      <span class="health-pct" id="health-pct">100%</span>
      <div class="health-bar">
        <div class="health-fill" id="health-fill" style="width: 100%"></div>
      </div>
      <span class="health-bandages" data-role="bandages">
        <span class="health-bandage-icon">+</span><span data-role="bandage-count">3</span>
      </span>
    `;
  }

  init(): void {
    document.head.appendChild(this.styleSheet);
  }

  mountTo(parent: HTMLElement): void {
    parent.appendChild(this.healthDisplay);
  }

  updateHealthDisplay(health: number, maxHealth: number): void {
    const healthPct = document.getElementById('health-pct');
    const healthFill = document.getElementById('health-fill');

    if (healthPct && healthFill) {
      const healthPercent = Math.round((health / maxHealth) * 100);
      healthPct.textContent = `${healthPercent}%`;
      healthFill.style.width = `${healthPercent}%`;

      // Dynamic color based on health percentage
      if (healthPercent > 60) {
        healthFill.style.background = 'rgba(79, 107, 58, 0.9)';
        healthPct.style.color = 'rgba(231, 217, 186, 0.9)';
      } else if (healthPercent > 30) {
        healthFill.style.background = 'rgba(168, 116, 42, 0.9)';
        healthPct.style.color = 'rgba(168, 116, 42, 0.95)';
      } else {
        healthFill.style.background = 'rgba(158, 59, 46, 0.9)';
        healthPct.style.color = 'rgba(158, 59, 46, 0.95)';
      }
    }
  }

  setLowHealthEffect(isLowHealth: boolean): void {
    if (isLowHealth && !this.healthDisplay.classList.contains('low-health')) {
      this.healthDisplay.classList.add('low-health');
    } else if (!isLowHealth && this.healthDisplay.classList.contains('low-health')) {
      this.healthDisplay.classList.remove('low-health');
    }
  }

  setSpawnProtection(hasProtection: boolean): void {
    if (hasProtection) {
      this.healthDisplay.classList.add('spawn-protection');
    } else {
      this.healthDisplay.classList.remove('spawn-protection');
    }
  }

  /** Render the current bandage supply in the pip next to the health pill. */
  updateBandageCount(count: number): void {
    const pip = this.healthDisplay.querySelector('[data-role="bandages"]');
    const value = this.healthDisplay.querySelector('[data-role="bandage-count"]');
    if (value) value.textContent = String(count);
    if (pip) pip.classList.toggle('depleted', count <= 0);
  }

  /** Brief green flash on the pill confirming an applied bandage heal. */
  flashHeal(): void {
    this.healthDisplay.classList.remove('heal-flash');
    // Force reflow so re-adding the class restarts the animation on rapid heals.
    void this.healthDisplay.offsetWidth;
    this.healthDisplay.classList.add('heal-flash');
    if (this.healFlashTimer !== null) {
      clearTimeout(this.healFlashTimer);
    }
    this.healFlashTimer = setTimeout(() => {
      this.healthDisplay.classList.remove('heal-flash');
      this.healFlashTimer = null;
    }, 600);
  }

  dispose(): void {
    if (this.healFlashTimer !== null) {
      clearTimeout(this.healFlashTimer);
      this.healFlashTimer = null;
    }
    if (this.healthDisplay.parentNode) {
      this.healthDisplay.parentNode.removeChild(this.healthDisplay);
    }
    if (this.styleSheet.parentNode) {
      this.styleSheet.parentNode.removeChild(this.styleSheet);
    }
  }
}
