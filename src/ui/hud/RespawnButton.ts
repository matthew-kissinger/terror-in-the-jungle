import { isTouchDevice } from '../../utils/DeviceDetector';

export class RespawnButton {
  public respawnButton: HTMLButtonElement;

  constructor() {
    this.respawnButton = this.createRespawnButton();
  }

  private createRespawnButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'respawn-button';
    const hintText = isTouchDevice() ? 'Tap to respawn' : 'Press K';
    button.innerHTML = `RESPAWN<br><span style="font-size: 10px; color: rgba(220, 225, 230, 0.5);">${hintText}</span>`;
    button.style.cssText = `
      position: fixed;
      bottom: 120px;
      right: 16px;
      padding: 10px 20px;
      background: rgba(201, 86, 74, 0.15);
      border: 1px solid rgba(201, 86, 74, 0.4);
      color: rgba(201, 86, 74, 0.9);
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
      z-index: 100;
      text-align: center;
      backdrop-filter: blur(6px);
      letter-spacing: 1px;
    `;

    button.onmouseover = () => {
      button.style.background = 'rgba(201, 86, 74, 0.25)';
      button.style.borderColor = 'rgba(201, 86, 74, 0.6)';
    };

    button.onmouseout = () => {
      button.style.background = 'rgba(201, 86, 74, 0.15)';
      button.style.borderColor = 'rgba(201, 86, 74, 0.4)';
    };

    return button;
  }
}
