// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { IHUDSystem } from '../../types/SystemInterfaces';
import { type Faction, isAlly } from '../combat/types';
import type { IVehicle, VehicleCategory } from './IVehicle';
import type { VehicleManager } from './VehicleManager';

/**
 * Proximity-driven "Press F to board" HUD prompt for drivable ground vehicles,
 * watercraft, and crewable emplacements. Mirrors `FixedWingInteraction.ts` but
 * does not own the F-key entry intent — entry is dispatched through the
 * existing `VehicleSessionController` / per-category player adapters. This
 * class only owns the HUD prompt show/hide signalling.
 *
 * Aircraft (helicopter / fixed_wing) are intentionally skipped because they
 * have dedicated proximity handlers (`HelicopterInteraction`,
 * `FixedWingInteraction`).
 *
 * Cadence: `update(dt)` accumulates time and runs the proximity check at
 * ~10 Hz (see `CHECK_INTERVAL_S`). The check itself is a thin O(N) loop over
 * registered vehicles inside `PROMPT_RADIUS_M` and is safe to call directly
 * from tests via `checkPlayerProximity()`.
 */

export const PROMPT_RADIUS_M = 6;
export const CHECK_INTERVAL_S = 0.1;

type DrivableCategory = Extract<VehicleCategory, 'ground' | 'watercraft' | 'emplacement'>;
type GroundVehicleProximitySource = Pick<VehicleManager, 'getVehiclesInRadius'> & {
  forEachVehicleInRadius?: (
    center: THREE.Vector3,
    radius: number,
    visitor: (vehicle: IVehicle) => void,
  ) => void;
};

const DRIVABLE_CATEGORIES: ReadonlySet<DrivableCategory> = new Set([
  'ground',
  'watercraft',
  'emplacement',
]);

export type VehiclePromptRelation = 'unknown' | 'friendly' | 'enemy';

/**
 * Resolve the per-vehicle copy for the prompt. Matches against vehicle id
 * substrings rather than category alone so we can distinguish M151 / M48
 * (both `ground`) and Sampan / PBR (both `watercraft`).
 *
 * The order matters: PBR sub-mount ids look like `pbr_us_open_frontier_mount_fwd`
 * (category=`emplacement`) — the M2HB branch catches them because they share
 * the `_mount_` substring, but checking PBR first would mis-classify them.
 * The `category === 'emplacement'` filter therefore wins regardless of id
 * substring, and we only fall back to `m151_*` / `pbr_*` after that.
 */
export function resolveVehiclePromptCopy(
  vehicle: IVehicle,
  relation: VehiclePromptRelation = 'unknown',
): string {
  const displayName = resolveVehicleDisplayName(vehicle);
  if (relation === 'enemy') {
    return `Enemy ${displayName} - cannot board`;
  }
  const action = vehicle.category === 'emplacement' ? 'crew' : 'board';
  const suffix = relation === 'friendly' ? ' (friendly)' : '';
  return `Press F to ${action} ${displayName}${suffix}`;
}

function resolveVehicleDisplayName(vehicle: IVehicle): string {
  const id = vehicle.vehicleId;
  if (vehicle.category === 'emplacement') {
    return 'M2HB emplacement';
  }
  if (id.startsWith('m48_') || id.includes('_m48_')) {
    return 'M48 Patton tank';
  }
  // T-54 ids (`t54_tank_of_nva_main_hq`, `t54_tank_ashau_nva_dongso`) share the
  // `ground` category with the M151 jeep, so match the token before the generic
  // ground fall-through below mislabels them as "M151 Jeep".
  if (id.startsWith('t54_') || id.includes('_t54_') || id.includes('t-54')) {
    return 'T-54 Tank';
  }
  if (id.includes('m35')) {
    return 'M35 cargo truck';
  }
  if (id.includes('m113')) {
    return 'M113 APC';
  }
  if (id.includes('zil_157') || id.includes('zil157')) {
    return 'ZIL-157 truck';
  }
  if (id.startsWith('pbr_') || id.includes('_pbr_')) {
    return 'PBR gunboat';
  }
  if (id.startsWith('sampan_') || id.includes('_sampan_')) {
    return 'Sampan';
  }
  // M151 jeeps are registered with feature-derived ids (e.g.
  // `motor_pool_small_m151`), so we match the `_m151` token rather than a
  // strict prefix. Fall through to the generic ground label otherwise.
  if (id.startsWith('m151_') || id.includes('_m151') || vehicle.category === 'ground') {
    return 'M151 Jeep';
  }
  // Final fallback — covers any future watercraft that hasn't been named yet.
  return 'vehicle';
}

interface ProximityCheckerOptions {
  /** Override the 10 Hz cadence (seconds between checks). */
  checkIntervalSeconds?: number;
  /** Override the 6 m radius. */
  promptRadiusMeters?: number;
  /** Optional player faction for friendly/enemy boardability prompts. */
  getPlayerFaction?: () => Faction | null;
}

interface PromptCandidate {
  vehicle: IVehicle;
  relation: VehiclePromptRelation;
  boardable: boolean;
  distanceSq: number;
}

export class GroundVehicleProximityChecker {
  private readonly vehicleManager: GroundVehicleProximitySource;
  private readonly getPlayerPosition: () => THREE.Vector3 | null;
  private readonly isPlayerInVehicle: () => boolean;
  private readonly getPlayerFaction: () => Faction | null;
  private hudSystem: IHUDSystem | null = null;
  private readonly checkIntervalSeconds: number;
  private readonly promptRadiusMeters: number;
  private accumulator = 0;
  private lastShownVehicleId: string | null = null;
  private lastPromptCopy: string | null = null;

  constructor(
    vehicleManager: GroundVehicleProximitySource,
    getPlayerPosition: () => THREE.Vector3 | null,
    isPlayerInVehicle: () => boolean,
    options: ProximityCheckerOptions = {},
  ) {
    this.vehicleManager = vehicleManager;
    this.getPlayerPosition = getPlayerPosition;
    this.isPlayerInVehicle = isPlayerInVehicle;
    this.checkIntervalSeconds = options.checkIntervalSeconds ?? CHECK_INTERVAL_S;
    this.promptRadiusMeters = options.promptRadiusMeters ?? PROMPT_RADIUS_M;
    this.getPlayerFaction = options.getPlayerFaction ?? (() => null);
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
  }

  /**
   * Read the id of the vehicle the prompt is currently advertising, or
   * `null` if no prompt is showing. The boarding factory consumes this
   * to dispatch the F-key intent to the right vehicle without re-running
   * the proximity scan. Stays in sync with `showInteractionPrompt` /
   * `hideInteractionPrompt` calls — when the prompt hides, this reads
   * back as `null`.
   */
  getLastShownVehicleId(): string | null {
    return this.lastShownVehicleId;
  }

  /**
   * Per-frame entry point. Accumulates time and dispatches a single
   * proximity check per `CHECK_INTERVAL_S`. Tests prefer
   * `checkPlayerProximity()` directly to avoid simulating the cadence.
   */
  update(deltaTime: number): void {
    this.accumulator += deltaTime;
    if (this.accumulator < this.checkIntervalSeconds) return;
    this.accumulator = 0;
    this.checkPlayerProximity();
  }

  /**
   * Run the proximity check once. Public for testability and harness use.
   */
  checkPlayerProximity(): void {
    if (!this.hudSystem) return;

    // While the player is seated in any vehicle, suppress the prompt. The
    // next tick after exit (when isPlayerInVehicle flips false) will
    // re-show the prompt if the player is still within range.
    if (this.isPlayerInVehicle()) {
      this.hidePrompt();
      return;
    }

    const playerPos = this.getPlayerPosition();
    if (!playerPos) {
      this.hidePrompt();
      return;
    }

    const candidate = this.findPromptCandidate(playerPos);
    if (!candidate) {
      this.hidePrompt();
      return;
    }

    // Skip flashing the panel if the same vehicle is still nearest.
    const promptCopy = resolveVehiclePromptCopy(candidate.vehicle, candidate.relation);
    const nextShownVehicleId = candidate.boardable ? candidate.vehicle.vehicleId : null;
    if (this.lastPromptCopy === promptCopy) {
      this.lastShownVehicleId = nextShownVehicleId;
      return;
    }

    this.lastShownVehicleId = nextShownVehicleId;
    this.lastPromptCopy = promptCopy;
    this.hudSystem.showInteractionPrompt(promptCopy);
  }

  private findPromptCandidate(playerPos: THREE.Vector3): PromptCandidate | null {
    let bestBoardable: PromptCandidate | null = null;
    let bestEnemy: PromptCandidate | null = null;
    const considerVehicle = (vehicle: IVehicle): void => {
      if (!DRIVABLE_CATEGORIES.has(vehicle.category as DrivableCategory)) return;
      if (vehicle.isDestroyed()) return;
      // getPosition() allocates a Vector3 in current IVehicle impls; we
      // accept the small per-tick cost (≤ N candidates at 10 Hz).
      const vehiclePos = vehicle.getPosition();
      const dx = vehiclePos.x - playerPos.x;
      const dz = vehiclePos.z - playerPos.z;
      const distanceSq = dx * dx + dz * dz;
      const relation = this.resolveRelation(vehicle);
      const boardable = relation !== 'enemy';
      const candidate: PromptCandidate = {
        vehicle,
        relation,
        boardable,
        distanceSq,
      };
      if (boardable) {
        if (!bestBoardable || distanceSq < bestBoardable.distanceSq) {
          bestBoardable = candidate;
        }
      } else if (!bestEnemy || distanceSq < bestEnemy.distanceSq) {
        bestEnemy = candidate;
      }
    };

    if (this.vehicleManager.forEachVehicleInRadius) {
      this.vehicleManager.forEachVehicleInRadius(
        playerPos,
        this.promptRadiusMeters,
        considerVehicle,
      );
    } else {
      const candidates = this.vehicleManager.getVehiclesInRadius(
        playerPos,
        this.promptRadiusMeters,
      );
      for (const vehicle of candidates) {
        considerVehicle(vehicle);
      }
    }
    return bestBoardable ?? bestEnemy;
  }

  private resolveRelation(vehicle: IVehicle): VehiclePromptRelation {
    const playerFaction = this.getPlayerFaction();
    if (!playerFaction) return 'unknown';
    return isAlly(playerFaction, vehicle.faction) ? 'friendly' : 'enemy';
  }

  private hidePrompt(): void {
    if (this.lastPromptCopy === null) return;
    this.lastShownVehicleId = null;
    this.lastPromptCopy = null;
    this.hudSystem?.hideInteractionPrompt();
  }
}
