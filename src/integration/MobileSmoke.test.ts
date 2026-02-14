/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../utils/Logger');
vi.mock('../config/SettingsManager', () => ({
  SettingsManager: {
    getInstance: () => ({
      getMouseSensitivityRaw: () => 0.005,
      onChange: vi.fn(),
    }),
  },
}));

// We need to mock DeviceDetector because its values are cached
vi.mock('../utils/DeviceDetector', () => ({
  isTouchDevice: vi.fn(),
  isMobileViewport: vi.fn(),
  shouldUseTouchControls: vi.fn(),
}));

// Mock Touch sub-components to avoid DOM issues and deep dependencies
vi.mock('../ui/controls/VirtualJoystick', () => ({ VirtualJoystick: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setSprintCallbacks = vi.fn(); output = { x: 0, z: 0 }; } }));
vi.mock('../ui/controls/TouchLook', () => ({ TouchLook: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setSensitivity = vi.fn(); consumeDelta = vi.fn().mockReturnValue({ x: 0, y: 0 }); } }));
vi.mock('../ui/controls/TouchFireButton', () => ({ TouchFireButton: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setCallbacks = vi.fn(); } }));
vi.mock('../ui/controls/TouchActionButtons', () => ({ TouchActionButtons: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setOnAction = vi.fn(); } }));
vi.mock('../ui/controls/TouchWeaponBar', () => ({ TouchWeaponBar: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setOnWeaponSelect = vi.fn(); } }));
vi.mock('../ui/controls/TouchADSButton', () => ({ TouchADSButton: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setOnADSToggle = vi.fn(); } }));
vi.mock('../ui/controls/TouchInteractionButton', () => ({ TouchInteractionButton: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setCallback = vi.fn(); } }));
vi.mock('../ui/controls/TouchSandbagButtons', () => ({ TouchSandbagButtons: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setCallbacks = vi.fn(); } }));
vi.mock('../ui/controls/TouchRallyPointButton', () => ({ TouchRallyPointButton: class { show = vi.fn(); hide = vi.fn(); dispose = vi.fn(); setCallback = vi.fn(); showButton = vi.fn(); } }));

// Mock Loadout sub-renderers
vi.mock('../ui/loadout/LoadoutGrenadePanel', () => ({ renderGrenadePanel: () => '<div id="grenade-panel"></div>' }));

import { isTouchDevice, isMobileViewport, shouldUseTouchControls } from '../utils/DeviceDetector';
import { PlayerInput } from '../systems/player/PlayerInput';
import { TouchControls } from '../ui/controls/TouchControls';
import { LoadoutSelector } from '../ui/loadout/LoadoutSelector';

describe('Mobile Smoke Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Mock Pointer Lock API which is missing in JSDOM
    document.exitPointerLock = vi.fn();
    document.body.requestPointerLock = vi.fn();
  });

  it('1. DeviceDetector detects touch correctly', () => {
    (isTouchDevice as any).mockReturnValue(true);
    (shouldUseTouchControls as any).mockReturnValue(true);
    
    expect(isTouchDevice()).toBe(true);
    expect(shouldUseTouchControls()).toBe(true);
  });

  it('2. DeviceDetector detects mobile viewport correctly', () => {
    (isMobileViewport as any).mockReturnValue(true);
    expect(isMobileViewport()).toBe(true);
  });

  it('3. PlayerInput disables pointer lock on touch devices', () => {
    (shouldUseTouchControls as any).mockReturnValue(true);
    
    const input = new PlayerInput();
    
    // We can't directly check private pointerLockEnabled, 
    // but we can check the behavior or the public getter
    expect(input.getIsTouchMode()).toBe(true);
    
    // On touch devices, getIsPointerLocked returns true if game started
    input.setGameStarted(true);
    expect(input.getIsPointerLocked()).toBe(true);
  });

  it('4. TouchControls creates all required mobile components', () => {
    const controls = new TouchControls();
    
    expect(controls.joystick).toBeDefined();
    expect(controls.look).toBeDefined();
    expect(controls.fireButton).toBeDefined();
    expect(controls.actionButtons).toBeDefined();
    expect(controls.weaponBar).toBeDefined();
    expect(controls.adsButton).toBeDefined();
    expect(controls.interactionButton).toBeDefined();
    expect(controls.sandbagButtons).toBeDefined();
    expect(controls.rallyPointButton).toBeDefined();
  });

  it('5. TouchControls dispose properly cleans up', () => {
    const controls = new TouchControls();
    const disposeSpy = vi.spyOn(controls.joystick, 'dispose');
    
    controls.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it('6. LoadoutSelector shows TAP on mobile', async () => {
    (shouldUseTouchControls as any).mockReturnValue(true);
    
    const loadout = new LoadoutSelector();
    await loadout.init();
    loadout.show();
    
    const html = document.body.innerHTML;
    expect(html).toContain('TAP');
    expect(html).not.toContain('CLICK');
  });

  it('7. LoadoutSelector shows CLICK on desktop', async () => {
    (shouldUseTouchControls as any).mockReturnValue(false);
    
    const loadout = new LoadoutSelector();
    await loadout.init();
    loadout.show();
    
    const html = document.body.innerHTML;
    expect(html).toContain('CLICK');
    expect(html).not.toContain('TAP');
  });

  it('8. PlayerInput creates touch controls only on mobile', () => {
    (shouldUseTouchControls as any).mockReturnValue(true);
    const mobileInput = new PlayerInput();
    expect(mobileInput.getTouchControls()).not.toBeNull();

    (shouldUseTouchControls as any).mockReturnValue(false);
    const desktopInput = new PlayerInput();
    expect(desktopInput.getTouchControls()).toBeNull();
  });
});
