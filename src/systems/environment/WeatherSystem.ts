import * as THREE from 'three';
import { GameSystem } from '../../types';
import { IChunkManager, IAudioManager, ISandboxRenderer } from '../../types/SystemInterfaces';
import { WeatherState, WeatherConfig } from '../../config/gameModes';

export class WeatherSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private chunkManager: IChunkManager;
  private audioManager?: IAudioManager;
  private sandboxRenderer?: ISandboxRenderer;

  // Configuration
  private config?: WeatherConfig;
  private currentState: WeatherState = WeatherState.CLEAR;
  private targetState: WeatherState = WeatherState.CLEAR;
  
  // Transition
  private transitionProgress: number = 1.0;
  private transitionDuration: number = 10.0; // Seconds
  private transitionTimer: number = 0;
  private cycleTimer: number = 0;

  // Rain Rendering
  private rainMesh?: THREE.InstancedMesh;
  private rainCount: number = 8000;
  private rainDummy: THREE.Object3D = new THREE.Object3D();
  private rainVelocities: Float32Array;

  // Lightning
  private lightningTimer: number = 0;
  private isFlashing: boolean = false;
  private flashDuration: number = 0.15;
  private flashTimer: number = 0;
  private thunderDelay: number = 0;
  
  // Underwater state
  private isUnderwater: boolean = false;
  
  // Base atmosphere values (cached from renderer)
  private baseFogDensity: number = 0.008;
  private baseAmbientIntensity: number = 0.15;
  private baseMoonIntensity: number = 0.3;
  private baseJungleIntensity: number = 0.2;

  constructor(scene: THREE.Scene, camera: THREE.Camera, chunkManager: IChunkManager) {
    this.scene = scene;
    this.camera = camera;
    this.chunkManager = chunkManager;
    this.rainVelocities = new Float32Array(this.rainCount);
  }

  setAudioManager(audioManager: IAudioManager): void {
    this.audioManager = audioManager;
  }

  setSandboxRenderer(renderer: ISandboxRenderer): void {
    this.sandboxRenderer = renderer;
    // Cache initial values
    if (renderer.fog) this.baseFogDensity = renderer.fog.density;
    if (renderer.ambientLight) this.baseAmbientIntensity = renderer.ambientLight.intensity;
    if (renderer.moonLight) this.baseMoonIntensity = renderer.moonLight.intensity;
    if (renderer.jungleLight) this.baseJungleIntensity = renderer.jungleLight.intensity;
  }

  setWeatherConfig(config?: WeatherConfig): void {
    this.config = config;
    if (config) {
      this.setWeatherState(config.initialState, true);
      this.cycleTimer = this.getRandomCycleDuration();
    }
  }

  setUnderwater(isUnderwater: boolean): void {
    if (this.isUnderwater !== isUnderwater) {
      this.isUnderwater = isUnderwater;
      // Force immediate update to prevent lag in visual transition
      this.updateAtmosphere();
    }
  }

  async init(): Promise<void> {
    this.createRainParticles();
  }

  private createRainParticles(): void {
    const geometry = new THREE.PlaneGeometry(0.05, 1.0);
    const material = new THREE.MeshBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.rainMesh = new THREE.InstancedMesh(geometry, material, this.rainCount);
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);

    // Initialize positions randomly around origin
    for (let i = 0; i < this.rainCount; i++) {
      this.resetRainDrop(i, true);
    }
  }

  private resetRainDrop(index: number, randomY: boolean = false): void {
    if (!this.rainMesh) return;

    const range = 40; // Rain radius around camera
    const x = (Math.random() - 0.5) * range * 2;
    const z = (Math.random() - 0.5) * range * 2;
    // Keep Y relative to camera later
    const y = randomY ? (Math.random() * 30) : 30;

    this.rainDummy.position.set(x, y, z);
    this.rainDummy.updateMatrix();
    this.rainMesh.setMatrixAt(index, this.rainDummy.matrix);
    
    // Random fall speed
    this.rainVelocities[index] = 15 + Math.random() * 10;
  }

  update(deltaTime: number): void {
    if (!this.config?.enabled) return;

    this.updateCycle(deltaTime);
    this.updateTransition(deltaTime);
    this.updateRain(deltaTime);
    this.updateLightning(deltaTime);
    this.updateAtmosphere();
  }

  private updateCycle(deltaTime: number): void {
    this.cycleTimer -= deltaTime;
    if (this.cycleTimer <= 0) {
      this.triggerRandomWeatherChange();
      this.cycleTimer = this.getRandomCycleDuration();
    }
  }

  private triggerRandomWeatherChange(): void {
    if (!this.config) return;

    const roll = Math.random();
    // Simple transition logic based on current state
    let nextState = this.currentState;

    if (this.currentState === WeatherState.CLEAR) {
      if (roll < this.config.transitionChance) nextState = WeatherState.LIGHT_RAIN;
    } else if (this.currentState === WeatherState.LIGHT_RAIN) {
      if (roll < 0.4) nextState = WeatherState.HEAVY_RAIN;
      else if (roll > 0.8) nextState = WeatherState.CLEAR;
    } else if (this.currentState === WeatherState.HEAVY_RAIN) {
      if (roll < 0.3) nextState = WeatherState.STORM;
      else if (roll > 0.7) nextState = WeatherState.LIGHT_RAIN;
    } else if (this.currentState === WeatherState.STORM) {
      // Storms always subside
      nextState = WeatherState.HEAVY_RAIN;
    }

    if (nextState !== this.currentState) {
      this.setWeatherState(nextState);
    }
  }

  private getRandomCycleDuration(): number {
    if (!this.config) return 300;
    const min = this.config.cycleDuration.min * 60;
    const max = this.config.cycleDuration.max * 60;
    return min + Math.random() * (max - min);
  }

  setWeatherState(state: WeatherState, instant: boolean = false): void {
    console.log(`Weather changing: ${this.currentState} -> ${state}`);
    this.targetState = state;
    if (instant) {
      this.currentState = state;
      this.transitionProgress = 1.0;
      this.applyAtmosphere(state, 1.0);
    } else {
      this.transitionProgress = 0.0;
      // Start transition
    }
  }

  private updateTransition(deltaTime: number): void {
    if (this.transitionProgress < 1.0) {
      this.transitionProgress += deltaTime / this.transitionDuration;
      if (this.transitionProgress >= 1.0) {
        this.transitionProgress = 1.0;
        this.currentState = this.targetState;
      }
    }
  }

  private updateRain(deltaTime: number): void {
    if (!this.rainMesh) return;

    // Determine rain intensity based on blended state
    const intensity = this.getBlendedRainIntensity();
    
    if (intensity <= 0.01) {
      this.rainMesh.visible = false;
      return;
    }

    this.rainMesh.visible = true;
    (this.rainMesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * intensity;

    const cameraPos = this.camera.position;
    
    // Optimization: Only update a subset if performant, but instanced mesh is fast
    // We update all for smooth wrapping
    for (let i = 0; i < this.rainCount; i++) {
      this.rainMesh.getMatrixAt(i, this.rainDummy.matrix);
      this.rainDummy.matrix.decompose(this.rainDummy.position, this.rainDummy.quaternion, this.rainDummy.scale);

      // Move down
      this.rainDummy.position.y -= this.rainVelocities[i] * deltaTime;

      // Wrap around camera
      const dx = this.rainDummy.position.x - cameraPos.x;
      const dz = this.rainDummy.position.z - cameraPos.z;
      
      // Simple toroidal wrapping logic relative to camera
      if (this.rainDummy.position.y < cameraPos.y - 10) {
        this.rainDummy.position.y = cameraPos.y + 20;
        // Randomize X/Z again slightly to break patterns
        this.rainDummy.position.x = cameraPos.x + (Math.random() - 0.5) * 40;
        this.rainDummy.position.z = cameraPos.z + (Math.random() - 0.5) * 40;
      } else {
        // Keep x/z relative to camera if it moved too far
        if (Math.abs(dx) > 20) this.rainDummy.position.x = cameraPos.x - Math.sign(dx) * 19;
        if (Math.abs(dz) > 20) this.rainDummy.position.z = cameraPos.z - Math.sign(dz) * 19;
      }

      // Check collision with terrain
      // const terrainHeight = this.chunkManager.getTerrainHeightAt(this.rainDummy.position.x, this.rainDummy.position.z);
      // if (this.rainDummy.position.y < terrainHeight) {
         // Could spawn splash effect here
      //   this.rainDummy.position.y = cameraPos.y + 20;
      // }

      // Wind effect
      const windX = (this.currentState === WeatherState.STORM ? 5 : 2) * deltaTime;
      this.rainDummy.position.x += windX;

      // Face camera (billboard-ish)
      // Actually for lines, just vertical is fine, maybe slight tilt
      // this.rainDummy.rotation.z = -0.1; 

      this.rainDummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, this.rainDummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
  }

  private updateLightning(deltaTime: number): void {
    if (this.isFlashing) {
      this.flashTimer -= deltaTime;
      if (this.flashTimer <= 0) {
        this.isFlashing = false;
        // Restore lights
        this.updateAtmosphere(); // Will reset to current weather state
      }
    } else {
      // Check for thunder audio trigger
      if (this.thunderDelay > 0) {
        this.thunderDelay -= deltaTime;
        if (this.thunderDelay <= 0) {
           this.playThunderSound();
        }
      }

      // Only storm generates lightning
      if (this.currentState === WeatherState.STORM || this.targetState === WeatherState.STORM) {
        const stormIntensity = this.transitionProgress; // Simplified
        if (Math.random() < 0.005 * stormIntensity) { // Chance per frame
           this.triggerLightning();
        }
      }
    }
  }

  private triggerLightning(): void {
    this.isFlashing = true;
    this.flashTimer = this.flashDuration;
    
    // Flash visual
    if (this.sandboxRenderer && this.sandboxRenderer.moonLight && this.sandboxRenderer.ambientLight) {
       this.sandboxRenderer.moonLight.intensity = 2.0;
       this.sandboxRenderer.ambientLight.intensity = 1.0;
       if (this.sandboxRenderer.fog) {
         // Brighten fog momentarily
         const originalColor = this.sandboxRenderer.fog.color.getHex();
         this.sandboxRenderer.fog.color.setHex(0x4a6b8a); // Blue-white flash
         // Timeout to reset color is handled by updateAtmosphere being called every frame
       }
    }

    // Schedule thunder
    const distance = 500 + Math.random() * 1000; // Simulated distance
    this.thunderDelay = distance / 343; // Speed of sound roughly
  }

  private playThunderSound(): void {
    if (this.audioManager) {
      // Play thunder sound - assuming 'thunder' asset exists or fallback
      // Since we don't know if asset exists, we might need to check or add it
      // For now, logging
      // console.log('⚡ Thunderclap!');
      // this.audioManager.play('thunder'); 
    }
  }

  private updateAtmosphere(): void {
    if (!this.sandboxRenderer) return;

    if (this.isUnderwater) {
      // Apply underwater atmosphere immediately
      if (this.sandboxRenderer.fog) {
        this.sandboxRenderer.fog.density = 0.04; // Very dense fog
        this.sandboxRenderer.fog.color.setHex(0x003344); // Deep blue-green
      }
      if (this.sandboxRenderer.ambientLight) {
        this.sandboxRenderer.ambientLight.intensity = 0.5;
        this.sandboxRenderer.ambientLight.color.setHex(0x004455);
      }
      if (this.sandboxRenderer.moonLight) {
        this.sandboxRenderer.moonLight.intensity = 0.0; // No direct moonlight
      }
      if (this.sandboxRenderer.jungleLight) {
        this.sandboxRenderer.jungleLight.intensity = 0.1;
      }
      return; // Skip normal weather atmosphere
    }

    // Blend between current and target state
    const currentParams = this.getWeatherParams(this.currentState);
    const targetParams = this.getWeatherParams(this.targetState);
    const t = this.transitionProgress;

    // Lerp values
    const fogDensity = currentParams.fogDensity * (1 - t) + targetParams.fogDensity * t;
    const ambientInt = currentParams.ambientIntensity * (1 - t) + targetParams.ambientIntensity * t;
    const moonInt = currentParams.moonIntensity * (1 - t) + targetParams.moonIntensity * t;
    const jungleInt = currentParams.jungleIntensity * (1 - t) + targetParams.jungleIntensity * t;

    // Apply (override if lightning)
    if (!this.isFlashing) {
      if (this.sandboxRenderer.fog) {
        this.sandboxRenderer.fog.density = fogDensity;
        // Restore standard fog color
        this.sandboxRenderer.fog.color.setHex(0x0a1012);
      }
      if (this.sandboxRenderer.ambientLight) {
        this.sandboxRenderer.ambientLight.intensity = ambientInt;
        this.sandboxRenderer.ambientLight.color.setHex(0x1a2f3a); // Restore default ambient color
      }
      if (this.sandboxRenderer.moonLight) this.sandboxRenderer.moonLight.intensity = moonInt;
      if (this.sandboxRenderer.jungleLight) this.sandboxRenderer.jungleLight.intensity = jungleInt;
      
      // Reset fog color if it was flashed
      // if (this.sandboxRenderer.fog) this.sandboxRenderer.fog.color.setHex(0x0a1012); // Done above
    }
  }

  private getWeatherParams(state: WeatherState) {
    switch (state) {
      case WeatherState.CLEAR:
        return {
          fogDensity: this.baseFogDensity,
          ambientIntensity: this.baseAmbientIntensity,
          moonIntensity: this.baseMoonIntensity,
          jungleIntensity: this.baseJungleIntensity
        };
      case WeatherState.LIGHT_RAIN:
        return {
          fogDensity: this.baseFogDensity * 1.5,
          ambientIntensity: this.baseAmbientIntensity * 0.8,
          moonIntensity: this.baseMoonIntensity * 0.7,
          jungleIntensity: this.baseJungleIntensity * 0.8
        };
      case WeatherState.HEAVY_RAIN:
        return {
          fogDensity: this.baseFogDensity * 2.5,
          ambientIntensity: this.baseAmbientIntensity * 0.6,
          moonIntensity: this.baseMoonIntensity * 0.5,
          jungleIntensity: this.baseJungleIntensity * 0.6
        };
      case WeatherState.STORM:
        return {
          fogDensity: this.baseFogDensity * 3.5,
          ambientIntensity: this.baseAmbientIntensity * 0.4,
          moonIntensity: this.baseMoonIntensity * 0.3,
          jungleIntensity: this.baseJungleIntensity * 0.4
        };
      default:
        return {
          fogDensity: this.baseFogDensity,
          ambientIntensity: this.baseAmbientIntensity,
          moonIntensity: this.baseMoonIntensity,
          jungleIntensity: this.baseJungleIntensity
        };
    }
  }

  private getBlendedRainIntensity(): number {
    const current = this.getRainIntensity(this.currentState);
    const target = this.getRainIntensity(this.targetState);
    return current * (1 - this.transitionProgress) + target * this.transitionProgress;
  }

  private getRainIntensity(state: WeatherState): number {
    switch (state) {
      case WeatherState.CLEAR: return 0.0;
      case WeatherState.LIGHT_RAIN: return 0.3;
      case WeatherState.HEAVY_RAIN: return 0.8;
      case WeatherState.STORM: return 1.0;
      default: return 0.0;
    }
  }

  // Used by instant apply
  private applyAtmosphere(state: WeatherState, progress: number): void {
      // Just force update
      this.updateAtmosphere();
  }

  dispose(): void {
    if (this.rainMesh) {
      this.scene.remove(this.rainMesh);
      this.rainMesh.geometry.dispose();
      (this.rainMesh.material as THREE.Material).dispose();
    }
  }
}
