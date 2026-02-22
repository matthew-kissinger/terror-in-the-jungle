import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';

export enum WeaponSlot {
  SHOTGUN = 0,   // Key 1
  GRENADE = 1,   // Key 2
  PRIMARY = 2,   // Key 3 (Rifle)
  SANDBAG = 3,   // Key 4
  SMG = 4,       // Key 5
  PISTOL = 5     // Key 6
}

export interface InventoryState {
  currentSlot: WeaponSlot;
  grenades: number;
  maxGrenades: number;
  mortarRounds: number;
  maxMortarRounds: number;
  sandbags: number;
  maxSandbags: number;
}

export class InventoryManager implements GameSystem {
  private currentSlot: WeaponSlot = WeaponSlot.PRIMARY; // Start with Rifle (key 3)
  private grenades: number = 3;
  private maxGrenades: number = 3;
  private mortarRounds: number = 3;
  private maxMortarRounds: number = 3;
  private sandbags: number = 5;
  private maxSandbags: number = 5;

  private onSlotChangeCallbacks: ((slot: WeaponSlot) => void)[] = [];
  private onInventoryChangeCallback?: (state: InventoryState) => void;

  private uiElement?: HTMLElement;
  private boundOnKeyDown!: (event: KeyboardEvent) => void;
  /** When true, skip built-in hotbar UI (UnifiedWeaponBar handles display). */
  private suppressBuiltInUI = false;

  /** Suppress the built-in hotbar UI (call before init). */
  setSuppressUI(suppress: boolean): void {
    this.suppressBuiltInUI = suppress;
  }

  async init(): Promise<void> {
    Logger.info('inventory', 'Initializing Inventory Manager...');
    this.setupEventListeners();
    if (!this.suppressBuiltInUI) {
      this.createUI();
    }
    this.notifyInventoryChange();
  }

  update(_deltaTime: number): void {
  }

  dispose(): void {
    this.removeEventListeners();
    if (this.uiElement && this.uiElement.parentNode) {
      this.uiElement.parentNode.removeChild(this.uiElement);
    }
  }

  private setupEventListeners(): void {
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.boundOnKeyDown);
  }

  private removeEventListeners(): void {
    window.removeEventListener('keydown', this.boundOnKeyDown);
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'Digit1':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.SHOTGUN);
        }
        break;
      case 'Digit2':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.GRENADE);
        }
        break;
      case 'Digit3':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.PRIMARY);
        }
        break;
      case 'Digit4':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.SANDBAG);
        }
        break;
      case 'Digit5':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.SMG);
        }
        break;
      case 'Digit6':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.PISTOL);
        }
        break;
      case 'KeyQ':
        this.cycleWeapon();
        break;
    }
  }

  private switchToSlot(slot: WeaponSlot): void {
    if (this.currentSlot === slot) return;

    this.currentSlot = slot;
    Logger.info('inventory', `Switched to: ${WeaponSlot[slot]}`);

    // Notify all registered callbacks
    for (const callback of this.onSlotChangeCallbacks) {
      callback(slot);
    }

    this.updateUI();
  }

  /**
   * Explicit API for non-keyboard callers (touch/controller) to switch slots
   * without synthesizing keyboard events.
   */
  setCurrentSlot(slot: WeaponSlot): void {
    this.switchToSlot(slot);
  }

  private cycleWeapon(): void {
    const nextSlot = (this.currentSlot + 1) % 6;
    this.switchToSlot(nextSlot);
  }

  getCurrentSlot(): WeaponSlot {
    return this.currentSlot;
  }

  canUseGrenade(): boolean {
    return this.grenades > 0;
  }

  useGrenade(): boolean {
    if (!this.canUseGrenade()) return false;

    this.grenades--;
    Logger.info('inventory', `Grenade used. Remaining: ${this.grenades}`);
    this.notifyInventoryChange();
    return true;
  }

  canUseMortarRound(): boolean {
    return this.mortarRounds > 0;
  }

  useMortarRound(): boolean {
    if (!this.canUseMortarRound()) return false;

    this.mortarRounds--;
    Logger.info('inventory', `Mortar round used. Remaining: ${this.mortarRounds}`);
    this.notifyInventoryChange();
    return true;
  }

  addGrenades(count: number): void {
    this.grenades = Math.min(this.grenades + count, this.maxGrenades);
    Logger.info('inventory', `Grenades restocked: ${this.grenades}/${this.maxGrenades}`);
    this.notifyInventoryChange();
  }

  addMortarRounds(count: number): void {
    this.mortarRounds = Math.min(this.mortarRounds + count, this.maxMortarRounds);
    Logger.info('inventory', `Mortar rounds restocked: ${this.mortarRounds}/${this.maxMortarRounds}`);
    this.notifyInventoryChange();
  }

  canUseSandbag(): boolean {
    return this.sandbags > 0;
  }

  useSandbag(): boolean {
    if (!this.canUseSandbag()) return false;

    this.sandbags--;
    Logger.info('inventory', `Sandbag placed. Remaining: ${this.sandbags}`);
    this.notifyInventoryChange();
    return true;
  }

  addSandbags(count: number): void {
    this.sandbags = Math.min(this.sandbags + count, this.maxSandbags);
    Logger.info('inventory', `Sandbags restocked: ${this.sandbags}/${this.maxSandbags}`);
    this.notifyInventoryChange();
  }

  getSandbagCount(): number {
    return this.sandbags;
  }

  reset(): void {
    this.grenades = this.maxGrenades;
    this.mortarRounds = this.maxMortarRounds;
    this.sandbags = this.maxSandbags;
    this.switchToSlot(WeaponSlot.PRIMARY);
    Logger.info('inventory', 'Inventory reset');
    this.notifyInventoryChange();
  }

  getState(): InventoryState {
    return {
      currentSlot: this.currentSlot,
      grenades: this.grenades,
      maxGrenades: this.maxGrenades,
      mortarRounds: this.mortarRounds,
      maxMortarRounds: this.maxMortarRounds,
      sandbags: this.sandbags,
      maxSandbags: this.maxSandbags
    };
  }

  onSlotChange(callback: (slot: WeaponSlot) => void): void {
    this.onSlotChangeCallbacks.push(callback);
  }

  onInventoryChange(callback: (state: InventoryState) => void): void {
    this.onInventoryChangeCallback = callback;
  }

  private notifyInventoryChange(): void {
    if (this.onInventoryChangeCallback) {
      this.onInventoryChangeCallback(this.getState());
    }
    this.updateUI();
  }

  private createUI(): void {
    this.uiElement = document.createElement('div');
    this.uiElement.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 4px;
      z-index: 1000;
    `;

    this.uiElement.innerHTML = `
      <div id="slot-shotgun" class="hotbar-slot" data-slot="0">
        <div class="slot-key">1</div>
        <div class="slot-icon">SG</div>
        <div class="slot-label">SHOTGUN</div>
      </div>
      <div id="slot-grenade" class="hotbar-slot" data-slot="1">
        <div class="slot-key">2</div>
        <div class="slot-icon">GR</div>
        <div class="slot-label">GRENADE</div>
        <div class="slot-count" id="grenade-count">${this.grenades}</div>
      </div>
      <div id="slot-primary" class="hotbar-slot active" data-slot="2">
        <div class="slot-key">3</div>
        <div class="slot-icon">AR</div>
        <div class="slot-label">RIFLE</div>
      </div>
      <div id="slot-sandbag" class="hotbar-slot" data-slot="3">
        <div class="slot-key">4</div>
        <div class="slot-icon">SB</div>
        <div class="slot-label">SANDBAG</div>
        <div class="slot-count" id="sandbag-count">${this.sandbags}</div>
      </div>
      <div id="slot-smg" class="hotbar-slot" data-slot="4">
        <div class="slot-key">5</div>
        <div class="slot-icon">SM</div>
        <div class="slot-label">SMG</div>
      </div>
      <div id="slot-pistol" class="hotbar-slot" data-slot="5">
        <div class="slot-key">6</div>
        <div class="slot-icon">PT</div>
        <div class="slot-label">PISTOL</div>
      </div>
    `;

    const styles = document.createElement('style');
    styles.textContent = `
      .hotbar-slot {
        position: relative;
        width: 48px;
        height: 52px;
        background: rgba(10, 10, 14, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: 'Rajdhani', sans-serif;
        transition: border-color 0.15s, background 0.15s;
        backdrop-filter: blur(4px);
        gap: 1px;
      }

      .hotbar-slot.active {
        border-color: rgba(200, 230, 255, 0.6);
        background: rgba(200, 230, 255, 0.12);
      }

      .slot-key {
        position: absolute;
        top: 2px;
        left: 4px;
        font-size: 9px;
        color: rgba(255, 255, 255, 0.35);
        font-weight: 600;
        font-family: 'Rajdhani', sans-serif;
      }

      .slot-icon {
        font-size: 15px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.85);
        letter-spacing: -0.5px;
        margin-top: 4px;
      }

      .hotbar-slot.active .slot-icon {
        color: rgba(220, 240, 255, 1);
      }

      .slot-label {
        font-size: 7px;
        color: rgba(255, 255, 255, 0.45);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .slot-count {
        position: absolute;
        bottom: 2px;
        right: 4px;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.7);
        font-weight: 700;
      }
    `;

    document.head.appendChild(styles);
    document.body.appendChild(this.uiElement);
  }

  private updateUI(): void {
    if (!this.uiElement) return;

    const slots = this.uiElement.querySelectorAll('.hotbar-slot');
    slots.forEach((slot, index) => {
      if (index === this.currentSlot) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    });

    const grenadeCount = this.uiElement.querySelector('#grenade-count');
    if (grenadeCount) {
      grenadeCount.textContent = String(this.grenades);
    }

    const mortarCount = this.uiElement.querySelector('#mortar-count');
    if (mortarCount) {
      mortarCount.textContent = String(this.mortarRounds);
    }

    const sandbagCount = this.uiElement.querySelector('#sandbag-count');
    if (sandbagCount) {
      sandbagCount.textContent = String(this.sandbags);
    }
  }
}
