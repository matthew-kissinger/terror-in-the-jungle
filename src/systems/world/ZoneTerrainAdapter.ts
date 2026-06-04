// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { SeededRandom } from '../../core/SeededRandom';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// Validation knobs for post-placement nudge (A Shau pilot). Conservative defaults.
const ZONE_VALIDATE_MAX_SLOPE = 0.25;
const ZONE_VALIDATE_DITCH_THRESHOLD_M = 4;
const ZONE_VALIDATE_RING_RADIUS_M = 25;
const ZONE_VALIDATE_RING_SAMPLES = 8;
// Denser, wider search so the validator can climb out of a steep-walled ditch:
// the near rings can land on the rim wall (still steep / still below the plateau),
// so we keep probing out to 70 m at ~6 m steps and 16 directions to reach the
// surrounding flat plateau. Stamp-less capture zones rely on this escape path.
const ZONE_VALIDATE_NUDGE_DISTANCES_M = [12, 18, 24, 30, 36, 45, 55, 70];
const ZONE_VALIDATE_NUDGE_DIRECTIONS = 16;
const ZONE_VALIDATE_HEIGHT_FUDGE_M = 1;

export interface ValidateAndNudgeOptions {
  maxSlope?: number;
  ditchThresholdM?: number;
  zoneLabel?: string;
}

export class ZoneTerrainAdapter {
  private terrainSystem?: ITerrainRuntime;

  constructor() {
    // Zone placement requires the live terrain runtime height authority.
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
  }

  private requireTerrainSystem(): ITerrainRuntime {
    if (!this.terrainSystem) {
      throw new Error('ZoneTerrainAdapter requires terrainSystem before terrain queries');
    }
    return this.terrainSystem;
  }

  findSuitableZonePosition(desiredPosition: THREE.Vector3, searchRadius: number): THREE.Vector3 {
    const terrainSystem = this.requireTerrainSystem();

    let bestPosition = desiredPosition.clone();
    let bestSlope = Infinity;
    const sampleCount = 12;

    // Test the desired position first
    const centerHeight = terrainSystem.getHeightAt(desiredPosition.x, desiredPosition.z);
    const centerSlope = this.calculateTerrainSlope(desiredPosition.x, desiredPosition.z);
    bestPosition.y = centerHeight;
    bestSlope = centerSlope;

    // Search in a spiral pattern for flatter terrain
    for (let i = 0; i < sampleCount; i++) {
      const angle = (i / sampleCount) * Math.PI * 2;
      // SeededRandom.random() falls back to Math.random() off the replay/test
      // path, so production placement is unchanged but L3 tests are deterministic.
      const distance = searchRadius * (0.5 + SeededRandom.random() * 0.5);
      const testX = desiredPosition.x + Math.cos(angle) * distance;
      const testZ = desiredPosition.z + Math.sin(angle) * distance;

      const height = terrainSystem.getHeightAt(testX, testZ);
      const slope = this.calculateTerrainSlope(testX, testZ);

      // Prefer flatter terrain (lower slope) and avoid water
      if (slope < bestSlope && height > -2) {
        bestSlope = slope;
        bestPosition = new THREE.Vector3(testX, height, testZ);
      }
    }

    Logger.info('world', `Zone placed at (${bestPosition.x.toFixed(1)}, ${bestPosition.y.toFixed(1)}, ${bestPosition.z.toFixed(1)}) with slope ${bestSlope.toFixed(2)}`);

    return bestPosition;
  }

  /**
   * Validate a zone position against slope and ditch heuristics; if it fails,
   * search neighbouring cells for a flatter, not-significantly-lower spot and
   * return the nudged position. If no better candidate exists within the
   * configured search ring, returns the original position unchanged (warns).
   * Designed for post-placement correction of hand-authored A Shau zones.
   */
  validateAndNudge(
    desiredPosition: THREE.Vector3,
    options: ValidateAndNudgeOptions = {}
  ): THREE.Vector3 {
    const terrainSystem = this.requireTerrainSystem();
    const maxSlope = options.maxSlope ?? ZONE_VALIDATE_MAX_SLOPE;
    const ditchThresholdM = options.ditchThresholdM ?? ZONE_VALIDATE_DITCH_THRESHOLD_M;
    const label = options.zoneLabel ?? 'zone';
    const centerX = desiredPosition.x;
    const centerZ = desiredPosition.z;

    // Readiness guard (mirrors SpawnPositionCalculator.canUseTerrainAt): never
    // nudge against unready/unstamped terrain. If the height field is not yet
    // resolved here, the ditch/slope heuristics would read transient base-DEM
    // values and drag the zone OFF a flatten pad that has not landed yet. Bail
    // and leave the authored position untouched (do NOT even snap Y, since the
    // height read would be stale). Stub terrains without the optional readiness
    // methods are treated as ready so unit tests stay simple.
    if (!this.isTerrainReadyAt(terrainSystem, centerX, centerZ)) {
      Logger.info('world', `Zone "${label}" validation skipped: terrain not ready at (${centerX.toFixed(1)}, ${centerZ.toFixed(1)})`);
      return desiredPosition.clone();
    }

    const centerHeight = terrainSystem.getHeightAt(centerX, centerZ);
    const centerSlope = this.calculateTerrainSlope(centerX, centerZ);
    const ringMean = this.sampleRingMeanHeight(centerX, centerZ, ZONE_VALIDATE_RING_RADIUS_M, ZONE_VALIDATE_RING_SAMPLES);
    const tooSteep = centerSlope > maxSlope;
    const inDitch = centerHeight < ringMean - ditchThresholdM;

    if (!tooSteep && !inDitch) {
      return new THREE.Vector3(centerX, centerHeight, centerZ);
    }

    const reason = inDitch
      ? `ditch (drop=${(ringMean - centerHeight).toFixed(1)} m)`
      : `slope=${centerSlope.toFixed(2)}`;

    // Score: slope dominates; in-ditch cases get a height-deficit penalty so
    // the validator climbs back to plateau level instead of resting on the
    // ditch floor (where slope is also flat). Seed with the center + epsilon.
    const heightFloor = centerHeight - ZONE_VALIDATE_HEIGHT_FUDGE_M;
    let bestCandidate: THREE.Vector3 | null = null;
    let bestScore = this.scoreCandidate(centerSlope, centerHeight, centerHeight, inDitch) + 1e-6;

    for (const distance of ZONE_VALIDATE_NUDGE_DISTANCES_M) {
      for (let i = 0; i < ZONE_VALIDATE_NUDGE_DIRECTIONS; i++) {
        const angle = (i / ZONE_VALIDATE_NUDGE_DIRECTIONS) * Math.PI * 2;
        const testX = centerX + Math.cos(angle) * distance;
        const testZ = centerZ + Math.sin(angle) * distance;
        const testHeight = terrainSystem.getHeightAt(testX, testZ);
        const testSlope = this.calculateTerrainSlope(testX, testZ);
        if (testHeight < heightFloor) continue;
        if (testSlope > maxSlope) continue;
        const score = this.scoreCandidate(testSlope, testHeight, centerHeight, inDitch);
        if (score >= bestScore) continue;
        bestScore = score;
        bestCandidate = new THREE.Vector3(testX, testHeight, testZ);
      }
    }

    if (bestCandidate) {
      Logger.info(
        'world',
        `Zone "${label}" nudged (${centerX.toFixed(1)}, ${centerHeight.toFixed(1)}, ${centerZ.toFixed(1)}) -> ` +
          `(${bestCandidate.x.toFixed(1)}, ${bestCandidate.y.toFixed(1)}, ${bestCandidate.z.toFixed(1)}) [${reason}]`
      );
      return bestCandidate;
    }

    Logger.warn('world', `Zone "${label}" failed validation [${reason}], no flatter candidate within ${ZONE_VALIDATE_NUDGE_DISTANCES_M[ZONE_VALIDATE_NUDGE_DISTANCES_M.length - 1]} m`);
    return new THREE.Vector3(centerX, centerHeight, centerZ);
  }

  /**
   * Whether terrain (including stamps) is resolved at this point. Mirrors
   * SpawnPositionCalculator.canUseTerrainAt. Optional methods absent on bare
   * test stubs are treated as "ready" so L2 unit tests need only `getHeightAt`.
   */
  private isTerrainReadyAt(terrainSystem: ITerrainRuntime, x: number, z: number): boolean {
    if (typeof terrainSystem.isTerrainReady === 'function' && !terrainSystem.isTerrainReady()) {
      return false;
    }
    if (typeof terrainSystem.isAreaReadyAt === 'function' && !terrainSystem.isAreaReadyAt(x, z)) {
      return false;
    }
    if (typeof terrainSystem.hasTerrainAt === 'function' && !terrainSystem.hasTerrainAt(x, z)) {
      return false;
    }
    return true;
  }

  private scoreCandidate(slope: number, height: number, centerHeight: number, inDitch: boolean): number {
    if (!inDitch) return slope;
    // 0.05/m: clearly-flatter candidate at same height still wins; climbing
    // out of a 4 m+ ditch dominates a slope-tie.
    return slope + (centerHeight - height) * 0.05;
  }

  private sampleRingMeanHeight(x: number, z: number, radius: number, samples: number): number {
    const terrainSystem = this.requireTerrainSystem();
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      sum += terrainSystem.getHeightAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius);
    }
    return sum / samples;
  }

  private calculateTerrainSlope(x: number, z: number): number {
    const terrainSystem = this.requireTerrainSystem();
    const sampleDistance = 5;
    const centerHeight = terrainSystem.getHeightAt(x, z);

    // Sample heights in 4 directions
    const northHeight = terrainSystem.getHeightAt(x, z + sampleDistance);
    const southHeight = terrainSystem.getHeightAt(x, z - sampleDistance);
    const eastHeight = terrainSystem.getHeightAt(x + sampleDistance, z);
    const westHeight = terrainSystem.getHeightAt(x - sampleDistance, z);

    // Calculate maximum height difference (slope)
    const maxDifference = Math.max(
      Math.abs(northHeight - centerHeight),
      Math.abs(southHeight - centerHeight),
      Math.abs(eastHeight - centerHeight),
      Math.abs(westHeight - centerHeight)
    );

    return maxDifference / sampleDistance;
  }

  getTerrainHeight(x: number, z: number): number {
    return this.requireTerrainSystem().getHeightAt(x, z);
  }

}
