// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import { DamageNumberSystem } from './DamageNumberSystem';

vi.mock('../../utils/Logger', () => ({
  Logger: {
    warn: vi.fn(),
  },
}));

vi.mock('../engine/playElementAnimation', () => ({
  playElementAnimation: vi.fn(),
}));

describe('DamageNumberSystem', () => {
  let dom: JSDOM;
  let camera: THREE.PerspectiveCamera;
  let system: DamageNumberSystem;
  let now = 1000;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      pretendToBeVisual: true,
    });
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 600 });

    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(now);
      return 1;
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    system = new DamageNumberSystem(camera);
  });

  afterEach(() => {
    system.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it('does not read the clock while no damage numbers are active', () => {
    const nowSpy = vi.mocked(performance.now);
    nowSpy.mockClear();

    system.update();

    expect(nowSpy).not.toHaveBeenCalled();
  });

  it('does not rewrite position styles when the projected position is unchanged', () => {
    system.spawn(new THREE.Vector3(0, 0, -10), 25);

    const active = (system as any).pool.find((entry: any) => entry.active);
    const style = active.element.style as CSSStyleDeclaration;
    let left = style.left;
    let top = style.top;
    let leftWrites = 0;
    let topWrites = 0;

    Object.defineProperty(style, 'left', {
      configurable: true,
      get: () => left,
      set: (value: string) => {
        leftWrites++;
        left = value;
      },
    });
    Object.defineProperty(style, 'top', {
      configurable: true,
      get: () => top,
      set: (value: string) => {
        topWrites++;
        top = value;
      },
    });

    system.update();
    system.update();

    expect(leftWrites).toBe(0);
    expect(topWrites).toBe(0);
    expect(left).toBe('400px');
    expect(top).toBe('300px');
  });

  it('does not rewrite hidden opacity while an active number remains offscreen', () => {
    system.spawn(new THREE.Vector3(2000, 0, -10), 25);

    const active = (system as any).pool.find((entry: any) => entry.active);
    const style = active.element.style as CSSStyleDeclaration;
    let opacity = style.opacity;
    let opacityWrites = 0;

    Object.defineProperty(style, 'opacity', {
      configurable: true,
      get: () => opacity,
      set: (value: string) => {
        opacityWrites++;
        opacity = value;
      },
    });

    system.update();
    system.update();

    expect(opacityWrites).toBe(0);
    expect(opacity).toBe('0');
  });

  it('restores a hidden active number when it projects back onscreen', () => {
    system.spawn(new THREE.Vector3(2000, 0, -10), 25);

    const active = (system as any).pool.find((entry: any) => entry.active);
    expect(active.element.style.opacity).toBe('0');

    active.worldPos.set(0, 0, -10);
    system.update();

    expect(active.element.style.opacity).toBe('');
    expect(active.element.style.left).toBe('400px');
    expect(active.element.style.top).toBe('300px');
  });

  it('returns expired damage numbers to the reusable pool', () => {
    for (let i = 0; i < 30; i++) {
      system.spawn(new THREE.Vector3(0, 0, -10), 10 + i);
    }
    system.spawn(new THREE.Vector3(0, 0, -10), 99);
    expect(vi.mocked(Logger.warn)).toHaveBeenCalledTimes(1);

    now += 801;
    system.update();

    for (let i = 0; i < 30; i++) {
      system.spawn(new THREE.Vector3(0, 0, -10), 20 + i);
    }

    expect(vi.mocked(Logger.warn)).toHaveBeenCalledTimes(1);
  });
});
