

export class PlayerHealthUI {
  private healthDisplay: HTMLDivElement;
  private styleSheet: HTMLStyleElement;

  private readonly UI_STYLES = `
    .health-display {
      background: rgba(8, 12, 18, 0.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      padding: 8px 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      color: rgba(220, 225, 230, 0.9);
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }

    .health-bar {
      width: clamp(120px, 20vw, 220px);
      height: 10px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 5px;
      border: 1px solid rgba(255, 255, 255, 0.06);
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
      <div>Health: <span id="health-value">150</span>/150</div>
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
    const healthValue = document.getElementById('health-value');
    const healthFill = document.getElementById('health-fill');

    if (healthValue && healthFill) {
      healthValue.textContent = Math.round(health).toString();
      const healthPercent = (health / maxHealth) * 100;
      healthFill.style.width = `${healthPercent}%`;

      // Dynamic color based on health percentage
      if (healthPercent > 60) {
        healthFill.style.background = 'rgba(92, 184, 92, 0.85)';
      } else if (healthPercent > 30) {
        healthFill.style.background = 'rgba(212, 163, 68, 0.85)';
      } else {
        healthFill.style.background = 'rgba(201, 86, 74, 0.85)';
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