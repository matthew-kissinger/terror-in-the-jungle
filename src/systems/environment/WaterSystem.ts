import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { GameSystem } from '../../types';
import { AssetLoader } from '../assets/AssetLoader';
import { getAssetPath } from '../../config/paths';
import { WeatherSystem } from './WeatherSystem';

interface WaterUniforms {
  time?: { value: number };
  sunDirection?: { value: THREE.Vector3 };
  waterColor?: { value: THREE.Color };
  distortionScale?: { value: number };
  [key: string]: { value: any } | undefined;
}

export class WaterSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private water?: Water;
  private assetLoader: AssetLoader;
  private weatherSystem?: WeatherSystem;
  
  // Water configuration
  private readonly WATER_LEVEL = 0; // Sea level height
  private readonly BASE_WATER_SIZE = 2000; // Base geometry size before scaling
  private readonly WATER_SEGMENTS = 100; // Geometry segments for waves
  private worldWaterSize = 2000;
  
  // State
  private sun: THREE.Vector3;
  private wasUnderwater: boolean = false;
  private overlay?: HTMLDivElement;
  
  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.sun = new THREE.Vector3();
  }

  setWeatherSystem(weatherSystem: WeatherSystem): void {
    this.weatherSystem = weatherSystem;
  }

  async init(): Promise<void> {
    Logger.info('environment', 'Initializing Water System...');
    
    // Create water geometry - large plane
    const waterGeometry = new THREE.PlaneGeometry(
      this.BASE_WATER_SIZE,
      this.BASE_WATER_SIZE,
      this.WATER_SEGMENTS,
      this.WATER_SEGMENTS
    );

    // Load water normal texture
    let waterNormals = this.assetLoader.getTexture('waternormals');
    if (!waterNormals) {
      // Fallback: try to load it directly
      Logger.info('environment', 'Loading water normal texture directly...');
      waterNormals = await new THREE.TextureLoader().loadAsync(getAssetPath('waternormals.jpg'));
    }
    
    // Configure texture wrapping for seamless tiling
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

    // Create water with shader
    this.water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: waterNormals,
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f, // Deep blue-green
      distortionScale: 3.7,
      fog: this.scene.fog !== undefined,
      alpha: 0.9, // Slight transparency
    });

    // Rotate to be horizontal (Water defaults to vertical)
    this.water.rotation.x = -Math.PI / 2;
    
    // Position at water level
    this.water.position.y = this.WATER_LEVEL;
    this.updateWaterScale();
    
    // Add to scene
    this.scene.add(this.water);
    
    // Set initial sun position (matches directional light)
    this.updateSunPosition(50, 100, 30);
    
    // Create underwater overlay
    this.createUnderwaterOverlay();
    
    Logger.info('environment', `Water System initialized at Y=${this.WATER_LEVEL}`);
  }

  private createUnderwaterOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.overlay.style.width = '100%';
    this.overlay.style.height = '100%';
    this.overlay.style.backgroundColor = '#004455';
    this.overlay.style.opacity = '0';
    this.overlay.style.pointerEvents = 'none';
    this.overlay.style.transition = 'opacity 0.5s ease-out';
    this.overlay.style.zIndex = '900'; // Below UI but above game
    this.overlay.style.display = 'none'; // Hidden initially
    
    // Add some blur/distortion effect
    this.overlay.style.backdropFilter = 'blur(4px)';
    
    document.body.appendChild(this.overlay);
  }

  update(deltaTime: number): void {
    if (!this.water) return;
    
    // Update water time for wave animation
    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as WaterUniforms;
    if (waterUniforms && waterUniforms.time) {
      waterUniforms.time.value += deltaTime * 0.5; // Slower wave speed
    }

    // Keep ocean centered under camera so map-edge seams are not visible in large worlds.
    this.water.position.x = this.camera.position.x;
    this.water.position.z = this.camera.position.z;

    // Check underwater state
    this.checkUnderwaterState();
  }

  private checkUnderwaterState(): void {
    const isUnderwater = this.camera.position.y < this.WATER_LEVEL;

    if (isUnderwater !== this.wasUnderwater) {
      this.wasUnderwater = isUnderwater;
      
      // Update weather system (handles fog and light)
      if (this.weatherSystem) {
        this.weatherSystem.setUnderwater(isUnderwater);
      }
      
      // Update overlay
      if (this.overlay) {
        if (isUnderwater) {
          this.overlay.style.display = 'block';
          // Force reflow
          void this.overlay.offsetWidth;
          this.overlay.style.opacity = '0.4';
        } else {
          this.overlay.style.opacity = '0';
          // Hide after transition
          setTimeout(() => {
            if (this.overlay && !this.wasUnderwater) {
              this.overlay.style.display = 'none';
            }
          }, 500);
        }
      }
    }
  }

  dispose(): void {
    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
      (this.water.material as THREE.Material).dispose();
    }
    
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    
    Logger.info('environment', 'Water System disposed');
  }

  /**
   * Update sun direction for water reflections
   */
  updateSunPosition(x: number, y: number, z: number): void {
    this.sun.set(x, y, z);
    this.sun.normalize();
    
    if (this.water) {
      const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as WaterUniforms;
      if (waterUniforms && waterUniforms.sunDirection) {
        waterUniforms.sunDirection.value.copy(this.sun);
      }
    }
  }
  
  /**
   * Get the water level for other systems to check
   */
  getWaterLevel(): number {
    return this.WATER_LEVEL;
  }
  
  /**
   * Check if a position is underwater
   */
  isUnderwater(position: THREE.Vector3): boolean {
    return position.y < this.WATER_LEVEL;
  }
  
  /**
   * Set water color
   */
  setWaterColor(color: number): void {
    if (this.water) {
      const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as WaterUniforms;
      if (waterUniforms && waterUniforms.waterColor) {
        waterUniforms.waterColor.value = new THREE.Color(color);
      }
    }
  }
  
  /**
   * Set distortion scale (wave intensity)
   */
  setDistortionScale(scale: number): void {
    if (this.water) {
      const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as WaterUniforms;
      if (waterUniforms && waterUniforms.distortionScale) {
        waterUniforms.distortionScale.value = scale;
      }
    }
  }

  /**
   * Show or hide the water plane. Modes with no lakes/ocean (e.g. A Shau Valley)
   * disable the global water to avoid a flat plane slicing through terrain.
   */
  setEnabled(enabled: boolean): void {
    if (this.water) {
      this.water.visible = enabled;
    }
    if (this.overlay) {
      if (!enabled) {
        this.overlay.style.display = 'none';
        this.overlay.style.opacity = '0';
      }
    }
  }

  /**
   * Match water coverage to current game mode world size.
   * Adds margin to absorb fast traversal and distant chunk transitions.
   */
  setWorldSize(worldSize: number): void {
    const safeWorld = Number.isFinite(worldSize) && worldSize > 0 ? worldSize : this.BASE_WATER_SIZE;
    const target = Math.max(this.BASE_WATER_SIZE, safeWorld * 1.8);
    if (Math.abs(target - this.worldWaterSize) < 1) return;
    this.worldWaterSize = target;
    this.updateWaterScale();
    Logger.info('environment', `Water coverage resized for world: ${this.worldWaterSize.toFixed(0)}m`);
  }

  private updateWaterScale(): void {
    if (!this.water) return;
    const scale = this.worldWaterSize / this.BASE_WATER_SIZE;
    this.water.scale.set(scale, 1, scale);
  }
}
