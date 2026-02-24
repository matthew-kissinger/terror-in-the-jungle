import * as THREE from 'three';
import { PixelPerfectUtils } from '../utils/PixelPerfect';
import { PostProcessingManager } from '../systems/effects/PostProcessingManager';
import { CrosshairUI } from './CrosshairUI';
import { LoadingUI } from './LoadingUI';
import { Logger } from '../utils/Logger';
import { estimateGPUTier, isMobileGPU, shouldEnableShadows, getShadowMapSize, getMaxPixelRatio } from '../utils/DeviceDetector';
import { ViewportInfo, ViewportManager } from '../ui/design/responsive';

export class GameRenderer {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public postProcessing?: PostProcessingManager;

  // Exposed environment properties for WeatherSystem
  public fog?: THREE.FogExp2;
  public ambientLight?: THREE.AmbientLight;
  public moonLight?: THREE.DirectionalLight;
  public hemisphereLight?: THREE.HemisphereLight;

  private crosshairUI = new CrosshairUI();
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
      powerPreference: 'high-performance'
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
    // Both terrain and vegetation now fade consistently to fog color

    // Background color - matches fog for seamless distance fade
    const fogColor = 0x5a7a6a; // Muted green
    this.scene.background = new THREE.Color(fogColor);

    // Exponential fog - density tuned to hide terrain edge (~400-500m)
    // Lower density = fog starts further away
    this.fog = new THREE.FogExp2(fogColor, 0.004);
    this.scene.fog = this.fog;

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(this.ambientLight);

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

    this.scene.add(this.moonLight);

    // Hemisphere light for atmosphere
    // Sky: filtered light from above
    // Ground: dark ground bounce light
    this.hemisphereLight = new THREE.HemisphereLight(
      0x87ceeb, // Sky blue
      0x4a6b3a, // Green ground bounce
      0.8
    );
    this.scene.add(this.hemisphereLight);

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
    this.crosshairUI.showCrosshair();
  }

  hideCrosshair(): void {
    this.crosshairUI.hideCrosshair();
  }

  showCrosshairAgain(): void {
    this.crosshairUI.showCrosshairAgain();
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

    // Prefer async compile path to reduce main-thread stalls on startup.
    if (typeof rendererAny.compileAsync === 'function') {
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
      return;
    }

    // No sync fallback: better to pay small first-use shader costs than stall startup hard.
    Logger.warn('Renderer', 'compileAsync unavailable; skipping synchronous shader pre-compilation');
  }

  dispose(): void {
    this.viewportUnsubscribe?.();

    // Clean up UI modules
    this.loadingUI.dispose();
    this.crosshairUI.dispose();

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
    this.renderer.setSize(width, height);
    if (this.postProcessing) {
      this.postProcessing.setSize(width, height);
    }
  }
}
