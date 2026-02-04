import * as THREE from 'three';
import { GameSystem } from '../../types';
import { IChunkManager, IAudioManager, ISandboxRenderer } from '../../types/SystemInterfaces';
import { WeatherState, WeatherConfig } from '../../config/gameModes';
import { updateLightning, LightningState } from './WeatherLightning';
import { updateAtmosphere, getBlendedRainIntensity, AtmosphereBaseValues } from './WeatherAtmosphere';

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
  private rainPositions: Float32Array;

  // Lightning
  private lightningState: LightningState = {
    isFlashing: false,
    flashTimer: 0,
    thunderDelay: 0
  };
  
  // Underwater state
  private isUnderwater: boolean = false;
  
  // Base atmosphere values (cached from renderer on init)
  // SALVAGE FIX: Updated defaults to match brighter SandboxRenderer values
  // Note: These are overwritten by actual renderer values in setSandboxRenderer()
  private baseFogDensity: number = 0.005;
  private baseAmbientIntensity: number = 0.6;
  private baseMoonIntensity: number = 0.8;
  private baseJungleIntensity: number = 0.4;
  private baseFogColor: number = 0x3a5a4a; // Green-gray jungle fog
  private baseAmbientColor: number = 0x6a8a7a; // Warm green ambient

  constructor(scene: THREE.Scene, camera: THREE.Camera, chunkManager: IChunkManager) {
    this.scene = scene;
    this.camera = camera;
    this.chunkManager = chunkManager;
    this.rainVelocities = new Float32Array(this.rainCount);
    this.rainPositions = new Float32Array(this.rainCount * 3);
  }

  setAudioManager(audioManager: IAudioManager): void {
    this.audioManager = audioManager;
  }

  setSandboxRenderer(renderer: ISandboxRenderer): void {
    this.sandboxRenderer = renderer;
    // Cache initial values from renderer
    if (renderer.fog) {
      this.baseFogDensity = renderer.fog.density;
      this.baseFogColor = renderer.fog.color.getHex();
    }
    if (renderer.ambientLight) {
      this.baseAmbientIntensity = renderer.ambientLight.intensity;
      this.baseAmbientColor = renderer.ambientLight.color.getHex();
    }
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
    this.rainMesh.frustumCulled = false; // Rain follows camera, bounding sphere won't be accurate
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

    const idx = index * 3;
    this.rainPositions[idx] = x;
    this.rainPositions[idx + 1] = y;
    this.rainPositions[idx + 2] = z;

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
      this.updateAtmosphere();
    } else {
      this.transitionProgress = 0.0;
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
    const intensity = getBlendedRainIntensity(this.currentState, this.targetState, this.transitionProgress);
    
    if (intensity <= 0.01) {
      this.rainMesh.visible = false;
      return;
    }

    this.rainMesh.visible = true;
    (this.rainMesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * intensity;

    const cameraPos = this.camera.position;
    const windX = (this.currentState === WeatherState.STORM ? 5 : 2) * deltaTime;
    
    // Optimization: Use direct position tracking to avoid expensive matrix decomposition
    for (let i = 0; i < this.rainCount; i++) {
      const idx = i * 3;
      let x = this.rainPositions[idx];
      let y = this.rainPositions[idx + 1];
      let z = this.rainPositions[idx + 2];

      // Move down
      y -= this.rainVelocities[i] * deltaTime;
      
      // Wind effect
      x += windX;

      // Wrap around camera logic
      const dx = x - cameraPos.x;
      const dz = z - cameraPos.z;
      
      // Simple toroidal wrapping logic relative to camera
      if (y < cameraPos.y - 10) {
        y = cameraPos.y + 20;
        // Randomize X/Z again slightly to break patterns
        x = cameraPos.x + (Math.random() - 0.5) * 40;
        z = cameraPos.z + (Math.random() - 0.5) * 40;
      } else {
        // Keep x/z relative to camera if it moved too far
        if (Math.abs(dx) > 20) x = cameraPos.x - Math.sign(dx) * 19.9;
        if (Math.abs(dz) > 20) z = cameraPos.z - Math.sign(dz) * 19.9;
      }

      this.rainPositions[idx] = x;
      this.rainPositions[idx + 1] = y;
      this.rainPositions[idx + 2] = z;

      this.rainDummy.position.set(x, y, z);
      this.rainDummy.updateMatrix();
      this.rainMesh.setMatrixAt(i, this.rainDummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
  }

  private updateLightning(deltaTime: number): void {
    updateLightning(
      deltaTime,
      this.lightningState,
      this.currentState,
      this.targetState,
      this.transitionProgress,
      this.sandboxRenderer,
      this.audioManager,
      () => this.updateAtmosphere()
    );
  }

  private updateAtmosphere(): void {
    const baseValues: AtmosphereBaseValues = {
      fogDensity: this.baseFogDensity,
      ambientIntensity: this.baseAmbientIntensity,
      moonIntensity: this.baseMoonIntensity,
      jungleIntensity: this.baseJungleIntensity,
      fogColor: this.baseFogColor,
      ambientColor: this.baseAmbientColor
    };

    updateAtmosphere(
      this.sandboxRenderer,
      this.isUnderwater,
      this.currentState,
      this.targetState,
      this.transitionProgress,
      baseValues,
      this.lightningState.isFlashing
    );
  }

  dispose(): void {
    if (this.rainMesh) {
      this.scene.remove(this.rainMesh);
      this.rainMesh.geometry.dispose();
      (this.rainMesh.material as THREE.Material).dispose();
    }
  }
}
