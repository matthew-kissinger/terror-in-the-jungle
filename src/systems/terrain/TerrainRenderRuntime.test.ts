// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const { mockQuadtreeCtor, mockSelectTiles, mockUpdateInstances, mockWasLastSelectionSaturated } = vi.hoisted(() => ({
  mockQuadtreeCtor: vi.fn(),
  mockSelectTiles: vi.fn().mockReturnValue([]),
  mockUpdateInstances: vi.fn(),
  mockWasLastSelectionSaturated: vi.fn().mockReturnValue(false),
}));

vi.mock('./CDLODQuadtree', () => ({
  CDLODQuadtree: class {
    constructor(worldSize: number, maxLOD: number, lodRanges: readonly number[]) {
      mockQuadtreeCtor(worldSize, maxLOD, lodRanges);
    }
    selectTiles = mockSelectTiles;
    getSelectedTileCount = vi.fn().mockReturnValue(0);
    wasLastSelectionSaturated = mockWasLastSelectionSaturated;
  },
}));

vi.mock('./CDLODRenderer', () => ({
  CDLODRenderer: class {
    getMesh = vi.fn().mockReturnValue({});
    configureBoundedShadowPass = vi.fn();
    updateInstances = mockUpdateInstances;
    getShadowPassStatsForDebug = vi.fn().mockReturnValue({
      boundedShadowPassEnabled: false,
      shadowPrefixInstances: 0,
      lastMainPassInstances: 0,
      lastShadowPassInstances: 0,
      shadowPassReductions: 0,
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
    mockUpdateInstances.mockClear();
    mockWasLastSelectionSaturated.mockClear();
    mockWasLastSelectionSaturated.mockReturnValue(false);
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
    expect(activeTiles).toEqual(regrownTiles);
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

  it('keeps regular terrain buffer submissions when morph data changes', () => {
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
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      instanceSubmissions: 2,
      unchangedSubmissionSkips: 0,
      lastSubmissionSkipped: false,
    });
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([morphedTile]);
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

  it('resubmits terrain buffers when a late render-camera sync selects the same tiles', () => {
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
    expect(result.terrainBufferSubmitted).toBe(true);
    expect(result.submissionClassification).toBe('same-identity');
    expect(result.rotationDeltaDeg).toBeGreaterThan(4);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      regularInstanceSubmissions: 1,
      lateSyncInstanceSubmissions: 1,
      lateSyncSameIdentitySubmissions: 1,
      lateSyncDynamicsChangedSubmissions: 0,
      lateSyncTileSetChangedSubmissions: 0,
      lastSubmissionOrigin: 'late-sync',
      lastSubmissionClassification: 'same-identity',
    });
  });

  it('resubmits CDLOD selection on sub-degree render-camera rotation for GPU-buffer coherency', () => {
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
    expect(result.terrainBufferSubmitted).toBe(true);
    expect(result.submissionClassification).toBe('same-identity');
    expect(result.rotationDeltaDeg).toBeGreaterThan(0.2);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);

    const secondResult = runtime.syncSelectionForCamera(camera);
    expect(secondResult.reason).toBe('current');
    expect(secondResult.selectionRechecked).toBe(false);
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
  });

  it('resubmits same terrain tiles when the late render-camera sync changes morph data', () => {
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
    expect(result.terrainBufferSubmitted).toBe(true);
    expect(result.submissionClassification).toBe('dynamics-changed');
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([morphedTile]);
    expect(runtime.getSubmissionStatsForDebug()).toMatchObject({
      lateSyncInstanceSubmissions: 1,
      lateSyncSameIdentitySubmissions: 0,
      lateSyncDynamicsChangedSubmissions: 1,
      lateSyncTileSetChangedSubmissions: 0,
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

  it('resubmits projection-only rechecks for render-camera GPU-buffer coherency', () => {
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
    expect(mockSelectTiles).toHaveBeenCalledTimes(2);
    expect(mockUpdateInstances).toHaveBeenCalledTimes(2);
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
    expect(mockUpdateInstances.mock.calls.at(-1)?.[0]).toEqual([nextTile]);
  });
});
