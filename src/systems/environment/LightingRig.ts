// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { ISkyBackend } from './atmosphere/ISkyBackend';

/**
 * Unified lighting rig — Phase 0 prototype (cycle `cycle-2026-06-09-lighting-rig-spike`,
 * task `rig-prototype`).
 *
 * This is the canonical lighting state every material family is meant to read,
 * per the ratified design memo
 * `docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md`. It carries **linear radiance**
 * (not compressed presentation colors): the rig path deliberately skips the
 * three mid-pipeline energy clamps the legacy snapshot stacks
 * (`shapeDirectLightForRenderer`, `compressSkyRadianceForRenderer`, the billboard
 * `[0.40, 0.78]` band). Brightness is owned downstream by AGX + the single TOD
 * exposure scalar here.
 *
 * Phase 0 scope: behind a runtime flag (`LightingRigConfig.enabled`, default
 * OFF). When OFF, the rig is still derived each frame (cheap) but no material
 * consumes it — the legacy paths are byte-identical. When ON, terrain and the
 * billboard foliage family read the shared bindings below and take their
 * flag-gated rig branch. This is the GO/NO-GO measurement target, not final
 * visual tuning. Phases 1-4 build this out (scene lights, NPC impostors, fog
 * unification, legacy deletion).
 */

/**
 * Runtime flag config. Plain mutable object so a Playwright `page.evaluate`
 * (and the WorldBuilder dev console, later) can flip the prototype on for the
 * A/B sweep — mirrors the `NpcLodConfig` / `SquadCommandConfig` pattern. Do NOT
 * freeze. Default OFF: production behaviour is the legacy path until Phase 4.
 */
export const LightingRigConfig = {
  /** Master flag. When false, every material takes its legacy lighting branch. */
  enabled: false,
};

/**
 * Window key the runtime flag is mirrored onto so a headless capture harness can
 * toggle it without a module import:
 *
 *   await page.evaluate(() => { (window).__lightingRig.enabled = true; });
 */
export const LIGHTING_RIG_GLOBAL_KEY = '__lightingRig';

/**
 * Publish the runtime flag object onto `window` (idempotent). Called once from
 * AtmosphereSystem construction so the harness can reach it. The SAME object is
 * shared by reference, so a write through `window.__lightingRig.enabled` is read
 * by `isLightingRigEnabled()` on the next frame.
 */
export function publishLightingRigConfig(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, typeof LightingRigConfig>)[LIGHTING_RIG_GLOBAL_KEY] =
    LightingRigConfig;
}

/** True when the prototype rig path is active. Read each frame by the rig binding update. */
export function isLightingRigEnabled(): boolean {
  return LightingRigConfig.enabled;
}

/**
 * Canonical per-frame lighting state. All colors are linear RGB radiance,
 * uncompressed (memo §2a). Derived once per frame in
 * `AtmosphereSystem.update()` at the `World.Atmosphere.LightFog` marker.
 */
export interface LightingRigState {
  /** World-space direction toward the sun (normalized). */
  sunDirection: THREE.Vector3;
  /** Linear RGB radiance of the direct (sun/moon) term, from `getSun`, uncompressed. */
  sunRadiance: THREE.Color;
  /** Linear RGB upper-hemisphere irradiance, from `getZenith`. */
  skyIrradiance: THREE.Color;
  /** Linear RGB lower-hemisphere irradiance — `getHorizon` scaled by a ground bounce. */
  groundIrradiance: THREE.Color;
  /** Residual uniform fill (night-floor moon/skyglow term). */
  ambientRadiance: THREE.Color;
  /** `asin(sunDirection.y)` in radians — the single driver for low-sun falloff. */
  sunElevation: number;
  /** Linear fog color derived from `groundIrradiance` (horizon), pre-exposure. */
  fogColor: THREE.Color;
  /** Per-scenario base × weather multiplier (ownership unchanged). */
  fogDensity: number;
  /** Smooth day scalar [0,1], retained for systems that dim authored highlights. */
  daylightFactor: number;
}

export function createLightingRigState(): LightingRigState {
  return {
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunRadiance: new THREE.Color(1, 1, 1),
    skyIrradiance: new THREE.Color(0.7, 0.8, 1.0),
    groundIrradiance: new THREE.Color(0.3, 0.3, 0.25),
    ambientRadiance: new THREE.Color(0, 0, 0),
    sunElevation: Math.PI / 2,
    fogColor: new THREE.Color(0.48, 0.56, 0.53),
    fogDensity: 0,
    daylightFactor: 1,
  };
}

/**
 * Shared rig uniform bindings. The repo's node materials read uniforms through
 * `reference('value', type, slot)` against a plain `{ value }` slot (see
 * `TerrainMaterial.ts` / `BillboardNodeMaterial.ts`). The rig owns ONE slot per
 * field and hands it by reference to every consuming material, so all families
 * read the identical object — the memo's "one binding" principle (§2b). The rig
 * updates `.value` in place each frame; the node graph picks the new values up
 * on the next render without a recompile.
 */
export interface LightingRigBindings {
  rigEnabled: { value: number };
  sunDirection: { value: THREE.Vector3 };
  sunRadiance: { value: THREE.Color };
  skyIrradiance: { value: THREE.Color };
  groundIrradiance: { value: THREE.Color };
  ambientRadiance: { value: THREE.Color };
  exposure: { value: number };
}

/**
 * The process-wide shared bindings. A module singleton because the rig is a
 * single authority and the two prototype material factories import these
 * directly (no plumbing through SystemUpdater needed). `rigEnabled` is a float
 * (0/1) so the TSL `select(...)` branch can read it as a uniform.
 */
export const lightingRigBindings: LightingRigBindings = {
  rigEnabled: { value: 0 },
  sunDirection: { value: new THREE.Vector3(0, 1, 0) },
  sunRadiance: { value: new THREE.Color(1, 1, 1) },
  skyIrradiance: { value: new THREE.Color(0.7, 0.8, 1.0) },
  groundIrradiance: { value: new THREE.Color(0.3, 0.3, 0.25) },
  ambientRadiance: { value: new THREE.Color(0, 0, 0) },
  exposure: { value: 1 },
};

/**
 * Ground-bounce factor applied to the horizon radiance to approximate the
 * lower-hemisphere irradiance (the ground reflects a fraction of incident sky).
 * Mirrors the legacy `HEMISPHERE_GROUND_DARKEN` so the rig's ground term starts
 * from a comparable physical magnitude; a trim, not the lighting mechanism.
 */
const GROUND_BOUNCE_FACTOR = 0.55;

/**
 * Night-floor radiance (moon/skyglow) folded into `ambientRadiance`. The legacy
 * pipeline spreads three different night floors (terrain night-fill emissive,
 * billboard 0.40 clamp, NPC lightScale); the memo collapses them into this one
 * term (§3). Cool, dim — midnight foliage is then *allowed* to be dark, bounded
 * only by this floor.
 */
const NIGHT_AMBIENT_FLOOR = new THREE.Color(0.018, 0.024, 0.038);

/**
 * Prototype TOD-aware exposure scalar keyed on sun elevation (memo §3 / scope
 * item 4). Enough for an honest A/B, not final tuning. Linear radiance from the
 * Hosek backend swings a wide range across the day (noon zenith is bright,
 * midnight is near-floor); a single scene-wide scalar keeps every family on the
 * same curve instead of per-material brightness compensation.
 *
 * Shape: gently lift the dim low-sun/night radiance and pull noon down so the
 * uncompressed sun term does not blow past the AGX knee. One curve, never
 * per-family.
 */
export function rigExposureForElevation(sunElevationRad: number): number {
  // Map elevation [-0.2 rad (deep night) .. +1.4 rad (~noon)] to a day factor.
  const dayT = THREE.MathUtils.clamp((sunElevationRad + 0.2) / 1.6, 0, 1);
  const smooth = dayT * dayT * (3 - 2 * dayT);
  // High exposure at night (lift the floor toward visibility), lower at noon
  // (tame the bright uncompressed zenith). Linear between.
  const NIGHT_EXPOSURE = 2.6;
  const NOON_EXPOSURE = 0.9;
  return NIGHT_EXPOSURE + (NOON_EXPOSURE - NIGHT_EXPOSURE) * smooth;
}

/**
 * Derive the rig state for this frame from the Hosek backend's uncompressed
 * radiance accessors, then mirror it into the shared bindings. NO compression on
 * this path — the whole point of the rig. Called once per frame by
 * AtmosphereSystem at the LightFog marker.
 *
 * @param backend    sky backend (`getSun` / `getZenith` / `getHorizon` return
 *                   linear radiance already scaled by preset exposure).
 * @param sunDirection authoritative sun direction (normalized world vector).
 * @param fogDarkenFactor weather fog-darken multiplier [0,1].
 * @param out        the rig state to fill.
 */
export function deriveLightingRigState(
  backend: ISkyBackend,
  sunDirection: THREE.Vector3,
  fogDarkenFactor: number,
  out: LightingRigState,
): LightingRigState {
  out.sunDirection.copy(sunDirection).normalize();
  out.sunElevation = Math.asin(THREE.MathUtils.clamp(out.sunDirection.y, -1, 1));

  // Direct sun/moon radiance, uncompressed. `getSun` already crossfades to the
  // cool moon color below the horizon (HosekWilkieSkyBackend), so the rig sun
  // term naturally falls off with elevation without a channel ceiling.
  backend.getSun(out.sunRadiance);

  // Upper / lower hemisphere irradiance from the same physical backend, uncompressed.
  backend.getZenith(out.skyIrradiance);
  backend.getHorizon(out.groundIrradiance);
  out.groundIrradiance.multiplyScalar(GROUND_BOUNCE_FACTOR);

  // Night floor lives here, once. Fade it in as the sun drops below the horizon
  // (smoothstep does not support inverted edges, so invert a [-0.08, 0.1] ramp:
  // nightT = 0 in daylight, 1 once the sun is below the horizon).
  const nightT = 1 - THREE.MathUtils.smoothstep(out.sunDirection.y, -0.08, 0.1);
  out.ambientRadiance.copy(NIGHT_AMBIENT_FLOOR).multiplyScalar(nightT);

  // Fog color from the horizon irradiance (single fog authority, pre-exposure).
  backend.getHorizon(out.fogColor);
  out.fogColor.multiplyScalar(THREE.MathUtils.clamp(fogDarkenFactor, 0, 1));

  out.daylightFactor = 1 - nightT;

  // Mirror into the shared bindings the materials read.
  const exposure = rigExposureForElevation(out.sunElevation);
  lightingRigBindings.rigEnabled.value = isLightingRigEnabled() ? 1 : 0;
  lightingRigBindings.sunDirection.value.copy(out.sunDirection);
  lightingRigBindings.sunRadiance.value.copy(out.sunRadiance);
  lightingRigBindings.skyIrradiance.value.copy(out.skyIrradiance);
  lightingRigBindings.groundIrradiance.value.copy(out.groundIrradiance);
  lightingRigBindings.ambientRadiance.value.copy(out.ambientRadiance);
  lightingRigBindings.exposure.value = exposure;

  return out;
}
