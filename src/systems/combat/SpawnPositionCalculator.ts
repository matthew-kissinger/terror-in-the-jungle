import * as THREE from 'three';
import { Faction, Alliance, getAlliance, isBlufor } from './types';
import { ZoneManager, ZoneState, CaptureZone } from '../world/ZoneManager';
import { GameModeConfig } from '../../config/gameModeTypes';
import { Logger } from '../../utils/Logger';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// Module-level scratch vectors to avoid per-call allocations
const _spawnPos = new THREE.Vector3();
const _offsetVec = new THREE.Vector3();
const _usBasePos = new THREE.Vector3(0, 0, -50);
const _opforBasePos = new THREE.Vector3(0, 0, 145);

const SAFE_SPAWN_SAMPLE_COUNT = 24;
const SAFE_SPAWN_PROBE_RADIUS = 4;
const SAFE_SPAWN_MAX_SLOPE = 0.38;
const SAFE_SPAWN_MAX_LOCAL_DROP = 2.25;
const SAFE_SPAWN_MAX_ANCHOR_HEIGHT_DELTA = 3.5;
const SAFE_SPAWN_SAMPLE_ANGLES = [
  0,
  Math.PI * 0.25,
  Math.PI * 0.5,
  Math.PI * 0.75,
  Math.PI,
  Math.PI * 1.25,
  Math.PI * 1.5,
  Math.PI * 1.75,
];

/**
 * Utility class for calculating spawn positions and squad sizes
 */
export class SpawnPositionCalculator {
  /**
   * Get the main base positions for both factions
   */
  static getBasePositions(gameModeConfig?: GameModeConfig): { usBasePos: THREE.Vector3; opforBasePos: THREE.Vector3 } {
    if (gameModeConfig) {
      // Find main bases for each faction
      const usBase = gameModeConfig.zones.find(z =>
        z.isHomeBase && z.owner !== null && isBlufor(z.owner as Faction) &&
        (z.id.includes('main') || z.id === 'us_base')
      );
      const opforBase = gameModeConfig.zones.find(z =>
        z.isHomeBase && z.owner !== null && !isBlufor(z.owner as Faction) &&
        (z.id.includes('main') || z.id === 'opfor_base')
      );

      if (usBase && opforBase) {
        _usBasePos.set(usBase.position.x, usBase.position.y, usBase.position.z);
        _opforBasePos.set(opforBase.position.x, opforBase.position.y, opforBase.position.z);
        return { usBasePos: _usBasePos, opforBasePos: _opforBasePos };
      }
    }

    // Fallback to default positions
    _usBasePos.set(0, 0, -50);
    _opforBasePos.set(0, 0, 145);
    return { usBasePos: _usBasePos, opforBasePos: _opforBasePos };
  }

  /**
   * Get a spawn position at a home base
   */
  static getBaseSpawnPosition(
    faction: Faction, 
    zoneManager?: ZoneManager, 
    gameModeConfig?: GameModeConfig,
    terrainSystem?: ITerrainRuntime,
  ): THREE.Vector3 {
    if (zoneManager) {
      const allZones = zoneManager.getAllZones();
      const factionAlliance = getAlliance(faction);
      const ownedBases: CaptureZone[] = [];
      for (const z of allZones) {
        if (z.owner !== null && getAlliance(z.owner as Faction) === factionAlliance && z.isHomeBase) {
          ownedBases.push(z);
        }
      }

      if (ownedBases.length > 0) {
        const baseZone = ownedBases[Math.floor(Math.random() * ownedBases.length)];
        const anchor = baseZone.position;
        this.findSafeSpawnPositionNearAnchor(anchor, 20, 50, terrainSystem, _spawnPos);
        Logger.info('combat', ` Using base ${baseZone.id} for squad respawn at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
        return _spawnPos;
      } else {
        Logger.warn('combat', ` No owned bases found for ${faction}, using fallback spawn`);
      }
    } else {
      Logger.warn('combat', ` No ZoneManager available, using fallback spawn`);
    }

    const { usBasePos, opforBasePos } = this.getBasePositions(gameModeConfig);
    const basePos = isBlufor(faction) ? usBasePos : opforBasePos;
    this.findSafeSpawnPositionNearAnchor(basePos, 20, 50, terrainSystem, _spawnPos);

    Logger.info('combat', ` Using fallback base spawn for ${faction} at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
    return _spawnPos;
  }

  /**
   * Get a spawn position near an owned zone (contested preferred)
   */
  static getSpawnPosition(
    faction: Faction, 
    zoneManager?: ZoneManager, 
    gameModeConfig?: GameModeConfig,
    terrainSystem?: ITerrainRuntime,
  ): THREE.Vector3 {
    if (zoneManager) {
      const allZones = zoneManager.getAllZones();
      const factionAlliance = getAlliance(faction);
      
      let contestedAnchor: CaptureZone | null = null;
      let capturedAnchor: CaptureZone | null = null;
      let hqAnchor: CaptureZone | null = null;

      for (const z of allZones) {
        if (z.owner === null || getAlliance(z.owner as Faction) !== factionAlliance) continue;

        if (z.isHomeBase) {
          if (!hqAnchor) hqAnchor = z;
        } else if (z.state === ZoneState.CONTESTED) {
          if (!contestedAnchor) contestedAnchor = z;
        } else {
          if (!capturedAnchor) capturedAnchor = z;
        }
      }

      const anchorZone = contestedAnchor || capturedAnchor || hqAnchor;
      if (anchorZone) {
        this.findSafeSpawnPositionNearAnchor(anchorZone.position, 20, 60, terrainSystem, _spawnPos);
        Logger.info('combat', ` Using zone ${anchorZone.id} as spawn anchor`);
        return _spawnPos;
      } else {
        Logger.warn('combat', ` No owned zones found for ${faction}, using fallback spawn`);
      }
    } else {
      Logger.warn('combat', ` No ZoneManager available, using fallback spawn`);
    }

    // Fallback: spawn at fixed base positions
    const { usBasePos, opforBasePos } = this.getBasePositions(gameModeConfig);
    const basePos = isBlufor(faction) ? usBasePos : opforBasePos;
    this.findSafeSpawnPositionNearAnchor(basePos, 20, 50, terrainSystem, _spawnPos);

    Logger.info('combat', ` Using fallback base spawn for ${faction} at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
    return _spawnPos;
  }

  static findSafeSpawnPositionNearAnchor(
    anchor: THREE.Vector3,
    minRadius: number,
    maxRadius: number,
    terrainSystem?: ITerrainRuntime,
    target?: THREE.Vector3,
  ): THREE.Vector3 {
    const result = target || _spawnPos;
    const resolvedMaxRadius = Math.max(minRadius, maxRadius);
    const fallbackRadius = minRadius + Math.random() * (resolvedMaxRadius - minRadius);
    const fallbackAngle = Math.random() * Math.PI * 2;
    let fallbackY = 0;

    if (!terrainSystem || !this.canUseTerrainAt(terrainSystem, anchor.x, anchor.z)) {
      return result.set(
        anchor.x + Math.cos(fallbackAngle) * fallbackRadius,
        fallbackY,
        anchor.z + Math.sin(fallbackAngle) * fallbackRadius,
      );
    }

    const anchorHeight = this.sampleTerrainHeight(terrainSystem, anchor.x, anchor.z);
    if (!Number.isFinite(anchorHeight)) {
      return result.set(
        anchor.x + Math.cos(fallbackAngle) * fallbackRadius,
        fallbackY,
        anchor.z + Math.sin(fallbackAngle) * fallbackRadius,
      );
    }
    fallbackY = anchorHeight;

    let bestAcceptedScore = Number.POSITIVE_INFINITY;
    let bestAcceptedX = anchor.x;
    let bestAcceptedZ = anchor.z;
    let bestAcceptedY = anchorHeight;
    let bestFallbackScore = Number.POSITIVE_INFINITY;
    let bestFallbackX = anchor.x;
    let bestFallbackZ = anchor.z;
    let bestFallbackY = anchorHeight;

    const sampleCount = SAFE_SPAWN_SAMPLE_COUNT + (minRadius <= 0 ? 1 : 0);
    for (let i = 0; i < sampleCount; i++) {
      let radius = fallbackRadius;
      let angle = fallbackAngle;
      if (i === 0 && minRadius <= 0) {
        radius = 0;
        angle = 0;
      } else {
        radius = minRadius + Math.random() * (resolvedMaxRadius - minRadius);
        angle = Math.random() * Math.PI * 2;
      }

      const candidateX = anchor.x + Math.cos(angle) * radius;
      const candidateZ = anchor.z + Math.sin(angle) * radius;
      if (!this.canUseTerrainAt(terrainSystem, candidateX, candidateZ)) {
        continue;
      }

      const candidateHeight = this.sampleTerrainHeight(terrainSystem, candidateX, candidateZ);
      if (!Number.isFinite(candidateHeight)) {
        continue;
      }

      const slope = terrainSystem.getSlopeAt(candidateX, candidateZ);
      let maxLocalDrop = 0;
      let missingProbe = false;
      for (const sampleAngle of SAFE_SPAWN_SAMPLE_ANGLES) {
        const sampleX = candidateX + Math.cos(sampleAngle) * SAFE_SPAWN_PROBE_RADIUS;
        const sampleZ = candidateZ + Math.sin(sampleAngle) * SAFE_SPAWN_PROBE_RADIUS;
        if (!this.canUseTerrainAt(terrainSystem, sampleX, sampleZ)) {
          missingProbe = true;
          break;
        }
        const sampleHeight = this.sampleTerrainHeight(terrainSystem, sampleX, sampleZ);
        if (!Number.isFinite(sampleHeight)) {
          missingProbe = true;
          break;
        }
        maxLocalDrop = Math.max(maxLocalDrop, Math.abs(sampleHeight - candidateHeight));
      }

      const anchorHeightDelta = Math.abs(candidateHeight - anchorHeight);
      const score = slope * 100 + maxLocalDrop * 14 + anchorHeightDelta * 4 + radius * 0.04 + (missingProbe ? 500 : 0);
      if (score < bestFallbackScore) {
        bestFallbackScore = score;
        bestFallbackX = candidateX;
        bestFallbackZ = candidateZ;
        bestFallbackY = candidateHeight;
      }

      const accepted = !missingProbe
        && slope <= SAFE_SPAWN_MAX_SLOPE
        && maxLocalDrop <= SAFE_SPAWN_MAX_LOCAL_DROP
        && anchorHeightDelta <= SAFE_SPAWN_MAX_ANCHOR_HEIGHT_DELTA;
      if (accepted && score < bestAcceptedScore) {
        bestAcceptedScore = score;
        bestAcceptedX = candidateX;
        bestAcceptedZ = candidateZ;
        bestAcceptedY = candidateHeight;
      }
    }

    if (Number.isFinite(bestAcceptedScore)) {
      return result.set(bestAcceptedX, bestAcceptedY, bestAcceptedZ);
    }
    if (Number.isFinite(bestFallbackScore)) {
      return result.set(bestFallbackX, bestFallbackY, bestFallbackZ);
    }

    return result.set(
      anchor.x + Math.cos(fallbackAngle) * fallbackRadius,
      fallbackY,
      anchor.z + Math.sin(fallbackAngle) * fallbackRadius,
    );
  }

  /**
   * Get all relevant anchors (zones) for a faction
   */
  static getFactionAnchors(faction: Faction, zoneManager?: ZoneManager): THREE.Vector3[] {
    if (!zoneManager) return [];
    
    const factionAlliance = getAlliance(faction);
    const contested: THREE.Vector3[] = [];
    const captured: THREE.Vector3[] = [];
    const hqs: THREE.Vector3[] = [];

    for (const z of zoneManager.getAllZones()) {
      if (z.owner === null || getAlliance(z.owner as Faction) !== factionAlliance) continue;
      
      if (z.isHomeBase) {
        hqs.push(z.position);
      } else if (z.state === ZoneState.CONTESTED) {
        contested.push(z.position);
      } else {
        captured.push(z.position);
      }
    }

    return [...contested, ...captured, ...hqs];
  }

  /**
   * Get HQ zones defined in game mode config for an alliance
   */
  static getHQZonesForAlliance(alliance: Alliance, config?: GameModeConfig): Array<{ position: THREE.Vector3 }> {
    const zones = config?.zones;
    if (!zones) return [];
    
    const hqs: Array<{ position: THREE.Vector3 }> = [];
    for (const z of zones) {
      if (z.isHomeBase && z.owner !== null && getAlliance(z.owner as Faction) === alliance) {
        hqs.push({ position: z.position });
      }
    }
    return hqs;
  }

  /**
   * Get a random squad size within range
   */
  static randomSquadSize(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  /**
   * Get average squad size
   */
  static getAverageSquadSize(min: number, max: number): number {
    return Math.round((min + max) / 2);
  }

  /**
   * Get a random offset for spawning
   */
  static randomSpawnOffset(minRadius: number, maxRadius: number, target?: THREE.Vector3): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const result = target || _offsetVec;
    return result.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }

  private static canUseTerrainAt(terrainSystem: ITerrainRuntime, x: number, z: number): boolean {
    if (!terrainSystem.isTerrainReady()) {
      return false;
    }
    if (terrainSystem.isAreaReadyAt && !terrainSystem.isAreaReadyAt(x, z)) {
      return false;
    }
    return terrainSystem.hasTerrainAt(x, z);
  }

  private static sampleTerrainHeight(terrainSystem: ITerrainRuntime, x: number, z: number): number {
    return Number(terrainSystem.getEffectiveHeightAt(x, z));
  }
}
