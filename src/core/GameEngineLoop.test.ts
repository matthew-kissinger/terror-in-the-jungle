import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animate, resetState, start, stop } from './GameEngineLoop';

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
        getDelta: vi.fn(() => 0.016),
      },
      timeScale: {
        get: vi.fn(() => 1),
        postDispatch: vi.fn(),
      },
      systemManager: {
        updateSystems: vi.fn(),
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
      debugHud: { update: vi.fn() },
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
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(postProcessing.beginFrame).toHaveBeenCalledTimes(1);
    expect(postProcessing.endFrame).toHaveBeenCalledTimes(1);
  });
});
