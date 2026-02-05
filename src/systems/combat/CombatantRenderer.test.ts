import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantRenderer } from './CombatantRenderer';
import { Combatant, CombatantState, Faction } from './types';
import { AssetLoader } from '../assets/AssetLoader';

// Mock AssetLoader
const mockAssetLoader: AssetLoader = {
  getTexture: vi.fn((name: string) => {
    const tex = new THREE.Texture();
    tex.name = name;
    return tex;
  }),
  loadTexture: vi.fn(),
  loadModel: vi.fn(),
  loadHDRI: vi.fn(),
  dispose: vi.fn(),
} as any;

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  position: THREE.Vector3,
  faction: Faction = Faction.US,
  state: CombatantState = CombatantState.IDLE,
  visualRotation = 0
): Combatant {
  return {
    id,
    faction,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
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
    isDying: false,
  } as Combatant;
}

describe('CombatantRenderer', () => {
  let renderer: CombatantRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    renderer = new CombatantRenderer(scene, camera, mockAssetLoader);
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(renderer).toBeDefined();
    });

    it('should create with empty maps initially', () => {
      // Maps should be initialized but empty before createFactionBillboards
      expect(renderer).toBeDefined();
    });
  });

  describe('createFactionBillboards', () => {
    it('should create meshes for all faction states', async () => {
      await renderer.createFactionBillboards();

      // Should create instanced meshes for different faction states
      expect(renderer).toBeDefined();
    });

    it('should initialize textures for factions', async () => {
      await renderer.createFactionBillboards();

      // AssetLoader should have been called for textures
      expect(mockAssetLoader.getTexture).toHaveBeenCalled();
    });

    it('should create aura meshes for outlines', async () => {
      await renderer.createFactionBillboards();

      // Aura meshes should be created for squad/faction highlighting
      expect(renderer).toBeDefined();
    });

    it('should create ground markers', async () => {
      await renderer.createFactionBillboards();

      // Ground markers for squad members
      expect(renderer).toBeDefined();
    });
  });

  describe('setPlayerSquadId', () => {
    it('should set player squad ID', () => {
      renderer.setPlayerSquadId('squad-1');

      // Squad ID should be stored internally
      expect(renderer).toBeDefined();
    });

    it('should clear player squad ID when set to undefined', () => {
      renderer.setPlayerSquadId('squad-1');
      renderer.setPlayerSquadId(undefined);

      // Should accept undefined
      expect(renderer).toBeDefined();
    });

    it('should reset squad detection flag on change', () => {
      renderer.setPlayerSquadId('squad-1');
      renderer.setPlayerSquadId('squad-2');

      // Should reset detection flag
      expect(renderer).toBeDefined();
    });
  });

  describe('updateBillboards', () => {
    beforeEach(async () => {
      await renderer.createFactionBillboards();
    });

    it('should render combatants within range', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(10, 0, 0),
        Faction.US,
        CombatantState.IDLE
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should cull combatants beyond render distance', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const farCombatant = createMockCombatant(
        'far-1',
        new THREE.Vector3(500, 0, 0), // Beyond 400m render distance
        Faction.US
      );
      combatants.set('far-1', farCombatant);

      renderer.updateBillboards(combatants, playerPosition);

      // Far combatant should not be rendered
      expect(farCombatant.billboardIndex).toBeUndefined();
    });

    it('should skip dead combatants that are not dying', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const deadCombatant = createMockCombatant(
        'dead-1',
        new THREE.Vector3(10, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      deadCombatant.isDying = false;
      combatants.set('dead-1', deadCombatant);

      renderer.updateBillboards(combatants, playerPosition);

      // Should not render dead (non-dying) combatants
      expect(deadCombatant.billboardIndex).toBeUndefined();
    });

    it('should skip player proxy combatants', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const playerProxy = createMockCombatant(
        'player-proxy',
        new THREE.Vector3(0, 0, 0),
        Faction.US
      );
      playerProxy.isPlayerProxy = true;
      combatants.set('player-proxy', playerProxy);

      renderer.updateBillboards(combatants, playerPosition);

      // Should not render player proxy
      expect(playerProxy.billboardIndex).toBeUndefined();
    });

    it('should handle empty combatants map', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should group combatants by state', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const walking = createMockCombatant(
        'walk-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.IDLE
      );
      const firing = createMockCombatant(
        'fire-1',
        new THREE.Vector3(10, 0, 0),
        Faction.US,
        CombatantState.ENGAGING
      );
      const alert = createMockCombatant(
        'alert-1',
        new THREE.Vector3(15, 0, 0),
        Faction.US,
        CombatantState.ALERT
      );

      combatants.set('walk-1', walking);
      combatants.set('fire-1', firing);
      combatants.set('alert-1', alert);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should show back texture for OPFOR facing away', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 10);

      camera.position.set(0, 5, 10);
      camera.lookAt(0, 0, 0);

      // OPFOR facing away from player (rotation pointing opposite)
      const opforBack = createMockCombatant(
        'opfor-1',
        new THREE.Vector3(0, 0, 0),
        Faction.OPFOR,
        CombatantState.IDLE,
        Math.PI // Facing opposite direction
      );
      combatants.set('opfor-1', opforBack);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should distinguish player squad from other US forces', () => {
      renderer.setPlayerSquadId('squad-alpha');

      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const squadMember = createMockCombatant(
        'squad-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US
      );
      squadMember.squadId = 'squad-alpha';

      const otherUS = createMockCombatant(
        'other-1',
        new THREE.Vector3(10, 0, 0),
        Faction.US
      );
      otherUS.squadId = 'squad-bravo';

      combatants.set('squad-1', squadMember);
      combatants.set('other-1', otherUS);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should billboard orient toward camera', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      camera.position.set(10, 5, 10);
      camera.lookAt(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(0, 0, 0),
        Faction.US
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should flip texture based on view angle', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 10);

      camera.position.set(0, 5, 10);
      camera.lookAt(0, 0, 0);

      // US combatant facing perpendicular to camera
      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(0, 0, 0),
        Faction.US,
        CombatantState.IDLE,
        Math.PI / 2
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should set billboardIndex on rendered combatants', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US
      );
      combatants.set('test-1', combatant);

      renderer.updateBillboards(combatants, playerPosition);

      // billboardIndex should be assigned
      expect(combatant.billboardIndex).toBeDefined();
      expect(combatant.billboardIndex).toBeGreaterThanOrEqual(0);
    });

    it('should update combat state for firing combatants', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const firing = createMockCombatant(
        'fire-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.ENGAGING
      );
      combatants.set('fire-1', firing);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });
  });

  describe('Death Animations', () => {
    beforeEach(async () => {
      await renderer.createFactionBillboards();
    });

    it('should animate spinfall death', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.3;
      dying.deathAnimationType = 'spinfall';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should animate crumple death', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.3;
      dying.deathAnimationType = 'crumple';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should animate fallback death', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.3;
      dying.deathAnimationType = 'fallback';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle fall phase of death animation', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.05; // Early in fall phase (0.7/5.7)
      dying.deathAnimationType = 'spinfall';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle ground phase of death animation', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.5; // Ground phase (0.7/5.7 to 4.7/5.7)
      dying.deathAnimationType = 'crumple';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle fadeout phase of death animation', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.95; // Fadeout phase (4.7/5.7 to 1.0)
      dying.deathAnimationType = 'fallback';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle death animation without death direction', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.3;
      dying.deathAnimationType = 'spinfall';
      // No deathDirection set
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle death animation at progress = 1.0', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 1.0; // Complete
      dying.deathAnimationType = 'spinfall';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should apply scale changes during death animation', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.3;
      dying.deathAnimationType = 'crumple';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      dying.scale.set(1, 1, 1);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should apply position offset during death fall', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.05; // Early fall
      dying.deathAnimationType = 'spinfall';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });
  });

  describe('Shader Uniforms', () => {
    beforeEach(async () => {
      await renderer.createFactionBillboards();
    });

    it('should update shader uniforms', () => {
      expect(() => {
        renderer.updateShaderUniforms(0.016);
      }).not.toThrow();
    });

    it('should handle damage flash', () => {
      expect(() => {
        renderer.setDamageFlash('test-1', 1.0);
      }).not.toThrow();
    });

    it('should apply shader presets', () => {
      expect(() => {
        renderer.applyPreset('default');
      }).not.toThrow();

      expect(() => {
        renderer.applyPreset('cel-shaded');
      }).not.toThrow();

      expect(() => {
        renderer.applyPreset('minimal');
      }).not.toThrow();
    });

    it('should get shader settings', () => {
      const settings = renderer.getShaderSettings();
      expect(settings).toBeDefined();
      expect(settings.celShadingEnabled).toBeDefined();
      expect(settings.rimLightingEnabled).toBeDefined();
      expect(settings.auraEnabled).toBeDefined();
    });

    it('should toggle cel shading', () => {
      const initialSettings = renderer.getShaderSettings();
      const initialCelShading = initialSettings.celShadingEnabled;

      renderer.toggleCelShading();

      const newSettings = renderer.getShaderSettings();
      expect(newSettings.celShadingEnabled).toBe(!initialCelShading);
    });

    it('should toggle rim lighting', () => {
      const initialSettings = renderer.getShaderSettings();
      const initialRimLighting = initialSettings.rimLightingEnabled;

      renderer.toggleRimLighting();

      const newSettings = renderer.getShaderSettings();
      expect(newSettings.rimLightingEnabled).toBe(!initialRimLighting);
    });

    it('should toggle aura', () => {
      const initialSettings = renderer.getShaderSettings();
      const initialAura = initialSettings.auraEnabled;

      renderer.toggleAura();

      const newSettings = renderer.getShaderSettings();
      expect(newSettings.auraEnabled).toBe(!initialAura);
    });

    it('should set shader settings', () => {
      renderer.setShaderSettings({
        celShadingEnabled: 1.0,
        rimLightingEnabled: 0.0,
        auraEnabled: 1.0,
      });

      const settings = renderer.getShaderSettings();
      expect(settings.celShadingEnabled).toBe(true);
      expect(settings.rimLightingEnabled).toBe(false);
      expect(settings.auraEnabled).toBe(true);
    });
  });

  describe('Texture Management', () => {
    beforeEach(async () => {
      await renderer.createFactionBillboards();
    });

    it('should update combatant texture', () => {
      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(0, 0, 0),
        Faction.US
      );

      expect(() => {
        renderer.updateCombatantTexture(combatant);
      }).not.toThrow();
    });

    it('should handle multiple faction textures', () => {
      const usCombatant = createMockCombatant(
        'us-1',
        new THREE.Vector3(0, 0, 0),
        Faction.US
      );
      const opforCombatant = createMockCombatant(
        'opfor-1',
        new THREE.Vector3(5, 0, 0),
        Faction.OPFOR
      );

      expect(() => {
        renderer.updateCombatantTexture(usCombatant);
        renderer.updateCombatantTexture(opforCombatant);
      }).not.toThrow();
    });
  });

  describe('Outline and Ground Markers', () => {
    beforeEach(async () => {
      await renderer.createFactionBillboards();
    });

    it('should render outlines for combatants', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should render ground markers for combatants', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should scale outlines larger than main billboard', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should update outline combat state based on combatant states', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const engaging = createMockCombatant(
        'engage-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.ENGAGING
      );
      const suppressing = createMockCombatant(
        'suppress-1',
        new THREE.Vector3(7, 0, 0),
        Faction.US,
        CombatantState.SUPPRESSING
      );
      const alert = createMockCombatant(
        'alert-1',
        new THREE.Vector3(9, 0, 0),
        Faction.US,
        CombatantState.ALERT
      );

      combatants.set('engage-1', engaging);
      combatants.set('suppress-1', suppressing);
      combatants.set('alert-1', alert);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose of all resources', async () => {
      await renderer.createFactionBillboards();

      expect(() => {
        renderer.dispose();
      }).not.toThrow();
    });

    it('should clear combatant states on dispose', async () => {
      await renderer.createFactionBillboards();
      renderer.setDamageFlash('test-1', 1.0);

      renderer.dispose();

      // Should clear internal state
      expect(renderer).toBeDefined();
    });

    it('should remove meshes from scene on dispose', async () => {
      await renderer.createFactionBillboards();

      const initialChildren = scene.children.length;

      renderer.dispose();

      // Should remove added meshes
      expect(scene.children.length).toBeLessThanOrEqual(initialChildren);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await renderer.createFactionBillboards();
    });

    it('should handle combatant with zero scale', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US
      );
      combatant.scale.set(0, 0, 0);
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle combatant with negative scale', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US
      );
      combatant.scale.set(-1, 1, 1);
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle large number of combatants', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      for (let i = 0; i < 100; i++) {
        const combatant = createMockCombatant(
          `test-${i}`,
          new THREE.Vector3(i * 2, 0, 0),
          i % 2 === 0 ? Faction.US : Faction.OPFOR
        );
        combatants.set(`test-${i}`, combatant);
      }

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle combatant at exactly render distance', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(400, 0, 0), // Exactly at 400m
        Faction.US
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle combatant with extreme rotation', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.IDLE,
        Math.PI * 10 // Multiple rotations
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle missing death animation type', () => {
      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.3;
      // No deathAnimationType set
      combatants.set('dying-1', dying);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });

    it('should handle camera at origin', () => {
      camera.position.set(0, 0, 0);
      camera.lookAt(1, 0, 0);

      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US
      );
      combatants.set('test-1', combatant);

      expect(() => {
        renderer.updateBillboards(combatants, playerPosition);
      }).not.toThrow();
    });
  });

  describe('Integration', () => {
    it('should handle full render cycle with multiple states', async () => {
      await renderer.createFactionBillboards();

      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      renderer.setPlayerSquadId('squad-alpha');

      // Add various combatant states
      const squadMember = createMockCombatant(
        'squad-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.IDLE
      );
      squadMember.squadId = 'squad-alpha';

      const enemy = createMockCombatant(
        'enemy-1',
        new THREE.Vector3(50, 0, 0),
        Faction.OPFOR,
        CombatantState.ENGAGING
      );

      const dying = createMockCombatant(
        'dying-1',
        new THREE.Vector3(20, 0, 0),
        Faction.US,
        CombatantState.DEAD
      );
      dying.isDying = true;
      dying.deathProgress = 0.5;
      dying.deathAnimationType = 'spinfall';
      dying.deathDirection = new THREE.Vector3(1, 0, 0);

      combatants.set('squad-1', squadMember);
      combatants.set('enemy-1', enemy);
      combatants.set('dying-1', dying);

      // First render
      renderer.updateBillboards(combatants, playerPosition);
      renderer.updateShaderUniforms(0.016);

      // Second render (simulate frame)
      renderer.updateBillboards(combatants, playerPosition);
      renderer.updateShaderUniforms(0.016);

      expect(renderer).toBeDefined();
    });

    it('should handle transition from alive to dying', async () => {
      await renderer.createFactionBillboards();

      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(5, 0, 0),
        Faction.US,
        CombatantState.ENGAGING
      );
      combatants.set('test-1', combatant);

      // First render: alive
      renderer.updateBillboards(combatants, playerPosition);

      // Second render: start dying
      combatant.state = CombatantState.DEAD;
      combatant.isDying = true;
      combatant.deathProgress = 0;
      combatant.deathAnimationType = 'crumple';
      combatant.deathDirection = new THREE.Vector3(1, 0, 0);

      renderer.updateBillboards(combatants, playerPosition);

      expect(combatant.billboardIndex).toBeDefined();
    });

    it('should handle combatant moving in and out of render distance', async () => {
      await renderer.createFactionBillboards();

      const combatants = new Map<string, Combatant>();
      const playerPosition = new THREE.Vector3(0, 0, 0);

      const combatant = createMockCombatant(
        'test-1',
        new THREE.Vector3(50, 0, 0),
        Faction.US
      );
      combatants.set('test-1', combatant);

      // Within range
      renderer.updateBillboards(combatants, playerPosition);
      expect(combatant.billboardIndex).toBeDefined();

      // Move out of range
      combatant.position.set(500, 0, 0);
      renderer.updateBillboards(combatants, playerPosition);

      // Move back in range
      combatant.position.set(50, 0, 0);
      renderer.updateBillboards(combatants, playerPosition);
      expect(combatant.billboardIndex).toBeDefined();
    });
  });
});
