import * as THREE from 'three';
import { Combatant, Faction, ITargetable } from '../types';
import type { ITerrainRuntime } from '../../../types/SystemInterfaces';
import { SandbagSystem } from '../../weapons/SandbagSystem';
import { SmokeCloudSystem } from '../../effects/SmokeCloudSystem';
import { ISpatialQuery } from '../SpatialOctree';
import { AITargetAcquisition, type TargetAcquisitionTelemetry } from './AITargetAcquisition';
import { AILineOfSight } from './AILineOfSight';
import { AICoverFinding } from './AICoverFinding';

type AiMethodTimer = <T>(name: string, fn: () => T) => T;

/**
 * Handles target acquisition, line of sight checks, and cover finding
 * Delegates to specialized modules for each concern
 */
export class AITargeting {
  private terrainSystem?: ITerrainRuntime;
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

  setMethodTimer(timer: AiMethodTimer): void {
    this.coverFinding.setMethodTimer(timer);
  }

  beginFrame(): void {
    this.targetAcquisition.beginFrame();
    this.coverFinding.beginFrame();
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
    this.lineOfSight.setTerrainSystem(terrainSystem);
    this.coverFinding.setTerrainSystem(terrainSystem);
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
    this.lineOfSight.setSandbagSystem(sandbagSystem);
    this.coverFinding.setSandbagSystem(sandbagSystem);
  }

  setSmokeCloudSystem(smokeCloudSystem: SmokeCloudSystem): void {
    this.lineOfSight.setSmokeCloudSystem(smokeCloudSystem);
  }

  setPlayerFaction(faction: Faction): void {
    this.targetAcquisition.setPlayerFaction(faction);
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
  ): ITargetable | null {
    return this.targetAcquisition.findNearestEnemy(
      combatant,
      playerPosition,
      allCombatants,
      spatialGrid
    );
  }

  canSeeTarget(
    combatant: Combatant,
    target: ITargetable,
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

  getClusterDensity(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): number {
    return this.targetAcquisition.getClusterDensity(combatant, allCombatants, spatialGrid);
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

  getTargetAcquisitionTelemetry(): TargetAcquisitionTelemetry {
    return this.targetAcquisition.getTelemetry();
  }
}
