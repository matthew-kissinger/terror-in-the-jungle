/**
 * Compositor-policy annotation contract test.
 *
 * Part of cycle-terrain-compositor R1.3. Asserts that every stamp emitted by
 * the three compilers (feature, flow, hydrology) carries both
 * `obstructionPolicy` and `targetHeightStrategy`, set to one of the documented
 * literal-union values. The compositor (R2.1) reads these annotations to
 * resolve overlap conflicts; this test prevents a future stamp emission from
 * silently shipping without the metadata.
 *
 * Behavior test (not implementation-mirror): the assertions are scoped to the
 * presence and validity of the contract fields. Concrete policy values per
 * stamp kind are documented in the design memo
 * (docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md) and may be tuned in
 * R2.1 without breaking this contract.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameMode } from '../../config/gameModeTypes';
import { compileTerrainFeatures } from './TerrainFeatureCompiler';
import { compileTerrainFlow } from './TerrainFlowCompiler';
import { compileHydrologyTerrainFeatures } from './hydrology/HydrologyTerrainFeatures';
import type { HydrologyBakeArtifact } from './hydrology/HydrologyBake';
import type {
  TerrainStampConfig,
  TerrainStampObstructionPolicy,
  TerrainStampTargetHeightStrategy,
} from './TerrainFeatureTypes';

const VALID_OBSTRUCTION_POLICIES: ReadonlySet<TerrainStampObstructionPolicy> = new Set([
  'never_below',
  'never_above',
  'override',
  'consult',
]);

const VALID_TARGET_HEIGHT_STRATEGIES: ReadonlySet<TerrainStampTargetHeightStrategy> = new Set([
  'baked',
  'sample_at_compose',
  'sample_post_compose',
]);

function assertStampPoliciesAnnotated(stamps: ReadonlyArray<TerrainStampConfig>, label: string): void {
  expect(stamps.length, `${label} should emit at least one stamp`).toBeGreaterThan(0);
  for (let index = 0; index < stamps.length; index++) {
    const stamp = stamps[index]!;
    const where = `${label} stamp ${index} (${stamp.kind})`;
    expect(stamp.obstructionPolicy, `${where} missing obstructionPolicy`).toBeDefined();
    expect(stamp.targetHeightStrategy, `${where} missing targetHeightStrategy`).toBeDefined();
    expect(VALID_OBSTRUCTION_POLICIES.has(stamp.obstructionPolicy!), `${where} obstructionPolicy invalid: ${String(stamp.obstructionPolicy)}`).toBe(true);
    expect(VALID_TARGET_HEIGHT_STRATEGIES.has(stamp.targetHeightStrategy!), `${where} targetHeightStrategy invalid: ${String(stamp.targetHeightStrategy)}`).toBe(true);
  }
}

describe('compositor stamp policy annotations', () => {
  it('annotates helipad circle stamps with override + baked', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.OPEN_FRONTIER,
      name: 'test',
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
          position: new THREE.Vector3(0, 0, 0),
          aircraft: 'UH1_HUEY',
          terrain: { flatten: true, flatRadius: 8, blendRadius: 13 },
        },
      ],
    });

    assertStampPoliciesAnnotated(compiled.stamps, 'helipad');
    expect(compiled.stamps.every((s) => s.obstructionPolicy === 'override')).toBe(true);
    expect(compiled.stamps.every((s) => s.targetHeightStrategy === 'baked')).toBe(true);
  });

  it('annotates firebase / motor-pool flatten with never_above + baked', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.ZONE_CONTROL,
      name: 'test',
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
          terrain: { flatten: true, flatRadius: 16, blendRadius: 24 },
        },
      ],
    });

    assertStampPoliciesAnnotated(compiled.stamps, 'firebase');
    expect(compiled.stamps.every((s) => s.obstructionPolicy === 'never_above')).toBe(true);
    expect(compiled.stamps.every((s) => s.targetHeightStrategy === 'baked')).toBe(true);
  });

  it('annotates airfield rect stamps with override + baked and envelope with consult + sample_post_compose', () => {
    const compiled = compileTerrainFeatures({
      id: GameMode.A_SHAU_VALLEY,
      name: 'test',
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
          position: new THREE.Vector3(0, 0, 0),
          placement: { yaw: 0 },
          templateId: 'forward_strip',
          footprint: { shape: 'circle', radius: 180 },
          terrain: { flatten: true, targetHeightMode: 'center' },
        },
      ],
    });

    assertStampPoliciesAnnotated(compiled.stamps, 'airfield');

    const sorted = [...compiled.stamps].sort((a, b) => a.priority - b.priority);
    const envelope = sorted[0]!;
    const rects = sorted.slice(1);

    expect(envelope.obstructionPolicy).toBe('consult');
    expect(envelope.targetHeightStrategy).toBe('sample_post_compose');

    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(rect.obstructionPolicy).toBe('override');
      expect(rect.targetHeightStrategy).toBe('baked');
    }
  });

  it('annotates flow route + zone-shoulder stamps with override + baked', () => {
    const result = compileTerrainFlow(
      {
        id: GameMode.ZONE_CONTROL,
        name: 'test',
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
        ],
        captureRadius: 25,
        captureSpeed: 5,
        minimapScale: 400,
        viewDistance: 200,
        terrainFlow: {
          enabled: true,
          routeStamping: 'full',
          maxRoutesPerAnchor: 2,
        },
        features: [],
      },
      (x, z) => (x + z) * 0.01,
    );

    assertStampPoliciesAnnotated(result.stamps, 'terrain-flow');
    expect(result.stamps.every((s) => s.obstructionPolicy === 'override')).toBe(true);
    expect(result.stamps.every((s) => s.targetHeightStrategy === 'baked')).toBe(true);
  });

  it('annotates hydrology channel-bed stamps with consult + sample_post_compose', () => {
    const artifact: HydrologyBakeArtifact = {
      schemaVersion: 1,
      width: 4,
      height: 4,
      cellSizeMeters: 20,
      depressionHandling: 'epsilon-fill',
      transform: { originX: 0, originZ: 0, cellSizeMeters: 20 },
      thresholds: {
        accumulationP90Cells: 10,
        accumulationP95Cells: 20,
        accumulationP98Cells: 40,
        accumulationP99Cells: 80,
      },
      masks: { wetCandidateCells: [1, 2], channelCandidateCells: [2] },
      channelPolylines: [
        {
          headCell: 0,
          outletCell: 3,
          lengthCells: 4,
          lengthMeters: 80,
          maxAccumulationCells: 320,
          points: [
            { cell: 0, x: 0, z: 0, elevationMeters: 10, accumulationCells: 42 },
            { cell: 1, x: 20, z: 0, elevationMeters: 9, accumulationCells: 80 },
            { cell: 2, x: 40, z: 10, elevationMeters: 8, accumulationCells: 160 },
            { cell: 3, x: 60, z: 10, elevationMeters: 7, accumulationCells: 320 },
          ],
        },
      ],
    };

    const result = compileHydrologyTerrainFeatures(artifact);

    assertStampPoliciesAnnotated(result.stamps, 'hydrology');
    expect(result.stamps.every((s) => s.obstructionPolicy === 'consult')).toBe(true);
    expect(result.stamps.every((s) => s.targetHeightStrategy === 'sample_post_compose')).toBe(true);
  });
});
