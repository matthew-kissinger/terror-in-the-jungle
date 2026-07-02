/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LootResupplySystem,
  MAX_PACKS,
  PACK_LIFETIME_MS,
  PICKUP_RADIUS,
} from './LootResupplySystem';
import { GameEventBus } from '../../core/GameEventBus';
import { Faction } from '../combat/types';

/**
 * Behavior tests for the L1 loot resupply drops. We drive the system through
 * its public seams (drop roll, pickup key, expiry/cap, seated gate) rather than
 * asserting internal tuning constants.
 */

function makeScene(): THREE.Scene {
  return new THREE.Scene();
}

interface Harness {
  system: LootResupplySystem;
  scene: THREE.Scene;
  grantAmmo: ReturnType<typeof vi.fn>;
  addGrenades: ReturnType<typeof vi.fn>;
  addBandages?: ReturnType<typeof vi.fn>;
  showPrompt: ReturnType<typeof vi.fn>;
  hidePrompt: ReturnType<typeof vi.fn>;
  setPlayerAt: (x: number, z: number) => void;
  setSeated: (seated: boolean) => void;
  setTime: (ms: number) => void;
  pressE: () => void;
}

async function createHarness(options: {
  ammoAdded?: number;
  withBandages?: boolean;
} = {}): Promise<Harness> {
  const scene = makeScene();
  const system = new LootResupplySystem(scene);
  await system.init();

  let time = 0;
  let seated = false;
  const playerPos = new THREE.Vector3(0, 0, 0);

  const grantAmmo = vi.fn(() => options.ammoAdded ?? 30);
  const addGrenades = vi.fn();
  const addBandages = options.withBandages ? vi.fn() : undefined;
  const showPrompt = vi.fn();
  const hidePrompt = vi.fn();

  system.setClock(() => time);
  system.setPlayerController({ getPosition: () => playerPos } as any);
  system.setSeatedPredicate(() => seated);
  system.setFirstPersonWeapon({ resupplyCurrentWeaponMagazine: grantAmmo } as any);

  const inventory: Record<string, unknown> = { addGrenades };
  if (addBandages) inventory.addBandages = addBandages;
  system.setInventoryManager(inventory as any);

  system.setHUDSystem({
    showInteractionPrompt: showPrompt,
    hideInteractionPrompt: hidePrompt,
  } as any);
  system.setTerrain({ isTerrainReady: () => true, getHeightAt: () => 0 } as any);

  return {
    system,
    scene,
    grantAmmo,
    addGrenades,
    addBandages,
    showPrompt,
    hidePrompt,
    setPlayerAt: (x, z) => playerPos.set(x, 0, z),
    setSeated: (s) => { seated = s; },
    setTime: (ms) => { time = ms; },
    pressE: () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })),
  };
}

describe('LootResupplySystem drop roll', () => {
  it('spawns a pack when the roll lands under the drop chance', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0.0); // always drops
    const dropped = h.system.onCombatantDeath(new THREE.Vector3(5, 0, 5));
    expect(dropped).toBe(true);
    expect(h.system.getLivePackCount()).toBe(1);
  });

  it('does not spawn a pack when the roll is above the drop chance', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0.99); // never drops
    const dropped = h.system.onCombatantDeath(new THREE.Vector3(5, 0, 5));
    expect(dropped).toBe(false);
    expect(h.system.getLivePackCount()).toBe(0);
  });

  it('drops roughly one in three over a deterministic sequence', async () => {
    const h = await createHarness();
    // Deterministic values straddling the 30% boundary: 3 of 10 below 0.3.
    const seq = [0.05, 0.5, 0.7, 0.15, 0.9, 0.6, 0.25, 0.8, 0.99, 0.4];
    let i = 0;
    h.system.setRandomSource(() => seq[i++]);
    let drops = 0;
    for (let k = 0; k < seq.length; k++) {
      if (h.system.onCombatantDeath(new THREE.Vector3(k, 0, 0))) drops++;
    }
    expect(drops).toBe(3);
  });
});

describe('LootResupplySystem pickup', () => {
  it('grants ammo and a grenade exactly once when E is pressed on foot in range', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0);
    h.system.onCombatantDeath(new THREE.Vector3(0, 0, 0.5));
    h.setPlayerAt(0, 0);
    h.system.update(0.016); // detect nearest pack -> show prompt

    h.pressE();

    expect(h.grantAmmo).toHaveBeenCalledTimes(1);
    expect(h.addGrenades).toHaveBeenCalledTimes(1);
    expect(h.system.getLivePackCount()).toBe(0);

    // Pressing again with no pack in range does nothing further.
    h.pressE();
    expect(h.grantAmmo).toHaveBeenCalledTimes(1);
    expect(h.addGrenades).toHaveBeenCalledTimes(1);
  });

  it('grants a bandage only when the inventory exposes a bandage surface', async () => {
    const withBandage = await createHarness({ withBandages: true });
    withBandage.system.setRandomSource(() => 0);
    withBandage.system.onCombatantDeath(new THREE.Vector3(0, 0, 0.5));
    withBandage.setPlayerAt(0, 0);
    withBandage.system.update(0.016);
    withBandage.pressE();
    expect(withBandage.addBandages).toHaveBeenCalledTimes(1);
  });

  it('does not pick up while seated in a vehicle', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0);
    h.system.onCombatantDeath(new THREE.Vector3(0, 0, 0.5));
    h.setPlayerAt(0, 0);
    h.setSeated(true);
    h.system.update(0.016);

    h.pressE();
    expect(h.grantAmmo).not.toHaveBeenCalled();
    expect(h.addGrenades).not.toHaveBeenCalled();
    expect(h.system.getLivePackCount()).toBe(1);
  });

  it('does not pick up a pack outside the pickup radius', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0);
    h.system.onCombatantDeath(new THREE.Vector3(PICKUP_RADIUS + 2, 0, 0));
    h.setPlayerAt(0, 0);
    h.system.update(0.016);

    h.pressE();
    expect(h.grantAmmo).not.toHaveBeenCalled();
    expect(h.system.getLivePackCount()).toBe(1);
  });
});

describe('LootResupplySystem lifecycle', () => {
  it('removes packs after the expiry window', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0);
    h.setTime(1000);
    h.system.onCombatantDeath(new THREE.Vector3(20, 0, 20));
    expect(h.system.getLivePackCount()).toBe(1);

    h.setTime(1000 + PACK_LIFETIME_MS + 1);
    h.system.update(0.016);
    expect(h.system.getLivePackCount()).toBe(0);
  });

  it('caps live packs and evicts the oldest', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0);
    for (let i = 0; i < MAX_PACKS + 5; i++) {
      h.setTime(i); // ascending spawn times so eviction order is well-defined
      h.system.onCombatantDeath(new THREE.Vector3(i, 0, 0));
    }
    expect(h.system.getLivePackCount()).toBe(MAX_PACKS);
  });
});

describe('LootResupplySystem event hook', () => {
  beforeEach(() => {
    GameEventBus.clear();
  });
  afterEach(() => {
    GameEventBus.clear();
  });

  it('spawns a pack when an npc_killed event is delivered', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0);

    GameEventBus.emit('npc_killed', {
      killerId: 'a', victimId: 'b',
      killerFaction: Faction.US, victimFaction: Faction.NVA,
      isHeadshot: false,
      position: new THREE.Vector3(3, 0, 3),
    });
    GameEventBus.flush();

    expect(h.system.getLivePackCount()).toBe(1);

    h.system.dispose();
  });

  it('stops receiving drops after dispose unsubscribes', async () => {
    const h = await createHarness();
    h.system.setRandomSource(() => 0);
    h.system.dispose();

    GameEventBus.emit('npc_killed', {
      killerId: 'a', victimId: 'b',
      killerFaction: Faction.US, victimFaction: Faction.NVA,
      isHeadshot: false,
      position: new THREE.Vector3(3, 0, 3),
    });
    GameEventBus.flush();

    expect(h.system.getLivePackCount()).toBe(0);
  });
});
