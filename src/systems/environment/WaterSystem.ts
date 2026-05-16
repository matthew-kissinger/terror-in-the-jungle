import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { ISkyRuntime } from '../../types/SystemInterfaces';
import { AssetLoader } from '../assets/AssetLoader';
import { getAssetPath } from '../../config/paths';
import { WeatherSystem } from './WeatherSystem';
import { playElementAnimation } from '../../ui/engine/playElementAnimation';
import type { HydrologyBakeArtifact } from '../terrain/hydrology/HydrologyBake';
import {
  HydrologyRiverSurface,
  type HydrologyWaterQuerySegment,
} from './water/HydrologyRiverSurface';
import {
  WaterSurfaceSampler,
  type WaterInteractionOptions,
  type WaterInteractionSample,
} from './water/WaterSurfaceSampler';
import {
  WaterSurfaceBinding,
  type GlobalWaterShaderRefs,
  type WaterEdgeBinding,
  type WaterTerrainHeightSamplerBinding,
  WATER_EDGE_SOFT_BLEND_DISTANCE_METERS,
} from './water/WaterSurfaceBinding';

export type { WaterInteractionOptions, WaterInteractionSample, WaterSurfaceSource } from './water/WaterSurfaceSampler';
export type { WaterEdgeBinding, WaterTerrainHeightSamplerBinding } from './water/WaterSurfaceBinding';

interface WaterDebugInfo {
  enabled: boolean;
  waterLevel: number;
  waterVisible: boolean;
  cameraUnderwater: boolean;
  size: number;
  hydrologyRiverMaterialProfile: string;
  hydrologyRiverVisible: boolean;
  hydrologyChannelCount: number;
  hydrologySegmentCount: number;
  hydrologyVertexCount: number;
  hydrologyTotalLengthMeters: number;
  hydrologyMaxAccumulationCells: number;
}

const GLOBAL_WATER_COLOR = 0x17362f;
const GLOBAL_WATER_DISTORTION_SCALE = 2.35;
const GLOBAL_WATER_ALPHA = 0.78;
const GLOBAL_WATER_TIME_SCALE = 0.36;

/**
 * Orchestrator for the global water plane + hydrology river surfaces.
 * After water-system-file-split (VODA-1, 2026-05-16) this class owns the
 * lifecycle (init/update/dispose), the underwater overlay, the
 * camera-follow + sun-sync wiring, and the public API. The heavy work
 * delegates to `water/HydrologyRiverSurface` (hydrology-bake consumer +
 * mesh), `water/WaterSurfaceSampler` (runtime depth/buoyancy sampler),
 * and `water/WaterSurfaceBinding` (shader/material binding layer).
 */
export class WaterSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private water?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private waterShaderRefs?: GlobalWaterShaderRefs;
  private waterTimeSeconds = 0;
  private waterNormalTexture?: THREE.Texture;
  private assetLoader: AssetLoader;
  private weatherSystem?: WeatherSystem;
  private atmosphereSystem?: ISkyRuntime;

  private readonly WATER_LEVEL = 0;
  private readonly BASE_WATER_SIZE = 2000;
  private readonly WATER_SEGMENTS = 100;
  private worldWaterSize = 2000;

  private sun: THREE.Vector3;
  private wasUnderwater = false;
  private overlay?: HTMLDivElement;
  private enabled = true;

  private readonly riverSurface: HydrologyRiverSurface;
  private readonly sampler: WaterSurfaceSampler;
  private readonly binding: WaterSurfaceBinding;

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.sun = new THREE.Vector3();
    this.riverSurface = new HydrologyRiverSurface(scene);
    this.binding = new WaterSurfaceBinding();
    this.sampler = new WaterSurfaceSampler({
      globalWaterLevel: this.WATER_LEVEL,
      isGlobalPlaneActive: () => this.isGlobalWaterPlaneActive(),
      getHydrologyQuerySegments: (): readonly HydrologyWaterQuerySegment[] => this.riverSurface.getQuerySegments(),
    });
  }

  setWeatherSystem(w: WeatherSystem): void { this.weatherSystem = w; }

  /** Bind atmosphere so water reflections track real sun direction each frame. */
  setAtmosphereSystem(s: ISkyRuntime): void { this.atmosphereSystem = s; this.syncSunFromAtmosphere(); }

  private syncSunFromAtmosphere(): void {
    if (!this.atmosphereSystem) return;
    this.atmosphereSystem.getSunDirection(this.sun);
    if (this.sun.lengthSq() > 0) this.sun.normalize();
  }

  async init(): Promise<void> {
    Logger.info('environment', 'Initializing Water System...');
    const geom = new THREE.PlaneGeometry(this.BASE_WATER_SIZE, this.BASE_WATER_SIZE, this.WATER_SEGMENTS, this.WATER_SEGMENTS);

    let normals = this.assetLoader.getTexture('waternormals');
    if (!normals) {
      Logger.info('environment', 'Loading water normal texture directly...');
      normals = await new THREE.TextureLoader().loadAsync(getAssetPath('waternormals.jpg'));
    }
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    this.waterNormalTexture = normals;

    const material = new THREE.MeshStandardMaterial({
      name: 'global-water-standard-material',
      color: GLOBAL_WATER_COLOR,
      roughness: 0.42, metalness: 0,
      transparent: true, opacity: GLOBAL_WATER_ALPHA,
      normalMap: normals, normalScale: new THREE.Vector2(0.18, 0.18),
      depthWrite: false, side: THREE.DoubleSide,
    });
    material.envMapIntensity = 0.35;
    this.waterShaderRefs = this.binding.install(material, this.sun);

    this.water = new THREE.Mesh(geom, material);
    this.water.name = 'global-water-standard-plane';
    // PlaneGeometry is XY; rotate so the surface lies on XZ.
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.WATER_LEVEL;
    this.updateWaterScale();
    this.water.matrixAutoUpdate = true;
    this.scene.add(this.water);

    this.updateSunPosition(50, 100, 30);
    this.createUnderwaterOverlay();
    Logger.info('environment', `Water System initialized at Y=${this.WATER_LEVEL}`);
  }

  private createUnderwaterOverlay(): void {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      backgroundColor: '#004455', opacity: '0', pointerEvents: 'none',
      transition: 'opacity 0.5s ease-out', zIndex: '900', display: 'none',
      backdropFilter: 'blur(4px)',
    });
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  update(deltaTime: number): void {
    if (!this.water) return;
    if (!this.isGlobalWaterPlaneActive()) this.setUnderwaterState(false);
    if (this.water.visible) {
      if (this.waterNormalTexture) {
        this.waterNormalTexture.offset.x += deltaTime * GLOBAL_WATER_TIME_SCALE * 0.015;
        this.waterNormalTexture.offset.y += deltaTime * GLOBAL_WATER_TIME_SCALE * 0.008;
      }
      // Keep ocean centered under camera so map-edge seams stay hidden.
      this.water.position.x = this.camera.position.x;
      this.water.position.z = this.camera.position.z;
    }
    this.syncSunFromAtmosphere();
    this.setUnderwaterState(this.isUnderwater(this.camera.position));
    this.waterTimeSeconds += deltaTime * GLOBAL_WATER_TIME_SCALE;
    this.binding.updateSurfaceUniforms(this.waterTimeSeconds, this.sun, this.wasUnderwater);
  }

  private setUnderwaterState(isUnderwater: boolean): void {
    if (isUnderwater === this.wasUnderwater) return;
    this.wasUnderwater = isUnderwater;
    this.weatherSystem?.setUnderwater(isUnderwater);
    if (!this.overlay) return;
    if (isUnderwater) {
      this.overlay.style.display = 'block';
      playElementAnimation(
        this.overlay,
        [{ opacity: 0 }, { opacity: 0.4 }],
        { duration: 250, easing: 'ease-out', fill: 'forwards' },
      );
    } else {
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        if (this.overlay && !this.wasUnderwater) this.overlay.style.display = 'none';
      }, 500);
    }
  }

  dispose(): void {
    this.riverSurface.clear();
    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
      (this.water.material as THREE.Material).dispose();
    }
    this.overlay?.parentNode?.removeChild(this.overlay);
    Logger.info('environment', 'Water System disposed');
  }

  updateSunPosition(x: number, y: number, z: number): void { this.sun.set(x, y, z).normalize(); }
  getWaterLevel(): number { return this.WATER_LEVEL; }
  isUnderwater(position: THREE.Vector3): boolean { return this.sampler.isUnderwater(position); }
  getWaterSurfaceY(position: THREE.Vector3): number | null { return this.sampler.getWaterSurfaceY(position); }
  getWaterDepth(position: THREE.Vector3): number { return this.sampler.getWaterDepth(position); }

  sampleWaterInteraction(
    position: THREE.Vector3,
    options: WaterInteractionOptions = {},
  ): WaterInteractionSample {
    return this.sampler.sample(position, options);
  }

  setWaterColor(color: number): void { if (this.water) this.water.material.color.set(color); }

  setDistortionScale(scale: number): void {
    if (!this.water) return;
    const ns = Math.max(0, Math.min(0.8, (scale / GLOBAL_WATER_DISTORTION_SCALE) * 0.18));
    this.water.material.normalScale.set(ns, ns);
  }

  /** Show or hide the global water plane (e.g. A Shau disables it). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.updateGlobalWaterVisibility();
    if (!enabled) {
      if (this.overlay) { this.overlay.style.display = 'none'; this.overlay.style.opacity = '0'; }
      this.setUnderwaterState(false);
    }
  }

  isEnabled(): boolean { return this.enabled; }

  getDebugInfo(): WaterDebugInfo {
    const stats = this.riverSurface.getStats();
    return {
      enabled: this.enabled,
      waterLevel: this.WATER_LEVEL,
      waterVisible: Boolean(this.water?.visible),
      cameraUnderwater: this.isUnderwater(this.camera.position),
      size: this.worldWaterSize,
      hydrologyRiverMaterialProfile: this.riverSurface.getMaterialProfile(),
      hydrologyRiverVisible: this.riverSurface.isVisible(),
      hydrologyChannelCount: stats.channelCount,
      hydrologySegmentCount: stats.segmentCount,
      hydrologyVertexCount: stats.vertexCount,
      hydrologyTotalLengthMeters: stats.totalLengthMeters,
      hydrologyMaxAccumulationCells: stats.maxAccumulationCells,
    };
  }

  /** Publish water-edge config for terrain-side consumers. */
  getWaterEdgeBinding(): WaterEdgeBinding {
    return { surfaceY: this.WATER_LEVEL, softBlendDistance: WATER_EDGE_SOFT_BLEND_DISTANCE_METERS };
  }

  /** Wire terrain heightmap so the water-side foam line lights up at intersections. `null` disables. */
  bindTerrainHeightSampler(binding: WaterTerrainHeightSamplerBinding | null): void {
    this.binding.bindTerrainHeightSampler(binding);
  }

  /**
   * Replace active hydrology surfaces or clear with `null`. Separate from
   * the global water plane so A Shau can keep the sea-level plane disabled
   * while still drawing DEM-following water.
   */
  setHydrologyChannels(artifact: HydrologyBakeArtifact | null): void {
    this.riverSurface.setArtifact(artifact);
    this.updateGlobalWaterVisibility();
  }

  /** Match water coverage to current world size with margin for traversal. */
  setWorldSize(worldSize: number): void {
    const safe = Number.isFinite(worldSize) && worldSize > 0 ? worldSize : this.BASE_WATER_SIZE;
    const target = Math.max(this.BASE_WATER_SIZE, safe * 1.8);
    if (Math.abs(target - this.worldWaterSize) < 1) return;
    this.worldWaterSize = target;
    this.updateWaterScale();
    Logger.info('environment', `Water coverage resized for world: ${this.worldWaterSize.toFixed(0)}m`);
  }

  private updateWaterScale(): void {
    if (!this.water) return;
    const s = this.worldWaterSize / this.BASE_WATER_SIZE;
    this.water.scale.set(s, 1, s);
  }

  private isGlobalWaterPlaneActive(): boolean { return this.enabled && !this.riverSurface.isActive(); }

  private updateGlobalWaterVisibility(): void {
    if (this.water) this.water.visible = this.isGlobalWaterPlaneActive();
  }
}
