/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PostProcessingManager } from './PostProcessingManager';

type WindowOverride = Window & typeof globalThis & { __postProcessing?: string };

function setOverride(value: string | undefined): void {
  (window as WindowOverride).__postProcessing = value;
}

/**
 * A plain (non-WebGPU) renderer. `isWebGPURenderer` is absent, so it is never
 * post-eligible — the P6 stack only attaches to the unified WebGPU renderer
 * (+ WebGL2 fallback), never the `?renderer=webgl` legacy path.
 */
function recordingRenderer(): {
  renderer: THREE.WebGLRenderer;
  setRenderTarget: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
} {
  const setRenderTarget = vi.fn();
  const render = vi.fn();
  return {
    renderer: {
      setRenderTarget,
      render,
      clear: vi.fn(),
      getSize: (t: THREE.Vector2) => t.set(1280, 720),
      getPixelRatio: () => 1,
    } as unknown as THREE.WebGLRenderer,
    setRenderTarget,
    render,
  };
}

/**
 * Behavior contract for the post-processing shim.
 *
 * The shim is the render loop's stable surface. The load-bearing safety property
 * (the campaign ships default-OFF behind a kill-switch): on an ineligible /
 * non-WebGPU renderer, and with post off, the shim is a true no-op — inactive,
 * touching no render target — so the loop is unchanged. We assert that no-op
 * behavior, plus the pixel-size compatibility state the input layer still reads.
 */
describe('PostProcessingManager', () => {
  afterEach(() => {
    setOverride(undefined);
  });

  it('stays a no-op on a non-WebGPU renderer even when forced on', () => {
    setOverride('golden'); // force-enable via kill-switch; renderer still ineligible
    const rec = recordingRenderer();
    const post = new PostProcessingManager(
      rec.renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
    );

    post.beginFrame();
    post.endFrame();

    expect(post.isActive()).toBe(false);
    expect(post.isEnabled()).toBe(false);
    expect(post.getLut()).toBeNull();
    expect(rec.setRenderTarget).not.toHaveBeenCalled();
    expect(rec.render).not.toHaveBeenCalled();
  });

  it('is inactive with no override (default-OFF kill-switch)', () => {
    setOverride(undefined);
    const rec = recordingRenderer();
    const post = new PostProcessingManager(
      rec.renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
    );

    expect(post.isActive()).toBe(false);
    expect(rec.setRenderTarget).not.toHaveBeenCalled();
  });

  it('retains pixel-size state for input compatibility without reallocating render targets', () => {
    const rec = recordingRenderer();
    const post = new PostProcessingManager(
      rec.renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
    );

    post.setPixelSize(3);
    post.setSize(1920, 1080);
    post.dispose();

    expect(post.getPixelSize()).toBe(3);
    expect(rec.setRenderTarget).not.toHaveBeenCalled();
    expect(rec.render).not.toHaveBeenCalled();
  });

  it('clamps pixel-size compatibility state to at least one', () => {
    const post = new PostProcessingManager(
      recordingRenderer().renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
    );

    post.setPixelSize(0);

    expect(post.getPixelSize()).toBe(1);
  });
});
