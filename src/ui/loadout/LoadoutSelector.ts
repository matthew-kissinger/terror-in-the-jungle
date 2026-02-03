import * as THREE from 'three';
import { GameSystem } from '../../types';

export enum LoadoutWeapon {
  RIFLE = 'rifle',
  SHOTGUN = 'shotgun',
  SMG = 'smg'
}

interface WeaponStats {
  damage: string;
  range: string;
  fireRate: string;
  description: string;
}

export class LoadoutSelector implements GameSystem {
  private overlayElement?: HTMLElement;
  private selectedWeapon: LoadoutWeapon = LoadoutWeapon.RIFLE;
  private isVisible = false;
  private boundOnKeyDown = this.onKeyDown.bind(this);

  private onLoadoutSelected?: (weapon: LoadoutWeapon) => void;

  private readonly WEAPON_STATS: Record<LoadoutWeapon, WeaponStats> = {
    [LoadoutWeapon.RIFLE]: {
      damage: '●●●○○',
      range: '●●●●●',
      fireRate: '●●●●○',
      description: 'Balanced assault rifle - accurate at range'
    },
    [LoadoutWeapon.SHOTGUN]: {
      damage: '●●●●●',
      range: '●●○○○',
      fireRate: '●●○○○',
      description: 'Devastating close-range powerhouse'
    },
    [LoadoutWeapon.SMG]: {
      damage: '●●○○○',
      range: '●●●○○',
      fireRate: '●●●●●',
      description: 'High fire rate - spray and pray'
    }
  };

  async init(): Promise<void> {
    console.log('🎯 Initializing Loadout Selector...');
    this.createUI();
    this.setupEventListeners();
    console.log('✅ Loadout Selector initialized');
  }

  update(deltaTime: number): void {
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
      <div style="text-align: center; max-width: 900px; padding: 40px;">
        <h1 style="font-size: 36px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 3px;">
          Select Loadout
        </h1>
        <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 40px;">
          Choose your primary weapon - includes pistol secondary and 2 grenades
        </p>

        <div style="display: flex; gap: 24px; justify-content: center; margin-bottom: 40px;">
          <!-- Rifle Option -->
          <div class="loadout-option" data-weapon="rifle" style="
            flex: 1;
            max-width: 260px;
            background: rgba(20, 20, 30, 0.6);
            border: 3px solid rgba(0, 255, 100, 0.4);
            border-radius: 12px;
            padding: 24px;
            cursor: pointer;
            transition: all 0.2s;
          ">
            <div style="font-size: 48px; margin-bottom: 12px;">🔫</div>
            <h2 style="font-size: 24px; margin-bottom: 8px; text-transform: uppercase;">Rifle</h2>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-bottom: 16px;">
              ${this.WEAPON_STATS.rifle.description}
            </div>
            <div style="text-align: left; font-size: 13px; line-height: 1.8;">
              <div><strong>Damage:</strong> ${this.WEAPON_STATS.rifle.damage}</div>
              <div><strong>Range:</strong> ${this.WEAPON_STATS.rifle.range}</div>
              <div><strong>Fire Rate:</strong> ${this.WEAPON_STATS.rifle.fireRate}</div>
            </div>
          </div>

          <!-- Shotgun Option -->
          <div class="loadout-option" data-weapon="shotgun" style="
            flex: 1;
            max-width: 260px;
            background: rgba(20, 20, 30, 0.6);
            border: 3px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 24px;
            cursor: pointer;
            transition: all 0.2s;
          ">
            <div style="font-size: 48px; margin-bottom: 12px;">💥</div>
            <h2 style="font-size: 24px; margin-bottom: 8px; text-transform: uppercase;">Shotgun</h2>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-bottom: 16px;">
              ${this.WEAPON_STATS.shotgun.description}
            </div>
            <div style="text-align: left; font-size: 13px; line-height: 1.8;">
              <div><strong>Damage:</strong> ${this.WEAPON_STATS.shotgun.damage}</div>
              <div><strong>Range:</strong> ${this.WEAPON_STATS.shotgun.range}</div>
              <div><strong>Fire Rate:</strong> ${this.WEAPON_STATS.shotgun.fireRate}</div>
            </div>
          </div>

          <!-- SMG Option -->
          <div class="loadout-option" data-weapon="smg" style="
            flex: 1;
            max-width: 260px;
            background: rgba(20, 20, 30, 0.6);
            border: 3px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 24px;
            cursor: pointer;
            transition: all 0.2s;
          ">
            <div style="font-size: 48px; margin-bottom: 12px;">⚡</div>
            <h2 style="font-size: 24px; margin-bottom: 8px; text-transform: uppercase;">SMG</h2>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-bottom: 16px;">
              ${this.WEAPON_STATS.smg.description}
            </div>
            <div style="text-align: left; font-size: 13px; line-height: 1.8;">
              <div><strong>Damage:</strong> ${this.WEAPON_STATS.smg.damage}</div>
              <div><strong>Range:</strong> ${this.WEAPON_STATS.smg.range}</div>
              <div><strong>Fire Rate:</strong> ${this.WEAPON_STATS.smg.fireRate}</div>
            </div>
          </div>
        </div>

        <div style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">
          <span style="background: rgba(255, 255, 255, 0.1); padding: 6px 12px; border-radius: 4px; margin: 0 8px;">
            CLICK
          </span>
          to select weapon
          <span style="background: rgba(255, 255, 255, 0.1); padding: 6px 12px; border-radius: 4px; margin: 0 8px;">
            SPACE
          </span>
          to spawn
        </div>
      </div>
    `;

    // Add hover styles
    const style = document.createElement('style');
    style.textContent = `
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
    `;
    document.head.appendChild(style);

    document.body.appendChild(this.overlayElement);

    // Mark rifle as initially selected
    this.updateSelection();
  }

  private setupEventListeners(): void {
    if (!this.overlayElement) return;

    // Click on weapon options
    const options = this.overlayElement.querySelectorAll('.loadout-option');
    options.forEach(option => {
      option.addEventListener('click', () => {
        const weapon = (option as HTMLElement).dataset.weapon as LoadoutWeapon;
        this.selectedWeapon = weapon;
        this.updateSelection();
      });
    });

    // Spacebar to confirm
    window.addEventListener('keydown', this.boundOnKeyDown);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.isVisible) return;

    if (event.code === 'Space') {
      event.preventDefault();
      this.confirmSelection();
    }

    // Number keys 1-3 for quick select
    if (event.code === 'Digit1') {
      this.selectedWeapon = LoadoutWeapon.RIFLE;
      this.updateSelection();
    } else if (event.code === 'Digit2') {
      this.selectedWeapon = LoadoutWeapon.SHOTGUN;
      this.updateSelection();
    } else if (event.code === 'Digit3') {
      this.selectedWeapon = LoadoutWeapon.SMG;
      this.updateSelection();
    }
  }

  private updateSelection(): void {
    if (!this.overlayElement) return;

    const options = this.overlayElement.querySelectorAll('.loadout-option');
    options.forEach(option => {
      const weapon = (option as HTMLElement).dataset.weapon;
      if (weapon === this.selectedWeapon) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
  }

  private confirmSelection(): void {
    console.log(`🎯 Loadout selected: ${this.selectedWeapon.toUpperCase()}`);

    if (this.onLoadoutSelected) {
      this.onLoadoutSelected(this.selectedWeapon);
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

    console.log('🎯 Loadout selector shown');
  }

  /**
   * Hide loadout selector
   */
  hide(): void {
    if (!this.overlayElement) return;

    this.overlayElement.style.display = 'none';
    this.isVisible = false;

    console.log('🎯 Loadout selector hidden');
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
   * Set callback for when loadout is confirmed
   */
  onConfirm(callback: (weapon: LoadoutWeapon) => void): void {
    this.onLoadoutSelected = callback;
  }

  dispose(): void {
    if (this.overlayElement && this.overlayElement.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }

    window.removeEventListener('keydown', this.boundOnKeyDown);

    console.log('🧹 Loadout Selector disposed');
  }
}
