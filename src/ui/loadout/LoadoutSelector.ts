import { Logger } from '../../utils/Logger';
import { GameSystem } from '../../types';
import { GrenadeType } from '../../systems/combat/types';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';
import { renderGrenadePanel } from './LoadoutGrenadePanel';
import { LoadoutWeapon } from './LoadoutTypes';

export { LoadoutWeapon };

export class LoadoutSelector implements GameSystem {
  private overlayElement?: HTMLElement;
  private selectedGrenade: GrenadeType = GrenadeType.FRAG;
  private isVisible = false;
  private boundOnKeyDown = this.onKeyDown.bind(this);
  private grenadeOptionElements: HTMLElement[] = [];
  private grenadeOptionHandlers: Array<(event: PointerEvent) => void> = [];

  private onLoadoutSelected?: (weapon: LoadoutWeapon, grenadeType: GrenadeType) => void;

  async init(): Promise<void> {
    Logger.info('ui', 'Initializing Loadout Selector...');
    this.createUI();
    this.setupEventListeners();
    Logger.info('ui', 'Loadout Selector initialized');
  }

  update(_deltaTime: number): void {
    // No per-frame updates needed
  }

  private createUI(): void {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'loadout-selector';
    this.overlayElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      color: #fff;
    `;

    this.overlayElement.innerHTML = `
      <div style="text-align: center; max-width: 800px; padding: 40px; overflow-y: auto; max-height: 100vh;">
        <h1 style="font-size: 36px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 3px;">
          Choose Grenade
        </h1>
        <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 40px;">
          Pick your grenade type for this match
        </p>

        ${renderGrenadePanel()}

        <div style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">
          <span style="background: rgba(255, 255, 255, 0.1); padding: 6px 12px; border-radius: 4px; margin: 0 8px;">
            ${shouldUseTouchControls() ? 'TAP' : 'CLICK'}
          </span>
          to select
          ${!shouldUseTouchControls() ? `
          <span style="background: rgba(255, 255, 255, 0.1); padding: 6px 12px; border-radius: 4px; margin: 0 8px;">
            SPACE
          </span>
          to spawn
          ` : ''}
        </div>
        ${shouldUseTouchControls() ? `
        <button class="loadout-spawn-button" style="
          margin-top: 24px;
          padding: 1rem 2.5rem;
          min-height: 48px;
          min-width: 200px;
          font-size: 1.1rem;
          font-family: inherit;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #fff;
          background: linear-gradient(135deg, rgba(0, 150, 80, 0.9), rgba(0, 200, 100, 0.9));
          border: 2px solid rgba(0, 255, 100, 0.6);
          border-radius: 12px;
          cursor: pointer;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        ">TAP TO SPAWN</button>
        ` : ''}
      </div>
    `;

    // Add hover styles
    const style = document.createElement('style');
    style.textContent = `
      .grenade-option {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .grenade-option:hover {
        border-color: rgba(255, 0, 0, 0.6) !important;
        background: rgba(30, 30, 40, 0.8) !important;
        transform: scale(1.05);
      }

      .grenade-option.selected {
        border-color: rgba(255, 0, 0, 0.8) !important;
        background: rgba(255, 0, 0, 0.15) !important;
        box-shadow: 0 0 20px rgba(255, 0, 0, 0.4);
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(this.overlayElement);

    // Mark frag as initially selected
    this.updateSelection();
  }

  private setupEventListeners(): void {
    if (!this.overlayElement) return;

    // Click on grenade options - use pointerdown for immediate response
    const grenadeOptions = this.overlayElement.querySelectorAll('.grenade-option');
    grenadeOptions.forEach(option => {
      const optionElement = option as HTMLElement;
      const pointerHandler = (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        const grenade = optionElement.dataset.grenade as GrenadeType;
        this.selectedGrenade = grenade;
        this.updateSelection();
      };
      this.grenadeOptionElements.push(optionElement);
      this.grenadeOptionHandlers.push(pointerHandler);
      optionElement.addEventListener('pointerdown', pointerHandler);
      optionElement.addEventListener('click', (e) => e.preventDefault());
    });

    // Spacebar to confirm (desktop)
    window.addEventListener('keydown', this.boundOnKeyDown);

    // Touch: Tap to spawn button
    const spawnButton = this.overlayElement.querySelector('.loadout-spawn-button');
    if (spawnButton) {
      // Use pointerdown for consistency
      spawnButton.addEventListener('pointerdown', (e) => {
        if ((e as PointerEvent).button !== 0 && (e as PointerEvent).pointerType === 'mouse') return;
        this.confirmSelection();
      });
      spawnButton.addEventListener('click', (e) => e.preventDefault());
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.isVisible) return;

    if (event.code === 'Space') {
      event.preventDefault();
      this.confirmSelection();
    }
  }

  private updateSelection(): void {
    if (!this.overlayElement) return;

    // Update grenade selection
    const grenadeOptions = this.overlayElement.querySelectorAll('.grenade-option');
    grenadeOptions.forEach(option => {
      const grenade = (option as HTMLElement).dataset.grenade;
      if (grenade === this.selectedGrenade) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
  }

  private confirmSelection(): void {
    Logger.info('ui', `Loadout selected: Grenade: ${this.selectedGrenade.toUpperCase()}`);

    if (this.onLoadoutSelected) {
      // Always use rifle as primary weapon - all weapons are available in-game via hotbar
      this.onLoadoutSelected(LoadoutWeapon.RIFLE, this.selectedGrenade);
    }

    this.hide();
  }

  /**
   * Show loadout selector
   */
  show(): void {
    if (!this.overlayElement) return;

    this.overlayElement.style.display = 'flex';
    this.isVisible = true;

    // Lock pointer
    document.exitPointerLock();

    Logger.info('ui', 'Loadout selector shown');
  }

  /**
   * Hide loadout selector
   */
  hide(): void {
    if (!this.overlayElement) return;

    this.overlayElement.style.display = 'none';
    this.isVisible = false;

    Logger.info('ui', 'Loadout selector hidden');
  }

  /**
   * Check if selector is currently visible
   */
  isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * Get currently selected grenade type
   */
  getSelectedGrenade(): GrenadeType {
    return this.selectedGrenade;
  }

  /**
   * Set callback for when loadout is confirmed
   */
  onConfirm(callback: (weapon: LoadoutWeapon, grenadeType: GrenadeType) => void): void {
    this.onLoadoutSelected = callback;
  }

  dispose(): void {
    this.grenadeOptionElements.forEach((option, index) => {
      const handler = this.grenadeOptionHandlers[index];
      if (handler) {
        option.removeEventListener('pointerdown', handler);
      }
    });
    this.grenadeOptionElements = [];
    this.grenadeOptionHandlers = [];

    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }

    window.removeEventListener('keydown', this.boundOnKeyDown);

    Logger.info('ui', 'Loadout Selector disposed');
  }
}
