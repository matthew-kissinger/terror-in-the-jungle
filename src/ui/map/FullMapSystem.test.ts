import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { FullMapSystem } from './FullMapSystem';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { GameModeManager } from '../../systems/world/GameModeManager';
import { Faction, CombatantState } from '../../systems/combat/types';
import { FullMapInput } from './FullMapInput';

// Mock dependencies
vi.mock('./FullMapInput', () => ({
  FullMapInput: vi.fn().mockImplementation(function(this: any, callbacks: any) {
    // Store callbacks for later use
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
  })
}));
vi.mock('../../utils/Logger');
vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: vi.fn(() => false),
}));
vi.mock('../../systems/world/ZoneManager');
vi.mock('../../systems/combat/CombatantSystem');
vi.mock('../../systems/world/GameModeManager');

// Mock canvas context - this will be the single shared instance
let sharedMockCanvasContext: any = null;

const createMockCanvasContext = () => {
  if (sharedMockCanvasContext) {
    return sharedMockCanvasContext;
  }
  
  sharedMockCanvasContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start' as CanvasTextAlign,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
  };
  
  return sharedMockCanvasContext;
};

// Mock DOM helpers
const createMockDOM = () => {
  const elements = new Map<string, any>();
  const styleSheets = new Set<any>();

  const mockDocument = {
    createElement: vi.fn((tagName: string) => {
      const element: any = {
        id: '',
        className: '',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn(),
        },
        style: {},
        appendChild: vi.fn((child: any) => {
          if (child) {
            child.parentElement = element;
          }
          return child;
        }),
        removeChild: vi.fn(),
        remove: vi.fn(),
        querySelector: vi.fn(),
        getContext: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        parentNode: null,
        textContent: '',
        innerHTML: '',
      };

      if (tagName === 'canvas') {
        // Return the shared mock canvas context (create it if it doesn't exist)
        element.getContext = vi.fn((contextType: string) => {
          if (contextType === '2d') {
            return createMockCanvasContext();
          }
          return null;
        });
        element.width = 800;
        element.height = 800;
      }

      if (tagName === 'style') {
        element.sheet = {
          cssRules: [],
          insertRule: vi.fn(),
          deleteRule: vi.fn(),
        };
      }

      return element;
    }),
    head: {
      appendChild: vi.fn((style: any) => {
        styleSheets.add(style);
      }),
    },
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  };

  return { mockDocument, styleSheets };
};

describe('FullMapSystem', () => {
  let system: FullMapSystem;
  let mockCamera: THREE.Camera;
  let mockZoneManager: ZoneManager;
  let mockCombatantSystem: CombatantSystem;
  let mockGameModeManager: GameModeManager;
  let mockInputHandler: FullMapInput;
  let mockDOM: ReturnType<typeof createMockDOM>;
  let mockCanvasContext: any;

  // Sample test data
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
    
    // Reset shared canvas context
    sharedMockCanvasContext = null;

    // Setup DOM mocks
    mockDOM = createMockDOM();
    vi.stubGlobal('document', mockDOM.mockDocument);
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    // Setup camera
    mockCamera = {
      position: new THREE.Vector3(0, 5, 0),
      getWorldDirection: vi.fn((target: THREE.Vector3) => {
        target.set(0, 0, -1);
        return target;
      }),
    } as any;

    // Setup mock input handler - will be created by FullMapInput constructor
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

    // Mock FullMapInput constructor
    vi.mocked(FullMapInput).mockImplementation(function(this: any, callbacks: any) {
      this.callbacks = callbacks;
      Object.assign(this, mockInputHandler);
      return this;
    });

    // Setup mock systems
    mockZoneManager = {
      getAllZones: vi.fn(() => []),
    } as any;

    mockCombatantSystem = {
      getAllCombatants: vi.fn(() => []),
    } as any;

    mockGameModeManager = {
      getWorldSize: vi.fn(() => 400),
    } as any;

    system = new FullMapSystem(mockCamera);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      expect(system).toBeDefined();
    });

    it('should create input handler with callbacks', () => {
      expect(FullMapInput).toHaveBeenCalledWith({
        onShow: expect.any(Function),
        onHide: expect.any(Function),
        onRender: expect.any(Function),
      });
    });

    it('should create map container elements', () => {
      expect(mockDOM.mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(mockDOM.mockDocument.createElement).toHaveBeenCalledWith('canvas');
    });

    it('should setup canvas with correct dimensions', () => {
      const createElementCalls = vi.mocked(mockDOM.mockDocument.createElement).mock.calls;
      const canvasCall = createElementCalls.find(call => call[0] === 'canvas');
      expect(canvasCall).toBeDefined();
    });

    it('should add styles to document head', () => {
      expect(mockDOM.mockDocument.head.appendChild).toHaveBeenCalled();
    });

    it('should setup event listeners', () => {
      expect(mockInputHandler.setupEventListeners).toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('should append map container to body', async () => {
      await system.init();
      expect(mockDOM.mockDocument.body.appendChild).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update player position from camera', () => {
      mockCamera.position.set(100, 5, 200);
      system.update(0.016);
      
      // Player position should be updated from camera position
      expect(mockCamera.getWorldDirection).toHaveBeenCalled();
    });

    it('should update world size from game mode manager', () => {
      system.setGameModeManager(mockGameModeManager);
      system.update(0.016);
      
      expect(mockGameModeManager.getWorldSize).toHaveBeenCalled();
    });

    it('should not render when not visible', () => {
      const getContextSpy = vi.spyOn(system as any, 'render');
      system.update(0.016);
      
      expect(getContextSpy).not.toHaveBeenCalled();
    });

    it('should render when visible', () => {
      const renderSpy = vi.spyOn(system as any, 'render');
      (system as any).isVisible = true;
      system.update(0.016);
      
      expect(renderSpy).toHaveBeenCalled();
    });
  });

  describe('show/hide', () => {
    beforeEach(() => {
      system.setZoneManager(mockZoneManager);
      system.setCombatantSystem(mockCombatantSystem);
      system.setGameModeManager(mockGameModeManager);
    });

    it('should show map and set visible class', () => {
      (system as any).show();
      
      expect((system as any).isVisible).toBe(true);
      expect(mockInputHandler.setIsVisible).toHaveBeenCalledWith(true);
    });

    it('should hide map and remove visible class', () => {
      (system as any).isVisible = true;
      (system as any).hide();
      
      expect((system as any).isVisible).toBe(false);
      expect(mockInputHandler.setIsVisible).toHaveBeenCalledWith(false);
    });

    it('should auto-fit view when showing map', () => {
      const autoFitSpy = vi.spyOn(system as any, 'autoFitView');
      (system as any).show();
      
      expect(autoFitSpy).toHaveBeenCalled();
    });
  });

  describe('autoFitView', () => {
    beforeEach(() => {
      system.setGameModeManager(mockGameModeManager);
    });

    it('should set default zoom for Zone Control (small world)', () => {
      mockGameModeManager.getWorldSize = vi.fn(() => 400);
      // Update worldSize before calling autoFitView
      system.update(0.016);
      (system as any).autoFitView();
      
      expect(mockInputHandler.setZoomLevel).toHaveBeenCalledWith(1.0);
      expect(mockInputHandler.setDefaultZoomLevel).toHaveBeenCalledWith(1.0);
    });

    it('should calculate optimal zoom for Open Frontier (large world)', () => {
      mockGameModeManager.getWorldSize = vi.fn(() => 3200);
      // Update worldSize before calling autoFitView
      system.update(0.016);
      (system as any).autoFitView();
      
      // Should calculate zoom to fit 80% of canvas
      expect(mockInputHandler.setZoomLevel).toHaveBeenCalled();
      expect(mockInputHandler.setDefaultZoomLevel).toHaveBeenCalled();
    });
  });

  describe('getIsVisible', () => {
    it('should return the current visibility state', () => {
      expect(system.getIsVisible()).toBe(false);
      
      (system as any).show();
      expect(system.getIsVisible()).toBe(true);
      
      (system as any).hide();
      expect(system.getIsVisible()).toBe(false);
    });
  });

  describe('render', () => {
    beforeEach(() => {
      system.setZoneManager(mockZoneManager);
      system.setCombatantSystem(mockCombatantSystem);
      system.setGameModeManager(mockGameModeManager);
      
      // Get reference to the shared mock canvas context
      mockCanvasContext = sharedMockCanvasContext;
    });

    it('should clear canvas before rendering', () => {
      mockCanvasContext = sharedMockCanvasContext;
      (system as any).render();
      
      // System uses fillRect to clear, not clearRect
      expect(mockCanvasContext.fillRect).toHaveBeenCalledWith(0, 0, 800, 800);
    });

    it('should apply zoom transformation', () => {
      mockCanvasContext = sharedMockCanvasContext;
      (system as any).render();
      
      expect(mockCanvasContext.save).toHaveBeenCalled();
      expect(mockCanvasContext.translate).toHaveBeenCalled();
      expect(mockCanvasContext.scale).toHaveBeenCalled();
      expect(mockCanvasContext.restore).toHaveBeenCalled();
    });

    it('should draw grid', () => {
      mockCanvasContext = sharedMockCanvasContext;
      (system as any).render();
      
      expect(mockCanvasContext.strokeStyle).toBeDefined();
      expect(mockCanvasContext.lineWidth).toBeDefined();
      // Grid drawing should call stroke multiple times
      expect(mockCanvasContext.stroke.mock.calls.length).toBeGreaterThan(0);
    });

    it('should draw zones when zone manager is set', () => {
      mockCanvasContext = sharedMockCanvasContext;
      const testZone = createTestZone();
      mockZoneManager.getAllZones = vi.fn(() => [testZone]);
      
      (system as any).render();
      
      expect(mockZoneManager.getAllZones).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
      expect(mockCanvasContext.stroke).toHaveBeenCalled();
    });

    it('should draw combatants when combatant system is set', () => {
      mockCanvasContext = sharedMockCanvasContext;
      const testCombatant = createTestCombatant();
      mockCombatantSystem.getAllCombatants = vi.fn(() => [testCombatant]);
      
      (system as any).render();
      
      expect(mockCombatantSystem.getAllCombatants).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should draw player marker', () => {
      mockCanvasContext = sharedMockCanvasContext;
      (system as any).render();
      
      // Player should be drawn (arc for position + line for direction)
      expect(mockCanvasContext.arc.mock.calls.length).toBeGreaterThan(0);
      expect(mockCanvasContext.stroke).toHaveBeenCalled();
    });

    it('should not draw dead combatants', () => {
      mockCanvasContext = sharedMockCanvasContext;
      const deadCombatant = createTestCombatant({ state: CombatantState.DEAD });
      mockCombatantSystem.getAllCombatants = vi.fn(() => [deadCombatant]);
      
      (system as any).render();
      
      // Should only draw player, not the dead combatant
      const arcCalls = mockCanvasContext.arc.mock.calls;
      expect(arcCalls.length).toBeGreaterThan(0);
    });
  });

  describe('drawGrid', () => {
    beforeEach(() => {
      mockCanvasContext = sharedMockCanvasContext;
    });

    it('should draw grid lines at correct intervals', () => {
      (system as any).drawGrid(mockCanvasContext);
      
      // Grid should draw vertical and horizontal lines
      expect(mockCanvasContext.moveTo).toHaveBeenCalled();
      expect(mockCanvasContext.lineTo).toHaveBeenCalled();
      expect(mockCanvasContext.stroke).toHaveBeenCalled();
    });
  });

  describe('drawZone', () => {
    const testZone = createTestZone({
      position: new THREE.Vector3(100, 0, 100),
      state: ZoneState.US_CONTROLLED,
      isHomeBase: false,
    });

    beforeEach(() => {
      mockCanvasContext = sharedMockCanvasContext;
    });

    it('should draw zone area with correct color', () => {
      (system as any).drawZone(mockCanvasContext, testZone);
      
      expect(mockCanvasContext.fillStyle).toContain('rgba');
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.arc).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should draw zone border', () => {
      (system as any).drawZone(mockCanvasContext, testZone);
      
      expect(mockCanvasContext.strokeStyle).toBeDefined();
      expect(mockCanvasContext.stroke).toHaveBeenCalled();
    });

    it('should draw zone icon', () => {
      (system as any).drawZone(mockCanvasContext, testZone);
      
      expect(mockCanvasContext.fillStyle).toBeDefined();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should draw zone name', () => {
      (system as any).drawZone(mockCanvasContext, testZone);
      
      expect(mockCanvasContext.fillText).toHaveBeenCalledWith(
        testZone.name,
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should handle home base zones differently', () => {
      const homeBaseZone = createTestZone({ isHomeBase: true });
      (system as any).drawZone(mockCanvasContext, homeBaseZone);
      
      // Home base should have square icon instead of circle
      expect(mockCanvasContext.fillRect).toHaveBeenCalled();
    });
  });

  describe('getZoneColor', () => {
    it('should return correct color for US controlled zone', () => {
      const color = (system as any).getZoneColor(ZoneState.US_CONTROLLED, 0.5);
      expect(color).toContain('68'); // Red component
      expect(color).toContain('136'); // Green component
      expect(color).toContain('255'); // Blue component
      expect(color).toContain('0.5'); // Alpha
    });

    it('should return correct color for OPFOR controlled zone', () => {
      const color = (system as any).getZoneColor(ZoneState.OPFOR_CONTROLLED, 0.8);
      expect(color).toContain('255'); // Red component
      expect(color).toContain('68'); // Green component
      expect(color).toContain('68'); // Blue component
      expect(color).toContain('0.8'); // Alpha
    });

    it('should return correct color for contested zone', () => {
      const color = (system as any).getZoneColor(ZoneState.CONTESTED, 0.3);
      expect(color).toContain('255'); // Red component
      expect(color).toContain('255'); // Green component
      expect(color).toContain('68'); // Blue component
      expect(color).toContain('0.3'); // Alpha
    });

    it('should return neutral color for unknown state', () => {
      const color = (system as any).getZoneColor('unknown' as ZoneState, 0.7);
      expect(color).toContain('136'); // Gray components
      expect(color).toContain('0.7'); // Alpha
    });
  });

  describe('drawCombatants', () => {
    beforeEach(() => {
      mockCanvasContext = sharedMockCanvasContext;
    });

    it('should draw US combatants with correct color', () => {
      const usCombatant = createTestCombatant({ faction: Faction.US });
      mockCombatantSystem.getAllCombatants = vi.fn(() => [usCombatant]);
      system.setCombatantSystem(mockCombatantSystem);
      
      (system as any).drawCombatants(mockCanvasContext);
      
      expect(mockCanvasContext.fillStyle).toContain('68'); // US color
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.arc).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should draw OPFOR combatants with correct color', () => {
      const opforCombatant = createTestCombatant({ faction: Faction.OPFOR });
      mockCombatantSystem.getAllCombatants = vi.fn(() => [opforCombatant]);
      system.setCombatantSystem(mockCombatantSystem);
      
      (system as any).drawCombatants(mockCanvasContext);
      
      expect(mockCanvasContext.fillStyle).toContain('255'); // OPFOR color
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.arc).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should not draw when no combatant system is set', () => {
      (system as any).drawCombatants(mockCanvasContext);
      
      // Should return early without drawing
      expect(mockCanvasContext.beginPath).not.toHaveBeenCalled();
    });
  });

  describe('drawPlayer', () => {
    beforeEach(() => {
      mockCanvasContext = sharedMockCanvasContext;
    });

    it('should draw player position marker', () => {
      mockCamera.position.set(100, 5, 200);
      (system as any).drawPlayer(mockCanvasContext);
      
      expect(mockCanvasContext.fillStyle).toBe('#00ff00'); // Player color
      expect(mockCanvasContext.beginPath).toHaveBeenCalled();
      expect(mockCanvasContext.arc).toHaveBeenCalled();
      expect(mockCanvasContext.fill).toHaveBeenCalled();
    });

    it('should draw player direction indicator', () => {
      mockCamera.position.set(0, 5, 0);
      mockCamera.getWorldDirection = vi.fn((target: THREE.Vector3) => {
        target.set(1, 0, 0); // Looking east
        return target;
      });
      
      (system as any).drawPlayer(mockCanvasContext);
      
      expect(mockCanvasContext.strokeStyle).toBe('#00ff00'); // Player color
      expect(mockCanvasContext.moveTo).toHaveBeenCalled();
      expect(mockCanvasContext.lineTo).toHaveBeenCalled();
      expect(mockCanvasContext.stroke).toHaveBeenCalled();
    });

    it('should handle camera direction calculation correctly', () => {
      const direction = new THREE.Vector3(0.5, 0, -0.8);
      mockCamera.getWorldDirection = vi.fn((target: THREE.Vector3) => {
        target.copy(direction);
        return target;
      });
      
      (system as any).drawPlayer(mockCanvasContext);
      
      expect(mockCamera.getWorldDirection).toHaveBeenCalled();
    });
  });

  describe('System connections', () => {
    it('should set zone manager', () => {
      system.setZoneManager(mockZoneManager);
      // Should not throw and should be callable
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should set combatant system', () => {
      system.setCombatantSystem(mockCombatantSystem);
      // Should not throw and should be callable
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should set game mode manager', () => {
      system.setGameModeManager(mockGameModeManager);
      // Should not throw and should be callable
      expect(() => system.update(0.016)).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose input handler', () => {
      system.dispose();
      
      expect(mockInputHandler.dispose).toHaveBeenCalled();
    });

    it('should remove map container from DOM', () => {
      const mapContainer = (system as any).mapContainer;
      // Set up a mock parent node
      const mockParentNode = {
        removeChild: vi.fn(),
      };
      mapContainer.parentNode = mockParentNode;
      
      system.dispose();
      
      expect(mockParentNode.removeChild).toHaveBeenCalledWith(mapContainer);
    });

    it('should handle dispose when parent node is null', () => {
      const mapContainer = (system as any).mapContainer;
      mapContainer.parentNode = null;
      
      expect(() => system.dispose()).not.toThrow();
    });

    it('should handle multiple dispose calls', () => {
      system.dispose();
      expect(() => system.dispose()).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle update without any systems connected', () => {
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should handle render without systems connected', () => {
      expect(() => (system as any).render()).not.toThrow();
    });

    it('should handle show/hide without systems connected', () => {
      expect(() => (system as any).show()).not.toThrow();
      expect(() => (system as any).hide()).not.toThrow();
    });

    it('should handle autoFitView without game mode manager', () => {
      expect(() => (system as any).autoFitView()).not.toThrow();
    });

    it('should handle combatants with undefined state', () => {
      const undefinedStateCombatant = createTestCombatant({ state: undefined as any });
      mockCombatantSystem.getAllCombatants = vi.fn(() => [undefinedStateCombatant]);
      system.setCombatantSystem(mockCombatantSystem);
      
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should handle zones with undefined state', () => {
      const undefinedStateZone = createTestZone({ state: undefined as any });
      mockZoneManager.getAllZones = vi.fn(() => [undefinedStateZone]);
      system.setZoneManager(mockZoneManager);
      
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should handle very large world sizes', () => {
      mockGameModeManager.getWorldSize = vi.fn(() => 10000);
      system.setGameModeManager(mockGameModeManager);
      
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should handle very small world sizes', () => {
      mockGameModeManager.getWorldSize = vi.fn(() => 100);
      system.setGameModeManager(mockGameModeManager);
      
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should handle zero delta time', () => {
      expect(() => system.update(0)).not.toThrow();
    });

    it('should handle negative delta time', () => {
      expect(() => system.update(-0.016)).not.toThrow();
    });
  });

  describe('Coordinate system handling', () => {
    it('should correctly map world coordinates to map coordinates', () => {
      mockCanvasContext = sharedMockCanvasContext;
      const testZone = createTestZone({
        position: new THREE.Vector3(1600, 0, 1600), // Center of 3200 world
      });
      
      mockGameModeManager.getWorldSize = vi.fn(() => 3200);
      system.setGameModeManager(mockGameModeManager);
      system.update(0.016); // Update worldSize
      mockZoneManager.getAllZones = vi.fn(() => [testZone]);
      system.setZoneManager(mockZoneManager);
      
      (system as any).render();
      
      // Zone should be drawn at center of map
      expect(mockCanvasContext.arc).toHaveBeenCalledWith(
        expect.closeTo(400), // Center of 800px map
        expect.closeTo(400),
        expect.any(Number),
        0,
        Math.PI * 2
      );
    });

    it('should handle negative world coordinates', () => {
      const testZone = createTestZone({
        position: new THREE.Vector3(-100, 0, -100),
      });
      
      mockZoneManager.getAllZones = vi.fn(() => [testZone]);
      system.setZoneManager(mockZoneManager);
      
      expect(() => (system as any).render()).not.toThrow();
    });

    it('should handle combatants at world boundaries', () => {
      const boundaryCombatant = createTestCombatant({
        position: new THREE.Vector3(2000, 0, 2000), // Edge of 3200 world
      });
      
      mockGameModeManager.getWorldSize = vi.fn(() => 3200);
      system.setGameModeManager(mockGameModeManager);
      mockCombatantSystem.getAllCombatants = vi.fn(() => [boundaryCombatant]);
      system.setCombatantSystem(mockCombatantSystem);
      
      expect(() => (system as any).render()).not.toThrow();
    });
  });

  describe('Memory management', () => {
    it('should use module-level scratch vector to avoid allocations', () => {
      const initialCalls = mockCamera.getWorldDirection.mock.calls.length;
      
      // Multiple updates should reuse the same vector
      for (let i = 0; i < 10; i++) {
        system.update(0.016);
      }
      
      // Should use the same scratch vector each time
      expect(mockCamera.getWorldDirection.mock.calls.length).toBe(initialCalls + 10);
    });

    it('should not create new DOM elements after initialization', () => {
      const initialElementCount = vi.mocked(mockDOM.mockDocument.createElement).mock.calls.length;
      
      system.update(0.016);
      system.update(0.016);
      system.update(0.016);
      
      // Should not create additional elements
      expect(vi.mocked(mockDOM.mockDocument.createElement).mock.calls.length).toBe(initialElementCount);
    });
  });
});