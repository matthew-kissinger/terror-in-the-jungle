import { isTouchDevice } from '../../utils/DeviceDetector';

export class HelicopterMouseIndicator {
  public helicopterMouseIndicator: HTMLDivElement;

  constructor() {
    this.helicopterMouseIndicator = this.createHelicopterMouseIndicator();
  }

  private createHelicopterMouseIndicator(): HTMLDivElement {
    // Hide on mobile - helicopter keyboard controls not accessible
    if (isTouchDevice()) {
      const dummy = document.createElement('div');
      dummy.style.display = 'none';
      return dummy;
    }

    const indicator = document.createElement('div');
    indicator.className = 'helicopter-mouse-indicator';
    indicator.style.cssText = `
      position: fixed;
      left: 20px;
      top: calc(50% + 120px);
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
    `;

    // Mouse icon (simple representation)
    const mouseIcon = document.createElement('div');
    mouseIcon.className = 'mouse-icon';
    mouseIcon.style.cssText = `
      width: 20px;
      height: 26px;
      border: 2px solid rgba(255, 255, 255, 0.7);
      border-radius: 8px 8px 12px 12px;
      position: relative;
      margin-bottom: 4px;
      background: rgba(255, 255, 255, 0.1);
    `;

    // Mouse scroll wheel
    const scrollWheel = document.createElement('div');
    scrollWheel.style.cssText = `
      position: absolute;
      top: 4px;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      height: 6px;
      background: rgba(255, 255, 255, 0.7);
      border-radius: 1px;
    `;
    mouseIcon.appendChild(scrollWheel);

    // Status text
    const statusText = document.createElement('div');
    statusText.className = 'mouse-status-text';
    statusText.style.cssText = `
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      line-height: 1.2;
    `;
    statusText.textContent = 'CONTROL';

    // Mode label
    const modeLabel = document.createElement('div');
    modeLabel.style.cssText = `
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-top: 2px;
      text-transform: uppercase;
    `;
    modeLabel.textContent = 'RCTRL';

    indicator.appendChild(mouseIcon);
    indicator.appendChild(statusText);
    indicator.appendChild(modeLabel);

    return indicator;
  }

  showHelicopterMouseIndicator(): void {
    this.helicopterMouseIndicator.style.display = 'flex';
  }

  hideHelicopterMouseIndicator(): void {
    this.helicopterMouseIndicator.style.display = 'none';
  }

  updateHelicopterMouseMode(controlMode: boolean): void {
    const statusText = this.helicopterMouseIndicator.querySelector('.mouse-status-text') as HTMLElement;
    const mouseIcon = this.helicopterMouseIndicator.querySelector('.mouse-icon') as HTMLElement;

    if (statusText) {
      statusText.textContent = controlMode ? 'CONTROL' : 'FREE LOOK';
      statusText.style.color = controlMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(100, 200, 255, 0.9)';
    }

    if (mouseIcon) {
      mouseIcon.style.borderColor = controlMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(100, 200, 255, 0.7)';
      mouseIcon.style.background = controlMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(100, 200, 255, 0.1)';
    }
  }
}
