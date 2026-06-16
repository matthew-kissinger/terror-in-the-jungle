// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import {
  CDLODQuadtree,
  type CDLODSelectionStats,
  type CDLODTile,
  type FrustumPlane,
  type TerrainTileHeightBounds,
} from './CDLODQuadtree';
import { CDLODRenderer } from './CDLODRenderer';
import { computeTerrainShadowBoundRadius } from './TerrainShadowBounds';
import { updateTerrainMaterialMorphCamera } from './TerrainMaterial';

export interface TerrainDebugTile {
  x: number;
  z: number;
  size: number;
  lodLevel: number;
  morphFactor: number;
  edgeMorphMask?: number;
  edgeSkirtMask?: number;
}

interface TerrainRenderRuntimeConfig {
  worldSize: number;
  visualMargin: number;
  maxLODLevels: number;
  lodRanges: number[];
  tileResolution: number;
}

export interface TerrainRenderSelectionSyncResult {
  didSync: boolean;
  reason: 'current' | 'stale' | 'uninitialized';
  selectionRechecked: boolean;
  poseWasStale: boolean;
  projectionChanged: boolean;
  positionDeltaMeters: number;
  rotationDeltaDeg: number;
  tileCount: number;
  tileSelectionSaturated?: boolean;
  terrainBufferSubmitted: boolean;
  submissionClassification: TerrainRenderSubmissionClassification | null;
}

export type TerrainRenderSubmissionOrigin = 'regular' | 'late-sync';
export type TerrainRenderSubmissionClassification =
  | 'initial'
  | 'forced'
  | 'tile-set-changed'
  | 'dynamics-changed'
  | 'same-identity';

export interface TerrainRenderSubmissionStats {
  instanceSubmissions: number;
  regularInstanceSubmissions: number;
  lateSyncInstanceSubmissions: number;
  lateSyncSameIdentitySubmissions: number;
  lateSyncDynamicsChangedSubmissions: number;
  lateSyncTileSetChangedSubmissions: number;
  unchangedSubmissionSkips: number;
  lastSubmissionSkipped: boolean;
  lastSubmissionOrigin: TerrainRenderSubmissionOrigin | null;
  lastSubmissionClassification: TerrainRenderSubmissionClassification | null;
  regularSelectionCount: number;
  lateSyncSelectionRechecks: number;
  lastSelectionMs: number;
  lastUpdateInstancesMs: number;
  forceInstanceUploadEnabled: boolean;
  forcedInstanceSubmissions: number;
  heightAwareFrustumEnabled: boolean;
  selectionNodesVisited: number;
  selectionFrustumTests: number;
  selectionFrustumRejectedNodes: number;
  selectionHeightBoundsTests: number;
  selectionHeightBoundsFallbacks: number;
  selectionHeightBoundsRejectedNodes: number;
  boundedShadowPassEnabled: boolean;
  shadowCenterX: number;
  shadowCenterZ: number;
  shadowRadiusMeters: number;
  shadowPrefixInstances: number;
  lastMainPassInstances: number;
  lastShadowPassInstances: number;
  lastMainPassEdgeSkirtInstances: number;
  lastShadowPassEdgeSkirtInstances: number;
  shadowPassReductions: number;
  edgeShadowPassReductions: number;
  sparseEdgeSkirtsEnabled: boolean;
  tileInteriorTriangles: number;
  tileSkirtTriangles: number;
  tileSkirtTrianglesPerEdge: number;
  tileTotalTriangles: number;
  tileFullSkirtTriangles: number;
  lastMainPassTriangleEstimate: number;
  lastShadowPassTriangleEstimate: number;
}

const CAMERA_RENDER_SYNC_POSITION_EPSILON_METERS = 0;
const CAMERA_RENDER_SYNC_ROTATION_EPSILON_RAD = THREE.MathUtils.degToRad(0.01);
const CAMERA_SELECTION_PROJECTION_EPSILON = 1e-7;

function readBooleanQueryFlag(name: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value === null) return false;
    const normalized = value.toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  } catch {
    return false;
  }
}

export function isTerrainForceInstanceUploadEnabled(): boolean {
  return (import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1')
    && readBooleanQueryFlag('terrainForceInstanceUpload');
}

export function isTerrainHeightAwareFrustumEnabled(): boolean {
  return !readBooleanQueryFlag('perfDisableTerrainHeightAwareFrustum');
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

const HEIGHT_BOUNDS_MIN_PAD_METERS = 96;
const HEIGHT_BOUNDS_SKIRT_PAD_METERS = 48;
const HEIGHT_BOUNDS_TILE_PAD_FRACTION = 0.06;
const HEIGHT_BOUNDS_MAX_PAD_METERS = 640;
/**
 * Owns camera frustum extraction, quadtree tile selection, and instanced terrain draw submission.
 */
export class TerrainRenderRuntime {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly frustumPlanes: FrustumPlane[] = [
    { nx: 0, ny: 0, nz: 0, d: 0 },
    { nx: 0, ny: 0, nz: 0, d: 0 },
    { nx: 0, ny: 0, nz: 0, d: 0 },
    { nx: 0, ny: 0, nz: 0, d: 0 },
    { nx: 0, ny: 0, nz: 0, d: 0 },
    { nx: 0, ny: 0, nz: 0, d: 0 },
  ];
  private readonly frustum = new THREE.Frustum();
  private readonly projScreenMatrix = new THREE.Matrix4();

  private config: TerrainRenderRuntimeConfig;
  private quadtree: CDLODQuadtree;
  private renderer: CDLODRenderer;
  private readonly terrainHeightAt?: (x: number, z: number) => number;
  private readonly shadowLight: THREE.DirectionalLight | null;
  private cameraOverride: THREE.PerspectiveCamera | null = null;
  private readonly lastSelectedTiles: TerrainDebugTile[] = [];
  private readonly debugTilePool: TerrainDebugTile[] = [];
  private readonly lastSelectionPosition = new THREE.Vector3();
  private readonly lastSelectionQuaternion = new THREE.Quaternion();
  private readonly lastSelectionProjectionMatrix = new THREE.Matrix4();
  private readonly lastSelectedTileEdgeMorphMasks: number[] = [];
  private readonly lastSelectedTileEdgeSkirtMasks: number[] = [];
  private lastSelectionCamera: THREE.Camera | null = null;
  private hasSelectionPose = false;
  private instanceSubmissions = 0;
  private regularInstanceSubmissions = 0;
  private lateSyncInstanceSubmissions = 0;
  private lateSyncSameIdentitySubmissions = 0;
  private lateSyncDynamicsChangedSubmissions = 0;
  private lateSyncTileSetChangedSubmissions = 0;
  private unchangedSubmissionSkips = 0;
  private lastSubmissionSkipped = false;
  private lastSubmissionOrigin: TerrainRenderSubmissionOrigin | null = null;
  private lastSubmissionClassification: TerrainRenderSubmissionClassification | null = null;
  private regularSelectionCount = 0;
  private lateSyncSelectionRechecks = 0;
  private lastSelectionMs = 0;
  private lastUpdateInstancesMs = 0;
  private forcedInstanceSubmissions = 0;
  private lastTileSelectionSaturated = false;
  private lastSelectionStats: CDLODSelectionStats | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    private readonly material: THREE.Material,
    config: TerrainRenderRuntimeConfig,
    terrainHeightAt?: (x: number, z: number) => number,
    shadowLight?: THREE.DirectionalLight | null,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.config = { ...config, lodRanges: [...config.lodRanges] };
    this.terrainHeightAt = terrainHeightAt;
    this.shadowLight = shadowLight ?? null;
    this.quadtree = this.buildQuadtree();
    this.renderer = new CDLODRenderer(material, this.config.tileResolution);
  }

  init(): void {
    this.scene.add(this.renderer.getMesh());
  }

  update(): void {
    const camera = this.getSelectionCamera();
    const tiles = this.selectTilesTimed(camera, 'regular');
    const forceInstanceUpload = isTerrainForceInstanceUploadEnabled();
    const hasSubmittedSelection = this.hasSelectionPose;
    const sameTileSet = hasSubmittedSelection && this.matchesLastSubmittedTileSet(tiles);
    const sameDynamics = sameTileSet && this.matchesLastSubmittedTileDynamics(tiles);
    if (
      !forceInstanceUpload
      && hasSubmittedSelection
      && sameTileSet
      && sameDynamics
    ) {
      this.copySelectedTilesForDebug(tiles);
      this.rememberSelectionPose(camera);
      this.unchangedSubmissionSkips += 1;
      this.lastSubmissionSkipped = true;
      return;
    }
    this.submitTiles(camera, tiles, {
      forced: forceInstanceUpload && hasSubmittedSelection,
      origin: 'regular',
      classification: this.classifySubmission(hasSubmittedSelection, sameTileSet, sameDynamics, forceInstanceUpload),
    });
  }

  syncSelectionForCamera(camera: THREE.Camera | null | undefined): TerrainRenderSelectionSyncResult {
    if (!camera) {
      return this.buildSyncResult(false, 'uninitialized', 0, 0);
    }

    const positionDelta = this.hasSelectionPose
      ? camera.position.distanceTo(this.lastSelectionPosition)
      : Number.POSITIVE_INFINITY;
    const rotationDelta = this.hasSelectionPose
      ? camera.quaternion.angleTo(this.lastSelectionQuaternion)
      : Number.POSITIVE_INFINITY;
    const cameraChanged = camera !== this.lastSelectionCamera;
    const projectionChanged = this.hasSelectionPose
      ? !this.matchesLastSelectionProjection(camera)
      : false;
    const poseWasStale = !this.hasSelectionPose
      || cameraChanged
      || positionDelta > CAMERA_RENDER_SYNC_POSITION_EPSILON_METERS
      || rotationDelta > CAMERA_RENDER_SYNC_ROTATION_EPSILON_RAD;
    const selectionStale = poseWasStale || projectionChanged;

    if (!selectionStale) {
      return this.buildSyncResult(false, 'current', positionDelta, rotationDelta);
    }

    const tiles = this.selectTilesTimed(camera, 'late-sync');
    const recheckContext = {
      selectionRechecked: true,
      poseWasStale,
      projectionChanged,
    };
    const sameTileSet = this.matchesLastSubmittedTileSet(tiles);
    const sameDynamics = sameTileSet && this.matchesLastSubmittedTileDynamics(tiles);
    const classification = this.classifySubmission(this.hasSelectionPose, sameTileSet, sameDynamics, false);
    if (sameTileSet) {
      if (sameDynamics) {
        this.copySelectedTilesForDebug(tiles);
        this.rememberSelectionPose(camera);
      } else {
        this.submitTiles(camera, tiles, {
          origin: 'late-sync',
          classification,
        });
      }
      return this.buildSyncResult(true, 'stale', positionDelta, rotationDelta, {
        ...recheckContext,
        terrainBufferSubmitted: !sameDynamics,
        submissionClassification: classification,
      });
    }

    this.submitTiles(camera, tiles, {
      origin: 'late-sync',
      classification,
    });
    return this.buildSyncResult(true, 'stale', positionDelta, rotationDelta, {
      ...recheckContext,
      terrainBufferSubmitted: true,
      submissionClassification: classification,
    });
  }

  private selectTilesTimed(camera: THREE.Camera, origin: TerrainRenderSubmissionOrigin): readonly CDLODTile[] {
    const startedAt = nowMs();
    const tiles = this.selectTiles(camera);
    this.lastSelectionMs = nowMs() - startedAt;
    if (origin === 'late-sync') {
      this.lateSyncSelectionRechecks += 1;
    } else {
      this.regularSelectionCount += 1;
    }
    return tiles;
  }

  private selectTiles(camera: THREE.Camera): readonly CDLODTile[] {
    this.updateFrustumPlanes(camera);
    const lodCameraY = this.getTerrainRelativeCameraY(camera);
    updateTerrainMaterialMorphCamera(this.material, lodCameraY);
    const tiles = this.quadtree.selectTiles(
      camera.position.x,
      lodCameraY,
      camera.position.z,
      this.frustumPlanes,
    );
    this.lastTileSelectionSaturated = this.quadtree.wasLastSelectionSaturated();
    this.lastSelectionStats = this.shouldUseHeightAwareFrustum()
      ? this.quadtree.getLastSelectionStats()
      : null;
    return tiles;
  }

  private submitTiles(
    camera: THREE.Camera,
    tiles: readonly CDLODTile[],
    options: {
      forced?: boolean;
      origin: TerrainRenderSubmissionOrigin;
      classification: TerrainRenderSubmissionClassification;
    },
  ): void {
    this.copySelectedTilesForDebug(tiles);
    this.configureTerrainShadowPass(camera);
    const updateStartedAt = nowMs();
    this.renderer.updateInstances(tiles);
    this.lastUpdateInstancesMs = nowMs() - updateStartedAt;
    this.recordSubmission(options);
    this.rememberSelectionPose(camera);
  }

  private recordSubmission(options: {
    forced?: boolean;
    origin: TerrainRenderSubmissionOrigin;
    classification: TerrainRenderSubmissionClassification;
  }): void {
    this.instanceSubmissions += 1;
    if (options.origin === 'late-sync') {
      this.lateSyncInstanceSubmissions += 1;
      if (options.classification === 'same-identity') {
        this.lateSyncSameIdentitySubmissions += 1;
      } else if (options.classification === 'dynamics-changed') {
        this.lateSyncDynamicsChangedSubmissions += 1;
      } else if (options.classification === 'tile-set-changed') {
        this.lateSyncTileSetChangedSubmissions += 1;
      }
    } else {
      this.regularInstanceSubmissions += 1;
    }
    if (options.forced) {
      this.forcedInstanceSubmissions += 1;
    }
    this.lastSubmissionSkipped = false;
    this.lastSubmissionOrigin = options.origin;
    this.lastSubmissionClassification = options.classification;
  }

  private classifySubmission(
    hasSubmittedSelection: boolean,
    sameTileSet: boolean,
    sameDynamics: boolean,
    forced: boolean,
  ): TerrainRenderSubmissionClassification {
    if (!hasSubmittedSelection) return 'initial';
    if (forced) return 'forced';
    if (!sameTileSet) return 'tile-set-changed';
    if (!sameDynamics) return 'dynamics-changed';
    return 'same-identity';
  }

  private rememberSelectionPose(camera: THREE.Camera): void {
    this.lastSelectionCamera = camera;
    this.lastSelectionPosition.copy(camera.position);
    this.lastSelectionQuaternion.copy(camera.quaternion);
    this.lastSelectionProjectionMatrix.copy(camera.projectionMatrix);
    this.hasSelectionPose = true;
  }

  setCameraOverride(camera: THREE.PerspectiveCamera | null): void {
    this.cameraOverride = camera;
  }

  reconfigure(config: TerrainRenderRuntimeConfig): void {
    this.config = { ...config, lodRanges: [...config.lodRanges] };
    this.quadtree = this.buildQuadtree();
    this.lastSelectedTiles.length = 0;
    this.hasSelectionPose = false;
    this.lastSelectionCamera = null;
    this.lastSubmissionSkipped = false;
  }

  private buildQuadtree(): CDLODQuadtree {
    // Inflate quadtree coverage so terrain tiles extend past the heightmap
    // boundary. Edge tiles sample clamped UVs, creating a seamless visual margin.
    return new CDLODQuadtree(
      this.config.worldSize + this.config.visualMargin * 2,
      this.config.maxLODLevels,
      this.config.lodRanges,
      0.8,
      this.shouldUseHeightAwareFrustum()
        ? this.computeTerrainHeightBoundsForTile
        : undefined,
    );
  }

  getActiveTerrainTileCount(): number {
    return this.quadtree.getSelectedTileCount();
  }

  wasLastTileSelectionSaturated(): boolean {
    return this.lastTileSelectionSaturated;
  }

  /**
   * Returns the last CDLOD tile set selected by update(). This intentionally
   * does not re-run selection, so perf artifacts and overlays can inspect the
   * terrain state that was actually submitted to the renderer for the latest
   * terrain update.
   */
  getActiveTilesForDebug(): ReadonlyArray<TerrainDebugTile> {
    return this.lastSelectedTiles;
  }

  /**
   * Explicit fresh overlay probe. Use this only for interactive debug tooling
   * that wants to ask "what would select now?" instead of artifact truth.
   */
  selectTilesForDebugOverlay(): ReadonlyArray<TerrainDebugTile> {
    const camera = this.getSelectionCamera();
    this.updateFrustumPlanes(camera);
    const lodCameraY = this.getTerrainRelativeCameraY(camera);
    const tiles = this.quadtree.selectTiles(
      camera.position.x, lodCameraY, camera.position.z,
      this.frustumPlanes,
    );
    return tiles.map((t) => ({
      x: t.x,
      z: t.z,
      size: t.size,
      lodLevel: t.lodLevel,
      morphFactor: t.morphFactor,
      edgeMorphMask: t.edgeMorphMask,
      edgeSkirtMask: t.edgeSkirtMask,
    }));
  }

  getSubmissionStatsForDebug(): TerrainRenderSubmissionStats {
    const shadowStats = this.renderer.getShadowPassStatsForDebug();
    const selectionStats = this.lastSelectionStats;
    return {
      instanceSubmissions: this.instanceSubmissions,
      regularInstanceSubmissions: this.regularInstanceSubmissions,
      lateSyncInstanceSubmissions: this.lateSyncInstanceSubmissions,
      lateSyncSameIdentitySubmissions: this.lateSyncSameIdentitySubmissions,
      lateSyncDynamicsChangedSubmissions: this.lateSyncDynamicsChangedSubmissions,
      lateSyncTileSetChangedSubmissions: this.lateSyncTileSetChangedSubmissions,
      unchangedSubmissionSkips: this.unchangedSubmissionSkips,
      lastSubmissionSkipped: this.lastSubmissionSkipped,
      lastSubmissionOrigin: this.lastSubmissionOrigin,
      lastSubmissionClassification: this.lastSubmissionClassification,
      regularSelectionCount: this.regularSelectionCount,
      lateSyncSelectionRechecks: this.lateSyncSelectionRechecks,
      lastSelectionMs: this.lastSelectionMs,
      lastUpdateInstancesMs: this.lastUpdateInstancesMs,
      forceInstanceUploadEnabled: isTerrainForceInstanceUploadEnabled(),
      forcedInstanceSubmissions: this.forcedInstanceSubmissions,
      heightAwareFrustumEnabled: this.shouldUseHeightAwareFrustum(),
      selectionNodesVisited: selectionStats?.nodesVisited ?? 0,
      selectionFrustumTests: selectionStats?.frustumTests ?? 0,
      selectionFrustumRejectedNodes: selectionStats?.frustumRejectedNodes ?? 0,
      selectionHeightBoundsTests: selectionStats?.heightBoundsTests ?? 0,
      selectionHeightBoundsFallbacks: selectionStats?.heightBoundsFallbacks ?? 0,
      selectionHeightBoundsRejectedNodes: selectionStats?.heightBoundsRejectedNodes ?? 0,
      boundedShadowPassEnabled: shadowStats.boundedShadowPassEnabled,
      shadowCenterX: shadowStats.shadowCenterX,
      shadowCenterZ: shadowStats.shadowCenterZ,
      shadowRadiusMeters: shadowStats.shadowRadiusMeters,
      shadowPrefixInstances: shadowStats.shadowPrefixInstances,
      lastMainPassInstances: shadowStats.lastMainPassInstances,
      lastShadowPassInstances: shadowStats.lastShadowPassInstances,
      lastMainPassEdgeSkirtInstances: shadowStats.lastMainPassEdgeSkirtInstances,
      lastShadowPassEdgeSkirtInstances: shadowStats.lastShadowPassEdgeSkirtInstances,
      shadowPassReductions: shadowStats.shadowPassReductions,
      edgeShadowPassReductions: shadowStats.edgeShadowPassReductions,
      sparseEdgeSkirtsEnabled: shadowStats.sparseEdgeSkirtsEnabled,
      tileInteriorTriangles: shadowStats.tileInteriorTriangles,
      tileSkirtTriangles: shadowStats.tileSkirtTriangles,
      tileSkirtTrianglesPerEdge: shadowStats.tileSkirtTrianglesPerEdge,
      tileTotalTriangles: shadowStats.tileTotalTriangles,
      tileFullSkirtTriangles: shadowStats.tileFullSkirtTriangles,
      lastMainPassTriangleEstimate: shadowStats.lastMainPassTriangleEstimate,
      lastShadowPassTriangleEstimate: shadowStats.lastShadowPassTriangleEstimate,
    };
  }

  dispose(): void {
    this.scene.remove(this.renderer.getMesh());
    this.renderer.dispose();
  }

  private getSelectionCamera(): THREE.PerspectiveCamera {
    return this.cameraOverride ?? this.camera;
  }

  private getTerrainRelativeCameraY(camera: THREE.Camera): number {
    if (!this.terrainHeightAt) return camera.position.y;
    const terrainY = this.terrainHeightAt(camera.position.x, camera.position.z);
    const relativeY = camera.position.y - terrainY;
    return Number.isFinite(relativeY) ? relativeY : camera.position.y;
  }

  private configureTerrainShadowPass(camera: THREE.Camera): void {
    const center = this.shadowLight?.target.position ?? camera.position;
    this.renderer.configureBoundedShadowPass(
      center.x,
      center.z,
      computeTerrainShadowBoundRadius(this.shadowLight),
    );
  }

  private shouldUseHeightAwareFrustum(): boolean {
    return Boolean(this.terrainHeightAt) && isTerrainHeightAwareFrustumEnabled();
  }

  private readonly computeTerrainHeightBoundsForTile = (
    cx: number,
    cz: number,
    size: number,
    target: TerrainTileHeightBounds,
  ): TerrainTileHeightBounds | null => {
    const terrainHeightAt = this.terrainHeightAt;
    if (!terrainHeightAt) return null;

    const half = size * 0.5;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let samples = 0;
    const sample = (x: number, z: number): void => {
      const height = terrainHeightAt(x, z);
      if (!Number.isFinite(height)) return;
      minY = Math.min(minY, height);
      maxY = Math.max(maxY, height);
      samples += 1;
    };

    sample(cx, cz);
    sample(cx - half, cz - half);
    sample(cx, cz - half);
    sample(cx + half, cz - half);
    sample(cx - half, cz);
    sample(cx + half, cz);
    sample(cx - half, cz + half);
    sample(cx, cz + half);
    sample(cx + half, cz + half);

    if (samples === 0) return null;

    const pad = Math.min(
      HEIGHT_BOUNDS_MAX_PAD_METERS,
      Math.max(
        HEIGHT_BOUNDS_MIN_PAD_METERS,
        size * HEIGHT_BOUNDS_TILE_PAD_FRACTION,
        (maxY - minY) * 0.25,
      ) + HEIGHT_BOUNDS_SKIRT_PAD_METERS,
    );
    target.minY = minY - pad;
    target.maxY = maxY + pad;
    return target;
  };

  private updateFrustumPlanes(camera: THREE.Camera): void {
    camera.updateMatrixWorld(true);
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    for (let i = 0; i < 6; i++) {
      const p = this.frustum.planes[i];
      const target = this.frustumPlanes[i];
      target.nx = p.normal.x;
      target.ny = p.normal.y;
      target.nz = p.normal.z;
      target.d = p.constant;
    }
  }

  private copySelectedTilesForDebug(tiles: readonly TerrainDebugTile[]): void {
    this.lastSelectedTiles.length = tiles.length;
    this.lastSelectedTileEdgeMorphMasks.length = tiles.length;
    this.lastSelectedTileEdgeSkirtMasks.length = tiles.length;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const target = this.debugTilePool[i] ?? {
        x: 0,
        z: 0,
        size: 0,
        lodLevel: 0,
        morphFactor: 0,
      };
      this.debugTilePool[i] = target;
      target.x = tile.x;
      target.z = tile.z;
      target.size = tile.size;
      target.lodLevel = tile.lodLevel;
      target.morphFactor = tile.morphFactor;
      target.edgeMorphMask = Number(tile.edgeMorphMask ?? 0);
      target.edgeSkirtMask = Number(tile.edgeSkirtMask ?? tile.edgeMorphMask ?? 0);
      this.lastSelectedTiles[i] = target;
      this.lastSelectedTileEdgeMorphMasks[i] = Number(tile.edgeMorphMask ?? 0);
      this.lastSelectedTileEdgeSkirtMasks[i] = Number(tile.edgeSkirtMask ?? tile.edgeMorphMask ?? 0);
    }
  }

  private matchesLastSubmittedTileSet(tiles: readonly CDLODTile[]): boolean {
    if (tiles.length !== this.lastSelectedTiles.length) return false;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const previous = this.lastSelectedTiles[i];
      if (
        tile.x !== previous.x
        || tile.z !== previous.z
        || tile.size !== previous.size
        || tile.lodLevel !== previous.lodLevel
      ) {
        return false;
      }
    }
    return true;
  }

  private matchesLastSubmittedTileDynamics(tiles: readonly CDLODTile[]): boolean {
    if (tiles.length !== this.lastSelectedTiles.length) return false;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (Number(tile.edgeMorphMask ?? 0) !== Number(this.lastSelectedTileEdgeMorphMasks[i] ?? 0)) {
        return false;
      }
      if (Number(tile.edgeSkirtMask ?? tile.edgeMorphMask ?? 0) !== Number(this.lastSelectedTileEdgeSkirtMasks[i] ?? 0)) {
        return false;
      }
    }
    return true;
  }

  private matchesLastSelectionProjection(camera: THREE.Camera): boolean {
    const previous = this.lastSelectionProjectionMatrix.elements;
    const current = camera.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(previous[i] - current[i]) > CAMERA_SELECTION_PROJECTION_EPSILON) {
        return false;
      }
    }
    return true;
  }

  private buildSyncResult(
    didSync: boolean,
    reason: TerrainRenderSelectionSyncResult['reason'],
    positionDeltaMeters: number,
    rotationDeltaRad: number,
    diagnostics: Partial<Pick<
      TerrainRenderSelectionSyncResult,
      | 'selectionRechecked'
      | 'poseWasStale'
      | 'projectionChanged'
      | 'terrainBufferSubmitted'
      | 'submissionClassification'
    >> = {},
  ): TerrainRenderSelectionSyncResult {
    return {
      didSync,
      reason,
      selectionRechecked: Boolean(diagnostics.selectionRechecked),
      poseWasStale: Boolean(diagnostics.poseWasStale),
      projectionChanged: Boolean(diagnostics.projectionChanged),
      positionDeltaMeters: Number.isFinite(positionDeltaMeters) ? positionDeltaMeters : 0,
      rotationDeltaDeg: Number.isFinite(rotationDeltaRad)
        ? THREE.MathUtils.radToDeg(rotationDeltaRad)
        : 0,
      tileCount: this.lastSelectedTiles.length,
      tileSelectionSaturated: this.lastTileSelectionSaturated,
      terrainBufferSubmitted: Boolean(diagnostics.terrainBufferSubmitted),
      submissionClassification: diagnostics.submissionClassification ?? null,
    };
  }
}
