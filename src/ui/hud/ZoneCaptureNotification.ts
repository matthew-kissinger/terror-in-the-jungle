export class ZoneCaptureNotification {
  private container: HTMLDivElement;
  private currentNotification?: HTMLDivElement;
  private hideTimeout?: number;

  constructor() {
    this.container = this.createContainer();
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: 15%;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      pointer-events: none;
    `;
    return container;
  }

  showCapture(zoneName: string): void {
    this.show(zoneName, true);
  }

  showLost(zoneName: string): void {
    this.show(zoneName, false);
  }

  private show(zoneName: string, isCaptured: boolean): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    if (this.currentNotification) {
      this.currentNotification.remove();
    }

    const notification = document.createElement('div');
    const color = isCaptured ? '#00ff00' : '#ff0000';
    const text = isCaptured ? 'CAPTURED' : 'LOST';

    notification.style.cssText = `
      padding: 20px 40px;
      background: rgba(0, 0, 0, 0.85);
      border: 2px solid ${color};
      border-radius: 4px;
      text-align: center;
      animation: zoneNotifyFadeIn 0.3s ease-out;
      box-shadow: 0 0 20px ${color}40;
    `;

    notification.innerHTML = `
      <div style="
        font-size: 28px;
        font-weight: bold;
        color: ${color};
        text-shadow: 0 0 10px ${color};
        margin-bottom: 8px;
        letter-spacing: 2px;
      ">ZONE ${zoneName}</div>
      <div style="
        font-size: 20px;
        font-weight: bold;
        color: ${color};
        text-shadow: 0 0 8px ${color};
        letter-spacing: 1px;
      ">${text}</div>
    `;

    this.container.appendChild(notification);
    this.currentNotification = notification;

    this.hideTimeout = window.setTimeout(() => {
      notification.style.animation = 'zoneNotifyFadeOut 0.5s ease-in';
      setTimeout(() => {
        notification.remove();
        if (this.currentNotification === notification) {
          this.currentNotification = undefined;
        }
      }, 500);
    }, 3000);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('zone-capture-notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'zone-capture-notification-styles';
    style.textContent = `
      @keyframes zoneNotifyFadeIn {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes zoneNotifyFadeOut {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-20px) scale(0.9);
        }
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    this.container.remove();
  }
}
