import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlayerInput } from './PlayerInput';
import { WeaponSlot } from './InventoryManager';

// Mock browser globals for Node.js environment
if (typeof document === 'undefined') {
  class MockEventTarget {
    listeners: Record<string, Function[]> = {};
    addEventListener(type: string, callback: Function) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(callback);
    }
    removeEventListener(type: string, callback: Function) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter(l => l !== callback);
    }
    dispatchEvent(event: any) {
      const type = event.type;
      if (this.listeners[type]) {
        this.listeners[type].forEach(callback => callback(event));
      }
      return true;
    }
  }

  const doc = new MockEventTarget() as any;
  doc.body = new MockEventTarget();
  doc.body.requestPointerLock = vi.fn();
  doc.exitPointerLock = vi.fn();
  doc.pointerLockElement = null;
  
  vi.stubGlobal('document', doc);
  vi.stubGlobal('Event', class {
    type: string;
    constructor(type: string) { this.type = type; }
  });
  vi.stubGlobal('KeyboardEvent', class {
    type: string;
    code: string;
    repeat: boolean = false;
    constructor(type: string, init?: any) {
      this.type = type;
      this.code = init?.code || '';
    }
    preventDefault() {}
  });
  vi.stubGlobal('MouseEvent', class {
    type: string;
    button: number;
    movementX: number = 0;
    movementY: number = 0;
    constructor(type: string, init?: any) {
      this.type = type;
      this.button = init?.button || 0;
    }
  });
}

// Mock Logger to avoid console output during tests
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock DeviceDetector - always report desktop in tests
vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: vi.fn().mockReturnValue(false),
  isTouchDevice: vi.fn().mockReturnValue(false),
  isMobileViewport: vi.fn().mockReturnValue(false)
}));

// Mock TouchControls to avoid DOM side effects
vi.mock('../../ui/controls/TouchControls', () => ({
  TouchControls: vi.fn()
}));

describe('PlayerInput', () => {
  let playerInput: PlayerInput;
  let addEventListenerSpy: any;
  let removeEventListenerSpy: any;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    playerInput = new PlayerInput();
  });

  afterEach(() => {
    playerInput.dispose();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default states', () => {
      expect(playerInput.getIsPointerLocked()).toBe(false);
      expect(playerInput.isKeyPressed('keyw')).toBe(false);
      expect(playerInput.getMouseMovement()).toEqual({ x: 0, y: 0 });
    });

    it('should setup event listeners on document', () => {
      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('pointerlockchange', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });
  });

  describe('Key State Management', () => {
    it('should track key down and key up', () => {
      const eventDown = new KeyboardEvent('keydown', { code: 'KeyW' });
      document.dispatchEvent(eventDown);
      expect(playerInput.isKeyPressed('KeyW')).toBe(true);
      expect(playerInput.isKeyPressed('keyw')).toBe(true); // Case insensitive

      const eventUp = new KeyboardEvent('keyup', { code: 'KeyW' });
      document.dispatchEvent(eventUp);
      expect(playerInput.isKeyPressed('KeyW')).toBe(false);
    });

    it('should clear keys when controls are disabled', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      expect(playerInput.isKeyPressed('KeyW')).toBe(true);

      playerInput.setControlsEnabled(false);
      expect(playerInput.isKeyPressed('KeyW')).toBe(false);
    });

    it('should not add keys when controls are disabled', () => {
      playerInput.setControlsEnabled(false);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      expect(playerInput.isKeyPressed('KeyW')).toBe(false);
    });
  });

  describe('Mouse Movement', () => {
    it('should not track mouse movement if pointer is not locked', () => {
      const event = new MouseEvent('mousemove', {
        movementX: 100,
        movementY: 50
      }) as any;
      // In vitest/jsdom, movementX/Y might need to be explicitly set
      Object.defineProperty(event, 'movementX', { value: 100 });
      Object.defineProperty(event, 'movementY', { value: 50 });

      document.dispatchEvent(event);
      expect(playerInput.getMouseMovement()).toEqual({ x: 0, y: 0 });
    });

    it('should track mouse movement when pointer is locked', () => {
      // Mock pointer lock state
      Object.defineProperty(document, 'pointerLockElement', {
        value: document.body,
        configurable: true
      });
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(playerInput.getIsPointerLocked()).toBe(true);

      const event = new MouseEvent('mousemove') as any;
      Object.defineProperty(event, 'movementX', { value: 100 });
      Object.defineProperty(event, 'movementY', { value: 50 });

      document.dispatchEvent(event);
      const movement = playerInput.getMouseMovement();
      expect(movement.x).toBeCloseTo(100 * 0.002);
      expect(movement.y).toBeCloseTo(50 * 0.002);
    });

    it('should clear mouse movement', () => {
      // Set some movement first (must be locked)
      Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));

      const event = new MouseEvent('mousemove') as any;
      Object.defineProperty(event, 'movementX', { value: 100 });
      Object.defineProperty(event, 'movementY', { value: 50 });
      document.dispatchEvent(event);

      playerInput.clearMouseMovement();
      expect(playerInput.getMouseMovement()).toEqual({ x: 0, y: 0 });
    });

    it('should return a cached result object', () => {
      const movement1 = playerInput.getMouseMovement();
      const movement2 = playerInput.getMouseMovement();
      expect(movement1).toBe(movement2); // Same object reference
    });
  });

  describe('Callbacks', () => {
    let callbacks: any;

    beforeEach(() => {
      callbacks = {
        onJump: vi.fn(),
        onRunStart: vi.fn(),
        onRunStop: vi.fn(),
        onEscape: vi.fn(),
        onScoreboardToggle: vi.fn(),
        onEnterExitHelicopter: vi.fn(),
        onToggleAutoHover: vi.fn(),
        onToggleMouseControl: vi.fn(),
        onSandbagRotateLeft: vi.fn(),
        onSandbagRotateRight: vi.fn(),
        onRallyPointPlace: vi.fn(),
        onToggleMortarCamera: vi.fn(),
        onMouseDown: vi.fn(),
        onMouseUp: vi.fn()
      };
      playerInput.setCallbacks(callbacks);
    });

    it('should trigger onJump when Space is pressed (not in helicopter)', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(callbacks.onJump).toHaveBeenCalled();
      expect(callbacks.onToggleAutoHover).not.toHaveBeenCalled();
    });

    it('should trigger onToggleAutoHover when Space is pressed (in helicopter)', () => {
      playerInput.setInHelicopter(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(callbacks.onToggleAutoHover).toHaveBeenCalled();
      expect(callbacks.onJump).not.toHaveBeenCalled();
    });

    it('should trigger onRunStart/onRunStop when Shift is pressed/released', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
      expect(callbacks.onRunStart).toHaveBeenCalled();

      document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
      expect(callbacks.onRunStop).toHaveBeenCalled();
    });

    it('should trigger onScoreboardToggle when Tab is pressed/released', () => {
      const eventDown = new KeyboardEvent('keydown', { code: 'Tab' });
      const preventDefaultSpy = vi.spyOn(eventDown, 'preventDefault');
      document.dispatchEvent(eventDown);
      expect(callbacks.onScoreboardToggle).toHaveBeenCalledWith(true);
      expect(preventDefaultSpy).toHaveBeenCalled();

      const eventUp = new KeyboardEvent('keyup', { code: 'Tab' });
      document.dispatchEvent(eventUp);
      expect(callbacks.onScoreboardToggle).toHaveBeenCalledWith(false);
    });

    it('should not trigger onScoreboardToggle if Tab is repeated', () => {
      const eventDown = new KeyboardEvent('keydown', { code: 'Tab' }) as any;
      eventDown.repeat = true;
      document.dispatchEvent(eventDown);
      expect(callbacks.onScoreboardToggle).not.toHaveBeenCalled();
    });

    it('should trigger onEscape when Escape is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      expect(callbacks.onEscape).toHaveBeenCalled();
    });

    it('should trigger onEnterExitHelicopter when KeyE is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      expect(callbacks.onEnterExitHelicopter).toHaveBeenCalled();
    });

    it('should trigger onToggleMouseControl when Right Ctrl is pressed (in helicopter)', () => {
      playerInput.setInHelicopter(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlRight' }));
      expect(callbacks.onToggleMouseControl).toHaveBeenCalled();
    });

    it('should trigger sandbag rotation when appropriate key pressed and in sandbag mode', () => {
      playerInput.setCurrentWeaponMode(WeaponSlot.SANDBAG);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      expect(callbacks.onSandbagRotateLeft).toHaveBeenCalled();

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT' }));
      expect(callbacks.onSandbagRotateRight).toHaveBeenCalled();
    });

    it('should not trigger sandbag rotation if not in sandbag mode', () => {
      playerInput.setCurrentWeaponMode(WeaponSlot.PRIMARY);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
      expect(callbacks.onSandbagRotateLeft).not.toHaveBeenCalled();
    });

    it('should trigger onRallyPointPlace when KeyV is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
      expect(callbacks.onRallyPointPlace).toHaveBeenCalled();
    });

    it('should trigger onToggleMortarCamera when KeyM is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }));
      expect(callbacks.onToggleMortarCamera).toHaveBeenCalled();
    });

    it('should trigger onMouseDown/onMouseUp when pointer is locked', () => {
      // Mock lock
      Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));

      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      expect(callbacks.onMouseDown).toHaveBeenCalledWith(0);

      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      expect(callbacks.onMouseUp).toHaveBeenCalledWith(0);
    });

    it('should not trigger onMouseDown/onMouseUp when pointer is not locked', () => {
      // No lock
      Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));

      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      expect(callbacks.onMouseDown).not.toHaveBeenCalled();
    });
  });

  describe('Pointer Lock Handling', () => {
    it('should update isPointerLocked state', () => {
      Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(playerInput.getIsPointerLocked()).toBe(true);

      Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
      expect(playerInput.getIsPointerLocked()).toBe(false);
    });

    it('should request pointer lock on click if game started and enabled', () => {
      const requestPointerLockSpy = vi.fn();
      document.body.requestPointerLock = requestPointerLockSpy;

      playerInput.setGameStarted(true);
      playerInput.setPointerLockEnabled(true);

      // Trigger the click listener that should have been added
      document.dispatchEvent(new MouseEvent('click'));
      expect(requestPointerLockSpy).toHaveBeenCalled();
    });

    it('should not request pointer lock if disabled', () => {
      const requestPointerLockSpy = vi.fn();
      document.body.requestPointerLock = requestPointerLockSpy;

      playerInput.setGameStarted(true);
      playerInput.setPointerLockEnabled(false);

      document.dispatchEvent(new MouseEvent('click'));
      expect(requestPointerLockSpy).not.toHaveBeenCalled();
    });

    it('should remove and re-add click listener in setGameStarted', () => {
      playerInput.setPointerLockEnabled(true);
      playerInput.setGameStarted(true);
      
      // The spy should show it was removed then added
      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should manage click listener in setPointerLockEnabled', () => {
      playerInput.setGameStarted(true);
      
      // Enable -> Disable
      playerInput.setPointerLockEnabled(false);
      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
      
      // Disable -> Enable
      playerInput.setPointerLockEnabled(true);
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should exit pointer lock via unlockPointer', () => {
      const exitPointerLockSpy = vi.fn();
      document.exitPointerLock = exitPointerLockSpy;
      Object.defineProperty(document, 'pointerLockElement', { value: document.body, configurable: true });

      playerInput.unlockPointer();
      expect(exitPointerLockSpy).toHaveBeenCalled();
    });

    it('should relock pointer after delay', async () => {
      vi.useFakeTimers();
      const requestPointerLockSpy = vi.fn();
      document.body.requestPointerLock = requestPointerLockSpy;
      playerInput.setGameStarted(true);
      playerInput.setPointerLockEnabled(true);
      Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });

      playerInput.relockPointer();
      vi.advanceTimersByTime(100);

      expect(requestPointerLockSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('Dispose', () => {
    it('should remove all event listeners', () => {
      playerInput.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerlockchange', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });
  });
});
