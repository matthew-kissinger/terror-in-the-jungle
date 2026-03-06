import { GameMode, type GameModeDefinition } from '../../config/gameModeTypes';
import { resolveLaunchSelection } from '../../config/gameModeDefinitions';
import { Alliance, Faction } from '../combat/types';
import { Logger } from '../../utils/Logger';
import type { IFirstPersonWeapon } from '../../types/SystemInterfaces';
import type { InventoryManager } from './InventoryManager';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import {
  clonePlayerLoadout,
  DEFAULT_PLAYER_LOADOUT,
  getDefaultLoadoutForFaction,
  getGrenadeTypeForEquipment,
  getLoadoutPoolForFaction,
  type LoadoutFieldKey,
  type LoadoutOptionPool,
  type LoadoutPresetTemplate,
  LoadoutEquipment,
  type LoadoutWeapon,
  type PlayerLoadout
} from '../../ui/loadout/LoadoutTypes';

interface LoadoutRuntimeTargets {
  inventoryManager?: InventoryManager;
  firstPersonWeapon?: IFirstPersonWeapon;
  grenadeSystem?: GrenadeSystem;
}

export interface LoadoutContext {
  mode: GameMode;
  alliance: Alliance;
  faction: Faction;
}

export interface LoadoutPresetSlot {
  id: string;
  name: string;
  description: string;
  loadout: PlayerLoadout;
}

export interface LoadoutPresentationModel {
  context: LoadoutContext;
  factionLabel: string;
  presetIndex: number;
  presetCount: number;
  presetName: string;
  presetDescription: string;
  presetDirty: boolean;
  availableWeapons: LoadoutWeapon[];
  availableEquipment: LoadoutEquipment[];
}

interface LoadoutContextState {
  currentLoadout: PlayerLoadout;
  activePresetIndex: number;
  presets: LoadoutPresetSlot[];
}

interface PersistedPresetSlot {
  id?: string;
  name?: string;
  description?: string;
  loadout?: unknown;
}

interface PersistedContextState {
  currentLoadout?: unknown;
  activePresetIndex?: number;
  presets?: PersistedPresetSlot[];
}

interface PersistedLoadoutState {
  contexts?: Record<string, PersistedContextState>;
}

type LoadoutListener = (loadout: PlayerLoadout) => void;
type RuntimeWeaponType = 'rifle' | 'shotgun' | 'smg' | 'pistol';

const STORAGE_KEY = 'titj.player-loadout.v2';
const LEGACY_STORAGE_KEY = 'titj.player-loadout.v1';
const PRESET_SLOT_COUNT = 3;

const DEFAULT_CONTEXT: LoadoutContext = {
  mode: GameMode.ZONE_CONTROL,
  alliance: Alliance.BLUFOR,
  faction: Faction.US,
};

function cloneContext(context: LoadoutContext): LoadoutContext {
  return {
    mode: context.mode,
    alliance: context.alliance,
    faction: context.faction,
  };
}

function getFactionLabel(faction: Faction): string {
  switch (faction) {
    case Faction.ARVN:
      return 'ARVN';
    case Faction.NVA:
      return 'NVA';
    case Faction.VC:
      return 'VC';
    case Faction.US:
    default:
      return 'US';
  }
}

function getContextKey(context: LoadoutContext): string {
  return `${context.alliance}:${context.faction}`;
}

function clonePresetSlot(slot: LoadoutPresetSlot): LoadoutPresetSlot {
  return {
    id: slot.id,
    name: slot.name,
    description: slot.description,
    loadout: clonePlayerLoadout(slot.loadout),
  };
}

function loadoutsEqual(a: PlayerLoadout, b: PlayerLoadout): boolean {
  return a.primaryWeapon === b.primaryWeapon
    && a.secondaryWeapon === b.secondaryWeapon
    && a.equipment === b.equipment;
}

function migrateLegacyEquipment(candidate: {
  grenadeType?: string;
  sandbagKit?: boolean;
  mortarKit?: boolean;
}, pool: LoadoutOptionPool): LoadoutEquipment {
  if (candidate.sandbagKit === true && pool.equipment.includes(LoadoutEquipment.SANDBAG_KIT)) {
    return LoadoutEquipment.SANDBAG_KIT;
  }

  if (candidate.mortarKit === true && pool.equipment.includes(LoadoutEquipment.MORTAR_KIT)) {
    return LoadoutEquipment.MORTAR_KIT;
  }

  if (candidate.grenadeType === 'smoke' && pool.equipment.includes(LoadoutEquipment.SMOKE_GRENADE)) {
    return LoadoutEquipment.SMOKE_GRENADE;
  }

  if (candidate.grenadeType === 'flashbang' && pool.equipment.includes(LoadoutEquipment.FLASHBANG)) {
    return LoadoutEquipment.FLASHBANG;
  }

  if (pool.equipment.includes(LoadoutEquipment.FRAG_GRENADE)) {
    return LoadoutEquipment.FRAG_GRENADE;
  }

  return pool.equipment[0] ?? DEFAULT_PLAYER_LOADOUT.equipment;
}

function findAlternativeWeapon(
  blocked: LoadoutWeapon,
  pool: LoadoutOptionPool
): LoadoutWeapon {
  return pool.weapons.find(weapon => weapon !== blocked)
    ?? blocked
    ?? pool.weapons[0]
    ?? DEFAULT_PLAYER_LOADOUT.primaryWeapon;
}

function sanitizeLoadoutForPool(value: unknown, pool: LoadoutOptionPool): PlayerLoadout {
  if (!value || typeof value !== 'object') {
    return clonePlayerLoadout(getDefaultLoadoutForFaction(pool.faction));
  }

  const candidate = value as Partial<PlayerLoadout> & {
    grenadeType?: string;
    sandbagKit?: boolean;
    mortarKit?: boolean;
  };

  const defaultLoadout = getDefaultLoadoutForFaction(pool.faction);
  const primaryWeapon = pool.weapons.includes(candidate.primaryWeapon as LoadoutWeapon)
    ? candidate.primaryWeapon as LoadoutWeapon
    : defaultLoadout.primaryWeapon;

  let secondaryWeapon = pool.weapons.includes(candidate.secondaryWeapon as LoadoutWeapon)
    ? candidate.secondaryWeapon as LoadoutWeapon
    : defaultLoadout.secondaryWeapon;

  if (secondaryWeapon === primaryWeapon) {
    secondaryWeapon = findAlternativeWeapon(primaryWeapon, pool);
  }

  const equipment = pool.equipment.includes(candidate.equipment as LoadoutEquipment)
    ? candidate.equipment as LoadoutEquipment
    : migrateLegacyEquipment(candidate, pool);

  return {
    primaryWeapon,
    secondaryWeapon,
    equipment,
  };
}

function createDefaultPresetSlots(pool: LoadoutOptionPool): LoadoutPresetSlot[] {
  const templates = pool.presetTemplates.slice(0, PRESET_SLOT_COUNT);
  const slots: LoadoutPresetSlot[] = templates.map((template, index) =>
    createPresetSlotFromTemplate(template, index, pool)
  );

  while (slots.length < PRESET_SLOT_COUNT) {
    const index = slots.length;
    slots.push({
      id: `preset_${index + 1}`,
      name: `Preset ${index + 1}`,
      description: 'Custom deploy preset.',
      loadout: sanitizeLoadoutForPool(getDefaultLoadoutForFaction(pool.faction), pool),
    });
  }

  return slots;
}

function createPresetSlotFromTemplate(
  template: LoadoutPresetTemplate,
  index: number,
  pool: LoadoutOptionPool
): LoadoutPresetSlot {
  return {
    id: template.id || `preset_${index + 1}`,
    name: template.name,
    description: template.description,
    loadout: sanitizeLoadoutForPool(template.loadout, pool),
  };
}

function normalizePersistedPresets(
  presets: PersistedPresetSlot[] | undefined,
  pool: LoadoutOptionPool
): LoadoutPresetSlot[] {
  const defaults = createDefaultPresetSlots(pool);
  if (!Array.isArray(presets) || presets.length === 0) {
    return defaults;
  }

  return defaults.map((fallback, index) => {
    const persisted = presets[index];
    if (!persisted) {
      return fallback;
    }

    return {
      id: persisted.id || fallback.id,
      name: persisted.name || fallback.name,
      description: persisted.description || fallback.description,
      loadout: sanitizeLoadoutForPool(persisted.loadout, pool),
    };
  });
}

function createDefaultContextState(pool: LoadoutOptionPool): LoadoutContextState {
  const presets = createDefaultPresetSlots(pool);
  return {
    currentLoadout: clonePlayerLoadout(presets[0].loadout),
    activePresetIndex: 0,
    presets,
  };
}

function normalizeContextState(
  persisted: PersistedContextState | undefined,
  pool: LoadoutOptionPool
): LoadoutContextState {
  if (!persisted) {
    return createDefaultContextState(pool);
  }

  const presets = normalizePersistedPresets(persisted.presets, pool);
  const maxPresetIndex = Math.max(0, presets.length - 1);
  const activePresetIndex = Math.min(
    maxPresetIndex,
    Math.max(0, Number(persisted.activePresetIndex ?? 0))
  );

  return {
    currentLoadout: sanitizeLoadoutForPool(
      persisted.currentLoadout ?? presets[activePresetIndex]?.loadout,
      pool
    ),
    activePresetIndex,
    presets,
  };
}

export class LoadoutService {
  private currentContext: LoadoutContext = cloneContext(DEFAULT_CONTEXT);
  private currentPool: LoadoutOptionPool = getLoadoutPoolForFaction(DEFAULT_CONTEXT.faction);
  private currentState: LoadoutContextState = createDefaultContextState(this.currentPool);
  private readonly listeners = new Set<LoadoutListener>();
  private readonly contexts = new Map<string, LoadoutContextState>();

  constructor() {
    this.loadFromStorage();
    this.ensureContextState(this.currentContext);
    this.currentState = this.getContextState(this.currentContext);
  }

  getCurrentLoadout(): PlayerLoadout {
    return clonePlayerLoadout(this.currentState.currentLoadout);
  }

  getContext(): LoadoutContext {
    return cloneContext(this.currentContext);
  }

  getPresentationModel(): LoadoutPresentationModel {
    const activePreset = this.currentState.presets[this.currentState.activePresetIndex]
      ?? this.currentState.presets[0];

    return {
      context: this.getContext(),
      factionLabel: getFactionLabel(this.currentContext.faction),
      presetIndex: this.currentState.activePresetIndex,
      presetCount: this.currentState.presets.length,
      presetName: activePreset?.name ?? 'Preset',
      presetDescription: activePreset?.description ?? 'Deploy preset.',
      presetDirty: activePreset ? !loadoutsEqual(this.currentState.currentLoadout, activePreset.loadout) : false,
      availableWeapons: [...this.currentPool.weapons],
      availableEquipment: [...this.currentPool.equipment],
    };
  }

  setContext(context: LoadoutContext): PlayerLoadout {
    const nextContext = cloneContext(context);
    const contextChanged = getContextKey(nextContext) !== getContextKey(this.currentContext)
      || nextContext.mode !== this.currentContext.mode;

    this.currentContext = nextContext;
    this.currentPool = getLoadoutPoolForFaction(nextContext.faction);
    this.ensureContextState(nextContext);
    this.currentState = this.getContextState(nextContext);
    this.currentState.currentLoadout = sanitizeLoadoutForPool(this.currentState.currentLoadout, this.currentPool);
    this.persistCurrentContext();

    if (contextChanged) {
      this.emitChange();
    }

    return this.getCurrentLoadout();
  }

  setContextFromDefinition(
    definition: GameModeDefinition,
    alliance: Alliance = Alliance.BLUFOR,
    preferredFaction?: Faction
  ): PlayerLoadout {
    const selection = resolveLaunchSelection(definition, {
      alliance,
      faction: preferredFaction,
    });
    return this.setContext({
      mode: definition.id,
      alliance: selection.alliance,
      faction: selection.faction,
    });
  }

  onChange(listener: LoadoutListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  cycleField(field: LoadoutFieldKey, direction: 1 | -1): PlayerLoadout {
    switch (field) {
      case 'primaryWeapon':
        return this.setPrimaryWeapon(
          this.cycleWeapon(
            this.currentState.currentLoadout.primaryWeapon,
            direction,
            this.currentState.currentLoadout.secondaryWeapon
          )
        );
      case 'secondaryWeapon':
        return this.setSecondaryWeapon(
          this.cycleWeapon(
            this.currentState.currentLoadout.secondaryWeapon,
            direction,
            this.currentState.currentLoadout.primaryWeapon
          )
        );
      case 'equipment':
        return this.setEquipment(this.cycleEquipment(direction));
      default:
        return this.getCurrentLoadout();
    }
  }

  cyclePreset(direction: 1 | -1): PlayerLoadout {
    const count = this.currentState.presets.length;
    if (count === 0) {
      return this.getCurrentLoadout();
    }

    const nextIndex = (this.currentState.activePresetIndex + direction + count) % count;
    this.currentState.activePresetIndex = nextIndex;
    this.currentState.currentLoadout = clonePlayerLoadout(this.currentState.presets[nextIndex].loadout);
    this.persistCurrentContext();
    this.emitChange();
    return this.getCurrentLoadout();
  }

  saveCurrentToActivePreset(): LoadoutPresetSlot {
    const index = this.currentState.activePresetIndex;
    const currentPreset = this.currentState.presets[index];
    if (!currentPreset) {
      throw new Error('Active preset is missing');
    }

    const updatedPreset: LoadoutPresetSlot = {
      ...currentPreset,
      loadout: this.getCurrentLoadout(),
    };
    this.currentState.presets[index] = updatedPreset;
    this.persistCurrentContext();
    Logger.info('loadout', `Saved preset ${updatedPreset.name} for ${this.currentContext.faction}`);
    return clonePresetSlot(updatedPreset);
  }

  setPrimaryWeapon(weapon: LoadoutWeapon): PlayerLoadout {
    if (!this.currentPool.weapons.includes(weapon)) {
      return this.getCurrentLoadout();
    }

    if (weapon === this.currentState.currentLoadout.secondaryWeapon) {
      return this.setLoadout({
        ...this.currentState.currentLoadout,
        primaryWeapon: weapon,
        secondaryWeapon: findAlternativeWeapon(weapon, this.currentPool),
      });
    }

    return this.setLoadout({
      ...this.currentState.currentLoadout,
      primaryWeapon: weapon,
    });
  }

  setSecondaryWeapon(weapon: LoadoutWeapon): PlayerLoadout {
    if (!this.currentPool.weapons.includes(weapon)) {
      return this.getCurrentLoadout();
    }

    if (weapon === this.currentState.currentLoadout.primaryWeapon) {
      return this.setLoadout({
        ...this.currentState.currentLoadout,
        primaryWeapon: findAlternativeWeapon(weapon, this.currentPool),
        secondaryWeapon: weapon,
      });
    }

    return this.setLoadout({
      ...this.currentState.currentLoadout,
      secondaryWeapon: weapon,
    });
  }

  setEquipment(equipment: LoadoutEquipment): PlayerLoadout {
    if (!this.currentPool.equipment.includes(equipment)) {
      return this.getCurrentLoadout();
    }

    return this.setLoadout({
      ...this.currentState.currentLoadout,
      equipment,
    });
  }

  setLoadout(loadout: PlayerLoadout): PlayerLoadout {
    this.currentState.currentLoadout = sanitizeLoadoutForPool(loadout, this.currentPool);
    this.persistCurrentContext();
    this.emitChange();
    return this.getCurrentLoadout();
  }

  applyToRuntime(targets: LoadoutRuntimeTargets): void {
    const loadout = this.currentState.currentLoadout;
    const grenadeType = getGrenadeTypeForEquipment(loadout.equipment);
    targets.inventoryManager?.setLoadout(loadout);
    targets.inventoryManager?.reset();
    targets.firstPersonWeapon?.setPlayerFaction?.(this.currentContext.faction);
    targets.firstPersonWeapon?.setPrimaryWeapon(loadout.primaryWeapon as RuntimeWeaponType);
    if (grenadeType) {
      targets.grenadeSystem?.setGrenadeType(grenadeType);
    }
    Logger.info(
      'loadout',
      `Applied loadout: faction=${this.currentContext.faction}, primary=${loadout.primaryWeapon}, secondary=${loadout.secondaryWeapon}, equipment=${loadout.equipment}`
    );
  }

  private cycleWeapon(
    current: LoadoutWeapon,
    direction: 1 | -1,
    blocked: LoadoutWeapon
  ): LoadoutWeapon {
    const pool = this.currentPool.weapons;
    let index = pool.indexOf(current);
    if (index < 0) index = 0;

    for (let attempt = 0; attempt < pool.length; attempt++) {
      index = (index + direction + pool.length) % pool.length;
      const candidate = pool[index];
      if (candidate !== blocked) {
        return candidate;
      }
    }

    return current;
  }

  private cycleEquipment(direction: 1 | -1): LoadoutEquipment {
    const pool = this.currentPool.equipment;
    let index = pool.indexOf(this.currentState.currentLoadout.equipment);
    if (index < 0) index = 0;
    index = (index + direction + pool.length) % pool.length;
    return pool[index];
  }

  private emitChange(): void {
    const snapshot = this.getCurrentLoadout();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private ensureContextState(context: LoadoutContext): void {
    const key = getContextKey(context);
    if (this.contexts.has(key)) {
      return;
    }

    this.contexts.set(key, createDefaultContextState(getLoadoutPoolForFaction(context.faction)));
  }

  private getContextState(context: LoadoutContext): LoadoutContextState {
    const key = getContextKey(context);
    const existing = this.contexts.get(key);
    if (existing) {
      return existing;
    }

    const created = createDefaultContextState(getLoadoutPoolForFaction(context.faction));
    this.contexts.set(key, created);
    return created;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedLoadoutState;
        this.loadPersistedContexts(parsed.contexts);
        return;
      }

      const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacyRaw) {
        return;
      }

      const pool = getLoadoutPoolForFaction(DEFAULT_CONTEXT.faction);
      const state = createDefaultContextState(pool);
      state.currentLoadout = sanitizeLoadoutForPool(JSON.parse(legacyRaw), pool);
      state.presets[0].loadout = clonePlayerLoadout(state.currentLoadout);
      this.contexts.set(getContextKey(DEFAULT_CONTEXT), state);
      this.saveToStorage();
    } catch (error) {
      Logger.warn('loadout', 'Failed to load persisted loadout state, using defaults', error);
      this.contexts.clear();
    }
  }

  private loadPersistedContexts(
    persistedContexts: Record<string, PersistedContextState> | undefined
  ): void {
    if (!persistedContexts) {
      return;
    }

    for (const [key, persistedState] of Object.entries(persistedContexts)) {
      const [, factionToken] = key.split(':');
      const faction = Object.values(Faction).find(value => value === factionToken) ?? DEFAULT_CONTEXT.faction;
      const pool = getLoadoutPoolForFaction(faction);
      this.contexts.set(key, normalizeContextState(persistedState, pool));
    }
  }

  private persistCurrentContext(): void {
    this.contexts.set(getContextKey(this.currentContext), this.currentState);
    this.saveToStorage();
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    try {
      const contexts: Record<string, PersistedContextState> = {};
      for (const [key, state] of this.contexts.entries()) {
        contexts[key] = {
          currentLoadout: state.currentLoadout,
          activePresetIndex: state.activePresetIndex,
          presets: state.presets.map(slot => ({
            id: slot.id,
            name: slot.name,
            description: slot.description,
            loadout: slot.loadout,
          })),
        };
      }

      const payload: PersistedLoadoutState = { contexts };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      Logger.warn('loadout', 'Failed to persist loadout state', error);
    }
  }
}
