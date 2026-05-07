import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  PIXEL_FORGE_NPC_CLOSE_MODEL_INITIAL_POOL_PER_FACTION,
  PIXEL_FORGE_NPC_CLOSE_MODEL_POOL_PER_FACTION,
} from './PixelForgeNpcRuntime';

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
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.1, 0.08),
        new THREE.MeshStandardMaterial({ name: 'weapon', color: 0x333333 }),
      );
      mesh.name = 'Mesh_Barrel';
      root.add(mesh);
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

describe('CombatantRenderer', () => {
  let renderer: CombatantRenderer;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let assetLoader: AssetLoader;

  beforeEach(async () => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    assetLoader = createMockAssetLoader();

    renderer = new CombatantRenderer(scene, camera, assetLoader);
    await renderer.createFactionBillboards({ eagerCloseModelPools: true });

    vi.clearAllMocks();
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

      lazyRenderer.dispose();
      await vi.runOnlyPendingTimersAsync();
      vi.useRealTimers();
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
    });

    it('suppresses only after the per-faction close-model pool reaches its hard cap', async () => {
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
        const combatant = createMockCombatant(`nva-${i}`, Faction.NVA, new THREE.Vector3(2 + i, 0, 0));
        combatants.set(combatant.id, combatant);
      }

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      const activeCloseModels = (renderer as unknown as { activeCloseModels: Map<string, unknown> }).activeCloseModels;
      expect(activeCloseModels.has('nva-0')).toBe(true);
      expect(activeCloseModels.has('nva-39')).toBe(true);
      expect(activeCloseModels.has('nva-47')).toBe(false);
      expect(combatants.get('nva-47')?.billboardIndex).toBe(-1);
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

    it('lazy-creates a Pixel Forge impostor bucket when a non-startup clip first appears', () => {
      const maps = renderer as unknown as { factionMeshes: Map<string, THREE.InstancedMesh> };
      maps.factionMeshes.delete('NVA_walk_fight_forward');
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant(
        'engaging-far',
        Faction.NVA,
        new THREE.Vector3(120, 0, 0),
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
      const combatant = createMockCombatant('ridge-1', Faction.US, new THREE.Vector3(80, 54.9, 0));
      combatants.set('ridge-1', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 54.9, 0));

      const markers = (renderer as unknown as { factionGroundMarkers: Map<string, THREE.InstancedMesh> }).factionGroundMarkers;
      const markerMesh = Array.from(markers.values()).find((mesh) => mesh.count === 1)!;
      const markerMatrix = new THREE.Matrix4();
      const markerPosition = new THREE.Vector3();
      markerMesh.getMatrixAt(0, markerMatrix);
      markerPosition.setFromMatrixPosition(markerMatrix);

      expect(markerMesh.count).toBe(1);
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
      const dyingCombatant = createMockCombatant('dying-far', Faction.US, new THREE.Vector3(120, 0, 0), CombatantState.DEAD);
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
});
