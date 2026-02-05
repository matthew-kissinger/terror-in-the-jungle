import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryManager, WeaponSlot, InventoryState } from './InventoryManager';
import { Logger } from '../../utils/Logger';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('InventoryManager', () => {
  let inventoryManager: InventoryManager;
  let mockUIElement: HTMLElement;
  let mockGrenadeCountElement: HTMLElement;
  let mockSandbagCountElement: HTMLElement;
  let mockMortarCountElement: HTMLElement;
  let mockSlots: HTMLElement[];
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock UI elements and DOM interactions
    mockGrenadeCountElement = document.createElement('div');
    mockGrenadeCountElement.id = 'grenade-count';
    mockSandbagCountElement = document.createElement('div');
    mockSandbagCountElement.id = 'sandbag-count';
    mockMortarCountElement = document.createElement('div');
    mockMortarCountElement.id = 'mortar-count';

    mockSlots = Array.from({ length: 6 }, (_, i) => {
      const slot = document.createElement('div');
      slot.classList.add('hotbar-slot');
      slot.setAttribute('data-slot', String(i));
      return slot;
    });

    mockUIElement = document.createElement('div');
    mockUIElement.querySelectorAll = vi.fn((selector: string) => {
      if (selector === '.hotbar-slot') {
        return mockSlots as any;
      }
      if (selector === '#grenade-count') {
        return [mockGrenadeCountElement] as any;
      }
      if (selector === '#sandbag-count') {
        return [mockSandbagCountElement] as any;
      }
      if (selector === '#mortar-count') {
        return [mockMortarCountElement] as any;
      }
      return [] as any;
    });

    // Mock document.createElement and appendChild
    const appendChildSpy = vi.fn();
    const removeChildSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'div') {
        return mockUIElement;
      }
      if (tagName === 'style') {
        return { textContent: '', tagName: 'style' };
      }
      return document.createElement(tagName);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildSpy);
    vi.spyOn(document.head, 'appendChild').mockImplementation(appendChildSpy);
    Object.defineProperty(mockUIElement, 'parentNode', {
      value: { removeChild: removeChildSpy },
      writable: true,
    });

    // Mock window event listeners
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    inventoryManager = new InventoryManager();
  });

  describe('Initialization and Dispose', () => {
    it('should initialize with default inventory state', () => {
      const initialState = inventoryManager.getState();
      expect(initialState.currentSlot).toBe(WeaponSlot.PRIMARY);
      expect(initialState.grenades).toBe(3);
      expect(initialState.maxGrenades).toBe(3);
      expect(initialState.mortarRounds).toBe(3);
      expect(initialState.maxMortarRounds).toBe(3);
      expect(initialState.sandbags).toBe(5);
      expect(initialState.maxSandbags).toBe(5);
    });

    it('should set up event listeners and create UI on init', async () => {
      const createUISpy = vi.spyOn(inventoryManager as any, 'createUI');
      const notifyInventoryChangeSpy = vi.spyOn(inventoryManager as any, 'notifyInventoryChange');

      await inventoryManager.init();

      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(createUISpy).toHaveBeenCalled();
      expect(notifyInventoryChangeSpy).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Initializing Inventory Manager...');
    });

    it('should remove event listeners and UI on dispose', () => {
      // First, simulate init to set up listeners and UI
      inventoryManager['boundOnKeyDown'] = vi.fn(); // Mock the bound function
      inventoryManager['uiElement'] = mockUIElement;

      inventoryManager.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', inventoryManager['boundOnKeyDown']);
      expect(mockUIElement.parentNode?.removeChild).toHaveBeenCalledWith(mockUIElement);
    });
  });

  describe('Weapon Slot Switching (onKeyDown)', () => {
    let onSlotChangeCallback: vi.Mock;
    let notifyInventoryChangeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      onSlotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(onSlotChangeCallback);
      notifyInventoryChangeSpy = vi.spyOn(inventoryManager as any, 'notifyInventoryChange');
      await inventoryManager.init(); // Ensure listeners are set up
    });

    const triggerKeyDown = (code: string, shiftKey = false, ctrlKey = false, altKey = false) => {
      const event = new KeyboardEvent('keydown', { code, shiftKey, ctrlKey, altKey });
      inventoryManager['boundOnKeyDown'](event);
    };

    it('should switch to SHOTGUN (Digit1)', () => {
      triggerKeyDown('Digit1');
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SHOTGUN);
      expect(onSlotChangeCallback).toHaveBeenCalledWith(WeaponSlot.SHOTGUN);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Switched to: SHOTGUN');
    });

    it('should switch to GRENADE (Digit2)', () => {
      triggerKeyDown('Digit2');
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.GRENADE);
      expect(onSlotChangeCallback).toHaveBeenCalledWith(WeaponSlot.GRENADE);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Switched to: GRENADE');
    });

    it('should switch to PRIMARY (Digit3)', () => {
      // Initially PRIMARY, switch to another, then back
      inventoryManager['currentSlot'] = WeaponSlot.SHOTGUN;
      triggerKeyDown('Digit3');
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
      expect(onSlotChangeCallback).toHaveBeenCalledWith(WeaponSlot.PRIMARY);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Switched to: PRIMARY');
    });

    it('should switch to SANDBAG (Digit4)', () => {
      triggerKeyDown('Digit4');
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SANDBAG);
      expect(onSlotChangeCallback).toHaveBeenCalledWith(WeaponSlot.SANDBAG);
    });

    it('should switch to SMG (Digit5)', () => {
      triggerKeyDown('Digit5');
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SMG);
      expect(onSlotChangeCallback).toHaveBeenCalledWith(WeaponSlot.SMG);
    });

    it('should switch to PISTOL (Digit6)', () => {
      triggerKeyDown('Digit6');
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PISTOL);
      expect(onSlotChangeCallback).toHaveBeenCalledWith(WeaponSlot.PISTOL);
    });

    it('should cycle weapon with KeyQ', () => {
      inventoryManager['currentSlot'] = WeaponSlot.PRIMARY; // Start at 2
      triggerKeyDown('KeyQ'); // Should go to SANDBAG (3)
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SANDBAG);
      triggerKeyDown('KeyQ'); // Should go to SMG (4)
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SMG);
      // Cycle until it wraps around
      triggerKeyDown('KeyQ'); // PISTOL (5)
      triggerKeyDown('KeyQ'); // SHOTGUN (0)
      triggerKeyDown('KeyQ'); // GRENADE (1)
      triggerKeyDown('KeyQ'); // PRIMARY (2)
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
      expect(onSlotChangeCallback).toHaveBeenCalledTimes(7); // initial init + 6 changes
    });

    it('should not switch slot if shiftKey is pressed', () => {
      inventoryManager['currentSlot'] = WeaponSlot.PRIMARY;
      onSlotChangeCallback.mockClear(); // Clear previous calls from init
      triggerKeyDown('Digit1', true);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
      expect(onSlotChangeCallback).not.toHaveBeenCalled();
    });

    it('should not switch slot if ctrlKey is pressed', () => {
      inventoryManager['currentSlot'] = WeaponSlot.PRIMARY;
      onSlotChangeCallback.mockClear();
      triggerKeyDown('Digit1', false, true);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
      expect(onSlotChangeCallback).not.toHaveBeenCalled();
    });

    it('should not switch slot if altKey is pressed', () => {
      inventoryManager['currentSlot'] = WeaponSlot.PRIMARY;
      onSlotChangeCallback.mockClear();
      triggerKeyDown('Digit1', false, false, true);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
      expect(onSlotChangeCallback).not.toHaveBeenCalled();
    });
  });

  describe('switchToSlot', () => {
    let onSlotChangeCallback: vi.Mock;
    let updateUISpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      onSlotChangeCallback = vi.fn();
      inventoryManager.onSlotChange(onSlotChangeCallback);
      updateUISpy = vi.spyOn(inventoryManager as any, 'updateUI');
      inventoryManager['currentSlot'] = WeaponSlot.PRIMARY; // Ensure a starting slot
    });

    it('should change current slot and notify listeners', () => {
      inventoryManager['switchToSlot'](WeaponSlot.SHOTGUN);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.SHOTGUN);
      expect(onSlotChangeCallback).toHaveBeenCalledWith(WeaponSlot.SHOTGUN);
      expect(updateUISpy).toHaveBeenCalled();
    });

    it('should not change slot or notify if already in that slot', () => {
      inventoryManager['switchToSlot'](WeaponSlot.PRIMARY);
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.PRIMARY);
      expect(onSlotChangeCallback).not.toHaveBeenCalled(); // No change, no notification
      expect(updateUISpy).not.toHaveBeenCalled();
    });
  });

  describe('cycleWeapon', () => {
    beforeEach(() => {
      inventoryManager['currentSlot'] = WeaponSlot.SHOTGUN; // Start at 0
      vi.spyOn(inventoryManager as any, 'switchToSlot');
    });

    it('should advance to the next slot', () => {
      inventoryManager['cycleWeapon']();
      expect(inventoryManager['switchToSlot']).toHaveBeenCalledWith(WeaponSlot.GRENADE);
    });

    it('should wrap around from last slot to first', () => {
      inventoryManager['currentSlot'] = WeaponSlot.PISTOL; // Last slot (5)
      inventoryManager['cycleWeapon']();
      expect(inventoryManager['switchToSlot']).toHaveBeenCalledWith(WeaponSlot.SHOTGUN);
    });
  });

  describe('getCurrentSlot', () => {
    it('should return the current active slot', () => {
      inventoryManager['currentSlot'] = WeaponSlot.GRENADE;
      expect(inventoryManager.getCurrentSlot()).toBe(WeaponSlot.GRENADE);
    });
  });

  describe('Grenade Management', () => {
    let notifyInventoryChangeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      inventoryManager = new InventoryManager(); // Reset to default
      notifyInventoryChangeSpy = vi.spyOn(inventoryManager as any, 'notifyInventoryChange');
      inventoryManager['grenades'] = 1; // Set for testing useGrenade
    });

    it('canUseGrenade should return true if grenades > 0', () => {
      expect(inventoryManager.canUseGrenade()).toBe(true);
    });

    it('canUseGrenade should return false if grenades is 0', () => {
      inventoryManager['grenades'] = 0;
      expect(inventoryManager.canUseGrenade()).toBe(false);
    });

    it('useGrenade should decrement count and return true if available', () => {
      expect(inventoryManager.useGrenade()).toBe(true);
      expect(inventoryManager['grenades']).toBe(0);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Grenade used. Remaining: 0');
      expect(notifyInventoryChangeSpy).toHaveBeenCalled();
    });

    it('useGrenade should not decrement count and return false if not available', () => {
      inventoryManager['grenades'] = 0;
      expect(inventoryManager.useGrenade()).toBe(false);
      expect(inventoryManager['grenades']).toBe(0); // Should remain 0
      expect(notifyInventoryChangeSpy).not.toHaveBeenCalled();
    });

    it('addGrenades should increment count up to max', () => {
      inventoryManager['grenades'] = 0;
      inventoryManager.addGrenades(2);
      expect(inventoryManager['grenades']).toBe(2);
      inventoryManager.addGrenades(2); // Try to go over max (3)
      expect(inventoryManager['grenades']).toBe(3);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Grenades restocked: 3/3');
      expect(notifyInventoryChangeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Mortar Round Management', () => {
    let notifyInventoryChangeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      inventoryManager = new InventoryManager(); // Reset to default
      notifyInventoryChangeSpy = vi.spyOn(inventoryManager as any, 'notifyInventoryChange');
      inventoryManager['mortarRounds'] = 1; // Set for testing useMortarRound
    });

    it('canUseMortarRound should return true if mortarRounds > 0', () => {
      expect(inventoryManager.canUseMortarRound()).toBe(true);
    });

    it('canUseMortarRound should return false if mortarRounds is 0', () => {
      inventoryManager['mortarRounds'] = 0;
      expect(inventoryManager.canUseMortarRound()).toBe(false);
    });

    it('useMortarRound should decrement count and return true if available', () => {
      expect(inventoryManager.useMortarRound()).toBe(true);
      expect(inventoryManager['mortarRounds']).toBe(0);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Mortar round used. Remaining: 0');
      expect(notifyInventoryChangeSpy).toHaveBeenCalled();
    });

    it('useMortarRound should not decrement count and return false if not available', () => {
      inventoryManager['mortarRounds'] = 0;
      expect(inventoryManager.useMortarRound()).toBe(false);
      expect(inventoryManager['mortarRounds']).toBe(0); // Should remain 0
      expect(notifyInventoryChangeSpy).not.toHaveBeenCalled();
    });

    it('addMortarRounds should increment count up to max', () => {
      inventoryManager['mortarRounds'] = 0;
      inventoryManager.addMortarRounds(2);
      expect(inventoryManager['mortarRounds']).toBe(2);
      inventoryManager.addMortarRounds(2); // Try to go over max (3)
      expect(inventoryManager['mortarRounds']).toBe(3);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Mortar rounds restocked: 3/3');
      expect(notifyInventoryChangeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Sandbag Management', () => {
    let notifyInventoryChangeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      inventoryManager = new InventoryManager(); // Reset to default
      notifyInventoryChangeSpy = vi.spyOn(inventoryManager as any, 'notifyInventoryChange');
      inventoryManager['sandbags'] = 1; // Set for testing useSandbag
    });

    it('canUseSandbag should return true if sandbags > 0', () => {
      expect(inventoryManager.canUseSandbag()).toBe(true);
    });

    it('canUseSandbag should return false if sandbags is 0', () => {
      inventoryManager['sandbags'] = 0;
      expect(inventoryManager.canUseSandbag()).toBe(false);
    });

    it('useSandbag should decrement count and return true if available', () => {
      expect(inventoryManager.useSandbag()).toBe(true);
      expect(inventoryManager['sandbags']).toBe(0);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Sandbag placed. Remaining: 0');
      expect(notifyInventoryChangeSpy).toHaveBeenCalled();
    });

    it('useSandbag should not decrement count and return false if not available', () => {
      inventoryManager['sandbags'] = 0;
      expect(inventoryManager.useSandbag()).toBe(false);
      expect(inventoryManager['sandbags']).toBe(0); // Should remain 0
      expect(notifyInventoryChangeSpy).not.toHaveBeenCalled();
    });

    it('addSandbags should increment count up to max', () => {
      inventoryManager['sandbags'] = 0;
      inventoryManager.addSandbags(3);
      expect(inventoryManager['sandbags']).toBe(3);
      inventoryManager.addSandbags(3); // Try to go over max (5)
      expect(inventoryManager['sandbags']).toBe(5);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Sandbags restocked: 5/5');
      expect(notifyInventoryChangeSpy).toHaveBeenCalledTimes(2);
    });

    it('getSandbagCount should return the current sandbag count', () => {
      inventoryManager['sandbags'] = 2;
      expect(inventoryManager.getSandbagCount()).toBe(2);
    });
  });

  describe('reset', () => {
    let notifyInventoryChangeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      inventoryManager = new InventoryManager(); // Reset to default
      notifyInventoryChangeSpy = vi.spyOn(inventoryManager as any, 'notifyInventoryChange');
      // Change some values to ensure reset works
      inventoryManager['grenades'] = 1;
      inventoryManager['mortarRounds'] = 1;
      inventoryManager['sandbags'] = 2;
      inventoryManager['currentSlot'] = WeaponSlot.GRENADE;
    });

    it('should reset all item counts and current slot to default', () => {
      inventoryManager.reset();
      expect(inventoryManager['grenades']).toBe(inventoryManager['maxGrenades']);
      expect(inventoryManager['mortarRounds']).toBe(inventoryManager['maxMortarRounds']);
      expect(inventoryManager['sandbags']).toBe(inventoryManager['maxSandbags']);
      expect(inventoryManager['currentSlot']).toBe(WeaponSlot.PRIMARY);
      expect(Logger.info).toHaveBeenCalledWith('inventory', 'Inventory reset');
      expect(notifyInventoryChangeSpy).toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('should return the correct InventoryState object', () => {
      inventoryManager['currentSlot'] = WeaponSlot.SMG;
      inventoryManager['grenades'] = 1;
      inventoryManager['mortarRounds'] = 0;
      inventoryManager['sandbags'] = 3;

      const state = inventoryManager.getState();
      expect(state).toEqual({
        currentSlot: WeaponSlot.SMG,
        grenades: 1,
        maxGrenades: 3,
        mortarRounds: 0,
        maxMortarRounds: 3,
        sandbags: 3,
        maxSandbags: 5,
      } as InventoryState);
    });
  });

  describe('Callbacks', () => {
    it('onSlotChange should register and fire callbacks', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      inventoryManager.onSlotChange(callback1);
      inventoryManager.onSlotChange(callback2);

      inventoryManager['switchToSlot'](WeaponSlot.PISTOL);

      expect(callback1).toHaveBeenCalledWith(WeaponSlot.PISTOL);
      expect(callback2).toHaveBeenCalledWith(WeaponSlot.PISTOL);
    });

    it('onInventoryChange should register and fire callback on inventory changes', () => {
      const callback = vi.fn();
      inventoryManager.onInventoryChange(callback);

      inventoryManager.addGrenades(1); // Triggers notifyInventoryChange

      expect(callback).toHaveBeenCalledWith(inventoryManager.getState());
    });

    it('onInventoryChange should be called on init', async () => {
      const callback = vi.fn();
      inventoryManager.onInventoryChange(callback);
      await inventoryManager.init();
      expect(callback).toHaveBeenCalledWith(inventoryManager.getState());
    });
  });

  describe('UI Interactions', () => {
    let appendChildSpy: ReturnType<typeof vi.spyOn>;
    let updateUISpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      appendChildSpy = vi.spyOn(document.body, 'appendChild');
      updateUISpy = vi.spyOn(inventoryManager as any, 'updateUI');
    });

    it('createUI should create uiElement and append to body', async () => {
      await inventoryManager.init(); // createUI is called during init
      expect(appendChildSpy).toHaveBeenCalledWith(mockUIElement);
      expect(mockUIElement.innerHTML).toContain('id="slot-grenade"');
      expect(mockUIElement.innerHTML).toContain('id="sandbag-count"');
      expect(mockGrenadeCountElement.textContent).toBe(String(inventoryManager['grenades']));
      expect(mockSandbagCountElement.textContent).toBe(String(inventoryManager['sandbags']));
      expect(document.head.appendChild).toHaveBeenCalledWith(expect.objectContaining({ tagName: 'style' }));
    });

    it('updateUI should update active slot class and item counts', async () => {
      await inventoryManager.init(); // This calls updateUI once

      // Change slot and inventory items
      inventoryManager['currentSlot'] = WeaponSlot.GRENADE;
      inventoryManager['grenades'] = 2;
      inventoryManager['sandbags'] = 3;
      (inventoryManager as any)['updateUI']();

      expect(mockSlots[WeaponSlot.PRIMARY].classList.contains('active')).toBe(false);
      expect(mockSlots[WeaponSlot.GRENADE].classList.contains('active')).toBe(true);
      expect(mockGrenadeCountElement.textContent).toBe('2');
      expect(mockSandbagCountElement.textContent).toBe('3');
    });
  });
});
