/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// L3 deploy -> spawn scenario for UX-5 "loadout deployed is not the same as the
// one I had on me" (loadout-deploy-equip-match). Drives the real spawn-apply
// path (LoadoutService.applyToRuntime) through a real InventoryManager and a
// real weapon-rig switch state machine, asserting that the weapon equipped
// in-hand after deploy ALWAYS equals the selected loadout primary -- on first
// deploy and on every respawn, regardless of which slot the player held when
// they died, across a non-default preset and a US <-> VC faction switch.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoadoutService } from './LoadoutService';
import { InventoryManager, WeaponSlot } from './InventoryManager';
import { WeaponRigManager } from './weapon/WeaponRigManager';
import { WeaponSwitching } from './weapon/WeaponSwitching';
import { WeaponInput } from './weapon/WeaponInput';
import { WeaponAnimations } from './weapon/WeaponAnimations';
import { WeaponReload } from './weapon/WeaponReload';
import { WeaponAmmo } from './weapon/WeaponAmmo';
import { Alliance, Faction } from '../combat/types';
import { GameMode } from '../../config/gameModeTypes';
import { LoadoutWeapon } from '../../ui/loadout/LoadoutTypes';
import * as THREE from 'three';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Faithful stand-in for FirstPersonWeapon's loadout-relevant behaviour. It wires
 * the SAME two write paths the real class uses (the inventory slot -> weapon
 * bridge installed in setInventoryManager, plus setPrimaryWeapon), driving a
 * REAL WeaponRigManager + WeaponSwitching -- the code where the equip desync
 * lived. The rendered GLB rigs are not loaded (init() is never called), so this
 * exercises the logical equipped-weapon state, which is what the player sees as
 * "the gun in my hands".
 */
class HeadlessWeapon {
  readonly rig: WeaponRigManager;
  private readonly switching: WeaponSwitching;

  constructor() {
    this.rig = new WeaponRigManager(new THREE.Scene());
    const ammo = new WeaponAmmo(() => {}, () => {});
    const animations = new WeaponAnimations(new THREE.PerspectiveCamera());
    const reload = new WeaponReload();
    const input = new WeaponInput(animations, reload, this.rig);
    this.switching = new WeaponSwitching(this.rig, input, animations, ammo);
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    // Verbatim mirror of FirstPersonWeapon.setInventoryManager's slot bridge.
    inventoryManager.onSlotChange((slot) => {
      const weaponType = inventoryManager.getWeaponTypeForSlot(slot);
      if (weaponType) {
        this.switching.switchWeapon(weaponType, () => {});
      }
    });
  }

  setPrimaryWeapon(weaponType: string): void {
    this.switching.switchWeapon(weaponType as LoadoutWeapon, () => {});
  }

  /** Drive the weapon-switch animation to completion (settles equipped weapon). */
  settle(): void {
    for (let i = 0; i < 8 && this.rig.isSwitching(); i++) {
      this.rig.updateSwitchAnimation(0.1);
    }
  }

  getEquippedWeaponType(): string {
    return this.rig.getCurrentWeaponType();
  }
}

function makeService(): LoadoutService {
  return new LoadoutService();
}

function setFaction(service: LoadoutService, alliance: Alliance, faction: Faction): void {
  service.setContext({ mode: GameMode.ZONE_CONTROL, alliance, faction });
}

interface DeployOptions {
  /** Slot the player held when they died (drives the pre-death weapon switch). */
  heldSlotBeforeApply?: WeaponSlot;
  /**
   * Simulate dying mid weapon-switch: leave the pre-death switch animation
   * un-settled so a switch is still in flight when the spawn-apply path runs.
   * This is the precise condition that used to drop the authoritative primary
   * switch and leave the player holding the wrong gun.
   */
  diedMidSwitch?: boolean;
}

/**
 * Run the deploy-apply path exactly as the spawn flow does: the loadout service
 * writes to both the inventory and the weapon, then the weapon-switch animation
 * settles.
 */
function deploy(
  service: LoadoutService,
  inventory: InventoryManager,
  weapon: HeadlessWeapon,
  options: DeployOptions = {}
): void {
  if (options.heldSlotBeforeApply !== undefined) {
    inventory.setCurrentSlot(options.heldSlotBeforeApply);
    if (!options.diedMidSwitch) {
      weapon.settle();
    }
  }
  service.applyToRuntime({ inventoryManager: inventory, firstPersonWeapon: weapon as any });
  weapon.settle();
}

describe('deploy -> spawn equips the selected loadout primary (loadout-deploy-equip-match)', () => {
  let service: LoadoutService;
  let inventory: InventoryManager;
  let weapon: HeadlessWeapon;

  beforeEach(() => {
    window.localStorage.clear();
    service = makeService();
    inventory = new InventoryManager();
    inventory.setSuppressUI(true);
    weapon = new HeadlessWeapon();
    weapon.setInventoryManager(inventory);
  });

  it('initial deploy: equips the selected primary and holds the primary slot', () => {
    // US Recon preset -> SMG primary (a non-default, non-rifle weapon).
    setFaction(service, Alliance.BLUFOR, Faction.US);
    service.cyclePreset(1); // Rifleman -> Recon

    const selected = service.getCurrentLoadout();
    expect(selected.primaryWeapon).toBe(LoadoutWeapon.SMG);

    deploy(service, inventory, weapon);

    expect(weapon.getEquippedWeaponType()).toBe(selected.primaryWeapon);
    expect(inventory.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
    expect(inventory.getWeaponTypeForSlot(WeaponSlot.PRIMARY)).toBe(selected.primaryWeapon);
  });

  it('respawn equips the selected primary even when the player died holding the secondary', () => {
    setFaction(service, Alliance.BLUFOR, Faction.US);
    service.cyclePreset(1); // Recon -> SMG primary, PISTOL secondary
    const selected = service.getCurrentLoadout();

    // First spawn.
    deploy(service, inventory, weapon);
    expect(weapon.getEquippedWeaponType()).toBe(selected.primaryWeapon);

    // Player swaps to the SECONDARY weapon slot during the life, then dies.
    inventory.setCurrentSlot(WeaponSlot.SHOTGUN); // secondary-weapon slot
    weapon.settle();
    expect(weapon.getEquippedWeaponType()).toBe(selected.secondaryWeapon);

    // Respawn: must come back holding the PRIMARY, not the secondary they died with.
    deploy(service, inventory, weapon);
    expect(weapon.getEquippedWeaponType()).toBe(selected.primaryWeapon);
    expect(inventory.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);

    // A second respawn, this time having died on the equipment slot, is equally
    // deterministic.
    deploy(service, inventory, weapon, { heldSlotBeforeApply: WeaponSlot.GRENADE });
    expect(weapon.getEquippedWeaponType()).toBe(selected.primaryWeapon);
    expect(inventory.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
  });

  it('respawn equips the selected primary even when the player died mid weapon-switch', () => {
    // This is the direct repro of UX-5: a weapon switch is still in flight at the
    // instant of death, so the spawn-apply path issues its primary-equip request
    // while another switch is mid-animation. The deployed gun must still be the
    // selected primary.
    setFaction(service, Alliance.BLUFOR, Faction.US);
    service.cyclePreset(1); // Recon -> SMG primary, PISTOL secondary
    const selected = service.getCurrentLoadout();

    deploy(service, inventory, weapon);
    expect(weapon.getEquippedWeaponType()).toBe(selected.primaryWeapon);

    // Player starts swapping to the secondary slot but dies before it settles.
    deploy(service, inventory, weapon, {
      heldSlotBeforeApply: WeaponSlot.SHOTGUN,
      diedMidSwitch: true,
    });

    expect(weapon.getEquippedWeaponType()).toBe(selected.primaryWeapon);
    expect(inventory.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
  });

  it('faction switch US -> VC equips the VC selection on the next deploy', () => {
    // Start US Recon (SMG), spawn holding it.
    setFaction(service, Alliance.BLUFOR, Faction.US);
    service.cyclePreset(1);
    deploy(service, inventory, weapon);
    expect(weapon.getEquippedWeaponType()).toBe(LoadoutWeapon.SMG);

    // Switch to VC and pick the Ambusher preset -> SHOTGUN primary (SMG is not in
    // the VC pool, so this also proves the cross-faction weapon resolves cleanly).
    setFaction(service, Alliance.OPFOR, Faction.VC);
    service.cyclePreset(1); // Guerrilla -> Ambusher
    const vcLoadout = service.getCurrentLoadout();
    expect(vcLoadout.primaryWeapon).toBe(LoadoutWeapon.SHOTGUN);

    // Deploy as VC while still "holding" the previous US weapon's slot.
    deploy(service, inventory, weapon, { heldSlotBeforeApply: WeaponSlot.SHOTGUN, diedMidSwitch: true });

    expect(weapon.getEquippedWeaponType()).toBe(vcLoadout.primaryWeapon);
    expect(inventory.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
    expect(inventory.getWeaponTypeForSlot(WeaponSlot.PRIMARY)).toBe(vcLoadout.primaryWeapon);
  });

  it('default loadout deploys the default primary (no preset edits)', () => {
    setFaction(service, Alliance.BLUFOR, Faction.US);
    const selected = service.getCurrentLoadout();

    deploy(service, inventory, weapon, { heldSlotBeforeApply: WeaponSlot.SHOTGUN });

    expect(weapon.getEquippedWeaponType()).toBe(selected.primaryWeapon);
    expect(inventory.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
  });
});
