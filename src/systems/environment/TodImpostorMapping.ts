// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

/**
 * Time-of-day per-family impostor shading mapping (`tod-impostor-dynamic-mapping`,
 * wave L3 of `docs/CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md`).
 *
 * ## Why this exists
 *
 * The owner symptom: "impostor hue/brightness never matches time-of-day". The
 * three camera-facing card families — foliage billboards, static-impostor hero
 * cards, and NPC sprites — carried their artistic tuning (colorTint / saturation
 * / exposure) as STATIC uniforms set ONCE at material construction. Sun-elevation
 * radiance gating (`sun-elevation-light-gating`, #493) already makes the physical
 * DIRECT term die below the horizon for every rig consumer, but the per-family
 * ARTISTIC response (how much a card warms at dusk, how far its saturation drops
 * at night) was frozen at the midday look. So a card kept its noon hue as the
 * terrain around it reddened and darkened.
 *
 * This module owns ONE small declarative curve config per family, evaluated on
 * the CPU once per frame from the rig's sun elevation, and mirrored into shared
 * `{ value }` uniform slots the three card materials read. It LAYERS a per-family
 * artistic adjustment ON TOP of the physical rig gate — it does not duplicate or
 * fight it (the gate still owns whether the sun reaches the surface; this owns how
 * the card is graded once lit).
 *
 * ## Identity at high sun (midday look preserved exactly)
 *
 * Every family curve is IDENTITY above `FULL_DAY_ELEVATION_RAD`: exposure ×1,
 * saturation ×1, tint white (1,1,1). So at midday the mapped uniforms are exactly
 * the construction-time values and the visible frame is byte-identical to the
 * pre-mapping look. The intended, VISIBLE change is at dawn / dusk / night, where
 * each family dims, desaturates, and warms toward the low-sun terrain grade.
 *
 * ## Kill-switch (`todImpostorMapping`, default ON)
 *
 * Because the curves are identity at midday, default-ON is safe. Flip
 * `TodImpostorMappingConfig.enabled = false` (or `window.__todImpostorMapping`)
 * to freeze the bindings at identity — the three materials then shade EXACTLY as
 * they did with construction-time static uniforms, for one release.
 *
 * ## No per-frame allocation
 *
 * The shared bindings + a module scratch color are allocated once. The per-frame
 * update writes scalars and `color.setRGB` in place; nothing is allocated on the
 * hot path.
 */

/** The three card families graded by the mapping. Terrain + GLB heroes are scene-lit. */
export type TodImpostorFamily = 'foliage' | 'staticImpostor' | 'npc';

/** Per-family graded output for one frame: multipliers over the construction-time look. */
export interface TodImpostorGrade {
  /** Multiplier on the family's exposure uniform (1 == unchanged). */
  exposureMul: number;
  /** Multiplier on the family's saturation uniform (1 == unchanged). */
  saturationMul: number;
  /** Multiplier tint applied to the family's color, RGB (1,1,1 == unchanged). */
  tint: THREE.Color;
}

/**
 * Sun elevation (radians) at/above which every family curve is IDENTITY. Chosen
 * a touch above the sun-elevation gate's full band (`SUN_GATE_FULL_RAD = 0.1`) so
 * a sun meaningfully clear of the horizon reads exactly the midday look. The grade
 * ramps in only through the dawn/dusk shoulder below this.
 */
export const FULL_DAY_ELEVATION_RAD = 0.35;

/**
 * Sun elevation (radians) at/below which a family curve reaches its full night
 * grade. Just below the geometric horizon (0) — the night floor owns the look
 * from here down, so the grade holds at its night endpoint through deep night.
 */
export const NIGHT_ELEVATION_RAD = -0.05;

/**
 * A family curve is two endpoints — the identity DAY grade (always 1×/white) and
 * a NIGHT grade — interpolated by a smooth day factor over
 * [`NIGHT_ELEVATION_RAD`, `FULL_DAY_ELEVATION_RAD`]. The night endpoint is the
 * only per-family tuning; the day endpoint is identity for all families so the
 * midday look is shared and preserved.
 */
export interface TodImpostorFamilyCurve {
  /** Exposure multiplier at full night (< 1 dims the card as the sun sets). */
  nightExposureMul: number;
  /** Saturation multiplier at full night (< 1 desaturates toward a muted dusk). */
  nightSaturationMul: number;
  /** Tint multiplier at full night, RGB (warm-biased: r >= g >= b reddens dusk). */
  nightTint: readonly [number, number, number];
}

/**
 * Per-family night endpoints. Defaults chosen so:
 *  - foliage + staticImpostor share a MILD dusk warm/dim (the physical gate + card
 *    low-sun fade already carry most of the low-sun darkening; this is the extra
 *    artistic grade so cards visibly warm with the terrain rather than staying
 *    midday-neutral);
 *  - npc gets a STRONGER low-sun dim (`nightExposureMul` well below the foliage
 *    value). The measured defect (wave L1, PR #490): the npc family OVERSHOT
 *    terrain brightness at low sun (corr 0.717, rangeRatio 3.934) — the sprite's
 *    up-biased card normal over-catches the low warm sun the same way foliage
 *    does, but the readability lift + alert boost in the NPC color chain amplify
 *    it. Dimming the npc grade harder at dusk/night pulls its luminance curve back
 *    onto terrain's, raising correlation and shrinking the range ratio into band.
 *
 * These are the SINGLE source of the per-family divergence; the evaluator applies
 * the identical math to each so the curves stay comparable (brief requirement:
 * "families read it through ONE shared evaluator so curves stay comparable").
 */
export const TOD_IMPOSTOR_FAMILY_CURVES: Record<TodImpostorFamily, TodImpostorFamilyCurve> = {
  foliage: {
    nightExposureMul: 0.82,
    nightSaturationMul: 0.80,
    nightTint: [1.05, 0.99, 0.90],
  },
  staticImpostor: {
    nightExposureMul: 0.82,
    nightSaturationMul: 0.80,
    nightTint: [1.05, 0.99, 0.90],
  },
  npc: {
    // Stronger low-sun dim — the corr-0.717 / rangeRatio-3.934 overshoot fix.
    nightExposureMul: 0.52,
    nightSaturationMul: 0.72,
    nightTint: [1.06, 0.98, 0.88],
  },
};

/**
 * Smooth Hermite step (matches THREE.MathUtils.smoothstep). Inlined so this stays
 * a zero-dependency pure evaluator a fast L1 test can exercise.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Day factor in [0, 1] for a sun elevation: 0 at/below {@link NIGHT_ELEVATION_RAD}
 * (full night grade), 1 at/above {@link FULL_DAY_ELEVATION_RAD} (identity). Smooth
 * and monotonic, so the grade eases between the two endpoints with no pop.
 */
export function todImpostorDayFactor(sunElevationRad: number): number {
  return smoothstep(NIGHT_ELEVATION_RAD, FULL_DAY_ELEVATION_RAD, sunElevationRad);
}

/**
 * Evaluate one family's grade at a sun elevation into `out` (no allocation).
 * `dayFactor == 1` (high sun) always yields identity (1×/white); `dayFactor == 0`
 * (night) yields the family's night endpoint. Shared by all families so their
 * curves are directly comparable.
 */
export function evaluateTodImpostorGrade(
  curve: TodImpostorFamilyCurve,
  dayFactor: number,
  out: TodImpostorGrade,
): TodImpostorGrade {
  const d = Math.min(1, Math.max(0, dayFactor));
  const lerp = (night: number): number => night + (1 - night) * d;
  out.exposureMul = lerp(curve.nightExposureMul);
  out.saturationMul = lerp(curve.nightSaturationMul);
  out.tint.setRGB(lerp(curve.nightTint[0]), lerp(curve.nightTint[1]), lerp(curve.nightTint[2]));
  return out;
}

/**
 * Runtime kill-switch config. Plain mutable object (mirrors `LightingRigConfig`)
 * so a headless capture / dev console can flip it at runtime. Default ON — safe
 * because the curves are identity at midday. OFF freezes the bindings at identity
 * so the card materials shade exactly as construction-time static uniforms did.
 */
export const TodImpostorMappingConfig = {
  enabled: true,
};

/** Window key the config is mirrored onto for headless toggling. */
export const TOD_IMPOSTOR_MAPPING_GLOBAL_KEY = '__todImpostorMapping';

/** True when the per-family TOD grade is applied. Read each frame by the update. */
export function isTodImpostorMappingEnabled(): boolean {
  return TodImpostorMappingConfig.enabled;
}

/**
 * Publish the runtime flag object onto `window` (idempotent). Called once from
 * AtmosphereSystem construction so a capture harness can flip it without a module
 * import (`window.__todImpostorMapping.enabled = false`).
 */
export function publishTodImpostorMappingConfig(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, typeof TodImpostorMappingConfig>)[TOD_IMPOSTOR_MAPPING_GLOBAL_KEY] =
    TodImpostorMappingConfig;
}

/**
 * Shared per-family mapping bindings. Each material reads these `{ value }` slots
 * through `reference('value', type, slot)` — the same one-binding-by-reference
 * pattern the rig uses (`lightingRigBindings`). The update writes `.value` in
 * place each frame; the node graph picks the new values up on the next render
 * without a recompile. `enabled` is a float (0/1) so a TSL branch can read it.
 */
export interface TodImpostorFamilyBinding {
  /** Exposure multiplier (1 at midday / when disabled). */
  exposureMul: { value: number };
  /** Saturation multiplier (1 at midday / when disabled). */
  saturationMul: { value: number };
  /** Tint multiplier color (white at midday / when disabled). */
  tint: { value: THREE.Color };
}

export interface TodImpostorMappingBindings {
  /** 1 when the mapping is active, 0 when the kill-switch is OFF. */
  enabled: { value: number };
  foliage: TodImpostorFamilyBinding;
  staticImpostor: TodImpostorFamilyBinding;
  npc: TodImpostorFamilyBinding;
}

function createFamilyBinding(): TodImpostorFamilyBinding {
  return {
    exposureMul: { value: 1 },
    saturationMul: { value: 1 },
    tint: { value: new THREE.Color(1, 1, 1) },
  };
}

/**
 * Process-wide shared bindings (module singleton, mirroring `lightingRigBindings`).
 * The three card material factories import these directly.
 */
export const todImpostorMappingBindings: TodImpostorMappingBindings = {
  enabled: { value: 1 },
  foliage: createFamilyBinding(),
  staticImpostor: createFamilyBinding(),
  npc: createFamilyBinding(),
};

/** Reusable per-family grade scratch (no per-frame allocation). */
const gradeScratch: Record<TodImpostorFamily, TodImpostorGrade> = {
  foliage: { exposureMul: 1, saturationMul: 1, tint: new THREE.Color(1, 1, 1) },
  staticImpostor: { exposureMul: 1, saturationMul: 1, tint: new THREE.Color(1, 1, 1) },
  npc: { exposureMul: 1, saturationMul: 1, tint: new THREE.Color(1, 1, 1) },
};

const FAMILIES: TodImpostorFamily[] = ['foliage', 'staticImpostor', 'npc'];

function writeFamilyBinding(binding: TodImpostorFamilyBinding, grade: TodImpostorGrade): void {
  binding.exposureMul.value = grade.exposureMul;
  binding.saturationMul.value = grade.saturationMul;
  binding.tint.value.copy(grade.tint);
}

function resetFamilyBinding(binding: TodImpostorFamilyBinding): void {
  binding.exposureMul.value = 1;
  binding.saturationMul.value = 1;
  binding.tint.value.setRGB(1, 1, 1);
}

/**
 * Update the shared mapping bindings for this frame from the sun elevation. Called
 * once per frame by `deriveLightingRigState` (the single rig update point). When
 * the kill-switch is OFF the bindings are pinned to identity so the card materials
 * shade exactly as construction-time static uniforms did. In-place writes only.
 */
export function updateTodImpostorMapping(sunElevationRad: number): void {
  const on = isTodImpostorMappingEnabled();
  todImpostorMappingBindings.enabled.value = on ? 1 : 0;
  if (!on) {
    resetFamilyBinding(todImpostorMappingBindings.foliage);
    resetFamilyBinding(todImpostorMappingBindings.staticImpostor);
    resetFamilyBinding(todImpostorMappingBindings.npc);
    return;
  }
  const dayFactor = todImpostorDayFactor(sunElevationRad);
  for (const family of FAMILIES) {
    const grade = evaluateTodImpostorGrade(TOD_IMPOSTOR_FAMILY_CURVES[family], dayFactor, gradeScratch[family]);
    writeFamilyBinding(todImpostorMappingBindings[family], grade);
  }
}
