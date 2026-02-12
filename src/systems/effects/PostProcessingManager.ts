import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SMAAEffect,
  SMAAPreset,
  PixelationEffect
} from 'postprocessing';
import { Logger } from '../../utils/Logger';
import { estimateGPUTier, isMobileGPU } from '../../utils/DeviceDetector';

export class PostProcessingManager {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private pixelationEffect: PixelationEffect;
  private pixelationPass: EffectPass;
  private enabled: boolean = true;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    // Store references for fallback rendering
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const gpuTier = estimateGPUTier();
    const isMobile = isMobileGPU();

    // Initialize composer
    this.composer = new EffectComposer(renderer, {
      frameBufferType: gpuTier === 'high' ? THREE.HalfFloatType : THREE.UnsignedByteType
    });

    // Add render pass
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Add pixelation effect using postprocessing's built-in effect
    // Granularity is the pixel size (higher = more pixelated)
    this.pixelationEffect = new PixelationEffect(2);
    this.pixelationPass = new EffectPass(camera, this.pixelationEffect);
    this.composer.addPass(this.pixelationPass);

    // Only add SMAA on medium/high desktop GPUs
    if (!isMobile && gpuTier !== 'low') {
      const smaaEffect = new SMAAEffect({
        preset: gpuTier === 'high' ? SMAAPreset.MEDIUM : SMAAPreset.LOW,
        edgeDetectionMode: 1
      });
      const smaaPass = new EffectPass(camera, smaaEffect);
      smaaPass.renderToScreen = true;
      this.composer.addPass(smaaPass);
      Logger.info('render', `Post-processing: pixelation (granularity 2) + SMAA (${gpuTier === 'high' ? 'MEDIUM' : 'LOW'})`);
    } else {
      this.pixelationPass.renderToScreen = true;
      Logger.info('render', 'Post-processing: pixelation only (mobile/low-tier optimized)');
    }
  }

  render(deltaTime: number): void {
    if (this.enabled) {
      this.composer.render(deltaTime);
    } else {
      // Fallback: render scene directly without post-processing
      this.renderer.render(this.scene, this.camera);
    }
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setPixelSize(size: number): void {
    this.pixelationEffect.granularity = size;
  }

  getPixelSize(): number {
    return this.pixelationEffect.granularity;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.composer.dispose();
  }
}
