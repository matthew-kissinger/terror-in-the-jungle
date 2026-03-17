import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameMode } from '../../config/gameModeTypes';
import { compileTerrainFeatures } from './TerrainFeatureCompiler';

describe('compileTerrainFeatures', () => {
  it('compiles helipad terrain, surface, and vegetation outputs', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.OPEN_FRONTIER,
      name: 'Test Mode',
      description: 'test',
      worldSize: 1000,
      chunkRenderDistance: 4,
      maxTickets: 100,
      matchDuration: 60,
      deathPenalty: 1,
      playerCanSpawnAtZones: true,
      respawnTime: 5,
      spawnProtectionDuration: 2,
      maxCombatants: 20,
      squadSize: { min: 4, max: 6 },
      reinforcementInterval: 30,
      zones: [],
      captureRadius: 25,
      captureSpeed: 5,
      minimapScale: 400,
      viewDistance: 200,
      features: [
        {
          id: 'helipad_main',
          kind: 'helipad',
          position: new THREE.Vector3(10, 0, 20),
          aircraft: 'UH1_HUEY',
          terrain: {
            flatten: true,
            flatRadius: 8,
            blendRadius: 13,
          },
          vegetation: {
            clear: true,
            exclusionRadius: 13,
          },
          surface: {
            kind: 'packed_earth',
            innerRadius: 8,
            outerRadius: 12,
          },
        },
      ],
    });

    expect(compiled.stamps).toHaveLength(1);
    expect(compiled.surfacePatches).toHaveLength(1);
    expect(compiled.vegetationExclusionZones).toHaveLength(1);
    expect(compiled.stamps[0].kind).toBe('flatten_circle');
    if (compiled.stamps[0].kind === 'flatten_circle') {
      expect(compiled.stamps[0].gradeRadius).toBe(compiled.stamps[0].outerRadius);
      expect(compiled.stamps[0].gradeStrength).toBe(0);
    }
    expect(compiled.surfacePatches[0].shape).toBe('circle');
    expect(compiled.vegetationExclusionZones[0].radius).toBe(13);
  });

  it('adds a graded shoulder to firebase terrain by default', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.ZONE_CONTROL,
      name: 'Test Mode',
      description: 'test',
      worldSize: 1000,
      chunkRenderDistance: 4,
      maxTickets: 100,
      matchDuration: 60,
      deathPenalty: 1,
      playerCanSpawnAtZones: true,
      respawnTime: 5,
      spawnProtectionDuration: 2,
      maxCombatants: 20,
      squadSize: { min: 4, max: 6 },
      reinforcementInterval: 30,
      zones: [],
      captureRadius: 25,
      captureSpeed: 5,
      minimapScale: 400,
      viewDistance: 200,
      features: [
        {
          id: 'firebase_test',
          kind: 'firebase',
          position: new THREE.Vector3(10, 0, 20),
          footprint: { shape: 'circle', radius: 24 },
          terrain: {
            flatten: true,
            flatRadius: 16,
            blendRadius: 24,
          },
        },
      ],
    });

    expect(compiled.stamps).toHaveLength(1);
    expect(compiled.stamps[0].kind).toBe('flatten_circle');
    if (compiled.stamps[0].kind === 'flatten_circle') {
      expect(compiled.stamps[0].gradeRadius).toBeGreaterThan(compiled.stamps[0].outerRadius);
      expect(compiled.stamps[0].gradeStrength).toBeGreaterThan(0);
    }
  });

  it('emits generated runway and taxiway surface patches for authored airfields', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.A_SHAU_VALLEY,
      name: 'Airfield Mode',
      description: 'test',
      worldSize: 5000,
      chunkRenderDistance: 6,
      maxTickets: 100,
      matchDuration: 60,
      deathPenalty: 1,
      playerCanSpawnAtZones: true,
      respawnTime: 5,
      spawnProtectionDuration: 2,
      maxCombatants: 20,
      squadSize: { min: 4, max: 6 },
      reinforcementInterval: 30,
      zones: [],
      captureRadius: 25,
      captureSpeed: 5,
      minimapScale: 400,
      viewDistance: 200,
      features: [
        {
          id: 'tabat_airfield',
          kind: 'airfield',
          position: new THREE.Vector3(100, 0, 200),
          placement: { yaw: Math.PI * 0.35 },
          templateId: 'forward_strip',
          footprint: { shape: 'circle', radius: 88 },
          terrain: {
            flatten: true,
            flatRadius: 58,
            blendRadius: 86,
            samplingRadius: 54,
            targetHeightMode: 'average',
          },
          vegetation: {
            clear: true,
            exclusionRadius: 92,
          },
        },
      ],
    });

    expect(compiled.stamps).toHaveLength(1);
    expect(compiled.vegetationExclusionZones).toHaveLength(1);
    expect(compiled.surfacePatches).toHaveLength(2);
    expect(compiled.surfacePatches.some((patch) => patch.shape === 'rect' && patch.surface === 'runway')).toBe(true);
    expect(compiled.surfacePatches.some((patch) => patch.shape === 'rect' && patch.surface === 'packed_earth')).toBe(true);
  });

  it('compiles terrain-flow corridors and overlay paths for route-aware modes', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.ZONE_CONTROL,
      name: 'Flow Mode',
      description: 'test',
      worldSize: 1000,
      chunkRenderDistance: 4,
      maxTickets: 100,
      matchDuration: 60,
      deathPenalty: 1,
      playerCanSpawnAtZones: true,
      respawnTime: 5,
      spawnProtectionDuration: 2,
      maxCombatants: 20,
      squadSize: { min: 4, max: 6 },
      reinforcementInterval: 30,
      zones: [
        {
          id: 'us_base',
          name: 'US Base',
          position: new THREE.Vector3(-300, 0, -200),
          radius: 30,
          isHomeBase: true,
          owner: null,
          ticketBleedRate: 0,
        },
        {
          id: 'objective_alpha',
          name: 'Alpha',
          position: new THREE.Vector3(0, 0, 0),
          radius: 20,
          isHomeBase: false,
          owner: null,
          ticketBleedRate: 1,
        },
        {
          id: 'objective_bravo',
          name: 'Bravo',
          position: new THREE.Vector3(300, 0, 200),
          radius: 20,
          isHomeBase: false,
          owner: null,
          ticketBleedRate: 1,
        },
      ],
      captureRadius: 25,
      captureSpeed: 5,
      minimapScale: 400,
      viewDistance: 200,
      terrainFlow: {
        enabled: true,
        routeStamping: 'full',
        connectObjectivePairs: true,
        maxRoutesPerAnchor: 2,
      },
      features: [
        {
          id: 'trail_gap',
          kind: 'road',
          position: new THREE.Vector3(-120, 0, -90),
          footprint: { shape: 'circle', radius: 20 },
          surface: { kind: 'jungle_trail', innerRadius: 12, outerRadius: 18 },
        },
      ],
    }, (x, z) => (x + z) * 0.01);

    expect(compiled.flowPaths.length).toBeGreaterThan(0);
    expect(compiled.stamps.length).toBeGreaterThan(0);
    expect(compiled.stamps.some((stamp) => stamp.kind === 'flatten_capsule')).toBe(true);
    expect(compiled.surfacePatches.some((patch) => patch.shape === 'rect' && patch.surface === 'jungle_trail')).toBe(true);
    const routeStamp = compiled.stamps.find((stamp) => stamp.kind === 'flatten_capsule');
    expect(routeStamp?.targetHeightMode).toBe('center');
    expect(routeStamp?.gradeStrength).toBeLessThanOrEqual(0.08);
    const homeRoute = compiled.flowPaths.find((path) => path.id === 'us_base__objective_alpha');
    expect(homeRoute).toBeDefined();
    const routePoints = homeRoute?.points ?? [];
    expect(routePoints[0]?.x).toBeGreaterThan(-300);
    expect(routePoints[0]?.z).toBeGreaterThan(-200);
    const lastPoint = routePoints[routePoints.length - 1];
    expect(lastPoint?.x).toBeLessThan(0);
    expect(lastPoint?.z).toBeLessThan(0);
  });

  it('keeps home-base terrain-flow shoulders below authored firebase pads', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.ZONE_CONTROL,
      name: 'Shoulder Priority Mode',
      description: 'test',
      worldSize: 800,
      chunkRenderDistance: 4,
      maxTickets: 100,
      matchDuration: 60,
      deathPenalty: 1,
      playerCanSpawnAtZones: true,
      respawnTime: 5,
      spawnProtectionDuration: 2,
      maxCombatants: 20,
      squadSize: { min: 4, max: 6 },
      reinforcementInterval: 30,
      zones: [
        {
          id: 'opfor_base',
          name: 'OPFOR Base',
          position: new THREE.Vector3(0, 0, 240),
          radius: 36,
          isHomeBase: true,
          owner: null,
          ticketBleedRate: 0,
        },
        {
          id: 'zone_bravo',
          name: 'Bravo',
          position: new THREE.Vector3(0, 0, 100),
          radius: 20,
          isHomeBase: false,
          owner: null,
          ticketBleedRate: 1,
        },
      ],
      captureRadius: 25,
      captureSpeed: 5,
      minimapScale: 400,
      viewDistance: 200,
      terrainFlow: {
        enabled: true,
        routeStamping: 'full',
        zoneShoulderPadding: 24,
        routePriority: 56,
        homeBaseShoulderTargetHeightMode: 'max',
      },
      features: [
        {
          id: 'nva_bunkers',
          kind: 'firebase',
          position: new THREE.Vector3(0, 0, 240),
          footprint: { shape: 'circle', radius: 30 },
          terrain: {
            flatten: true,
            flatRadius: 28,
            blendRadius: 80,
            priority: 60,
            targetHeightMode: 'max',
          },
        },
      ],
    }, (x, z) => (z - 240) * 0.1 + Math.abs(x) * 0.02);

    const firebaseStamp = compiled.stamps.find((stamp) =>
      stamp.kind === 'flatten_circle'
      && stamp.centerX === 0
      && stamp.centerZ === 240
      && stamp.priority === 60,
    );
    const shoulderStamp = compiled.stamps.find((stamp) =>
      stamp.kind === 'flatten_circle'
      && stamp.centerX === 0
      && stamp.centerZ === 240
      && stamp.priority < 60,
    );

    expect(firebaseStamp).toBeDefined();
    expect(shoulderStamp).toBeDefined();
    expect(shoulderStamp?.targetHeightMode).toBe('max');
    expect((shoulderStamp?.priority ?? 999)).toBeLessThan(firebaseStamp?.priority ?? 0);
  });
});
