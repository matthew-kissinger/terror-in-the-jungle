import * as THREE from 'three';
import { PixelPerfectUtils } from '../utils/PixelPerfect';
import { PostProcessingManager } from '../systems/effects/PostProcessingManager';

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

  private spawnLoadingDiv?: HTMLDivElement;
  private crosshair?: HTMLDivElement;

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
    // Configure for pixel-perfect rendering
    PixelPerfectUtils.configureRenderer(this.renderer);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    document.body.appendChild(this.renderer.domElement);

    // Hide renderer initially
    this.renderer.domElement.style.display = 'none';
  }

  private setupLighting(): void {
    // === JUNGLE NIGHT TERROR ATMOSPHERE ===

    // Set dark fog for limited visibility (jungle at night)
    // Use dark blue-green tint for night jungle atmosphere
    const fogColor = 0x0a1012; // Very dark blue-green
    const fogNear = 15; // Fog starts at 15 units
    const fogFar = 120; // Complete fog at 120 units

    // Use exponential fog for more realistic density - reduced for better visibility
    this.fog = new THREE.FogExp2(fogColor, 0.008); // Reduced from 0.018 for ~2x visibility
    this.scene.fog = this.fog;

    // Match background to fog for seamless blending
    this.scene.background = new THREE.Color(fogColor);

    // Very dim ambient light - moonlight through jungle canopy
    this.ambientLight = new THREE.AmbientLight(0x1a2f3a, 0.15); // Dark blue ambient
    this.scene.add(this.ambientLight);

    // Moonlight - primary light source
    this.moonLight = new THREE.DirectionalLight(0x4a6b8a, 0.3); // Pale blue moonlight
    this.moonLight.position.set(-30, 80, -50);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.width = 2048;
    this.moonLight.shadow.mapSize.height = 2048;
    this.moonLight.shadow.camera.near = 0.5;
    this.moonLight.shadow.camera.far = 300;
    this.moonLight.shadow.camera.left = -100;
    this.moonLight.shadow.camera.right = 100;
    this.moonLight.shadow.camera.top = 100;
    this.moonLight.shadow.camera.bottom = -100;

    // Softer shadows for night time
    this.moonLight.shadow.radius = 4;
    this.moonLight.shadow.blurSamples = 25;

    this.scene.add(this.moonLight);

    // Add a subtle green tint light for jungle atmosphere
    this.jungleLight = new THREE.HemisphereLight(
      0x0a1f1a, // Dark green sky color
      0x050a08, // Very dark ground color
      0.2
    );
    this.scene.add(this.jungleLight);

    console.log('🌙 Night jungle atmosphere initialized');
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
    if (this.crosshair) return;

    // Create container for complex crosshair
    this.crosshair = document.createElement('div');
    this.crosshair.style.position = 'fixed';
    this.crosshair.style.left = '50%';
    this.crosshair.style.top = '50%';
    this.crosshair.style.transform = 'translate(-50%, -50%)';
    this.crosshair.style.pointerEvents = 'none';
    this.crosshair.style.zIndex = '10';

    // Create tactical crosshair with CSS
    this.crosshair.innerHTML = `
      <style>
        .tactical-crosshair {
          position: relative;
          width: 60px;
          height: 60px;
        }

        /* Center dot */
        .crosshair-dot {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 2px;
          height: 2px;
          background: #00ff44;
          box-shadow: 0 0 3px #00ff44, 0 0 6px rgba(0,255,68,0.5);
          border-radius: 50%;
          z-index: 2;
        }

        /* Crosshair lines */
        .crosshair-line {
          position: absolute;
          background: #00ff44;
          opacity: 0.9;
        }

        .crosshair-line.top {
          width: 2px;
          height: 12px;
          left: 50%;
          top: 8px;
          transform: translateX(-50%);
          box-shadow: 0 0 2px #00ff44;
        }

        .crosshair-line.bottom {
          width: 2px;
          height: 12px;
          left: 50%;
          bottom: 8px;
          transform: translateX(-50%);
          box-shadow: 0 0 2px #00ff44;
        }

        .crosshair-line.left {
          width: 12px;
          height: 2px;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          box-shadow: 0 0 2px #00ff44;
        }

        .crosshair-line.right {
          width: 12px;
          height: 2px;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          box-shadow: 0 0 2px #00ff44;
        }

        /* Corner brackets for tactical feel */
        .crosshair-bracket {
          position: absolute;
          border: 1px solid #00ff44;
          opacity: 0.5;
        }

        .crosshair-bracket.tl {
          top: 18px;
          left: 18px;
          width: 8px;
          height: 8px;
          border-right: none;
          border-bottom: none;
        }

        .crosshair-bracket.tr {
          top: 18px;
          right: 18px;
          width: 8px;
          height: 8px;
          border-left: none;
          border-bottom: none;
        }

        .crosshair-bracket.bl {
          bottom: 18px;
          left: 18px;
          width: 8px;
          height: 8px;
          border-right: none;
          border-top: none;
        }

        .crosshair-bracket.br {
          bottom: 18px;
          right: 18px;
          width: 8px;
          height: 8px;
          border-left: none;
          border-top: none;
        }

        /* Dynamic spread indicator (for future use) */
        .spread-indicator {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 30px;
          height: 30px;
          border: 1px solid rgba(0,255,68,0.3);
          border-radius: 50%;
          transition: all 0.1s ease;
          pointer-events: none;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.5; }
        }

        .crosshair-line {
          animation: pulse 3s infinite;
        }
      </style>
      <div class="tactical-crosshair">
        <div class="crosshair-dot"></div>
        <div class="crosshair-line top"></div>
        <div class="crosshair-line bottom"></div>
        <div class="crosshair-line left"></div>
        <div class="crosshair-line right"></div>
        <div class="crosshair-bracket tl"></div>
        <div class="crosshair-bracket tr"></div>
        <div class="crosshair-bracket bl"></div>
        <div class="crosshair-bracket br"></div>
        <div class="spread-indicator"></div>
      </div>
    `;

    document.body.appendChild(this.crosshair);
  }

  hideCrosshair(): void {
    if (this.crosshair) {
      this.crosshair.style.display = 'none';
    }
  }

  showCrosshairAgain(): void {
    if (this.crosshair) {
      this.crosshair.style.display = 'block';
    }
  }

  showSpawnLoadingIndicator(): void {
    this.spawnLoadingDiv = document.createElement('div');
    this.spawnLoadingDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 10003;
      transition: opacity 0.5s ease-out;
    `;

    this.spawnLoadingDiv.innerHTML = `
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .loading-ring {
          width: 60px;
          height: 60px;
          border: 3px solid rgba(74, 124, 78, 0.2);
          border-top: 3px solid #4a7c4e;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .loading-text {
          color: #8fbc8f;
          font-family: 'Courier New', monospace;
          font-size: 18px;
          margin-top: 20px;
          animation: pulse 2s ease-in-out infinite;
        }
        .loading-tip {
          color: #708070;
          font-family: 'Courier New', monospace;
          font-size: 14px;
          margin-top: 10px;
          max-width: 400px;
          text-align: center;
        }
      </style>
      <div class="loading-ring"></div>
      <div class="loading-text">DEPLOYING TO BATTLEFIELD</div>
      <div class="loading-tip">Generating terrain and preparing combat zone...</div>
    `;

    document.body.appendChild(this.spawnLoadingDiv);
  }

  hideSpawnLoadingIndicator(): void {
    if (this.spawnLoadingDiv) {
      this.spawnLoadingDiv.style.opacity = '0';
      setTimeout(() => {
        if (this.spawnLoadingDiv && this.spawnLoadingDiv.parentElement) {
          this.spawnLoadingDiv.parentElement.removeChild(this.spawnLoadingDiv);
          this.spawnLoadingDiv = undefined;
        }
      }, 500);
    }
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

  dispose(): void {
    // Clean up spawn loading indicator
    if (this.spawnLoadingDiv && this.spawnLoadingDiv.parentElement) {
      this.spawnLoadingDiv.parentElement.removeChild(this.spawnLoadingDiv);
    }

    // Clean up crosshair
    if (this.crosshair && this.crosshair.parentElement) {
      this.crosshair.parentElement.removeChild(this.crosshair);
    }

    // Clean up Three.js resources
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      document.body.removeChild(this.renderer.domElement);
    }
  }
}
