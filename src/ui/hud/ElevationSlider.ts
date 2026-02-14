export class ElevationSlider {
  public elevationSlider: HTMLDivElement;

  constructor() {
    this.elevationSlider = this.createElevationSlider();
  }

  private createElevationSlider(): HTMLDivElement {
    const slider = document.createElement('div');
    slider.className = 'elevation-slider';
    slider.style.cssText = `
      position: fixed;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 60px;
      height: auto;
      background: linear-gradient(to bottom, rgba(10, 10, 14, 0.6), rgba(10, 10, 14, 0.3));
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      z-index: 110;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
    `;

    // Current elevation display (center)
    const elevationDisplay = document.createElement('div');
    elevationDisplay.className = 'elevation-display';
    elevationDisplay.style.cssText = `
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: bold;
      text-align: center;
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 6px;
      border-radius: 4px;
      min-width: 40px;
    `;
    elevationDisplay.textContent = '5m';

    // Simple elevation label
    const label = document.createElement('div');
    label.style.cssText = `
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-top: 4px;
      text-transform: uppercase;
    `;
    label.textContent = 'ELEV';

    slider.appendChild(elevationDisplay);
    slider.appendChild(label);

    return slider;
  }

  updateElevation(elevation: number): void {
    const elevationDisplay = this.elevationSlider.querySelector('.elevation-display') as HTMLElement;
    if (elevationDisplay) {
      elevationDisplay.textContent = `${Math.round(elevation)}m`;
    }
  }
}
