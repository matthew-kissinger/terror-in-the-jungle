import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  SMAAEffect,
  SMAAPreset
} from 'postprocessing';
import { PixelationPass } from './PixelationPass';
import { Logger } from '../../utils/Logger';

export class PostProcessingManager {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private pixelationPass: PixelationPass;
  private enabled: boolean = false; // SALVAGE DEBUG: Disabled to test raw scene rendering
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

    // Initialize composer
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType
    });

    // Add render pass
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Add pixelation with outline pass
    this.pixelationPass = new PixelationPass(
      1,     // Pixel size (1 for minimal pixelation, best quality)
      0.7,   // Outline strength (0.7 for visible but not overwhelming)
      0.25   // Outline threshold (0.25 to catch sprite edges and white fringes)
    );
    this.composer.addPass(this.pixelationPass);

    // Optional: Add very subtle anti-aliasing for the pixelated edges
    // This helps smooth the outlines without losing the pixel art feel
    const smaaEffect = new SMAAEffect({
      preset: SMAAPreset.LOW,
      edgeDetectionMode: 1
    });
    const smaaPass = new EffectPass(camera, smaaEffect);
    smaaPass.renderToScreen = true;
    this.composer.addPass(smaaPass);

    Logger.info('render', 'Post-processing passes configured (pixelation + SMAA)');
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
    this.pixelationPass.setPixelSize(size);
  }

  setOutlineStrength(strength: number): void {
    this.pixelationPass.setOutlineStrength(strength);
  }

  setOutlineThreshold(threshold: number): void {
    this.pixelationPass.setOutlineThreshold(threshold);
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
