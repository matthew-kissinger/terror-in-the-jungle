import * as THREE from 'three';
import { PixelPerfectUtils } from '../utils/PixelPerfect';
import { PostProcessingManager } from '../systems/effects/PostProcessingManager';
import { CrosshairSystem } from '../ui/hud/CrosshairSystem';
import type { CrosshairMode } from '../ui/hud/CrosshairSystem';
import { LoadingUI } from './LoadingUI';
import { Logger } from '../utils/Logger';
import { freezeTransform } from '../utils/SceneUtils';
import { estimateGPUTier, isMobileGPU, shouldEnableShadows, getShadowMapSize, getMaxPixelRatio } from '../utils/DeviceDetector';
import { ViewportInfo, ViewportManager } from '../ui/design/responsive';

/**
 * Determine whether the WebGLRenderer should preserve its drawing buffer.
 *
 * Required by PlaytestCaptureManager (F9) for `renderer.domElement.toBlob()`
 * to return a non-blank PNG — but retaining the back-buffer adds ~13 MB of
 * heap residual that retail players who never press F9 shouldn't pay.
 *
 * - On in dev builds (F9 + other debug tooling are active by default).
 * - Opt-in on retail via `?capture=1` URL param so Cloudflare testers can
 *   reach F9 without a local dev checkout.
 * - Off otherwise.
 *
 * Exported for tests only; do not import from other runtime modules.
 */
export function shouldPreserveDrawingBuffer(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('capture')) return false;
  return params.get('capture') !== '0';
}

export class GameRenderer {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public postProcessing?: PostProcessingManager;
  /**
   * Optional camera override. When set, the main render loop draws the scene
   * from this camera instead of `this.camera`. Used by FreeFlyCamera for
   * detached-spectator debug; clearing it restores the player/vehicle view.
   * See `src/ui/debug/FreeFlyCamera.ts`.
   */
  private overrideCamera: THREE.PerspectiveCamera | null = null;

  // Exposed environment properties for WeatherSystem
  public fog?: THREE.FogExp2;
  public ambientLight?: THREE.AmbientLight;
  public moonLight?: THREE.DirectionalLight;
  public hemisphereLight?: THREE.HemisphereLight;

  private crosshairSystem = new CrosshairSystem();
  private loadingUI = new LoadingUI();
  private viewportUnsubscribe?: () => void;

  constructor() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // Disabled for pixel-perfect rendering
      powerPreference: 'high-performance',
      // Required for the F9 playtest capture overlay to call
      // `renderer.domElement.toBlob()` and get a non-blank PNG. Gated
      // behind DEV or `?capture=1` so retail players don't pay the
      // ~13 MB back-buffer residual when they'll never press F9. See
      // `shouldPreserveDrawingBuffer` above and
      // docs/tasks/preserve-drawing-buffer-dev-gate.md.
      preserveDrawingBuffer: shouldPreserveDrawingBuffer()
    });

    this.setupRenderer();
    this.setupLighting();
    this.setupPostProcessing();
  }

  private setupRenderer(): void {
    const gpuTier = estimateGPUTier();
    const isMobile = isMobileGPU();

    Logger.info('Renderer', `Initializing renderer (Tier: ${gpuTier}, Mobile: ${isMobile})`);

    // Configure for pixel-perfect rendering
    PixelPerfectUtils.configureRenderer(this.renderer);
    // Aggregate stats across the whole frame; the loop resets once before rendering.
    this.renderer.info.autoReset = false;

    // Device-adaptive pixel ratio
    this.renderer.setPixelRatio(getMaxPixelRatio());

    const initialViewport = ViewportManager.getInstance().info;
    this.renderer.setSize(initialViewport.width, initialViewport.height);

    // Device-adaptive shadow settings
    this.renderer.shadowMap.enabled = shouldEnableShadows();
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    document.body.appendChild(this.renderer.domElement);

    // Hide renderer initially
    this.renderer.domElement.style.display = 'none';

    this.viewportUnsubscribe = ViewportManager.getInstance().subscribe((info) => {
      this.applyViewport(info);
    });
  }

  private setupLighting(): void {
    const gpuTier = estimateGPUTier();

    // === ATMOSPHERE ===
    // Fog re-enabled with matching support in GPU billboard shader
    // Both terrain and vegetation now fade consistently to fog color.
    //
    // Fog color is initialised to a neutral horizon-ish grey so the first
    // pre-atmosphere frame (before `AtmosphereSystem.update` runs) still
    // reads as "daytime haze" rather than magenta. Each frame the
    // analytic sky backend overwrites `this.fog.color` with the live
    // horizon sample via `AtmosphereSystem.applyFogColor()`, so the
    // horizon seam between terrain and sky vanishes at every sun angle.
    // `scene.background` is a static fallback only — the analytic
    // `HosekWilkieSkyBackend` dome renders in front of it each frame.
    const INITIAL_FOG_COLOR = 0x7a8f88;
    this.scene.background = new THREE.Color(INITIAL_FOG_COLOR);

    // Exponential fog. Bootstrap density only — per-scenario fog density
    // is stamped onto `this.fog.density` by `AtmosphereSystem.applyScenarioPreset`
    // at scenario boot (`fog-density-rebalance`, cycle-2026-04-21) so the
    // density stays tuned alongside the preset's sun angle / horizon color.
    // Weather modulates this base per-frame (x1.5 rain, x3.5 storm).
    this.fog = new THREE.FogExp2(INITIAL_FOG_COLOR, 0.0022);
    this.scene.fog = this.fog;

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(this.ambientLight);
    freezeTransform(this.ambientLight);

    this.moonLight = new THREE.DirectionalLight(0xfffacd, 2.0);
    this.moonLight.position.set(0, 80, -50);
    this.moonLight.castShadow = shouldEnableShadows();

    // Device-adaptive shadow map size
    const shadowMapSize = getShadowMapSize();
    this.moonLight.shadow.mapSize.width = shadowMapSize;
    this.moonLight.shadow.mapSize.height = shadowMapSize;

    this.moonLight.shadow.camera.near = 0.5;
    this.moonLight.shadow.camera.far = 300;

    // Smaller shadow frustum on weaker devices to keep resolution up
    const shadowRange = gpuTier === 'high' ? 100 : 70;
    this.moonLight.shadow.camera.left = -shadowRange;
    this.moonLight.shadow.camera.right = shadowRange;
    this.moonLight.shadow.camera.top = shadowRange;
    this.moonLight.shadow.camera.bottom = -shadowRange;

    // Softer shadows for night time
    this.moonLight.shadow.radius = gpuTier === 'high' ? 4 : 2;
    this.moonLight.shadow.blurSamples = gpuTier === 'high' ? 25 : 10;

    // The directional light's target drives shadow-camera orientation.
    // Three.js only renders the target into the scene graph when it is
    // added explicitly; without this, shadow updates against the target
    // position are silently ignored.
    this.moonLight.target.position.set(0, 0, 0);
    this.scene.add(this.moonLight.target);
    this.scene.add(this.moonLight);
    // NOTE: moonLight is intentionally NOT freezeTransform'd. AtmosphereSystem
    // drives its position + color + shadow-follow origin each frame.

    // Hemisphere light for atmosphere
    // Sky: filtered light from above
    // Ground: dark ground bounce light
    this.hemisphereLight = new THREE.HemisphereLight(
      0x87ceeb, // Sky blue — overwritten per-frame from AtmosphereSystem zenith
      0x4a6b3a, // Green ground bounce — overwritten per-frame from AtmosphereSystem horizon
      0.8
    );
    this.scene.add(this.hemisphereLight);
    // NOTE: hemisphereLight is intentionally NOT freezeTransform'd so its
    // color + groundColor can be updated from the atmosphere model per frame.

    Logger.info('Renderer', 'Atmosphere initialized');
  }

  private setupPostProcessing(): void {
    this.postProcessing = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.camera
    );
  }

  /**
   * Adjust camera, fog, and shadow parameters for a given world size and elevation range.
   * Called during game mode initialization for modes that need non-default values.
   */
  configureForWorldSize(options: {
    cameraFar?: number;
    fogDensity?: number;
    shadowFar?: number;
  }): void {
    if (options.cameraFar !== undefined) {
      this.camera.far = options.cameraFar;
      this.camera.updateProjectionMatrix();
    }
    if (options.fogDensity !== undefined && this.fog) {
      this.fog.density = options.fogDensity;
    }
    if (options.shadowFar !== undefined && this.moonLight) {
      this.moonLight.shadow.camera.far = options.shadowFar;
      this.moonLight.shadow.camera.updateProjectionMatrix();
    }
  }

  /** Camera currently driving the main scene render (override if set). */
  getActiveCamera(): THREE.PerspectiveCamera {
    return this.overrideCamera ?? this.camera;
  }

  /** Install/clear a debug camera override. Pass `null` to restore. */
  setOverrideCamera(cam: THREE.PerspectiveCamera | null): void {
    this.overrideCamera = cam;
    if (cam) {
      const info = ViewportManager.getInstance().info;
      const aspect = Math.max(1, info.width) / Math.max(1, info.height);
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }

  showRenderer(): void {
    this.renderer.domElement.style.display = 'block';
  }

  hideRenderer(): void {
    this.renderer.domElement.style.display = 'none';
  }

  onWindowResize(): void {
    this.applyViewport(ViewportManager.getInstance().info);
  }

  showCrosshair(): void {
    if (!this.crosshairSystem.mounted) {
      this.crosshairSystem.mount(document.body);
    }
    this.crosshairSystem.showCrosshair();
  }

  hideCrosshair(): void {
    this.crosshairSystem.hideCrosshair();
  }

  showCrosshairAgain(): void {
    this.crosshairSystem.showCrosshairAgain();
  }

  setCrosshairMode(mode: CrosshairMode): void {
    this.crosshairSystem.setMode(mode);
  }

  setCrosshairSpread(radius: number): void {
    this.crosshairSystem.setSpread(radius);
  }

  showSpawnLoadingIndicator(): void {
    this.loadingUI.showSpawnLoadingIndicator();
  }

  setSpawnLoadingStatus(status: string, detail?: string): void {
    this.loadingUI.setSpawnLoadingStatus(status, detail);
  }

  hideSpawnLoadingIndicator(): void {
    this.loadingUI.hideSpawnLoadingIndicator();
  }

  beginFrameStats(): void {
    this.renderer.info.reset();
  }

  getPerformanceStats(): {
    fps: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  } {
    const memory = this.renderer.info.memory as { geometries: number; textures: number; programs?: number };
    const render = this.renderer.info.render;
    return {
      fps: 0, // Will be calculated externally with clock
      drawCalls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      programs: memory.programs ?? 0
    };
  }

  /**
   * Pre-compile all shaders in the scene to prevent first-use frame drops.
   * Call this after all systems are initialized but before gameplay starts.
   */
  precompileShaders(): void {
    Logger.info('Renderer', 'Pre-compiling shaders...');
    const startTime = performance.now();

    const rendererAny = this.renderer as THREE.WebGLRenderer & {
      compileAsync?: (scene: THREE.Object3D, camera: THREE.Camera) => Promise<unknown>;
    };
    const supportsParallelCompile = this.renderer.extensions.has('KHR_parallel_shader_compile');

    if (!supportsParallelCompile) {
      Logger.warn('Renderer', 'KHR_parallel_shader_compile unavailable; skipping async shader pre-compilation');
      return;
    }

    // Prefer async compile path to reduce main-thread stalls on startup.
    if (typeof rendererAny.compileAsync === 'function') {
      try {
        void rendererAny.compileAsync(this.scene, this.camera)
          .then(() => {
            this.renderer.render(this.scene, this.camera);
            const elapsed = performance.now() - startTime;
            Logger.info('Renderer', `Shader pre-compilation complete async (${elapsed.toFixed(1)}ms)`);
          })
          .catch((error) => {
            // Avoid sync fallback in runtime; it can cause multi-second stalls on some drivers/headless runs.
            Logger.warn('Renderer', `Async shader pre-compilation failed; skipping fallback compile: ${error}`);
            const elapsed = performance.now() - startTime;
            Logger.info('Renderer', `Shader pre-compilation skipped fallback (${elapsed.toFixed(1)}ms)`);
          });
      } catch (error) {
        Logger.warn('Renderer', `Async shader pre-compilation threw synchronously; skipping fallback compile: ${error}`);
        const elapsed = performance.now() - startTime;
        Logger.info('Renderer', `Shader pre-compilation skipped fallback (${elapsed.toFixed(1)}ms)`);
      }
      return;
    }

    // No sync fallback: better to pay small first-use shader costs than stall startup hard.
    Logger.warn('Renderer', 'compileAsync unavailable; skipping synchronous shader pre-compilation');
  }

  dispose(): void {
    this.viewportUnsubscribe?.();

    // Clean up UI modules
    this.loadingUI.dispose();
    this.crosshairSystem.dispose();

    // Clean up Three.js resources
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      document.body.removeChild(this.renderer.domElement);
    }
  }

  private applyViewport(info: ViewportInfo): void {
    const width = Math.max(1, info.width);
    const height = Math.max(1, info.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.overrideCamera) {
      this.overrideCamera.aspect = width / height;
      this.overrideCamera.updateProjectionMatrix();
    }
    this.renderer.setSize(width, height);
    if (this.postProcessing) {
      this.postProcessing.setSize(width, height);
    }
  }
}
