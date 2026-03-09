import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import {
  getEquipmentLabel,
  getEquipmentShortLabel,
  getWeaponLabel,
  getWeaponShortLabel,
  isGrenadeEquipment,
  LoadoutEquipment,
  type PlayerLoadout,
  LoadoutWeapon
} from '../../ui/loadout/LoadoutTypes';

export enum WeaponSlot {
  SHOTGUN = 0,   // Key 1 - secondary weapon slot once loadouts are active
  GRENADE = 1,   // Key 2 - equipment slot once loadouts are active
  PRIMARY = 2,   // Key 3 - primary weapon slot
  SANDBAG = 3,   // Key 4 - legacy deployable slot
  SMG = 4,       // Key 5 - reserved for future pickups
  PISTOL = 5     // Key 6 - reserved for future pickups
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

export interface InventorySlotDefinition {
  slot: WeaponSlot;
  enabled: boolean;
  shortLabel: string;
  fullLabel: string;
  kind: 'weapon' | 'throwable' | 'equipment';
  weaponType?: LoadoutWeapon;
}

type EquipmentActionKind = 'grenade' | 'sandbag' | 'mortar';

const LEGACY_SLOT_DEFINITIONS: InventorySlotDefinition[] = [
  { slot: WeaponSlot.SHOTGUN, enabled: true, shortLabel: 'SG', fullLabel: 'Shotgun', kind: 'weapon', weaponType: LoadoutWeapon.SHOTGUN },
  { slot: WeaponSlot.GRENADE, enabled: true, shortLabel: 'GRN', fullLabel: 'Grenade', kind: 'throwable' },
  { slot: WeaponSlot.PRIMARY, enabled: true, shortLabel: 'AR', fullLabel: 'Rifle', kind: 'weapon', weaponType: LoadoutWeapon.RIFLE },
  { slot: WeaponSlot.SANDBAG, enabled: true, shortLabel: 'SB', fullLabel: 'Sandbag', kind: 'equipment' },
  { slot: WeaponSlot.SMG, enabled: true, shortLabel: 'SMG', fullLabel: 'SMG', kind: 'weapon', weaponType: LoadoutWeapon.SMG },
  { slot: WeaponSlot.PISTOL, enabled: true, shortLabel: 'PST', fullLabel: 'Pistol', kind: 'weapon', weaponType: LoadoutWeapon.PISTOL },
];

export class InventoryManager implements GameSystem {
  private currentSlot: WeaponSlot = WeaponSlot.PRIMARY;
  private grenades = 3;
  private maxGrenades = 3;
  private mortarRounds = 3;
  private maxMortarRounds = 3;
  private sandbags = 5;
  private maxSandbags = 5;

  private activeLoadout: PlayerLoadout | null = null;
  private slotDefinitions: InventorySlotDefinition[] = LEGACY_SLOT_DEFINITIONS.map(def => ({ ...def }));

  private onSlotChangeCallbacks: Array<(slot: WeaponSlot) => void> = [];
  private onInventoryChangeCallback?: (state: InventoryState) => void;
  private onLoadoutChangeCallbacks: Array<(slotDefinitions: InventorySlotDefinition[]) => void> = [];

  private uiElement?: HTMLElement;
  private uiStylesElement?: HTMLStyleElement;
  private boundOnKeyDown!: (event: KeyboardEvent) => void;
  private suppressBuiltInUI = false;
  private isInitialized = false;

  setSuppressUI(suppress: boolean): void {
    this.suppressBuiltInUI = suppress;
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    Logger.info('inventory', 'Initializing Inventory Manager...');
    this.setupEventListeners();
    if (!this.suppressBuiltInUI) {
      this.createUI();
    }
    this.notifyLoadoutChange();
    this.notifyInventoryChange();
    this.isInitialized = true;
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    if (!this.isInitialized && !this.uiElement && !this.uiStylesElement) {
      return;
    }

    this.removeEventListeners();
    if (this.uiElement && this.uiElement.parentNode) {
      this.uiElement.parentNode.removeChild(this.uiElement);
    }
    if (this.uiStylesElement && this.uiStylesElement.parentNode) {
      this.uiStylesElement.parentNode.removeChild(this.uiStylesElement);
    }
    this.uiElement = undefined;
    this.uiStylesElement = undefined;
    this.isInitialized = false;
  }

  setLoadout(loadout: PlayerLoadout): void {
    this.activeLoadout = {
      primaryWeapon: loadout.primaryWeapon,
      secondaryWeapon: loadout.secondaryWeapon,
      equipment: loadout.equipment,
    };
    this.slotDefinitions = this.createConfiguredSlotDefinitions(this.activeLoadout);
    this.syncResourceCountsToLoadout();
    const preferredSlot = this.isSlotEnabled(this.currentSlot)
      ? this.currentSlot
      : this.getPreferredInitialSlot();
    this.notifyLoadoutChange();
    this.switchToSlot(preferredSlot, true);
    this.notifyInventoryChange();
  }

  clearLoadout(): void {
    this.activeLoadout = null;
    this.slotDefinitions = LEGACY_SLOT_DEFINITIONS.map(def => ({ ...def }));
    this.notifyLoadoutChange();
    this.switchToSlot(this.currentSlot, true);
    this.notifyInventoryChange();
  }

  getActiveLoadout(): PlayerLoadout | null {
    return this.activeLoadout
      ? { ...this.activeLoadout }
      : null;
  }

  getEquippedEquipment(): LoadoutEquipment | null {
    return this.activeLoadout?.equipment ?? null;
  }

  getEquipmentActionForSlot(slot: WeaponSlot): EquipmentActionKind | null {
    if (this.activeLoadout === null) {
      if (slot === WeaponSlot.GRENADE) return 'grenade';
      if (slot === WeaponSlot.SANDBAG) return 'sandbag';
      return null;
    }

    if (slot !== WeaponSlot.GRENADE) {
      return null;
    }

    if (isGrenadeEquipment(this.activeLoadout.equipment)) {
      return 'grenade';
    }

    if (this.activeLoadout.equipment === LoadoutEquipment.SANDBAG_KIT) {
      return 'sandbag';
    }

    if (this.activeLoadout.equipment === LoadoutEquipment.MORTAR_KIT) {
      return 'mortar';
    }

    return null;
  }

  getSlotDefinitions(): InventorySlotDefinition[] {
    return this.slotDefinitions.map(def => ({ ...def }));
  }

  getEnabledSlots(): WeaponSlot[] {
    return this.slotDefinitions.filter(def => def.enabled).map(def => def.slot);
  }

  getWeaponCycleSlots(): WeaponSlot[] {
    return this.slotDefinitions
      .filter(def => def.enabled && def.kind === 'weapon')
      .map(def => def.slot);
  }

  isSlotEnabled(slot: WeaponSlot): boolean {
    return this.slotDefinitions.some(def => def.slot === slot && def.enabled);
  }

  isWeaponSlot(slot: WeaponSlot): boolean {
    const definition = this.getSlotDefinition(slot);
    return definition?.enabled === true && definition.kind === 'weapon';
  }

  getWeaponTypeForSlot(slot: WeaponSlot): LoadoutWeapon | null {
    const definition = this.getSlotDefinition(slot);
    return definition?.enabled && definition.kind === 'weapon' && definition.weaponType
      ? definition.weaponType
      : null;
  }

  hasSandbagKit(): boolean {
    return this.activeLoadout === null || this.activeLoadout.equipment === LoadoutEquipment.SANDBAG_KIT;
  }

  hasMortarKit(): boolean {
    return this.activeLoadout === null || this.activeLoadout.equipment === LoadoutEquipment.MORTAR_KIT;
  }

  getCurrentSlot(): WeaponSlot {
    return this.currentSlot;
  }

  setCurrentSlot(slot: WeaponSlot): void {
    this.switchToSlot(slot);
  }

  canUseGrenade(): boolean {
    return this.getEquipmentActionForSlot(WeaponSlot.GRENADE) === 'grenade' && this.grenades > 0;
  }

  useGrenade(): boolean {
    if (!this.canUseGrenade()) return false;
    this.grenades--;
    Logger.info('inventory', `Grenade used. Remaining: ${this.grenades}`);
    this.notifyInventoryChange();
    return true;
  }

  canUseMortarRound(): boolean {
    return this.hasMortarKit() && this.mortarRounds > 0;
  }

  useMortarRound(): boolean {
    if (!this.canUseMortarRound()) return false;
    this.mortarRounds--;
    Logger.info('inventory', `Mortar round used. Remaining: ${this.mortarRounds}`);
    this.notifyInventoryChange();
    return true;
  }

  addGrenades(count: number): void {
    if (this.activeLoadout !== null && !isGrenadeEquipment(this.activeLoadout.equipment)) return;
    this.grenades = Math.min(this.grenades + count, this.maxGrenades);
    Logger.info('inventory', `Grenades restocked: ${this.grenades}/${this.maxGrenades}`);
    this.notifyInventoryChange();
  }

  addMortarRounds(count: number): void {
    if (!this.hasMortarKit()) return;
    this.mortarRounds = Math.min(this.mortarRounds + count, this.maxMortarRounds);
    Logger.info('inventory', `Mortar rounds restocked: ${this.mortarRounds}/${this.maxMortarRounds}`);
    this.notifyInventoryChange();
  }

  canUseSandbag(): boolean {
    return this.hasSandbagKit() && this.sandbags > 0;
  }

  useSandbag(): boolean {
    if (!this.canUseSandbag()) return false;
    this.sandbags--;
    Logger.info('inventory', `Sandbag placed. Remaining: ${this.sandbags}`);
    this.notifyInventoryChange();
    return true;
  }

  addSandbags(count: number): void {
    if (!this.hasSandbagKit()) return;
    this.sandbags = Math.min(this.sandbags + count, this.maxSandbags);
    Logger.info('inventory', `Sandbags restocked: ${this.sandbags}/${this.maxSandbags}`);
    this.notifyInventoryChange();
  }

  getSandbagCount(): number {
    return this.sandbags;
  }

  reset(): void {
    if (this.activeLoadout === null) {
      this.grenades = this.maxGrenades;
      this.mortarRounds = this.maxMortarRounds;
      this.sandbags = this.maxSandbags;
    } else {
      this.grenades = isGrenadeEquipment(this.activeLoadout.equipment) ? this.maxGrenades : 0;
      this.mortarRounds = this.activeLoadout.equipment === LoadoutEquipment.MORTAR_KIT ? this.maxMortarRounds : 0;
      this.sandbags = this.activeLoadout.equipment === LoadoutEquipment.SANDBAG_KIT ? this.maxSandbags : 0;
    }

    this.switchToSlot(this.getPreferredInitialSlot(), true);
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

  onLoadoutChange(callback: (slotDefinitions: InventorySlotDefinition[]) => void): void {
    this.onLoadoutChangeCallbacks.push(callback);
  }

  private setupEventListeners(): void {
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.boundOnKeyDown);
  }

  private removeEventListeners(): void {
    if (this.boundOnKeyDown) {
      window.removeEventListener('keydown', this.boundOnKeyDown);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'Digit1':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) this.switchToSlot(WeaponSlot.SHOTGUN);
        break;
      case 'Digit2':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) this.switchToSlot(WeaponSlot.GRENADE);
        break;
      case 'Digit3':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) this.switchToSlot(WeaponSlot.PRIMARY);
        break;
      case 'Digit4':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) this.switchToSlot(WeaponSlot.SANDBAG);
        break;
      case 'Digit5':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) this.switchToSlot(WeaponSlot.SMG);
        break;
      case 'Digit6':
        if (!event.shiftKey && !event.ctrlKey && !event.altKey) this.switchToSlot(WeaponSlot.PISTOL);
        break;
      case 'KeyQ':
        this.cycleWeapon();
        break;
    }
  }

  private switchToSlot(slot: WeaponSlot, forceNotify = false): void {
    if (!this.isSlotEnabled(slot)) {
      return;
    }

    if (!forceNotify && this.currentSlot === slot) {
      return;
    }

    this.currentSlot = slot;
    Logger.info('inventory', `Switched to: ${WeaponSlot[slot]}`);

    for (const callback of this.onSlotChangeCallbacks) {
      callback(slot);
    }

    this.updateUI();
  }

  private cycleWeapon(): void {
    const enabledSlots = this.getEnabledSlots();
    if (enabledSlots.length === 0) return;

    const currentIndex = enabledSlots.indexOf(this.currentSlot);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextSlot = enabledSlots[(safeIndex + 1) % enabledSlots.length];
    this.switchToSlot(nextSlot);
  }

  private getPreferredInitialSlot(): WeaponSlot {
    if (this.isSlotEnabled(WeaponSlot.PRIMARY)) {
      return WeaponSlot.PRIMARY;
    }

    const firstWeaponSlot = this.getWeaponCycleSlots()[0];
    if (firstWeaponSlot !== undefined) {
      return firstWeaponSlot;
    }

    return this.getEnabledSlots()[0] ?? WeaponSlot.PRIMARY;
  }

  private syncResourceCountsToLoadout(): void {
    if (!this.activeLoadout) {
      return;
    }

    this.grenades = isGrenadeEquipment(this.activeLoadout.equipment)
      ? Math.min(this.grenades || this.maxGrenades, this.maxGrenades)
      : 0;
    this.sandbags = this.activeLoadout.equipment === LoadoutEquipment.SANDBAG_KIT
      ? Math.min(this.sandbags || this.maxSandbags, this.maxSandbags)
      : 0;
    this.mortarRounds = this.activeLoadout.equipment === LoadoutEquipment.MORTAR_KIT
      ? Math.min(this.mortarRounds || this.maxMortarRounds, this.maxMortarRounds)
      : 0;
  }

  private getSlotDefinition(slot: WeaponSlot): InventorySlotDefinition | undefined {
    return this.slotDefinitions.find(def => def.slot === slot);
  }

  private notifyInventoryChange(): void {
    if (this.onInventoryChangeCallback) {
      this.onInventoryChangeCallback(this.getState());
    }
    this.updateUI();
  }

  private notifyLoadoutChange(): void {
    const snapshot = this.getSlotDefinitions();
    for (const callback of this.onLoadoutChangeCallbacks) {
      callback(snapshot);
    }
  }

  private createConfiguredSlotDefinitions(loadout: PlayerLoadout): InventorySlotDefinition[] {
    return [
      {
        slot: WeaponSlot.SHOTGUN,
        enabled: true,
        shortLabel: getWeaponShortLabel(loadout.secondaryWeapon),
        fullLabel: getWeaponLabel(loadout.secondaryWeapon),
        kind: 'weapon',
        weaponType: loadout.secondaryWeapon
      },
      {
        slot: WeaponSlot.GRENADE,
        enabled: true,
        shortLabel: getEquipmentShortLabel(loadout.equipment),
        fullLabel: getEquipmentLabel(loadout.equipment),
        kind: isGrenadeEquipment(loadout.equipment) ? 'throwable' : 'equipment'
      },
      {
        slot: WeaponSlot.PRIMARY,
        enabled: true,
        shortLabel: getWeaponShortLabel(loadout.primaryWeapon),
        fullLabel: getWeaponLabel(loadout.primaryWeapon),
        kind: 'weapon',
        weaponType: loadout.primaryWeapon
      },
      {
        slot: WeaponSlot.SANDBAG,
        enabled: false,
        shortLabel: '--',
        fullLabel: 'Unused',
        kind: 'equipment'
      },
      {
        slot: WeaponSlot.SMG,
        enabled: false,
        shortLabel: '--',
        fullLabel: 'Unused',
        kind: 'equipment'
      },
      {
        slot: WeaponSlot.PISTOL,
        enabled: false,
        shortLabel: '--',
        fullLabel: 'Unused',
        kind: 'equipment'
      }
    ];
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

    this.uiElement.innerHTML = Array.from({ length: 6 }, (_, index) => `
      <div id="slot-${index}" class="hotbar-slot${index === this.currentSlot ? ' active' : ''}" data-slot="${index}">
        <div class="slot-key">${index + 1}</div>
        <div class="slot-icon" data-role="icon"></div>
        <div class="slot-label" data-role="label"></div>
        <div class="slot-count" data-role="count"></div>
      </div>
    `).join('');

    this.uiStylesElement = document.createElement('style');
    this.uiStylesElement.textContent = `
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
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        transition: border-color 0.15s, background 0.15s, opacity 0.15s;
        backdrop-filter: blur(4px);
        gap: 1px;
      }

      .hotbar-slot.active {
        border-color: rgba(200, 230, 255, 0.6);
        background: rgba(200, 230, 255, 0.12);
      }

      .hotbar-slot.inactive {
        opacity: 0.2;
      }

      .slot-key {
        position: absolute;
        top: 2px;
        left: 4px;
        font-size: 9px;
        color: rgba(255, 255, 255, 0.35);
        font-weight: 600;
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
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

    document.head.appendChild(this.uiStylesElement);
    document.body.appendChild(this.uiElement);
    this.updateUI();
  }

  private updateUI(): void {
    if (!this.uiElement) return;

    const slots = this.uiElement.querySelectorAll('.hotbar-slot');
    slots.forEach(slotElement => {
      const slotIndex = Number((slotElement as HTMLElement).dataset.slot);
      if (Number.isNaN(slotIndex)) {
        return;
      }
      const definition = this.getSlotDefinition(slotIndex as WeaponSlot);
      const icon = slotElement.querySelector('[data-role="icon"]');
      const label = slotElement.querySelector('[data-role="label"]');
      const count = slotElement.querySelector('[data-role="count"]');
      const enabled = definition?.enabled ?? false;

      slotElement.classList.toggle('active', slotIndex === this.currentSlot && enabled);
      slotElement.classList.toggle('inactive', !enabled);
      (slotElement as HTMLElement).style.display = enabled ? 'flex' : 'none';

      if (icon) icon.textContent = definition?.shortLabel ?? '--';
      if (label) label.textContent = definition?.fullLabel ?? 'Disabled';

      if (count) {
        if (slotIndex === WeaponSlot.GRENADE && enabled) {
          count.textContent = this.getEquipmentActionForSlot(WeaponSlot.GRENADE) === 'grenade'
            ? String(this.grenades)
            : this.getEquipmentActionForSlot(WeaponSlot.GRENADE) === 'sandbag'
              ? String(this.sandbags)
              : this.getEquipmentActionForSlot(WeaponSlot.GRENADE) === 'mortar'
                ? String(this.mortarRounds)
                : '';
        } else if (slotIndex === WeaponSlot.SANDBAG && enabled) {
          count.textContent = String(this.sandbags);
        } else {
          count.textContent = '';
        }
      }
    });
  }
}
