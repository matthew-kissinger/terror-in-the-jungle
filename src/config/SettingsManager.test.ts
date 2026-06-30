/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsManager } from './SettingsManager';

const LEGACY_STORAGE_KEY = 'pixelart-sandbox-settings';
const STORAGE_KEY = 'terror-in-the-jungle-settings';

describe('SettingsManager', () => {
  beforeEach(() => {
    // Reset singleton for clean tests
    (SettingsManager as any).instance = null;
    // Clear localStorage (both the current key and the legacy one)
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  });

  it('should return default values', () => {
    const sm = SettingsManager.getInstance();
    expect(sm.get('masterVolume')).toBe(70);
    expect(sm.get('mouseSensitivity')).toBe(5);
    expect(sm.get('ambientVolume')).toBe(100);
    expect(sm.get('musicVolume')).toBe(50);
    // Radio music ships OFF (no cellular auto-download on touch).
    expect(sm.get('musicEnabled')).toBe(false);
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

  it('should normalize ambient and music volume to 0-1 range', () => {
    const sm = SettingsManager.getInstance();
    expect(sm.getAmbientVolumeNormalized()).toBe(1);
    expect(sm.getMusicVolumeNormalized()).toBeCloseTo(0.5);

    sm.set('ambientVolume', 0);
    sm.set('musicVolume', 100);
    expect(sm.getAmbientVolumeNormalized()).toBe(0);
    expect(sm.getMusicVolumeNormalized()).toBe(1);
  });

  it('should return all settings via getAll', () => {
    const sm = SettingsManager.getInstance();
    const all = sm.getAll();
    expect(all).toEqual({
      masterVolume: 70,
      ambientVolume: 100,
      musicVolume: 50,
      musicEnabled: false,
      mouseSensitivity: 5,
      touchSensitivity: 3,
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

  describe('legacy storage-key migration', () => {
    it('preserves a returning player\'s settings stored under the legacy key', () => {
      // A returning player has settings written by an older build under the
      // legacy project-name key, with no value under the current key yet.
      localStorage.setItem(
        LEGACY_STORAGE_KEY,
        JSON.stringify({ masterVolume: 13, graphicsQuality: 'ultra', controllerInvertY: true }),
      );

      const sm = SettingsManager.getInstance();

      // Their settings come through intact rather than resetting to defaults.
      expect(sm.get('masterVolume')).toBe(13);
      expect(sm.get('graphicsQuality')).toBe('ultra');
      expect(sm.get('controllerInvertY')).toBe(true);
    });

    it('moves legacy settings onto the current key and clears the legacy key', () => {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ masterVolume: 13 }));

      SettingsManager.getInstance();

      // After migration the value lives under the current key with the same data,
      // and the legacy key no longer lingers.
      const migrated = localStorage.getItem(STORAGE_KEY);
      expect(migrated).not.toBeNull();
      expect(JSON.parse(migrated as string).masterVolume).toBe(13);
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    });

    it('keeps the migrated value across a fresh load', () => {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ masterVolume: 13 }));
      SettingsManager.getInstance();

      // A subsequent load (new instance) reads the current key, not the legacy one.
      (SettingsManager as any).instance = null;
      const reloaded = SettingsManager.getInstance();
      expect(reloaded.get('masterVolume')).toBe(13);
    });

    it('prefers the current key when both keys are present', () => {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ masterVolume: 13 }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ masterVolume: 88 }));

      const sm = SettingsManager.getInstance();
      expect(sm.get('masterVolume')).toBe(88);
    });

    it('fresh install writes only to the current key', () => {
      const sm = SettingsManager.getInstance();
      sm.set('masterVolume', 55);

      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string).masterVolume).toBe(55);
    });
  });
});
