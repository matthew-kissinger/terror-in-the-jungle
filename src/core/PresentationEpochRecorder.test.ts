// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getPresentationEpochContextForDebug,
  recordPresentationCameraEpoch,
  resetPresentationEpochContext,
} from './PresentationEpochRecorder';

describe('PresentationEpochRecorder', () => {
  beforeEach(() => {
    (globalThis as { __ENABLE_PERF_HARNESS__?: boolean }).__ENABLE_PERF_HARNESS__ = true;
    resetPresentationEpochContext();
  });

  afterEach(() => {
    resetPresentationEpochContext();
    delete (globalThis as { __ENABLE_PERF_HARNESS__?: boolean }).__ENABLE_PERF_HARNESS__;
    delete (globalThis as { __presentationEpochContext?: unknown }).__presentationEpochContext;
  });

  it('records camera epochs with terrain and renderer context', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 20, 30);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(THREE.MathUtils.degToRad(-5), THREE.MathUtils.degToRad(15), 0);
    camera.updateMatrixWorld(true);

    recordPresentationCameraEpoch({
      stage: 'before-simulation',
      frameCount: 7,
      camera,
      cameraSource: 'main',
    });

    camera.position.set(13, 24, 30);
    camera.rotation.set(THREE.MathUtils.degToRad(-9), THREE.MathUtils.degToRad(25), 0);
    camera.updateMatrixWorld(true);

    recordPresentationCameraEpoch({
      stage: 'after-render',
      frameCount: 7,
      camera,
      cameraSource: 'main',
      terrain: {
        getActiveTilesForDebug: () => [
          { x: 0, z: 0, size: 128, lodLevel: 1, morphFactor: 0.1, edgeMorphMask: 5 },
          { x: 128, z: 0, size: 64, lodLevel: 2, morphFactor: 0, edgeMorphMask: 0 },
        ],
        wasLastTileSelectionSaturated: () => true,
        getRenderSubmissionStatsForDebug: () => ({
          instanceSubmissions: 12,
          regularInstanceSubmissions: 3,
          lateSyncInstanceSubmissions: 9,
          lateSyncSameIdentitySubmissions: 2,
          lateSyncDynamicsChangedSubmissions: 6,
          lateSyncTileSetChangedSubmissions: 1,
          unchangedSubmissionSkips: 4,
          lastSelectionMs: 0.25,
          lastUpdateInstancesMs: 0.5,
          boundedShadowPassEnabled: true,
          shadowRadiusMeters: 640,
          shadowPrefixInstances: 40,
          lastMainPassInstances: 160,
          lastShadowPassInstances: 40,
          shadowPassReductions: 7,
        }),
        getHeightAt: () => 18,
        getEffectiveHeightAt: () => 19,
        hasTerrainAt: () => true,
        isAreaReadyAt: () => false,
      },
      terrainSync: {
        didSync: true,
        reason: 'stale',
        selectionRechecked: true,
        poseWasStale: true,
        projectionChanged: false,
        positionDeltaMeters: 4,
        rotationDeltaDeg: 10,
        tileCount: 2,
        tileSelectionSaturated: true,
        terrainBufferSubmitted: true,
        submissionClassification: 'dynamics-changed',
      },
      rendererStats: {
        drawCalls: 42,
        triangles: 1234,
        geometries: 8,
        textures: 9,
        programs: 3,
      },
    });

    const context = getPresentationEpochContextForDebug();

    expect(context?.frameCount).toBe(7);
    expect(context?.cameraEpochs.map((epoch) => epoch.stage)).toEqual(['before-simulation', 'after-render']);
    expect(context?.cameraEpochs[1]?.deltaFromPrevious?.positionMeters).toBeCloseTo(5);
    expect(context?.cameraEpochs[1]?.deltaFromPrevious?.yawDeg).toBeCloseTo(10);
    expect(context?.cameraEpochs[1]?.deltaFromPrevious?.pitchDeg).toBeCloseTo(-4);
    expect(context?.terrain).toMatchObject({
      tileCount: 2,
      tileSelectionSaturated: true,
      lodCounts: { '1': 1, '2': 1 },
      morphingTiles: 1,
      maxMorphFactor: 0.1,
      edgeMorphTiles: 1,
      edgeMorphMaskCounts: { '0': 1, '5': 1 },
      minTileSize: 64,
      maxTileSize: 128,
      cameraSample: {
        terrainHeightAtCamera: 18,
        effectiveHeightAtCamera: 19,
        clearanceMeters: 6,
        effectiveClearanceMeters: 5,
        hasTerrain: true,
        areaReady: false,
      },
    });
    expect(context?.terrainByStage?.['after-render']).toMatchObject({
      tileCount: 2,
      tileSelectionSaturated: true,
      lodCounts: { '1': 1, '2': 1 },
    });
    expect(context?.terrainSync).toMatchObject({
      didSync: true,
      reason: 'stale',
      selectionRechecked: true,
      poseWasStale: true,
      projectionChanged: false,
      positionDeltaMeters: 4,
      rotationDeltaDeg: 10,
      tileCount: 2,
      tileSelectionSaturated: true,
      terrainBufferSubmitted: true,
      submissionClassification: 'dynamics-changed',
    });
    expect(context?.terrainRender).toMatchObject({
      instanceSubmissions: 12,
      lateSyncInstanceSubmissions: 9,
      lateSyncDynamicsChangedSubmissions: 6,
      lastSelectionMs: 0.25,
      lastUpdateInstancesMs: 0.5,
      boundedShadowPassEnabled: true,
      shadowRadiusMeters: 640,
      shadowPrefixInstances: 40,
      lastMainPassInstances: 160,
      lastShadowPassInstances: 40,
      shadowPrefixRatio: 0.25,
      shadowPassReductions: 7,
    });
    expect(context?.terrain?.tileHash).toMatch(/^[0-9a-f]{8}$/);
    expect(context?.terrain?.tileIdentityHash).toMatch(/^[0-9a-f]{8}$/);
    expect(context?.terrain?.morphHash).toMatch(/^[0-9a-f]{8}$/);
    expect(context?.terrain?.edgeMaskHash).toMatch(/^[0-9a-f]{8}$/);
    expect(context?.renderer).toMatchObject({
      drawCalls: 42,
      triangles: 1234,
    });
  });

  it('keeps per-stage terrain snapshots instead of only the latest terrain', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);
    camera.updateMatrixWorld(true);

    recordPresentationCameraEpoch({
      stage: 'after-simulation',
      frameCount: 21,
      camera,
      cameraSource: 'main',
      terrain: {
        getActiveTilesForDebug: () => [
          { x: 0, z: 0, size: 128, lodLevel: 1, morphFactor: 0 },
        ],
        wasLastTileSelectionSaturated: () => false,
      },
    });

    recordPresentationCameraEpoch({
      stage: 'before-render',
      frameCount: 21,
      camera,
      cameraSource: 'main',
      terrain: {
        getActiveTilesForDebug: () => [
          { x: 0, z: 0, size: 128, lodLevel: 1, morphFactor: 0 },
          { x: 128, z: 0, size: 64, lodLevel: 2, morphFactor: 0.2 },
        ],
        wasLastTileSelectionSaturated: () => true,
      },
    });

    const context = getPresentationEpochContextForDebug();

    expect(context?.terrain).toMatchObject({
      tileCount: 2,
      tileSelectionSaturated: true,
    });
    expect(context?.terrainByStage?.['after-simulation']).toMatchObject({
      tileCount: 1,
      tileSelectionSaturated: false,
      lodCounts: { '1': 1 },
    });
    expect(context?.terrainByStage?.['before-render']).toMatchObject({
      tileCount: 2,
      tileSelectionSaturated: true,
      lodCounts: { '1': 1, '2': 1 },
      morphingTiles: 1,
    });
    expect(context?.terrainByStage?.['after-simulation']?.tileHash)
      .not.toBe(context?.terrainByStage?.['before-render']?.tileHash);
  });

  it('includes edge morph masks in terrain hashes and summaries', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);
    camera.updateMatrixWorld(true);

    recordPresentationCameraEpoch({
      stage: 'after-simulation',
      frameCount: 31,
      camera,
      cameraSource: 'main',
      terrain: {
        getActiveTilesForDebug: () => [
          { x: 0, z: 0, size: 128, lodLevel: 1, morphFactor: 0, edgeMorphMask: 0 },
        ],
      },
    });

    recordPresentationCameraEpoch({
      stage: 'before-render',
      frameCount: 31,
      camera,
      cameraSource: 'main',
      terrain: {
        getActiveTilesForDebug: () => [
          { x: 0, z: 0, size: 128, lodLevel: 1, morphFactor: 0, edgeMorphMask: 8 },
        ],
      },
    });

    const context = getPresentationEpochContextForDebug();

    expect(context?.terrainByStage?.['after-simulation']?.edgeMorphTiles).toBe(0);
    expect(context?.terrainByStage?.['before-render']).toMatchObject({
      edgeMorphTiles: 1,
      edgeMorphMaskCounts: { '8': 1 },
    });
    expect(context?.terrainByStage?.['after-simulation']?.tileHash)
      .not.toBe(context?.terrainByStage?.['before-render']?.tileHash);
    expect(context?.terrainByStage?.['after-simulation']?.tileIdentityHash)
      .toBe(context?.terrainByStage?.['before-render']?.tileIdentityHash);
    expect(context?.terrainByStage?.['after-simulation']?.edgeMaskHash)
      .not.toBe(context?.terrainByStage?.['before-render']?.edgeMaskHash);
  });

  it('resets the exposed context', () => {
    const camera = new THREE.PerspectiveCamera();

    recordPresentationCameraEpoch({
      stage: 'before-simulation',
      frameCount: 1,
      camera,
      cameraSource: 'main',
    });
    expect(getPresentationEpochContextForDebug()).not.toBeNull();

    resetPresentationEpochContext();

    expect(getPresentationEpochContextForDebug()).toBeNull();
  });

  it('keeps the latest camera epochs in chronological order', () => {
    const camera = new THREE.PerspectiveCamera();

    for (let index = 0; index < 10; index++) {
      camera.position.set(index, 0, 0);
      camera.updateMatrixWorld(true);
      recordPresentationCameraEpoch({
        stage: 'before-render',
        frameCount: 12,
        camera,
        cameraSource: 'main',
      });
    }

    const context = getPresentationEpochContextForDebug();
    expect(context?.cameraEpochs).toHaveLength(8);
    expect(context?.cameraEpochs.map((epoch) => epoch.position.x)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(context?.cameraEpochs.at(-1)?.deltaFromPrevious?.positionMeters).toBeCloseTo(1);
  });
});
