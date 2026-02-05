

export class PlayerHealthUI {
  private healthDisplay: HTMLDivElement;
  private styleSheet: HTMLStyleElement;

  private readonly UI_STYLES = `
    .health-display {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 10, 14, 0.35);
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      padding: 10px 14px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 10px;
      color: rgba(255, 255, 255, 0.95);
      font-family: 'Courier New', monospace;
      font-size: 16px;
      z-index: 200;
    }

    .health-bar {
      width: 260px;
      height: 14px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      overflow: hidden;
      margin-top: 6px;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }

    .health-fill {
      height: 100%;
      background: linear-gradient(90deg, rgba(255,68,68,0.9) 0%, rgba(255,170,68,0.9) 50%, rgba(68,255,68,0.9) 100%);
      transition: width 0.3s ease;
      border-radius: 999px;
    }

    .low-health {
      animation: redPulse 1s infinite;
    }

    @keyframes redPulse {
      0%, 100% { box-shadow: 0 0 0 rgba(255, 68, 68, 0); }
      50% { box-shadow: 0 0 20px rgba(255, 68, 68, 0.6); }
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
    document.body.appendChild(this.healthDisplay);
  }

  updateHealthDisplay(health: number, maxHealth: number): void {
    const healthValue = document.getElementById('health-value');
    const healthFill = document.getElementById('health-fill');

    if (healthValue && healthFill) {
      healthValue.textContent = Math.round(health).toString();
      const healthPercent = (health / maxHealth) * 100;
      healthFill.style.width = `${healthPercent}%`;
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