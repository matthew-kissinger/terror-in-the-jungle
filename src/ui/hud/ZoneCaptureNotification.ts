// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
      pointer-events: none;
      text-align: center;
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
    // Field-green = secured, stamp-red = lost. Lifted variants for legibility on the dark ink chip.
    const color = isCaptured ? '#8aa86a' : '#cf6a55';
    const borderColor = isCaptured ? 'rgba(79, 107, 58, 0.6)' : 'rgba(158, 59, 46, 0.6)';
    const text = isCaptured ? 'CAPTURED' : 'LOST';

    notification.style.cssText = `
      padding: 16px 36px;
      background: rgba(43, 38, 32, 0.82);
      border: 1px solid ${borderColor};
      border-radius: 3px;
      text-align: center;
      animation: zoneNotifyFadeIn 0.3s ease-out;
      backdrop-filter: blur(8px);
      font-family: var(--type);
    `;

    notification.innerHTML = `
      <div style="
        font-family: var(--type-stamp);
        font-size: 28px;
        font-weight: 500;
        color: var(--paper-lt);
        margin-bottom: 6px;
        letter-spacing: 2px;
      ">ZONE ${zoneName}</div>
      <div style="
        font-family: var(--type-stamp);
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
