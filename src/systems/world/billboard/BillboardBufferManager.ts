import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  asin,
  atan,
  cameraPosition,
  clamp as tslClamp,
  distance,
  exp,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  length,
  max as tslMax,
  min as tslMin,
  mix,
  pow,
  reference,
  select,
  sin,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
  positionGeometry,
} from 'three/tsl';
import { Logger } from '../../../utils/Logger';
import type {
  VegetationAlphaCrop,
  VegetationAtlasProfile,
  VegetationImposterAtlasConfig,
  VegetationRepresentation,
  VegetationShaderProfile,
} from '../../../config/vegetationTypes';

const DEFAULT_BILLBOARD_FOG_DENSITY = 0.00055;
const MAX_BILLBOARD_FOG_DENSITY = 0.002;
const BILLBOARD_ALPHA_TEST = 0.25;

const clamp = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

const resolveWindStrength = (height: number, profile: VegetationAtlasProfile): number => {
  const profileMultiplier = profile === 'ground-compact'
    ? 0.55
    : profile === 'canopy-hero' || profile === 'canopy-balanced'
      ? 1.15
      : 0.85;
  return clamp(height * 0.018 * profileMultiplier, 0.08, 0.34);
};

export interface GPUVegetationConfig {
  maxInstances: number;
  texture: THREE.Texture;
  normalTexture?: THREE.Texture;
  width: number;
  height: number;
  fadeDistance: number;
  maxDistance: number;
  representation: VegetationRepresentation;
  atlasProfile: VegetationAtlasProfile;
  shaderProfile: VegetationShaderProfile;
  imposterAtlas?: VegetationImposterAtlasConfig;
}

/**
 * Per-frame lighting snapshot forwarded from AtmosphereSystem so billboard
 * vegetation shades with the same sun + hemisphere colors terrain picks up
 * through MeshStandardMaterial. Kept deliberately small — this is a cheap
 * hemispheric approximation, not a full PBR port.
 */
export interface BillboardLighting {
  sunColor: THREE.Color;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
}

interface BillboardMaterialUniform<T> {
  value: T;
}

interface BillboardMaterialUniforms {
  map: BillboardMaterialUniform<THREE.Texture>;
  normalMap: BillboardMaterialUniform<THREE.Texture>;
  normalMapEnabled: BillboardMaterialUniform<boolean>;
  imposterAtlasEnabled: BillboardMaterialUniform<boolean>;
  imposterTiles: BillboardMaterialUniform<THREE.Vector2>;
  imposterUvBounds: BillboardMaterialUniform<THREE.Vector4>;
  stableAtlasAzimuth: BillboardMaterialUniform<boolean>;
  stableAtlasColumn: BillboardMaterialUniform<number>;
  maxAtlasElevationRow: BillboardMaterialUniform<number>;
  time: BillboardMaterialUniform<number>;
  cameraPosition: BillboardMaterialUniform<THREE.Vector3>;
  fadeDistance: BillboardMaterialUniform<number>;
  maxDistance: BillboardMaterialUniform<number>;
  nearFadeDistance: BillboardMaterialUniform<number>;
  lodDistances: BillboardMaterialUniform<THREE.Vector2>;
  viewMatrix: BillboardMaterialUniform<THREE.Matrix4>;
  colorTint: BillboardMaterialUniform<THREE.Color>;
  gammaAdjust: BillboardMaterialUniform<number>;
  nearAlphaSolidDistance: BillboardMaterialUniform<number>;
  vegetationExposure: BillboardMaterialUniform<number>;
  nearLightBoostDistance: BillboardMaterialUniform<number>;
  minVegetationLight: BillboardMaterialUniform<number>;
  windStrength: BillboardMaterialUniform<number>;
  windSpeed: BillboardMaterialUniform<number>;
  windSpatialScale: BillboardMaterialUniform<number>;
  fogColor: BillboardMaterialUniform<THREE.Color>;
  fogDensity: BillboardMaterialUniform<number>;
  fogHeightFalloff: BillboardMaterialUniform<number>;
  fogStartDistance: BillboardMaterialUniform<number>;
  fogEnabled: BillboardMaterialUniform<boolean>;
  sunColor: BillboardMaterialUniform<THREE.Color>;
  skyColor: BillboardMaterialUniform<THREE.Color>;
  groundColor: BillboardMaterialUniform<THREE.Color>;
  lightingEnabled: BillboardMaterialUniform<boolean>;
}

type BillboardNodeMaterial = MeshBasicNodeMaterial & {
  uniforms: BillboardMaterialUniforms;
  isKonveyerBillboardNodeMaterial: true;
};

type TslNode = any;

const tslFloat = (value: number): TslNode => float(value) as TslNode;
const tslVec2 = (...args: TslNode[]): TslNode => (vec2 as (...values: TslNode[]) => TslNode)(...args);
const tslVec3 = (...args: TslNode[]): TslNode => (vec3 as (...values: TslNode[]) => TslNode)(...args);
const tslReference = (type: string, uniform: BillboardMaterialUniform<unknown>): TslNode => (
  reference('value', type, uniform) as TslNode
);
const tslMix = (...args: TslNode[]): TslNode => (mix as (...values: TslNode[]) => TslNode)(...args);
const tslSelect = (...args: TslNode[]): TslNode => (select as (...values: TslNode[]) => TslNode)(...args);
const tslInstancedBufferAttribute = (
  attribute: THREE.InstancedBufferAttribute,
  type: string,
): TslNode => instancedBufferAttribute(attribute, type) as TslNode;
const tslTexture = (source: THREE.Texture, sampleUv: TslNode): TslNode => texture(source, sampleUv) as TslNode;

export class GPUBillboardVegetation {
  private geometry: THREE.InstancedBufferGeometry;
  private material: BillboardNodeMaterial;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;

  // Instance data arrays
  private positions: Float32Array;
  private scales: Float32Array;
  private rotations: Float32Array;

  // Attributes
  private positionAttribute: THREE.InstancedBufferAttribute;
  private scaleAttribute: THREE.InstancedBufferAttribute;
  private rotationAttribute: THREE.InstancedBufferAttribute;

  private maxInstances: number;
  private highWaterMark = 0;
  private liveCount = 0;
  private freeSlots: Set<number> = new Set();
  private warnedCapacity = false;

  // Pending update flags for batching
  private pendingPositionUpdate = false;
  private pendingScaleUpdate = false;
  private pendingRotationUpdate = false;

  constructor(scene: THREE.Scene, config: GPUVegetationConfig) {
    this.scene = scene;
    this.maxInstances = config.maxInstances;
    const alphaCrop = config.imposterAtlas?.alphaCrop ?? { minU: 0, minV: 0, maxU: 1, maxV: 1 };

    // Create plane geometry for billboard
    const planeGeometry = new THREE.PlaneGeometry(config.width, config.height);

    // Convert to InstancedBufferGeometry
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = planeGeometry.index;
    this.geometry.attributes = planeGeometry.attributes;

    // Initialize instance arrays
    this.positions = new Float32Array(this.maxInstances * 3);
    this.scales = new Float32Array(this.maxInstances * 2);
    this.rotations = new Float32Array(this.maxInstances);

    // Create instance attributes
    this.positionAttribute = new THREE.InstancedBufferAttribute(this.positions, 3);
    this.scaleAttribute = new THREE.InstancedBufferAttribute(this.scales, 2);
    this.rotationAttribute = new THREE.InstancedBufferAttribute(this.rotations, 1);

    // Set dynamic for updates
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.scaleAttribute.setUsage(THREE.DynamicDrawUsage);
    this.rotationAttribute.setUsage(THREE.DynamicDrawUsage);

    // Add attributes to geometry
    this.geometry.setAttribute('instancePosition', this.positionAttribute);
    this.geometry.setAttribute('instanceScale', this.scaleAttribute);
    this.geometry.setAttribute('instanceRotation', this.rotationAttribute);

    this.material = createBillboardNodeMaterial(
      config,
      alphaCrop,
      this.positionAttribute,
      this.scaleAttribute,
      this.rotationAttribute,
    );

    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; // Disable frustum culling for instanced geometry
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrixWorldAutoUpdate = false;
    this.scene.add(this.mesh);
  }

  // Add instances for a chunk
  addInstances(instances: Array<{position: THREE.Vector3, scale: THREE.Vector3, rotation: number}>): number[] {
    if (instances.length === 0) return [];
    
    const allocatedIndices: number[] = [];
    const startLiveCount = this.liveCount;

    for (const instance of instances) {
      let index: number;

      if (this.freeSlots.size > 0) {
        // Get any free slot (Set iteration is efficient for this)
        const it = this.freeSlots.values();
        index = it.next().value as number;
        this.freeSlots.delete(index);
      } else {
        if (this.highWaterMark >= this.maxInstances) {
          if (!this.warnedCapacity) {
            Logger.warn('vegetation', `Max instances reached (${this.highWaterMark}/${this.maxInstances})`);
            this.warnedCapacity = true;
          }
          break;
        }
        index = this.highWaterMark;
        this.highWaterMark++;
      }

      const i3 = index * 3;
      const i2 = index * 2;

      this.positions[i3] = instance.position.x;
      this.positions[i3 + 1] = instance.position.y;
      this.positions[i3 + 2] = instance.position.z;

      this.scales[i2] = instance.scale.x;
      this.scales[i2 + 1] = instance.scale.y;

      this.rotations[index] = instance.rotation;

      allocatedIndices.push(index);
      this.liveCount++;
    }

    if (allocatedIndices.length > 0) {
      this.pendingPositionUpdate = true;
      this.pendingScaleUpdate = true;
      this.pendingRotationUpdate = true;
    }

    this.geometry.instanceCount = this.highWaterMark;

    const addedCount = this.liveCount - startLiveCount;
    if (addedCount > 0) {
      Logger.debug('vegetation', `Allocated ${addedCount} instances (${startLiveCount} → ${this.liveCount} / ${this.maxInstances})`);
    }

    return allocatedIndices;
  }

  // Remove instances by indices
  removeInstances(indices: number[]): void {
    if (indices.length === 0) return;
    
    let removedCount = 0;
    for (const index of indices) {
      if (index >= this.highWaterMark) continue;

      const i2 = index * 2;
      if (this.scales[i2] === 0 && this.scales[i2 + 1] === 0) {
        continue;
      }

      this.scales[i2] = 0;
      this.scales[i2 + 1] = 0;
      this.freeSlots.add(index);
      if (this.liveCount > 0) {
        this.liveCount--;
      }
      removedCount++;
    }

    if (removedCount > 0) {
      this.pendingScaleUpdate = true;
      this.compactHighWaterMark();
    }

    Logger.debug('vegetation', `Freed ${indices.length} instances (live=${this.liveCount}, reserved=${this.highWaterMark})`);
  }

  private compactHighWaterMark(): void {
    let compacted = false;
    while (this.highWaterMark > 0) {
      const lastIndex = this.highWaterMark - 1;
      const i2 = lastIndex * 2;
      if (this.scales[i2] === 0 && this.scales[i2 + 1] === 0) {
        this.highWaterMark--;
        this.freeSlots.delete(lastIndex);
        compacted = true;
      } else {
        break;
      }
    }

    if (compacted) {
      this.geometry.instanceCount = this.highWaterMark;
    }
    
    if (this.highWaterMark < this.maxInstances) {
      this.warnedCapacity = false;
    }
  }

  // Get instance positions for area clearing
  getInstancePositions(): Float32Array {
    return this.positions;
  }

  // Reset all instances (for full cleanup)
  reset(): void {
    this.highWaterMark = 0;
    this.liveCount = 0;
    this.freeSlots.clear();
    this.geometry.instanceCount = 0;
    this.pendingPositionUpdate = true;
    this.pendingScaleUpdate = true;
    this.pendingRotationUpdate = true;
  }

  // Update uniforms (called every frame)
  update(
    camera: THREE.Camera,
    time: number,
    fog?: THREE.FogExp2 | null,
    lighting?: BillboardLighting | null,
  ): void {
    // Apply batched buffer updates
    if (this.pendingPositionUpdate) {
      this.positionAttribute.needsUpdate = true;
      this.pendingPositionUpdate = false;
    }
    if (this.pendingScaleUpdate) {
      this.scaleAttribute.needsUpdate = true;
      this.pendingScaleUpdate = false;
    }
    if (this.pendingRotationUpdate) {
      this.rotationAttribute.needsUpdate = true;
      this.pendingRotationUpdate = false;
    }

    this.material.uniforms.cameraPosition.value.copy(camera.position);
    this.material.uniforms.time.value = time;
    if (camera instanceof THREE.PerspectiveCamera) {
      this.material.uniforms.viewMatrix.value.copy(camera.matrixWorldInverse);
    }

    // Enable height fog when scene has fog (use our custom height fog parameters)
    if (fog) {
      this.material.uniforms.fogEnabled.value = true;
      this.material.uniforms.fogColor.value.copy(fog.color);
      const sceneFogDensity = Number.isFinite(fog.density)
        ? fog.density
        : DEFAULT_BILLBOARD_FOG_DENSITY;
      this.material.uniforms.fogDensity.value = clamp(
        sceneFogDensity,
        0,
        MAX_BILLBOARD_FOG_DENSITY,
      );
    } else {
      this.material.uniforms.fogEnabled.value = false;
      this.material.uniforms.fogDensity.value = DEFAULT_BILLBOARD_FOG_DENSITY;
    }

    // Atmosphere lighting — forward the same sun/hemisphere colors terrain's
    // MeshStandardMaterial samples via renderer.moonLight + hemisphereLight,
    // so vegetation and terrain darken / warm together across TOD and storms.
    if (lighting) {
      this.material.uniforms.sunColor.value.copy(lighting.sunColor);
      this.material.uniforms.skyColor.value.copy(lighting.skyColor);
      this.material.uniforms.groundColor.value.copy(lighting.groundColor);
      this.material.uniforms.lightingEnabled.value = true;
    } else {
      this.material.uniforms.lightingEnabled.value = false;
    }
  }

  // Get current instance count
  getInstanceCount(): number {
    return this.liveCount;
  }

  getHighWaterMark(): number {
    return this.highWaterMark;
  }

  getFreeSlotCount(): number {
    return this.freeSlots.size;
  }

  // Dispose resources
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.mesh);
  }
}

function createBillboardNodeMaterial(
  config: GPUVegetationConfig,
  alphaCrop: Required<VegetationAlphaCrop>,
  positionAttribute: THREE.InstancedBufferAttribute,
  scaleAttribute: THREE.InstancedBufferAttribute,
  rotationAttribute: THREE.InstancedBufferAttribute,
): BillboardNodeMaterial {
  const uniforms: BillboardMaterialUniforms = {
    map: { value: config.texture },
    normalMap: { value: config.normalTexture ?? config.texture },
    normalMapEnabled: { value: Boolean(config.normalTexture && config.shaderProfile === 'normal-lit') },
    imposterAtlasEnabled: { value: Boolean(config.imposterAtlas) },
    imposterTiles: { value: new THREE.Vector2(config.imposterAtlas?.tilesX ?? 1, config.imposterAtlas?.tilesY ?? 1) },
    imposterUvBounds: { value: new THREE.Vector4(alphaCrop.minU, alphaCrop.minV, alphaCrop.maxU, alphaCrop.maxV) },
    stableAtlasAzimuth: { value: Number.isFinite(config.imposterAtlas?.stableAzimuthColumn) },
    stableAtlasColumn: { value: config.imposterAtlas?.stableAzimuthColumn ?? 0 },
    maxAtlasElevationRow: { value: config.imposterAtlas?.maxElevationRow ?? -1 },
    time: { value: 0 },
    cameraPosition: { value: new THREE.Vector3() },
    fadeDistance: { value: config.fadeDistance },
    maxDistance: { value: config.maxDistance },
    // Pixel Forge vegetation is currently impostor-only at close range.
    // A near fade without a close mesh replacement makes plants disappear
    // when the player walks into them, so keep this disabled until a
    // manifest-backed close LOD exists.
    nearFadeDistance: { value: 0.0 },
    lodDistances: { value: new THREE.Vector2(150, 300) },
    viewMatrix: { value: new THREE.Matrix4() },
    colorTint: { value: new THREE.Color(1.04, 1.08, 1.0) },
    gammaAdjust: { value: 1.0 },
    nearAlphaSolidDistance: { value: 30.0 },
    vegetationExposure: { value: 1.18 },
    nearLightBoostDistance: { value: 85.0 },
    minVegetationLight: { value: 0.68 },
    windStrength: { value: resolveWindStrength(config.height, config.atlasProfile) },
    windSpeed: { value: 1.15 },
    windSpatialScale: { value: 0.055 },
    fogColor: { value: new THREE.Color(0x5a7a6a) },
    fogDensity: { value: DEFAULT_BILLBOARD_FOG_DENSITY },
    fogHeightFalloff: { value: 0.03 },
    fogStartDistance: { value: 100.0 },
    fogEnabled: { value: false },
    sunColor: { value: new THREE.Color(1, 1, 1) },
    skyColor: { value: new THREE.Color(0.7, 0.8, 1.0) },
    groundColor: { value: new THREE.Color(0.3, 0.3, 0.25) },
    lightingEnabled: { value: false },
  };

  const material = new MeshBasicNodeMaterial({
    name: 'konveyer-vegetation-billboard-node-material',
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    alphaTest: BILLBOARD_ALPHA_TEST,
    forceSinglePass: true,
  }) as BillboardNodeMaterial;
  material.isKonveyerBillboardNodeMaterial = true;
  material.uniforms = uniforms;
  material.fog = false;
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;

  const instancePosition = tslInstancedBufferAttribute(positionAttribute, 'vec3');
  const instanceScale = tslInstancedBufferAttribute(scaleAttribute, 'vec2');
  const instanceRotation = tslInstancedBufferAttribute(rotationAttribute, 'float');

  const toCamera = cameraPosition.sub(instancePosition);
  const toCameraXZ = tslVec3(toCamera.x, 0, toCamera.z);
  const xzLength = tslMax(length(toCameraXZ), tslFloat(0.001));
  const forward = toCameraXZ.div(xzLength);
  const right = tslVec3(forward.z, 0, forward.x.negate());
  const up = tslVec3(0, 1, 0);
  const scaledX = positionGeometry.x.mul(instanceScale.x);
  const scaledY = positionGeometry.y.mul(instanceScale.y);
  const timeNode = tslReference('float', uniforms.time);
  const windStrength = tslReference('float', uniforms.windStrength);
  const windSpeed = tslReference('float', uniforms.windSpeed);
  const windSpatialScale = tslReference('float', uniforms.windSpatialScale);
  const lodDistances = tslReference('vec2', uniforms.lodDistances);
  const maxDistance = tslReference('float', uniforms.maxDistance);
  const fadeDistance = tslReference('float', uniforms.fadeDistance);
  const nearFadeDistance = tslReference('float', uniforms.nearFadeDistance);
  const cameraDistance = distance(cameraPosition, instancePosition);
  const lodFactor = select(
    cameraDistance.lessThan(lodDistances.x),
    tslFloat(0),
    select(cameraDistance.lessThan(lodDistances.y), tslFloat(0.5), tslFloat(1)),
  );
  const windPhase = instancePosition.x.mul(windSpatialScale)
    .add(instancePosition.z.mul(windSpatialScale.mul(1.37)));
  const primarySway = sin(timeNode.mul(windSpeed).add(windPhase));
  const gustSway = sin(timeNode.mul(windSpeed.mul(0.43)).add(windPhase.mul(1.91)).add(instanceRotation));
  const lodWindScale = tslFloat(1).sub(lodFactor.mul(0.7));
  const sway = primarySway.add(gustSway.mul(0.35)).mul(windStrength).mul(lodWindScale);
  const swayWeight = uv().y.mul(uv().y);

  material.positionNode = instancePosition
    .add(right.mul(scaledX.add(sway.mul(swayWeight))))
    .add(up.mul(scaledY));

  const atlas = createBillboardAtlasNodes(config.texture, config.normalTexture ?? config.texture, uniforms, instancePosition);
  const texColor = atlas.color as TslNode;
  const normalColor = atlas.normal as TslNode;
  const fadeFactor = createBillboardFadeNode(cameraDistance, nearFadeDistance, fadeDistance, maxDistance, lodFactor);
  const nearAlphaSolidDistance = tslReference('float', uniforms.nearAlphaSolidDistance);
  const nearAlphaBlend = tslFloat(1).sub(
    smoothstep(
      nearAlphaSolidDistance,
      nearAlphaSolidDistance.add(25),
      cameraDistance,
    ),
  );
  const hardenedAlpha = mix(
    texColor.a,
    tslFloat(1),
    smoothstep(tslFloat(BILLBOARD_ALPHA_TEST), tslFloat(0.65), texColor.a),
  ) as TslNode;
  const vegetationAlpha = mix(texColor.a, hardenedAlpha, nearAlphaBlend) as TslNode;
  const finalAlpha = vegetationAlpha.mul(fadeFactor);

  const gammaAdjust = tslReference('float', uniforms.gammaAdjust);
  const colorTint = tslReference('color', uniforms.colorTint);
  const vegetationExposure = tslReference('float', uniforms.vegetationExposure);
  const nearLightBoostDistance = tslReference('float', uniforms.nearLightBoostDistance);
  const nearLightBoost = tslFloat(1).add(
    tslFloat(0.14).mul(tslFloat(1).sub(smoothstep(tslFloat(0), nearLightBoostDistance, cameraDistance))),
  );
  const litColor = createBillboardLightingNode(
    pow(texColor.rgb.mul(colorTint), tslVec3(gammaAdjust)),
    normalColor,
    atlas.sampleUv,
    cameraDistance,
    uniforms,
  );
  const foggedColor = createBillboardFogNode(
    litColor.mul(vegetationExposure).mul(nearLightBoost),
    texColor.a,
    instancePosition.y.add(uv().y.mul(instanceScale.y)),
    cameraDistance,
    uniforms,
  );

  material.colorNode = foggedColor.mul(finalAlpha);
  material.opacityNode = finalAlpha;
  material.alphaTestNode = tslFloat(BILLBOARD_ALPHA_TEST);

  return material;
}

function createBillboardAtlasNodes(
  colorTexture: THREE.Texture,
  normalTexture: THREE.Texture,
  uniforms: BillboardMaterialUniforms,
  instancePosition: TslNode,
) {
  const baseUv = uv() as TslNode;
  const bounds = tslReference('vec4', uniforms.imposterUvBounds);
  const croppedUv = mix(bounds.xy, bounds.zw, baseUv) as TslNode;
  const atlasEnabled = tslReference('bool', uniforms.imposterAtlasEnabled);
  const tiles = tslReference('vec2', uniforms.imposterTiles);
  const invTiles = tiles.reciprocal();
  const toCamera = cameraPosition.sub(instancePosition);
  const fullDistance = tslMax(length(toCamera), tslFloat(0.0001));
  const elevation = asin(tslClamp(toCamera.y.div(fullDistance), tslFloat(0), tslFloat(1)));
  const rows = tiles.y;
  const elevationDegrees = elevation.mul(57.295779513);
  const rowForTwo = select(elevationDegrees.greaterThanEqual(35), tslFloat(0), tslFloat(1));
  const rowForFour = select(
    elevationDegrees.greaterThanEqual(72.5),
    tslFloat(0),
    select(
      elevationDegrees.greaterThanEqual(45),
      tslMin(tslFloat(1), rows.sub(1)),
      select(elevationDegrees.greaterThanEqual(17.5), tslMin(tslFloat(2), rows.sub(1)), rows.sub(1)),
    ),
  );
  const atlasRow = select(rows.lessThanEqual(1.5), tslFloat(0), select(rows.lessThan(3), rowForTwo, rowForFour));
  const maxAtlasElevationRow = tslReference('float', uniforms.maxAtlasElevationRow);
  const tileY = select(
    maxAtlasElevationRow.greaterThanEqual(0),
    tslMin(atlasRow, maxAtlasElevationRow),
    atlasRow,
  );
  const stableAtlasAzimuth = tslReference('bool', uniforms.stableAtlasAzimuth);
  const stableAtlasColumn = tslReference('float', uniforms.stableAtlasColumn);
  const stableTileX = tslClamp(floor(stableAtlasColumn.add(0.5)), tslFloat(0), tiles.x.sub(1));
  const azimuthRaw = atan(toCamera.z, toCamera.x);
  const azimuth = select(azimuthRaw.lessThan(0), azimuthRaw.add(6.283185307), azimuthRaw);
  const azimuthTile = azimuth.div(6.283185307).mul(tiles.x);
  const dynamicTileX = floor(azimuthTile).mod(tiles.x);
  const dynamicNextTileX = dynamicTileX.add(1).mod(tiles.x);
  const tileX = select(stableAtlasAzimuth, stableTileX, dynamicTileX) as TslNode;
  const nextTileX = select(stableAtlasAzimuth, stableTileX, dynamicNextTileX) as TslNode;
  const atlasBlend = select(
    stableAtlasAzimuth,
    tslFloat(0),
    smoothstep(tslFloat(0), tslFloat(1), fract(azimuthTile) as TslNode),
  ) as TslNode;
  const sampleUv = select(
    atlasEnabled,
    tslVec2(
      tileX.add(croppedUv.x).mul(invTiles.x),
      tslFloat(1).sub(invTiles.y).sub(tileY.mul(invTiles.y)).add(croppedUv.y.mul(invTiles.y)),
    ),
    croppedUv,
  ) as TslNode;
  const nextSampleUv = select(
    atlasEnabled,
    tslVec2(
      nextTileX.add(croppedUv.x).mul(invTiles.x),
      tslFloat(1).sub(invTiles.y).sub(tileY.mul(invTiles.y)).add(croppedUv.y.mul(invTiles.y)),
    ),
    croppedUv,
  ) as TslNode;
  const shouldBlend = atlasEnabled.and(tiles.x.greaterThan(1.5));
  const color = mix(
    tslTexture(colorTexture, sampleUv),
    tslTexture(colorTexture, nextSampleUv),
    select(shouldBlend, atlasBlend, tslFloat(0)),
  ) as TslNode;
  const normal = mix(
    tslTexture(normalTexture, sampleUv),
    tslTexture(normalTexture, nextSampleUv),
    select(shouldBlend, atlasBlend, tslFloat(0)),
  ) as TslNode;

  return { color, normal, sampleUv };
}

function createBillboardFadeNode(
  cameraDistance: TslNode,
  nearFadeDistance: TslNode,
  fadeDistance: TslNode,
  maxDistance: TslNode,
  lodFactor: TslNode,
) {
  const nearFade = select(
    nearFadeDistance.greaterThan(0.001),
    smoothstep(nearFadeDistance.mul(0.55), nearFadeDistance, cameraDistance),
    tslFloat(1),
  );
  const farFade = select(
    cameraDistance.greaterThan(fadeDistance),
    tslFloat(1).sub(smoothstep(fadeDistance, maxDistance, cameraDistance)),
    tslFloat(1),
  );
  const lodFade = tslFloat(1).sub(lodFactor.mul(0.3));
  return nearFade.mul(farFade).mul(lodFade);
}

function createBillboardLightingNode(
  baseColor: TslNode,
  normalColor: TslNode,
  _sampleUv: TslNode,
  cameraDistance: TslNode,
  uniforms: BillboardMaterialUniforms,
) {
  const lightingEnabled = tslReference('bool', uniforms.lightingEnabled);
  const normalMapEnabled = tslReference('bool', uniforms.normalMapEnabled);
  const sunColor = tslReference('color', uniforms.sunColor);
  const skyColor = tslReference('color', uniforms.skyColor);
  const groundColor = tslReference('color', uniforms.groundColor);
  const minVegetationLight = tslReference('float', uniforms.minVegetationLight);
  const ambient = mix(groundColor, skyColor, tslFloat(0.5).add(uv().y.mul(0.5)));
  const hemiLight = ambient.add(sunColor.mul(0.35));
  const imposterNormal = normalColor.rgb.mul(2).sub(1).normalize();
  const captureSun = tslVec3(0.35, 0.65, 0.68).normalize();
  const ndotl = tslMax(imposterNormal.dot(captureSun), tslFloat(0));
  const normalAmbient = mix(
    groundColor,
    skyColor,
    tslFloat(0.62).add(tslFloat(0.38).mul(tslClamp(imposterNormal.y, tslFloat(-1), tslFloat(1)))),
  );
  const normalLight = normalAmbient.add(sunColor.mul(tslFloat(0.28).add(tslFloat(0.50).mul(ndotl))));
  const selectedLight = select(normalMapEnabled, normalLight, hemiLight);
  const light = tslMax(selectedLight, tslVec3(minVegetationLight));
  const shaded = baseColor.mul(light);

  return select(lightingEnabled, shaded, baseColor).mul(
    tslFloat(1).add(tslFloat(0).mul(cameraDistance)),
  );
}

function createBillboardFogNode(
  baseColor: TslNode,
  alpha: TslNode,
  worldY: TslNode,
  cameraDistance: TslNode,
  uniforms: BillboardMaterialUniforms,
) {
  const fogEnabled = tslReference('bool', uniforms.fogEnabled);
  const fogColor = tslReference('color', uniforms.fogColor);
  const fogDensity = tslReference('float', uniforms.fogDensity);
  const fogHeightFalloff = tslReference('float', uniforms.fogHeightFalloff);
  const fogStartDistance = tslReference('float', uniforms.fogStartDistance);
  const heightFactor = exp(fogHeightFalloff.negate().mul(tslMax(tslFloat(0), worldY)));
  const effectiveDistance = tslMax(tslFloat(0), cameraDistance.sub(fogStartDistance));
  const distanceFactor = tslFloat(1).sub(exp(fogDensity.negate().mul(effectiveDistance)));
  const fogFactor = tslClamp(heightFactor.mul(distanceFactor), tslFloat(0), tslFloat(1));
  return tslSelect(fogEnabled, tslMix(baseColor, fogColor, fogFactor.mul(alpha)), baseColor);
}
