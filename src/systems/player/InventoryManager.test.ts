import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InventoryManager, WeaponSlot, InventoryState } from './InventoryManager';

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

  class MockElement extends MockEventTarget {
    parentNode: any = null;
    children: any[] = [];
    style: any = {};
    innerHTML: string = '';
    textContent: string = '';
    className: string = '';
    classList: {
      add: (className: string) => void;
      remove: (className: string) => void;
      contains: (className: string) => boolean;
      toggle: (className: string) => void;
    };

    constructor() {
      super();
      const classes = new Set<string>();
      this.classList = {
        add: (className: string) => { classes.add(className); },
        remove: (className: string) => { classes.delete(className); },
        contains: (className: string) => classes.has(className),
        toggle: (className: string) => {
          if (classes.has(className)) {
            classes.delete(className);
          } else {
            classes.add(className);
          }
        }
      };
    }

    appendChild(child: any) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }

    removeChild(child: any) {
      const index = this.children.indexOf(child);
      if (index > -1) {
        this.children.splice(index, 1);
        child.parentNode = null;
      }
      return child;
    }

    createElement(tag: string) {
      return new MockElement();
    }

    querySelector(selector: string) {
      return new MockElement();
    }

    querySelectorAll(selector: string) {
      return [new MockElement(), new MockElement(), new MockElement(), new MockElement(), new MockElement(), new MockElement()];
    }

    setAttribute(name: string, value: string) {}
  }

  const doc = new MockEventTarget() as any;
  doc.body = new MockElement();
  doc.head = new MockElement();
  doc.createElement = (tag: string) => new MockElement();

  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new MockEventTarget());
  vi.stubGlobal('KeyboardEvent', class {
    type: string;
    code: string;
    shiftKey: boolean = false;
    ctrlKey: boolean = false;
    altKey: boolean = false;
    constructor(type: string, init?: any) {
      this.type = type;
      this.code = init?.code || '';
      this.shiftKey = init?.shiftKey || false;
      this.ctrlKey = init?.ctrlKey || false;
      this.altKey = init?.altKey || false;
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

describe('InventoryManager', () => {
  let inventoryManager: InventoryManager;
  let addEventListenerSpy: any;
  let removeEventListenerSpy: any;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    inventoryManager = new InventoryManager();
  });

  afterEach(() => {
    inventoryManager.dispose();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default values', async () => {
      await inventoryManager.init();

      const state = inventoryManager.getState();
      expect(state.currentSlot).toBe(WeaponSlot.PRIMARY);
      expect(state.grenades).toBe(3);
      expect(state.maxGrenades).toBe(3);
      expect(state.mortarRounds).toBe(3);
      expect(state.maxMortarRounds).toBe(3);
      expect(state.sandbags).toBe(5);
      expect(state.maxSandbags).toBe(5);
    });

    it('should setup event listeners on window', async () => {
      await inventoryManager.init();

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should create UI elements', async () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');

      await inventoryManager.init();

      expect(createElementSpy).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
    });

    it('should call update method without error', () => {
      expect(() => inventoryManager.update(0.016)).not.toThrow();
    });
  });

  describe('Weapon Slot Switching', () => {
    beforeEach(async () => {
      await inventoryManager.init();
    });

    it('should switch to shotgun slot on Digit1', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));

      expect(slotChangeCallback).toHaveBeenCalledWith(WeaponSlot.SHOTGUN);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SHOTGUN);
    });

    it('should switch to grenade slot on Digit2', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));

      expect(slotChangeCallback).toHaveBeenCalledWith(WeaponSlot.GRENADE);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.GRENADE);
    });

    it('should switch to primary slot on Digit3', () => {
      // Switch to another slot first
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));

      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' }));

      expect(slotChangeCallback).toHaveBeenCalledWith(WeaponSlot.PRIMARY);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
    });

    it('should switch to sandbag slot on Digit4', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4' }));

      expect(slotChangeCallback).toHaveBeenCalledWith(WeaponSlot.SANDBAG);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SANDBAG);
    });

    it('should switch to SMG slot on Digit5', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5' }));

      expect(slotChangeCallback).toHaveBeenCalledWith(WeaponSlot.SMG);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SMG);
    });

    it('should switch to pistol slot on Digit6', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit6' }));

      expect(slotChangeCallback).toHaveBeenCalledWith(WeaponSlot.PISTOL);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PISTOL);
    });

    it('should not switch slot if shiftKey is pressed', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', shiftKey: true }));

      expect(slotChangeCallback).not.toHaveBeenCalled();
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
    });

    it('should not switch slot if ctrlKey is pressed', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', ctrlKey: true }));

      expect(slotChangeCallback).not.toHaveBeenCalled();
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
    });

    it('should not switch slot if altKey is pressed', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', altKey: true }));

      expect(slotChangeCallback).not.toHaveBeenCalled();
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
    });

    it('should not trigger callback if switching to same slot', () => {
      // Already on PRIMARY
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' }));

      expect(slotChangeCallback).not.toHaveBeenCalled();
    });

    it('should cycle weapon on KeyQ', () => {
      const slotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(slotChangeCallback);

      // Start at PRIMARY (2)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SANDBAG); // 3

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SMG); // 4

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PISTOL); // 5

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SHOTGUN); // 0 (wrapped)
    });

    it('should notify multiple callbacks on slot change', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      inventoryManager.onSlotChange(callback1);
      inventoryManager.onSlotChange(callback2);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));

      expect(callback1).toHaveBeenCalledWith(WeaponSlot.SHOTGUN);
      expect(callback2).toHaveBeenCalledWith(WeaponSlot.SHOTGUN);
    });
  });

  describe('Grenade Management', () => {
    beforeEach(async () => {
      await inventoryManager.init();
    });

    it('should check if grenade can be used', () => {
      expect(inventoryManager.canUseGrenade()).toBe(true);
    });

    it('should use grenade and decrement count', () => {
      const result = inventoryManager.useGrenade();

      expect(result).toBe(true);
      expect(inventoryManager.getState().grenades).toBe(2);
    });

    it('should notify inventory change callback on grenade use', () => {
      const inventoryChangeCallback = vi.fn();
      inventoryManager.onInventoryChange(inventoryChangeCallback);

      inventoryManager.useGrenade();

      expect(inventoryChangeCallback).toHaveBeenCalledWith(
        expect.objectContaining({ grenades: 2 })
      );
    });

    it('should not use grenade when count is zero', () => {
      // Use all grenades
      inventoryManager.useGrenade();
      inventoryManager.useGrenade();
      inventoryManager.useGrenade();

      expect(inventoryManager.canUseGrenade()).toBe(false);
      const result = inventoryManager.useGrenade();

      expect(result).toBe(false);
      expect(inventoryManager.getState().grenades).toBe(0);
    });

    it('should add grenades up to max', () => {
      inventoryManager.useGrenade(); // 2 left
      inventoryManager.addGrenades(1);

      expect(inventoryManager.getState().grenades).toBe(3);
    });

    it('should not exceed max grenades when adding', () => {
      inventoryManager.addGrenades(5);

      expect(inventoryManager.getState().grenades).toBe(3); // capped at max
    });

    it('should notify inventory change on grenade add', () => {
      const inventoryChangeCallback = vi.fn();
      inventoryManager.onInventoryChange(inventoryChangeCallback);

      inventoryManager.addGrenades(2);

      expect(inventoryChangeCallback).toHaveBeenCalled();
    });
  });

  describe('Mortar Round Management', () => {
    beforeEach(async () => {
      await inventoryManager.init();
    });

    it('should check if mortar round can be used', () => {
      expect(inventoryManager.canUseMortarRound()).toBe(true);
    });

    it('should use mortar round and decrement count', () => {
      const result = inventoryManager.useMortarRound();

      expect(result).toBe(true);
      expect(inventoryManager.getState().mortarRounds).toBe(2);
    });

    it('should not use mortar round when count is zero', () => {
      inventoryManager.useMortarRound();
      inventoryManager.useMortarRound();
      inventoryManager.useMortarRound();

      expect(inventoryManager.canUseMortarRound()).toBe(false);
      const result = inventoryManager.useMortarRound();

      expect(result).toBe(false);
      expect(inventoryManager.getState().mortarRounds).toBe(0);
    });

    it('should add mortar rounds up to max', () => {
      inventoryManager.useMortarRound(); // 2 left
      inventoryManager.addMortarRounds(1);

      expect(inventoryManager.getState().mortarRounds).toBe(3);
    });

    it('should not exceed max mortar rounds when adding', () => {
      inventoryManager.addMortarRounds(10);

      expect(inventoryManager.getState().mortarRounds).toBe(3); // capped at max
    });
  });

  describe('Sandbag Management', () => {
    beforeEach(async () => {
      await inventoryManager.init();
    });

    it('should check if sandbag can be used', () => {
      expect(inventoryManager.canUseSandbag()).toBe(true);
    });

    it('should use sandbag and decrement count', () => {
      const result = inventoryManager.useSandbag();

      expect(result).toBe(true);
      expect(inventoryManager.getState().sandbags).toBe(4);
    });

    it('should get sandbag count', () => {
      expect(inventoryManager.getSandbagCount()).toBe(5);
      inventoryManager.useSandbag();
      expect(inventoryManager.getSandbagCount()).toBe(4);
    });

    it('should not use sandbag when count is zero', () => {
      // Use all sandbags
      for (let i = 0; i < 5; i++) {
        inventoryManager.useSandbag();
      }

      expect(inventoryManager.canUseSandbag()).toBe(false);
      const result = inventoryManager.useSandbag();

      expect(result).toBe(false);
      expect(inventoryManager.getState().sandbags).toBe(0);
    });

    it('should add sandbags up to max', () => {
      inventoryManager.useSandbag(); // 4 left
      inventoryManager.addSandbags(1);

      expect(inventoryManager.getState().sandbags).toBe(5);
    });

    it('should not exceed max sandbags when adding', () => {
      inventoryManager.addSandbags(10);

      expect(inventoryManager.getState().sandbags).toBe(5); // capped at max
    });

    it('should notify inventory change on sandbag use', () => {
      const inventoryChangeCallback = vi.fn();
      inventoryManager.onInventoryChange(inventoryChangeCallback);

      inventoryManager.useSandbag();

      expect(inventoryChangeCallback).toHaveBeenCalledWith(
        expect.objectContaining({ sandbags: 4 })
      );
    });
  });

  describe('Reset Inventory', () => {
    beforeEach(async () => {
      await inventoryManager.init();
    });

    it('should reset all counts to max', () => {
      // Deplete resources
      inventoryManager.useGrenade();
      inventoryManager.useMortarRound();
      inventoryManager.useSandbag();

      // Switch slot
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));

      inventoryManager.reset();

      const state = inventoryManager.getState();
      expect(state.grenades).toBe(3);
      expect(state.mortarRounds).toBe(3);
      expect(state.sandbags).toBe(5);
      expect(state.currentSlot).toBe(WeaponSlot.PRIMARY);
    });

    it('should notify inventory change on reset', () => {
      const inventoryChangeCallback = vi.fn();
      inventoryManager.onInventoryChange(inventoryChangeCallback);

      inventoryManager.reset();

      expect(inventoryChangeCallback).toHaveBeenCalled();
    });
  });

  describe('Get State', () => {
    beforeEach(async () => {
      await inventoryManager.init();
    });

    it('should return complete state object', () => {
      const state = inventoryManager.getState();

      expect(state).toEqual({
        currentSlot: WeaponSlot.PRIMARY,
        grenades: 3,
        maxGrenades: 3,
        mortarRounds: 3,
        maxMortarRounds: 3,
        sandbags: 5,
        maxSandbags: 5
      });
    });

    it('should return updated state after changes', () => {
      inventoryManager.useGrenade();
      inventoryManager.useSandbag();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));

      const state = inventoryManager.getState();

      expect(state.grenades).toBe(2);
      expect(state.sandbags).toBe(4);
      expect(state.currentSlot).toBe(WeaponSlot.GRENADE);
    });
  });

  describe('Callbacks', () => {
    beforeEach(async () => {
      await inventoryManager.init();
    });

    it('should register slot change callback', () => {
      const callback = vi.fn();
      inventoryManager.onSlotChange(callback);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));

      expect(callback).toHaveBeenCalledWith(WeaponSlot.SHOTGUN);
    });

    it('should register inventory change callback', () => {
      const callback = vi.fn();
      inventoryManager.onInventoryChange(callback);

      inventoryManager.useGrenade();

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ grenades: 2 }));
    });

    it('should call inventory change callback on init', async () => {
      const manager = new InventoryManager();
      const callback = vi.fn();
      manager.onInventoryChange(callback);

      await manager.init();

      expect(callback).toHaveBeenCalled();
      manager.dispose();
    });
  });

  describe('UI Updates', () => {
    beforeEach(async () => {
      await inventoryManager.init();
    });

    it('should update UI on slot change', () => {
      // Mock querySelector to return actual elements we can test
      const mockSlot = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      };

      const querySelectorAllSpy = vi.spyOn(inventoryManager['uiElement']!, 'querySelectorAll' as any);
      querySelectorAllSpy.mockReturnValue([mockSlot, mockSlot, mockSlot, mockSlot, mockSlot, mockSlot] as any);

      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));

      expect(querySelectorAllSpy).toHaveBeenCalledWith('.hotbar-slot');
    });

    it('should update grenade count in UI', () => {
      // Get actual grenade count element
      const grenadeCountEl = inventoryManager['uiElement']!.querySelector('#grenade-count') as any;

      inventoryManager.useGrenade();

      // After using grenade, the textContent should be updated
      // The mock querySelector always returns a new element, so we can't verify the update directly
      // Instead, verify the method was called
      const querySelectorSpy = vi.spyOn(inventoryManager['uiElement']!, 'querySelector' as any);
      inventoryManager.useGrenade(); // Use again to trigger querySelector

      expect(querySelectorSpy).toHaveBeenCalledWith('#grenade-count');
      // Count should be 1 after two uses (started at 3)
      expect(inventoryManager.getState().grenades).toBe(1);
    });

    it('should update sandbag count in UI', () => {
      const mockElement = { textContent: '' };
      const querySelectorSpy = vi.spyOn(inventoryManager['uiElement']!, 'querySelector' as any);
      querySelectorSpy.mockReturnValue(mockElement as any);

      inventoryManager.useSandbag();

      expect(querySelectorSpy).toHaveBeenCalledWith('#sandbag-count');
      expect(mockElement.textContent).toBe('4');
    });
  });

  describe('Dispose', () => {
    it('should remove event listeners', async () => {
      await inventoryManager.init();

      inventoryManager.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('should remove UI element from DOM', async () => {
      await inventoryManager.init();

      const removeChildSpy = vi.spyOn(inventoryManager['uiElement']!.parentNode!, 'removeChild');
      inventoryManager['uiElement']!.parentNode = document.body;

      inventoryManager.dispose();

      expect(removeChildSpy).toHaveBeenCalledWith(inventoryManager['uiElement']);
    });

    it('should not throw if UI element has no parent', async () => {
      await inventoryManager.init();
      inventoryManager['uiElement']!.parentNode = null;

      expect(() => inventoryManager.dispose()).not.toThrow();
    });

    it('should not throw if UI element does not exist', () => {
      expect(() => inventoryManager.dispose()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle init being called multiple times', async () => {
      await inventoryManager.init();
      await inventoryManager.init();

      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
    });

    it('should handle dispose being called multiple times', async () => {
      await inventoryManager.init();
      inventoryManager.dispose();

      expect(() => inventoryManager.dispose()).not.toThrow();
    });

    it('should handle using items before init', () => {
      expect(() => inventoryManager.useGrenade()).not.toThrow();
      expect(inventoryManager.canUseGrenade()).toBe(true);
    });

    it('should handle slot change to same slot', async () => {
      await inventoryManager.init();
      const callback = vi.fn();
      inventoryManager.onSlotChange(callback);

      // Already on PRIMARY (Digit3)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' }));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle adding zero items', async () => {
      await inventoryManager.init();
      const initialState = inventoryManager.getState();

      inventoryManager.addGrenades(0);
      inventoryManager.addMortarRounds(0);
      inventoryManager.addSandbags(0);

      const finalState = inventoryManager.getState();
      expect(finalState.grenades).toBe(initialState.grenades);
      expect(finalState.mortarRounds).toBe(initialState.mortarRounds);
      expect(finalState.sandbags).toBe(initialState.sandbags);
    });

    it('should handle negative add values', async () => {
      await inventoryManager.init();

      inventoryManager.addGrenades(-1);

      // Math.min should prevent going negative, but we're adding negative
      // which could result in reduced count
      const state = inventoryManager.getState();
      expect(state.grenades).toBeGreaterThanOrEqual(0);
    });
  });
});
