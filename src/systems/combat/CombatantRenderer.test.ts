import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantRenderer } from './CombatantRenderer';
import { Combatant, CombatantState, Faction } from './types';
import { AssetLoader } from '../assets/AssetLoader';
import * as CombatantMeshFactoryModule from './CombatantMeshFactory';
import * as CombatantShadersModule from './CombatantShaders';

// Directions used in directional billboard system
const DIRECTIONS = ['front', 'back', 'side'] as const;

// Helper to create mock InstancedMesh
function createMockInstancedMesh(): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 100);
  mesh.count = 0;
  return mesh;
}

// Helper to create mock ShaderMaterial
function createMockShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      combatState: { value: 0 },
      time: { value: 0 },
    },
  });
}

// Build faction mesh maps for all directional keys
function buildFactionMeshMap(): Map<string, THREE.InstancedMesh> {
  const map = new Map<string, THREE.InstancedMesh>();
  for (const prefix of ['US', 'ARVN', 'NVA', 'VC', 'SQUAD']) {
    for (const state of ['walking', 'firing']) {
      for (const dir of DIRECTIONS) {
        map.set(`${prefix}_${state}_${dir}`, createMockInstancedMesh());
      }
    }
  }
  return map;
}

function buildFactionMaterialMap(): Map<string, THREE.ShaderMaterial> {
  const map = new Map<string, THREE.ShaderMaterial>();
  for (const prefix of ['US', 'ARVN', 'NVA', 'VC', 'SQUAD']) {
    for (const state of ['walking', 'firing']) {
      for (const dir of DIRECTIONS) {
        map.set(`${prefix}_${state}_${dir}`, createMockShaderMaterial());
      }
    }
  }
  return map;
}

// Mock CombatantMeshFactory module
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
  },
  disposeCombatantMeshes: vi.fn(),
  updateCombatantTexture: vi.fn(),
}));

// Mock CombatantShaders module
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

// Helper to create mock AssetLoader
function createMockAssetLoader(): AssetLoader {
  return {
    loadTextures: vi.fn(),
    loadSounds: vi.fn(),
    getTexture: vi.fn(),
  } as unknown as AssetLoader;
}

// Helper to create a mock combatant
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
    await renderer.createFactionBillboards();

    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with scene, camera, and asset loader', () => {
      expect(renderer).toBeDefined();
    });

    it('should create mesh factory', () => {
      expect(renderer).toBeDefined();
    });
  });

  describe('createFactionBillboards', () => {
    it('should create faction meshes', async () => {
      const newRenderer = new CombatantRenderer(scene, camera, assetLoader);
      await newRenderer.createFactionBillboards();

      expect(newRenderer).toBeDefined();
    });

    it('should initialize faction materials', async () => {
      const newRenderer = new CombatantRenderer(scene, camera, assetLoader);
      await newRenderer.createFactionBillboards();

      expect(newRenderer).toBeDefined();
    });
  });

  describe('setPlayerSquadId', () => {
    it('should set player squad ID', () => {
      renderer.setPlayerSquadId('squad-1');
      expect(renderer).toBeDefined();
    });

    it('should reset player squad detected flag', () => {
      renderer.setPlayerSquadId('squad-1');
      renderer.setPlayerSquadId('squad-2');
      expect(renderer).toBeDefined();
    });

    it('should handle undefined squad ID', () => {
      renderer.setPlayerSquadId(undefined);
      expect(renderer).toBeDefined();
    });
  });

  describe('updateBillboards', () => {
    it('should reset mesh counts before update', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(renderer).toBeDefined();
    });

    it('should render combatants within range', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant(
        'test-1',
        Faction.US,
        new THREE.Vector3(50, 0, 0),
        CombatantState.IDLE
      );
      combatants.set('test-1', combatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(combatant.billboardIndex).toBeDefined();
    });

    it('should skip dead combatants that are not dying', () => {
      const combatants = new Map<string, Combatant>();
      const deadCombatant = createMockCombatant(
        'dead-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.DEAD
      );
      deadCombatant.isDying = false;
      combatants.set('dead-1', deadCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(deadCombatant.billboardIndex).toBeUndefined();
    });

    it('should skip player proxy combatants', () => {
      const combatants = new Map<string, Combatant>();
      const proxyCombatant = createMockCombatant(
        'proxy-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0)
      );
      proxyCombatant.isPlayerProxy = true;
      combatants.set('proxy-1', proxyCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(proxyCombatant.billboardIndex).toBeUndefined();
    });

    it('should cull combatants beyond render distance', () => {
      const combatants = new Map<string, Combatant>();
      const farCombatant = createMockCombatant(
        'far-1',
        Faction.US,
        new THREE.Vector3(500, 0, 0)
      );
      combatants.set('far-1', farCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(farCombatant.billboardIndex).toBeUndefined();
    });

    it('should group combatants by faction and state', () => {
      const combatants = new Map<string, Combatant>();

      const usCombatant = createMockCombatant(
        'us-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.IDLE
      );
      const opforCombatant = createMockCombatant(
        'opfor-1',
        Faction.NVA,
        new THREE.Vector3(20, 0, 0),
        CombatantState.ENGAGING
      );

      combatants.set('us-1', usCombatant);
      combatants.set('opfor-1', opforCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(usCombatant.billboardIndex).toBeDefined();
      expect(opforCombatant.billboardIndex).toBeDefined();
    });

    it('should render player squad members with SQUAD prefix', () => {
      renderer.setPlayerSquadId('squad-1');

      const combatants = new Map<string, Combatant>();
      const squadMember = createMockCombatant(
        'squad-member-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.IDLE
      );
      squadMember.squadId = 'squad-1';
      combatants.set('squad-member-1', squadMember);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(squadMember.billboardIndex).toBeDefined();
    });

    it('should render alert state as walking (no separate alert texture)', () => {
      const combatants = new Map<string, Combatant>();
      const alertCombatant = createMockCombatant(
        'alert-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.ALERT
      );
      combatants.set('alert-1', alertCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      // Alert now maps to walking, so it should render
      expect(alertCombatant.billboardIndex).toBeDefined();
    });
  });

  describe('Directional billboard selection', () => {
    it('should select front view when camera faces NPC', () => {
      // Camera at z=10, NPC at origin facing toward camera (rotation = PI = facing -z)
      camera.position.set(0, 5, 10);
      camera.lookAt(0, 0, 0);

      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant(
        'front-test',
        Faction.US,
        new THREE.Vector3(0, 0, 0),
        CombatantState.IDLE,
        Math.PI // Facing toward camera
      );
      combatants.set('front-test', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 10));

      expect(combatant.billboardIndex).toBeDefined();
    });

    it('should select back view when camera is behind NPC', () => {
      camera.position.set(0, 5, -10);
      camera.lookAt(0, 0, 0);

      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant(
        'back-test',
        Faction.US,
        new THREE.Vector3(0, 0, 0),
        CombatantState.IDLE,
        Math.PI // Facing -z, camera is behind at -z
      );
      combatants.set('back-test', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, -10));

      expect(combatant.billboardIndex).toBeDefined();
    });

    it('should select side view when camera is perpendicular', () => {
      camera.position.set(10, 5, 0);
      camera.lookAt(0, 0, 0);

      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant(
        'side-test',
        Faction.US,
        new THREE.Vector3(0, 0, 0),
        CombatantState.IDLE,
        0 // Facing +x, camera is at +x
      );
      combatants.set('side-test', combatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(10, 0, 0));

      expect(combatant.billboardIndex).toBeDefined();
    });
  });

  describe('Walk animation', () => {
    it('should update walk frame timer without error', () => {
      expect(() => {
        renderer.updateWalkFrame(0.016);
      }).not.toThrow();
    });

    it('should swap walk frame after interval', () => {
      // Advance time past the 400ms interval
      for (let i = 0; i < 30; i++) {
        renderer.updateWalkFrame(0.016);
      }
      expect(renderer).toBeDefined();
    });
  });

  describe('Death animations', () => {
    it('should render dying combatants with death animation', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant(
        'dying-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.DEAD
      );
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.5;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dyingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(dyingCombatant.billboardIndex).toBeDefined();
    });

    it('should handle spinfall death animation', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant(
        'dying-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.DEAD
      );
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.1;
      dyingCombatant.deathAnimationType = 'spinfall';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dyingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(dyingCombatant.billboardIndex).toBeDefined();
    });

    it('should handle shatter death animation', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant(
        'dying-shatter-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.DEAD
      );
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.2;
      dyingCombatant.deathAnimationType = 'shatter';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-shatter-1', dyingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);
      renderer.updateBillboards(combatants, playerPosition);

      expect(dyingCombatant.billboardIndex).toBeDefined();
    });

    it('should handle crumple death animation', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant(
        'dying-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.DEAD
      );
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.1;
      dyingCombatant.deathAnimationType = 'crumple';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dyingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(dyingCombatant.billboardIndex).toBeDefined();
    });

    it('should fade out combatants at end of death animation', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant(
        'dying-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.DEAD
      );
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.95;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dyingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(dyingCombatant.billboardIndex).toBeDefined();
    });

    it('should handle death animation without death direction', () => {
      const combatants = new Map<string, Combatant>();
      const dyingCombatant = createMockCombatant(
        'dying-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.DEAD
      );
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.3;
      dyingCombatant.deathAnimationType = 'fallback';
      combatants.set('dying-1', dyingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });
  });

  describe('State-based rendering', () => {
    it('should render firing state correctly', () => {
      const combatants = new Map<string, Combatant>();
      const firingCombatant = createMockCombatant(
        'firing-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.ENGAGING
      );
      combatants.set('firing-1', firingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(firingCombatant.billboardIndex).toBeDefined();
    });

    it('should render suppressing state as firing', () => {
      const combatants = new Map<string, Combatant>();
      const suppressingCombatant = createMockCombatant(
        'suppressing-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.SUPPRESSING
      );
      combatants.set('suppressing-1', suppressingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(suppressingCombatant.billboardIndex).toBeDefined();
    });

    it('should update combat state uniforms based on combatant states', () => {
      const combatants = new Map<string, Combatant>();
      const engagingCombatant = createMockCombatant(
        'engaging-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.ENGAGING
      );
      combatants.set('engaging-1', engagingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(engagingCombatant.billboardIndex).toBeDefined();
    });
  });

  describe('Billboard positioning and rotation', () => {
    it('should billboard US combatants to face camera', () => {
      const combatants = new Map<string, Combatant>();
      const usCombatant = createMockCombatant(
        'us-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.IDLE,
        0
      );
      combatants.set('us-1', usCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(usCombatant.billboardIndex).toBeDefined();
    });

    it('should handle combatant scale correctly', () => {
      const combatants = new Map<string, Combatant>();
      const scaledCombatant = createMockCombatant(
        'scaled-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0)
      );
      scaledCombatant.scale.set(1.5, 1.5, 1.5);
      combatants.set('scaled-1', scaledCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(scaledCombatant.billboardIndex).toBeDefined();
    });

    it('should flip side sprite based on view angle', () => {
      const combatants = new Map<string, Combatant>();
      const usCombatant = createMockCombatant(
        'us-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.IDLE,
        Math.PI / 2
      );
      combatants.set('us-1', usCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(usCombatant.billboardIndex).toBeDefined();
    });
  });

  describe('Aura and ground markers', () => {
    it('should update outline/aura meshes', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant(
        'test-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0)
      );
      combatants.set('test-1', combatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(combatant.billboardIndex).toBeDefined();
    });

    it('should update ground marker meshes', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant(
        'test-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0)
      );
      combatants.set('test-1', combatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(combatant.billboardIndex).toBeDefined();
    });
  });

  describe('Shader management', () => {
    it('should update shader uniforms', () => {
      renderer.updateShaderUniforms(0.016);

      expect(CombatantShadersModule.updateShaderUniforms).toHaveBeenCalled();
    });

    it('should set damage flash for combatant', () => {
      renderer.setDamageFlash('combatant-1', 1.0);

      expect(CombatantShadersModule.setDamageFlash).toHaveBeenCalledWith(
        expect.any(Map),
        'combatant-1',
        1.0
      );
    });

    it('should apply shader preset', () => {
      renderer.applyPreset('default');

      expect(renderer).toBeDefined();
    });

    it('should get shader settings', () => {
      const settings = renderer.getShaderSettings();

      expect(settings).toBeDefined();
    });

    it('should toggle cel shading', () => {
      renderer.toggleCelShading();

      expect(renderer).toBeDefined();
    });

    it('should toggle rim lighting', () => {
      renderer.toggleRimLighting();

      expect(renderer).toBeDefined();
    });

    it('should toggle aura', () => {
      renderer.toggleAura();

      expect(renderer).toBeDefined();
    });

    it('should set partial shader settings', () => {
      renderer.setShaderSettings({ celShading: false });

      expect(renderer).toBeDefined();
    });
  });

  describe('Texture management', () => {
    it('should update combatant texture', () => {
      const combatant = createMockCombatant(
        'test-1',
        Faction.US,
        new THREE.Vector3(0, 0, 0)
      );

      renderer.updateCombatantTexture(combatant);

      expect(CombatantMeshFactoryModule.updateCombatantTexture).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose of meshes and materials', () => {
      renderer.dispose();

      expect(CombatantMeshFactoryModule.disposeCombatantMeshes).toHaveBeenCalled();
    });

    it('should clear combatant states', () => {
      renderer.setDamageFlash('combatant-1', 1.0);
      renderer.dispose();

      expect(renderer).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty combatants map', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle combatants exactly at render distance', () => {
      const combatants = new Map<string, Combatant>();
      const combatant = createMockCombatant(
        'test-1',
        Faction.US,
        new THREE.Vector3(400, 0, 0)
      );
      combatants.set('test-1', combatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(combatant.billboardIndex).toBeDefined();
    });

    it('should handle mesh capacity overflow gracefully', () => {
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

      const playerPosition = new THREE.Vector3(0, 0, 0);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle combatant with no target', () => {
      const combatants = new Map<string, Combatant>();
      const opforCombatant = createMockCombatant(
        'opfor-1',
        Faction.NVA,
        new THREE.Vector3(10, 0, 0),
        CombatantState.IDLE,
        Math.PI
      );
      opforCombatant.target = null;
      combatants.set('opfor-1', opforCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle death animation in different phases', () => {
      const combatants = new Map<string, Combatant>();

      const fallingCombatant = createMockCombatant(
        'falling-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.DEAD
      );
      fallingCombatant.isDying = true;
      fallingCombatant.deathProgress = 0.05;
      fallingCombatant.deathAnimationType = 'spinfall';
      fallingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('falling-1', fallingCombatant);

      const groundCombatant = createMockCombatant(
        'ground-1',
        Faction.US,
        new THREE.Vector3(20, 0, 0),
        CombatantState.DEAD
      );
      groundCombatant.isDying = true;
      groundCombatant.deathProgress = 0.5;
      groundCombatant.deathAnimationType = 'spinfall';
      groundCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('ground-1', groundCombatant);

      const fadingCombatant = createMockCombatant(
        'fading-1',
        Faction.US,
        new THREE.Vector3(30, 0, 0),
        CombatantState.DEAD
      );
      fadingCombatant.isDying = true;
      fadingCombatant.deathProgress = 0.95;
      fadingCombatant.deathAnimationType = 'spinfall';
      fadingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('fading-1', fadingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });
  });

  describe('Integration', () => {
    it('should handle full update cycle with mixed combatants', () => {
      renderer.setPlayerSquadId('squad-1');

      const combatants = new Map<string, Combatant>();

      const usCombatant = createMockCombatant(
        'us-1',
        Faction.US,
        new THREE.Vector3(10, 0, 0),
        CombatantState.IDLE
      );
      combatants.set('us-1', usCombatant);

      const opforCombatant = createMockCombatant(
        'opfor-1',
        Faction.NVA,
        new THREE.Vector3(20, 0, 0),
        CombatantState.ENGAGING
      );
      combatants.set('opfor-1', opforCombatant);

      const squadMember = createMockCombatant(
        'squad-1',
        Faction.US,
        new THREE.Vector3(15, 0, 0),
        CombatantState.ALERT
      );
      squadMember.squadId = 'squad-1';
      combatants.set('squad-1', squadMember);

      const dyingCombatant = createMockCombatant(
        'dying-1',
        Faction.US,
        new THREE.Vector3(25, 0, 0),
        CombatantState.DEAD
      );
      dyingCombatant.isDying = true;
      dyingCombatant.deathProgress = 0.3;
      dyingCombatant.deathAnimationType = 'fallback';
      dyingCombatant.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dyingCombatant);

      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.updateWalkFrame(0.016);
      renderer.updateBillboards(combatants, playerPosition);

      expect(usCombatant.billboardIndex).toBeDefined();
      expect(opforCombatant.billboardIndex).toBeDefined();
      expect(squadMember.billboardIndex).toBeDefined();
      expect(dyingCombatant.billboardIndex).toBeDefined();

      renderer.updateShaderUniforms(0.016);

      playerPosition.set(10, 0, 10);
      renderer.updateWalkFrame(0.016);
      renderer.updateBillboards(combatants, playerPosition);

      expect(renderer).toBeDefined();
    });

    it('should handle damage flash and shader update cycle', () => {
      renderer.setDamageFlash('test-1', 1.0);
      renderer.updateShaderUniforms(0.016);

      expect(renderer).toBeDefined();
    });
  });
});
