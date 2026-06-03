/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { FullMapSystem, type VehicleMarker } from './FullMapSystem';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { GameModeManager } from '../../systems/world/GameModeManager';
import { Faction, CombatantState } from '../../systems/combat/types';
import { FullMapInput } from './FullMapInput';

/**
 * Behavior-focused tests for FullMapSystem.
 *
 * Intentionally does NOT assert on:
 * - Canvas API call counts (fillRect/save/restore/translate/scale) — those are
 *   implementation details of the rendering pass.
 * - Specific rgba() color strings used by the canvas — tuning constants.
 * - Private field access via (system as any).xxx — not part of the contract.
 *
 * The real visual correctness of the full map is a playtest concern; JSDom can
 * only validate high-level wiring here.
 */
vi.mock('./FullMapInput', () => ({
  FullMapInput: vi.fn().mockImplementation(function (this: any, callbacks: any) {
    this.callbacks = callbacks;
    this.setupEventListeners = vi.fn();
    this.setIsVisible = vi.fn();
    this.getZoomLevel = vi.fn(() => 1);
    this.setZoomLevel = vi.fn();
    this.setDefaultZoomLevel = vi.fn();
    this.zoom = vi.fn();
    this.resetZoom = vi.fn();
    this.getPanOffset = vi.fn(() => ({ x: 0, y: 0 }));
    this.resetPan = vi.fn();
    this.toggle = vi.fn();
    this.dispose = vi.fn();
    return this;
  }),
}));
vi.mock('../../utils/Logger');
vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: vi.fn(() => false),
}));
vi.mock('../../systems/world/ZoneManager');
vi.mock('../../systems/combat/CombatantSystem');
vi.mock('../../systems/world/GameModeManager');

function createCanvasContextStub() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    rect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    closePath: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
}

describe('FullMapSystem', () => {
  let system: FullMapSystem;
  let mockCamera: THREE.Camera;
  let mockZoneManager: ZoneManager;
  let mockCombatantSystem: CombatantSystem;
  let mockGameModeManager: GameModeManager;
  let mockInputHandler: FullMapInput;

  const createTestZone = (overrides?: Partial<CaptureZone>): CaptureZone => ({
    id: 'test-zone',
    name: 'Test Zone',
    position: new THREE.Vector3(0, 0, 0),
    radius: 50,
    height: 10,
    owner: null,
    state: ZoneState.NEUTRAL,
    captureProgress: 0,
    captureSpeed: 1,
    isHomeBase: false,
    ticketBleedRate: 0,
    ...overrides,
  });

  const createTestCombatant = (overrides?: Partial<any>) => ({
    id: 'test-combatant',
    faction: Faction.US,
    position: new THREE.Vector3(100, 0, 100),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.PATROLLING,
    previousState: undefined,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => createCanvasContextStub() as never,
    );

    mockCamera = {
      position: new THREE.Vector3(0, 5, 0),
      getWorldDirection: vi.fn((target: THREE.Vector3) => {
        target.set(0, 0, -1);
        return target;
      }),
    } as any;

    mockInputHandler = {
      setupEventListeners: vi.fn(),
      setIsVisible: vi.fn(),
      getZoomLevel: vi.fn(() => 1),
      setZoomLevel: vi.fn(),
      setDefaultZoomLevel: vi.fn(),
      zoom: vi.fn(),
      resetZoom: vi.fn(),
      getPanOffset: vi.fn(() => ({ x: 0, y: 0 })),
      resetPan: vi.fn(),
      toggle: vi.fn(),
      dispose: vi.fn(),
    } as any;

    vi.mocked(FullMapInput).mockImplementation(function (this: any, callbacks: any) {
      this.callbacks = callbacks;
      Object.assign(this, mockInputHandler);
      return this;
    });

    mockZoneManager = { getAllZones: vi.fn(() => []) } as any;
    mockCombatantSystem = { getAllCombatants: vi.fn(() => []) } as any;
    mockGameModeManager = { getWorldSize: vi.fn(() => 400) } as any;

    system = new FullMapSystem(mockCamera);
  });

  afterEach(() => {
    system?.dispose();
  });

  describe('lifecycle', () => {
    it('init attaches the map container to the document', async () => {
      await system.init();
      expect(document.querySelector('body > *')).not.toBeNull();
    });

    it('starts hidden', () => {
      expect(system.getIsVisible()).toBe(false);
    });

    it('dispose is safe to call multiple times', () => {
      system.dispose();
      expect(() => system.dispose()).not.toThrow();
    });
  });

  describe('visibility', () => {
    beforeEach(() => {
      system.setZoneQuery(mockZoneManager);
      system.setCombatantSystem(mockCombatantSystem);
      system.setGameModeManager(mockGameModeManager);
    });

    it('reports show/hide through getIsVisible', () => {
      (system as unknown as { show: () => void }).show();
      expect(system.getIsVisible()).toBe(true);

      (system as unknown as { hide: () => void }).hide();
      expect(system.getIsVisible()).toBe(false);
    });

    it('tells the input handler about visibility changes', () => {
      (system as unknown as { show: () => void }).show();
      expect(mockInputHandler.setIsVisible).toHaveBeenCalledWith(true);

      (system as unknown as { hide: () => void }).hide();
      expect(mockInputHandler.setIsVisible).toHaveBeenCalledWith(false);
    });
  });

  describe('update', () => {
    it('reads the player orientation from the camera', () => {
      system.update(0.016);
      expect(mockCamera.getWorldDirection).toHaveBeenCalled();
    });

    it('reads world size from the game-mode manager', () => {
      system.setGameModeManager(mockGameModeManager);
      system.update(0.016);
      expect(mockGameModeManager.getWorldSize).toHaveBeenCalled();
    });
  });

  describe('rendering does not throw on edge inputs', () => {
    beforeEach(() => {
      system.setZoneQuery(mockZoneManager);
      system.setCombatantSystem(mockCombatantSystem);
      system.setGameModeManager(mockGameModeManager);
    });

    it('renders with zones at the world boundary', () => {
      mockGameModeManager.getWorldSize = vi.fn(() => 3200);
      mockZoneManager.getAllZones = vi.fn(() => [
        createTestZone({ position: new THREE.Vector3(-100, 0, -100) }),
        createTestZone({ id: 'edge', position: new THREE.Vector3(1600, 0, 1600) }),
      ]);
      system.update(0.016);

      expect(() => (system as any).render()).not.toThrow();
    });

    it('renders with combatants at the world boundary', () => {
      mockGameModeManager.getWorldSize = vi.fn(() => 3200);
      mockCombatantSystem.getAllCombatants = vi.fn(() => [
        createTestCombatant({ position: new THREE.Vector3(2000, 0, 2000) }),
      ]);
      system.update(0.016);

      expect(() => (system as any).render()).not.toThrow();
    });

    it('renders when a command position is set', () => {
      system.setCommandPosition(new THREE.Vector3(50, 0, -40));
      expect(() => (system as any).render()).not.toThrow();
    });

    it('renders hydrology channels as map-visible water routes', () => {
      system.setHydrologyChannels([
        {
          headCell: 1,
          outletCell: 2,
          lengthCells: 2,
          lengthMeters: 120,
          maxAccumulationCells: 100,
          points: [
            { cell: 1, x: -40, z: -40, elevationMeters: 2, accumulationCells: 50 },
            { cell: 2, x: 60, z: 70, elevationMeters: 1, accumulationCells: 100 },
          ],
        },
      ]);

      expect(() => (system as any).render()).not.toThrow();
      const ctxStub = (system as any).mapContext as ReturnType<typeof createCanvasContextStub>;
      expect(ctxStub.lineTo).toHaveBeenCalled();
    });

    it('renders when the player squad is highlighted', () => {
      system.setPlayerSquadId('squad-player');
      mockCombatantSystem.getAllCombatants = vi.fn(() => [
        createTestCombatant({ squadId: 'squad-player' }),
      ]);
      expect(() => (system as any).render()).not.toThrow();
    });
  });

  describe('vehicle markers', () => {
    beforeEach(() => {
      system.setZoneQuery(mockZoneManager);
      system.setCombatantSystem(mockCombatantSystem);
      system.setGameModeManager(mockGameModeManager);
      // Pin world size so we can reason about the flipped-axis projection.
      mockGameModeManager.getWorldSize = vi.fn(() => 400);
      system.update(0.016);
    });

    it('rendering with an empty marker list does not throw', () => {
      system.setVehicleMarkers([]);
      expect(() => (system as any).render()).not.toThrow();
    });

    it('rendering markers for every category does not throw', () => {
      const markers: VehicleMarker[] = [
        {
          worldPos: new THREE.Vector3(50, 0, 50),
          category: 'ground',
          faction: Faction.US,
          vehicleType: 'm151_test',
        },
        {
          worldPos: new THREE.Vector3(-50, 0, -50),
          category: 'watercraft',
          faction: Faction.US,
          vehicleType: 'pbr_test',
        },
        {
          worldPos: new THREE.Vector3(0, 0, 80),
          category: 'emplacement',
          faction: Faction.NVA,
          vehicleType: 'm2hb_test',
        },
      ];
      system.setVehicleMarkers(markers);
      expect(() => (system as any).render()).not.toThrow();
    });

    it('projects markers via the same flipped-axis transform as zones', () => {
      // The full map uses a north-up flipped-axis projection:
      //   screenX = (worldSize/2 - worldX) * scale
      //   screenY = (worldSize/2 - worldZ) * scale
      // With worldSize=400 and MAP_SIZE=800 the scale is 2.
      // A marker at world (+100, _, +100) should land at screen (400, 400).
      // A zone placed at the same world position must land on the same point.
      const ctxStub = (system as any).mapContext as ReturnType<typeof createCanvasContextStub>;

      const sharedWorld = new THREE.Vector3(100, 0, 100);
      mockZoneManager.getAllZones = vi.fn(() => [
        createTestZone({ id: 'shared', position: sharedWorld.clone() }),
      ]);
      system.setVehicleMarkers([
        {
          worldPos: sharedWorld.clone(),
          category: 'ground',
          faction: Faction.US,
          vehicleType: 'm151_shared',
        },
      ]);

      (system as any).render();

      // The vehicle 'ground' icon is a square — drawn via rect(x - half, y - half, w, h).
      // The zone icon at the same position is drawn via arc(x, y, radius, ...).
      // The centre of both should agree on (x, y) at the projected location.
      const arcCalls = ctxStub.arc.mock.calls as Array<[number, number, number, number, number]>;
      const rectCalls = ctxStub.rect.mock.calls as Array<[number, number, number, number]>;
      expect(rectCalls.length).toBeGreaterThan(0);

      const [rx, ry, rw, rh] = rectCalls[rectCalls.length - 1];
      const vehicleCx = rx + rw / 2;
      const vehicleCy = ry + rh / 2;

      // Find a zone arc near the same projected center. We don't pin the
      // exact pixel — the projection contract is what matters.
      const zoneNearby = arcCalls.some(([ax, ay]) =>
        Math.abs(ax - vehicleCx) < 0.5 && Math.abs(ay - vehicleCy) < 0.5,
      );
      expect(zoneNearby).toBe(true);
    });

    it('renders without errors when no game-mode manager is wired', () => {
      // Defensive: caller order shouldn't matter — markers should still draw
      // even if setGameModeManager hasn't been called yet.
      const fresh = new FullMapSystem(mockCamera);
      fresh.setVehicleMarkers([
        {
          worldPos: new THREE.Vector3(10, 0, 10),
          category: 'ground',
          faction: Faction.US,
          vehicleType: 'm151_fresh',
        },
      ]);
      expect(() => (fresh as any).render()).not.toThrow();
      fresh.dispose();
    });
  });

  describe('large-world zoom', () => {
    it('opens very large maps as an overview instead of player-centered maximum zoom', () => {
      mockGameModeManager.getWorldSize = vi.fn(() => 21136);
      system.setGameModeManager(mockGameModeManager);
      system.update(0.016);

      (system as unknown as { show: () => void }).show();

      expect(mockInputHandler.setZoomLevel).toHaveBeenCalledWith(1.0);
      expect(mockInputHandler.resetPan).toHaveBeenCalled();
    });
  });
});
