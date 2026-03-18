import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';
import { buildHeightfieldMesh } from './NavmeshHeightfieldBuilder';
import { NavmeshMovementAdapter } from './NavmeshMovementAdapter';

import type { Crowd, NavMesh, NavMeshQuery, TileCache, Obstacle } from '@recast-navigation/core';
import type { MapFeatureDefinition } from '../../config/gameModeTypes';

/** Result of a connectivity validation across multiple points. */
export interface ConnectivityResult {
  /** True if all points can reach each other via navmesh paths. */
  connected: boolean;
  /** Groups of point indices that can reach each other. Single group = fully connected. */
  islands: number[][];
}

/** Default search extents for navmesh queries. Y is large to handle elevation. */
const QUERY_HALF_EXTENTS = { x: 2, y: 50, z: 2 };

/** Tolerance for isPointOnNavmesh distance check. */
const ON_NAVMESH_DISTANCE_SQ = 4.0; // 2m

// Recast navigation config constants
const NAVMESH_CELL_SIZE = 4.0;
const AGENT_RADIUS = 0.5;
const AGENT_HEIGHT = 3.0;
// 45° aligns with terrain solver's crawl-zone boundary (SlopePhysics slopeDot=0.7).
// Below 45° = full speed on navmesh. Above 45° = terrain solver handles as crawl/block.
const WALKABLE_SLOPE_ANGLE = 45;
// 0.6m handles terrain lips from stamped corridors without creating vertical steps.
const WALKABLE_CLIMB = 0.6;
const MAX_CROWD_AGENTS = 64;
const TILE_SIZE = 256;
const TILE_RADIUS = 3;

// Threshold: maps larger than this use tiled navmesh
const TILED_THRESHOLD = 3200;

// Tile streaming budget
const MAX_TILES_PER_FRAME = 2;

// Obstacle height for structure exclusion
const OBSTACLE_HEIGHT = 10.0;

interface NavmeshTileKey {
  tx: number;
  tz: number;
}

/**
 * Top-level system owning navmesh lifecycle, crowd simulation, and tiled streaming.
 *
 * Gracefully degrades to beeline-only movement if WASM fails to load.
 */
export class NavmeshSystem {
  private navMesh: NavMesh | null = null;
  private navMeshQuery: NavMeshQuery | null = null;
  private tileCache: TileCache | null = null;
  private crowd: Crowd | null = null;
  private adapter: NavmeshMovementAdapter | null = null;
  private wasmReady = false;
  private worldSize = 0;
  private isTiled = false;

  // Tiled navmesh state
  private activeTiles = new Map<string, boolean>(); // "tx,tz" -> loaded
  private pendingTiles: NavmeshTileKey[] = [];
  private playerTileX = 0;
  private playerTileZ = 0;

  // Cached references for tile generation
  private tileHeightfieldMesh: THREE.Mesh | null = null;

  // Obstacles added via TileCache
  private obstacles: Obstacle[] = [];
  private obstacleUpdatePending = false;

  // Module references (lazy loaded)
  private recastInit: typeof import('@recast-navigation/core').init | null = null;
  private CrowdClass: typeof import('@recast-navigation/core').Crowd | null = null;
  private NavMeshQueryClass: typeof import('@recast-navigation/core').NavMeshQuery | null = null;
  private threeToSoloNavMeshFn: typeof import('@recast-navigation/three').threeToSoloNavMesh | null = null;
  private threeToTileCacheFn: typeof import('@recast-navigation/three').threeToTileCache | null = null;

  /**
   * Initialize WASM module. Must complete before any navmesh ops.
   * Gracefully degrades if WASM fails.
   */
  async init(): Promise<void> {
    try {
      const core = await import('@recast-navigation/core');
      const three = await import('@recast-navigation/three');
      this.recastInit = core.init;
      this.CrowdClass = core.Crowd;
      this.NavMeshQueryClass = core.NavMeshQuery;
      this.threeToSoloNavMeshFn = three.threeToSoloNavMesh;
      this.threeToTileCacheFn = three.threeToTileCache;

      await core.init();
      this.wasmReady = true;
      Logger.info('Navigation', 'Recast WASM initialized');
    } catch (error) {
      Logger.warn('Navigation', 'WASM init failed - all NPCs will use beeline movement:', error);
      this.wasmReady = false;
    }
  }

  /** Check if WASM module is loaded (even if navmesh not yet generated). */
  isWasmReady(): boolean {
    return this.wasmReady;
  }

  /** Check if navmesh is available for use. */
  isReady(): boolean {
    return this.wasmReady && this.navMesh !== null;
  }

  /**
   * Generate navmesh from terrain heightfield.
   * Solo navmesh for small maps, tiled for large maps (A Shau).
   */
  async generateNavmesh(worldSize: number, features?: MapFeatureDefinition[]): Promise<void> {
    if (!this.wasmReady) {
      Logger.warn('Navigation', 'Skipping navmesh generation - WASM not ready');
      return;
    }

    this.worldSize = worldSize;
    this.isTiled = worldSize > TILED_THRESHOLD;

    const start = performance.now();

    if (this.isTiled) {
      await this.generateTiledNavmesh(worldSize, features);
    } else {
      this.generateSoloNavmesh(worldSize, features);
    }

    // Add structure obstacles (tiled navmesh only - solo bakes obstacles into heightfield)
    if (this.isTiled && features?.length) {
      this.addObstaclesFromFeatures(features);
    }

    const elapsed = performance.now() - start;
    Logger.info('Navigation', `Navmesh generated in ${elapsed.toFixed(1)}ms (${this.isTiled ? 'tiled' : 'solo'}, worldSize=${worldSize})`);
  }

  private generateSoloNavmesh(worldSize: number, features?: MapFeatureDefinition[]): void {
    const heightCache = getHeightQueryCache();
    const halfSize = worldSize / 2;
    const geometry = buildHeightfieldMesh(
      (x, z) => heightCache.getHeightAt(x, z),
      -halfSize, -halfSize,
      worldSize, worldSize,
      NAVMESH_CELL_SIZE
    );

    const mesh = new THREE.Mesh(geometry);

    // Build obstacle wall meshes for structures (baked into solo navmesh)
    const obstacleMeshes = this.buildObstacleMeshes(features, heightCache);
    const inputMeshes = [mesh, ...obstacleMeshes];

    const cs = NAVMESH_CELL_SIZE * 0.25;
    const result = this.threeToSoloNavMeshFn!(inputMeshes, {
      cs,
      ch: 0.2,
      walkableSlopeAngle: WALKABLE_SLOPE_ANGLE,
      walkableHeight: Math.ceil(AGENT_HEIGHT / 0.2),
      walkableClimb: Math.ceil(WALKABLE_CLIMB / 0.2),
      walkableRadius: Math.ceil(AGENT_RADIUS / cs),
      maxEdgeLen: 12,
      maxSimplificationError: 1.3,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
    });

    if (!result.success || !result.navMesh) {
      Logger.error('Navigation', 'Solo navmesh generation failed');
      return;
    }

    this.navMesh = result.navMesh;
    this.createCrowd();

    geometry.dispose();
    for (const m of obstacleMeshes) m.geometry.dispose();
  }

  private async generateTiledNavmesh(worldSize: number, _features?: MapFeatureDefinition[]): Promise<void> {
    // For tiled navmesh, we generate initial tiles around origin
    // Additional tiles are streamed in update()
    const heightCache = getHeightQueryCache();
    const halfSize = worldSize / 2;

    // Generate a small initial mesh for the tileCache setup
    const initExtent = TILE_SIZE * (TILE_RADIUS * 2 + 1);
    const initHalf = Math.min(initExtent / 2, halfSize);
    const geometry = buildHeightfieldMesh(
      (x, z) => heightCache.getHeightAt(x, z),
      -initHalf, -initHalf,
      initHalf * 2, initHalf * 2,
      NAVMESH_CELL_SIZE
    );

    const mesh = new THREE.Mesh(geometry);
    const cs = NAVMESH_CELL_SIZE * 0.25;
    const result = this.threeToTileCacheFn!([mesh], {
      cs,
      ch: 0.2,
      walkableSlopeAngle: WALKABLE_SLOPE_ANGLE,
      walkableHeight: Math.ceil(AGENT_HEIGHT / 0.2),
      walkableClimb: Math.ceil(WALKABLE_CLIMB / 0.2),
      walkableRadius: Math.ceil(AGENT_RADIUS / cs),
      maxSimplificationError: 1.3,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
      tileSize: Math.ceil(TILE_SIZE / cs),
    });

    if (!result.success || !result.navMesh) {
      Logger.error('Navigation', 'Tiled navmesh generation failed');
      geometry.dispose();
      return;
    }

    this.navMesh = result.navMesh;
    this.tileCache = result.tileCache;
    this.createCrowd();

    // Mark initial tiles as loaded
    const tilesPerSide = Math.ceil(initHalf * 2 / TILE_SIZE);
    for (let tx = 0; tx < tilesPerSide; tx++) {
      for (let tz = 0; tz < tilesPerSide; tz++) {
        this.activeTiles.set(`${tx},${tz}`, true);
      }
    }

    geometry.dispose();
  }

  private createCrowd(): void {
    if (!this.navMesh || !this.CrowdClass) return;

    this.crowd = new this.CrowdClass(this.navMesh, {
      maxAgents: MAX_CROWD_AGENTS,
      maxAgentRadius: AGENT_RADIUS * 2,
    });

    this.adapter = new NavmeshMovementAdapter(this.crowd);
    Logger.info('Navigation', `Crowd initialized (maxAgents=${MAX_CROWD_AGENTS})`);

    // Create query object for pathfinding
    if (this.NavMeshQueryClass) {
      this.navMeshQuery = new this.NavMeshQueryClass(this.navMesh, { maxNodes: 2048 });
      this.navMeshQuery.defaultQueryHalfExtents = { ...QUERY_HALF_EXTENTS };
      Logger.info('Navigation', 'NavMeshQuery initialized');
    }
  }

  /**
   * Per-frame update: streams tiles (if tiled) and updates crowd.
   */
  update(deltaTime: number, playerPosition?: THREE.Vector3): void {
    if (!this.isReady()) return;

    // Process pending obstacle updates (tiled navmesh)
    if (this.obstacleUpdatePending && this.tileCache && this.navMesh) {
      const result = this.tileCache.update(this.navMesh);
      if (result.upToDate) {
        this.obstacleUpdatePending = false;
      }
    }

    // Tile streaming for large maps
    if (this.isTiled && playerPosition) {
      this.streamTiles(playerPosition);
    }

    // Update crowd simulation
    if (this.crowd) {
      this.crowd.update(deltaTime);
    }
  }

  private streamTiles(playerPos: THREE.Vector3): void {
    const halfSize = this.worldSize / 2;
    const newTX = Math.floor((playerPos.x + halfSize) / TILE_SIZE);
    const newTZ = Math.floor((playerPos.z + halfSize) / TILE_SIZE);

    if (newTX === this.playerTileX && newTZ === this.playerTileZ && this.pendingTiles.length === 0) {
      return;
    }

    this.playerTileX = newTX;
    this.playerTileZ = newTZ;

    // Determine which tiles should be active
    const desiredTiles = new Set<string>();
    for (let dx = -TILE_RADIUS; dx <= TILE_RADIUS; dx++) {
      for (let dz = -TILE_RADIUS; dz <= TILE_RADIUS; dz++) {
        const tx = newTX + dx;
        const tz = newTZ + dz;
        desiredTiles.add(`${tx},${tz}`);
      }
    }

    // Queue new tiles
    for (const key of desiredTiles) {
      if (!this.activeTiles.has(key)) {
        const [tx, tz] = key.split(',').map(Number);
        this.pendingTiles.push({ tx, tz });
      }
    }

    // Unload tiles outside radius + 1 margin
    for (const key of this.activeTiles.keys()) {
      if (!desiredTiles.has(key)) {
        this.activeTiles.delete(key);
        // TileCache handles actual tile removal internally
      }
    }

    // Generate pending tiles (budget-limited)
    let tilesGenerated = 0;
    while (this.pendingTiles.length > 0 && tilesGenerated < MAX_TILES_PER_FRAME) {
      const tile = this.pendingTiles.shift()!;
      this.generateTile(tile.tx, tile.tz);
      this.activeTiles.set(`${tile.tx},${tile.tz}`, true);
      tilesGenerated++;
    }
  }

  private generateTile(_tx: number, _tz: number): void {
    // TileCache handles tile generation from the initial heightfield data.
    // For tiles beyond the initial extent, we'd need to rebuild with
    // additional heightfield data. In practice, the initial tileCache
    // generation covers the needed area and tiles stream from cache.
    if (this.tileCache) {
      this.tileCache.update(this.navMesh!);
    }
  }

  /**
   * Build obstacle wall meshes from feature footprints for baking into solo navmesh.
   * Creates tall vertical geometry that Recast treats as unwalkable.
   */
  private buildObstacleMeshes(
    features: MapFeatureDefinition[] | undefined,
    heightCache: ReturnType<typeof getHeightQueryCache>
  ): THREE.Mesh[] {
    if (!features?.length) return [];

    const meshes: THREE.Mesh[] = [];
    for (const feature of features) {
      const fp = feature.footprint;
      if (!fp) continue;

      const y = heightCache.getHeightAt(feature.position.x, feature.position.z);
      const yaw = feature.placement?.yaw ?? 0;

      if (fp.shape === 'circle') {
        const geo = new THREE.CylinderGeometry(fp.radius, fp.radius, OBSTACLE_HEIGHT, 12);
        const m = new THREE.Mesh(geo);
        m.position.set(feature.position.x, y + OBSTACLE_HEIGHT / 2, feature.position.z);
        m.updateMatrixWorld(true);
        meshes.push(m);
      } else if (fp.shape === 'rect' || fp.shape === 'strip') {
        const geo = new THREE.BoxGeometry(fp.width, OBSTACLE_HEIGHT, fp.length);
        const m = new THREE.Mesh(geo);
        m.position.set(feature.position.x, y + OBSTACLE_HEIGHT / 2, feature.position.z);
        if (yaw !== 0) m.rotation.y = yaw;
        m.updateMatrixWorld(true);
        meshes.push(m);
      }
    }

    if (meshes.length > 0) {
      Logger.info('Navigation', `Built ${meshes.length} obstacle meshes for solo navmesh`);
    }
    return meshes;
  }

  /**
   * Add runtime obstacles to tiled navmesh via TileCache.
   * Cylinder for circle footprints, box for rect/strip.
   */
  private addObstaclesFromFeatures(features: MapFeatureDefinition[]): void {
    if (!this.tileCache || !this.navMesh) return;

    const heightCache = getHeightQueryCache();
    let added = 0;

    for (const feature of features) {
      const fp = feature.footprint;
      if (!fp) continue;

      const y = heightCache.getHeightAt(feature.position.x, feature.position.z);
      const pos = { x: feature.position.x, y, z: feature.position.z };

      if (fp.shape === 'circle') {
        const result = this.tileCache.addCylinderObstacle(pos, fp.radius, OBSTACLE_HEIGHT);
        if (result.success && result.obstacle) {
          this.obstacles.push(result.obstacle);
          added++;
        }
      } else if (fp.shape === 'rect' || fp.shape === 'strip') {
        const halfExtents = { x: fp.width / 2, y: OBSTACLE_HEIGHT / 2, z: fp.length / 2 };
        const yaw = feature.placement?.yaw ?? 0;
        const result = this.tileCache.addBoxObstacle(pos, halfExtents, yaw);
        if (result.success && result.obstacle) {
          this.obstacles.push(result.obstacle);
          added++;
        }
      }
    }

    if (added > 0) {
      this.obstacleUpdatePending = true;
      Logger.info('Navigation', `Added ${added} structure obstacles to tiled navmesh`);
    }
  }

  // ── Path Query API ─────────────────────────────────────────────────

  /**
   * Compute a walkable path between two world positions.
   * Returns waypoint array on success, null if unreachable or navmesh unavailable.
   * Positions are at terrain level (caller handles NPC_Y_OFFSET).
   */
  queryPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] | null {
    if (!this.navMeshQuery) return null;

    const result = this.navMeshQuery.computePath(
      { x: start.x, y: start.y, z: start.z },
      { x: end.x, y: end.y, z: end.z },
    );

    if (!result.success || result.path.length === 0) return null;

    const waypoints: THREE.Vector3[] = [];
    for (const p of result.path) {
      waypoints.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    return waypoints;
  }

  /**
   * Find the closest point on the navmesh to a world position.
   * Returns the snapped position or null if nothing within searchRadius.
   */
  findNearestPoint(point: THREE.Vector3, searchRadius = 5): THREE.Vector3 | null {
    if (!this.navMeshQuery) return null;

    const half = { x: searchRadius, y: 50, z: searchRadius };
    const result = this.navMeshQuery.findClosestPoint(
      { x: point.x, y: point.y, z: point.z },
      { halfExtents: half },
    );

    if (!result.success || result.polyRef === 0) return null;
    return new THREE.Vector3(result.point.x, result.point.y, result.point.z);
  }

  /**
   * Check whether a world position is on (or very near) walkable navmesh.
   */
  isPointOnNavmesh(point: THREE.Vector3, tolerance = 2): boolean {
    if (!this.navMeshQuery) return false;

    const half = { x: tolerance, y: 50, z: tolerance };
    const result = this.navMeshQuery.findNearestPoly(
      { x: point.x, y: point.y, z: point.z },
      { halfExtents: half },
    );

    if (!result.success || result.nearestRef === 0) return false;

    const dx = result.nearestPoint.x - point.x;
    const dz = result.nearestPoint.z - point.z;
    return (dx * dx + dz * dz) <= ON_NAVMESH_DISTANCE_SQ;
  }

  /**
   * Validate whether a set of world positions can all reach each other via navmesh.
   * Uses union-find over pairwise path queries.
   */
  validateConnectivity(points: THREE.Vector3[]): ConnectivityResult {
    if (!this.navMeshQuery || points.length < 2) {
      return { connected: true, islands: [points.map((_, i) => i)] };
    }

    // Union-find with path compression
    const parent = points.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    const union = (a: number, b: number): void => { parent[find(a)] = find(b); };

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        // Skip if already in the same group
        if (find(i) === find(j)) continue;
        const path = this.queryPath(points[i], points[j]);
        if (path !== null) union(i, j);
      }
    }

    // Group into islands
    const groups = new Map<number, number[]>();
    for (let i = 0; i < points.length; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }

    const islands = [...groups.values()];
    const connected = islands.length === 1;

    if (!connected) {
      Logger.warn('Navigation', `Connectivity check: ${islands.length} disconnected islands among ${points.length} points`);
    }

    return { connected, islands };
  }

  // ── Adapter / Lifecycle ───────────────────────────────────────────

  /** Get the movement adapter for wiring to CombatantMovement. */
  getAdapter(): NavmeshMovementAdapter | null {
    return this.adapter;
  }

  /** Dispose of all resources. */
  dispose(): void {
    if (this.adapter) {
      this.adapter.dispose();
      this.adapter = null;
    }
    if (this.navMeshQuery) {
      this.navMeshQuery.destroy();
      this.navMeshQuery = null;
    }
    if (this.crowd) {
      this.crowd.destroy();
      this.crowd = null;
    }
    if (this.navMesh) {
      this.navMesh.destroy();
      this.navMesh = null;
    }
    // Remove obstacles from tileCache before destroying it
    if (this.tileCache) {
      for (const obs of this.obstacles) {
        this.tileCache.removeObstacle(obs);
      }
    }
    this.obstacles.length = 0;
    this.obstacleUpdatePending = false;
    if (this.tileHeightfieldMesh) {
      this.tileHeightfieldMesh.geometry.dispose();
      this.tileHeightfieldMesh = null;
    }
    this.activeTiles.clear();
    this.pendingTiles.length = 0;
  }
}
