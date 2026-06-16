// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * WeaponSwitchFeedback - Shows weapon name and icon when switching weapons
 */
export class WeaponSwitchFeedback {
  private container: HTMLDivElement;
  private iconElement: HTMLDivElement;
  private nameElement: HTMLDivElement;
  private ammoElement: HTMLDivElement;
  private fadeOutTimer?: number;
  private hideTimer?: number;
  private readonly DISPLAY_DURATION = 2000; // 2 seconds
  private readonly FADE_DURATION = 500; // 500ms fade
  private styleId = 'weapon-switch-feedback-styles';

  constructor() {
    this.container = this.createContainer();
    this.iconElement = this.createChild('weapon-switch-icon');
    this.nameElement = this.createChild('weapon-switch-name');
    this.ammoElement = this.createChild('weapon-switch-ammo');
    this.container.appendChild(this.iconElement);
    this.container.appendChild(this.nameElement);
    this.container.appendChild(this.ammoElement);
    this.injectStyles();
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'weapon-switch-feedback';
    container.style.cssText = `
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      margin: 0 auto;
    `;
    return container;
  }

  private createChild(className: string): HTMLDivElement {
    const element = document.createElement('div');
    element.className = className;
    return element;
  }

  private injectStyles(): void {
    // Check if styles already exist
    if (document.getElementById(this.styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      .weapon-switch-feedback {
        animation: weaponSwitchSlideUp 0.3s ease-out;
      }

      .weapon-switch-feedback.fade-out {
        animation: weaponSwitchFadeOut 0.5s ease-out forwards;
      }

      @keyframes weaponSwitchSlideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes weaponSwitchFadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }

      .weapon-switch-icon {
        font-size: 20px;
        font-weight: 700;
        margin-bottom: 4px;
        color: rgba(231, 217, 186, 0.7);
      }

      .weapon-switch-name {
        font-family: var(--type-stamp);
        font-size: 18px;
        font-weight: 700;
        color: rgba(231, 217, 186, 0.95);
        text-transform: uppercase;
        letter-spacing: 1.5px;
        background: rgba(43, 38, 32, 0.78);
        padding: 6px 18px;
        border-radius: 3px;
        border: 1px solid rgba(231, 217, 186, 0.4);
        backdrop-filter: blur(6px);
      }

      .weapon-switch-ammo {
        font-family: var(--type);
        font-size: 13px;
        font-weight: 600;
        color: rgba(231, 217, 186, 0.6);
        margin-top: 4px;
      }

      /* Hide on touch devices - weapon bar already highlights active weapon */
      @media (pointer: coarse) {
        .weapon-switch-feedback {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  show(weaponName: string, weaponIcon: string, currentAmmo?: string): void {
    this.clearTimers();

    // Remove fade-out class if it exists
    this.container.classList.remove('fade-out');

    // Update content
    this.setTextIfChanged(this.iconElement, weaponIcon);
    this.setTextIfChanged(this.nameElement, weaponName);
    this.setTextIfChanged(this.ammoElement, currentAmmo ?? '');
    this.ammoElement.style.display = currentAmmo ? '' : 'none';

    // Show the container
    this.container.style.display = 'flex';

    // Schedule fade out
    this.fadeOutTimer = window.setTimeout(() => {
      this.container.classList.add('fade-out');
      this.fadeOutTimer = undefined;

      // Hide after fade animation completes
      this.hideTimer = window.setTimeout(() => {
        this.container.style.display = 'none';
        this.hideTimer = undefined;
      }, this.FADE_DURATION);
    }, this.DISPLAY_DURATION);
  }

  hide(): void {
    this.clearTimers();
    this.container.style.display = 'none';
    this.container.classList.remove('fade-out');
  }

  attachToDOM(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  dispose(): void {
    this.clearTimers();

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // Clean up injected styles
    const styleElement = document.getElementById(this.styleId);
    if (styleElement) {
      styleElement.remove();
    }
  }

  private clearTimers(): void {
    if (this.fadeOutTimer !== undefined) {
      window.clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = undefined;
    }
    if (this.hideTimer !== undefined) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
  }

  private setTextIfChanged(element: HTMLElement, text: string): void {
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }
}
