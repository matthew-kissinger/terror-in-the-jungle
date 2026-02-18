import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

// ---------------------------------------------------------------------------
// River data JSON shape (loaded at runtime from public/data/vietnam/)
// ---------------------------------------------------------------------------
interface RiverSegment {
  points: [number, number][];  // [worldX, worldZ] pairs
  lengthM: number;
  width: number;               // suggested width in meters
  name?: string | null;
  source?: string;
}

interface RiverDataFile {
  rivers: RiverSegment[];
}

// ---------------------------------------------------------------------------
// Shader source – fully procedural, zero textures
// ---------------------------------------------------------------------------
const RIVER_VERTEX = /* glsl */ `
uniform float uTime;

varying vec2 vUv;
varying float vFlow;  // accumulated distance along river for flow scroll

void main() {
  vUv = uv;
  vFlow = uv.y;

  vec3 pos = position;

  // Gentle vertex ripple
  float wave = sin(pos.x * 2.0 + uTime * 1.5) * 0.04
             + sin(pos.z * 3.0 + uTime * 2.0) * 0.02;
  pos.y += wave;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const RIVER_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uFlowSpeed;
uniform vec3  uShallowColor;
uniform vec3  uDeepColor;
uniform vec3  uFoamColor;
uniform float uOpacity;

varying vec2  vUv;
varying float vFlow;

#define TAU 6.28318530718

// Procedural caustic pattern (joltz0r / David Hoskins, 3 iterations)
float caustic(vec2 uv, float t) {
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y),
                 sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten),
                            p.y / (cos(i.y + tt) / inten)));
  }
  c = c / 3.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

// Sine-based UV distortion
vec2 distort(vec2 uv, float t) {
  uv.y += 0.01 * (sin(uv.x * 3.5 + t * 0.35) +
                   sin(uv.x * 7.3 + t * 0.45)) * 0.5;
  uv.x += 0.012 * (sin(uv.y * 4.0 + t * 0.50) +
                    sin(uv.y * 6.8 + t * 0.75)) * 0.5;
  return uv;
}

void main() {
  // Edge distance: 0 at edges, 1 at center
  float edgeDist = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float depth = smoothstep(0.0, 0.5, edgeDist);

  // Flow-scrolled UV
  vec2 flowUV = vec2(vUv.x, vFlow - uTime * uFlowSpeed);

  // Depth-blended water color
  vec3 col = mix(uShallowColor, uDeepColor, depth);

  // Dual-layer caustics
  float c1 = caustic(distort(flowUV * 4.0, uTime), uTime * 0.5);
  float c2 = caustic(flowUV * 3.0 + 0.5, uTime * 0.4);
  col += (c1 + c2) * 0.06 * depth;

  // Edge foam
  float foamNoise = caustic(flowUV * 8.0, uTime * 0.7);
  float foam = smoothstep(0.75, 1.0, 1.0 - edgeDist) * smoothstep(0.2, 0.5, foamNoise);
  col = mix(col, uFoamColor, foam * 0.55);

  // Fake specular shimmer
  float spec = sin(flowUV.y * 20.0 + uTime * 2.0) *
               sin(flowUV.x * 15.0 + uTime * 1.3);
  spec = pow(max(spec, 0.0), 4.0) * 0.12 * depth;
  col += spec;

  // Alpha: opaque at center, transparent at edges
  float alpha = mix(0.25, uOpacity, depth);

  gl_FragColor = vec4(col, alpha);
}
`;

// ---------------------------------------------------------------------------
// Geometry builder – extrudes a polyline into a triangle-strip ribbon
// ---------------------------------------------------------------------------
function buildRiverStripGeometry(
  points: THREE.Vector3[],
  width: number
): THREE.BufferGeometry {
  const n = points.length;
  if (n < 2) return new THREE.BufferGeometry();

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let accLen = 0;

  for (let i = 0; i < n; i++) {
    // Tangent
    const tangent = new THREE.Vector3();
    if (i < n - 1) {
      tangent.subVectors(points[i + 1], points[i]);
    } else {
      tangent.subVectors(points[i], points[i - 1]);
    }
    const segLen = tangent.length();
    tangent.normalize();

    // Cross direction (perpendicular in XZ plane)
    const cross = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const halfW = width * 0.5;

    const left  = points[i].clone().addScaledVector(cross, -halfW);
    const right = points[i].clone().addScaledVector(cross,  halfW);

    positions.push(left.x, left.y, left.z);
    positions.push(right.x, right.y, right.z);

    // UV: x across width, y along flow (normalized 0-1 not needed; raw meters works
    // for tiled caustic sampling, and flow scroll uses raw distance)
    const uvy = accLen / width; // scale so tiles are roughly square
    uvs.push(0, uvy);
    uvs.push(1, uvy);

    if (i > 0) accLen += segLen;

    if (i < n - 1) {
      const b = i * 2;
      indices.push(b, b + 1, b + 2);
      indices.push(b + 1, b + 3, b + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// ---------------------------------------------------------------------------
// RiverWaterSystem
// ---------------------------------------------------------------------------
export class RiverWaterSystem implements GameSystem {
  private scene: THREE.Scene;
  private meshes: THREE.Mesh[] = [];
  private material: THREE.ShaderMaterial | null = null;
  private active = false;

  // Height offset above terrain so rivers sit on the surface
  private readonly SURFACE_OFFSET = 0.15;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    // No-op; rivers are loaded on demand via loadRivers()
  }

  /**
   * Fetch the river JSON for the current map and build meshes.
   * Call this after the DEM provider is set so height queries work.
   */
  async loadRivers(jsonPath: string): Promise<void> {
    Logger.info('rivers', `Loading river data from ${jsonPath}...`);
    try {
      const response = await fetch(jsonPath);
      if (!response.ok) {
        Logger.warn('rivers', `River data not found (${response.status}), skipping.`);
        return;
      }
      const data: RiverDataFile = await response.json();
      this.buildMeshes(data.rivers);
      this.active = true;
      Logger.info('rivers', `Created ${this.meshes.length} river meshes from ${data.rivers.length} segments`);
    } catch (err) {
      Logger.warn('rivers', `Failed to load river data: ${err}`);
    }
  }

  private buildMeshes(rivers: RiverSegment[]): void {
    // Shared material for all river segments
    this.material = new THREE.ShaderMaterial({
      vertexShader: RIVER_VERTEX,
      fragmentShader: RIVER_FRAGMENT,
      uniforms: {
        uTime:         { value: 0 },
        uFlowSpeed:    { value: 0.12 },
        uShallowColor: { value: new THREE.Color(0.18, 0.52, 0.42) },
        uDeepColor:    { value: new THREE.Color(0.02, 0.14, 0.10) },
        uFoamColor:    { value: new THREE.Color(0.85, 0.90, 0.80) },
        uOpacity:      { value: 0.82 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const heightCache = getHeightQueryCache();

    // Batch small rivers into merged geometries to reduce draw calls.
    // Bucket: major (width >= 8) get individual meshes, small rivers are merged.
    const majorRivers: RiverSegment[] = [];
    const smallRivers: RiverSegment[] = [];

    for (const river of rivers) {
      if (river.points.length < 2) continue;
      if (river.width >= 8) {
        majorRivers.push(river);
      } else {
        smallRivers.push(river);
      }
    }

    // Build major rivers individually (few of them, long meshes)
    for (const river of majorRivers) {
      const geom = this.buildSegmentGeometry(river, heightCache);
      if (!geom) continue;
      const mesh = new THREE.Mesh(geom, this.material);
      mesh.frustumCulled = true;
      mesh.renderOrder = 1; // Render after terrain
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }

    // Merge small rivers by batches to reduce draw calls
    const BATCH_SIZE = 40;
    for (let i = 0; i < smallRivers.length; i += BATCH_SIZE) {
      const batch = smallRivers.slice(i, i + BATCH_SIZE);
      const geometries: THREE.BufferGeometry[] = [];

      for (const river of batch) {
        const geom = this.buildSegmentGeometry(river, heightCache);
        if (geom) geometries.push(geom);
      }

      if (geometries.length === 0) continue;

      const merged = this.mergeGeometries(geometries);
      // Dispose source geometries after merge
      for (const g of geometries) g.dispose();

      const mesh = new THREE.Mesh(merged, this.material);
      mesh.frustumCulled = false; // merged batch covers large area
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  private buildSegmentGeometry(
    river: RiverSegment,
    heightCache: ReturnType<typeof getHeightQueryCache>
  ): THREE.BufferGeometry | null {
    const pts: THREE.Vector3[] = [];
    for (const [wx, wz] of river.points) {
      const y = heightCache.getHeightAt(wx, wz) + this.SURFACE_OFFSET;
      pts.push(new THREE.Vector3(wx, y, wz));
    }
    if (pts.length < 2) return null;
    return buildRiverStripGeometry(pts, river.width);
  }

  /**
   * Simple geometry merge (positions + uvs + indices).
   * Avoids importing BufferGeometryUtils to keep bundle slim.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const allPos: number[] = [];
    const allUV: number[] = [];
    const allIdx: number[] = [];
    let vertexOffset = 0;

    for (const geom of geometries) {
      const pos = geom.getAttribute('position') as THREE.BufferAttribute;
      const uv = geom.getAttribute('uv') as THREE.BufferAttribute;
      const idx = geom.getIndex();
      if (!pos || !uv || !idx) continue;

      for (let i = 0; i < pos.count * 3; i++) allPos.push(pos.array[i]);
      for (let i = 0; i < uv.count * 2; i++) allUV.push(uv.array[i]);
      for (let i = 0; i < idx.count; i++) allIdx.push(idx.array[i] + vertexOffset);
      vertexOffset += pos.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(allUV, 2));
    merged.setIndex(allIdx);
    merged.computeVertexNormals();
    return merged;
  }

  update(deltaTime: number): void {
    if (!this.active || !this.material) return;
    this.material.uniforms.uTime.value += deltaTime;
  }

  /**
   * Remove all river meshes from the scene.
   */
  clear(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.length = 0;
    this.active = false;
  }

  dispose(): void {
    this.clear();
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    Logger.info('rivers', 'River water system disposed');
  }
}
