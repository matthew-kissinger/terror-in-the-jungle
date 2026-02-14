import { Logger } from '../utils/Logger';
import { PostProcessingManager } from '../systems/effects/PostProcessingManager';
import type { GameRenderer } from './GameRenderer';

/**
 * Handles WebGL context loss and restoration.
 * On mobile devices, context loss is common when switching tabs or when the OS
 * reclaims GPU memory. This class shows a recovery overlay and rebuilds GPU
 * resources once the context is restored.
 */
export class WebGLContextRecovery {
  private canvas: HTMLCanvasElement;
  private renderer: GameRenderer;
  private overlay: HTMLDivElement | null = null;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;

  /** True while the WebGL context is lost */
  public contextLost = false;

  constructor(renderer: GameRenderer) {
    this.renderer = renderer;
    this.canvas = renderer.renderer.domElement;

    this.boundContextLost = this.onContextLost.bind(this);
    this.boundContextRestored = this.onContextRestored.bind(this);

    this.canvas.addEventListener('webglcontextlost', this.boundContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.boundContextRestored, false);

    this.createOverlay();
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'webgl-context-recovery-overlay';
    this.overlay.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      z-index: 10001;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const message = document.createElement('div');
    message.style.cssText = `
      color: #7fb4d9;
      font-size: 1.4rem;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 1.5rem 2.5rem;
      border: 2px solid rgba(127, 180, 217, 0.5);
      border-radius: 12px;
    `;
    message.textContent = 'Recovering graphics…';

    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 24px;
      height: 24px;
      margin: 1rem auto 0;
      border: 3px solid rgba(127, 180, 217, 0.3);
      border-top-color: #7fb4d9;
      border-radius: 50%;
      animation: webgl-recovery-spin 0.8s linear infinite;
    `;

    const style = document.createElement('style');
    style.textContent = '@keyframes webgl-recovery-spin { to { transform: rotate(360deg); } }';

    message.appendChild(spinner);
    this.overlay.appendChild(style);
    this.overlay.appendChild(message);
    document.body.appendChild(this.overlay);
  }

  private showOverlay(): void {
    if (this.overlay) {
      this.overlay.style.display = 'flex';
    }
  }

  private hideOverlay(): void {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }

  private onContextLost(event: Event): void {
    event.preventDefault(); // Allow automatic context restore
    this.contextLost = true;
    this.showOverlay();
    Logger.warn('WebGL', 'WebGL context lost — pausing render loop');
  }

  private onContextRestored(): void {
    Logger.info('WebGL', 'WebGL context restored — rebuilding GPU resources');

    const sr = this.renderer;

    // Renderer auto-restores its own state, but we must resize to
    // re-allocate the drawing buffer at the correct dimensions.
    sr.renderer.setSize(window.innerWidth, window.innerHeight);

    // Rebuild the post-processing pipeline (framebuffers, render targets, shaders)
    if (sr.postProcessing) {
      sr.postProcessing.dispose();
      sr.postProcessing = new PostProcessingManager(
        sr.renderer,
        sr.scene,
        sr.camera
      );
    }

    // Force shadow map rebuild
    sr.renderer.shadowMap.needsUpdate = true;

    this.contextLost = false;
    this.hideOverlay();
    Logger.info('WebGL', 'WebGL context recovery complete');
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.boundContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.boundContextRestored);

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
