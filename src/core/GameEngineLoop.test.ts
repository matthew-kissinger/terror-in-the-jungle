// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { animate, resetState, start, stop } from './GameEngineLoop';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';

describe('GameEngineLoop', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  let nextId = 1;
  let cancelAnimationFrameMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nextId = 1;
    globalThis.requestAnimationFrame = vi.fn((_callback: FrameRequestCallback) => nextId++);
    cancelAnimationFrameMock = vi.fn();
    globalThis.cancelAnimationFrame = cancelAnimationFrameMock;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
    resetState();
    delete (globalThis as { __ENABLE_PERF_DIAGNOSTICS__?: boolean }).__ENABLE_PERF_DIAGNOSTICS__;
    delete (globalThis as { __ENABLE_PERF_HARNESS__?: boolean }).__ENABLE_PERF_HARNESS__;
    delete (globalThis as { __gameLoopFrameBreakdown?: unknown }).__gameLoopFrameBreakdown;
    delete (globalThis as { __presentationEpochContext?: unknown }).__presentationEpochContext;
  });

  function createEngine(overrides: Partial<any> = {}): any {
    return {
      isLoopRunning: false,
      isDisposed: false,
      animationFrameId: null,
      isInitialized: false,
      gameStarted: false,
      contextLost: false,
      ...overrides,
    };
  }

  function createBreakdownEntry(frameCount: number): any {
    return {
      frameCount,
      startedAtMs: frameCount,
      endedAtMs: frameCount + 1,
      timestampDeltaMs: 30,
      callbackDurationMs: 20,
      segmentTotalMs: 20,
      unmeasuredCallbackMs: 0,
      segments: { test: frameCount },
      systemTimings: [],
      telemetryTimings: [],
    };
  }

  it('start() schedules the first animation frame', () => {
    const engine = createEngine();

    start(engine);

    expect(engine.isLoopRunning).toBe(true);
    expect(engine.animationFrameId).toBe(1);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('animate() reschedules when the engine is not ready yet', () => {
    const engine = createEngine({ isLoopRunning: true });

    animate(engine);

    expect(engine.animationFrameId).toBe(1);
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('stop() cancels the pending animation frame', () => {
    const engine = createEngine();
    start(engine);

    stop(engine);

    expect(engine.isLoopRunning).toBe(false);
    expect(engine.animationFrameId).toBeNull();
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
  });

  it('does not schedule new frames when disposed', () => {
    const engine = createEngine({ isDisposed: true });

    start(engine);
    animate(engine);

    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    expect(engine.animationFrameId).toBeNull();
  });

  it('records render-boundary user timings when perf diagnostics are enabled', () => {
    (globalThis as { __ENABLE_PERF_DIAGNOSTICS__?: boolean }).__ENABLE_PERF_DIAGNOSTICS__ = true;
    const measureSpy = vi.spyOn(performance, 'measure');
    vi.spyOn(performance, 'mark');
    vi.spyOn(performance, 'clearMarks');
    const beginSystemSpy = vi.spyOn(performanceTelemetry, 'beginSystem');
    const endSystemSpy = vi.spyOn(performanceTelemetry, 'endSystem');

    const renderer = {
      render: vi.fn(),
      clearDepth: vi.fn(),
      autoClear: true,
    };
    const postProcessing = {
      beginFrame: vi.fn(),
      endFrame: vi.fn(),
    };
    const engine = createEngine({
      isLoopRunning: true,
      isInitialized: true,
      gameStarted: true,
      clock: {
        update: vi.fn(),
        getDelta: vi.fn(() => 0.04),
      },
      timeScale: {
        get: vi.fn(() => 1),
        postDispatch: vi.fn(),
      },
      systemManager: {
        updateSystems: vi.fn(),
        getSystemTimings: vi.fn(() => [
          { name: 'Combat', timeMs: 3, lastMs: 7, emaMs: 3, budgetMs: 5 },
          { name: 'Terrain', timeMs: 1, lastMs: 1, emaMs: 1, budgetMs: 2 },
        ]),
        getTopSystemTimingsByLast: vi.fn(() => [
          { name: 'Combat', timeMs: 3, lastMs: 7, emaMs: 3, budgetMs: 5 },
          { name: 'Terrain', timeMs: 1, lastMs: 1, emaMs: 1, budgetMs: 2 },
        ]),
        atmosphereSystem: {
          syncDomePosition: vi.fn(),
          setTerrainYAtCamera: vi.fn(),
        },
        terrainSystem: {
          getHeightAt: vi.fn(() => 0),
        },
        mortarSystem: null,
        firstPersonWeapon: null,
        grenadeSystem: null,
        inventoryManager: null,
      },
      renderer: {
        getActiveCamera: vi.fn(() => ({ position: { x: 0, y: 0, z: 0 } })),
        beginFrameStats: vi.fn(),
        postProcessing,
        renderer,
        scene: {},
        worldOverlays: null,
      },
      runtimeMetrics: null,
      performanceOverlay: { isVisible: vi.fn(() => false) },
      logOverlay: { isVisible: vi.fn(() => false) },
      debugHud: { isMasterVisible: vi.fn(() => true), update: vi.fn() },
    });

    animate(engine, 1000);

    expect(measureSpy).toHaveBeenCalledWith(
      'GameEngineLoop.RenderMain.renderer.render',
      'GameEngineLoop.RenderMain.renderer.render.start',
      'GameEngineLoop.RenderMain.renderer.render.end'
    );
    expect(measureSpy).toHaveBeenCalledWith(
      'GameEngineLoop.RenderOverlay.postProcessing.endFrame',
      'GameEngineLoop.RenderOverlay.postProcessing.endFrame.start',
      'GameEngineLoop.RenderOverlay.postProcessing.endFrame.end'
    );
    expect(measureSpy).toHaveBeenCalledWith(
      'GameEngineLoop.FrameTail.debugHud',
      'GameEngineLoop.FrameTail.debugHud.start',
      'GameEngineLoop.FrameTail.debugHud.end'
    );
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(postProcessing.beginFrame).toHaveBeenCalledTimes(1);
    expect(postProcessing.endFrame).toHaveBeenCalledTimes(1);
    expect(beginSystemSpy).toHaveBeenCalledWith('RenderMain.PostProcessingBegin');
    expect(endSystemSpy).toHaveBeenCalledWith('RenderMain.PostProcessingBegin');
    expect(beginSystemSpy).toHaveBeenCalledWith('RenderMain.Renderer');
    expect(endSystemSpy).toHaveBeenCalledWith('RenderMain.Renderer');
    expect(beginSystemSpy).toHaveBeenCalledWith('RenderOverlay.PostProcessingEnd');
    expect(endSystemSpy).toHaveBeenCalledWith('RenderOverlay.PostProcessingEnd');
    expect(beginSystemSpy).toHaveBeenCalledWith('FrameTail.RuntimeMetrics');
    expect(endSystemSpy).toHaveBeenCalledWith('FrameTail.RuntimeMetrics');
    expect(beginSystemSpy).toHaveBeenCalledWith('FrameTail.PerformanceOverlay');
    expect(endSystemSpy).toHaveBeenCalledWith('FrameTail.PerformanceOverlay');
    expect(beginSystemSpy).toHaveBeenCalledWith('FrameTail.LogOverlay');
    expect(endSystemSpy).toHaveBeenCalledWith('FrameTail.LogOverlay');
    expect(beginSystemSpy).toHaveBeenCalledWith('FrameTail.DebugHud');
    expect(endSystemSpy).toHaveBeenCalledWith('FrameTail.DebugHud');
    expect(beginSystemSpy).toHaveBeenCalledWith('FrameTail.WorldOverlays');
    expect(endSystemSpy).toHaveBeenCalledWith('FrameTail.WorldOverlays');
    const breakdown = (globalThis as any).__gameLoopFrameBreakdown?.getSnapshot?.();
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]).toMatchObject({
      timestampDeltaMs: 40,
    });
    expect(breakdown[0].segments).toHaveProperty('Simulation.updateSystems');
    expect(breakdown[0].segments).toHaveProperty('RenderMain.renderer.render');
    expect(breakdown[0].segments).toHaveProperty('FrameTail.debugHud');
    expect(breakdown[0].systemTimings[0]).toMatchObject({
      name: 'Combat',
      lastMs: 7,
      emaMs: 3,
      budgetMs: 5,
      overBudget: true,
    });
  });

  it('does not time hidden debug HUD no-ops in perf frame breakdowns', () => {
    (globalThis as { __ENABLE_PERF_DIAGNOSTICS__?: boolean }).__ENABLE_PERF_DIAGNOSTICS__ = true;
    const debugHudUpdate = vi.fn();
    const engine = createEngine({
      isLoopRunning: true,
      isInitialized: true,
      gameStarted: true,
      clock: {
        update: vi.fn(),
        getDelta: vi.fn(() => 0.04),
      },
      timeScale: {
        get: vi.fn(() => 1),
        postDispatch: vi.fn(),
      },
      systemManager: {
        updateSystems: vi.fn(),
        getSystemTimings: vi.fn(() => []),
        atmosphereSystem: {
          syncDomePosition: vi.fn(),
          setTerrainYAtCamera: vi.fn(),
        },
        terrainSystem: {
          getHeightAt: vi.fn(() => 0),
        },
        mortarSystem: null,
        firstPersonWeapon: null,
        grenadeSystem: null,
        inventoryManager: null,
      },
      renderer: {
        getActiveCamera: vi.fn(() => ({ position: { x: 0, y: 0, z: 0 } })),
        beginFrameStats: vi.fn(),
        postProcessing: null,
        renderer: {
          render: vi.fn(),
          autoClear: true,
        },
        scene: {},
        worldOverlays: null,
      },
      runtimeMetrics: null,
      performanceOverlay: { isVisible: vi.fn(() => false) },
      logOverlay: { isVisible: vi.fn(() => false) },
      debugHud: { isMasterVisible: vi.fn(() => false), update: debugHudUpdate },
    });

    animate(engine, 1000);

    expect(debugHudUpdate).not.toHaveBeenCalled();
    const breakdown = (globalThis as any).__gameLoopFrameBreakdown?.getSnapshot?.();
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].segments).not.toHaveProperty('FrameTail.debugHud');
  });

  it('records frame breakdowns in perf harness mode without enabling user timing', () => {
    (globalThis as { __ENABLE_PERF_HARNESS__?: boolean }).__ENABLE_PERF_HARNESS__ = true;
    (globalThis as { __ENABLE_PERF_DIAGNOSTICS__?: boolean }).__ENABLE_PERF_DIAGNOSTICS__ = false;
    const measureSpy = vi.spyOn(performance, 'measure');
    const engine = createEngine({
      isLoopRunning: true,
      isInitialized: true,
      gameStarted: true,
      clock: {
        update: vi.fn(),
        getDelta: vi.fn(() => 0.03),
      },
      timeScale: {
        get: vi.fn(() => 1),
        postDispatch: vi.fn(),
      },
      systemManager: {
        updateSystems: vi.fn(),
        getSystemTimings: vi.fn(() => [
          { name: 'Player.Weapon', timeMs: 2, lastMs: 2, emaMs: 1, budgetMs: 0.25 },
        ]),
        getTopSystemTimingsByLast: vi.fn(() => [
          { name: 'Player.Weapon', timeMs: 2, lastMs: 2, emaMs: 1, budgetMs: 0.25 },
        ]),
        atmosphereSystem: {
          syncDomePosition: vi.fn(),
          setTerrainYAtCamera: vi.fn(),
        },
        terrainSystem: {
          getHeightAt: vi.fn(() => 0),
        },
        mortarSystem: null,
        firstPersonWeapon: null,
        grenadeSystem: null,
        inventoryManager: null,
      },
      renderer: {
        getActiveCamera: vi.fn(() => ({ position: { x: 0, y: 0, z: 0 } })),
        beginFrameStats: vi.fn(),
        postProcessing: null,
        renderer: {
          render: vi.fn(),
          autoClear: true,
        },
        scene: {},
        worldOverlays: null,
      },
      runtimeMetrics: null,
      performanceOverlay: { isVisible: vi.fn(() => false) },
      logOverlay: { isVisible: vi.fn(() => false) },
      debugHud: { isMasterVisible: vi.fn(() => false), update: vi.fn() },
    });

    animate(engine, 1000);

    expect(measureSpy).not.toHaveBeenCalled();
    const breakdown = (globalThis as any).__gameLoopFrameBreakdown?.getSnapshot?.();
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0]).toMatchObject({
      timestampDeltaMs: 30,
    });
    expect(breakdown[0].segments).toHaveProperty('Simulation.updateSystems');
    const segmentTotal = Object.values(breakdown[0].segments as Record<string, number>)
      .reduce((sum, value) => sum + value, 0);
    expect(breakdown[0].segmentTotalMs).toBeCloseTo(segmentTotal, 5);
    expect(breakdown[0].systemTimings[0]).toMatchObject({
      name: 'Player.Weapon',
      overBudget: true,
    });
  });

  it('keeps slow-frame timing snapshots sorted, bounded, and finite', () => {
    (globalThis as { __ENABLE_PERF_HARNESS__?: boolean }).__ENABLE_PERF_HARNESS__ = true;
    const systemTimings = [];
    for (let index = 0; index < 20; index++) {
      systemTimings.push({
        name: `System.${index}`,
        timeMs: index,
        lastMs: index,
        emaMs: index / 2,
        budgetMs: index > 16 ? 1 : 0,
      });
    }
    systemTimings.unshift({
      name: 'System.invalid',
      timeMs: -1,
      lastMs: -1,
      emaMs: 0,
      budgetMs: 0,
    });
    const boundedSystemTimings = systemTimings
      .filter((timing) => timing.lastMs >= 8)
      .reverse();

    const telemetryTimings = [];
    for (let index = 0; index < 22; index++) {
      telemetryTimings.push({
        name: `Telemetry.${index}`,
        lastMs: index + 0.25,
        emaMs: index / 3,
        peakMs: index + 1,
        budgetMs: 0,
      });
    }
    telemetryTimings.unshift({
      name: 'Telemetry.invalid',
      lastMs: -1,
      emaMs: 0,
      peakMs: 0,
      budgetMs: 0,
    });
    const boundedTelemetryTimings = telemetryTimings.slice(7).reverse();
    const systemTopSpy = vi.fn(() => boundedSystemTimings);
    const telemetrySpy = vi
      .spyOn(performanceTelemetry, 'getTopSystemBreakdownByLast')
      .mockReturnValue(boundedTelemetryTimings as any);
    const spliceSpy = vi.spyOn(Array.prototype, 'splice');

    const engine = createEngine({
      isLoopRunning: true,
      isInitialized: true,
      gameStarted: true,
      clock: {
        update: vi.fn(),
        getDelta: vi.fn(() => 0.03),
      },
      timeScale: {
        get: vi.fn(() => 1),
        postDispatch: vi.fn(),
      },
      systemManager: {
        updateSystems: vi.fn(),
        getSystemTimings: vi.fn(() => systemTimings),
        getTopSystemTimingsByLast: systemTopSpy,
        atmosphereSystem: {
          syncDomePosition: vi.fn(),
          setTerrainYAtCamera: vi.fn(),
        },
        terrainSystem: {
          getHeightAt: vi.fn(() => 0),
        },
        mortarSystem: null,
        firstPersonWeapon: null,
        grenadeSystem: null,
        inventoryManager: null,
      },
      renderer: {
        getActiveCamera: vi.fn(() => ({ position: { x: 0, y: 0, z: 0 } })),
        beginFrameStats: vi.fn(),
        postProcessing: null,
        renderer: {
          render: vi.fn(),
          autoClear: true,
        },
        scene: {},
        worldOverlays: null,
      },
      runtimeMetrics: null,
      performanceOverlay: { isVisible: vi.fn(() => false) },
      logOverlay: { isVisible: vi.fn(() => false) },
      debugHud: { isMasterVisible: vi.fn(() => false), update: vi.fn() },
    });

    animate(engine, 1000);

    expect(spliceSpy).not.toHaveBeenCalled();
    const breakdown = (globalThis as any).__gameLoopFrameBreakdown?.getSnapshot?.();
    const systemSnapshot = breakdown[0].systemTimings;
    const telemetrySnapshot = breakdown[0].telemetryTimings;
    expect(systemSnapshot).toHaveLength(12);
    expect(systemSnapshot.map((timing: any) => timing.name)).toEqual([
      'System.19',
      'System.18',
      'System.17',
      'System.16',
      'System.15',
      'System.14',
      'System.13',
      'System.12',
      'System.11',
      'System.10',
      'System.9',
      'System.8',
    ]);
    expect(systemSnapshot.some((timing: any) => timing.name === 'System.invalid')).toBe(false);
    expect(systemSnapshot[0]).toMatchObject({
      name: 'System.19',
      overBudget: true,
    });
    expect(systemTopSpy).toHaveBeenCalledWith(12);
    expect(telemetrySpy).toHaveBeenCalledWith(16);
    expect(telemetrySnapshot).toHaveLength(16);
    expect(telemetrySnapshot.map((timing: any) => timing.name)).toEqual([
      'Telemetry.21',
      'Telemetry.20',
      'Telemetry.19',
      'Telemetry.18',
      'Telemetry.17',
      'Telemetry.16',
      'Telemetry.15',
      'Telemetry.14',
      'Telemetry.13',
      'Telemetry.12',
      'Telemetry.11',
      'Telemetry.10',
      'Telemetry.9',
      'Telemetry.8',
      'Telemetry.7',
      'Telemetry.6',
    ]);
    expect(telemetrySnapshot.some((timing: any) => timing.name === 'Telemetry.invalid')).toBe(false);
  });

  it('keeps the latest slow-frame breakdown samples in chronological order', () => {
    (globalThis as { __ENABLE_PERF_HARNESS__?: boolean }).__ENABLE_PERF_HARNESS__ = true;
    resetState();

    const store = (globalThis as any).__gameLoopFrameBreakdown;
    for (let frameCount = 0; frameCount < 70; frameCount++) {
      store.push(createBreakdownEntry(frameCount));
    }

    const snapshot = store.getSnapshot();
    expect(snapshot).toHaveLength(64);
    expect(snapshot[0].frameCount).toBe(6);
    expect(snapshot[63].frameCount).toBe(69);

    const drained = store.drain();
    expect(drained.map((entry: any) => entry.frameCount)).toEqual(
      Array.from({ length: 64 }, (_, index) => index + 6)
    );
    expect(store.getSnapshot()).toEqual([]);
  });

  it('records slow-frame breakdown frame count without forcing a RuntimeMetrics snapshot', () => {
    (globalThis as { __ENABLE_PERF_HARNESS__?: boolean }).__ENABLE_PERF_HARNESS__ = true;
    const getFrameCount = vi.fn(() => 123);
    const getSnapshot = vi.fn(() => {
      throw new Error('slow-frame breakdown should not force full runtime snapshot');
    });
    const engine = createEngine({
      isLoopRunning: true,
      isInitialized: true,
      gameStarted: true,
      clock: {
        update: vi.fn(),
        getDelta: vi.fn(() => 0.03),
      },
      timeScale: {
        get: vi.fn(() => 1),
        postDispatch: vi.fn(),
      },
      systemManager: {
        updateSystems: vi.fn(),
        getSystemTimings: vi.fn(() => []),
        atmosphereSystem: {
          syncDomePosition: vi.fn(),
          setTerrainYAtCamera: vi.fn(),
        },
        terrainSystem: {
          getHeightAt: vi.fn(() => 0),
        },
        mortarSystem: null,
        firstPersonWeapon: null,
        grenadeSystem: null,
        inventoryManager: null,
      },
      renderer: {
        getActiveCamera: vi.fn(() => ({ position: { x: 0, y: 0, z: 0 } })),
        beginFrameStats: vi.fn(),
        postProcessing: null,
        renderer: {
          render: vi.fn(),
          autoClear: true,
        },
        scene: {},
        worldOverlays: null,
      },
      runtimeMetrics: {
        updateFrame: vi.fn(),
        updateCombatStats: vi.fn(),
        getFrameCount,
        getSnapshot,
      },
      performanceOverlay: { isVisible: vi.fn(() => false) },
      logOverlay: { isVisible: vi.fn(() => false) },
      debugHud: { isMasterVisible: vi.fn(() => false), update: vi.fn() },
    });

    animate(engine, 1000);

    const breakdown = (globalThis as any).__gameLoopFrameBreakdown?.getSnapshot?.();
    expect(getFrameCount).toHaveBeenCalledTimes(2);
    expect(getSnapshot).not.toHaveBeenCalled();
    expect(breakdown[0].frameCount).toBe(123);
  });

  it('feeds the visible performance overlay from bounded timing and summarized vegetation data', () => {
    const getSystemTimings = vi.fn(() => {
      throw new Error('performance overlay should not request the full timing snapshot');
    });
    const getTopSystemTimingsByLast = vi.fn(() => [
      { name: 'Combat', timeMs: 4, lastMs: 9, emaMs: 4, budgetMs: 5 },
      { name: 'Terrain', timeMs: 2, lastMs: 3, emaMs: 2, budgetMs: 4 },
    ]);
    const updateStats = vi.fn();
    const gpuTelemetry = vi
      .spyOn(performanceTelemetry, 'getGPUTelemetry')
      .mockReturnValue({
        available: true,
        gpuTimeMs: 1.5,
        drawCalls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
      });
    const engine = createEngine({
      isLoopRunning: true,
      isInitialized: true,
      gameStarted: true,
      clock: {
        update: vi.fn(),
        getDelta: vi.fn(() => 0.016),
      },
      timeScale: {
        get: vi.fn(() => 1),
        postDispatch: vi.fn(),
      },
      systemManager: {
        updateSystems: vi.fn(),
        getSystemTimings,
        getTopSystemTimingsByLast,
        globalBillboardSystem: {
          getDebugInfo: vi.fn(() => ({
            bambooActive: 7,
            palmActive: 3,
            bambooHighWater: 11,
            palmHighWater: 13,
            chunksTracked: 24,
          })),
        },
        combatantSystem: {
          getCombatStats: vi.fn(() => ({ us: 5, opfor: 6, total: 11 })),
          getTelemetry: vi.fn(() => ({
            lastMs: 2,
            emaMs: 1.5,
            lodHigh: 3,
            lodMedium: 4,
            lodLow: 2,
            lodCulled: 1,
            combatantCount: 10,
            octree: { nodes: 0, maxDepth: 0, avgEntitiesPerLeaf: 0 },
          })),
        },
        atmosphereSystem: {
          syncDomePosition: vi.fn(),
          setTerrainYAtCamera: vi.fn(),
        },
        terrainSystem: {
          getHeightAt: vi.fn(() => 0),
          getWorkerStats: vi.fn(() => ({ queueLength: 1, busyWorkers: 1, totalWorkers: 2 })),
          getActiveTerrainTileCount: vi.fn(() => 8),
          getStreamingMetrics: vi.fn(() => []),
          isTerrainReady: vi.fn(() => true),
        },
        mortarSystem: null,
        firstPersonWeapon: null,
        grenadeSystem: null,
        inventoryManager: null,
      },
      renderer: {
        getActiveCamera: vi.fn(() => ({ position: { x: 0, y: 0, z: 0 } })),
        beginFrameStats: vi.fn(),
        getPerformanceStats: vi.fn(() => ({
          drawCalls: 12,
          triangles: 3456,
          geometries: 7,
          textures: 9,
          programs: 2,
        })),
        postProcessing: null,
        renderer: {
          render: vi.fn(),
          autoClear: true,
        },
        scene: {},
        worldOverlays: null,
      },
      runtimeMetrics: null,
      performanceOverlay: { isVisible: vi.fn(() => true), updateStats },
      logOverlay: { isVisible: vi.fn(() => false) },
      debugHud: { isMasterVisible: vi.fn(() => false), update: vi.fn() },
    });

    animate(engine, 1000);

    expect(getSystemTimings).not.toHaveBeenCalled();
    expect(getTopSystemTimingsByLast).toHaveBeenCalledWith(12);
    expect(updateStats).toHaveBeenCalledWith(expect.objectContaining({
      vegetationActive: 10,
      vegetationReserved: 24,
      systemTimings: [
        { name: 'Combat', timeMs: 4, lastMs: 9, emaMs: 4, budgetMs: 5 },
        { name: 'Terrain', timeMs: 2, lastMs: 3, emaMs: 2, budgetMs: 4 },
      ],
      gpuTimeMs: 1.5,
      gpuTimingAvailable: true,
    }));
    gpuTelemetry.mockRestore();
  });

  it('refreshes terrain render selection against the active camera before scene render', () => {
    (globalThis as { __ENABLE_PERF_HARNESS__?: boolean }).__ENABLE_PERF_HARNESS__ = true;
    const activeCamera = new THREE.PerspectiveCamera();
    activeCamera.position.set(10, 20, 30);
    activeCamera.updateMatrixWorld(true);
    const syncRenderSelectionForCamera = vi.fn(() => ({
      didSync: true,
      reason: 'stale',
      positionDeltaMeters: 0,
      rotationDeltaDeg: 5,
      tileCount: 12,
    }));
    const render = vi.fn();
    const engine = createEngine({
      isLoopRunning: true,
      isInitialized: true,
      gameStarted: true,
      clock: {
        update: vi.fn(),
        getDelta: vi.fn(() => 0.016),
      },
      timeScale: {
        get: vi.fn(() => 1),
        postDispatch: vi.fn(),
      },
      systemManager: {
        updateSystems: vi.fn(),
        getSystemTimings: vi.fn(() => []),
        atmosphereSystem: {
          syncDomePosition: vi.fn(),
          setTerrainYAtCamera: vi.fn(),
        },
        terrainSystem: {
          getHeightAt: vi.fn(() => 5),
          getEffectiveHeightAt: vi.fn(() => 6),
          hasTerrainAt: vi.fn(() => true),
          isAreaReadyAt: vi.fn(() => true),
          getActiveTerrainTileCount: vi.fn(() => 12),
          getActiveTilesForDebug: vi.fn(() => []),
          syncRenderSelectionForCamera,
        },
        mortarSystem: null,
        firstPersonWeapon: null,
        grenadeSystem: null,
        inventoryManager: null,
      },
      renderer: {
        getActiveCamera: vi.fn(() => activeCamera),
        beginFrameStats: vi.fn(),
        postProcessing: null,
        renderer: {
          render,
          autoClear: true,
        },
        scene: {},
        worldOverlays: null,
      },
      runtimeMetrics: null,
      performanceOverlay: { isVisible: vi.fn(() => false) },
      logOverlay: { isVisible: vi.fn(() => false) },
      debugHud: { isMasterVisible: vi.fn(() => false), update: vi.fn() },
    });

    animate(engine, 1000);

    expect(syncRenderSelectionForCamera).toHaveBeenCalledWith(activeCamera);
    expect(syncRenderSelectionForCamera.mock.invocationCallOrder[0])
      .toBeLessThan(render.mock.invocationCallOrder[0]);
    const presentationContext = (globalThis as any).__presentationEpochContext?.getLatestContext?.();
    expect(presentationContext?.terrainSync).toMatchObject({
      didSync: true,
      reason: 'stale',
      rotationDeltaDeg: 5,
      tileCount: 12,
    });
    expect(presentationContext?.terrain?.cameraSample).toMatchObject({
      terrainHeightAtCamera: 5,
      effectiveHeightAtCamera: 6,
      clearanceMeters: 15,
      effectiveClearanceMeters: 14,
      hasTerrain: true,
      areaReady: true,
    });
  });
});
