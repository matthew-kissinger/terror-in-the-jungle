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

/** Pixel Forge NPC visual scale shared by close GLBs and animated impostors. */
export const NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER = 1.5;

/** Raw Pixel Forge NPC impostor/model target height before runtime scale. */
export const NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT = 2.95;

/** Runtime Pixel Forge NPC visual height used by rendering and hit proxies. */
export const NPC_PIXEL_FORGE_VISUAL_HEIGHT =
  NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT * NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER;

/** Default NPC health and max health. */
export const NPC_HEALTH = 100;

/** Probability that OPFOR NPC spawns as objective-focused (0-1). */
export const OPFOR_OBJECTIVE_FOCUS_CHANCE = 0.4;
