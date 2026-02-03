export class HelicopterInstrumentsPanel {
  public helicopterInstruments: HTMLDivElement;

  constructor() {
    this.helicopterInstruments = this.createHelicopterInstruments();
  }

  private createHelicopterInstruments(): HTMLDivElement {
    const instruments = document.createElement('div');
    instruments.className = 'helicopter-instruments';
    instruments.style.cssText = `
      position: fixed;
      left: 20px;
      top: calc(50% + 200px);
      width: 60px;
      height: auto;
      background: linear-gradient(to bottom, rgba(10, 10, 14, 0.6), rgba(10, 10, 14, 0.3));
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      z-index: 110;
      pointer-events: none;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
      gap: 6px;
    `;

    // Collective (Thrust) Indicator
    const collectiveContainer = document.createElement('div');
    collectiveContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    `;

    const collectiveLabel = document.createElement('div');
    collectiveLabel.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-bottom: 2px;
      text-transform: uppercase;
    `;
    collectiveLabel.textContent = 'THRU';

    const collectiveBar = document.createElement('div');
    collectiveBar.className = 'collective-bar';
    collectiveBar.style.cssText = `
      width: 12px;
      height: 30px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      position: relative;
      border-radius: 2px;
      background: rgba(0, 0, 0, 0.3);
    `;

    const collectiveFill = document.createElement('div');
    collectiveFill.className = 'collective-fill';
    collectiveFill.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 0%;
      background: linear-gradient(to top, #00ff44, #88ff44);
      border-radius: 1px;
      transition: height 0.1s ease;
    `;

    collectiveBar.appendChild(collectiveFill);
    collectiveContainer.appendChild(collectiveLabel);
    collectiveContainer.appendChild(collectiveBar);

    // RPM Indicator
    const rpmContainer = document.createElement('div');
    rpmContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    `;

    const rpmLabel = document.createElement('div');
    rpmLabel.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-bottom: 2px;
      text-transform: uppercase;
    `;
    rpmLabel.textContent = 'RPM';

    const rpmValue = document.createElement('div');
    rpmValue.className = 'rpm-value';
    rpmValue.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: bold;
      text-align: center;
    `;
    rpmValue.textContent = '0%';

    rpmContainer.appendChild(rpmLabel);
    rpmContainer.appendChild(rpmValue);

    // Status Indicators
    const statusContainer = document.createElement('div');
    statusContainer.style.cssText = `
      display: flex;
      gap: 4px;
      width: 100%;
      justify-content: center;
    `;

    const hoverIndicator = document.createElement('div');
    hoverIndicator.className = 'hover-indicator';
    hoverIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 2px;
      background: rgba(0, 100, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.7);
      font-weight: bold;
    `;
    hoverIndicator.textContent = 'H';

    const boostIndicator = document.createElement('div');
    boostIndicator.className = 'boost-indicator';
    boostIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 2px;
      background: rgba(100, 50, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.7);
      font-weight: bold;
    `;
    boostIndicator.textContent = 'B';

    statusContainer.appendChild(hoverIndicator);
    statusContainer.appendChild(boostIndicator);

    instruments.appendChild(collectiveContainer);
    instruments.appendChild(rpmContainer);
    instruments.appendChild(statusContainer);

    return instruments;
  }

  showHelicopterInstruments(): void {
    this.helicopterInstruments.style.display = 'flex';
  }

  hideHelicopterInstruments(): void {
    this.helicopterInstruments.style.display = 'none';
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    // Update collective (thrust) bar
    if (this.collectiveFill) {
      const percentage = Math.round(collective * 100);
      this.collectiveFill.style.height = `${percentage}%`;

      // Color coding for collective
      if (percentage > 80) {
        this.collectiveFill.style.background = HelicopterInstrumentsPanel.GRADIENT_HIGH; // Red for high thrust
      } else if (percentage > 50) {
        this.collectiveFill.style.background = HelicopterInstrumentsPanel.GRADIENT_MED; // Yellow for medium
      } else {
        this.collectiveFill.style.background = HelicopterInstrumentsPanel.GRADIENT_NORMAL; // Green for normal
      }
    }

    // Update RPM display
    if (this.rpmValue) {
      const rpmPercentage = Math.round(rpm * 100);
      this.rpmValue.textContent = `${rpmPercentage}%`;

      // Color coding for RPM
      if (rpmPercentage < 30) {
        this.rpmValue.style.color = 'rgba(255, 100, 100, 0.9)'; // Red for low RPM
      } else if (rpmPercentage > 90) {
        this.rpmValue.style.color = 'rgba(255, 255, 100, 0.9)'; // Yellow for high RPM
      } else {
        this.rpmValue.style.color = 'rgba(255, 255, 255, 0.9)'; // White for normal
      }
    }

    // Update hover assist indicator
    if (this.hoverIndicator) {
      if (autoHover) {
        this.hoverIndicator.style.background = 'rgba(0, 200, 0, 0.6)';
        this.hoverIndicator.style.borderColor = 'rgba(0, 255, 0, 0.8)';
        this.hoverIndicator.style.color = 'rgba(255, 255, 255, 1)';
      } else {
        this.hoverIndicator.style.background = 'rgba(100, 100, 100, 0.3)';
        this.hoverIndicator.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        this.hoverIndicator.style.color = 'rgba(255, 255, 255, 0.5)';
      }
    }

    // Update boost indicator
    if (this.boostIndicator) {
      if (engineBoost) {
        this.boostIndicator.style.background = 'rgba(255, 150, 0, 0.6)';
        this.boostIndicator.style.borderColor = 'rgba(255, 200, 0, 0.8)';
        this.boostIndicator.style.color = 'rgba(255, 255, 255, 1)';
      } else {
        this.boostIndicator.style.background = 'rgba(100, 100, 100, 0.3)';
        this.boostIndicator.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        this.boostIndicator.style.color = 'rgba(255, 255, 255, 0.5)';
      }
    }
  }
}
