import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import { Alliance, getAlliance, getEnemyAlliance } from '../combat/types';
import { ZoneState, type CaptureZone } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import type { ITerrainRuntime, IZoneQuery } from '../../types/SystemInterfaces';
import type { WarSimulator } from '../strategy/WarSimulator';
import type { HelipadSystem } from '../helicopter/HelipadSystem';
import type { LoadoutService } from './LoadoutService';
import {
  resolveInitialSpawnPosition,
  resolveRespawnFallbackPosition
} from '../world/runtime/ModeSpawnResolver';
import type { DeploySessionModel } from '../world/runtime/DeployFlowSession';
import { GameMode } from '../../config/gameModeTypes';
import type { RespawnSpawnPoint } from './RespawnSpawnPoint';
import type { DeploySessionKind } from '../world/runtime/DeployFlowSession';

const HELIPAD_INFANTRY_STANDOFF_METERS = 12;

/**
 * Encapsulates all spawn point selection logic: gathering available spawn
 * points from zones/helipads/insertions, filtering by alliance, sorting by
 * priority, and resolving preferred/policy-driven spawn positions.
 *
 * Extracted from PlayerRespawnManager to keep that class focused on respawn
 * lifecycle, UI management, and deploy flow orchestration.
 */
export class SpawnPointSelector {
  private zoneQuery?: IZoneQuery;
  private gameModeManager?: GameModeManager;
  private warSimulator?: WarSimulator;
  private terrainSystem?: ITerrainRuntime;
  private helipadSystem?: HelipadSystem;
  private loadoutService?: LoadoutService;

  // --- Dependency setters ------------------------------------------------

  setZoneManager(query: IZoneQuery): void {
    this.zoneQuery = query;
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
  }

  setWarSimulator(warSimulator: WarSimulator): void {
    this.warSimulator = warSimulator;
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
  }

  setHelipadSystem(helipadSystem: HelipadSystem): void {
    this.helipadSystem = helipadSystem;
  }

  setLoadoutService(loadoutService: LoadoutService): void {
    this.loadoutService = loadoutService;
  }

  // --- Public API --------------------------------------------------------

  getSpawnableZones(): Array<{ id: string; name: string; position: THREE.Vector3 }> {
    if (!this.zoneQuery) {
      return [];
    }

    // Check if game mode allows spawning at zones
    const canSpawnAtZones = this.gameModeManager?.canPlayerSpawnAtZones() ?? false;
    const playerAlliance = this.getCurrentAlliance();

    const zones = this.zoneQuery.getAllZones().filter(z => {
      return this.isZoneSpawnableForAlliance(z, playerAlliance, canSpawnAtZones);
    });

    Logger.info('player', ` Found ${zones.length} spawnable zones:`, zones.map(z => `${z.name} (${z.state})`));

    return zones.map(z => ({
      id: z.id,
      name: z.name,
      position: z.position.clone()
    }));
  }

  canSpawnAtZone(): boolean {
    if (!this.zoneQuery || !this.gameModeManager) return false;

    // Check if game mode allows spawning at zones
    if (!this.gameModeManager.canPlayerSpawnAtZones()) {
      return false;
    }

    const zones = this.zoneQuery.getAllZones();
    const playerAlliance = this.getCurrentAlliance();
    return zones.some(zone => this.isZoneSpawnableForAlliance(zone, playerAlliance, true) && !zone.isHomeBase);
  }

  /**
   * Builds a fresh list of available spawn points from zones, helipads, and
   * insertion markers, filtered by the player's alliance and current deploy
   * flow state.
   */
  buildAvailableSpawnPoints(
    deploySession: DeploySessionModel | undefined,
    activeDeployFlowKind: DeploySessionKind | null
  ): RespawnSpawnPoint[] {
    if (!this.zoneQuery) {
      return [{
        id: 'default',
        name: 'Base',
        position: new THREE.Vector3(0, 5, -50),
        safe: true,
        kind: 'default',
        selectionClass: 'default',
      }];
    }

    const definition = this.gameModeManager?.getCurrentDefinition?.();
    const canSpawnAtZones = this.gameModeManager?.canPlayerSpawnAtZones() ?? false;
    const zones = this.zoneQuery.getAllZones();
    const playerAlliance = this.getCurrentAlliance();

    const spawnPoints: RespawnSpawnPoint[] = zones
      .filter(z => {
        return this.isZoneSpawnableForAlliance(z, playerAlliance, canSpawnAtZones);
      })
      .map(z => ({
        id: z.id,
        name: z.name,
        position: z.position.clone(),
        safe: true,
        kind: z.isHomeBase ? 'home_base' : 'zone',
        selectionClass: z.isHomeBase ? 'home_base' : 'nearest_controlled_zone',
        sourceZoneId: z.id,
      }));

    // Append helipad spawn points for BLUFOR players. During initial deploy,
    // runtime helipad instances may not exist yet, so fall back to mode config.
    if (playerAlliance === Alliance.BLUFOR) {
      const runtimeHelipads = this.helipadSystem?.getAllHelipads() ?? [];
      const configuredHelipads = this.gameModeManager?.getCurrentConfig().helipads ?? [];
      const helipadCandidates = runtimeHelipads.length > 0
        ? runtimeHelipads.map(hp => ({
            id: hp.id,
            name: `Helipad: ${hp.aircraft.replace(/_/g, ' ')}`,
            position: this.getHelipadInfantrySpawnPosition(hp.position),
            aircraft: hp.aircraft,
          }))
        : configuredHelipads.map(hp => ({
            id: hp.id,
            name: `Helipad: ${hp.aircraft.replace(/_/g, ' ')}`,
            position: this.getHelipadInfantrySpawnPosition(hp.position),
            aircraft: hp.aircraft,
          }));

      for (const hp of helipadCandidates) {
        const alreadyListed = spawnPoints.some(sp => sp.id === hp.id);
        if (!alreadyListed) {
          spawnPoints.push({
            id: hp.id,
            name: hp.name,
            position: hp.position.clone(),
            safe: true,
            kind: 'helipad',
            selectionClass: 'helipad',
            priority: this.getHelipadSpawnPriority(hp.id, hp.aircraft),
          });
        }
      }
    }

    if (
      definition
      && deploySession?.flow === 'air_assault'
      && activeDeployFlowKind === 'initial'
    ) {
      const insertionTarget = resolveInitialSpawnPosition(definition, playerAlliance);
      if (!this.terrainSystem || this.terrainSystem.hasTerrainAt(insertionTarget.x, insertionTarget.z)) {
        spawnPoints.push({
          id: 'direct_insertion',
          name: 'Tactical Insertion',
          position: insertionTarget,
          safe: false,
          kind: 'insertion',
          selectionClass: 'direct_insertion',
          priority: 100,
        });
      }
    }

    const sorted = this.sortSpawnPointsByPriority(spawnPoints);

    if (sorted.length === 0) {
      return [{
        id: 'default',
        name: 'Base',
        position: new THREE.Vector3(0, 5, -50),
        safe: true,
        kind: 'default',
        selectionClass: 'default',
      }];
    }

    return sorted;
  }

  /**
   * Returns the best default spawn point given the current mode definition,
   * deploy flow, and available spawn points.
   */
  getPreferredDeploySpawnPoint(
    availableSpawnPoints: RespawnSpawnPoint[],
    activeDeployFlowKind: DeploySessionKind | null
  ): RespawnSpawnPoint | undefined {
    if (availableSpawnPoints.length === 0) {
      return undefined;
    }

    const definition = this.gameModeManager?.getCurrentDefinition?.();
    if (!definition) {
      return availableSpawnPoints[0];
    }

    // In frontier mode, prefer helipad spawns so player starts near aircraft
    if (definition.policies.deploy.flow === 'frontier') {
      const helipadSpawn = this.sortSpawnPointsByPriority(
        availableSpawnPoints.filter(sp => sp.kind === 'helipad')
      )[0];
      if (helipadSpawn) return helipadSpawn;
    }

    if (definition.policies.deploy.flow === 'air_assault' && activeDeployFlowKind === 'initial') {
      const directInsertion = availableSpawnPoints.find(sp => sp.selectionClass === 'direct_insertion');
      if (directInsertion) {
        return directInsertion;
      }
    }

    const target = resolveInitialSpawnPosition(definition, this.getCurrentAlliance());
    let preferred = availableSpawnPoints[0];
    let nearestDist = preferred.position.distanceToSquared(target) - ((preferred.priority ?? 0) * 10_000);

    for (let i = 1; i < availableSpawnPoints.length; i++) {
      const candidate = availableSpawnPoints[i];
      const dist = candidate.position.distanceToSquared(target) - ((candidate.priority ?? 0) * 10_000);
      if (dist < nearestDist) {
        preferred = candidate;
        nearestDist = dist;
      }
    }

    return preferred;
  }

  getPolicyDrivenInsertionSuggestion(options?: { minOpfor250?: number }): THREE.Vector3 | null {
    const respawnPolicy = this.gameModeManager?.getRespawnPolicy();
    if (respawnPolicy?.contactAssistStyle !== 'pressure_front' && respawnPolicy?.fallbackRule !== 'pressure_front') {
      return null;
    }

    const pressureSpawn = this.getPolicyDrivenPressureSpawnPosition();
    if (!pressureSpawn) return null;
    const minEnemy250 = Math.max(0, Number(options?.minOpfor250 ?? 0));
    if (minEnemy250 > 0) {
      const enemy250 = this.countNearbyAgents(pressureSpawn, 250, getEnemyAlliance(this.getCurrentAlliance()));
      if (enemy250 < minEnemy250) {
        return null;
      }
    }
    return pressureSpawn ? pressureSpawn.clone() : null;
  }

  getAShauPressureInsertionSuggestion(options?: { minOpfor250?: number }): THREE.Vector3 | null {
    return this.getPolicyDrivenInsertionSuggestion(options);
  }

  sortSpawnPointsByPriority(spawnPoints: RespawnSpawnPoint[]): RespawnSpawnPoint[] {
    const deduped = new Map<string, RespawnSpawnPoint>();
    for (const spawnPoint of spawnPoints) {
      const current = deduped.get(spawnPoint.id);
      if (!current || (spawnPoint.priority ?? 0) > (current.priority ?? 0)) {
        deduped.set(spawnPoint.id, spawnPoint);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => {
      const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return a.name.localeCompare(b.name);
    });
  }

  getCurrentAlliance(): Alliance {
    return this.loadoutService?.getContext().alliance ?? Alliance.BLUFOR;
  }

  // --- Private helpers ---------------------------------------------------

  private isZoneSpawnableForAlliance(
    zone: Pick<CaptureZone, 'isHomeBase' | 'owner' | 'state'>,
    alliance: Alliance,
    allowControlledZoneSpawns: boolean
  ): boolean {
    if (zone.isHomeBase) {
      return zone.owner !== null && getAlliance(zone.owner) === alliance;
    }

    if (!allowControlledZoneSpawns) {
      return false;
    }

    return alliance === Alliance.BLUFOR
      ? zone.state === ZoneState.BLUFOR_CONTROLLED
      : zone.state === ZoneState.OPFOR_CONTROLLED;
  }

  private getHelipadSpawnPriority(helipadId: string, aircraft?: string): number {
    let priority = 25;
    const definition = this.gameModeManager?.getCurrentDefinition?.();
    if (definition?.id !== GameMode.OPEN_FRONTIER) {
      return priority;
    }

    if (helipadId === 'helipad_main' || helipadId.includes('main')) {
      priority += 20;
    }

    if (aircraft === 'UH1_HUEY') {
      priority += 10;
    } else if (aircraft?.startsWith('UH1')) {
      priority += 5;
    }

    return priority;
  }

  private getHelipadInfantrySpawnPosition(helipadPosition: THREE.Vector3): THREE.Vector3 {
    // Standoff in -X (was +X). The +X side of the Open Frontier main helipad
    // sits on the helipad-mound slope; -X drops onto flatter ground.
    return helipadPosition.clone().add(new THREE.Vector3(-HELIPAD_INFANTRY_STANDOFF_METERS, 0, 0));
  }

  private getPolicyDrivenPressureSpawnPosition(): THREE.Vector3 | null {
    if (!this.zoneQuery) return null;
    const respawnPolicy = this.gameModeManager?.getRespawnPolicy();
    if (!respawnPolicy) return null;
    return resolveRespawnFallbackPosition(respawnPolicy, {
      // Shallow copy: ModeSpawnResolver expects mutable CaptureZone[] but
      // IZoneQuery returns readonly. The function only filters, never mutates.
      zones: [...this.zoneQuery.getAllZones()],
      alliance: this.getCurrentAlliance(),
      warSimulator: this.warSimulator,
      terrainReadyAt: (x: number, z: number) => this.isTerrainReadyAt(x, z)
    });
  }

  private countNearbyAgents(center: THREE.Vector3, radius: number, alliance: Alliance): number {
    if (!this.warSimulator || !this.warSimulator.isEnabled()) return 0;
    const r2 = radius * radius;
    let count = 0;
    for (const agent of this.warSimulator.getAllAgents().values()) {
      if (!agent.alive || getAlliance(agent.faction) !== alliance) continue;
      const dx = agent.x - center.x;
      const dz = agent.z - center.z;
      if ((dx * dx + dz * dz) <= r2) count++;
    }
    return count;
  }

  private isTerrainReadyAt(x: number, z: number): boolean {
    if (!this.terrainSystem) {
      return true;
    }
    if (typeof this.terrainSystem.isAreaReadyAt === 'function') {
      return this.terrainSystem.isAreaReadyAt(x, z);
    }
    return this.terrainSystem.isTerrainReady() && this.terrainSystem.hasTerrainAt(x, z);
  }
}
