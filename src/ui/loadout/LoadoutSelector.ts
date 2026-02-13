import { Logger } from '../../utils/Logger';
import { GameSystem } from '../../types';
import { GrenadeType } from '../../systems/combat/types';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';
import { renderGrenadePanel } from './LoadoutGrenadePanel';
import { renderWeaponPanel } from './LoadoutWeaponPanel';
import { LoadoutWeapon } from './LoadoutTypes';

export { LoadoutWeapon };

export class LoadoutSelector implements GameSystem {
  private overlayElement?: HTMLElement;
  private selectedWeapon: LoadoutWeapon = LoadoutWeapon.RIFLE;
  private selectedGrenade: GrenadeType = GrenadeType.FRAG;
  private isVisible = false;
  private boundOnKeyDown = this.onKeyDown.bind(this);
  private weaponOptionElements: HTMLElement[] = [];
  private weaponOptionHandlers: Array<(event: PointerEvent) => void> = [];
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
      font-family: 'Courier New', monospace;
      color: #fff;
    `;

    this.overlayElement.innerHTML = `
      <div style="text-align: center; max-width: 900px; padding: 40px; overflow-y: auto; max-height: 100vh;">
        <h1 style="font-size: 36px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 3px;">
          Select Loadout
        </h1>
        <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 40px;">
          Choose your primary weapon and grenade type
        </p>

        ${renderWeaponPanel()}

        ${renderGrenadePanel()}

        <div style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">
          <span style="background: rgba(255, 255, 255, 0.1); padding: 6px 12px; border-radius: 4px; margin: 0 8px;">
            ${shouldUseTouchControls() ? 'TAP' : 'CLICK'}
          </span>
          to select weapon
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
      .loadout-option {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .loadout-option:hover {
        border-color: rgba(0, 255, 100, 0.6) !important;
        background: rgba(30, 30, 40, 0.8) !important;
        transform: scale(1.05);
      }

      .loadout-option.selected {
        border-color: rgba(0, 255, 100, 0.8) !important;
        background: rgba(0, 255, 100, 0.15) !important;
        box-shadow: 0 0 20px rgba(0, 255, 100, 0.4);
      }

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

    // Mark rifle as initially selected
    this.updateSelection();
  }

  private setupEventListeners(): void {
    if (!this.overlayElement) return;

    // Click on weapon options - use pointerdown for immediate response
    const options = this.overlayElement.querySelectorAll('.loadout-option');
    options.forEach(option => {
      const optionElement = option as HTMLElement;
      const pointerHandler = (e: PointerEvent) => {
        // Only trigger on primary button (left click) or touch
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        
        const weapon = optionElement.dataset.weapon as LoadoutWeapon;
        this.selectedWeapon = weapon;
        this.updateSelection();
      };
      this.weaponOptionElements.push(optionElement);
      this.weaponOptionHandlers.push(pointerHandler);
      optionElement.addEventListener('pointerdown', pointerHandler);
      // Prevent click from doing anything else if we handle pointerdown
      optionElement.addEventListener('click', (e) => e.preventDefault());
    });

    // Click on grenade options - use pointerdown
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

    // Number keys 1-4 for quick select
    if (event.code === 'Digit1') {
      this.selectedWeapon = LoadoutWeapon.RIFLE;
      this.updateSelection();
    } else if (event.code === 'Digit2') {
      this.selectedWeapon = LoadoutWeapon.SHOTGUN;
      this.updateSelection();
    } else if (event.code === 'Digit3') {
      this.selectedWeapon = LoadoutWeapon.SMG;
      this.updateSelection();
    } else if (event.code === 'Digit4') {
      this.selectedWeapon = LoadoutWeapon.PISTOL;
      this.updateSelection();
    }
  }

  private updateSelection(): void {
    if (!this.overlayElement) return;

    // Update weapon selection
    const options = this.overlayElement.querySelectorAll('.loadout-option');
    options.forEach(option => {
      const weapon = (option as HTMLElement).dataset.weapon;
      if (weapon === this.selectedWeapon) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });

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
    Logger.info('ui', `Loadout selected: ${this.selectedWeapon.toUpperCase()}, Grenade: ${this.selectedGrenade.toUpperCase()}`);

    if (this.onLoadoutSelected) {
      this.onLoadoutSelected(this.selectedWeapon, this.selectedGrenade);
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
   * Get currently selected weapon
   */
  getSelectedWeapon(): LoadoutWeapon {
    return this.selectedWeapon;
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
    this.weaponOptionElements.forEach((option, index) => {
      const handler = this.weaponOptionHandlers[index];
      if (handler) {
        option.removeEventListener('pointerdown', handler);
      }
    });
    this.weaponOptionElements = [];
    this.weaponOptionHandlers = [];

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
