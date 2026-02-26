import * as THREE from 'three';
import { Combatant } from '../types';
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../../weapons/SandbagSystem';
import { SmokeCloudSystem } from '../../effects/SmokeCloudSystem';
import { ISpatialQuery } from '../SpatialOctree';
import { AITargetAcquisition } from './AITargetAcquisition';
import { AILineOfSight } from './AILineOfSight';
import { AICoverFinding } from './AICoverFinding';

/**
 * Handles target acquisition, line of sight checks, and cover finding
 * Delegates to specialized modules for each concern
 */
export class AITargeting {
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;

  // Extracted modules
  private targetAcquisition: AITargetAcquisition;
  private lineOfSight: AILineOfSight;
  private coverFinding: AICoverFinding;

  constructor() {
    this.targetAcquisition = new AITargetAcquisition();
    this.lineOfSight = new AILineOfSight();
    this.coverFinding = new AICoverFinding();
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
    this.lineOfSight.setChunkManager(chunkManager);
    this.coverFinding.setChunkManager(chunkManager);
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
    this.lineOfSight.setSandbagSystem(sandbagSystem);
    this.coverFinding.setSandbagSystem(sandbagSystem);
  }

  setSmokeCloudSystem(smokeCloudSystem: SmokeCloudSystem): void {
    this.lineOfSight.setSmokeCloudSystem(smokeCloudSystem);
  }

  /**
   * Clear the LOS cache. Call once per frame.
   */
  clearLOSCache(): void {
    this.lineOfSight.clearCache();
  }

  findNearestEnemy(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): Combatant | null {
    return this.targetAcquisition.findNearestEnemy(
      combatant,
      playerPosition,
      allCombatants,
      spatialGrid
    );
  }

  canSeeTarget(
    combatant: Combatant,
    target: Combatant,
    playerPosition: THREE.Vector3
  ): boolean {
    return this.lineOfSight.canSeeTarget(combatant, target, playerPosition);
  }

  shouldEngage(combatant: Combatant, distance: number): boolean {
    return this.targetAcquisition.shouldEngage(combatant, distance);
  }

  countNearbyEnemies(
    combatant: Combatant,
    radius: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): number {
    return this.targetAcquisition.countNearbyEnemies(
      combatant,
      radius,
      playerPosition,
      allCombatants,
      spatialGrid
    );
  }

  shouldSeekCover(combatant: Combatant): boolean {
    return this.coverFinding.shouldSeekCover(combatant);
  }

  findNearestCover(combatant: Combatant, threatPosition: THREE.Vector3): THREE.Vector3 | null {
    return this.coverFinding.findNearestCover(combatant, threatPosition);
  }

  isCoverFlanked(combatant: Combatant, threatPos: THREE.Vector3): boolean {
    return this.coverFinding.isCoverFlanked(combatant, threatPos);
  }
}
