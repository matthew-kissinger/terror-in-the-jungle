import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Combatant, Faction } from './types';
import { CaptureZone } from '../world/ZoneManager';
import { InfluenceCell, InfluenceMapGrid } from './InfluenceMapGrid';
import { Logger } from '../../utils/Logger';
import {
  computeThreatLevel,
  computeOpportunityLevel,
  computeCoverValue,
  computeSquadSupport,
  computeCombinedScores,
  type ComputationParams
} from './InfluenceMapComputations';

const _v3a = new THREE.Vector3();

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
    Logger.info('influence-map', ' Initializing Influence Map System...');
    Logger.info('influence-map', `   Grid: ${this.gridSize}x${this.gridSize}, Cell size: ${this.cellSize.toFixed(1)}m, World: ${this.worldSize}m`);
  }

  private initializeGrid(): void {
    this.grid = InfluenceMapGrid.initializeGrid(
      this.gridSize,
      this.worldSize,
      this.worldOffset
    );
  }

  update(_deltaTime: number): void {
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
    InfluenceMapGrid.resetGrid(this.grid, this.gridSize);

    // Build params object for computation functions
    const params: ComputationParams = {
      grid: this.grid,
      gridSize: this.gridSize,
      cellSize: this.cellSize,
      worldOffset: this.worldOffset,
      combatants: this.combatants,
      zones: this.zones,
      playerPosition: this.playerPosition,
      sandbagBounds: this.sandbagBounds
    };

    // Compute all influence factors
    computeThreatLevel(params);
    computeOpportunityLevel(params);
    computeCoverValue(params);
    computeSquadSupport(params);
    computeCombinedScores(params);
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
    const searchRadiusSq = searchRadius * searchRadius;
    let bestCell: InfluenceCell | null = null;
    let bestScore = -Infinity;

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const x = centerX + dx;
        const z = centerZ + dz;

        if (x < 0 || x >= this.gridSize || z < 0 || z >= this.gridSize) continue;

        const cell = this.grid[x][z];
        _v3a.set(
          cell.position.x + this.cellSize / 2,
          0,
          cell.position.y + this.cellSize / 2
        );

        if (_v3a.distanceToSquared(targetPos) > searchRadiusSq) continue;

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

    Logger.info('influence-map', ` Influence map debug: ${this.debugEnabled ? 'ON' : 'OFF'}`);
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

    Logger.info('influence-map', 'Influence Map System disposed');
  }
}
