import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { updateAtmosphere, type FogTintIntentReceiver } from './WeatherAtmosphere';
import { WeatherState } from '../../config/gameModeTypes';
import type { IGameRenderer } from '../../types/SystemInterfaces';

/**
 * Behavior contract for the fog-tint forwarding in
 * `WeatherAtmosphere.updateAtmosphere` after `atmosphere-fog-tinted-by-sky`.
 *
 * These tests assert the caller-visible contract: storm darkens, clear
 * does not, underwater snaps to override. They do NOT hard-code the
 * exact darken magnitudes (those are tuning constants — see
 * `docs/TESTING.md`).
 */

function makeRendererStub(): IGameRenderer {
  return {
    fog: { color: new THREE.Color(0x112233), density: 0.004 } as THREE.FogExp2,
    ambientLight: { intensity: 1, color: new THREE.Color(0xffffff) } as THREE.AmbientLight,
    moonLight: { intensity: 2 } as THREE.DirectionalLight,
    hemisphereLight: { intensity: 0.8 } as THREE.HemisphereLight,
  } as IGameRenderer;
}

function makeFogIntentStub(): FogTintIntentReceiver & {
  setFogDarkenFactor: ReturnType<typeof vi.fn>;
  setFogUnderwaterOverride: ReturnType<typeof vi.fn>;
} {
  return {
    setFogDarkenFactor: vi.fn(),
    setFogUnderwaterOverride: vi.fn(),
  };
}

const baseValues = {
  fogDensity: 0.004,
  ambientIntensity: 1,
  moonIntensity: 2,
  hemisphereIntensity: 0.8,
  fogColor: 0x5a7a6a,
  ambientColor: 0x6a8a7a,
};

describe('WeatherAtmosphere fog-tint forwarding', () => {
  it('forwards underwater override to the atmosphere intent receiver', () => {
    const renderer = makeRendererStub();
    const intent = makeFogIntentStub();

    updateAtmosphere(renderer, true, WeatherState.CLEAR, WeatherState.CLEAR, 1, baseValues, false, intent);

    expect(intent.setFogUnderwaterOverride).toHaveBeenCalledWith(true);
  });

  it('clears the underwater override when returning to clear air', () => {
    const renderer = makeRendererStub();
    const intent = makeFogIntentStub();

    updateAtmosphere(renderer, false, WeatherState.CLEAR, WeatherState.CLEAR, 1, baseValues, false, intent);

    expect(intent.setFogUnderwaterOverride).toHaveBeenCalledWith(false);
  });

  it('forwards a darker-than-clear fog factor during a storm', () => {
    const renderer = makeRendererStub();
    const intent = makeFogIntentStub();

    updateAtmosphere(renderer, false, WeatherState.STORM, WeatherState.STORM, 1, baseValues, false, intent);

    const darken = intent.setFogDarkenFactor.mock.calls.at(-1)?.[0] as number;
    expect(darken).toBeGreaterThan(0);
    expect(darken).toBeLessThan(1);
  });

  it('leaves the clear-weather fog factor unchanged (no darkening)', () => {
    const renderer = makeRendererStub();
    const intent = makeFogIntentStub();

    updateAtmosphere(renderer, false, WeatherState.CLEAR, WeatherState.CLEAR, 1, baseValues, false, intent);

    const darken = intent.setFogDarkenFactor.mock.calls.at(-1)?.[0] as number;
    expect(darken).toBe(1.0);
  });

  it('storm fog is strictly darker than heavy-rain fog (weather intensity order)', () => {
    const storm = makeFogIntentStub();
    const heavy = makeFogIntentStub();

    updateAtmosphere(makeRendererStub(), false, WeatherState.STORM, WeatherState.STORM, 1, baseValues, false, storm);
    updateAtmosphere(makeRendererStub(), false, WeatherState.HEAVY_RAIN, WeatherState.HEAVY_RAIN, 1, baseValues, false, heavy);

    const stormDarken = storm.setFogDarkenFactor.mock.calls.at(-1)?.[0] as number;
    const heavyDarken = heavy.setFogDarkenFactor.mock.calls.at(-1)?.[0] as number;
    expect(stormDarken).toBeLessThan(heavyDarken);
  });

  it('does not write scene.fog.color directly when an intent receiver is wired', () => {
    const renderer = makeRendererStub();
    const intent = makeFogIntentStub();
    const initialColor = renderer.fog!.color.getHex();

    updateAtmosphere(renderer, false, WeatherState.CLEAR, WeatherState.CLEAR, 1, baseValues, false, intent);

    // Fog color unchanged — the atmosphere system will sample the sky
    // horizon instead. This is the seam-killing contract.
    expect(renderer.fog!.color.getHex()).toBe(initialColor);
  });

  it('falls back to the legacy direct-write when no intent receiver is wired', () => {
    const renderer = makeRendererStub();

    // Underwater path with no intent receiver: legacy direct-write
    // stays in place for isolated unit tests and for safety in any
    // call site we haven't wired yet.
    updateAtmosphere(renderer, true, WeatherState.CLEAR, WeatherState.CLEAR, 1, baseValues, false);
    expect(renderer.fog!.color.getHex()).toBe(0x003344);

    // Clear path with no intent receiver: fog stamped with baseline.
    updateAtmosphere(renderer, false, WeatherState.CLEAR, WeatherState.CLEAR, 1, baseValues, false);
    expect(renderer.fog!.color.getHex()).toBe(0x5a7a6a);
  });
});
