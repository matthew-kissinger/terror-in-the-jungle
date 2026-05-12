import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CombatantRenderer } from './CombatantRenderer';
import { Combatant, CombatantState, Faction } from './types';
import { AssetLoader } from '../assets/AssetLoader';
import * as CombatantMeshFactoryModule from './CombatantMeshFactory';
import * as CombatantShadersModule from './CombatantShaders';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';
import { modelLoader } from '../assets/ModelLoader';
import {
  getPixelForgeNpcRuntimeFaction,
  PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP,
  PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION,
  PIXEL_FORGE_NPC_CLOSE_MODEL_LAZY_LOAD_FLAG,
  PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
  PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP,
} from './PixelForgeNpcRuntime';
import { Logger } from '../../utils/Logger';
import { GameEventBus } from '../../core/GameEventBus';

const CLIPS = [
  'idle',
  'patrol_walk',
  'traverse_run',
  'advance_fire',
  'walk_fight_forward',
  'death_fall_back',
  'dead_pose',
] as const;

function createMockInstancedMesh(): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 100);
  mesh.count = 0;
  return mesh;
}

function createMockShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      combatState: { value: 0 },
      time: { value: 0 },
    },
  });
}

function buildFactionMeshMap(): Map<string, THREE.InstancedMesh> {
  const map = new Map<string, THREE.InstancedMesh>();
  for (const prefix of ['US', 'ARVN', 'NVA', 'VC', 'SQUAD']) {
    for (const clip of CLIPS) {
      map.set(`${prefix}_${clip}`, createMockInstancedMesh());
    }
  }
  return map;
}

function buildFactionMaterialMap(): Map<string, THREE.ShaderMaterial> {
  const map = new Map<string, THREE.ShaderMaterial>();
  for (const prefix of ['US', 'ARVN', 'NVA', 'VC', 'SQUAD']) {
    for (const clip of CLIPS) {
      map.set(`${prefix}_${clip}`, createMockShaderMaterial());
    }
  }
  return map;
}

vi.mock('../assets/ModelLoader', () => ({
  modelLoader: {
    loadAnimatedModel: vi.fn().mockImplementation(async () => ({
      scene: createMockAnimatedScene(),
      animations: CLIPS.map((clip) => new THREE.AnimationClip(clip, 1, [])),
    })),
    loadModel: vi.fn().mockImplementation(async () => {
      const root = new THREE.Group();
      const receiver = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.1, 0.08),
        new THREE.MeshStandardMaterial({ name: 'weapon', color: 0x333333 }),
      );
      receiver.name = 'Mesh_Receiver';
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.04, 0.04),
        new THREE.MeshStandardMaterial({ name: 'weapon', color: 0x222222 }),
      );
      barrel.name = 'Mesh_Barrel';
      barrel.position.x = 0.65;
      root.add(receiver, barrel);
      return root;
    }),
    disposeInstance: vi.fn(),
  },
}));

function createMockAnimatedScene(): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.8, 0.3),
    new THREE.MeshStandardMaterial({ name: 'nva_uniform', color: 0xc4ba99 }),
  );
  body.position.y = 0.9;
  root.add(body);

  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, 0.9, 0);
  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.35, 0);
  const leftArm = new THREE.Bone();
  leftArm.name = 'LeftArm';
  leftArm.position.set(-0.25, 0.25, 0);
  const leftForeArm = new THREE.Bone();
  leftForeArm.name = 'LeftForeArm';
  leftForeArm.position.set(-0.25, -0.2, 0.08);
  const leftHand = new THREE.Bone();
  leftHand.name = 'LeftHand';
  leftHand.position.set(-0.05, -0.18, 0.08);
  const rightArm = new THREE.Bone();
  rightArm.name = 'RightArm';
  rightArm.position.set(0.25, 0.25, 0);
  const rightForeArm = new THREE.Bone();
  rightForeArm.name = 'RightForeArm';
  rightForeArm.position.set(0.25, -0.2, 0.08);
  const rightHand = new THREE.Bone();
  rightHand.name = 'RightHand';
  rightHand.position.set(0.05, -0.18, 0.08);

  root.add(hips);
  hips.add(spine);
  spine.add(leftArm);
  leftArm.add(leftForeArm);
  leftForeArm.add(leftHand);
  spine.add(rightArm);
  rightArm.add(rightForeArm);
  rightForeArm.add(rightHand);
  return root;
}

vi.mock('./CombatantMeshFactory', () => ({
  CombatantMeshFactory: class MockCombatantMeshFactory {
    createFactionBillboards() {
      return {
        factionMeshes: buildFactionMeshMap(),
        factionAuraMeshes: buildFactionMeshMap(),
        factionGroundMarkers: buildFactionMeshMap(),
        soldierTextures: new Map(),
        factionMaterials: buildFactionMaterialMap(),
        walkFrameTextures: new Map(),
      };
    }

    createFactionImpostorBucket(faction: string, clip: string) {
      return {
        key: `${faction}_${clip}`,
        mesh: createMockInstancedMesh(),
        marker: createMockInstancedMesh(),
        texture: new THREE.Texture(),
        material: createMockShaderMaterial(),
      };
    }
  },
  disposeCombatantMeshes: vi.fn(),
  updateCombatantTexture: vi.fn(),
  reportBucketOverflow: vi.fn(),
  setPixelForgeNpcImpostorAttributes: vi.fn(),
  getPixelForgeNpcBucketKey: (faction: string, clip: string) => `${faction}_${clip}`,
  getPixelForgeNpcClipForCombatant: (combatant: Combatant) => {
    if (combatant.state === 'dead') return combatant.isDying ? 'death_fall_back' : 'dead_pose';
    if (combatant.state === 'engaging' || combatant.state === 'suppressing' || combatant.state === 'advancing') {
      return 'walk_fight_forward';
    }
    if (combatant.state === 'patrolling') return 'patrol_walk';
    if (combatant.state === 'retreating' || combatant.state === 'seeking_cover') return 'traverse_run';
    return 'idle';
  },
  NPC_SPRITE_RENDER_Y_OFFSET: -0.725,
  NPC_CLOSE_MODEL_TARGET_HEIGHT: 2.95,
  PIXEL_FORGE_NPC_STARTUP_CLIP_IDS: ['idle', 'patrol_walk'],
}));

vi.mock('./CombatantShaders', () => ({
  CombatantShaderSettingsManager: class MockCombatantShaderSettingsManager {
    applyPreset = vi.fn();
    getSettings = vi.fn().mockReturnValue({});
    toggleCelShading = vi.fn();
    toggleRimLighting = vi.fn();
    toggleAura = vi.fn();
    setSettings = vi.fn();
  },
  setDamageFlash: vi.fn(),
  updateShaderUniforms: vi.fn(),
}));

function createMockAssetLoader(): AssetLoader {
  return {
    loadTextures: vi.fn(),
    loadSounds: vi.fn(),
    getTexture: vi.fn(),
  } as unknown as AssetLoader;
}

function createMockCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3,
  state: CombatantState = CombatantState.IDLE,
  visualRotation = 0
): Combatant {
  return {
    id,
    faction,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: visualRotation,
    visualRotation,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
  } as Combatant;
}

type CloseModelStatsProbe = {
  candidatesWithinCloseRadius: number;
  renderedCloseModels: number;
  fallbackCount: number;
  fallbackCounts: Record<string, number>;
  nearestFallbackDistanceMeters: number | null;
  farthestFallbackDistanceMeters: number | null;
  poolLoads: number;
};

type CloseModelFallbackProbe = {
  combatantId: string;
  reason: string;
  distanceMeters: number;
};

function readCloseModelTelemetry(target: CombatantRenderer): {
  stats: CloseModelStatsProbe;
  records: CloseModelFallbackProbe[];
} {
  const probe = target as unknown as {
    getCloseModelRuntimeStats(): CloseModelStatsProbe;
    getCloseModelFallbackRecords(): CloseModelFallbackProbe[];
  };
  return {
    stats: probe.getCloseModelRuntimeStats(),
    records: probe.getCloseModelFallbackRecords(),
  };
}

describe('CombatantRenderer', () => {
  let renderer: CombatantRenderer;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let assetLoader: AssetLoader;

  beforeEach(async () => {
    vi.unstubAllGlobals();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    assetLoader = createMockAssetLoader();

    renderer = new CombatantRenderer(scene, camera, assetLoader);
    await renderer.createFactionBillboards({ eagerCloseModelPools: true });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('updateBillboards', () => {
    it('renders live combatants within render distance', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('test-1', Faction.US, new THREE.Vector3(50, 0, 0), CombatantState.IDLE);
      combatants.set('test-1', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      expect(combatant.billboardIndex).toBeDefined();
    });

    it('renders hard-close NPCs as armed GLB meshes, not impostors', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('near-1', Faction.NVA, new THREE.Vector3(10, 0, 0), CombatantState.ENGAGING);
      combatants.set('near-1', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, { hasWeapon: boolean; weaponRoot?: THREE.Object3D }> }).activeCloseModels;
      expect(combatant.billboardIndex).toBe(-1);
      expect(activeCloseModels.get('near-1')?.hasWeapon).toBe(true);
      expect(activeCloseModels.get('near-1')?.weaponRoot).toBeDefined();
    });

    it('reports nearest NPC materialization modes for spawn-adjacent diagnosis', () => {
      const combatants = new Map<string, Combatant>();
      const closeCombatant = createMockCombatant('near-mesh', Faction.NVA, new THREE.Vector3(10, 0, 0), CombatantState.ENGAGING);
      const impostorCombatant = createMockCombatant('mid-impostor', Faction.US, new THREE.Vector3(180, 0, 0), CombatantState.PATROLLING);
      const culledCombatant = createMockCombatant('far-culled', Faction.VC, new THREE.Vector3(450, 0, 0), CombatantState.IDLE);
      combatants.set(closeCombatant.id, closeCombatant);
      combatants.set(impostorCombatant.id, impostorCombatant);
      combatants.set(culledCombatant.id, culledCombatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const rows = renderer.getNearestCombatantMaterializationRows(combatants, new THREE.Vector3(0, 0, 0), 3);
      expect(rows.map((row) => row.combatantId)).toEqual(['near-mesh', 'mid-impostor', 'far-culled']);
      expect(rows[0]).toMatchObject({
        combatantId: 'near-mesh',
        renderMode: 'close-glb',
        closeFallbackReason: null,
        hasCloseModelWeapon: true,
        billboardIndex: -1,
        // Slice 4 (MaterializationProfile v2): reason + inActiveCombat.
        reason: 'close-glb:active',
        inActiveCombat: true,
      });
      expect(rows[1]).toMatchObject({
        combatantId: 'mid-impostor',
        renderMode: 'impostor',
        closeFallbackReason: null,
        hasCloseModelWeapon: false,
        reason: 'impostor:beyond-close-radius',
        inActiveCombat: false,
      });
      expect(rows[1].billboardIndex).toBeGreaterThanOrEqual(0);
      expect(rows[2]).toMatchObject({
        combatantId: 'far-culled',
        renderMode: 'culled',
        closeFallbackReason: null,
        billboardIndex: null,
        // The test mock's LOD remains at its default ('high') because the LOD
        // manager is not driven here; the rendering pipeline declines to give
        // a billboard slot at 450 m, so the reason is `culled:no-billboard`.
        reason: 'culled:no-billboard',
        inActiveCombat: false,
      });
    });

    it('records impostor:total-cap reason when close-radius candidates exceed the cap', async () => {
      // Slice 4 regression: when the cluster overflows the active cap,
      // the materialization profile must surface `impostor:total-cap` so
      // budget-arbiter diagnostics can distinguish fallback kinds.
      await (renderer as unknown as {
        createCloseModelPool(
          poolKey: Faction,
          factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
          targetSize: number,
        ): Promise<void>;
      }).createCloseModelPool(
        Faction.NVA,
        getPixelForgeNpcRuntimeFaction(Faction.NVA),
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      );

      const hardNearReserveCap = PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP
        + PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP;
      const overflow = hardNearReserveCap + 3;
      const combatants = new Map<string, Combatant>();
      for (let i = 0; i < overflow; i++) {
        const combatant = createMockCombatant(
          `cluster-${i}`,
          Faction.NVA,
          new THREE.Vector3(18 + i * 0.5, 0, 0),
          CombatantState.ENGAGING,
        );
        combatants.set(combatant.id, combatant);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
      const rows = renderer.getNearestCombatantMaterializationRows(combatants, new THREE.Vector3(0, 0, 0), overflow);

      const closeGlbRows = rows.filter((row) => row.renderMode === 'close-glb');
      const totalCapRows = rows.filter((row) => row.reason === 'impostor:total-cap');
      expect(closeGlbRows).toHaveLength(hardNearReserveCap);
      expect(totalCapRows).toHaveLength(overflow - hardNearReserveCap);
      // Every active-combat actor that materialized is marked accordingly.
      expect(closeGlbRows.every((row) => row.inActiveCombat)).toBe(true);
      // Each close-GLB row carries the active reason; total-cap rows do not.
      expect(closeGlbRows.every((row) => row.reason === 'close-glb:active')).toBe(true);
    });

    it('collapses attached close-model weapon clones into one render mesh', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('near-weapon-merge', Faction.NVA, new THREE.Vector3(10, 0, 0), CombatantState.ENGAGING);
      combatants.set('near-weapon-merge', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, { weaponRoot?: THREE.Object3D }> }).activeCloseModels;
      const weaponRoot = activeCloseModels.get('near-weapon-merge')?.weaponRoot;
      const weaponMeshes: THREE.Mesh[] = [];
      weaponRoot?.traverse((child) => {
        if (child instanceof THREE.Mesh) weaponMeshes.push(child);
      });
      expect(weaponMeshes).toHaveLength(1);
      expect(weaponMeshes[0].name).toContain('optimized_weapon');
    });

    it('renders hard-close NPCs as impostors when perf isolation disables close models', async () => {
      vi.stubGlobal('window', { location: { search: '?perf=1&perfDisableNpcCloseModels=1' } });
      const isolatedRenderer = new CombatantRenderer(scene, camera, assetLoader);
      await isolatedRenderer.createFactionBillboards({ eagerCloseModelPools: true });
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('near-isolated', Faction.NVA, new THREE.Vector3(10, 0, 0), CombatantState.ENGAGING);
      combatants.set('near-isolated', combatant);

      isolatedRenderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (isolatedRenderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      const { stats, records } = readCloseModelTelemetry(isolatedRenderer);
      expect(combatant.billboardIndex).toBe(0);
      expect(activeCloseModels.has('near-isolated')).toBe(false);
      expect(modelLoader.loadAnimatedModel).not.toHaveBeenCalled();
      expect(stats.fallbackCounts['perf-isolation']).toBe(1);
      expect(records).toEqual([
        expect.objectContaining({ combatantId: 'near-isolated', reason: 'perf-isolation' }),
      ]);

      isolatedRenderer.dispose();
    });

    it('keeps close-model body and weapon meshes eligible for frustum culling', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('near-cull', Faction.NVA, new THREE.Vector3(10, 0, 0), CombatantState.ENGAGING);
      combatants.set('near-cull', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as {
        activeCloseModels: Map<string, { root: THREE.Group; weaponRoot?: THREE.Object3D }>;
      }).activeCloseModels;
      const instance = activeCloseModels.get('near-cull');
      expect(instance).toBeDefined();

      const meshCullingStates: boolean[] = [];
      instance?.root.traverse((child) => {
        if (child instanceof THREE.Mesh) meshCullingStates.push(child.frustumCulled);
      });

      expect(meshCullingStates.length).toBeGreaterThan(0);
      expect(meshCullingStates.every(Boolean)).toBe(true);
    });

    it('keeps steady close-model materials out of the shader update path', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('near-steady-material', Faction.NVA, new THREE.Vector3(10, 0, 0), CombatantState.ENGAGING);
      combatants.set('near-steady-material', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as {
        activeCloseModels: Map<string, { root: THREE.Group }>;
      }).activeCloseModels;
      const instance = activeCloseModels.get('near-steady-material');
      const materials: THREE.Material[] = [];
      instance?.root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        materials.push(...childMaterials);
      });
      const versions = materials.map((material) => material.version);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      expect(materials.length).toBeGreaterThan(0);
      expect(materials.map((material) => material.version)).toEqual(versions);
    });

    it('eager close-model pools only seed the initial demand size', async () => {
      const localRenderer = new CombatantRenderer(scene, camera, assetLoader);
      await localRenderer.createFactionBillboards({ eagerCloseModelPools: true });

      const poolState = localRenderer as unknown as {
        closeModelPools: Map<string, unknown[]>;
      };

      expect(poolState.closeModelPools.get(Faction.NVA)).toHaveLength(
        PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION,
      );
      expect(modelLoader.loadAnimatedModel).toHaveBeenCalledTimes(
        PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION * 5,
      );

      localRenderer.dispose();
    });

    it('does not let low-LOD classification force a near impostor inside the hard close radius', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('near-low-lod', Faction.VC, new THREE.Vector3(20, 0, 0));
      combatant.lodLevel = 'low';
      combatants.set('near-low-lod', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      expect(combatant.billboardIndex).toBe(-1);
      expect(activeCloseModels.has('near-low-lod')).toBe(true);
    });

    it('keeps expanded near-range NPCs as GLB meshes before impostor LOD begins', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('expanded-near', Faction.US, new THREE.Vector3(60, 0, 0));
      combatants.set('expanded-near', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      expect(combatant.billboardIndex).toBe(-1);
      expect(activeCloseModels.has('expanded-near')).toBe(true);
    });

    it('keeps close NPCs visible as impostors while a close-model pool is still lazy-loading', async () => {
      vi.useFakeTimers();
      const lazyRenderer = new CombatantRenderer(scene, camera, assetLoader);
      await lazyRenderer.createFactionBillboards();
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant('near-lazy', Faction.NVA, new THREE.Vector3(10, 0, 0), CombatantState.ENGAGING);
      combatants.set('near-lazy', combatant);

      lazyRenderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const lazyState = lazyRenderer as unknown as {
        activeCloseModels: Map<string, unknown>;
        closeModelPoolLoads: Map<string, Promise<void>>;
      };
      expect(lazyState.activeCloseModels.has('near-lazy')).toBe(false);
      expect(lazyState.closeModelPoolLoads.has(Faction.NVA)).toBe(true);
      expect(combatant.billboardIndex).toBe(0);
      expect(lazyRenderer.getNearestCombatantMaterializationRows(combatants, new THREE.Vector3(0, 0, 0), 1)[0]).toMatchObject({
        combatantId: 'near-lazy',
        renderMode: 'impostor',
        closeFallbackReason: 'pool-loading',
        hasCloseModelWeapon: false,
      });

      lazyRenderer.dispose();
      await vi.runOnlyPendingTimersAsync();
      vi.useRealTimers();
    });

    it('prewarms spawn-adjacent close models before the lazy-load gate opens', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('window', {
        location: { search: '' },
        [PIXEL_FORGE_NPC_CLOSE_MODEL_LAZY_LOAD_FLAG]: false,
      });
      const lazyRenderer = new CombatantRenderer(scene, camera, assetLoader);
      try {
        await lazyRenderer.createFactionBillboards();
        const combatants = new Map<string, Combatant>();
        for (let i = 0; i < 6; i++) {
          const combatant = createMockCombatant(`spawn-near-${i}`, Faction.NVA, new THREE.Vector3(8 + i, 0, 0));
          combatants.set(combatant.id, combatant);
        }

        const summary = await lazyRenderer.prewarmCloseModelsForSpawn(
          combatants,
          new THREE.Vector3(0, 0, 0),
          { maxActive: 3 },
        );

        const state = lazyRenderer as unknown as {
          activeCloseModels: Map<string, unknown>;
          closeModelPoolLoads: Map<string, Promise<void>>;
        };
        expect(summary.skippedReason).toBe('none');
        expect(summary.candidatesWithinCloseRadius).toBe(6);
        expect(summary.requestedPoolTargets[Faction.NVA]).toBe(3);
        expect(summary.renderedCloseModels).toBe(3);
        expect(summary.fallbackCounts['pool-loading']).toBe(3);
        expect(state.activeCloseModels.size).toBe(3);
        expect(state.closeModelPoolLoads.has(Faction.NVA)).toBe(true);
        expect(modelLoader.loadAnimatedModel).toHaveBeenCalledTimes(3);
        expect(modelLoader.loadModel).toHaveBeenCalledTimes(3);
      } finally {
        lazyRenderer.dispose();
        await vi.runOnlyPendingTimersAsync();
        vi.useRealTimers();
      }
    });

    it('keeps overflow close actors as impostors while a demand pool can grow', () => {
      const combatants = new Map<string, Combatant>();
      for (let i = 0; i < 48; i++) {
        const combatant = createMockCombatant(`nva-${i}`, Faction.NVA, new THREE.Vector3(2 + i, 0, 0));
        combatants.set(combatant.id, combatant);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const state = renderer as unknown as {
        activeCloseModels: Map<string, unknown>;
        closeModelPoolLoads: Map<string, Promise<void>>;
      };
      const activeCloseModels = state.activeCloseModels;
      expect(activeCloseModels.has('nva-0')).toBe(true);
      expect(activeCloseModels.has(`nva-${PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION - 1}`)).toBe(true);
      expect(activeCloseModels.has(`nva-${PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION}`)).toBe(false);
      expect(activeCloseModels.has('nva-47')).toBe(false);
      expect(state.closeModelPoolLoads.has(Faction.NVA)).toBe(true);
      expect(combatants.get('nva-47')?.billboardIndex).toBeGreaterThanOrEqual(0);

      const { stats, records } = readCloseModelTelemetry(renderer);
      expect(stats.candidatesWithinCloseRadius).toBe(48);
      expect(stats.renderedCloseModels).toBe(PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION);
      expect(stats.fallbackCounts['pool-loading']).toBe(48 - PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION);
      expect(stats.fallbackCount).toBe(48 - PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION);
      expect(stats.poolLoads).toBe(1);
      expect(records).toContainEqual(expect.objectContaining({
        combatantId: 'nva-47',
        reason: 'pool-loading',
      }));
    });

    it('keeps overflow close actors as impostors after the close-model active cap', async () => {
      await (renderer as unknown as {
        createCloseModelPool(
          poolKey: Faction,
          factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
          targetSize: number,
        ): Promise<void>;
      }).createCloseModelPool(
        Faction.NVA,
        getPixelForgeNpcRuntimeFaction(Faction.NVA),
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      );

      const combatants = new Map<string, Combatant>();
      for (let i = 0; i < 48; i++) {
        const combatant = createMockCombatant(`nva-${i}`, Faction.NVA, new THREE.Vector3(70 + i * 0.5, 0, 0));
        combatants.set(combatant.id, combatant);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      expect(activeCloseModels.has('nva-0')).toBe(true);
      expect(activeCloseModels.has(`nva-${PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP - 1}`)).toBe(true);
      expect(activeCloseModels.has(`nva-${PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP}`)).toBe(false);
      expect(activeCloseModels.has('nva-47')).toBe(false);
      expect(combatants.get('nva-47')?.billboardIndex).toBeGreaterThanOrEqual(0);

      const { stats, records } = readCloseModelTelemetry(renderer);
      expect(stats.candidatesWithinCloseRadius).toBe(48);
      expect(stats.renderedCloseModels).toBe(PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP);
      expect(stats.fallbackCounts['total-cap']).toBe(48 - PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP);
      expect(stats.fallbackCount).toBe(48 - PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP);
      expect(stats.closeModelActiveCap).toBe(PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP);
      expect(stats.nearestFallbackDistanceMeters).toBeCloseTo(70 + PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP * 0.5);
      expect(records).toContainEqual(expect.objectContaining({
        combatantId: `nva-${PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP}`,
        reason: 'total-cap',
      }));
    });

    it('uses the hard-near cluster reserve so dense near-player clusters do not start as impostors', async () => {
      await (renderer as unknown as {
        createCloseModelPool(
          poolKey: Faction,
          factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
          targetSize: number,
        ): Promise<void>;
      }).createCloseModelPool(
        Faction.NVA,
        getPixelForgeNpcRuntimeFaction(Faction.NVA),
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      );

      const hardNearReserveCap = PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP
        + PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP;
      const combatants = new Map<string, Combatant>();
      for (let i = 0; i < hardNearReserveCap; i++) {
        const combatant = createMockCombatant(`hard-near-${i}`, Faction.NVA, new THREE.Vector3(18 + i, 0, 0));
        combatants.set(combatant.id, combatant);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      expect(activeCloseModels.size).toBe(hardNearReserveCap);
      expect(activeCloseModels.has(`hard-near-${hardNearReserveCap - 1}`)).toBe(true);

      const { stats } = readCloseModelTelemetry(renderer);
      expect(stats.closeModelActiveCap).toBe(hardNearReserveCap);
      expect(stats.renderedCloseModels).toBe(hardNearReserveCap);
      expect(stats.fallbackCount).toBe(0);
    });

    it('keeps the hard-near cluster reserve bounded when the nearby cluster overflows the reserve', async () => {
      await (renderer as unknown as {
        createCloseModelPool(
          poolKey: Faction,
          factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
          targetSize: number,
        ): Promise<void>;
      }).createCloseModelPool(
        Faction.NVA,
        getPixelForgeNpcRuntimeFaction(Faction.NVA),
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      );

      const hardNearReserveCap = PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP
        + PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP;
      const combatants = new Map<string, Combatant>();
      for (let i = 0; i < hardNearReserveCap + 4; i++) {
        const combatant = createMockCombatant(`hard-near-crowd-${i}`, Faction.NVA, new THREE.Vector3(18 + i, 0, 0));
        combatants.set(combatant.id, combatant);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      expect(activeCloseModels.size).toBe(hardNearReserveCap);
      expect(activeCloseModels.has(`hard-near-crowd-${hardNearReserveCap - 1}`)).toBe(true);
      expect(activeCloseModels.has(`hard-near-crowd-${hardNearReserveCap}`)).toBe(false);

      const { stats, records } = readCloseModelTelemetry(renderer);
      expect(stats.closeModelActiveCap).toBe(hardNearReserveCap);
      expect(stats.fallbackCounts['total-cap']).toBe(4);
      expect(records).toContainEqual(expect.objectContaining({
        combatantId: `hard-near-crowd-${hardNearReserveCap}`,
        reason: 'total-cap',
      }));
    });

    it('pre-releases stale actives so churned high-priority candidates do not pool-empty', async () => {
      // Slice 2 regression: when the active set churns between frames, the
      // top-priority new candidates of the same faction must reclaim the
      // pool slots held by lower-priority actives from the prior frame
      // rather than hitting a phantom pool-empty fallback.
      await (renderer as unknown as {
        createCloseModelPool(
          poolKey: Faction,
          factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
          targetSize: number,
        ): Promise<void>;
      }).createCloseModelPool(
        Faction.NVA,
        getPixelForgeNpcRuntimeFaction(Faction.NVA),
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      );

      const hardNearReserveCap = PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP
        + PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP;

      // Frame 1: cluster A occupies all NVA close-model slots at near positions.
      const frame1 = new Map<string, Combatant>();
      for (let i = 0; i < hardNearReserveCap; i++) {
        const combatant = createMockCombatant(`nva-a-${i}`, Faction.NVA, new THREE.Vector3(18 + i * 0.5, 0, 0));
        frame1.set(combatant.id, combatant);
      }
      renderer.updateBillboards(frame1, new THREE.Vector3(0, 0, 0));
      const activeAfterFrame1 = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      expect(activeAfterFrame1.size).toBe(hardNearReserveCap);

      // Frame 2: a new, higher-priority NVA cluster (cluster B, closer) appears
      // while cluster A is still in the candidate list but now lower priority.
      const frame2 = new Map<string, Combatant>(frame1);
      for (let i = 0; i < hardNearReserveCap; i++) {
        const combatant = createMockCombatant(`nva-b-${i}`, Faction.NVA, new THREE.Vector3(8 + i * 0.5, 0, 0));
        frame2.set(combatant.id, combatant);
      }
      renderer.updateBillboards(frame2, new THREE.Vector3(0, 0, 0));

      const activeAfterFrame2 = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      expect(activeAfterFrame2.size).toBe(hardNearReserveCap);
      // The closer cluster B should fully displace cluster A as close-GLBs.
      for (let i = 0; i < hardNearReserveCap; i++) {
        expect(activeAfterFrame2.has(`nva-b-${i}`)).toBe(true);
      }

      const { stats } = readCloseModelTelemetry(renderer);
      expect(stats.renderedCloseModels).toBe(hardNearReserveCap);
      // Critically: zero phantom pool-empty fallbacks from churn.
      expect(stats.fallbackCounts['pool-empty']).toBe(0);
      // Cluster A is displaced via total-cap, not pool-empty.
      expect(stats.fallbackCounts['total-cap']).toBe(hardNearReserveCap);
    });

    it('budget arbiter v1: active-combat actors outrank closer non-combat actors at the cap edge', async () => {
      // Phase F slice 5 regression: when the close-radius cluster overflows
      // the active cap, the selector must prefer in-combat actors over
      // out-of-combat actors that happen to be slightly closer to the
      // player. This is the case the slice-4 evidence surfaced: A Shau had
      // `inActiveCombat=true` actors stuck on `impostor:total-cap` while
      // non-combat actors won the close-GLB slots by distance alone.
      await (renderer as unknown as {
        createCloseModelPool(
          poolKey: Faction,
          factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
          targetSize: number,
        ): Promise<void>;
      }).createCloseModelPool(
        Faction.NVA,
        getPixelForgeNpcRuntimeFaction(Faction.NVA),
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      );

      const hardNearReserveCap = PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP
        + PIXEL_FORGE_NPC_CLOSE_MODEL_HARD_NEAR_RESERVE_EXTRA_CAP;
      const combatants = new Map<string, Combatant>();

      // Cap-full cohort: non-combat actors at distances 80..(80 + cap*0.5),
      // outside the 64m hard-near reserve bubble so they share priority weights
      // with the active-combat actor below.
      for (let i = 0; i < hardNearReserveCap; i++) {
        const combatant = createMockCombatant(
          `idle-${i}`,
          Faction.NVA,
          new THREE.Vector3(80 + i * 0.5, 0, 0),
          CombatantState.PATROLLING,
        );
        combatants.set(combatant.id, combatant);
      }
      // The arbiter target: an ENGAGING actor at 100m, farther than every
      // idle actor. Without the inActiveCombat weight it would lose to all
      // 14 idle actors by distance.
      const fighter = createMockCombatant(
        'fighter-1',
        Faction.NVA,
        new THREE.Vector3(100, 0, 0),
        CombatantState.ENGAGING,
      );
      combatants.set(fighter.id, fighter);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      // The fighter wins a close-GLB slot despite being farthest.
      expect(activeCloseModels.has('fighter-1')).toBe(true);
      // The farthest idle actor is displaced (total-cap) to make room.
      expect(activeCloseModels.has(`idle-${hardNearReserveCap - 1}`)).toBe(false);

      const rows = renderer.getNearestCombatantMaterializationRows(
        combatants,
        new THREE.Vector3(0, 0, 0),
        combatants.size,
      );
      const fighterRow = rows.find((row) => row.combatantId === 'fighter-1');
      expect(fighterRow?.renderMode).toBe('close-glb');
      expect(fighterRow?.reason).toBe('close-glb:active');
      expect(fighterRow?.inActiveCombat).toBe(true);
    });

    it('emits materialization_tier_changed only on render-mode transitions', async () => {
      // Phase F slice 6 (tier-transition events): subscribers should receive
      // a typed event when a combatant's render mode changes, and only then.
      // Steady-state frames must not produce spurious events.
      type Event = {
        combatantId: string;
        fromRender: 'close-glb' | 'impostor' | 'culled' | null;
        toRender: 'close-glb' | 'impostor' | 'culled';
        reason: string;
        distanceMeters: number;
      };
      // Drain any events queued by earlier tests in this suite so we can
      // assert exact counts against the events this test produces.
      GameEventBus.clear();
      const events: Event[] = [];
      const unsubscribe = GameEventBus.subscribe('materialization_tier_changed', (e: Event) => events.push(e));

      try {
        await (renderer as unknown as {
          createCloseModelPool(
            poolKey: Faction,
            factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
            targetSize: number,
          ): Promise<void>;
        }).createCloseModelPool(
          Faction.NVA,
          getPixelForgeNpcRuntimeFaction(Faction.NVA),
          PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
        );

        // Frame 1: new actor at 12m -> close-glb. First-observation event.
        const combatants = new Map<string, Combatant>();
        const target = createMockCombatant('mover-1', Faction.NVA, new THREE.Vector3(12, 0, 0));
        combatants.set(target.id, target);
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
        GameEventBus.flush();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          combatantId: 'mover-1',
          fromRender: null,
          toRender: 'close-glb',
          reason: 'close-glb:active',
        });
        expect(events[0].distanceMeters).toBeGreaterThan(11);
        events.length = 0;

        // Frame 2: no change. No new events.
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
        GameEventBus.flush();
        expect(events).toHaveLength(0);

        // Frame 3: actor moves to 200m -> impostor:beyond-close-radius.
        target.position.set(200, 0, 0);
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
        GameEventBus.flush();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          combatantId: 'mover-1',
          fromRender: 'close-glb',
          toRender: 'impostor',
          reason: 'impostor:beyond-close-radius',
        });
        events.length = 0;

        // Frame 4: actor removed from world -> prune entry, no event.
        combatants.delete('mover-1');
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
        GameEventBus.flush();
        expect(events).toHaveLength(0);

        // Frame 5: same id re-appears at 10m -> first-observation again.
        const revived = createMockCombatant('mover-1', Faction.NVA, new THREE.Vector3(10, 0, 0));
        combatants.set(revived.id, revived);
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
        GameEventBus.flush();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          combatantId: 'mover-1',
          fromRender: null,
          toRender: 'close-glb',
        });
      } finally {
        unsubscribe();
        GameEventBus.clear();
      }
    });

    it('bounds repeated close-model overflow reports within one update', async () => {
      await (renderer as unknown as {
        createCloseModelPool(
          poolKey: Faction,
          factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
          targetSize: number,
        ): Promise<void>;
      }).createCloseModelPool(
        Faction.NVA,
        getPixelForgeNpcRuntimeFaction(Faction.NVA),
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      );
      const infoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => undefined);

      try {
        const combatants = new Map<string, Combatant>();
        for (let i = 0; i < 48; i++) {
          const combatant = createMockCombatant(`nva-${i}`, Faction.NVA, new THREE.Vector3(70 + i * 0.5, 0, 0));
          combatants.set(combatant.id, combatant);
        }

        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

        const overflowReports = infoSpy.mock.calls.filter((call) => (
          call[0] === 'combat-renderer'
          && String(call[1]).includes('Pixel Forge close NPC total-cap')
        ));
        expect(overflowReports).toHaveLength(1);
      } finally {
        infoSpy.mockRestore();
      }
    });

    it('skips dead non-dying combatants', () => {
      const combatants = new Map<string, Combatant>();
      const deadCombatant = createMockCombatant('dead-1', Faction.US, new THREE.Vector3(10, 0, 0), CombatantState.DEAD);
      deadCombatant.isDying = false;
      combatants.set('dead-1', deadCombatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      expect(deadCombatant.billboardIndex).toBeUndefined();
    });

    it('still renders dying combatants (for death animation)', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant('dying-1', Faction.US, new THREE.Vector3(10, 0, 0), CombatantState.DEAD);
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.5;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dyingCombatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      expect(dyingCombatant.billboardIndex).toBeDefined();
    });

    it('lets the Pixel Forge death impostor clip own pose without procedural shrink', () => {
      const combatants = new Map<string, Combatant>();
      // Distance >> close-model radius so the death pose runs through the
      // impostor path (this test cares about impostor death behavior).
      const dyingCombatant = createMockCombatant('dying-pf', Faction.NVA, new THREE.Vector3(160, 0, 0), CombatantState.DEAD);
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.04;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-pf', dyingCombatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const mesh = (renderer as unknown as { factionMeshes: Map<string, THREE.InstancedMesh> })
        .factionMeshes.get('NVA_death_fall_back')!;
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      mesh.getMatrixAt(0, matrix);
      matrix.decompose(position, rotation, scale);
      const attributeCalls = vi.mocked(CombatantMeshFactoryModule.setPixelForgeNpcImpostorAttributes).mock.calls
        .filter((call) => call[0] === mesh);
      const latestAttributes = attributeCalls[attributeCalls.length - 1];

      expect(mesh.count).toBe(1);
      expect(mesh.visible).toBe(true);
      expect(scale.y).toBeCloseTo(1);
      expect(latestAttributes?.[5]).toBeGreaterThan(0.45);
      expect(latestAttributes?.[5]).toBeLessThan(0.55);
    });

    it('lazy-creates a Pixel Forge impostor bucket when a non-startup clip first appears', () => {
      const maps = renderer as unknown as { factionMeshes: Map<string, THREE.InstancedMesh> };
      maps.factionMeshes.delete('NVA_walk_fight_forward');
      const combatants = new Map<string, Combatant>();
      // Distance >> close-model radius so the impostor bucket is exercised.
      const combatant = createMockCombatant(
        'engaging-far',
        Faction.NVA,
        new THREE.Vector3(160, 0, 0),
        CombatantState.ENGAGING
      );
      combatants.set('engaging-far', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      expect(maps.factionMeshes.has('NVA_walk_fight_forward')).toBe(true);
      expect(combatant.billboardIndex).toBe(0);
    });

    it('culls combatants beyond render distance', () => {
      const combatants = new Map<string, Combatant>();
      const farCombatant = createMockCombatant('far-1', Faction.US, new THREE.Vector3(500, 0, 0));
      combatants.set('far-1', farCombatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      expect(farCombatant.billboardIndex).toBeUndefined();
    });

    it('grounds faction markers at combatant terrain height on elevated terrain', () => {
      const combatants = new Map<string, Combatant>();
      // Distance >> close-model radius so the impostor + ground-marker path
      // is exercised. Marker grounding behaves identically near and far.
      const combatant = createMockCombatant('ridge-1', Faction.US, new THREE.Vector3(160, 54.9, 0));
      combatants.set('ridge-1', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 54.9, 0));

      const markers = (renderer as unknown as { factionGroundMarkers: Map<string, THREE.InstancedMesh> }).factionGroundMarkers;
      const markerMesh = Array.from(markers.values()).find((mesh) => mesh.count === 1)!;
      const markerMatrix = new THREE.Matrix4();
      const markerPosition = new THREE.Vector3();
      markerMesh.getMatrixAt(0, markerMatrix);
      markerPosition.setFromMatrixPosition(markerMatrix);

      expect(markerMesh.count).toBe(1);
      expect(markerMesh.visible).toBe(true);
      expect(markerPosition.y).toBeCloseTo(54.9 - NPC_Y_OFFSET + 0.08);
    });

    it('maps Pixel Forge impostor views through the octahedral atlas contract', () => {
      const combatant = createMockCombatant('view-1', Faction.US, new THREE.Vector3(0, 0, 0));
      const getViewTile = (renderer as unknown as {
        getImpostorViewTile(combatant: Combatant): { column: number; row: number };
      }).getImpostorViewTile.bind(renderer);

      camera.position.set(10, 0, 0);
      expect(getViewTile(combatant)).toEqual({ column: 3, row: 0 });

      camera.position.set(-10, 0, 0);
      expect(getViewTile(combatant)).toEqual({ column: 3, row: 6 });

      camera.position.set(0, 10, 0);
      expect(getViewTile(combatant)).toEqual({ column: 3, row: 3 });
    });

    it('handles player squad tagging when squad id is set', () => {
      renderer.setPlayerSquadId('squad-1');

      const combatants = new Map<string, Combatant>();
      const squadMember = createMockCombatant('sm-1', Faction.US, new THREE.Vector3(10, 0, 0));
      squadMember.squadId = 'squad-1';
      combatants.set('sm-1', squadMember);

      expect(() => {
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
      }).not.toThrow();
      expect(squadMember.billboardIndex).toBeDefined();
    });
  });

  describe('death animations', () => {
    it('clamps close GLB death fall to a one-shot pose instead of looping it', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant('dying-close', Faction.US, new THREE.Vector3(10, 0, 0), CombatantState.DEAD);
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.5;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-close', dyingCombatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as {
        activeCloseModels: Map<string, {
          activeClip?: string;
          actions: Map<string, THREE.AnimationAction>;
          root: THREE.Group;
        }>;
      }).activeCloseModels;
      const instance = activeCloseModels.get('dying-close');
      const deathAction = instance?.actions.get('death_fall_back');

      expect(instance?.activeClip).toBe('death_fall_back');
      expect(deathAction?.clampWhenFinished).toBe(true);
      expect(deathAction?.paused).toBe(true);
      expect(deathAction?.time).toBeGreaterThan(0.9);
      expect(instance?.root.visible).toBe(true);
    });

    it('fades close GLB materials during the death fadeout window', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant('dying-fade', Faction.NVA, new THREE.Vector3(10, 0, 0), CombatantState.DEAD);
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.95;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-fade', dyingCombatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as {
        activeCloseModels: Map<string, { root: THREE.Group }>;
      }).activeCloseModels;
      const instance = activeCloseModels.get('dying-fade');
      const materials: THREE.Material[] = [];
      instance?.root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        materials.push(...childMaterials);
      });

      expect(materials.some((material) => material.opacity < 1 && material.transparent)).toBe(true);
    });

    it('drives far death impostors with one-shot frame progress and fade opacity', () => {
      const combatants = new Map<string, Combatant>();
      // Distance >> close-model radius so the death-impostor path is exercised.
      const dyingCombatant = createMockCombatant('dying-far', Faction.US, new THREE.Vector3(160, 0, 0), CombatantState.DEAD);
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.95;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-far', dyingCombatant);
      const setAttributes = vi.mocked(CombatantMeshFactoryModule.setPixelForgeNpcImpostorAttributes);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      expect(dyingCombatant.billboardIndex).toBe(0);
      expect(setAttributes).toHaveBeenCalled();
      const call = setAttributes.mock.calls[0];
      expect(call[4]).toBeGreaterThanOrEqual(0);
      expect(call[5]).toBeCloseTo(0.999);
      expect(call[6]).toBeGreaterThan(0);
      expect(call[6]).toBeLessThan(1);
    });

    it('handles all death animation types without throwing', () => {
      const combatants = new Map<string, Combatant>();
      for (const [i, type] of (['fallback', 'spinfall', 'shatter', 'crumple'] as const).entries()) {
        const c = createMockCombatant(`dying-${i}`, Faction.US, new THREE.Vector3(10 * (i + 1), 0, 0), CombatantState.DEAD);
        c.isDying = true;
        c.deathProgress = 0.2 + i * 0.2;
        c.deathAnimationType = type;
        c.deathDirection = new THREE.Vector3(1, 0, 0);
        combatants.set(c.id, c);
      }

      expect(() => {
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
      }).not.toThrow();
    });

    it('handles missing death direction without throwing', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant('dying-1', Faction.US, new THREE.Vector3(10, 0, 0), CombatantState.DEAD);
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.3;
      dyingCombatant.deathAnimationType = 'fallback';
      combatants.set('dying-1', dyingCombatant);

      expect(() => {
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
      }).not.toThrow();
    });
  });

  describe('shader bindings', () => {
    it('calls shader updater with provided delta time', () => {
      renderer.updateShaderUniforms(0.016);

      expect(CombatantShadersModule.updateShaderUniforms).toHaveBeenCalled();
    });

    it('pipes damage flash through the shader module', () => {
      renderer.setDamageFlash('combatant-1', 1.0);

      expect(CombatantShadersModule.setDamageFlash).toHaveBeenCalledWith(
        expect.any(Map),
        'combatant-1',
        1.0
      );
    });

    it('delegates texture updates to the mesh factory', () => {
      const combatant = createMockCombatant('test-1', Faction.US, new THREE.Vector3(0, 0, 0));

      renderer.updateCombatantTexture(combatant);

      expect(CombatantMeshFactoryModule.updateCombatantTexture).toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('disposes meshes via mesh factory', () => {
      renderer.dispose();

      expect(CombatantMeshFactoryModule.disposeCombatantMeshes).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles an empty combatants map', () => {
      expect(() => {
        renderer.updateBillboards(new Map(), new THREE.Vector3(0, 0, 0));
      }).not.toThrow();
    });

    it('handles mesh capacity overflow gracefully', () => {
      const combatants = new Map<string, Combatant>();

      for (let i = 0; i < 150; i++) {
        const combatant = createMockCombatant(
          `combatant-${i}`,
          Faction.US,
          new THREE.Vector3(i % 20, 0, Math.floor(i / 20)),
          CombatantState.IDLE
        );
        combatants.set(`combatant-${i}`, combatant);
      }

      expect(() => {
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
      }).not.toThrow();
    });
  });

  describe('full update cycle (integration)', () => {
    it('runs a mixed combatants scene through walk+billboard+shader without errors', () => {
      renderer.setPlayerSquadId('squad-1');

      const combatants = new Map<string, Combatant>();
      const usCombatant = createMockCombatant('us-1', Faction.US, new THREE.Vector3(10, 0, 0), CombatantState.IDLE);
      combatants.set('us-1', usCombatant);

      const opforCombatant = createMockCombatant('opfor-1', Faction.NVA, new THREE.Vector3(20, 0, 0), CombatantState.ENGAGING);
      combatants.set('opfor-1', opforCombatant);

      const squadMember = createMockCombatant('squad-1', Faction.US, new THREE.Vector3(15, 0, 0), CombatantState.ALERT);
      squadMember.squadId = 'squad-1';
      combatants.set('squad-1', squadMember);

      const dyingCombatant = createMockCombatant('dying-1', Faction.US, new THREE.Vector3(25, 0, 0), CombatantState.DEAD);
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.3;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dyingCombatant);

      renderer.updateWalkFrame(0.016);
      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
      renderer.updateShaderUniforms(0.016);

      expect(usCombatant.billboardIndex).toBeDefined();
      expect(opforCombatant.billboardIndex).toBeDefined();
      expect(squadMember.billboardIndex).toBeDefined();
      expect(dyingCombatant.billboardIndex).toBeDefined();
    });
  });

  describe('close-model priority score', () => {
    async function growPool(faction: Faction): Promise<void> {
      await (renderer as unknown as {
        createCloseModelPool(
          poolKey: Faction,
          factionConfig: ReturnType<typeof getPixelForgeNpcRuntimeFaction>,
          targetSize: number,
        ): Promise<void>;
      }).createCloseModelPool(
        faction,
        getPixelForgeNpcRuntimeFaction(faction),
        PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
      );
    }

    function configureCameraTowardPlusX(): void {
      camera.position.set(0, 5, 0);
      (camera as THREE.PerspectiveCamera).lookAt(50, 0, 0);
      camera.updateMatrixWorld(true);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    }

    it('caps active close models at the GPU budget when more candidates lie within radius', async () => {
      await growPool(Faction.NVA);
      configureCameraTowardPlusX();

      const combatants = new Map<string, Combatant>();
      // 12 NPCs along the camera-facing axis, all within close-model radius
      // but outside the spawn-residency reserve.
      for (let i = 0; i < 12; i++) {
        const c = createMockCombatant(
          `nva-prio-${i}`,
          Faction.NVA,
          new THREE.Vector3(70 + i * 3, 0, 0),
        );
        combatants.set(c.id, c);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const active = (renderer as unknown as {
        activeCloseModels: Map<string, unknown>;
      }).activeCloseModels;
      expect(active.size).toBe(PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP);
    });

    it('prefers on-screen candidates over non-adjacent off-screen candidates', async () => {
      await growPool(Faction.NVA);
      configureCameraTowardPlusX();

      const combatants = new Map<string, Combatant>();
      // 7 on-screen NPCs in front of camera (camera looks toward +X).
      for (let i = 0; i < 7; i++) {
        const c = createMockCombatant(`front-${i}`, Faction.NVA, new THREE.Vector3(70 + i, 0, 0));
        combatants.set(c.id, c);
      }
      // 7 off-screen NPCs behind the camera, slightly closer by raw distance
      // but outside the hard-near anti-pop bubble.
      for (let i = 0; i < 7; i++) {
        const c = createMockCombatant(`back-${i}`, Faction.NVA, new THREE.Vector3(-(65 + i), 0, 0));
        combatants.set(c.id, c);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const active = (renderer as unknown as {
        activeCloseModels: Map<string, unknown>;
      }).activeCloseModels;
      // Every on-screen NPC must win a slot; the 8th slot goes to the closest
      // off-screen candidate.
      for (let i = 0; i < 7; i++) expect(active.has(`front-${i}`)).toBe(true);
      expect(active.size).toBe(PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP);
    });

    it('prioritizes spawn-adjacent hard-near actors over farther on-screen actors', async () => {
      await growPool(Faction.NVA);
      configureCameraTowardPlusX();

      const combatants = new Map<string, Combatant>();
      for (let i = 0; i < 8; i++) {
        const c = createMockCombatant(`front-${i}`, Faction.NVA, new THREE.Vector3(70 + i, 0, 0));
        combatants.set(c.id, c);
      }
      for (let i = 0; i < 4; i++) {
        const c = createMockCombatant(`hard-near-${i}`, Faction.NVA, new THREE.Vector3(-(16 + i), 0, 0));
        combatants.set(c.id, c);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const active = (renderer as unknown as {
        activeCloseModels: Map<string, unknown>;
      }).activeCloseModels;
      for (let i = 0; i < 4; i++) expect(active.has(`hard-near-${i}`)).toBe(true);
      expect(active.size).toBe(PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP);
    });

    it('keeps player-squad members in close-model slots even when off-screen', async () => {
      await growPool(Faction.NVA);
      await growPool(Faction.US);
      configureCameraTowardPlusX();
      renderer.setPlayerSquadId('squad-1');

      const combatants = new Map<string, Combatant>();
      // 7 on-screen non-squad NPCs filling the front slots.
      for (let i = 0; i < 7; i++) {
        const c = createMockCombatant(`front-${i}`, Faction.NVA, new THREE.Vector3(70 + i, 0, 0));
        combatants.set(c.id, c);
      }
      // One off-screen player-squad member.
      const squadMate = createMockCombatant(
        'squad-mate',
        Faction.US,
        new THREE.Vector3(-72, 0, 0),
      );
      squadMate.squadId = 'squad-1';
      combatants.set('squad-mate', squadMate);
      // One off-screen non-squad member at a closer distance than the squad-mate.
      const closerBack = createMockCombatant(
        'closer-back',
        Faction.NVA,
        new THREE.Vector3(-66, 0, 0),
      );
      combatants.set('closer-back', closerBack);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const active = (renderer as unknown as {
        activeCloseModels: Map<string, unknown>;
      }).activeCloseModels;
      expect(active.has('squad-mate')).toBe(true);
      expect(active.has('closer-back')).toBe(false);
    });

    it('debounces brief off-screen flicker so close-model slots do not thrash', async () => {
      await growPool(Faction.NVA);
      configureCameraTowardPlusX();

      const combatants = new Map<string, Combatant>();
      for (let i = 0; i < 8; i++) {
        const c = createMockCombatant(`front-${i}`, Faction.NVA, new THREE.Vector3(70 + i, 0, 0));
        combatants.set(c.id, c);
      }

      // First update: front-0..front-7 on-screen take all 8 slots.
      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
      let active = (renderer as unknown as {
        activeCloseModels: Map<string, unknown>;
      }).activeCloseModels;
      for (let i = 0; i < 8; i++) expect(active.has(`front-${i}`)).toBe(true);

      // Turn the camera away so all front-i drop off-screen, and add a single
      // newly visible candidate. The recently-visible debounce should keep
      // most of the prior selection from immediately getting kicked out.
      (camera as THREE.PerspectiveCamera).lookAt(0, 5, -50);
      camera.updateMatrixWorld(true);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      const newcomer = createMockCombatant(
        'newcomer',
        Faction.NVA,
        new THREE.Vector3(0, 0, -70),
      );
      combatants.set('newcomer', newcomer);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
      active = (renderer as unknown as {
        activeCloseModels: Map<string, unknown>;
      }).activeCloseModels;
      let survivors = 0;
      for (let i = 0; i < 8; i++) if (active.has(`front-${i}`)) survivors++;
      expect(survivors).toBeGreaterThanOrEqual(7);
      expect(active.size).toBe(PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP);
    });
  });

  describe('velocity-keyed impostor cadence', () => {
    function decodeImpostorFrameFromMockCall(
      callIndex: number,
      clipDuration: number,
      framesPerClip: number,
    ): number | undefined {
      const calls = vi.mocked(CombatantMeshFactoryModule.setPixelForgeNpcImpostorAttributes).mock.calls;
      if (callIndex >= calls.length) return undefined;
      const phase = calls[callIndex][2];
      const elapsedTime = (renderer as unknown as { elapsedTime: number }).elapsedTime;
      const raw = ((elapsedTime + phase * clipDuration) / clipDuration) * framesPerClip;
      // Match the GLSL `mod()` semantics for negative inputs.
      const wrapped = ((raw % framesPerClip) + framesPerClip) % framesPerClip;
      return Math.floor(wrapped);
    }

    it('holds a stationary NPC on the same impostor frame across many ticks', () => {
      const combatants = new Map<string, Combatant>();
      // Place beyond close-model radius so the impostor path runs.
      const stationary = createMockCombatant(
        'stationary',
        Faction.NVA,
        new THREE.Vector3(160, 0, 0),
        CombatantState.PATROLLING,
      );
      combatants.set(stationary.id, stationary);

      const samples: number[] = [];
      for (let i = 0; i < 60; i++) {
        vi.mocked(CombatantMeshFactoryModule.setPixelForgeNpcImpostorAttributes).mockClear();
        renderer.updateWalkFrame(0.016);
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
        const frame = decodeImpostorFrameFromMockCall(0, 1.0, 8);
        if (frame !== undefined) samples.push(frame);
      }
      expect(samples.length).toBeGreaterThan(30);
      expect(new Set(samples).size).toBe(1);
    });

    it('cycles a moving NPC through impostor frames in proportion to distance traveled', () => {
      const combatants = new Map<string, Combatant>();
      const moving = createMockCombatant(
        'moving',
        Faction.NVA,
        new THREE.Vector3(160, 0, 0),
        CombatantState.PATROLLING,
      );
      moving.velocity.set(4, 0, 0);
      combatants.set(moving.id, moving);

      const seen = new Set<number>();
      const dt = 1 / 60;
      const ticks = 60;
      for (let i = 0; i < ticks; i++) {
        vi.mocked(CombatantMeshFactoryModule.setPixelForgeNpcImpostorAttributes).mockClear();
        renderer.updateWalkFrame(dt);
        moving.position.x += moving.velocity.x * dt;
        renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));
        const frame = decodeImpostorFrameFromMockCall(0, 1.0, 8);
        if (frame !== undefined) seen.add(frame);
      }
      // 4 m/s for 1 s ~= 4 m of travel. At ~1 cycle / 0.6 m the NPC visits
      // multiple distinct impostor frames within the run; we allow slack
      // for exact-frame timing.
      expect(seen.size).toBeGreaterThanOrEqual(4);
    });
  });
});
