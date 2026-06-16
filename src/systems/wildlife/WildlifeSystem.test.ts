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
import { WILDLIFE_CONFIG, WILDLIFE_ROSTER } from '../../config/WildlifeConfig';
import { modelLoader } from '../assets/ModelLoader';

vi.mock('../assets/ModelLoader', () => ({
  modelLoader: {
    loadModel: vi.fn(async () => {
      const THREE = await import('three');
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2)));
      return group;
    }),
    preload: vi.fn().mockResolvedValue(undefined),
    disposeInstance: vi.fn((object: THREE.Object3D) => object.removeFromParent()),
  },
}));

const mockedLoadModel = vi.mocked(modelLoader.loadModel);
const mockedPreload = vi.mocked(modelLoader.preload);

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setRuntimeSearch(search: string): void {
  const normalized = search.startsWith('?') ? search : search ? `?${search}` : '';
  if (typeof window !== 'undefined' && window.history) {
    window.history.replaceState({}, '', `http://localhost/${normalized}`);
    return;
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search: normalized },
    },
  });
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

function makeTwoMeshAnimal(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x5f4a2d });
  const first = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  const second = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  second.position.x = 1.5;
  group.add(first, second);
  return group;
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });
  return meshes;
}

describe('WildlifeSystem', () => {
  beforeEach(() => {
    setRuntimeSearch('');
    vi.clearAllMocks();
  });

  it('spawns ambient animals around the player in an allowed mode', async () => {
    const { system } = makeHarness();
    await pump(system, 30);
    expect(system.getActiveCount()).toBeGreaterThan(0);
  });

  it('preloads the current allowed-mode wildlife roster without spawning animals', async () => {
    const { system } = makeHarness();

    const primed = await system.preloadCurrentModeAssets();

    const expectedPaths = [...new Set(WILDLIFE_ROSTER.map((species) => species.modelPath))];
    expect(primed).toBe(expectedPaths.length);
    expect(mockedPreload).toHaveBeenCalledWith(expectedPaths);
    expect(system.getActiveCount()).toBe(0);
    expect(mockedLoadModel).not.toHaveBeenCalled();
  });

  it('does not preload wildlife assets for disallowed modes', async () => {
    const { system } = makeHarness({ mode: GameMode.AI_SANDBOX });

    const primed = await system.preloadCurrentModeAssets();

    expect(primed).toBe(0);
    expect(mockedPreload).not.toHaveBeenCalled();
    expect(mockedLoadModel).not.toHaveBeenCalled();
  });

  it('lets perf isolation disable allowed-mode wildlife without changing mode config', async () => {
    setRuntimeSearch('?perfDisableWildlife=1');
    const { system } = makeHarness({ mode: GameMode.A_SHAU_VALLEY });

    const primed = await system.preloadCurrentModeAssets();
    await pump(system, 30);

    expect(primed).toBe(0);
    expect(system.getActiveCount()).toBe(0);
    expect(mockedPreload).not.toHaveBeenCalled();
    expect(mockedLoadModel).not.toHaveBeenCalled();
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

  it('keeps flee trigger boundary semantics while avoiding exact-distance latching', () => {
    const { system, player } = makeHarness();
    const systemAny = system as any;
    const object = new THREE.Group();
    object.position.set(WILDLIFE_CONFIG.fleeTriggerDistanceM, 0, 0);
    const agent = {
      id: 'wildlife_boundary',
      species: WILDLIFE_ROSTER[0],
      object,
      shadowMeshes: [],
      heading: 0,
      castingShadow: false,
      fleeing: false,
    };
    systemAny.agents.push(agent);

    systemAny.advanceAgents(0, player.position);
    expect(agent.fleeing).toBe(false);

    object.position.set(WILDLIFE_CONFIG.fleeTriggerDistanceM - 0.001, 0, 0);
    systemAny.advanceAgents(0, player.position);
    expect(agent.fleeing).toBe(true);
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

  it('compacts removed wildlife agents without splicing the active agent list', async () => {
    const { system, scene } = makeHarness();
    (system as any).active = true;

    await (system as any).spawnSpecies(WILDLIFE_ROSTER[0], WILDLIFE_CONFIG.minPlayerSpawnDistanceM + 10, 0);
    await (system as any).spawnSpecies(WILDLIFE_ROSTER[0], WILDLIFE_CONFIG.minPlayerSpawnDistanceM + 20, 0);
    const systemAny = system as any;
    const agents = systemAny.agents as unknown[];
    const removed = agents[0] as { object: THREE.Object3D };
    const remaining = agents[1];
    const spliceSpy = vi.spyOn(agents, 'splice');

    systemAny.removeAgentAt(0);

    expect(spliceSpy).not.toHaveBeenCalled();
    spliceSpy.mockRestore();
    expect(system.getActiveCount()).toBe(1);
    expect(agents[0]).toBe(remaining);
    expect(removed.object.parent).toBeNull();
    expect(scene.children).toHaveLength(1);
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

  it('collapses compatible static animal submeshes before adding wildlife to the scene', async () => {
    mockedLoadModel.mockResolvedValueOnce(makeTwoMeshAnimal());
    const { system, scene } = makeHarness();

    await pump(system, 1);

    expect(system.getActiveCount()).toBe(1);
    expect(collectMeshes(scene.children[0])).toHaveLength(1);
  });

  it('reuses one optimized template for repeated same-species animal spawns', async () => {
    mockedLoadModel.mockResolvedValueOnce(makeTwoMeshAnimal());
    const { system, scene } = makeHarness();
    (system as any).active = true;

    await (system as any).spawnSpecies(WILDLIFE_ROSTER[0], WILDLIFE_CONFIG.minPlayerSpawnDistanceM + 10, 0);
    await (system as any).spawnSpecies(WILDLIFE_ROSTER[0], WILDLIFE_CONFIG.minPlayerSpawnDistanceM + 20, 0);

    expect(mockedLoadModel).toHaveBeenCalledTimes(1);
    expect(system.getActiveCount()).toBe(2);
    expect(scene.children).toHaveLength(2);

    expect(collectMeshes(scene.children[0])).toHaveLength(1);
    expect(collectMeshes(scene.children[1])).toHaveLength(1);
  });

  it('disposes cloned optimized wildlife resources once per spawned animal', async () => {
    mockedLoadModel.mockResolvedValueOnce(makeTwoMeshAnimal());
    const { system, scene } = makeHarness();
    (system as any).active = true;

    await (system as any).spawnSpecies(WILDLIFE_ROSTER[0], WILDLIFE_CONFIG.minPlayerSpawnDistanceM + 10, 0);
    await (system as any).spawnSpecies(WILDLIFE_ROSTER[0], WILDLIFE_CONFIG.minPlayerSpawnDistanceM + 20, 0);
    const [mergedMesh] = collectMeshes(scene.children[0]);
    const geometryDispose = vi.spyOn(mergedMesh.geometry, 'dispose');
    const material = mergedMesh.material as THREE.Material;
    const materialDispose = vi.spyOn(material, 'dispose');

    system.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(scene.children.length).toBe(0);
  });

  it('keeps far ambient wildlife visible but out of the shadow-caster pass', async () => {
    const { system, scene } = makeHarness();
    (system as any).active = true;

    const farEnoughToSpawn = Math.max(
      WILDLIFE_CONFIG.minPlayerSpawnDistanceM + 1,
      WILDLIFE_CONFIG.shadowCastDistanceM + 5,
    );
    await (system as any).spawnSpecies(WILDLIFE_ROSTER[0], farEnoughToSpawn, 0);

    expect(system.getActiveCount()).toBe(1);
    expect(scene.children).toHaveLength(1);
    const meshes = collectMeshes(scene.children[0]);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.castShadow).toBe(false);
    }
  });

  it('enables wildlife shadow casting once an animal is close enough to matter visually', async () => {
    const { system, scene, player } = makeHarness();
    (system as any).active = true;

    const farEnoughToSpawn = Math.max(
      WILDLIFE_CONFIG.minPlayerSpawnDistanceM + 1,
      WILDLIFE_CONFIG.shadowCastDistanceM + 5,
    );
    await (system as any).spawnSpecies(WILDLIFE_ROSTER[0], farEnoughToSpawn, 0);
    const target = scene.children[0];
    const meshes = collectMeshes(target);
    expect(meshes.some((mesh) => mesh.castShadow)).toBe(false);

    player.position.set(
      farEnoughToSpawn - WILDLIFE_CONFIG.shadowCastDistanceM + 1,
      0,
      0,
    );
    (system as any).advanceAgents(0, player.position);

    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((mesh) => mesh.castShadow)).toBe(true);
  });

  it('freezes spawned animal transforms and syncs the root matrix when they move', async () => {
    const { system, scene } = makeHarness();

    await pump(system, 1);

    const target = scene.children[0];
    const frozenNodes: THREE.Object3D[] = [];
    target.traverse((child) => frozenNodes.push(child));
    expect(frozenNodes.length).toBeGreaterThan(1);
    for (const node of frozenNodes) {
      expect(node.matrixAutoUpdate).toBe(false);
      expect(node.matrixWorldAutoUpdate).toBe(false);
    }

    const startX = target.position.x;
    const startZ = target.position.z;
    system.update(WILDLIFE_CONFIG.updateIntervalSeconds);
    await flushPromises();

    expect(Math.hypot(target.position.x - startX, target.position.z - startZ)).toBeGreaterThan(0);
    expect(target.matrixWorld.elements[12]).toBeCloseTo(target.position.x, 5);
    expect(target.matrixWorld.elements[14]).toBeCloseTo(target.position.z, 5);
  });

  it('disposes merged wildlife resources before removing an optimized animal', async () => {
    mockedLoadModel.mockResolvedValueOnce(makeTwoMeshAnimal());
    const { system, scene } = makeHarness();

    await pump(system, 1);
    const [mergedMesh] = collectMeshes(scene.children[0]);
    const geometryDispose = vi.spyOn(mergedMesh.geometry, 'dispose');
    const material = mergedMesh.material as THREE.Material;
    const materialDispose = vi.spyOn(material, 'dispose');

    system.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(scene.children.length).toBe(0);
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
