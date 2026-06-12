// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GameMode } from './gameModeTypes';
import { AnimalModels } from '../systems/assets/modelPaths';

/**
 * Ambient wildlife tuning (cycle-2026-06-11-war-asset-repaint,
 * ambient-wildlife-mvp). First-life-in-the-jungle MVP: a handful of ground
 * animals that wander and flee the player. Values here are tuning constants —
 * keep behavior assertions in tests on observable outcomes, not these numbers.
 *
 * Perf posture: the roster is intentionally tiny and the cadence is low. Each
 * species is a single merged GLB (importer guarantees merge-safe buffers, no
 * skinned animation), so one active animal is ~one draw call. Combat-stress
 * harnesses (combat120 / AI Sandbox) are NOT in ALLOWED_MODES, so wildlife
 * never competes with the 120-NPC render path.
 */

/** A spawnable ground-animal species drawn from the war-asset `animals` class. */
export interface WildlifeSpecies {
  readonly id: string;
  /** GLB path relative to public/models/ (importer-normalized, +Z forward). */
  readonly modelPath: string;
  /** Uniform display scale applied on top of the model's real-meter size. */
  readonly displayScale: number;
  /** Base wander speed in meters/second. */
  readonly wanderSpeed: number;
  /** Flee speed multiplier applied to wander speed during a flee burst. */
  readonly fleeSpeedMultiplier: number;
}

/**
 * MVP roster: four iconic ground animals. Birds, reptiles, and the gibbon stay
 * catalog/gallery-only this cycle (see brief Non-goals). Buffalo is the slow
 * heavyweight; the macaque is the small skittish one.
 */
export const WILDLIFE_ROSTER: readonly WildlifeSpecies[] = [
  { id: 'tiger', modelPath: AnimalModels.TIGER, displayScale: 1.0, wanderSpeed: 1.6, fleeSpeedMultiplier: 4.0 },
  { id: 'water-buffalo', modelPath: AnimalModels.WATER_BUFFALO, displayScale: 1.0, wanderSpeed: 0.8, fleeSpeedMultiplier: 2.6 },
  { id: 'wild-boar', modelPath: AnimalModels.WILD_BOAR, displayScale: 1.0, wanderSpeed: 1.3, fleeSpeedMultiplier: 3.4 },
  { id: 'macaque', modelPath: AnimalModels.MACAQUE, displayScale: 1.0, wanderSpeed: 1.1, fleeSpeedMultiplier: 4.2 },
] as const;

/** Modes that get ambient wildlife. Combat-stress harnesses are excluded. */
export const WILDLIFE_ALLOWED_MODES: readonly GameMode[] = [
  GameMode.OPEN_FRONTIER,
  GameMode.A_SHAU_VALLEY,
] as const;

export const WILDLIFE_CONFIG = {
  /** Maximum simultaneously active animals across the whole map. */
  maxActive: 8,
  /** Simulation cadence (seconds) — wildlife runs cold, not per-frame. */
  updateIntervalSeconds: 1 / 6,

  /** Keep animals clear of objectives/bases by at least this many meters. */
  objectiveExclusionM: 150,
  /** Do not spawn an animal closer than this to the player. */
  minPlayerSpawnDistanceM: 80,
  /** Spawn animals within this radius of the player (so they are observable). */
  maxPlayerSpawnDistanceM: 220,
  /** Despawn an animal once it drifts beyond this distance from the player. */
  despawnDistanceM: 300,

  /** Player closer than this triggers (latches) a flee escape. */
  fleeTriggerDistanceM: 25,
  /** Once a fleeing animal reaches this distance from the player, fade + despawn. */
  fleeDespawnDistanceM: 90,

  /** Heading drift per second (radians) during idle wander. */
  wanderTurnRateRad: 0.6,
  /**
   * Slope rejection: candidate spawn / step targets steeper than this terrain
   * gradient are skipped so animals stay on walkable ground, not cliff faces.
   */
  maxWalkableSlope: 0.9,

  /** Spawn attempts per cadence tick when below the active cap. */
  spawnAttemptsPerTick: 1,
  /** Rejected-candidate retries inside a single spawn attempt. */
  spawnCandidateTries: 6,
} as const;
