// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared NPC constants used across multiple combat/navigation files.
 *
 * Single-file constants belong at the top of their own module.
 * Only values referenced in 2+ files live here.
 */

/**
 * NPC logical position height above terrain surface.
 *
 * Player position is camera/eye height, so NPCs use the same eye-level anchor.
 * Rendering, hit zones, LOS, muzzle flashes, and navmesh terrain queries must
 * derive from this anchor instead of adding independent "soldier height" values.
 */
export const NPC_Y_OFFSET = 2.2;

/** NPC muzzle offset relative to the eye-level actor anchor. */
export const NPC_MUZZLE_Y_OFFSET = -0.15;

/** NPC center-mass offset relative to the eye-level actor anchor. */
export const NPC_CENTER_MASS_Y_OFFSET = -0.6;

/** Player center-mass offset relative to the camera/eye actor anchor. */
export const PLAYER_CENTER_MASS_Y_OFFSET = -0.6;

/** Generic standing actor eye offset relative to an eye-level actor anchor. */
export const ACTOR_EYE_Y_OFFSET = 0;

/** Maximum NPC movement speed (m/s). Navmesh paths handle navigation; this is raw locomotion speed. */
export const NPC_MAX_SPEED = 6;

/**
 * Pixel Forge NPC visual scale shared by close GLBs and animated impostors.
 *
 * Keep the absolute actor target on the reviewed Pixel Forge base height.
 * Runtime readability is handled by material/crop policy, not by inflating the
 * actor above the package acceptance scale.
 */
export const NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER = 1.0;

/** Raw Pixel Forge NPC impostor/model target height before runtime scale. */
export const NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT = 2.95;

/** Runtime Pixel Forge NPC visual height used by rendering and hit proxies. */
export const NPC_PIXEL_FORGE_VISUAL_HEIGHT =
  NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT * NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER;

/** Default NPC health and max health. */
export const NPC_HEALTH = 100;

/** Probability that OPFOR NPC spawns as objective-focused (0-1). */
export const OPFOR_OBJECTIVE_FOCUS_CHANCE = 0.4;

/**
 * Live-tunable LOD/perception knobs covering distant-NPC freeze and squad/stuck
 * deadlock breakers (see docs/tasks/npc-unfreeze-and-stuck.md).
 *
 * Plain mutable object so the live-tuning Tweakpane panel can write through
 * directly. Do NOT freeze.
 */
export const NpcLodConfig = {
  /** Integrate cached velocity on visual-only LOD ticks so distant NPCs do not freeze between full updates. */
  visualOnlyIntegrateVelocity: true,
  /** Squared speed below which we treat the NPC as not moving (0.2 m/s)^2. */
  idleEpsilonSq: 0.04,
  /** Max time (ms) a follower can sit in `isRejoiningSquad` before falling back to normal patrol. */
  rejoinTimeoutMs: 5000,
  /** Max time (ms) a follower clamps to its leader's idle stance before re-evaluating its own goal. */
  squadFollowStaleMs: 4000,
  /** Distant culled-bucket simulation interval (ms). Lower = more frequent but more cost. */
  culledDistantSimIntervalMs: 8000,
  /**
   * When a high-LOD NPC escalates to the terminal "hold" recovery (repeated
   * backtracks against an unreachable goal) inside a dense friendly crowd,
   * send it to a dispersed point away from the local crowd centroid and delay
   * its next objective re-evaluation, instead of re-targeting the same
   * contested point and rejoining the crush. Reduces the convergence-time
   * terrain-stall storm. Default on; gated so it can be A/B'd in a playtest.
   *
   * Known limitation: a squad *follower* with a live leader is re-pointed at the
   * leader's destination by updatePatrolMovement on the next tick (before the
   * delayed re-eval gate), so dispersal sticks for leaders + leaderless
   * followers but is a no-op for led followers. The leader's dispersal still
   * pulls its squad out of the crush. A follower-hold refinement is deferred to
   * the playtest follow-up. See docs/state/perf-trust.md (2026-06-01 fix).
   */
  stallDispersalEnabled: true,
  /**
   * Stagger the full terrain-aware movement solve for high-LOD NPCs that are
   * contour-stalled AND packed in a friendly crowd, coasting on the off-ticks
   * (skipping the spacing grid query + terrain-aware contour solve). Bounds the
   * worst-case per-frame movement cost at point-blank convergence — the combat-
   * side p99 lever for DEFEKT-3 (the bad frame's Combat term is the convergence
   * terrain-stall storm, per docs/rearch/COMBAT_AI_P99_SPIKE_2026-06-03.md).
   *
   * Default ON as of cycle-combat-p99-attribution (2026-06-03). It only ever
   * arms for an NPC that is BOTH contour-stalled AND in a measurable friendly
   * crowd (spacing force above NPC_STALL_DISPERSAL_MIN_FORCE_SQ), so an isolated
   * or freely-moving NPC never coasts and cannot micro-stutter; the staggered
   * NPC still integrates its existing velocity + re-grounds on the coast tick.
   * A coast happens at most every other tick (50% cadence) and recovery
   * detectors work on >=600ms windows, so escalation is unaffected. Movement-
   * feel sign-off is tracked in docs/PLAYTEST_PENDING.md; set false to revert.
   */
  crowdStallStaggerEnabled: true,
};
