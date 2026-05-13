import type * as THREE from 'three';

/**
 * Placeholder for the retired retro post-processing path.
 *
 * The active renderer now draws straight to the back buffer, and the retired
 * low-res blit path is intentionally not retained as a hidden WebGPU blocker.
 * Keep this class as a narrow compatibility shim for input toggles and older
 * tests until a future node-based post pipeline is approved.
 */
export class PostProcessingManager {
  private enabled = false;
  private pixelScale = 1;

  constructor(
    _renderer: THREE.WebGLRenderer,
    _scene: THREE.Scene,
    _camera: THREE.Camera,
  ) {}

  beginFrame(): void {}

  endFrame(): void {}

  setSize(_width: number, _height: number): void {}

  setPixelSize(size: number): void {
    this.pixelScale = Math.max(1, size);
  }

  getPixelSize(): number {
    return this.pixelScale;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {}
}
