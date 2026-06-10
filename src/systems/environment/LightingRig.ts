// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { ISkyBackend } from './atmosphere/ISkyBackend';
import { applyRigPresetTrim, type RigPresetTrim } from './LightingRigPresetTrim';

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
 * Shipped path since `legacy-path-deletion` (Phase 4): `LightingRigConfig.enabled`
 * defaults ON and the legacy in-shader branches are deleted, so terrain, the
 * billboard foliage family, and the NPC impostor all read the shared bindings
 * below as their ONLY lighting path. A single documented runtime kill-switch
 * (`LightingRigConfig.enabled = false`, see its doc) reverts the CPU-side
 * scene-light/fog authority to the legacy compressed snapshot for one release.
 *
 * ## Exposure policy (Phase 3 — RATIFIED: in-shader / scene-color, NOT an AGX split)
 *
 * The memo §3 proposed handling energy "exactly once, at AGX" via
 * `renderer.toneMappingExposure`. Phase 3 reviewed that against the
 * implementation and ratifies the IN-SHADER / SCENE-COLOR application as the
 * final policy, for three load-bearing reasons:
 *
 * 1. **The rig exposure is sun-elevation-keyed and varies per scenario.** AGX
 *    `toneMappingExposure` is a single global the WorldBuilder dev console
 *    A/B-toggles (`GameRenderer` holds it at 1.0); writing a per-frame TOD curve
 *    into it would fight that toggle and couple the rig to a renderer global.
 * 2. **One application, one curve, computed once.** `deriveLightingRigState`
 *    computes the exposure scalar exactly once per frame (base curve × the
 *    scenario's bounded intensity trim) and stores it on
 *    `LightingRigState.exposure`. BOTH consumers read that one value: the
 *    foliage branch via the `exposure` binding, terrain + GLB via
 *    `rigSceneLightRadiance` (which READS `rig.exposure`, it does NOT recompute).
 *    No family gets exposure twice; fog carries no exposure on either consumer
 *    (scene fog and foliage fog both mix post-lighting against the same
 *    un-exposed rig `fogColor`).
 * 3. **AGX stays the single PRESENTATION stage.** AGX still owns the tonemap
 *    knee at `toneMappingExposure = 1.0`; the rig owns *scene radiance scale*.
 *    Radiance scaling and tonemap mapping are different stages, so this is not
 *    a double application of the same energy.
 *
 * The single-application invariant is regression-tested in `LightingRig.test.ts`
 * ("exposure is applied exactly once"). See `docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md` §3.
 */

/**
 * Runtime flag config. Plain mutable object so a Playwright `page.evaluate`
 * (and the WorldBuilder dev console) can flip the rig at runtime — mirrors the
 * `NpcLodConfig` / `SquadCommandConfig` pattern. Do NOT freeze.
 *
 * ## Default ON since `legacy-path-deletion` (Phase 4, cycle
 * `cycle-2026-06-09-lighting-acceptance`).
 *
 * The unified rig is now the shipped lighting path: the renderer scene lights
 * (directional/hemisphere/ambient feeding terrain + GLB PBR) and scene fog are
 * driven from the rig terms, the impostor scene-graph scan is skipped, and the
 * terrain night-fill emissive is suppressed — all gated on `isLightingRigEnabled()`.
 * The legacy IN-SHADER branches (the foliage `[0.40, 0.78]` clamp band, the
 * terrain night-stabilizer / night-fill emissive, the NPC scene-scan tint) were
 * DELETED this pass, so the compiled material graphs are rig-only (no dead ALU).
 *
 * ## Runtime kill-switch (retained for ONE release)
 *
 * Setting this back to `false` — at runtime via
 * `window.__lightingRig.enabled = false` (see `LIGHTING_RIG_GLOBAL_KEY`), or in
 * source here — reverts the CPU-side SCENE authority only: the scene lights +
 * scene fog read the compressed `AtmosphereLightingSnapshot` again. The deleted
 * in-shader paths do NOT come back — the impostor scene-graph scan, the terrain
 * night-fill emissive, and the foliage clamp band are gone on both flag states
 * (material graphs are rig-only; on OFF the night floor returns via the legacy
 * scene ambient light, and impostors stay rig-lit, a mild deliberate mismatch).
 * It is the documented safety valve for the first release after the flip; the
 * next cycle removes the flag and this object entirely.
 */
export const LightingRigConfig = {
  /**
   * Master flag, default ON. The documented one-release runtime kill-switch:
   * flip to `false` (e.g. `window.__lightingRig.enabled = false`) to fall back
   * to the legacy CPU-side scene-light/fog authority. See the type doc above.
   */
  enabled: true,
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
  /**
   * The single scene-wide exposure scalar for this frame: the base TOD curve
   * (`rigExposureForElevation`) times the active scenario's bounded intensity
   * trim. Computed ONCE in `deriveLightingRigState` and read by both exposure
   * consumers (the foliage `exposure` binding and `rigSceneLightRadiance` for
   * terrain + GLB) so no family applies exposure twice. See the exposure-policy
   * note in the module header.
   */
  exposure: number;
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
    exposure: 1,
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
  /**
   * `sin(sunElevation)` — i.e. the normalized sun direction's up component
   * (`sunDirection.y`). The single low-sun driver the unlit families read,
   * mirroring how terrain's horizon occlusion is keyed on
   * `directLightDirection.y` (`terrainLowSunOcclusionMask`). Foliage cards lack
   * true sloped normals + a horizon ray-march, so their up-biased card normal
   * over-catches the low warm sun (Phase 1: 17h foliage 0.180 vs terrain 0.054).
   * The foliage branch fades its direct-sun contribution toward zero as the sun
   * drops with this term, so foliage tracks terrain's low-sun suppression by
   * construction instead of overshooting it.
   */
  sunElevationSin: { value: number };
  /**
   * Linear fog color from the rig (`groundIrradiance`/horizon, pre-exposure).
   * The single fog authority on the rig path. `BillboardBufferManager` reads
   * `scene.fog.color` directly today (a parallel fog authority, memo flag #2);
   * on the rig path the buffer manager folds in this term instead so foliage fog
   * tint comes from the same source terrain/atmosphere fog derives from. Legacy
   * (flag OFF) keeps the direct `scene.fog.color` read byte-identical.
   */
  fogColor: { value: THREE.Color };
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
  sunElevationSin: { value: 1 },
  fogColor: { value: new THREE.Color(0.48, 0.56, 0.53) },
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
 *
 * Phase 1 (`terrain-rig-and-scene-lights`) raised this from the Phase 0
 * prototype's `(0.018, 0.024, 0.038)`: with the rig now driving the terrain via
 * PBR scene lights (no colorNode self-lighting), the 21h / midnight terrain
 * region read as an unmeasurable near-black floor (Phase 0 reviewer note). The
 * floor lifts the deepest-night radiance into a dark-but-readable band so every
 * swept TOD produces a measurable luminance. Cool-biased so night stays blue,
 * not grey. Still the ONE night authority — bright enough to read, dim enough
 * that midnight is unmistakably dark.
 */
const NIGHT_AMBIENT_FLOOR = new THREE.Color(0.052, 0.064, 0.090);

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
  const base = NIGHT_EXPOSURE + (NOON_EXPOSURE - NIGHT_EXPOSURE) * smooth;

  // Dawn/dusk shoulder (ashau-load-freeze owner feedback, 2026-06-10):
  // night readability and dawn brightness were coupled through the single
  // curve, so a sun just above the horizon still carried ~95% of the night
  // lift while Hosek's direct term was already substantial — terrain read as
  // glare ("catches too much light"). Cut exposure through the low-sun band
  // only: zero below the horizon (night unchanged), full ~22% cut once the
  // sun clears ~3.5deg, fading out by ~26deg where the base curve has fallen
  // on its own. Continuous everywhere; the LightingRig.test contract
  // (midnight > noon, dawn(0) > noon, midnight >= dawn) is unaffected
  // because the shoulder is zero at and below elevation 0.
  const rise = THREE.MathUtils.smoothstep(sunElevationRad, 0.0, 0.06);
  const fall = 1 - THREE.MathUtils.smoothstep(sunElevationRad, 0.18, 0.45);
  const DAWN_SHOULDER_CUT = 0.22;
  return base * (1 - DAWN_SHOULDER_CUT * rise * fall);
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
 * @param trim       the active scenario's bounded rig trim (tint/intensity
 *                   multipliers over the physical baseline). Undefined renders
 *                   the pure physical baseline. The trim is the ONLY
 *                   scenario-specific shaping on the rig path — the legacy
 *                   absolute color stacks are untouched (they drive the OFF path).
 */
export function deriveLightingRigState(
  backend: ISkyBackend,
  sunDirection: THREE.Vector3,
  fogDarkenFactor: number,
  out: LightingRigState,
  trim?: RigPresetTrim,
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

  // Apply the active scenario's bounded rig trim over the physical baseline:
  // tint multipliers on the sun/sky/ground/fog terms and an intensity multiplier
  // on the exposure curve. Identity when `trim` is undefined. This is the single
  // application of exposure (base curve × trim intensity), stored once on the
  // state and read by both consumers (foliage binding + scene-light projection).
  out.exposure = applyRigPresetTrim(out, rigExposureForElevation(out.sunElevation), trim);

  // Mirror into the shared bindings the materials read.
  lightingRigBindings.rigEnabled.value = isLightingRigEnabled() ? 1 : 0;
  lightingRigBindings.sunDirection.value.copy(out.sunDirection);
  lightingRigBindings.sunRadiance.value.copy(out.sunRadiance);
  lightingRigBindings.skyIrradiance.value.copy(out.skyIrradiance);
  lightingRigBindings.groundIrradiance.value.copy(out.groundIrradiance);
  lightingRigBindings.ambientRadiance.value.copy(out.ambientRadiance);
  lightingRigBindings.exposure.value = out.exposure;
  // Low-sun driver for the unlit families (sin of elevation == sunDirection.y),
  // and the single rig fog color the billboard buffer reads on the rig path.
  lightingRigBindings.sunElevationSin.value = out.sunDirection.y;
  lightingRigBindings.fogColor.value.copy(out.fogColor);

  return out;
}

/**
 * Scene-light radiance the rig hands to the renderer's three PBR lights
 * (directional sun/moon, hemisphere sky+ground, ambient fill) on the rig path.
 *
 * This is the OTHER half of resolving the terrain double-lighting (memo §2,
 * Phase 1 scope item 2). When the rig is ON the terrain `colorNode` stops
 * self-lighting the albedo and emits raw albedo, so the PBR scene lights apply
 * the sun/sky energy exactly once. Those scene lights are driven from the SAME
 * rig terms the unlit foliage reads directly, with the single rig exposure
 * folded in — so terrain (PBR), GLB props (PBR), and foliage (direct rig math)
 * all track one luminance-vs-sun-elevation curve.
 *
 * Intensity ownership is deliberately untouched: `WeatherAtmosphere` reads each
 * light's *base* construction intensity once and multiplies it per frame
 * (storm dims), and `AtmosphereSystem` must not write `.intensity` (the
 * "weather owns intensity" contract). So the rig folds the reciprocal of each
 * light's base construction intensity into the color it writes, so that
 * `color × baseIntensity == rigRadiance × exposure`. The PBR contribution then
 * reduces to `albedo * (hemi + sunRadiance·n·l + ambient) * exposure` —
 * matching the foliage wrapped-Lambert form — and any weather intensity
 * multiplier scales both the legacy and rig paths identically. Colors are
 * otherwise uncompressed linear radiance; AGX owns the final presentation knee.
 */
export interface RigSceneLightRadiance {
  /** Directional sun/moon color (sunRadiance × exposure ÷ base directional intensity). */
  sunColor: THREE.Color;
  /** Hemisphere upper color (skyIrradiance × exposure ÷ base hemisphere intensity). */
  skyColor: THREE.Color;
  /** Hemisphere lower color (groundIrradiance × exposure ÷ base hemisphere intensity). */
  groundColor: THREE.Color;
  /** Ambient fill color (ambientRadiance × exposure ÷ base ambient intensity). */
  ambientColor: THREE.Color;
}

export function createRigSceneLightRadiance(): RigSceneLightRadiance {
  return {
    sunColor: new THREE.Color(0, 0, 0),
    skyColor: new THREE.Color(0, 0, 0),
    groundColor: new THREE.Color(0, 0, 0),
    ambientColor: new THREE.Color(0, 0, 0),
  };
}

/**
 * Base construction intensities of the renderer scene lights, mirrored from
 * `GameRenderer` (ambient 1.0, directional/moon 2.0, hemisphere 0.8). The rig
 * divides these out of the color so `color × baseIntensity` reproduces the
 * intended `rigRadiance × exposure`, leaving intensity ownership to weather.
 */
export interface SceneLightBaseIntensities {
  ambient: number;
  directional: number;
  hemisphere: number;
}

/**
 * Project the current rig state into the four scene-light colors, exposure
 * folded in and the base construction intensity divided out. Reads the single
 * `rig.exposure` scalar `deriveLightingRigState` already computed (base curve ×
 * scenario intensity trim) — it deliberately does NOT recompute exposure, so
 * terrain + GLB carry the SAME exposure the foliage binding does (no double
 * application; see the module-header exposure policy). The caller copies the
 * result into the renderer lights and leaves their `.intensity` alone (weather
 * owns it).
 */
export function rigSceneLightRadiance(
  rig: LightingRigState,
  base: SceneLightBaseIntensities,
  out: RigSceneLightRadiance,
): RigSceneLightRadiance {
  const exposure = rig.exposure;
  const sunScale = exposure / Math.max(base.directional, 1e-4);
  const hemiScale = exposure / Math.max(base.hemisphere, 1e-4);
  const ambientScale = exposure / Math.max(base.ambient, 1e-4);
  out.sunColor.copy(rig.sunRadiance).multiplyScalar(sunScale);
  out.skyColor.copy(rig.skyIrradiance).multiplyScalar(hemiScale);
  out.groundColor.copy(rig.groundIrradiance).multiplyScalar(hemiScale);
  out.ambientColor.copy(rig.ambientRadiance).multiplyScalar(ambientScale);
  return out;
}
