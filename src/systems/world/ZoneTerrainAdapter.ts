import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// Validation knobs for post-placement nudge (A Shau pilot). Conservative defaults.
const ZONE_VALIDATE_MAX_SLOPE = 0.25;
const ZONE_VALIDATE_DITCH_THRESHOLD_M = 4;
const ZONE_VALIDATE_RING_RADIUS_M = 25;
const ZONE_VALIDATE_RING_SAMPLES = 8;
const ZONE_VALIDATE_NUDGE_DISTANCES_M = [15, 30, 45];
const ZONE_VALIDATE_NUDGE_DIRECTIONS = 12;
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
      const distance = searchRadius * (0.5 + Math.random() * 0.5);
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
