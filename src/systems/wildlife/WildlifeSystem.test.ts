// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameMode } from '../../config/gameModeTypes';
import {
  WildlifeSystem,
  type WildlifeModeProvider,
  type WildlifePlayerProvider,
} from './WildlifeSystem';
import { WILDLIFE_CONFIG } from '../../config/WildlifeConfig';
import { modelLoader } from '../assets/ModelLoader';

vi.mock('../assets/ModelLoader', () => ({
  modelLoader: {
    loadModel: vi.fn(async () => {
      const THREE = await import('three');
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2)));
      return group;
    }),
    disposeInstance: vi.fn((object: THREE.Object3D) => object.removeFromParent()),
  },
}));

const mockedLoadModel = vi.mocked(modelLoader.loadModel);

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Harness {
  scene: THREE.Scene;
  system: WildlifeSystem;
  player: WildlifePlayerProvider & { position: THREE.Vector3 };
  modeProvider: WildlifeModeProvider;
}

function makeHarness(options?: {
  mode?: GameMode;
  zones?: Array<{ position: THREE.Vector3; radius: number }>;
  slope?: number;
}): Harness {
  const scene = new THREE.Scene();
  const system = new WildlifeSystem(scene);
  const terrain: any = {
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getHeightAt: () => 0,
    getSlopeAt: () => options?.slope ?? 0,
  };
  const player = {
    position: new THREE.Vector3(0, 0, 0),
    getPosition(target?: THREE.Vector3): THREE.Vector3 {
      return (target ?? new THREE.Vector3()).copy(this.position);
    },
  };
  const config = {
    id: options?.mode ?? GameMode.OPEN_FRONTIER,
    worldSize: 4000,
    zones: options?.zones ?? [],
  };
  const modeProvider: WildlifeModeProvider = { getCurrentConfig: () => config as any };

  system.configureDependencies({ terrain, modeProvider, player });
  return { scene, system, player, modeProvider };
}

/** Drive enough cadence ticks (with the async load flush) to reach the cap. */
async function pump(system: WildlifeSystem, ticks: number): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    system.update(WILDLIFE_CONFIG.updateIntervalSeconds);
    await flushPromises();
  }
}

describe('WildlifeSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns ambient animals around the player in an allowed mode', async () => {
    const { system } = makeHarness();
    await pump(system, 30);
    expect(system.getActiveCount()).toBeGreaterThan(0);
  });

  it('never spawns animals closer to the player than the minimum spawn distance', async () => {
    const { system, scene, player } = makeHarness();

    // Probabilistic canary over many spawns: sample each animal's distance the
    // tick it FIRST appears, before it wanders. (Checking after a long pump is
    // wrong — idle animals legitimately wander inward toward the player, only
    // bursting away inside the close flee-trigger radius, so a post-wander
    // position assertion conflates spawn distance with intended drift and
    // flakes. This test is about the spawn invariant, per its name.)
    const seen = new Set<THREE.Object3D>();
    for (let i = 0; i < 60; i++) {
      system.update(WILDLIFE_CONFIG.updateIntervalSeconds);
      await flushPromises();
      for (const child of scene.children) {
        if (seen.has(child)) continue;
        seen.add(child);
        const horizontal = Math.hypot(
          child.position.x - player.position.x,
          child.position.z - player.position.z,
        );
        expect(horizontal).toBeGreaterThanOrEqual(WILDLIFE_CONFIG.minPlayerSpawnDistanceM - 1e-3);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('keeps animals outside the objective/base exclusion radius at spawn', async () => {
    // One objective sitting inside the spawn ring: nothing may spawn near it.
    const objective = { position: new THREE.Vector3(150, 0, 0), radius: 20 };
    const { system, scene } = makeHarness({ zones: [objective] });
    await pump(system, 60);

    expect(scene.children.length).toBeGreaterThan(0);
    for (const child of scene.children) {
      const distance = Math.hypot(child.position.x - objective.position.x, child.position.z - objective.position.z);
      expect(distance).toBeGreaterThanOrEqual(WILDLIFE_CONFIG.objectiveExclusionM);
    }
  });

  it('spawns no animals in the combat-stress (AI Sandbox) harness mode', async () => {
    const { system, scene } = makeHarness({ mode: GameMode.AI_SANDBOX });
    await pump(system, 60);
    expect(system.getActiveCount()).toBe(0);
    expect(scene.children.length).toBe(0);
  });

  it('spawns no animals in Zone Control or Team Deathmatch', async () => {
    for (const mode of [GameMode.ZONE_CONTROL, GameMode.TEAM_DEATHMATCH]) {
      const { system } = makeHarness({ mode });
      await pump(system, 20);
      expect(system.getActiveCount()).toBe(0);
    }
  });

  it('bursts an animal away from the player when it closes in', async () => {
    const { system, scene, player } = makeHarness();
    await pump(system, 60);
    expect(system.getActiveCount()).toBeGreaterThan(0);

    // Pick a live animal and teleport the player on top of it. The flee burst
    // must drive it measurably farther away over the next few ticks.
    const target = scene.children[0];
    player.position.copy(target.position);
    const startDistance = Math.hypot(
      target.position.x - player.position.x,
      target.position.z - player.position.z,
    );
    for (let i = 0; i < 20; i++) {
      system.update(WILDLIFE_CONFIG.updateIntervalSeconds);
      if (target.parent === null) break; // already fled out and despawned
    }
    const endDistance = Math.hypot(
      target.position.x - player.position.x,
      target.position.z - player.position.z,
    );
    expect(endDistance).toBeGreaterThan(startDistance);
  });

  it('despawns an animal that has fled out beyond the cull range', async () => {
    const { system, scene, player } = makeHarness();
    await pump(system, 60);
    const target = scene.children[0];
    player.position.copy(target.position);

    // Drive the flee burst long enough for the animal to clear the cull range;
    // the specific object must be removed from the scene graph.
    let removed = false;
    for (let i = 0; i < 600; i++) {
      system.update(WILDLIFE_CONFIG.updateIntervalSeconds);
      if (target.parent === null) {
        removed = true;
        break;
      }
    }
    expect(removed).toBe(true);
  });

  it('disposes cleanly, removing every animal from the scene', async () => {
    const { system, scene } = makeHarness();
    await pump(system, 60);
    expect(system.getActiveCount()).toBeGreaterThan(0);

    system.dispose();
    expect(system.getActiveCount()).toBe(0);
    expect(scene.children.length).toBe(0);
  });

  it('clears existing animals when the mode switches to a disallowed one', async () => {
    const harness = makeHarness();
    await pump(harness.system, 60);
    expect(harness.system.getActiveCount()).toBeGreaterThan(0);

    // Swap the provider to report a combat-stress mode, then tick once.
    harness.system.setModeProvider({
      getCurrentConfig: () => ({ id: GameMode.AI_SANDBOX, worldSize: 4000, zones: [] }) as any,
    });
    harness.system.update(WILDLIFE_CONFIG.updateIntervalSeconds);
    expect(harness.system.getActiveCount()).toBe(0);
    expect(harness.scene.children.length).toBe(0);
  });

  it('respects the active-population cap', async () => {
    const { system } = makeHarness();
    // One spawn attempt per tick; pump comfortably past the cap and assert it
    // is never exceeded.
    await pump(system, WILDLIFE_CONFIG.maxActive * 4);
    expect(system.getActiveCount()).toBeLessThanOrEqual(WILDLIFE_CONFIG.maxActive);
    expect(system.getActiveCount()).toBe(WILDLIFE_CONFIG.maxActive);
  });

  // Deterministic regression for the async-load race the probabilistic
  // distance test above only catches by chance: the spawn ring point is
  // sampled relative to the player's position at sample time, then the model
  // GLB loads asynchronously. A player moving toward that point during the
  // load can pull the spawn inside the min-spawn exclusion. The system must
  // re-measure against the player's CURRENT position once the load resolves.
  describe('async-load player-distance race', () => {
    interface DeferredHarness {
      scene: THREE.Scene;
      system: WildlifeSystem;
      player: { position: THREE.Vector3; getPosition(target?: THREE.Vector3): THREE.Vector3 };
      sampled: { x: number; z: number };
      resolveLoad: () => void;
    }

    // Capture the sampled spawn point (the terrain accepts the first candidate,
    // so the first walkability probe carries the spawn coordinates) and hold the
    // model load open with a deferred promise we resolve by hand.
    function makeDeferredHarness(): DeferredHarness {
      const scene = new THREE.Scene();
      const system = new WildlifeSystem(scene);
      const sampled = { x: 0, z: 0 };
      let captured = false;
      const terrain: any = {
        isTerrainReady: () => true,
        hasTerrainAt: () => true,
        getHeightAt: () => 0,
        getSlopeAt: (x: number, z: number) => {
          if (!captured) {
            sampled.x = x;
            sampled.z = z;
            captured = true;
          }
          return 0;
        },
      };
      const player = {
        position: new THREE.Vector3(0, 0, 0),
        getPosition(target?: THREE.Vector3): THREE.Vector3 {
          return (target ?? new THREE.Vector3()).copy(this.position);
        },
      };
      const modeProvider: WildlifeModeProvider = {
        getCurrentConfig: () =>
          ({ id: GameMode.OPEN_FRONTIER, worldSize: 4000, zones: [] }) as any,
      };
      system.configureDependencies({ terrain, modeProvider, player });

      let resolveLoad!: () => void;
      mockedLoadModel.mockImplementationOnce(
        () =>
          new Promise<THREE.Group>((resolve) => {
            resolveLoad = () => {
              const group = new THREE.Group();
              group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2)));
              resolve(group);
            };
          }),
      );

      return { scene, system, player, sampled, resolveLoad: () => resolveLoad() };
    }

    it('does not add an animal that the player has closed inside the min distance during the load', async () => {
      const { scene, system, player, sampled, resolveLoad } = makeDeferredHarness();

      // One tick samples a ring point and begins the (held) async load.
      system.update(WILDLIFE_CONFIG.updateIntervalSeconds);
      expect(system.getActiveCount()).toBe(0);

      // Player walks onto the sampled point while the model is still loading:
      // its current distance is now 0, well inside the exclusion.
      player.position.set(sampled.x, 0, sampled.z);
      resolveLoad();
      await flushPromises();

      expect(system.getActiveCount()).toBe(0);
      expect(scene.children.length).toBe(0);
    });

    it('adds the animal when the player stays beyond the min distance through the load', async () => {
      const { scene, system, player, sampled, resolveLoad } = makeDeferredHarness();

      system.update(WILDLIFE_CONFIG.updateIntervalSeconds);

      // Player does not move; the sampled point is still outside the ring.
      const horizontal = Math.hypot(sampled.x - player.position.x, sampled.z - player.position.z);
      expect(horizontal).toBeGreaterThanOrEqual(WILDLIFE_CONFIG.minPlayerSpawnDistanceM);

      resolveLoad();
      await flushPromises();

      expect(system.getActiveCount()).toBe(1);
      expect(scene.children.length).toBe(1);
    });
  });
});
