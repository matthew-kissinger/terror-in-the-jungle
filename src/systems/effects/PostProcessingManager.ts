import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import { isMobileGPU } from '../../utils/DeviceDetector';
import { getWorldBuilderState } from '../../dev/worldBuilder/WorldBuilderConsole';

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
    _scene: THREE.Scene,
    _camera: THREE.Camera,
  ) {
    this.renderer = renderer;
    // Mobile already has limited resolution — use lighter pixelation to stay readable
    this.pixelScale = isMobileGPU() ? 1.5 : 3;

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
        uExposure: { value: 1.0 },
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
        uniform float uExposure;
        varying vec2 vUv;
        // 4x4 Bayer ordered-dither matrix scaled to [0, 1).
        // Adds a sub-quantization-step offset before the existing 24-level quantize
        // so smooth gradients (sky dome, fog falloff, skin shading) break into a
        // retro-authentic stipple instead of visible bands.
        const mat4 bayer4x4 = mat4(
          0.0 / 16.0,  8.0 / 16.0,  2.0 / 16.0, 10.0 / 16.0,
         12.0 / 16.0,  4.0 / 16.0, 14.0 / 16.0,  6.0 / 16.0,
          3.0 / 16.0, 11.0 / 16.0,  1.0 / 16.0,  9.0 / 16.0,
         15.0 / 16.0,  7.0 / 16.0, 13.0 / 16.0,  5.0 / 16.0
        );
        // ACES filmic tone-map (Narkowicz 2015 approximation): compresses
        // [0, +inf) into [0, 1] with a soft shoulder that preserves warm
        // tints around the sun direction. Runs BEFORE the Bayer dither +
        // 24-level quantize so near-1.0 warm hues (dawn / dusk / golden
        // hour) do not uniformly floor to white. ~5 ALU; no perf concern.
        vec3 acesFilm(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          color.rgb = acesFilm(color.rgb * uExposure);
          ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
          float threshold = bayer4x4[p.x][p.y];
          float dither = (threshold - 0.5) / colorLevels;
          color.rgb = floor((color.rgb + dither) * colorLevels + 0.5) / colorLevels;
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
    if (!this.enabled || !this.isPostProcessAllowed()) return;
    this.renderer.setRenderTarget(this.renderTarget);
  }

  /** Blit low-res target to screen with color quantization. */
  endFrame(): void {
    if (!this.enabled || !this.isPostProcessAllowed()) return;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }

  /**
   * Honor the WorldBuilder `postProcessEnabled` flag (dev-only, gated by
   * Vite DCE in retail). When the dev console is registered and the flag is
   * false, both begin/end pass into the low-res target are skipped so the
   * scene renders straight to the back buffer at native resolution.
   */
  private isPostProcessAllowed(): boolean {
    if (!import.meta.env.DEV) return true;
    const wb = getWorldBuilderState();
    return !wb || wb.postProcessEnabled;
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
