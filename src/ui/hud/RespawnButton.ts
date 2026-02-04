export class RespawnButton {
  public respawnButton: HTMLButtonElement;

  constructor() {
    this.respawnButton = this.createRespawnButton();
  }

  private createRespawnButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'respawn-button';
    button.innerHTML = ' RESPAWN<br><span style="font-size: 10px;">Press K</span>';
    button.style.cssText = `
      position: fixed;
      bottom: 120px;
      right: 20px;
      padding: 12px 20px;
      background: rgba(255, 0, 0, 0.1);
      border: 2px solid rgba(255, 0, 0, 0.5);
      color: #ff6b6b;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      font-weight: bold;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.3s;
      z-index: 100;
      text-align: center;
      backdrop-filter: blur(5px);
    `;

    button.onmouseover = () => {
      button.style.background = 'rgba(255, 0, 0, 0.2)';
      button.style.borderColor = 'rgba(255, 0, 0, 0.8)';
      button.style.transform = 'scale(1.05)';
    };

    button.onmouseout = () => {
      button.style.background = 'rgba(255, 0, 0, 0.1)';
      button.style.borderColor = 'rgba(255, 0, 0, 0.5)';
      button.style.transform = 'scale(1)';
    };

    return button;
  }
}
