import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PostProcessingManager } from './PostProcessingManager';

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
    } as unknown as THREE.WebGLRenderer,
    setRenderTarget,
    render,
  };
}

describe('PostProcessingManager', () => {
  it('keeps the retired post path as a no-op so WebGPU proof is not blocked by hidden WebGL resources', () => {
    const rec = recordingRenderer();
    const post = new PostProcessingManager(
      rec.renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(),
    );

    post.setEnabled(true);
    post.beginFrame();
    post.endFrame();

    expect(rec.setRenderTarget).not.toHaveBeenCalled();
    expect(rec.render).not.toHaveBeenCalled();
    expect(post.isEnabled()).toBe(true);
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
