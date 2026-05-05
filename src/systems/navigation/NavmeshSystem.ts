import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import { buildHeightfieldMesh } from './NavmeshHeightfieldBuilder';
import { NavmeshMovementAdapter } from './NavmeshMovementAdapter';
import { computeNavmeshCacheKey, getCachedNavmesh, setCachedNavmesh } from './NavmeshCache';
import { buildNavmeshFeatureObstacleMeshes } from './NavmeshFeatureObstacles';

import type { Crowd, NavMesh, NavMeshQuery } from '@recast-navigation/core';
import type { MapFeatureDefinition } from '../../config/gameModeTypes';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

/** Result of a connectivity validation across multiple points. */
interface ConnectivityResult {
  /** True if all points can reach each other via navmesh paths. */
  connected: boolean;
  /** Groups of point indices that can reach each other. Single group = fully connected. */
  islands: number[][];
}

interface NavmeshGenerationOptions {
  /** Scenario points that must be inside the initial/generated navmesh coverage. */
  anchors?: THREE.Vector3[];
  /** Terrain/feature fingerprint used to avoid reusing stale runtime navmesh cache entries. */
  cacheFingerprint?: unknown;
}

interface TiledGenerationBounds {
  originX: number;
  originZ: number;
  extentX: number;
  extentZ: number;
  minTileX: number;
  maxTileX: number;
  minTileZ: number;
  maxTileZ: number;
}

type NavmeshGenerationMode = 'none' | 'solo' | 'static-tiled';

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
const TILED_GENERATION_MIN_EXTENT = TILE_SIZE * (TILE_RADIUS * 2 + 1);
const TILED_ANCHOR_MARGIN = TILE_SIZE * 2;

// Threshold: maps strictly larger than this use tiled navmesh.
// Open Frontier (3200m) stays on solo - tiled is only needed for A Shau (21136m).
const TILED_THRESHOLD = 3200;

// Memory safety: if estimated voxel memory exceeds this, force tiled build.
const SOLO_MEMORY_LIMIT_MB = 300;
// Approximate bytes per voxel column (compact heightfield + contour + poly mesh overhead).
const BYTES_PER_VOXEL_COLUMN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Scale navmesh cell size (cs) with world size to keep voxel grid bounded.
 * Small maps need fine resolution for structure navigation; large open maps don't.
 */
function getNavmeshCellSize(worldSize: number): number {
  if (worldSize <= 800) return 1.0;
  if (worldSize <= 1600) return 1.5;
  return 3.0; // 3200m at cs=3.0 -> 1067x1067 = 1.14M columns (was 2.56M at cs=2.0)
}

/**
 * Scale heightfield mesh sampling to match navmesh resolution.
 * No point sampling terrain finer than the navmesh can represent.
 */
function getHeightfieldCellSize(worldSize: number): number {
  if (worldSize <= 800) return NAVMESH_CELL_SIZE;   // 4.0
  if (worldSize <= 1600) return 6.0;
  return 12.0; // 3200/12 = 267x267 = 71K verts (was 161K at cellSize=8)
}

// Worker generation timeout (ms)
const WORKER_TIMEOUT_MS = 60_000;

/**
 * Top-level system owning navmesh lifecycle and crowd simulation.
 *
 * Gracefully degrades to beeline-only movement if WASM fails to load.
 */
export class NavmeshSystem {
  private navMesh: NavMesh | null = null;
  private navMeshQuery: NavMeshQuery | null = null;
  private crowd: Crowd | null = null;
  private adapter: NavmeshMovementAdapter | null = null;
  private wasmReady = false;
  private worldSize = 0;
  private generationMode: NavmeshGenerationMode = 'none';
  private terrainSystem?: Pick<ITerrainRuntime, 'getHeightAt'>;

  // Cached references for generated mesh geometry disposal
  private tileHeightfieldMesh: THREE.Mesh | null = null;

  // Worker state
  private navmeshWorker: Worker | null = null;
  private workerReady = false;
  private pendingGeneration: {
    resolve: (data: Uint8Array) => void;
    reject: (err: Error) => void;
  } | null = null;

  // Module references (lazy loaded)
  private recastInit: typeof import('@recast-navigation/core').init | null = null;
  private CrowdClass: typeof import('@recast-navigation/core').Crowd | null = null;
  private NavMeshQueryClass: typeof import('@recast-navigation/core').NavMeshQuery | null = null;
  private threeToSoloNavMeshFn: typeof import('@recast-navigation/three').threeToSoloNavMesh | null = null;
  private threeToTiledNavMeshFn: typeof import('@recast-navigation/three').threeToTiledNavMesh | null = null;
  private getPositionsAndIndicesFn: typeof import('@recast-navigation/three').getPositionsAndIndices | null = null;
  private importNavMeshFn: typeof import('@recast-navigation/core').importNavMesh | null = null;

  private initPromise: Promise<void> | null = null;

  /**
   * Initialize WASM module. Must complete before any navmesh ops.
   * Gracefully degrades if WASM fails. Idempotent - safe to call multiple times.
   * @param skipWorker If true, don't spawn the navmesh worker (used when pre-baked asset is expected).
   */
  async init(skipWorker = false): Promise<void> {
    if (this.wasmReady) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit(skipWorker);
    return this.initPromise;
  }

  private async doInit(skipWorker: boolean): Promise<void> {
    try {
      const core = await import('@recast-navigation/core');
      this.recastInit = core.init;
      this.CrowdClass = core.Crowd;
      this.NavMeshQueryClass = core.NavMeshQuery;
      this.importNavMeshFn = core.importNavMesh;

      // Only load @recast-navigation/three and spawn worker if we might generate at runtime
      if (!skipWorker) {
        const three = await import('@recast-navigation/three');
        this.threeToSoloNavMeshFn = three.threeToSoloNavMesh;
        this.threeToTiledNavMeshFn = three.threeToTiledNavMesh;
        this.getPositionsAndIndicesFn = three.getPositionsAndIndices;
      }

      await core.init();
      this.wasmReady = true;
      Logger.info('Navigation', 'Recast WASM initialized');

      if (!skipWorker) {
        this.spawnWorker();
      }
    } catch (error) {
      Logger.warn('Navigation', 'WASM init failed - all NPCs will use beeline movement:', error);
      this.wasmReady = false;
    }
  }

  private spawnWorker(): void {
    try {
      this.navmeshWorker = new Worker(
        new URL('../../workers/navmesh.worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.navmeshWorker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          this.workerReady = true;
          Logger.info('Navigation', 'Navmesh worker ready');
        } else if (msg.type === 'result') {
          this.pendingGeneration?.resolve(msg.navMeshData);
          this.pendingGeneration = null;
        } else if (msg.type === 'error') {
          this.pendingGeneration?.reject(new Error(msg.message));
          this.pendingGeneration = null;
        }
      };

      this.navmeshWorker.onerror = (err) => {
        Logger.warn('Navigation', 'Navmesh worker error:', err.message);
        this.workerReady = false;
        this.pendingGeneration?.reject(new Error('Worker crashed'));
        this.pendingGeneration = null;
      };
    } catch (err) {
      Logger.warn('Navigation', 'Failed to spawn navmesh worker, will use main thread:', err);
      this.workerReady = false;
    }
  }

  /** Check if WASM module is loaded (even if navmesh not yet generated). */
  isWasmReady(): boolean {
    return this.wasmReady;
  }

  setTerrainSystem(terrainSystem: Pick<ITerrainRuntime, 'getHeightAt'>): void {
    this.terrainSystem = terrainSystem;
  }

  /** Check if navmesh is available for use. */
  isReady(): boolean {
    return this.wasmReady && this.navMesh !== null;
  }

  /**
   * Load a pre-baked navmesh binary from a static asset URL.
   * Returns true on success, false if fetch fails or asset is missing.
   */
  async loadPrebakedNavmesh(assetUrl: string, worldSize: number): Promise<boolean> {
    if (!this.wasmReady || !this.importNavMeshFn) {
      Logger.warn('Navigation', 'Cannot load pre-baked navmesh - WASM not ready');
      return false;
    }

    try {
      const response = await fetch(assetUrl);
      if (!response.ok) {
        Logger.warn('Navigation', `Pre-baked navmesh fetch failed: ${response.status} ${assetUrl}`);
        return false;
      }

      const buffer = await response.arrayBuffer();
      const navMeshData = new Uint8Array(buffer);
      const imported = this.importNavMeshFn(navMeshData);

      this.navMesh = imported.navMesh;
      this.worldSize = worldSize;
      this.generationMode = 'solo';
      this.createCrowd();

      Logger.info('Navigation', `Pre-baked navmesh loaded: ${(navMeshData.byteLength / 1024).toFixed(1)}KB from ${assetUrl}`);
      return true;
    } catch (error) {
      Logger.warn('Navigation', `Pre-baked navmesh load failed:`, error);
      return false;
    }
  }

  /**
   * Generate navmesh from terrain heightfield.
   * Tries pre-baked asset first if navmeshAsset is provided.
   * Solo navmesh for small maps, tiled for large maps (A Shau).
   */
  async generateNavmesh(
    worldSize: number,
    features?: MapFeatureDefinition[],
    navmeshAsset?: string,
    options: NavmeshGenerationOptions = {},
  ): Promise<boolean> {
    if (!this.wasmReady) {
      Logger.warn('Navigation', 'Skipping navmesh generation - WASM not ready');
      return false;
    }

    // Try pre-baked asset first
    if (navmeshAsset) {
      const loaded = await this.loadPrebakedNavmesh(navmeshAsset, worldSize);
      if (loaded) return true;
      Logger.warn('Navigation', 'Pre-baked navmesh unavailable; generating the explicit runtime navmesh for this mode');
    }

    this.worldSize = worldSize;
    this.generationMode = 'none';

    const start = performance.now();

    let generated = false;
    if (worldSize > TILED_THRESHOLD) {
      generated = await this.generateTiledNavmesh(worldSize, features, options);
    } else {
      generated = await this.generateSoloNavmesh(worldSize, features, options.cacheFingerprint);
    }

    if (!generated) {
      Logger.error(
        'Navigation',
        `Navmesh generation failed with no fallback retry (worldSize=${worldSize}, features=${features?.length ?? 0}, mode=${worldSize > TILED_THRESHOLD ? 'static-tiled' : 'solo'})`,
      );
      return false;
    }

    const elapsed = performance.now() - start;
    const mode = this.generationMode === 'none'
      ? (worldSize > TILED_THRESHOLD ? 'static-tiled' : 'solo')
      : this.generationMode;
    Logger.info('Navigation', `Navmesh generated in ${elapsed.toFixed(1)}ms (${mode}, worldSize=${worldSize})`);
    return true;
  }

  private async generateSoloNavmesh(
    worldSize: number,
    features?: MapFeatureDefinition[],
    cacheFingerprint: unknown = null,
  ): Promise<boolean> {
    const cs = getNavmeshCellSize(worldSize);
    const hfCellSize = getHeightfieldCellSize(worldSize);

    // Memory guard: estimate voxel grid and abort if too large for solo build
    const voxelColumns = Math.ceil(worldSize / cs) * Math.ceil(worldSize / cs);
    const estimatedMB = voxelColumns * BYTES_PER_VOXEL_COLUMN / (1024 * 1024);
    if (estimatedMB > SOLO_MEMORY_LIMIT_MB) {
      Logger.warn(
        'Navigation',
        `Solo navmesh would require ~${estimatedMB.toFixed(0)}MB (${voxelColumns.toLocaleString()} voxel columns) - exceeds ${SOLO_MEMORY_LIMIT_MB}MB limit`
      );
      return false;
    }

    // Build Recast config
    const isLargeWorld = worldSize > 1600;
    const ch = isLargeWorld ? 0.4 : 0.2;
    const recastConfig: Record<string, number> = {
      cs,
      ch,
      walkableSlopeAngle: WALKABLE_SLOPE_ANGLE,
      walkableHeight: Math.ceil(AGENT_HEIGHT / ch),
      walkableClimb: Math.ceil(WALKABLE_CLIMB / ch),
      walkableRadius: Math.ceil(AGENT_RADIUS / cs),
      maxEdgeLen: isLargeWorld ? 24 : 12,
      maxSimplificationError: 1.3,
      minRegionArea: isLargeWorld ? 16 : 8,
      mergeRegionArea: isLargeWorld ? 40 : 20,
      maxVertsPerPoly: 6,
      detailSampleDist: isLargeWorld ? 12 : 6,
      detailSampleMaxError: 1,
    };

    // Check IndexedDB cache
    let cacheKey: string | null = null;
    try {
      cacheKey = await computeNavmeshCacheKey(worldSize, recastConfig, cacheFingerprint);
      const cached = await getCachedNavmesh(cacheKey);
      if (cached && this.importNavMeshFn) {
        const imported = this.importNavMeshFn(cached);
        this.navMesh = imported.navMesh;
        this.createCrowd();
        Logger.info('Navigation', `Navmesh loaded from cache (worldSize=${worldSize})`);
        return true;
      }
    } catch {
      // Cache miss or error - proceed to generation
    }

    const sampleHeight = this.getTerrainHeightSampler();
    if (!sampleHeight) {
      return false;
    }
    const halfSize = worldSize / 2;
    const geometry = buildHeightfieldMesh(
      sampleHeight,
      -halfSize, -halfSize,
      worldSize, worldSize,
      hfCellSize
    );

    const mesh = new THREE.Mesh(geometry);

    // Build obstacle wall meshes for structures (baked into solo navmesh)
    const obstacleMeshes = buildNavmeshFeatureObstacleMeshes(features, sampleHeight);
    const inputMeshes = [mesh, ...obstacleMeshes];

    // Try off-thread generation via worker
    if (this.workerReady && this.getPositionsAndIndicesFn && this.importNavMeshFn) {
      try {
        const workerResult = await this.generateViaWorker(inputMeshes, recastConfig, cacheKey);
        geometry.dispose();
        for (const m of obstacleMeshes) m.geometry.dispose();
        return workerResult;
      } catch (error) {
        Logger.warn('Navigation', 'Worker navmesh generation failed, falling back to main thread:', error);
        this.pendingGeneration = null;
        this.workerReady = false;
      }
    }

    // Fallback: main-thread generation
    const result = this.threeToSoloNavMeshFn!(inputMeshes, recastConfig);

    if (!result.success || !result.navMesh) {
      Logger.error(
        'Navigation',
        'Solo navmesh generation failed',
        result.success ? 'No navMesh returned' : result.error,
      );
      geometry.dispose();
      for (const m of obstacleMeshes) m.geometry.dispose();
      return false;
    }

    this.navMesh = result.navMesh;
    this.generationMode = 'solo';
    this.createCrowd();

    geometry.dispose();
    for (const m of obstacleMeshes) m.geometry.dispose();
    return true;
  }

  private async generateViaWorker(
    inputMeshes: THREE.Mesh[],
    recastConfig: Record<string, number>,
    cacheKey: string | null,
  ): Promise<boolean> {
    // Extract raw geometry arrays on main thread
    const [positions, indices] = this.getPositionsAndIndicesFn!(inputMeshes);

    // Send to worker with transferable buffers
    const navMeshData = await new Promise<Uint8Array>((resolve, reject) => {
      this.pendingGeneration = { resolve, reject };

      const timeoutId = setTimeout(() => {
        if (this.pendingGeneration) {
          this.pendingGeneration = null;
          this.navmeshWorker?.terminate();
          this.navmeshWorker = null;
          this.workerReady = false;
          reject(new Error('Worker timed out'));
        }
      }, WORKER_TIMEOUT_MS);

      // Clear timeout when resolved/rejected
      const origResolve = resolve;
      const origReject = reject;
      this.pendingGeneration = {
        resolve: (data) => { clearTimeout(timeoutId); origResolve(data); },
        reject: (err) => { clearTimeout(timeoutId); origReject(err); },
      };

      this.navmeshWorker!.postMessage(
        { type: 'generate', requestId: 1, positions, indices, config: recastConfig },
        [positions.buffer, indices.buffer],
      );
    });

    // Reconstruct NavMesh from serialized data on main thread
    const imported = this.importNavMeshFn!(navMeshData);
    this.navMesh = imported.navMesh;
    this.createCrowd();

    // Fire-and-forget cache write
    if (cacheKey) {
      setCachedNavmesh(cacheKey, navMeshData).catch(() => {});
    }

    Logger.info('Navigation', 'Navmesh generated via worker');
    return true;
  }

  private getTiledGenerationBounds(worldSize: number, anchors?: THREE.Vector3[]): TiledGenerationBounds {
    const halfSize = worldSize / 2;
    const minWorld = -halfSize;
    const maxWorld = halfSize;
    const minExtent = Math.min(TILED_GENERATION_MIN_EXTENT, worldSize);
    const finiteAnchors = anchors?.filter(anchor =>
      Number.isFinite(anchor.x) && Number.isFinite(anchor.z)
    ) ?? [];

    if (finiteAnchors.length === 0) {
      const initHalf = minExtent / 2;
      const originX = -initHalf;
      const originZ = -initHalf;
      return this.toTiledGenerationBounds(worldSize, originX, originZ, minExtent, minExtent);
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const anchor of finiteAnchors) {
      minX = Math.min(minX, anchor.x);
      maxX = Math.max(maxX, anchor.x);
      minZ = Math.min(minZ, anchor.z);
      maxZ = Math.max(maxZ, anchor.z);
    }

    minX = clamp(minX - TILED_ANCHOR_MARGIN, minWorld, maxWorld);
    maxX = clamp(maxX + TILED_ANCHOR_MARGIN, minWorld, maxWorld);
    minZ = clamp(minZ - TILED_ANCHOR_MARGIN, minWorld, maxWorld);
    maxZ = clamp(maxZ + TILED_ANCHOR_MARGIN, minWorld, maxWorld);

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const extentX = Math.min(Math.max(maxX - minX, minExtent), worldSize);
    const extentZ = Math.min(Math.max(maxZ - minZ, minExtent), worldSize);
    const originX = clamp(centerX - extentX / 2, minWorld, maxWorld - extentX);
    const originZ = clamp(centerZ - extentZ / 2, minWorld, maxWorld - extentZ);

    return this.toTiledGenerationBounds(worldSize, originX, originZ, extentX, extentZ);
  }

  private toTiledGenerationBounds(
    worldSize: number,
    originX: number,
    originZ: number,
    extentX: number,
    extentZ: number,
  ): TiledGenerationBounds {
    const halfSize = worldSize / 2;
    const maxTile = Math.max(0, Math.ceil(worldSize / TILE_SIZE) - 1);
    const minTileX = clamp(Math.floor((originX + halfSize) / TILE_SIZE), 0, maxTile);
    const maxTileX = clamp(Math.floor((originX + extentX + halfSize) / TILE_SIZE), 0, maxTile);
    const minTileZ = clamp(Math.floor((originZ + halfSize) / TILE_SIZE), 0, maxTile);
    const maxTileZ = clamp(Math.floor((originZ + extentZ + halfSize) / TILE_SIZE), 0, maxTile);

    return {
      originX,
      originZ,
      extentX,
      extentZ,
      minTileX,
      maxTileX,
      minTileZ,
      maxTileZ,
    };
  }

  private async generateTiledNavmesh(
    worldSize: number,
    features?: MapFeatureDefinition[],
    options: NavmeshGenerationOptions = {},
  ): Promise<boolean> {
    if (!this.threeToTiledNavMeshFn) {
      Logger.error('Navigation', 'Cannot generate static tiled navmesh before @recast-navigation/three is loaded');
      return false;
    }

    // For large scenarios, generate explicit static coverage around gameplay
    // anchors instead of assuming world origin contains useful navigation.
    const sampleHeight = this.getTerrainHeightSampler();
    if (!sampleHeight) {
      return false;
    }

    const bounds = this.getTiledGenerationBounds(worldSize, options.anchors);
    const hfCellSize = getHeightfieldCellSize(worldSize);
    const geometry = buildHeightfieldMesh(
      sampleHeight,
      bounds.originX, bounds.originZ,
      bounds.extentX, bounds.extentZ,
      hfCellSize
    );

    const mesh = new THREE.Mesh(geometry);
    const cs = getNavmeshCellSize(worldSize);
    const isLargeWorld = worldSize > 1600;
    const ch = isLargeWorld ? 0.4 : 0.2;
    const tileSize = Math.ceil(TILE_SIZE / cs);
    const recastConfig = {
      cs,
      ch,
      walkableSlopeAngle: WALKABLE_SLOPE_ANGLE,
      walkableHeight: Math.ceil(AGENT_HEIGHT / ch),
      walkableClimb: Math.ceil(WALKABLE_CLIMB / ch),
      walkableRadius: Math.ceil(AGENT_RADIUS / cs),
      maxSimplificationError: 1.3,
      mergeRegionArea: isLargeWorld ? 40 : 20,
      maxVertsPerPoly: 6,
      detailSampleDist: isLargeWorld ? 12 : 6,
      detailSampleMaxError: 1,
      tileSize,
    };
    Logger.info(
      'Navigation',
      `Static tiled navmesh generation bounds origin=(${bounds.originX.toFixed(0)},${bounds.originZ.toFixed(0)}) extent=(${bounds.extentX.toFixed(0)},${bounds.extentZ.toFixed(0)}) anchors=${options.anchors?.length ?? 0} tileSize=${tileSize}`,
    );
    const obstacleMeshes = buildNavmeshFeatureObstacleMeshes(features, sampleHeight);
    const inputMeshes = [mesh, ...obstacleMeshes];
    const result = this.threeToTiledNavMeshFn(inputMeshes, recastConfig);

    if (!result.success || !result.navMesh) {
      const boundsSummary = `bounds origin=(${bounds.originX.toFixed(0)},${bounds.originZ.toFixed(0)}) extent=(${bounds.extentX.toFixed(0)},${bounds.extentZ.toFixed(0)}) anchors=${options.anchors?.length ?? 0}`;
      Logger.error(
        'Navigation',
        'Static tiled navmesh generation failed',
        `${result.success ? 'No navMesh returned' : result.error}; ${boundsSummary}`,
      );
      geometry.dispose();
      for (const obstacleMesh of obstacleMeshes) obstacleMesh.geometry.dispose();
      return false;
    }

    this.navMesh = result.navMesh;
    this.generationMode = 'static-tiled';
    this.createCrowd();

    geometry.dispose();
    for (const obstacleMesh of obstacleMeshes) obstacleMesh.geometry.dispose();
    Logger.info(
      'Navigation',
      'Static tiled navmesh generated for large terrain with structure footprints baked into input geometry.',
    );
    return true;
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

  /** Per-frame update: updates crowd simulation. */
  update(deltaTime: number, _playerPosition?: THREE.Vector3): void {
    if (!this.isReady()) return;

    // Update crowd simulation
    if (this.crowd) {
      this.crowd.update(deltaTime);
    }
  }

  private getTerrainHeightSampler(): ((x: number, z: number) => number) | null {
    if (!this.terrainSystem) {
      Logger.warn('Navigation', 'Cannot generate navmesh before TerrainSystem is connected');
      return null;
    }
    return (x, z) => this.terrainSystem!.getHeightAt(x, z);
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
    this.navmeshWorker?.terminate();
    this.navmeshWorker = null;
    this.workerReady = false;
    this.pendingGeneration = null;

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
    if (this.tileHeightfieldMesh) {
      this.tileHeightfieldMesh.geometry.dispose();
      this.tileHeightfieldMesh = null;
    }
  }
}
