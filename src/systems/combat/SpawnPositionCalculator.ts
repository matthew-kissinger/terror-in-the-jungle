import * as THREE from 'three';
import { Faction } from './types';
import { ZoneManager, ZoneState, CaptureZone } from '../world/ZoneManager';
import { GameModeConfig } from '../../config/gameModes';
import { Logger } from '../../utils/Logger';

// Module-level scratch vectors to avoid per-call allocations
const _spawnPos = new THREE.Vector3();
const _offsetVec = new THREE.Vector3();
const _usBasePos = new THREE.Vector3(0, 0, -50);
const _opforBasePos = new THREE.Vector3(0, 0, 145);

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
        z.isHomeBase && z.owner === Faction.US &&
        (z.id.includes('main') || z.id === 'us_base')
      );
      const opforBase = gameModeConfig.zones.find(z =>
        z.isHomeBase && z.owner === Faction.OPFOR &&
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
    gameModeConfig?: GameModeConfig
  ): THREE.Vector3 {
    if (zoneManager) {
      const allZones = zoneManager.getAllZones();
      const ownedBases: CaptureZone[] = [];
      for (const z of allZones) {
        if (z.owner === faction && z.isHomeBase) {
          ownedBases.push(z);
        }
      }

      if (ownedBases.length > 0) {
        const baseZone = ownedBases[Math.floor(Math.random() * ownedBases.length)];
        const anchor = baseZone.position;
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 30;
        _spawnPos.set(
          anchor.x + Math.cos(angle) * radius,
          0,
          anchor.z + Math.sin(angle) * radius
        );
        Logger.info('combat', `📍 Using base ${baseZone.id} for squad respawn at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
        return _spawnPos;
      } else {
        Logger.warn('combat', `⚠️ No owned bases found for ${faction}, using fallback spawn`);
      }
    } else {
      Logger.warn('combat', `⚠️ No ZoneManager available, using fallback spawn`);
    }

    const { usBasePos, opforBasePos } = this.getBasePositions(gameModeConfig);
    const basePos = faction === Faction.US ? usBasePos : opforBasePos;

    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 30;
    _spawnPos.set(
      basePos.x + Math.cos(angle) * radius,
      0,
      basePos.z + Math.sin(angle) * radius
    );

    Logger.info('combat', `📍 Using fallback base spawn for ${faction} at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
    return _spawnPos;
  }

  /**
   * Get a spawn position near an owned zone (contested preferred)
   */
  static getSpawnPosition(
    faction: Faction, 
    zoneManager?: ZoneManager, 
    gameModeConfig?: GameModeConfig
  ): THREE.Vector3 {
    if (zoneManager) {
      const allZones = zoneManager.getAllZones();
      
      let contestedAnchor: CaptureZone | null = null;
      let capturedAnchor: CaptureZone | null = null;
      let hqAnchor: CaptureZone | null = null;

      for (const z of allZones) {
        if (z.owner !== faction) continue;

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
        const anchor = anchorZone.position;
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 40;
        _spawnPos.set(
          anchor.x + Math.cos(angle) * radius,
          0,
          anchor.z + Math.sin(angle) * radius
        );
        Logger.info('combat', `📍 Using zone ${anchorZone.id} as spawn anchor`);
        return _spawnPos;
      } else {
        Logger.warn('combat', `⚠️ No owned zones found for ${faction}, using fallback spawn`);
      }
    } else {
      Logger.warn('combat', `⚠️ No ZoneManager available, using fallback spawn`);
    }

    // Fallback: spawn at fixed base positions
    const { usBasePos, opforBasePos } = this.getBasePositions(gameModeConfig);
    const basePos = faction === Faction.US ? usBasePos : opforBasePos;

    // Add random offset around the base
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 30;
    _spawnPos.set(
      basePos.x + Math.cos(angle) * radius,
      0,
      basePos.z + Math.sin(angle) * radius
    );

    Logger.info('combat', `📍 Using fallback base spawn for ${faction} at (${_spawnPos.x.toFixed(1)}, ${_spawnPos.z.toFixed(1)})`);
    return _spawnPos;
  }

  /**
   * Get all relevant anchors (zones) for a faction
   */
  static getFactionAnchors(faction: Faction, zoneManager?: ZoneManager): THREE.Vector3[] {
    if (!zoneManager) return [];
    
    const contested: THREE.Vector3[] = [];
    const captured: THREE.Vector3[] = [];
    const hqs: THREE.Vector3[] = [];

    for (const z of zoneManager.getAllZones()) {
      if (z.owner !== faction) continue;
      
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
   * Get HQ zones defined in game mode config
   */
  static getHQZonesForFaction(faction: Faction, config?: GameModeConfig): Array<{ position: THREE.Vector3 }> {
    const zones = config?.zones;
    if (!zones) return [];
    
    const hqs: Array<{ position: THREE.Vector3 }> = [];
    for (const z of zones) {
      if (z.isHomeBase && z.owner === faction) {
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
}
