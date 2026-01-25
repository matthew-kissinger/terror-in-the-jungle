import { GameSystem } from '../../types';

export enum WeaponSlot {
  PRIMARY = 0,
  SHOTGUN = 1,
  GRENADE = 2,
  SANDBAG = 3
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
  private currentSlot: WeaponSlot = WeaponSlot.PRIMARY;
  private grenades: number = 3;
  private maxGrenades: number = 3;
  private mortarRounds: number = 3;
  private maxMortarRounds: number = 3;
  private sandbags: number = 5;
  private maxSandbags: number = 5;

  private onSlotChangeCallback?: (slot: WeaponSlot) => void;
  private onInventoryChangeCallback?: (state: InventoryState) => void;

  private uiElement?: HTMLElement;

  async init(): Promise<void> {
    console.log('🎒 Initializing Inventory Manager...');
    this.setupEventListeners();
    this.createUI();
    this.notifyInventoryChange();
  }

  update(deltaTime: number): void {
  }

  dispose(): void {
    this.removeEventListeners();
    if (this.uiElement && this.uiElement.parentNode) {
      this.uiElement.parentNode.removeChild(this.uiElement);
    }
  }

  private setupEventListeners(): void {
    window.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  private removeEventListeners(): void {
    window.removeEventListener('keydown', this.onKeyDown.bind(this));
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'Digit1':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.PRIMARY);
        }
        break;
      case 'Digit2':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.SHOTGUN);
        }
        break;
      case 'Digit3':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.GRENADE);
        }
        break;
      case 'Digit4':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) {
          this.switchToSlot(WeaponSlot.SANDBAG);
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
    console.log(`🎒 Switched to: ${WeaponSlot[slot]}`);

    if (this.onSlotChangeCallback) {
      this.onSlotChangeCallback(slot);
    }

    this.updateUI();
  }

  private cycleWeapon(): void {
    const nextSlot = (this.currentSlot + 1) % 4;
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
    console.log(`💣 Grenade used. Remaining: ${this.grenades}`);
    this.notifyInventoryChange();
    return true;
  }

  canUseMortarRound(): boolean {
    // Mortar system disabled - to be reimplemented
    return false;
  }

  useMortarRound(): boolean {
    // Mortar system disabled - to be reimplemented
    console.log('⚠️ Mortar system is temporarily disabled');
    return false;
  }

  addGrenades(count: number): void {
    this.grenades = Math.min(this.grenades + count, this.maxGrenades);
    console.log(`💣 Grenades restocked: ${this.grenades}/${this.maxGrenades}`);
    this.notifyInventoryChange();
  }

  addMortarRounds(count: number): void {
    // Mortar system disabled - to be reimplemented
    console.log('⚠️ Mortar system is temporarily disabled - rounds not added');
  }

  canUseSandbag(): boolean {
    return this.sandbags > 0;
  }

  useSandbag(): boolean {
    if (!this.canUseSandbag()) return false;

    this.sandbags--;
    console.log(`🟫 Sandbag placed. Remaining: ${this.sandbags}`);
    this.notifyInventoryChange();
    return true;
  }

  addSandbags(count: number): void {
    this.sandbags = Math.min(this.sandbags + count, this.maxSandbags);
    console.log(`🟫 Sandbags restocked: ${this.sandbags}/${this.maxSandbags}`);
    this.notifyInventoryChange();
  }

  getSandbagCount(): number {
    return this.sandbags;
  }

  reset(): void {
    this.grenades = this.maxGrenades;
    this.mortarRounds = this.maxMortarRounds;
    this.sandbags = this.maxSandbags;
    this.currentSlot = WeaponSlot.PRIMARY;
    console.log('🎒 Inventory reset');
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
    this.onSlotChangeCallback = callback;
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
      bottom: 24px;
      left: 200px;
      display: flex;
      gap: 6px;
      z-index: 1000;
    `;

    this.uiElement.innerHTML = `
      <div id="slot-primary" class="hotbar-slot active" data-slot="0">
        <div class="slot-key">[1]</div>
        <div class="slot-icon">🔫</div>
        <div class="slot-label">RIFLE</div>
      </div>
      <div id="slot-shotgun" class="hotbar-slot" data-slot="1">
        <div class="slot-key">[2]</div>
        <div class="slot-icon">💥</div>
        <div class="slot-label">SHOTGUN</div>
      </div>
      <div id="slot-grenade" class="hotbar-slot" data-slot="2">
        <div class="slot-key">[3]</div>
        <div class="slot-icon">💣</div>
        <div class="slot-label">GRENADE</div>
        <div class="slot-count" id="grenade-count">${this.grenades}</div>
      </div>
      <div id="slot-sandbag" class="hotbar-slot" data-slot="3">
        <div class="slot-key">[4]</div>
        <div class="slot-icon">🟫</div>
        <div class="slot-label">SANDBAG</div>
        <div class="slot-count" id="sandbag-count">${this.sandbags}</div>
      </div>
    `;

    const styles = document.createElement('style');
    styles.textContent = `
      .hotbar-slot {
        position: relative;
        width: 55px;
        height: 65px;
        background: rgba(10, 10, 14, 0.5);
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: 'Courier New', monospace;
        transition: all 0.2s;
        backdrop-filter: blur(4px);
      }

      .hotbar-slot.active {
        border-color: rgba(0, 255, 100, 0.8);
        background: rgba(0, 255, 100, 0.15);
        box-shadow: 0 0 15px rgba(0, 255, 100, 0.3);
      }

      .slot-key {
        position: absolute;
        top: 3px;
        left: 3px;
        font-size: 8px;
        color: rgba(255, 255, 255, 0.5);
        font-weight: bold;
      }

      .slot-icon {
        font-size: 24px;
        margin-bottom: 2px;
      }

      .slot-label {
        font-size: 8px;
        color: rgba(255, 255, 255, 0.7);
        font-weight: bold;
      }

      .slot-count {
        position: absolute;
        bottom: 3px;
        right: 5px;
        font-size: 11px;
        color: #fff;
        font-weight: bold;
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

    const sandbagCount = this.uiElement.querySelector('#sandbag-count');
    if (sandbagCount) {
      sandbagCount.textContent = String(this.sandbags);
    }
  }
}