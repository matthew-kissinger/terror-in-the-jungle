import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantRenderer } from './CombatantRenderer';
import { Combatant, CombatantState, Faction } from './types';
import { AssetLoader } from '../assets/AssetLoader';
import * as CombatantMeshFactoryModule from './CombatantMeshFactory';
import * as CombatantShadersModule from './CombatantShaders';

// Directions used in directional billboard system
const DIRECTIONS = ['front', 'back', 'side'] as const;

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
    await renderer.createFactionBillboards();

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

    it('culls combatants beyond render distance', () => {
      const combatants = new Map<string, Combatant>();
      const farCombatant = createMockCombatant('far-1', Faction.US, new THREE.Vector3(500, 0, 0));
      combatants.set('far-1', farCombatant);

      renderer.updateBillboards(combatants, new THREE.Vector3(0, 0, 0));

      expect(farCombatant.billboardIndex).toBeUndefined();
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
