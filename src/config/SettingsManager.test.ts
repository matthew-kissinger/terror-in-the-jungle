/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsManager } from './SettingsManager';

describe('SettingsManager', () => {
  beforeEach(() => {
    // Reset singleton for clean tests
    (SettingsManager as any).instance = null;
    // Clear localStorage
    localStorage.removeItem('pixelart-sandbox-settings');
  });

  it('should return default values', () => {
    const sm = SettingsManager.getInstance();
    expect(sm.get('masterVolume')).toBe(70);
    expect(sm.get('mouseSensitivity')).toBe(5);
    expect(sm.get('controllerPreset')).toBe('default');
    expect(sm.get('controllerDpadMode')).toBe('weapons');
    expect(sm.get('showFPS')).toBe(false);
    expect(sm.get('enableShadows')).toBe(true);
    expect(sm.get('graphicsQuality')).toBe('medium');
  });

  it('should persist settings to localStorage', () => {
    const sm = SettingsManager.getInstance();
    sm.set('masterVolume', 42);
    
    // Create new instance to verify persistence
    (SettingsManager as any).instance = null;
    const sm2 = SettingsManager.getInstance();
    expect(sm2.get('masterVolume')).toBe(42);
  });

  it('should notify listeners on change', () => {
    const sm = SettingsManager.getInstance();
    const listener = vi.fn();
    sm.onChange(listener);

    sm.set('enableShadows', false);
    expect(listener).toHaveBeenCalledWith('enableShadows', false);
  });

  it('should not notify when value unchanged', () => {
    const sm = SettingsManager.getInstance();
    const listener = vi.fn();
    sm.onChange(listener);

    sm.set('masterVolume', 70); // Same as default
    expect(listener).not.toHaveBeenCalled();
  });

  it('should unsubscribe listener', () => {
    const sm = SettingsManager.getInstance();
    const listener = vi.fn();
    const unsub = sm.onChange(listener);

    unsub();
    sm.set('masterVolume', 50);
    expect(listener).not.toHaveBeenCalled();
  });

  it('should convert mouse sensitivity to raw value', () => {
    const sm = SettingsManager.getInstance();
    // Default sensitivity 5 -> ~0.00278
    const raw = sm.getMouseSensitivityRaw();
    expect(raw).toBeGreaterThan(0.001);
    expect(raw).toBeLessThan(0.005);

    // Min sensitivity 1 -> 0.001
    sm.set('mouseSensitivity', 1);
    expect(sm.getMouseSensitivityRaw()).toBeCloseTo(0.001);

    // Max sensitivity 10 -> 0.005
    sm.set('mouseSensitivity', 10);
    expect(sm.getMouseSensitivityRaw()).toBeCloseTo(0.005);
  });

  it('should normalize volume to 0-1 range', () => {
    const sm = SettingsManager.getInstance();
    expect(sm.getMasterVolumeNormalized()).toBeCloseTo(0.7);

    sm.set('masterVolume', 0);
    expect(sm.getMasterVolumeNormalized()).toBe(0);

    sm.set('masterVolume', 100);
    expect(sm.getMasterVolumeNormalized()).toBe(1);
  });

  it('should return all settings via getAll', () => {
    const sm = SettingsManager.getInstance();
    const all = sm.getAll();
    expect(all).toEqual({
      masterVolume: 70,
      mouseSensitivity: 5,
      touchSensitivity: 5,
      controllerPreset: 'default',
      controllerMoveDeadZone: 15,
      controllerLookDeadZone: 15,
      controllerLookCurve: 'precision',
      controllerInvertY: false,
      controllerDpadMode: 'weapons',
      showFPS: false,
      enableShadows: true,
      graphicsQuality: 'medium',
    });
  });

  it('should convert controller dead zones to 0-1 values', () => {
    const sm = SettingsManager.getInstance();
    sm.set('controllerMoveDeadZone', 20);
    sm.set('controllerLookDeadZone', 12);
    expect(sm.getControllerMoveDeadZoneRaw()).toBeCloseTo(0.2);
    expect(sm.getControllerLookDeadZoneRaw()).toBeCloseTo(0.12);
  });
});
