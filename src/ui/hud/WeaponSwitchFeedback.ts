/**
 * WeaponSwitchFeedback - Shows weapon name and icon when switching weapons
 */
export class WeaponSwitchFeedback {
  private container: HTMLDivElement;
  private fadeOutTimer?: number;
  private readonly DISPLAY_DURATION = 2000; // 2 seconds
  private readonly FADE_DURATION = 500; // 500ms fade
  private styleId = 'weapon-switch-feedback-styles';

  constructor() {
    this.container = this.createContainer();
    this.injectStyles();
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'weapon-switch-feedback';
    container.style.cssText = `
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      pointer-events: none;
    `;
    return container;
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
          transform: translateX(-50%) translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
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
        color: rgba(220, 225, 230, 0.7);
      }

      .weapon-switch-name {
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
        font-size: 18px;
        font-weight: 700;
        color: rgba(220, 225, 230, 0.9);
        text-transform: uppercase;
        letter-spacing: 1.5px;
        background: rgba(8, 12, 18, 0.6);
        padding: 6px 18px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(6px);
      }

      .weapon-switch-ammo {
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: rgba(220, 225, 230, 0.55);
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
    // Clear any existing timeout
    if (this.fadeOutTimer !== undefined) {
      window.clearTimeout(this.fadeOutTimer);
    }

    // Remove fade-out class if it exists
    this.container.classList.remove('fade-out');

    // Update content
    this.container.innerHTML = `
      <div class="weapon-switch-icon">${weaponIcon}</div>
      <div class="weapon-switch-name">${weaponName}</div>
      ${currentAmmo ? `<div class="weapon-switch-ammo">${currentAmmo}</div>` : ''}
    `;

    // Show the container
    this.container.style.display = 'flex';

    // Schedule fade out
    this.fadeOutTimer = window.setTimeout(() => {
      this.container.classList.add('fade-out');

      // Hide after fade animation completes
      window.setTimeout(() => {
        this.container.style.display = 'none';
      }, this.FADE_DURATION);
    }, this.DISPLAY_DURATION);
  }

  hide(): void {
    if (this.fadeOutTimer !== undefined) {
      window.clearTimeout(this.fadeOutTimer);
    }
    this.container.style.display = 'none';
    this.container.classList.remove('fade-out');
  }

  attachToDOM(): void {
    document.body.appendChild(this.container);
  }

  dispose(): void {
    if (this.fadeOutTimer !== undefined) {
      window.clearTimeout(this.fadeOutTimer);
    }

    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // Clean up injected styles
    const styleElement = document.getElementById(this.styleId);
    if (styleElement) {
      styleElement.remove();
    }
  }
}
