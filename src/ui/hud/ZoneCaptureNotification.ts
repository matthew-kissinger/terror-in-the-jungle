import { zIndex } from '../design/tokens';

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
      z-index: ${zIndex.zoneCaptureNotification};
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
    const color = isCaptured ? 'rgba(92, 184, 92, 0.9)' : 'rgba(201, 86, 74, 0.9)';
    const borderColor = isCaptured ? 'rgba(92, 184, 92, 0.4)' : 'rgba(201, 86, 74, 0.4)';
    const text = isCaptured ? 'CAPTURED' : 'LOST';

    notification.style.cssText = `
      padding: 16px 36px;
      background: rgba(8, 12, 18, 0.8);
      border: 1px solid ${borderColor};
      border-radius: 4px;
      text-align: center;
      animation: zoneNotifyFadeIn 0.3s ease-out;
      backdrop-filter: blur(8px);
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
    `;

    notification.innerHTML = `
      <div style="
        font-size: 24px;
        font-weight: 700;
        color: ${color};
        margin-bottom: 6px;
        letter-spacing: 2px;
      ">ZONE ${zoneName}</div>
      <div style="
        font-size: 16px;
        font-weight: 700;
        color: ${color};
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
