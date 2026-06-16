// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { CompassSystem } from './CompassSystem';

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
  },
}));

describe('CompassSystem', () => {
  let dom: JSDOM;
  let camera: THREE.PerspectiveCamera;
  let compass: CompassSystem;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);

    camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld(true);

    compass = new CompassSystem(camera);
    await compass.init(dom.window.document.body);
  });

  afterEach(() => {
    compass.dispose();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it('does not rewrite heading text or rose transform when heading is unchanged', () => {
    compass.update(0);

    const heading = (compass as any).headingText as HTMLElement;
    const rose = (compass as any).compassRose as HTMLDivElement;
    let headingText = heading.textContent;
    let roseTransform = rose.style.transform;
    let headingWrites = 0;
    let transformWrites = 0;

    Object.defineProperty(heading, 'textContent', {
      configurable: true,
      get: () => headingText,
      set: (value: string | null) => {
        headingWrites++;
        headingText = value;
      },
    });
    Object.defineProperty(rose.style, 'transform', {
      configurable: true,
      get: () => roseTransform,
      set: (value: string) => {
        transformWrites++;
        roseTransform = value;
      },
    });

    compass.update(1 / 60);
    compass.update(1 / 60);

    expect(headingWrites).toBe(0);
    expect(transformWrites).toBe(0);
    expect(headingText).toBe('180°');
    expect(roseTransform).toBe('translate(calc(-50% + 360px), -50%)');
  });
});
