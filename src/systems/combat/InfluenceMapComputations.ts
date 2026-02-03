import * as THREE from 'three';
import { Combatant, Faction } from './types';
import { CaptureZone } from '../world/ZoneManager';
import { InfluenceCell, GridBounds } from './InfluenceMapGrid';
import { InfluenceMapGrid } from './InfluenceMapGrid';

// Module-level scratch vectors for computation reuse
const _v2a = new THREE.Vector2();
const _v2b = new THREE.Vector2();
const _v3a = new THREE.Vector3();

/**
 * Parameters needed for influence map computations
 */
export interface ComputationParams {
  grid: InfluenceCell[][];
  gridSize: number;
  cellSize: number;
  worldOffset: THREE.Vector2;
  combatants: Map<string, Combatant>;
  zones: CaptureZone[];
  playerPosition: THREE.Vector3;
  sandbagBounds: THREE.Box3[];
}

/**
 * Compute threat level from enemies and player position
 */
export function computeThreatLevel(params: ComputationParams): void {
  const { grid, gridSize, cellSize, worldOffset, combatants, playerPosition } = params;
  const THREAT_RADIUS = 50; // meters
  const THREAT_RADIUS_SQ = THREAT_RADIUS * THREAT_RADIUS;
  const THREAT_FALLOFF = 0.02; // per meter

  combatants.forEach(combatant => {
    // Only enemies contribute to threat
    if (combatant.faction === Faction.US) return;
    if (combatant.state === 'dead') return;

    _v2a.set(combatant.position.x, combatant.position.z);
    const bounds = InfluenceMapGrid.getCellBounds(
      _v2a.x,
      _v2a.y,
      THREAT_RADIUS,
      gridSize,
      cellSize,
      worldOffset
    );

    // Apply threat influence in radius around enemy
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        const cell = grid[x][z];
        const dx = cell.position.x - _v2a.x;
        const dz = cell.position.y - _v2a.y;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq < THREAT_RADIUS_SQ) {
          const distance = Math.sqrt(distanceSq);
          const threat = Math.max(0, 1 - distance * THREAT_FALLOFF);
          cell.threatLevel = Math.min(1, cell.threatLevel + threat);
        }
      }
    }
  });

  // Player position is high-priority threat target for OPFOR
  _v2b.set(playerPosition.x, playerPosition.z);
  const bounds = InfluenceMapGrid.getCellBounds(
    _v2b.x,
    _v2b.y,
    THREAT_RADIUS,
    gridSize,
    cellSize,
    worldOffset
  );
  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
      const cell = grid[x][z];
      const dx = cell.position.x - _v2b.x;
      const dz = cell.position.y - _v2b.y;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq < THREAT_RADIUS_SQ) {
        const distance = Math.sqrt(distanceSq);
        const threat = Math.max(0, 1.2 - distance * THREAT_FALLOFF); // 20% higher than normal
        cell.threatLevel = Math.min(1, cell.threatLevel + threat);
      }
    }
  }
}

/**
 * Compute opportunity level from capture zones
 */
export function computeOpportunityLevel(params: ComputationParams): void {
  const { grid, gridSize, cellSize, worldOffset, zones } = params;
  const ZONE_RADIUS = 30; // meters
  const ZONE_RADIUS_SQ = ZONE_RADIUS * ZONE_RADIUS;
  const ZONE_FALLOFF = 0.033; // per meter

  zones.forEach(zone => {
    // Skip home bases
    if (zone.isHomeBase) return;

    _v2a.set(zone.position.x, zone.position.z);
    let zoneValue = 0;

    // Contested zones are highest priority
    if (zone.state === 'contested') {
      zoneValue = 1.5;
    }
    // Enemy-owned zones are high priority
    else if (zone.owner === Faction.OPFOR) {
      zoneValue = 1.2;
    }
    // Neutral zones are medium priority
    else if (zone.owner === null) {
      zoneValue = 0.8;
    }
    // Friendly zones are low priority (already captured)
    else if (zone.owner === Faction.US) {
      zoneValue = 0.3;
    }

    // Apply opportunity influence in radius around zone
    const bounds = InfluenceMapGrid.getCellBounds(
      _v2a.x,
      _v2a.y,
      ZONE_RADIUS,
      gridSize,
      cellSize,
      worldOffset
    );
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        const cell = grid[x][z];
        const dx = cell.position.x - _v2a.x;
        const dz = cell.position.y - _v2a.y;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq < ZONE_RADIUS_SQ) {
          const distance = Math.sqrt(distanceSq);
          const opportunity = Math.max(0, zoneValue - distance * ZONE_FALLOFF);
          cell.opportunityLevel = Math.min(1, cell.opportunityLevel + opportunity);
        }
      }
    }
  });
}

/**
 * Compute cover value from sandbags and terrain features
 */
export function computeCoverValue(params: ComputationParams): void {
  const { grid, gridSize, cellSize, worldOffset, sandbagBounds } = params;
  const COVER_RADIUS = 15; // meters
  const COVER_RADIUS_SQ = COVER_RADIUS * COVER_RADIUS;
  const COVER_FALLOFF = 0.067; // per meter

  // Compute cover from sandbags
  sandbagBounds.forEach(bounds => {
    bounds.getCenter(_v3a);
    _v2a.set(_v3a.x, _v3a.z);

    const bounds_ = InfluenceMapGrid.getCellBounds(
      _v2a.x,
      _v2a.y,
      COVER_RADIUS,
      gridSize,
      cellSize,
      worldOffset
    );
    for (let x = bounds_.minX; x <= bounds_.maxX; x++) {
      for (let z = bounds_.minZ; z <= bounds_.maxZ; z++) {
        const cell = grid[x][z];
        const dx = cell.position.x - _v2a.x;
        const dz = cell.position.y - _v2a.y;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq < COVER_RADIUS_SQ) {
          const distance = Math.sqrt(distanceSq);
          const cover = Math.max(0, 1 - distance * COVER_FALLOFF);
          cell.coverValue = Math.min(1, cell.coverValue + cover);
        }
      }
    }
  });
}

/**
 * Compute squad support from friendly units
 */
export function computeSquadSupport(params: ComputationParams): void {
  const { grid, gridSize, cellSize, worldOffset, combatants } = params;
  const SUPPORT_RADIUS = 40; // meters
  const SUPPORT_RADIUS_SQ = SUPPORT_RADIUS * SUPPORT_RADIUS;
  const SUPPORT_FALLOFF = 0.025; // per meter

  combatants.forEach(combatant => {
    // Only friendlies contribute to support
    if (combatant.faction === Faction.OPFOR) return;
    if (combatant.state === 'dead') return;

    _v2a.set(combatant.position.x, combatant.position.z);
    const bounds = InfluenceMapGrid.getCellBounds(
      _v2a.x,
      _v2a.y,
      SUPPORT_RADIUS,
      gridSize,
      cellSize,
      worldOffset
    );

    // Apply support influence in radius around friendly
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
        const cell = grid[x][z];
        const dx = cell.position.x - _v2a.x;
        const dz = cell.position.y - _v2a.y;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq < SUPPORT_RADIUS_SQ) {
          const distance = Math.sqrt(distanceSq);
          const support = Math.max(0, 1 - distance * SUPPORT_FALLOFF);
          cell.squadSupport = Math.min(1, cell.squadSupport + support);
        }
      }
    }
  });
}

/**
 * Compute combined tactical scores from all factors
 */
export function computeCombinedScores(params: ComputationParams): void {
  const { grid, gridSize } = params;

  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const cell = grid[x][z];

      // Combined score formula:
      // High opportunity + low threat + cover + squad support = best positions
      cell.combinedScore =
        cell.opportunityLevel * 2.0 +     // Opportunity is most important
        (1 - cell.threatLevel) * 1.5 +    // Low threat is valuable
        cell.coverValue * 0.8 +           // Cover adds safety
        cell.squadSupport * 0.5;          // Support is helpful but less critical

      // Normalize to 0-1 range (max possible = 4.8)
      cell.combinedScore = Math.min(1, cell.combinedScore / 4.8);
    }
  }
}
