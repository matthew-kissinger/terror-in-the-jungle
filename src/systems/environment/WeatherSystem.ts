// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ITerrainRuntime, IAudioManager, IGameRenderer } from '../../types/SystemInterfaces';
import { WeatherState, WeatherConfig } from '../../config/gameModeTypes';
import { updateLightning, LightningState } from './WeatherLightning';
import {
  updateAtmosphere,
  getBlendedRainIntensity,
  AtmosphereBaseValues,
  type FogTintIntentReceiver,
} from './WeatherAtmosphere';
import { estimateGPUTier, isMobileGPU } from '../../utils/DeviceDetector';

const MAX_RAIN_OPACITY = 0.6;
const MIN_ACTIVE_RAIN_FRACTION = 0.3;
const RAIN_MATRIX_STAGGER_MIN_ACTIVE_COUNT = 512;
const RAIN_MATRIX_STAGGER_CHUNKS = 2;

function markRainMatrixRangeDirty(attribute: THREE.InstancedBufferAttribute, startInstance: number, instanceCount: number): void {
  if (typeof attribute.clearUpdateRanges === 'function') {
    attribute.clearUpdateRanges();
  }
  if (typeof attribute.addUpdateRange === 'function') {
    attribute.addUpdateRange(startInstance * attribute.itemSize, instanceCount * attribute.itemSize);
  }
  attribute.needsUpdate = true;
}

export class WeatherSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private terrainRuntime: ITerrainRuntime;
  private audioManager?: IAudioManager;
  private renderer?: IGameRenderer;
  private fogTintIntent?: FogTintIntentReceiver;

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
  private rainCount: number;
  private activeRainCount: number = 0;
  private rainVelocities: Float32Array;
  private rainPositions: Float32Array;
  private lastSurfaceWetness = Number.NaN;
  private rainInactive = true;
  private rainMatrixUploadPhase = 0;
  private lastRainMatrixUploadStart = 0;
  private lastRainMatrixUploadCount = 0;

  // Lightning
  private lightningState: LightningState = {
    isFlashing: false,
    flashTimer: 0,
    thunderDelay: 0
  };

  // Base atmosphere values (cached from renderer on init)
  // SALVAGE FIX: Updated defaults to match brighter GameRenderer values
  // Note: These are overwritten by actual renderer values in setRenderer()
  private baseFogDensity: number = 0.005;
  private baseAmbientIntensity: number = 0.6;
  private baseMoonIntensity: number = 0.8;
  private baseHemisphereIntensity: number = 0.4;
  private baseFogColor: number = 0x3a5a4a; // Green-gray fog
  private baseAmbientColor: number = 0x6a8a7a; // Warm green ambient

  constructor(scene: THREE.Scene, camera: THREE.Camera, terrainRuntime: ITerrainRuntime) {
    this.scene = scene;
    this.camera = camera;
    this.terrainRuntime = terrainRuntime;
    this.rainCount = this.calculateRainCount();
    this.rainVelocities = new Float32Array(this.rainCount);
    this.rainPositions = new Float32Array(this.rainCount * 3);
  }

  private calculateRainCount(): number {
    const gpuTier = estimateGPUTier();
    const mobile = isMobileGPU();

    let count: number;
    if (mobile) {
      count = gpuTier === 'low' ? 2000 : 4000;
    } else {
      switch (gpuTier) {
        case 'low': count = 4000; break;
        case 'medium': count = 6000; break;
        case 'high': default: count = 8000; break;
      }
    }

    Logger.info('weather', `Rain particle count: ${count} (GPU: ${gpuTier}, mobile: ${mobile})`);
    return count;
  }

  setAudioManager(audioManager: IAudioManager): void {
    this.audioManager = audioManager;
  }

  /**
   * Wire the atmosphere system as the fog-tint authority. Once set,
   * weather forwards "storm darken" intent here instead of writing
   * `scene.fog.color` directly. Leaving this unset preserves the
   * pre-atmosphere behavior for isolated tests.
   */
  setFogTintIntentReceiver(receiver: FogTintIntentReceiver): void {
    this.fogTintIntent = receiver;
  }

  setRenderer(renderer: IGameRenderer): void {
    this.renderer = renderer;
    this.refreshAtmosphereBaseline();
  }

  /**
   * Re-cache the "clear weather" baseline atmosphere values from the bound
   * renderer. Called after `AtmosphereSystem.applyScenarioPreset` stamps a
   * scenario-specific fog density onto the renderer so the weather
   * multiplier (x1.5 rain, x3.5 storm) scales from the correct base instead
   * of the stale default captured at composer wire-up. Safe no-op when no
   * renderer is bound.
   */
  refreshAtmosphereBaseline(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    if (renderer.fog) {
      this.baseFogDensity = renderer.fog.density;
      this.baseFogColor = renderer.fog.color.getHex();
    }
    if (renderer.ambientLight) {
      this.baseAmbientIntensity = renderer.ambientLight.intensity;
      this.baseAmbientColor = renderer.ambientLight.color.getHex();
    }
    if (renderer.moonLight) this.baseMoonIntensity = renderer.moonLight.intensity;
    if (renderer.hemisphereLight) this.baseHemisphereIntensity = renderer.hemisphereLight.intensity;
  }

  setWeatherConfig(config?: WeatherConfig): void {
    this.config = config;
    if (config) {
      this.setWeatherState(config.initialState, true);
      this.cycleTimer = this.getRandomCycleDuration();
    }
    this.syncRainParticleRuntime();
  }

  async init(): Promise<void> {
    if (this.shouldRenderRainParticles()) {
      this.createRainParticles();
    }
  }

  private createRainParticles(): void {
    if (this.rainMesh) return;

    const geometry = new THREE.PlaneGeometry(0.05, 1.0);
    const material = new THREE.MeshBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: MAX_RAIN_OPACITY,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      depthWrite: false
    });

    this.rainMesh = new THREE.InstancedMesh(geometry, material, this.rainCount);
    this.rainMesh.name = 'WeatherRain';
    this.rainMesh.userData.perfCategory = 'weather_rain';
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rainMesh.frustumCulled = false; // Rain follows camera, bounding sphere won't be accurate
    this.rainMesh.visible = false;
    this.rainMesh.count = 0;
    this.rainMesh.matrixAutoUpdate = false;
    this.rainMesh.matrixWorldAutoUpdate = false;
    this.scene.add(this.rainMesh);

    // Initialize positions randomly around origin
    for (let i = 0; i < this.rainCount; i++) {
      this.resetRainDrop(i, true);
    }
  }

  private resetRainDrop(index: number, randomY: boolean = false, center?: THREE.Vector3): void {
    if (!this.rainMesh) return;

    const range = 40; // Rain radius around camera
    const originX = center?.x ?? 0;
    const originY = center?.y ?? 0;
    const originZ = center?.z ?? 0;
    const x = originX + (Math.random() - 0.5) * range * 2;
    const z = originZ + (Math.random() - 0.5) * range * 2;
    // Keep Y relative to camera later
    const y = originY + (randomY ? (Math.random() * 30) : 30);

    const idx = index * 3;
    this.rainPositions[idx] = x;
    this.rainPositions[idx + 1] = y;
    this.rainPositions[idx + 2] = z;

    this.writeRainMatrix(index, x, y, z);
    
    // Random fall speed
    this.rainVelocities[index] = 15 + Math.random() * 10;
  }

  update(deltaTime: number): void {
    if (!this.config?.enabled) {
      this.setSurfaceWetness(0);
      return;
    }

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
    Logger.info('weather', `Weather changing: ${this.currentState} -> ${state}`);
    this.targetState = state;
    if (instant) {
      this.currentState = state;
      this.transitionProgress = 1.0;
      this.setSurfaceWetness(this.resolveSurfaceWetness(getBlendedRainIntensity(state, state, 1.0)));
      this.updateAtmosphere();
    } else {
      this.transitionProgress = 0.0;
    }
  }

  getDebugInfo(): Record<string, string | number | boolean> {
    const material = this.rainMesh?.material as THREE.MeshBasicMaterial | undefined;
    const matrixElements = this.lastRainMatrixUploadCount * 16;
    return {
      configEnabled: this.config?.enabled === true,
      visualRainEnabled: this.shouldRenderRainParticles(),
      surfaceWetnessEnabled: this.shouldApplyPrecipitationSurfaceWetness(),
      currentState: this.currentState,
      targetState: this.targetState,
      transitionProgress: this.transitionProgress,
      cycleTimer: this.cycleTimer,
      rainCount: this.rainCount,
      activeRainCount: this.activeRainCount,
      rainVisible: this.rainMesh?.visible === true,
      rainOpacity: Number(material?.opacity ?? 0),
      rainInactive: this.rainInactive,
      surfaceWetness: Number.isFinite(this.lastSurfaceWetness) ? this.lastSurfaceWetness : 0,
      rainMatrixUploadStart: this.lastRainMatrixUploadStart,
      rainMatrixUploadCount: this.lastRainMatrixUploadCount,
      rainMatrixActiveElements: this.activeRainCount * 16,
      rainMatrixElementsPerFrame: matrixElements,
      rainMatrixBytesPerFrame: matrixElements * Float32Array.BYTES_PER_ELEMENT,
    };
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
    // Determine rain intensity based on blended state
    const intensity = getBlendedRainIntensity(this.currentState, this.targetState, this.transitionProgress);
    this.setSurfaceWetness(this.resolveSurfaceWetness(intensity));

    if (!this.shouldRenderRainParticles()) {
      this.deactivateRainParticles();
      return;
    }

    if (!this.rainMesh) {
      this.createRainParticles();
    }
    if (!this.rainMesh) return;

    if (intensity <= 0.01) {
      if (this.rainInactive) {
        return;
      }
      this.rainMesh.visible = false;
      this.rainMesh.count = 0;
      this.activeRainCount = 0;
      this.rainMatrixUploadPhase = 0;
      this.lastRainMatrixUploadStart = 0;
      this.lastRainMatrixUploadCount = 0;
      this.rainInactive = true;
      return;
    }

    const wasRainInactive = this.rainInactive;
    this.rainMesh.visible = true;
    this.rainInactive = false;

    const cameraPos = this.camera.position;
    const nextActiveRainCount = this.resolveActiveRainCount(intensity);
    const activeCountChanged = nextActiveRainCount !== this.activeRainCount;
    if (nextActiveRainCount > this.activeRainCount) {
      for (let i = this.activeRainCount; i < nextActiveRainCount; i++) {
        this.resetRainDrop(i, true, cameraPos);
      }
    }
    this.activeRainCount = nextActiveRainCount;
    this.rainMesh.count = nextActiveRainCount;

    const activeFraction = nextActiveRainCount / this.rainCount;
    (this.rainMesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
      MAX_RAIN_OPACITY,
      MAX_RAIN_OPACITY * intensity / activeFraction,
    );

    const windX = (this.currentState === WeatherState.STORM ? 5 : 2) * deltaTime;
    const uploadWindow = this.resolveRainMatrixUploadWindow(nextActiveRainCount, wasRainInactive || activeCountChanged);
    const uploadEnd = uploadWindow.start + uploadWindow.count;

    // Optimization: Use direct position tracking to avoid expensive matrix decomposition
    for (let i = 0; i < nextActiveRainCount; i++) {
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

      if (i >= uploadWindow.start && i < uploadEnd) {
        this.writeRainTranslation(i, x, y, z);
      }
    }
    this.lastRainMatrixUploadStart = uploadWindow.start;
    this.lastRainMatrixUploadCount = uploadWindow.count;
    markRainMatrixRangeDirty(this.rainMesh.instanceMatrix, uploadWindow.start, uploadWindow.count);
  }

  private resolveActiveRainCount(intensity: number): number {
    if (this.rainCount <= 0 || intensity <= 0.01) return 0;
    const activeFraction = Math.min(1, Math.max(MIN_ACTIVE_RAIN_FRACTION, intensity));
    return Math.max(1, Math.min(this.rainCount, Math.ceil(this.rainCount * activeFraction)));
  }

  private shouldRenderRainParticles(): boolean {
    return this.config?.visualRain !== false;
  }

  private shouldApplyPrecipitationSurfaceWetness(): boolean {
    return this.config?.visualRain !== false;
  }

  private resolveSurfaceWetness(intensity: number): number {
    return this.shouldApplyPrecipitationSurfaceWetness() ? intensity : 0;
  }

  private syncRainParticleRuntime(): void {
    if (!this.shouldRenderRainParticles()) {
      this.disposeRainParticles();
      this.deactivateRainParticles();
    }
  }

  private deactivateRainParticles(): void {
    if (this.rainMesh) {
      this.rainMesh.visible = false;
      this.rainMesh.count = 0;
    }
    this.activeRainCount = 0;
    this.rainMatrixUploadPhase = 0;
    this.lastRainMatrixUploadStart = 0;
    this.lastRainMatrixUploadCount = 0;
    this.rainInactive = true;
  }

  private disposeRainParticles(): void {
    if (!this.rainMesh) return;
    this.scene.remove(this.rainMesh);
    this.rainMesh.geometry.dispose();
    (this.rainMesh.material as THREE.Material).dispose();
    this.rainMesh = undefined;
  }

  private resolveRainMatrixUploadWindow(activeCount: number, forceFullUpload: boolean): { start: number; count: number } {
    if (activeCount <= 0) return { start: 0, count: 0 };
    if (forceFullUpload || activeCount < RAIN_MATRIX_STAGGER_MIN_ACTIVE_COUNT) {
      this.rainMatrixUploadPhase = 0;
      return { start: 0, count: activeCount };
    }

    const chunkSize = Math.ceil(activeCount / RAIN_MATRIX_STAGGER_CHUNKS);
    const phase = this.rainMatrixUploadPhase % RAIN_MATRIX_STAGGER_CHUNKS;
    const start = Math.min(activeCount, phase * chunkSize);
    const count = Math.max(0, Math.min(chunkSize, activeCount - start));
    this.rainMatrixUploadPhase = (phase + 1) % RAIN_MATRIX_STAGGER_CHUNKS;
    return { start, count };
  }

  private writeRainMatrix(index: number, x: number, y: number, z: number): void {
    if (!this.rainMesh) return;
    const matrixArray = this.rainMesh.instanceMatrix.array;
    const offset = index * 16;

    matrixArray[offset] = 1;
    matrixArray[offset + 1] = 0;
    matrixArray[offset + 2] = 0;
    matrixArray[offset + 3] = 0;
    matrixArray[offset + 4] = 0;
    matrixArray[offset + 5] = 1;
    matrixArray[offset + 6] = 0;
    matrixArray[offset + 7] = 0;
    matrixArray[offset + 8] = 0;
    matrixArray[offset + 9] = 0;
    matrixArray[offset + 10] = 1;
    matrixArray[offset + 11] = 0;
    matrixArray[offset + 12] = x;
    matrixArray[offset + 13] = y;
    matrixArray[offset + 14] = z;
    matrixArray[offset + 15] = 1;
  }

  private writeRainTranslation(index: number, x: number, y: number, z: number): void {
    if (!this.rainMesh) return;
    const matrixArray = this.rainMesh.instanceMatrix.array;
    const offset = index * 16;
    matrixArray[offset + 12] = x;
    matrixArray[offset + 13] = y;
    matrixArray[offset + 14] = z;
  }

  private setSurfaceWetness(value: number): void {
    if (this.lastSurfaceWetness === value) return;
    this.terrainRuntime.setSurfaceWetness(value);
    this.lastSurfaceWetness = value;
  }

  private updateLightning(deltaTime: number): void {
    updateLightning(
      deltaTime,
      this.lightningState,
      this.currentState,
      this.targetState,
      this.transitionProgress,
      this.renderer,
      this.audioManager,
      () => this.updateAtmosphere()
    );
  }

  private updateAtmosphere(): void {
    const baseValues: AtmosphereBaseValues = {
      fogDensity: this.baseFogDensity,
      ambientIntensity: this.baseAmbientIntensity,
      moonIntensity: this.baseMoonIntensity,
      hemisphereIntensity: this.baseHemisphereIntensity,
      fogColor: this.baseFogColor,
      ambientColor: this.baseAmbientColor
    };

    updateAtmosphere(
      this.renderer,
      this.currentState,
      this.targetState,
      this.transitionProgress,
      baseValues,
      this.lightningState.isFlashing,
      this.fogTintIntent
    );
  }

  /**
   * Reset weather state to clear (for match restart)
   */
  resetState(): void {
    this.currentState = WeatherState.CLEAR;
    this.targetState = WeatherState.CLEAR;
    this.transitionProgress = 1.0;
    this.transitionTimer = 0;
    this.cycleTimer = this.getRandomCycleDuration();
    this.setSurfaceWetness(0);
    Logger.info('weather', 'Weather system reset to clear state');
  }

  dispose(): void {
    this.disposeRainParticles();
  }
}
