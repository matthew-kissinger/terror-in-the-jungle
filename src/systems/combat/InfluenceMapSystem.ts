import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Combatant, Faction } from './types';
import { CaptureZone } from '../world/ZoneManager';

/**
 * Grid cell data representing tactical influence at a position
 */
export interface InfluenceCell {
  position: THREE.Vector2;
  threatLevel: number;          // 0-1: Based on enemy density and LOS
  opportunityLevel: number;      // 0-1: Based on uncontested zones, flanking routes
  coverValue: number;            // 0-1: Based on nearby sandbags and terrain features
  squadSupport: number;          // 0-1: Friendly unit density for mutual support
  combinedScore: number;         // Overall tactical value
}

/**
 * InfluenceMapSystem computes threat/opportunity scores across the battlefield
 * to enable strategic squad AI positioning decisions.
 *
 * Updates every 500ms to avoid performance overhead.
 */
export class InfluenceMapSystem implements GameSystem {
  private grid: InfluenceCell[][] = [];
  private gridSize = 64;
  private cellSize: number;
  private worldSize: number;
  private worldOffset: THREE.Vector2;

  private lastUpdateTime = 0;
  private updateInterval = 500; // ms

  // External dependencies
  private combatants: Map<string, Combatant> = new Map();
  private zones: CaptureZone[] = [];
  private playerPosition = new THREE.Vector3();
  private sandbagBounds: THREE.Box3[] = [];

  // Debug visualization
  private debugEnabled = false;
  private debugCanvas?: HTMLCanvasElement;
  private debugContext?: CanvasRenderingContext2D;

  constructor(worldSize: number) {
    this.worldSize = worldSize;
    this.cellSize = worldSize / this.gridSize;
    this.worldOffset = new THREE.Vector2(-worldSize / 2, -worldSize / 2);

    // Pre-allocate grid to avoid allocations in hot path
    this.initializeGrid();
  }

  async init(): Promise<void> {
    console.log('🗺️ Initializing Influence Map System...');
    console.log(`   Grid: ${this.gridSize}x${this.gridSize}, Cell size: ${this.cellSize.toFixed(1)}m, World: ${this.worldSize}m`);
  }

  private initializeGrid(): void {
    for (let x = 0; x < this.gridSize; x++) {
      this.grid[x] = [];
      for (let z = 0; z < this.gridSize; z++) {
        const worldX = this.worldOffset.x + x * this.cellSize;
        const worldZ = this.worldOffset.y + z * this.cellSize;

        this.grid[x][z] = {
          position: new THREE.Vector2(worldX, worldZ),
          threatLevel: 0,
          opportunityLevel: 0,
          coverValue: 0,
          squadSupport: 0,
          combinedScore: 0
        };
      }
    }
  }

  update(deltaTime: number): void {
    const now = Date.now();

    // Throttle updates to 500ms
    if (now - this.lastUpdateTime < this.updateInterval) {
      return;
    }

    this.lastUpdateTime = now;
    this.computeInfluenceMap();

    if (this.debugEnabled && this.debugContext) {
      this.renderDebugVisualization();
    }
  }

  private computeInfluenceMap(): void {
    // Reset all values
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        const cell = this.grid[x][z];
        cell.threatLevel = 0;
        cell.opportunityLevel = 0;
        cell.coverValue = 0;
        cell.squadSupport = 0;
        cell.combinedScore = 0;
      }
    }

    // Compute threat level from enemies
    this.computeThreatLevel();

    // Compute opportunity level from zones
    this.computeOpportunityLevel();

    // Compute cover value
    this.computeCoverValue();

    // Compute squad support from friendlies
    this.computeSquadSupport();

    // Combine scores
    this.computeCombinedScores();
  }

  private computeThreatLevel(): void {
    const THREAT_RADIUS = 50; // meters
    const THREAT_FALLOFF = 0.02; // per meter

    this.combatants.forEach(combatant => {
      // Only enemies contribute to threat
      if (combatant.faction === Faction.US) return;
      if (combatant.state === 'dead') return;

      const combatantPos = new THREE.Vector2(combatant.position.x, combatant.position.z);

      // Apply threat influence in radius around enemy
      for (let x = 0; x < this.gridSize; x++) {
        for (let z = 0; z < this.gridSize; z++) {
          const cell = this.grid[x][z];
          const distance = cell.position.distanceTo(combatantPos);

          if (distance < THREAT_RADIUS) {
            const threat = Math.max(0, 1 - distance * THREAT_FALLOFF);
            cell.threatLevel = Math.min(1, cell.threatLevel + threat);
          }
        }
      }
    });

    // Player position is high-priority threat target for OPFOR
    const playerPos2D = new THREE.Vector2(this.playerPosition.x, this.playerPosition.z);
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        const cell = this.grid[x][z];
        const distance = cell.position.distanceTo(playerPos2D);

        if (distance < THREAT_RADIUS) {
          const threat = Math.max(0, 1.2 - distance * THREAT_FALLOFF); // 20% higher than normal
          cell.threatLevel = Math.min(1, cell.threatLevel + threat);
        }
      }
    }
  }

  private computeOpportunityLevel(): void {
    const ZONE_RADIUS = 30; // meters
    const ZONE_FALLOFF = 0.033; // per meter

    this.zones.forEach(zone => {
      // Skip home bases
      if (zone.isHomeBase) return;

      const zonePos = new THREE.Vector2(zone.position.x, zone.position.z);
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
      for (let x = 0; x < this.gridSize; x++) {
        for (let z = 0; z < this.gridSize; z++) {
          const cell = this.grid[x][z];
          const distance = cell.position.distanceTo(zonePos);

          if (distance < ZONE_RADIUS) {
            const opportunity = Math.max(0, zoneValue - distance * ZONE_FALLOFF);
            cell.opportunityLevel = Math.min(1, cell.opportunityLevel + opportunity);
          }
        }
      }
    });
  }

  private computeCoverValue(): void {
    const COVER_RADIUS = 15; // meters
    const COVER_FALLOFF = 0.067; // per meter

    // Compute cover from sandbags
    this.sandbagBounds.forEach(bounds => {
      const center = new THREE.Vector3();
      bounds.getCenter(center);
      const coverPos = new THREE.Vector2(center.x, center.z);

      for (let x = 0; x < this.gridSize; x++) {
        for (let z = 0; z < this.gridSize; z++) {
          const cell = this.grid[x][z];
          const distance = cell.position.distanceTo(coverPos);

          if (distance < COVER_RADIUS) {
            const cover = Math.max(0, 1 - distance * COVER_FALLOFF);
            cell.coverValue = Math.min(1, cell.coverValue + cover);
          }
        }
      }
    });
  }

  private computeSquadSupport(): void {
    const SUPPORT_RADIUS = 40; // meters
    const SUPPORT_FALLOFF = 0.025; // per meter

    this.combatants.forEach(combatant => {
      // Only friendlies contribute to support
      if (combatant.faction === Faction.OPFOR) return;
      if (combatant.state === 'dead') return;

      const combatantPos = new THREE.Vector2(combatant.position.x, combatant.position.z);

      // Apply support influence in radius around friendly
      for (let x = 0; x < this.gridSize; x++) {
        for (let z = 0; z < this.gridSize; z++) {
          const cell = this.grid[x][z];
          const distance = cell.position.distanceTo(combatantPos);

          if (distance < SUPPORT_RADIUS) {
            const support = Math.max(0, 1 - distance * SUPPORT_FALLOFF);
            cell.squadSupport = Math.min(1, cell.squadSupport + support);
          }
        }
      }
    });
  }

  private computeCombinedScores(): void {
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        const cell = this.grid[x][z];

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

  /**
   * Query influence at a specific world position
   */
  queryCellAt(worldPos: THREE.Vector3): InfluenceCell | null {
    const x = Math.floor((worldPos.x - this.worldOffset.x) / this.cellSize);
    const z = Math.floor((worldPos.z - this.worldOffset.y) / this.cellSize);

    if (x < 0 || x >= this.gridSize || z < 0 || z >= this.gridSize) {
      return null;
    }

    return this.grid[x][z];
  }

  /**
   * Find best tactical position within radius of target
   */
  findBestPositionNear(
    targetPos: THREE.Vector3,
    searchRadius: number,
    faction: Faction
  ): THREE.Vector3 | null {
    const centerX = Math.floor((targetPos.x - this.worldOffset.x) / this.cellSize);
    const centerZ = Math.floor((targetPos.z - this.worldOffset.y) / this.cellSize);
    const cellRadius = Math.ceil(searchRadius / this.cellSize);

    let bestCell: InfluenceCell | null = null;
    let bestScore = -Infinity;

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const x = centerX + dx;
        const z = centerZ + dz;

        if (x < 0 || x >= this.gridSize || z < 0 || z >= this.gridSize) continue;

        const cell = this.grid[x][z];
        const worldPos = new THREE.Vector3(
          cell.position.x + this.cellSize / 2,
          0,
          cell.position.y + this.cellSize / 2
        );

        if (worldPos.distanceTo(targetPos) > searchRadius) continue;

        // For US faction, high combined score is good
        // For OPFOR, invert threat level preference
        let score = cell.combinedScore;

        if (faction === Faction.OPFOR) {
          // OPFOR wants to attack high-threat areas (where player is)
          score = cell.opportunityLevel * 2.0 +
                  cell.threatLevel * 1.5 +  // Seek threat instead of avoiding
                  cell.coverValue * 0.8 +
                  cell.squadSupport * 0.5;
          score = Math.min(1, score / 4.8);
        }

        if (score > bestScore) {
          bestScore = score;
          bestCell = cell;
        }
      }
    }

    if (!bestCell) return null;

    return new THREE.Vector3(
      bestCell.position.x + this.cellSize / 2,
      0,
      bestCell.position.y + this.cellSize / 2
    );
  }

  /**
   * Find best zone target for a squad based on influence
   */
  findBestZoneTarget(squadPosition: THREE.Vector3, faction: Faction): CaptureZone | null {
    if (this.zones.length === 0) return null;

    let bestZone: CaptureZone | null = null;
    let bestScore = -Infinity;

    this.zones.forEach(zone => {
      // Skip home bases
      if (zone.isHomeBase) return;

      // Skip already-owned zones unless contested
      if (zone.owner === faction && zone.state !== 'contested') return;

      const zoneCell = this.queryCellAt(zone.position);
      if (!zoneCell) return;

      // Score combines influence + distance penalty
      const distance = squadPosition.distanceTo(zone.position);
      const distancePenalty = Math.min(1, distance / 200); // Prefer closer zones

      let score = zoneCell.combinedScore - distancePenalty * 0.3;

      // Bonus for contested zones
      if (zone.state === 'contested') {
        score += 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestZone = zone;
      }
    });

    return bestZone;
  }

  // Setters for external data

  setCombatants(combatants: Map<string, Combatant>): void {
    this.combatants = combatants;
  }

  setZones(zones: CaptureZone[]): void {
    this.zones = zones;
  }

  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  setSandbagBounds(bounds: THREE.Box3[]): void {
    this.sandbagBounds = bounds;
  }

  // Debug visualization

  toggleDebug(): void {
    this.debugEnabled = !this.debugEnabled;

    if (this.debugEnabled && !this.debugCanvas) {
      this.createDebugCanvas();
    }

    if (this.debugCanvas) {
      this.debugCanvas.style.display = this.debugEnabled ? 'block' : 'none';
    }

    console.log(`🗺️ Influence map debug: ${this.debugEnabled ? 'ON' : 'OFF'}`);
  }

  private createDebugCanvas(): void {
    this.debugCanvas = document.createElement('canvas');
    this.debugCanvas.width = 256;
    this.debugCanvas.height = 256;
    this.debugCanvas.style.position = 'fixed';
    this.debugCanvas.style.bottom = '120px';
    this.debugCanvas.style.right = '20px';
    this.debugCanvas.style.border = '2px solid white';
    this.debugCanvas.style.zIndex = '9999';
    this.debugCanvas.style.imageRendering = 'pixelated';
    this.debugCanvas.style.pointerEvents = 'none';
    document.body.appendChild(this.debugCanvas);

    this.debugContext = this.debugCanvas.getContext('2d')!;
  }

  private renderDebugVisualization(): void {
    if (!this.debugContext || !this.debugCanvas) return;

    const ctx = this.debugContext;
    const pixelSize = this.debugCanvas.width / this.gridSize;

    // Clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);

    // Render grid
    for (let x = 0; x < this.gridSize; x++) {
      for (let z = 0; z < this.gridSize; z++) {
        const cell = this.grid[x][z];

        // Color based on threat (red) vs opportunity (green)
        const threat = Math.floor(cell.threatLevel * 255);
        const opportunity = Math.floor(cell.opportunityLevel * 255);
        const cover = Math.floor(cell.coverValue * 128);

        ctx.fillStyle = `rgb(${threat}, ${opportunity}, ${cover})`;
        ctx.fillRect(
          x * pixelSize,
          z * pixelSize,
          pixelSize,
          pixelSize
        );
      }
    }

    // Render zones as circles
    this.zones.forEach(zone => {
      const x = Math.floor((zone.position.x - this.worldOffset.x) / this.cellSize);
      const z = Math.floor((zone.position.z - this.worldOffset.y) / this.cellSize);

      ctx.strokeStyle = zone.owner === Faction.US ? 'blue' :
                        zone.owner === Faction.OPFOR ? 'red' : 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        x * pixelSize + pixelSize / 2,
        z * pixelSize + pixelSize / 2,
        zone.radius / this.cellSize * pixelSize,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    });
  }

  dispose(): void {
    if (this.debugCanvas) {
      document.body.removeChild(this.debugCanvas);
      this.debugCanvas = undefined;
      this.debugContext = undefined;
    }

    console.log('🧹 Influence Map System disposed');
  }
}
