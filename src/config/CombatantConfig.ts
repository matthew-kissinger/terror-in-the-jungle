/**
 * Shared NPC constants used across multiple combat/navigation files.
 *
 * Single-file constants belong at the top of their own module.
 * Only values referenced in 2+ files live here.
 */

/** NPC eye-height offset above terrain surface (meters). */
export const NPC_Y_OFFSET = 3;

/** Maximum NPC movement speed (m/s). Navmesh paths handle navigation; this is raw locomotion speed. */
export const NPC_MAX_SPEED = 8;

/** Default NPC health and max health. */
export const NPC_HEALTH = 100;

/** Probability that OPFOR NPC spawns as objective-focused (0-1). */
export const OPFOR_OBJECTIVE_FOCUS_CHANCE = 0.4;
