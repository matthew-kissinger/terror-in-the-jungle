import * as THREE from 'three';
import { Logger } from '../../utils/Logger';

/**
 * Retro post-processing: pixelation + color quantization.
 *
 * Usage (in game loop):
 *   postProcessing.beginFrame();
 *   renderer.render(worldScene, worldCamera);
 *   renderer.clearDepth();
 *   renderer.render(overlayScene, overlayCamera);  // weapons, grenades, etc.
 *   postProcessing.endFrame();
 *
 * Everything rendered between begin/end goes through the low-res target
 * and gets the retro pixelation + color quantization treatment.
 */
export class PostProcessingManager {
  private renderer: THREE.WebGLRenderer;
  private enabled = true;

  private renderTarget: THREE.WebGLRenderTarget;
  private pixelScale: number;

  private blitScene: THREE.Scene;
  private blitCamera: THREE.OrthographicCamera;
  private blitMaterial: THREE.ShaderMaterial;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    _camera: THREE.Camera,
  ) {
    this.renderer = renderer;
    this.pixelScale = 3;

    const size = renderer.getSize(new THREE.Vector2());
    const w = Math.max(1, Math.floor(size.x / this.pixelScale));
    const h = Math.max(1, Math.floor(size.y / this.pixelScale));

    this.renderTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
    });

    this.blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blitScene = new THREE.Scene();

    this.blitMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        colorLevels: { value: 24.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float colorLevels;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          color.rgb = floor(color.rgb * colorLevels + 0.5) / colorLevels;
          gl_FragColor = color;
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMaterial);
    quad.frustumCulled = false;
    this.blitScene.add(quad);

    Logger.info('render', `Retro post-processing: pixelScale=${this.pixelScale}, colorLevels=24`);
  }

  /** Redirect all subsequent renderer.render() calls into the low-res target. */
  beginFrame(): void {
    if (!this.enabled) return;
    this.renderer.setRenderTarget(this.renderTarget);
  }

  /** Blit low-res target to screen with color quantization. */
  endFrame(): void {
    if (!this.enabled) return;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / this.pixelScale));
    const h = Math.max(1, Math.floor(height / this.pixelScale));
    this.renderTarget.setSize(w, h);
  }

  setPixelSize(size: number): void {
    this.pixelScale = Math.max(1, size);
    const s = this.renderer.getSize(new THREE.Vector2());
    this.setSize(s.x, s.y);
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

  dispose(): void {
    this.renderTarget.dispose();
    this.blitMaterial.dispose();
  }
}
