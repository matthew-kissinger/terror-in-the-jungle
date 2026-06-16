// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PlayerHealthEffects } from './PlayerHealthEffects';

vi.mock('../../utils/Logger', () => ({
  Logger: { warn: vi.fn() },
}));

function makeCanvasContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('PlayerHealthEffects', () => {
  let canvasContext: CanvasRenderingContext2D;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));
    canvasContext = makeCanvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('adds directional damage indicators without cloning or mutating the input camera vector', () => {
    const effects = new PlayerHealthEffects();
    const sourcePosition = new THREE.Vector3(10, 5, 0);
    const playerPosition = new THREE.Vector3(0, 2, 0);
    const cameraDirection = new THREE.Vector3(0, 0, -1);
    const cameraBefore = cameraDirection.clone();
    const cloneSpy = vi.spyOn(cameraDirection, 'clone').mockImplementation(() => {
      throw new Error('camera direction clone should not be used in the damage indicator path');
    });

    expect(() => {
      effects.addDamageIndicator(25, sourcePosition, playerPosition, cameraDirection);
    }).not.toThrow();

    expect(cloneSpy).not.toHaveBeenCalled();
    expect(cameraDirection.toArray()).toEqual(cameraBefore.toArray());
    const indicators = (effects as any).damageIndicators as Array<{ intensity: number }>;
    expect(indicators).toHaveLength(1);
    expect(indicators[0].intensity).toBe(0.5);
    effects.dispose();
  });

  it('compacts expired damage indicators in place', () => {
    const effects = new PlayerHealthEffects();
    const indicators = (effects as any).damageIndicators as Array<{
      direction: number;
      intensity: number;
      timestamp: number;
      fadeTime: number;
    }>;
    const now = Date.now();
    indicators.push(
      { direction: 1, intensity: 0.4, timestamp: now - 3000, fadeTime: 2 },
      { direction: 2, intensity: 0.8, timestamp: now - 500, fadeTime: 2 },
    );

    effects.updateDamageIndicators(1 / 60);

    expect((effects as any).damageIndicators).toBe(indicators);
    expect(indicators).toHaveLength(1);
    expect(indicators[0].direction).toBe(2);
    effects.dispose();
  });

  it('skips clock work when there are no damage indicators', () => {
    const effects = new PlayerHealthEffects();
    const nowSpy = vi.spyOn(Date, 'now');

    effects.updateDamageIndicators(1 / 60);

    expect(nowSpy).not.toHaveBeenCalled();
    effects.dispose();
  });

  it('skips canvas clears while the damage overlay is clean and inactive', () => {
    const effects = new PlayerHealthEffects();

    effects.renderDamageOverlay(150, 150);

    expect(canvasContext.clearRect).not.toHaveBeenCalled();
    effects.dispose();
  });

  it('clears stale damage overlay content once after indicators expire', () => {
    const effects = new PlayerHealthEffects();
    effects.addDamageIndicator(
      25,
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    );

    effects.renderDamageOverlay(125, 150);
    expect(canvasContext.clearRect).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2500);
    effects.updateDamageIndicators(1 / 60);
    expect((effects as any).damageIndicators).toHaveLength(0);

    vi.mocked(canvasContext.clearRect).mockClear();
    effects.renderDamageOverlay(150, 150);
    expect(canvasContext.clearRect).toHaveBeenCalledTimes(1);

    vi.mocked(canvasContext.clearRect).mockClear();
    effects.renderDamageOverlay(150, 150);
    expect(canvasContext.clearRect).not.toHaveBeenCalled();
    effects.dispose();
  });

  it('clears damage indicators without replacing the retained array', () => {
    const effects = new PlayerHealthEffects();
    const indicators = (effects as any).damageIndicators as Array<{
      direction: number;
      intensity: number;
      timestamp: number;
      fadeTime: number;
    }>;
    indicators.push({ direction: 1, intensity: 1, timestamp: Date.now(), fadeTime: 2 });

    effects.clearDamageIndicators();

    expect((effects as any).damageIndicators).toBe(indicators);
    expect(indicators).toHaveLength(0);
    effects.dispose();
  });
});
