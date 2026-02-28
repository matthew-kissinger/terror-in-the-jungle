

export class PlayerHealthUI {
  private healthDisplay: HTMLDivElement;
  private styleSheet: HTMLStyleElement;

  private readonly UI_STYLES = `
    .health-display {
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 4px 12px;
      border: none;
      border-radius: 50px;
      color: rgba(220, 225, 230, 0.9);
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
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
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }

    .health-fill {
      height: 100%;
      background: rgba(92, 184, 92, 0.85);
      transition: width 0.3s ease, background-color 0.3s ease;
      border-radius: 2px;
    }

    .low-health {
      animation: redPulse 1s infinite;
    }

    @keyframes redPulse {
      0%, 100% { box-shadow: 0 0 0 rgba(201, 86, 74, 0); }
      50% { box-shadow: 0 0 12px rgba(201, 86, 74, 0.4); }
    }

    .spawn-protection {
      animation: protectionPulse 0.5s infinite;
    }

    @keyframes protectionPulse {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1.0; }
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
        healthFill.style.background = 'rgba(92, 184, 92, 0.85)';
        healthPct.style.color = 'rgba(220, 225, 230, 0.9)';
      } else if (healthPercent > 30) {
        healthFill.style.background = 'rgba(212, 163, 68, 0.85)';
        healthPct.style.color = 'rgba(212, 163, 68, 0.95)';
      } else {
        healthFill.style.background = 'rgba(201, 86, 74, 0.85)';
        healthPct.style.color = 'rgba(201, 86, 74, 0.95)';
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


  dispose(): void {
    if (this.healthDisplay.parentNode) {
      this.healthDisplay.parentNode.removeChild(this.healthDisplay);
    }
    if (this.styleSheet.parentNode) {
      this.styleSheet.parentNode.removeChild(this.styleSheet);
    }
  }
}
