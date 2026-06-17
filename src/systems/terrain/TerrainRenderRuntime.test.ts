// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const {
  mockQuadtreeCtor,
  mockSelectTiles,
  mockConfigureBoundedShadowPass,
  mockUpdateInstances,
  mockResubmitCurrentInstances,
  mockUpdateTerrainMaterialMorphCamera,
  mockWasLastSelectionSaturated,
  mockGetLastSelectionStats,
} = vi.hoisted(() => ({
    mockQuadtreeCtor: vi.fn(),
    mockSelectTiles: vi.fn().mockReturnValue([]),
  mockConfigureBoundedShadowPass: vi.fn(),
  mockUpdateInstances: vi.fn(),
  mockResubmitCurrentInstances: vi.fn(),
  mockUpdateTerrainMaterialMorphCamera: vi.fn(),
  mockWasLastSelectionSaturated: vi.fn().mockReturnValue(false),
  mockGetLastSelectionStats: vi.fn().mockReturnValue({
    selectedTiles: 0,
    nodesVisited: 0,
    frustumTests: 0,
    frustumRejectedNodes: 0,
    heightBoundsEnabled: false,
    heightBoundsTests: 0,
    heightBoundsFallbacks: 0,
    heightBoundsRejectedNodes: 0,
    saturated: false,
  }),
}));

vi.mock('./TerrainMaterial', () => ({
  updateTerrainMaterialMorphCamera: mockUpdateTerrainMaterialMorphCamera,
}));

vi.mock('./CDLODQuadtree', () => ({
  CDLODQuadtree: class {
    constructor(
      worldSize: number,
      maxLOD: number,
      lodRanges: readonly number[],
      morphStart?: number,
      heightBoundsForTile?: unknown,
    ) {
      mockQuadtreeCtor(worldSize, maxLOD, lodRanges, morphStart, heightBoundsForTile);
    }
    selectTiles = mockSelectTiles;
    getSelectedTileCount = vi.fn().mockReturnValue(0);
    wasLastSelectionSaturated = mockWasLastSelectionSaturated;
    getLastSelectionStats = mockGetLastSelectionStats;
  },
}));

vi.mock('./CDLODRenderer', () => ({
  TERRAIN_SHADOW_BOUND_FALLBACK_RADIUS_METERS: 640,
  CDLODRenderer: class {
    getMesh = vi.fn().mockReturnValue({});
    configureBoundedShadowPass = mockConfigureBoundedShadowPass;
    updateInstances = mockUpdateInstances;
    resubmitCurrentInstances = mockResubmitCurrentInstances;
    getShadowPassStatsForDebug = vi.fn().mockReturnValue({
      boundedShadowPassEnabled: false,
      shadowCenterX: 0,
      shadowCenterZ: 0,
      shadowRadiusMeters: 0,
      shadowPrefixInstances: 0,
      lastMainPassInstances: 0,
      lastShadowPassInstances: 0,
      lastMainPassEdgeSkirtInstances: 0,
      lastShadowPassEdgeSkirtInstances: 0,
      shadowPassReductions: 0,
      edgeShadowPassReductions: 0,
      sparseEdgeSkirtsEnabled: false,
      tileInteriorTriangles: 2048,
      tileSkirtTriangles: 512,
      tileSkirtTrianglesPerEdge: 128,
      tileTotalTriangles: 2560,
      tileFullSkirtTriangles: 512,
      lastMainPassTriangleEstimate: 0,
      lastShadowPassTriangleEstimate: 0,
    });
    dispose = vi.fn();
  },
}));

import { TerrainRenderRuntime } from './TerrainRenderRuntime';

function setRuntimeSearch(search: string): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search },
    },
  });
}

describe('TerrainRenderRuntime', () => {
  beforeEach(() => {
    setRuntimeSearch('');
    mockQuadtreeCtor.mockClear();
    mockSelectTiles.mockClear();
    mockSelectTiles.mockReturnValue([]);
    mockConfigureBoundedShadowPass.mockClear();
    mockUpdateInstances.mockClear();
    mockResubmitCurrentInstances.mockClear();
    mockUpdateTerrainMaterialMorphCamera.mockClear();
    mockWasLastSelectionSaturated.mockClear();
    mockWasLastSelectionSaturated.mockReturnValue(false);
    mockGetLastSelectionStats.mockClear();
    mockGetLastSelectionStats.mockReturnValue({
      selectedTiles: 0,
      nodesVisited: 0,
      frustumTests: 0,
      frustumRejectedNodes: 0,
      heightBoundsEnabled: false,
      heightBoundsTests: 0,
      heightBoundsFallbacks: 0,
      heightBoundsRejectedNodes: 0,
      saturated: false,
    });
  });

  it('renders over an extent larger than the playable world when a visual margin is configured', () => {
    const playableSize = 500;
    const config = {
      worldSize: playableSize,
      visualMargin: 320,
      maxLODLevels: 4,
      lodRanges: [125, 250, 500, 1000],
      tileResolution: 33,
    };

    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      config,
    );

    runtime.reconfigure(config);

    // Observable behavior: the quadtree is configured with an extent strictly
    // larger than the playable world so that overflow terrain stays visible at
    // the map edges. Exact arithmetic (margin * 2 etc.) is not load-bearing.
    expect(mockQuadtreeCtor).toHaveBeenCalled();
    const lastCallArgs = mockQuadtreeCtor.mock.calls[mockQuadtreeCtor.mock.calls.length - 1];
    const [renderedExtent] = lastCallArgs;
    expect(renderedExtent).toBeGreaterThan(playableSize);
  });

  it('configures the terrain shadow caster bound from the directional shadow camera', () => {
    const tile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    mockSelectTiles.mockReturnValue([tile]);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1000, 40, 2000);
    const shadowLight = new THREE.DirectionalLight();
    shadowLight.target.position.set(25, 12, -75);
    shadowLight.position.set(325, 412, -75);
    shadowLight.shadow.camera.left = -100;
    shadowLight.shadow.camera.right = 100;
    shadowLight.shadow.camera.top = 100;
    shadowLight.shadow.camera.bottom = -100;
    shadowLight.shadow.camera.far = 1000;

    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
      undefined,
      shadowLight,
    );

    runtime.update();

    const [centerX, centerZ, radiusMeters] = mockConfigureBoundedShadowPass.mock.calls.at(-1) ?? [];
    expect(centerX).toBe(25);
    expect(centerZ).toBe(-75);
    expect(radiusMeters).toBeCloseTo(805.421, 3);
  });

  it('selects terrain tiles from an explicit render camera override for review captures', () => {
    const scene = { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene;
    const gameplayCamera = new THREE.PerspectiveCamera();
    gameplayCamera.position.set(1, 2, 3);
    gameplayCamera.updateMatrixWorld(true);
    const reviewCamera = new THREE.PerspectiveCamera();
    reviewCamera.position.set(250, 32, -1400);
    reviewCamera.updateMatrixWorld(true);
    const runtime = new TerrainRenderRuntime(
      scene,
      gameplayCamera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 3200,
        visualMargin: 200,
        maxLODLevels: 4,
        lodRanges: [100, 220, 520, 1100],
        tileResolution: 33,
      },
    );

    runtime.setCameraOverride(reviewCamera);
    runtime.update();

    expect(mockSelectTiles).toHaveBeenCalled();
    const [x, y, z] = mockSelectTiles.mock.calls.at(-1) ?? [];
    expect(x).toBe(reviewCamera.position.x);
    expect(y).toBe(reviewCamera.position.y);
    expect(z).toBe(reviewCamera.position.z);
  });

  it('uses terrain-relative camera height for CDLOD LOD distance on elevated terrain', () => {
    const scene = { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(12, 305, -18);
    camera.updateMatrixWorld(true);
    const runtime = new TerrainRenderRuntime(
      scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 21000,
        visualMargin: 200,
        maxLODLevels: 8,
        lodRanges: [300, 600, 1200, 2400, 4800, 9600, 16000, 22000],
        tileResolution: 33,
      },
      () => 300,
    );

    runtime.update();

    const [x, yForLod, z] = mockSelectTiles.mock.calls.at(-1) ?? [];
    expect(x).toBe(camera.position.x);
    expect(yForLod).toBe(5);
    expect(z).toBe(camera.position.z);
  });

  it('falls back to world camera height when terrain-relative LOD height is unavailable', () => {
    const scene = { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(12, 305, -18);
    camera.updateMatrixWorld(true);
    const runtime = new TerrainRenderRuntime(
      scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 21000,
        visualMargin: 200,
        maxLODLevels: 8,
        lodRanges: [300, 600, 1200, 2400, 4800, 9600, 16000, 22000],
        tileResolution: 33,
      },
      () => Number.NaN,
    );

    runtime.update();

    const [, yForLod] = mockSelectTiles.mock.calls.at(-1) ?? [];
    expect(yForLod).toBe(camera.position.y);
  });

  it('keeps terrain frustum bounds conservative by default even when terrain heights are available', () => {
    new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 21000,
        visualMargin: 200,
        maxLODLevels: 8,
        lodRanges: [300, 600, 1200, 2400, 4800, 9600, 16000, 22000],
        tileResolution: 33,
      },
      () => 42,
    );

    const heightBoundsForTile = mockQuadtreeCtor.mock.calls.at(-1)?.[4];
    expect(heightBoundsForTile).toBeUndefined();
  });

  it('uses baked-grid height bounds for production terrain culling when available', () => {
    const heightAt = vi.fn(() => 42);
    const indexedBounds = vi.fn((_cx: number, _cz: number, _size: number, target: { minY: number; maxY: number }) => {
      target.minY = 5;
      target.maxY = 55;
      return target;
    });
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 21000,
        visualMargin: 200,
        maxLODLevels: 8,
        lodRanges: [300, 600, 1200, 2400, 4800, 9600, 16000, 22000],
        tileResolution: 33,
      },
      heightAt,
      undefined,
      indexedBounds,
    );

    const heightBoundsForTile = mockQuadtreeCtor.mock.calls.at(-1)?.[4] as
      | ((cx: number, cz: number, size: number, target: { minY: number; maxY: number }) => { minY: number; maxY: number } | null)
      | undefined;
    expect(heightBoundsForTile).toBeTypeOf('function');

    const bounds = heightBoundsForTile?.(10, 20, 100, { minY: 0, maxY: 0 });
    expect(bounds).toBeDefined();
    expect(bounds!.minY).toBeLessThan(-100);
    expect(bounds!.maxY).toBeGreaterThan(190);
    expect(indexedBounds).toHaveBeenCalledTimes(1);
    expect(heightAt).not.toHaveBeenCalled();

    runtime.update();
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      heightAwareFrustumEnabled: true,
      heightBoundsSource: 'baked-grid',
    });
  });

  it('can enable legacy height-aware frustum culling only for explicit perf diagnostics', () => {
    setRuntimeSearch('?terrainEnableHeightAwareFrustum=1');
    new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 21000,
        visualMargin: 200,
        maxLODLevels: 8,
        lodRanges: [300, 600, 1200, 2400, 4800, 9600, 16000, 22000],
        tileResolution: 33,
      },
      () => 42,
    );

    const heightBoundsForTile = mockQuadtreeCtor.mock.calls.at(-1)?.[4];
    expect(heightBoundsForTile).toBeTypeOf('function');
  });

  it('wires conservative heuristic terrain height bounds only in the diagnostic path', () => {
    setRuntimeSearch('?terrainEnableHeightAwareFrustum=1');
    const heightAt = vi.fn((x: number, z: number) => x + z);
    new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 21000,
        visualMargin: 200,
        maxLODLevels: 8,
        lodRanges: [300, 600, 1200, 2400, 4800, 9600, 16000, 22000],
        tileResolution: 33,
      },
      heightAt,
    );

    const heightBoundsForTile = mockQuadtreeCtor.mock.calls.at(-1)?.[4] as
      | ((cx: number, cz: number, size: number, target: { minY: number; maxY: number }) => { minY: number; maxY: number } | null)
      | undefined;
    expect(heightBoundsForTile).toBeTypeOf('function');

    const bounds = heightBoundsForTile?.(10, 20, 100, { minY: 0, maxY: 0 });
    expect(bounds).toBeDefined();
    expect(bounds!.minY).toBeLessThan(-170);
    expect(bounds!.maxY).toBeGreaterThan(220);
    expect(heightAt).toHaveBeenCalledTimes(9);
  });

  it('surfaces height-aware selection stats in terrain render debug', () => {
    setRuntimeSearch('?terrainEnableHeightAwareFrustum=1');
    mockGetLastSelectionStats.mockReturnValue({
      selectedTiles: 12,
      nodesVisited: 40,
      frustumTests: 36,
      frustumRejectedNodes: 9,
      heightBoundsEnabled: true,
      heightBoundsTests: 36,
      heightBoundsFallbacks: 1,
      heightBoundsRejectedNodes: 7,
      saturated: false,
    });
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 21000,
        visualMargin: 200,
        maxLODLevels: 8,
        lodRanges: [300, 600, 1200, 2400, 4800, 9600, 16000, 22000],
        tileResolution: 33,
      },
      () => 42,
    );

    runtime.update();

    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      heightAwareFrustumEnabled: true,
      heightBoundsSource: 'heuristic-samples',
      playableWorldSize: 21000,
      visualWorldSize: 21400,
      visualMargin: 200,
      maxLODLevels: 8,
      lodRange0: 300,
      lodRangeLast: 22000,
      lod0VertexSpacing: 21400 / 2 ** 8 / 32,
      selectionNodesVisited: 40,
      selectionFrustumTests: 36,
      selectionFrustumRejectedNodes: 9,
      selectionHeightBoundsTests: 36,
      selectionHeightBoundsFallbacks: 1,
      selectionHeightBoundsRejectedNodes: 7,
    });
  });

  it('refreshes camera matrices before extracting CDLOD frustum planes', () => {
    const camera = new THREE.PerspectiveCamera();
    const updateMatrixWorld = vi.spyOn(camera, 'updateMatrixWorld');
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    camera.rotation.y = Math.PI / 4;
    runtime.update();

    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
    expect(mockSelectTiles).toHaveBeenCalled();
  });

  it('reuses frustum plane records across CDLOD selections', () => {
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    const firstPlanes = mockSelectTiles.mock.calls.at(-1)?.[3];
    const firstPlaneRecords = firstPlanes?.slice();

    camera.rotation.y = THREE.MathUtils.degToRad(2);
    runtime.update();
    const secondPlanes = mockSelectTiles.mock.calls.at(-1)?.[3];

    expect(secondPlanes).toBe(firstPlanes);
    expect(secondPlanes).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(secondPlanes?.[i]).toBe(firstPlaneRecords?.[i]);
    }
  });

  it('returns the last selected terrain tiles for debug without re-running selection', () => {
    const selectedTile = {
      x: 12,
      z: -34,
      size: 50,
      lodLevel: 2,
      morphFactor: 0.25,
      edgeMorphMask: 0,
    };
    mockSelectTiles.mockReturnValue([selectedTile]);
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    expect(mockSelectTiles).toHaveBeenCalledTimes(1);

    expect(runtime.getActiveTilesForDebug()).toEqual([
      {
        x: 12,
        z: -34,
        size: 50,
        lodLevel: 2,
        morphFactor: 0.25,
        edgeMorphMask: 0,
        edgeSkirtMask: 0,
      },
    ]);
    expect(mockSelectTiles).toHaveBeenCalledTimes(1);
  });

  it('reuses terrain debug tile records when selection count shrinks and grows', () => {
    const firstTiles = [
      { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.1, edgeMorphMask: 0 },
      { x: 100, z: 0, size: 100, lodLevel: 2, morphFactor: 0.2, edgeMorphMask: 1 },
    ];
    const regrownTiles = [
      { x: 20, z: 0, size: 100, lodLevel: 2, morphFactor: 0.3, edgeMorphMask: 2 },
      { x: 120, z: 0, size: 100, lodLevel: 2, morphFactor: 0.4, edgeMorphMask: 3 },
    ];
    mockSelectTiles
      .mockReturnValueOnce(firstTiles)
      .mockReturnValueOnce([])
      .mockReturnValueOnce(regrownTiles);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    const reusedFirstRecord = runtime.getActiveTilesForDebug()[0];
    const reusedSecondRecord = runtime.getActiveTilesForDebug()[1];

    camera.position.x = 50;
    runtime.update();
    expect(runtime.getActiveTilesForDebug()).toEqual([]);

    camera.position.x = 100;
    runtime.update();

    const activeTiles = runtime.getActiveTilesForDebug();
    expect(activeTiles).toEqual([
      { ...regrownTiles[0], edgeSkirtMask: 2 },
      { ...regrownTiles[1], edgeSkirtMask: 3 },
    ]);
    expect(activeTiles[0]).toBe(reusedFirstRecord);
    expect(activeTiles[1]).toBe(reusedSecondRecord);
  });

  it('keeps fresh debug overlay selection explicit', () => {
    const overlayTile = {
      x: 7,
      z: 9,
      size: 25,
      lodLevel: 1,
      morphFactor: 0.5,
      edgeMorphMask: 6,
    };
    mockSelectTiles
      .mockReturnValueOnce([])
      .mockReturnValueOnce([overlayTile]);
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
      () => 45,
    );

    runtime.update();
    const freshTiles = runtime.selectTilesForDebugOverlay();

    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(freshTiles).toEqual([overlayTile]);
    expect(mockSelectTiles.mock.calls.at(-1)?.[1]).toBe(-45);
  });

  it('skips regular terrain buffer submissions when selected tiles and morph data are unchanged', () => {
    const tile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.25, edgeMorphMask: 3 };
    mockSelectTiles.mockReturnValue([tile]);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.rotation.y = THREE.MathUtils.degToRad(3);
    runtime.update();
    const syncResult = runtime.syncSelectionForCamera(camera);

    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(1);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      instanceSubmissions: 1,
      unchangedSubmissionSkips: 1,
      lastSubmissionSkipped: true,
    });
    expect(syncResult).toMatchObject({
      didSync: false,
      reason: 'current',
      selectionRechecked: false,
      poseWasStale: false,
      projectionChanged: false,
    });
  });

  it('can force terrain buffer submissions for CDLOD upload-coherence probes', () => {
    setRuntimeSearch('?terrainForceInstanceUpload=1');
    const tile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.25, edgeMorphMask: 3 };
    mockSelectTiles.mockReturnValue([tile]);
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    runtime.update();

    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      instanceSubmissions: 2,
      unchangedSubmissionSkips: 0,
      lastSubmissionSkipped: false,
      forceInstanceUploadEnabled: true,
      forcedInstanceSubmissions: 1,
    });
  });

  it('skips regular terrain buffer submissions when only shader-computed morph data changes', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.1, edgeMorphMask: 0 };
    const morphedTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.6, edgeMorphMask: 0 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([morphedTile]);
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    runtime.update();

    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(1);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      instanceSubmissions: 1,
      unchangedSubmissionSkips: 1,
      lastSubmissionSkipped: true,
    });
    expect(runtime.getActiveTilesForDebug()[0]).toMatchObject({ morphFactor: 0.6 });
  });

  it('keeps regular terrain buffer submissions when edge morph data changes', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.1, edgeMorphMask: 0 };
    const edgeChangedTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.6, edgeMorphMask: 1 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([edgeChangedTile]);
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    runtime.update();

    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      instanceSubmissions: 2,
      unchangedSubmissionSkips: 0,
      lastSubmissionSkipped: false,
      lastSubmissionClassification: 'dynamics-changed',
    });
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([edgeChangedTile]);
  });

  it('keeps regular terrain buffer submissions when sparse skirt cover changes', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.1, edgeMorphMask: 0, edgeSkirtMask: 0 };
    const skirtChangedTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.6, edgeMorphMask: 0, edgeSkirtMask: 5 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([skirtChangedTile]);
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    runtime.update();

    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      instanceSubmissions: 2,
      unchangedSubmissionSkips: 0,
      lastSubmissionSkipped: false,
      lastSubmissionClassification: 'dynamics-changed',
    });
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([skirtChangedTile]);
  });

  it('skips a late render-camera sync when the submitted CDLOD selection already matches the camera epoch', () => {
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    const result = runtime.syncSelectionForCamera(camera);

    expect(result).toMatchObject({
      didSync: false,
      reason: 'current',
      selectionRechecked: false,
      poseWasStale: false,
      projectionChanged: false,
    });
    expect(mockSelectTiles).toHaveBeenCalledTimes(1);
  });

  it('rechecks terrain selection without resubmitting buffers when late sync selects the same tile data', () => {
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.rotation.y = THREE.MathUtils.degToRad(5);
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.didSync).toBe(true);
    expect(result.reason).toBe('stale');
    expect(result.selectionRechecked).toBe(true);
    expect(result.poseWasStale).toBe(true);
    expect(result.projectionChanged).toBe(false);
    expect(result.terrainBufferSubmitted).toBe(false);
    expect(result.submissionClassification).toBe('same-identity');
    expect(result.rotationDeltaDeg).toBeGreaterThan(4);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(1);
    expect(mockResubmitCurrentInstances).not.toHaveBeenCalled();
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      regularInstanceSubmissions: 1,
      lateSyncInstanceSubmissions: 0,
      lateSyncSameIdentitySubmissions: 0,
      lateSyncDynamicsChangedSubmissions: 0,
      lateSyncTileSetChangedSubmissions: 0,
      lastSubmissionOrigin: 'regular',
      lastSubmissionClassification: 'initial',
    });
  });

  it('rechecks CDLOD selection on sub-degree render-camera rotation without buffer upload when tile data is unchanged', () => {
    const tile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    mockSelectTiles.mockReturnValue([tile]);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.rotation.y = THREE.MathUtils.degToRad(0.25);
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.didSync).toBe(true);
    expect(result.reason).toBe('stale');
    expect(result.selectionRechecked).toBe(true);
    expect(result.poseWasStale).toBe(true);
    expect(result.projectionChanged).toBe(false);
    expect(result.terrainBufferSubmitted).toBe(false);
    expect(result.submissionClassification).toBe('same-identity');
    expect(result.rotationDeltaDeg).toBeGreaterThan(0.2);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(1);
    expect(mockResubmitCurrentInstances).not.toHaveBeenCalled();

    const secondResult = runtime.syncSelectionForCamera(camera);
    expect(secondResult.reason).toBe('current');
    expect(secondResult.selectionRechecked).toBe(false);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockResubmitCurrentInstances).not.toHaveBeenCalled();
  });

  it('skips terrain buffer submission when late render-camera sync only changes shader-computed morph data', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.1, edgeMorphMask: 0 };
    const morphedTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.7, edgeMorphMask: 0 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([morphedTile]);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.rotation.y = THREE.MathUtils.degToRad(5);
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.didSync).toBe(true);
    expect(result.reason).toBe('stale');
    expect(result.selectionRechecked).toBe(true);
    expect(result.poseWasStale).toBe(true);
    expect(result.projectionChanged).toBe(false);
    expect(result.terrainBufferSubmitted).toBe(false);
    expect(result.submissionClassification).toBe('same-identity');
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(1);
    expect(mockResubmitCurrentInstances).not.toHaveBeenCalled();
    expect(runtime.getActiveTilesForDebug()[0]).toMatchObject({ morphFactor: 0.7 });
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      lateSyncInstanceSubmissions: 0,
      lateSyncSameIdentitySubmissions: 0,
      lateSyncDynamicsChangedSubmissions: 0,
      lateSyncTileSetChangedSubmissions: 0,
      lastSubmissionOrigin: 'regular',
      lastSubmissionClassification: 'initial',
    });
  });

  it('resubmits same terrain tiles when the late render-camera sync changes edge morph data', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.1, edgeMorphMask: 0 };
    const edgeChangedTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.7, edgeMorphMask: 4 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([edgeChangedTile]);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.rotation.y = THREE.MathUtils.degToRad(5);
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.terrainBufferSubmitted).toBe(true);
    expect(result.submissionClassification).toBe('dynamics-changed');
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([edgeChangedTile]);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      lateSyncInstanceSubmissions: 1,
      lateSyncDynamicsChangedSubmissions: 1,
      lastSubmissionOrigin: 'late-sync',
      lastSubmissionClassification: 'dynamics-changed',
    });
  });

  it('resubmits same terrain tiles when late sync changes sparse skirt cover', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.1, edgeMorphMask: 0, edgeSkirtMask: 0 };
    const skirtChangedTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0.7, edgeMorphMask: 0, edgeSkirtMask: 4 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([skirtChangedTile]);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.rotation.y = THREE.MathUtils.degToRad(5);
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.terrainBufferSubmitted).toBe(true);
    expect(result.submissionClassification).toBe('dynamics-changed');
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([skirtChangedTile]);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      lateSyncInstanceSubmissions: 1,
      lateSyncDynamicsChangedSubmissions: 1,
      lastSubmissionOrigin: 'late-sync',
      lastSubmissionClassification: 'dynamics-changed',
    });
  });

  it('rechecks sub-meter render-camera translations before render and resubmits changed terrain selection', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    const nextTile = { x: 100, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([nextTile]);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.position.x = 0.25;
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.didSync).toBe(true);
    expect(result.reason).toBe('stale');
    expect(result.selectionRechecked).toBe(true);
    expect(result.poseWasStale).toBe(true);
    expect(result.positionDeltaMeters).toBeCloseTo(0.25);
    expect(result.terrainBufferSubmitted).toBe(true);
    expect(result.submissionClassification).toBe('tile-set-changed');
    expect(result.rotationDeltaDeg).toBe(0);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(mockResubmitCurrentInstances).not.toHaveBeenCalled();
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([nextTile]);
  });

  it('resubmits terrain tiles when the render camera sees a different CDLOD tile set', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    const nextTile = { x: 100, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([nextTile]);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.rotation.y = THREE.MathUtils.degToRad(5);
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.didSync).toBe(true);
    expect(result.reason).toBe('stale');
    expect(result.selectionRechecked).toBe(true);
    expect(result.poseWasStale).toBe(true);
    expect(result.projectionChanged).toBe(false);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(mockResubmitCurrentInstances).not.toHaveBeenCalled();
  });

  it('surfaces CDLOD tile selection saturation in sync diagnostics', () => {
    const tile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    mockSelectTiles.mockReturnValue([tile]);
    mockWasLastSelectionSaturated.mockReturnValue(true);
    const camera = new THREE.PerspectiveCamera();
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.rotation.y = THREE.MathUtils.degToRad(5);
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.tileSelectionSaturated).toBe(true);
    expect(runtime.wasLastTileSelectionSaturated()).toBe(true);
  });

  it('rechecks projection-only changes without buffer upload when tile data is unchanged', () => {
    const tile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    mockSelectTiles.mockReturnValue([tile]);
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.fov = 55;
    camera.updateProjectionMatrix();
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.didSync).toBe(true);
    expect(result.reason).toBe('stale');
    expect(result.selectionRechecked).toBe(true);
    expect(result.poseWasStale).toBe(false);
    expect(result.projectionChanged).toBe(true);
    expect(result.terrainBufferSubmitted).toBe(false);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(1);
    expect(mockResubmitCurrentInstances).not.toHaveBeenCalled();
  });

  it('rechecks CDLOD selection when render-camera projection changes without a pose change', () => {
    const firstTile = { x: 0, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    const nextTile = { x: -100, z: 0, size: 100, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 };
    mockSelectTiles
      .mockReturnValueOnce([firstTile])
      .mockReturnValue([nextTile]);
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      camera,
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 1000,
        visualMargin: 0,
        maxLODLevels: 4,
        lodRanges: [100, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.update();
    camera.fov = 55;
    camera.updateProjectionMatrix();
    const result = runtime.syncSelectionForCamera(camera);

    expect(result.didSync).toBe(true);
    expect(result.reason).toBe('stale');
    expect(result.selectionRechecked).toBe(true);
    expect(result.poseWasStale).toBe(false);
    expect(result.projectionChanged).toBe(true);
    expect(result.positionDeltaMeters).toBe(0);
    expect(result.rotationDeltaDeg).toBe(0);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(mockResubmitCurrentInstances).not.toHaveBeenCalled();
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([nextTile]);
  });
});
