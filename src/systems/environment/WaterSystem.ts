import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { GameSystem } from '../../types';
import type { ISkyRuntime } from '../../types/SystemInterfaces';
import { AssetLoader } from '../assets/AssetLoader';
import { getAssetPath } from '../../config/paths';
import { WeatherSystem } from './WeatherSystem';
import { playElementAnimation } from '../../ui/engine/playElementAnimation';
import type { HydrologyBakeArtifact } from '../terrain/hydrology/HydrologyBake';

interface WaterUniforms {
  time?: { value: number };
  sunDirection?: { value: THREE.Vector3 };
  waterColor?: { value: THREE.Color };
  distortionScale?: { value: number };
  [key: string]: { value: any } | undefined;
}

interface HydrologyRiverMeshStats {
  channelCount: number;
  segmentCount: number;
  vertexCount: number;
  totalLengthMeters: number;
  maxAccumulationCells: number;
}

interface HydrologyWaterQuerySegment {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  startSurfaceY: number;
  endSurfaceY: number;
  halfWidth: number;
}

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

const EMPTY_HYDROLOGY_RIVER_STATS: HydrologyRiverMeshStats = {
  channelCount: 0,
  segmentCount: 0,
  vertexCount: 0,
  totalLengthMeters: 0,
  maxAccumulationCells: 0,
};

const MAX_HYDROLOGY_RIVER_CHANNELS = 24;
const MAX_HYDROLOGY_RIVER_SEGMENTS = 2048;
const HYDROLOGY_RIVER_SURFACE_OFFSET_METERS = 0.35;
const HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS = 0.5;
const GLOBAL_WATER_COLOR = 0x17362f;
const GLOBAL_WATER_DISTORTION_SCALE = 2.35;
const GLOBAL_WATER_ALPHA = 0.78;
const GLOBAL_WATER_TIME_SCALE = 0.36;
const HYDROLOGY_RIVER_MATERIAL_PROFILE = 'natural_channel_gradient';
const HYDROLOGY_RIVER_BANK_COLOR = new THREE.Color(0x23382e);
const HYDROLOGY_RIVER_SHALLOW_COLOR = new THREE.Color(0x1e4e52);
const HYDROLOGY_RIVER_DEEP_COLOR = new THREE.Color(0x0b2a34);
const HYDROLOGY_RIVER_BANK_ALPHA = 0.01;
const HYDROLOGY_RIVER_CENTER_ALPHA = 0.32;

export class WaterSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private water?: Water;
  private hydrologyRiverGroup?: THREE.Group;
  private hydrologyRiverMesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private hydrologyRiverStats: HydrologyRiverMeshStats = { ...EMPTY_HYDROLOGY_RIVER_STATS };
  private hydrologyWaterQuerySegments: HydrologyWaterQuerySegment[] = [];
  private assetLoader: AssetLoader;
  private weatherSystem?: WeatherSystem;
  private atmosphereSystem?: ISkyRuntime;
  
  // Water configuration
  private readonly WATER_LEVEL = 0; // Sea level height
  private readonly BASE_WATER_SIZE = 2000; // Base geometry size before scaling
  private readonly WATER_SEGMENTS = 100; // Geometry segments for waves
  private worldWaterSize = 2000;
  
  // State
  private sun: THREE.Vector3;
  private wasUnderwater: boolean = false;
  private overlay?: HTMLDivElement;
  private enabled = true;
  
  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.sun = new THREE.Vector3();
  }

  setWeatherSystem(weatherSystem: WeatherSystem): void {
    this.weatherSystem = weatherSystem;
  }

  /**
   * Bind the atmosphere system so water reflections track the real sun
   * direction each frame. Before this wire-up the `sun` vector was a stub
   * initialized to the origin and never updated.
   */
  setAtmosphereSystem(atmosphereSystem: ISkyRuntime): void {
    this.atmosphereSystem = atmosphereSystem;
    // Apply once immediately so reflections look right on the first frame
    // even before `update()` runs.
    this.syncSunFromAtmosphere();
  }

  private syncSunFromAtmosphere(): void {
    if (!this.atmosphereSystem) return;
    this.atmosphereSystem.getSunDirection(this.sun);
    // `getSunDirection` already returns a unit vector, but re-normalize
    // defensively in case a future backend returns an unnormalized value.
    if (this.sun.lengthSq() > 0) {
      this.sun.normalize();
    }
    if (!this.water) return;
    const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as WaterUniforms;
    if (waterUniforms && waterUniforms.sunDirection) {
      waterUniforms.sunDirection.value.copy(this.sun);
    }
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
      waterColor: GLOBAL_WATER_COLOR,
      distortionScale: GLOBAL_WATER_DISTORTION_SCALE,
      fog: this.scene.fog !== undefined,
      alpha: GLOBAL_WATER_ALPHA,
    });

    // Rotate to be horizontal (Water defaults to vertical)
    this.water.rotation.x = -Math.PI / 2;
    
    // Position at water level
    this.water.position.y = this.WATER_LEVEL;
    this.updateWaterScale();
    
    // Add to scene - dynamic: follows camera XZ
    this.water.matrixAutoUpdate = true;
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

    if (!this.isGlobalWaterPlaneActive()) {
      this.setUnderwaterState(false);
    }

    if (this.water.visible) {
      // Update water time for wave animation
      const waterUniforms = (this.water.material as THREE.ShaderMaterial).uniforms as WaterUniforms;
      if (waterUniforms && waterUniforms.time) {
        waterUniforms.time.value += deltaTime * GLOBAL_WATER_TIME_SCALE;
      }

      // Keep ocean centered under camera so map-edge seams are not visible in large worlds.
      this.water.position.x = this.camera.position.x;
      this.water.position.z = this.camera.position.z;
    }

    // Pull the current sun direction from the atmosphere each frame so the
    // water specular highlight tracks TOD presets (dawn/noon/dusk) and
    // eventually a live sun cycle. Per-scenario presets are static in v1
    // so this is cheap; backends that animate will get the updates for free.
    this.syncSunFromAtmosphere();

    // Check underwater state
    this.checkUnderwaterState();
  }

  private checkUnderwaterState(): void {
    const isUnderwater = this.isUnderwater(this.camera.position);
    this.setUnderwaterState(isUnderwater);
  }

  private setUnderwaterState(isUnderwater: boolean): void {
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
          playElementAnimation(
            this.overlay,
            [
              { opacity: 0 },
              { opacity: 0.4 }
            ],
            {
              duration: 250,
              easing: 'ease-out',
              fill: 'forwards'
            }
          );
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
    this.clearHydrologyChannels();

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
    return this.getWaterDepth(position) > 0;
  }

  /**
   * Return the water surface at a gameplay position, or null when dry.
   */
  getWaterSurfaceY(position: THREE.Vector3): number | null {
    const hydrologySurfaceY = this.getHydrologyWaterSurfaceY(position.x, position.z);
    if (hydrologySurfaceY !== null) {
      return hydrologySurfaceY;
    }
    return this.isGlobalWaterPlaneActive() ? this.WATER_LEVEL : null;
  }

  /**
   * Return water depth above the supplied position. Dry positions report 0.
   */
  getWaterDepth(position: THREE.Vector3): number {
    const surfaceY = this.getWaterSurfaceY(position);
    if (surfaceY === null) return 0;
    return Math.max(0, surfaceY - position.y);
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
    this.enabled = enabled;
    this.updateGlobalWaterVisibility();
    if (this.overlay) {
      if (!enabled) {
        this.overlay.style.display = 'none';
        this.overlay.style.opacity = '0';
      }
    }
    if (!enabled) {
      this.setUnderwaterState(false);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getDebugInfo(): WaterDebugInfo {
    return {
      enabled: this.enabled,
      waterLevel: this.WATER_LEVEL,
      waterVisible: Boolean(this.water?.visible),
      cameraUnderwater: this.isUnderwater(this.camera.position),
      size: this.worldWaterSize,
      hydrologyRiverMaterialProfile: this.hydrologyRiverMesh ? HYDROLOGY_RIVER_MATERIAL_PROFILE : 'none',
      hydrologyRiverVisible: Boolean(this.hydrologyRiverGroup?.visible),
      hydrologyChannelCount: this.hydrologyRiverStats.channelCount,
      hydrologySegmentCount: this.hydrologyRiverStats.segmentCount,
      hydrologyVertexCount: this.hydrologyRiverStats.vertexCount,
      hydrologyTotalLengthMeters: this.hydrologyRiverStats.totalLengthMeters,
      hydrologyMaxAccumulationCells: this.hydrologyRiverStats.maxAccumulationCells,
    };
  }

  /**
   * Add map-space river and stream surfaces generated from an accepted
   * hydrology bake. This is separate from the global water plane so A Shau can
   * keep the sea-level plane disabled while still drawing DEM-following water.
   */
  setHydrologyChannels(artifact: HydrologyBakeArtifact | null): void {
    this.clearHydrologyChannels();
    if (!artifact || artifact.channelPolylines.length === 0) {
      return;
    }

    const meshBuild = this.buildHydrologyRiverMesh(artifact);
    if (!meshBuild) {
      return;
    }

    const group = new THREE.Group();
    group.name = 'hydrology-river-surfaces';
    group.add(meshBuild.mesh);
    this.scene.add(group);

    this.hydrologyRiverGroup = group;
    this.hydrologyRiverMesh = meshBuild.mesh;
    this.hydrologyRiverStats = meshBuild.stats;
    this.hydrologyWaterQuerySegments = meshBuild.querySegments;
    this.updateGlobalWaterVisibility();
    Logger.info(
      'environment',
      `Hydrology river surfaces loaded: ${meshBuild.stats.channelCount} channels, ${meshBuild.stats.segmentCount} segments`,
    );
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

  private clearHydrologyChannels(): void {
    if (this.hydrologyRiverGroup) {
      this.scene.remove(this.hydrologyRiverGroup);
    }
    if (this.hydrologyRiverMesh) {
      this.hydrologyRiverMesh.geometry.dispose();
      this.hydrologyRiverMesh.material.dispose();
    }
    this.hydrologyRiverGroup = undefined;
    this.hydrologyRiverMesh = undefined;
    this.hydrologyRiverStats = { ...EMPTY_HYDROLOGY_RIVER_STATS };
    this.hydrologyWaterQuerySegments = [];
    this.updateGlobalWaterVisibility();
  }

  private isGlobalWaterPlaneActive(): boolean {
    return this.enabled && !this.hydrologyRiverGroup;
  }

  private updateGlobalWaterVisibility(): void {
    if (this.water) {
      this.water.visible = this.isGlobalWaterPlaneActive();
    }
  }

  private buildHydrologyRiverMesh(
    artifact: HydrologyBakeArtifact,
  ): {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    stats: HydrologyRiverMeshStats;
    querySegments: HydrologyWaterQuerySegment[];
  } | null {
    const geometryBuild = this.buildHydrologyRiverGeometry(artifact);
    if (!geometryBuild) return null;

    const material = new THREE.MeshStandardMaterial({
      name: 'hydrology-river-surface-material',
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0.02,
      roughness: 0.54,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometryBuild.geometry, material);
    mesh.name = 'hydrology-river-surface-mesh';
    mesh.frustumCulled = true;
    mesh.renderOrder = 2;
    return { mesh, stats: geometryBuild.stats, querySegments: geometryBuild.querySegments };
  }

  private buildHydrologyRiverGeometry(
    artifact: HydrologyBakeArtifact,
  ): {
    geometry: THREE.BufferGeometry;
    stats: HydrologyRiverMeshStats;
    querySegments: HydrologyWaterQuerySegment[];
  } | null {
    const sortedChannels = [...artifact.channelPolylines]
      .sort((a, b) => b.maxAccumulationCells - a.maxAccumulationCells || b.lengthMeters - a.lengthMeters)
      .slice(0, MAX_HYDROLOGY_RIVER_CHANNELS);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const querySegments: HydrologyWaterQuerySegment[] = [];
    let segmentCount = 0;
    let totalLengthMeters = 0;
    let maxAccumulationCells = 0;

    for (const channel of sortedChannels) {
      const points = channel.points;
      if (points.length < 2) continue;
      maxAccumulationCells = Math.max(maxAccumulationCells, channel.maxAccumulationCells);
      let channelDistanceMeters = 0;

      for (let index = 0; index < points.length - 1; index++) {
        if (segmentCount >= MAX_HYDROLOGY_RIVER_SEGMENTS) break;
        const start = points[index];
        const end = points[index + 1];
        if (!start || !end) continue;

        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dz);
        if (length < HYDROLOGY_RIVER_MIN_SEGMENT_LENGTH_METERS) continue;

        const accumulationCells = Math.max(start.accumulationCells, end.accumulationCells, channel.maxAccumulationCells);
        const width = this.resolveHydrologyRiverWidth(accumulationCells, artifact);
        const flowFactor = this.resolveHydrologyRiverAccumulationFactor(accumulationCells, artifact);
        const halfWidth = width * 0.5;
        const normalX = -dz / length;
        const normalZ = dx / length;
        const startY = start.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
        const endY = end.elevationMeters + HYDROLOGY_RIVER_SURFACE_OFFSET_METERS;
        const vertexBase = positions.length / 3;
        const uvStartV = channelDistanceMeters / Math.max(width, 1);
        channelDistanceMeters += length;
        const uvEndV = channelDistanceMeters / Math.max(width, 1);
        const bankColor = HYDROLOGY_RIVER_BANK_COLOR.clone()
          .lerp(HYDROLOGY_RIVER_SHALLOW_COLOR, 0.18 + flowFactor * 0.22);
        const centerColor = HYDROLOGY_RIVER_SHALLOW_COLOR.clone()
          .lerp(HYDROLOGY_RIVER_DEEP_COLOR, 0.48 + flowFactor * 0.38);

        positions.push(
          start.x + normalX * halfWidth, startY, start.z + normalZ * halfWidth,
          start.x, startY, start.z,
          start.x - normalX * halfWidth, startY, start.z - normalZ * halfWidth,
          end.x + normalX * halfWidth, endY, end.z + normalZ * halfWidth,
          end.x, endY, end.z,
          end.x - normalX * halfWidth, endY, end.z - normalZ * halfWidth,
        );
        normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        uvs.push(0, uvStartV, 0.5, uvStartV, 1, uvStartV, 0, uvEndV, 0.5, uvEndV, 1, uvEndV);
        pushHydrologyRiverColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
        pushHydrologyRiverColor(colors, centerColor, HYDROLOGY_RIVER_CENTER_ALPHA);
        pushHydrologyRiverColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
        pushHydrologyRiverColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
        pushHydrologyRiverColor(colors, centerColor, HYDROLOGY_RIVER_CENTER_ALPHA);
        pushHydrologyRiverColor(colors, bankColor, HYDROLOGY_RIVER_BANK_ALPHA);
        indices.push(
          vertexBase,
          vertexBase + 3,
          vertexBase + 1,
          vertexBase + 3,
          vertexBase + 4,
          vertexBase + 1,
          vertexBase + 1,
          vertexBase + 4,
          vertexBase + 2,
          vertexBase + 4,
          vertexBase + 5,
          vertexBase + 2,
        );

        segmentCount++;
        totalLengthMeters += length;
        querySegments.push({
          startX: start.x,
          startZ: start.z,
          endX: end.x,
          endZ: end.z,
          startSurfaceY: startY,
          endSurfaceY: endY,
          halfWidth,
        });
      }
      if (segmentCount >= MAX_HYDROLOGY_RIVER_SEGMENTS) break;
    }

    if (segmentCount === 0) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    return {
      geometry,
      querySegments,
      stats: {
        channelCount: sortedChannels.filter(channel => channel.points.length >= 2).length,
        segmentCount,
        vertexCount: positions.length / 3,
        totalLengthMeters,
        maxAccumulationCells,
      },
    };
  }

  private resolveHydrologyRiverWidth(accumulationCells: number, artifact: HydrologyBakeArtifact): number {
    const cellSize = artifact.cellSizeMeters;
    const minWidth = clamp(cellSize * 0.045, 2, 4);
    const maxWidth = clamp(cellSize * 0.12, 5, 10);
    const t = this.resolveHydrologyRiverAccumulationFactor(accumulationCells, artifact);
    return minWidth + (maxWidth - minWidth) * t;
  }

  private resolveHydrologyRiverAccumulationFactor(
    accumulationCells: number,
    artifact: HydrologyBakeArtifact,
  ): number {
    const p98 = Math.max(1, artifact.thresholds.accumulationP98Cells);
    const p99 = Math.max(p98 + 1, artifact.thresholds.accumulationP99Cells);
    return clamp(
      (Math.log1p(Math.max(0, accumulationCells)) - Math.log1p(p98))
      / Math.max(0.001, Math.log1p(p99) - Math.log1p(p98)),
      0,
      1,
    );
  }

  private getHydrologyWaterSurfaceY(x: number, z: number): number | null {
    let nearest: { distanceSq: number; surfaceY: number } | null = null;
    for (const segment of this.hydrologyWaterQuerySegments) {
      const dx = segment.endX - segment.startX;
      const dz = segment.endZ - segment.startZ;
      const lengthSq = dx * dx + dz * dz;
      if (lengthSq <= 0) continue;
      const t = clamp(((x - segment.startX) * dx + (z - segment.startZ) * dz) / lengthSq, 0, 1);
      const sampleX = segment.startX + dx * t;
      const sampleZ = segment.startZ + dz * t;
      const distanceSq = (x - sampleX) ** 2 + (z - sampleZ) ** 2;
      if (distanceSq > segment.halfWidth ** 2) continue;
      const surfaceY = segment.startSurfaceY + (segment.endSurfaceY - segment.startSurfaceY) * t;
      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { distanceSq, surfaceY };
      }
    }
    return nearest?.surfaceY ?? null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pushHydrologyRiverColor(colors: number[], color: THREE.Color, alpha: number): void {
  colors.push(color.r, color.g, color.b, alpha);
}
