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
    resetState();
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
});
