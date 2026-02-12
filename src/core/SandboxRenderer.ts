import * as THREE from 'three';
import { PixelPerfectUtils } from '../utils/PixelPerfect';
import { PostProcessingManager } from '../systems/effects/PostProcessingManager';
import { SandboxCrosshairUI } from './SandboxCrosshairUI';
import { SandboxLoadingUI } from './SandboxLoadingUI';
import { Logger } from '../utils/Logger';
import { estimateGPUTier, isMobileGPU, shouldEnableShadows, getShadowMapSize, getMaxPixelRatio } from '../utils/DeviceDetector';

export class SandboxRenderer {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public postProcessing?: PostProcessingManager;

  // Exposed environment properties for WeatherSystem
  public fog?: THREE.FogExp2;
  public ambientLight?: THREE.AmbientLight;
  public moonLight?: THREE.DirectionalLight;
  public jungleLight?: THREE.HemisphereLight;

  private crosshairUI = new SandboxCrosshairUI();
  private loadingUI = new SandboxLoadingUI();

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

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Device-adaptive shadow settings
    this.renderer.shadowMap.enabled = shouldEnableShadows();
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    document.body.appendChild(this.renderer.domElement);

    // Hide renderer initially
    this.renderer.domElement.style.display = 'none';
  }

  private setupLighting(): void {
    const gpuTier = estimateGPUTier();

    // === JUNGLE ATMOSPHERE ===
    // Fog re-enabled with matching support in GPU billboard shader
    // Both terrain and vegetation now fade consistently to fog color

    // Background color - matches fog for seamless distance fade
    const fogColor = 0x5a7a6a; // Muted jungle green
    this.scene.background = new THREE.Color(fogColor);

    // Exponential fog - density tuned to hide terrain edge (~400-500m)
    // Lower density = fog starts further away
    this.fog = new THREE.FogExp2(fogColor, 0.004);
    this.scene.fog = this.fog;

    // Ambient light - general scene illumination
    // Reduced intensity for moody jungle atmosphere
    this.ambientLight = new THREE.AmbientLight(0x4a5a4a, 0.4); // Muted green, lower intensity
    this.scene.add(this.ambientLight);

    // Directional light - filtered sunlight through canopy
    // Reduced intensity, slightly green-tinted for jungle feel
    this.moonLight = new THREE.DirectionalLight(0xeef8ee, 0.5); // Soft filtered light
    this.moonLight.position.set(-30, 80, -50);
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

    // Hemisphere light for jungle atmosphere
    // Sky: filtered canopy light from above
    // Ground: dark forest floor bounce light
    this.jungleLight = new THREE.HemisphereLight(
      0x667766, // Muted green-gray canopy light
      0x332211, // Dark brown ground bounce
      0.3 // Subtle fill
    );
    this.scene.add(this.jungleLight);

    Logger.info('Renderer', 'Jungle atmosphere initialized');
  }

  private setupPostProcessing(): void {
    this.postProcessing = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.camera
    );
  }

  showRenderer(): void {
    this.renderer.domElement.style.display = 'block';
  }

  hideRenderer(): void {
    this.renderer.domElement.style.display = 'none';
  }

  onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    if (this.postProcessing) {
      this.postProcessing.setSize(window.innerWidth, window.innerHeight);
    }
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

    // Force shader compilation for all materials in the scene
    this.renderer.compile(this.scene, this.camera);

    // Also trigger a render to warm up any lazy-initialized shaders
    this.renderer.render(this.scene, this.camera);

    const elapsed = performance.now() - startTime;
    Logger.info('Renderer', `Shader pre-compilation complete (${elapsed.toFixed(1)}ms)`);
  }

  dispose(): void {
    // Clean up UI modules
    this.loadingUI.dispose();
    this.crosshairUI.dispose();

    // Clean up Three.js resources
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      document.body.removeChild(this.renderer.domElement);
    }
  }
}
