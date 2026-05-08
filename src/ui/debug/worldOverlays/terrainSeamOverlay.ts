import * as THREE from 'three';
import type { WorldOverlay } from '../WorldOverlayRegistry';

const RED = 0xff3322;
const UPDATE_INTERVAL_MS = 250;
const MAX_SEGMENTS = 4096;
const MORPH_DELTA_THRESHOLD = 0.05;

interface TerrainSeamSource {
  getActiveTiles(): ReadonlyArray<{ x: number; z: number; size: number; lodLevel: number; morphFactor: number }>;
  getHeightAt(x: number, z: number): number;
}

/**
 * Highlights at-risk CDLOD seams in red: adjacent tile pairs whose LOD
 * level differs OR whose morph-factor delta exceeds 0.05. Companion to
 * `terrainChunkOverlay` for cycle-2026-05-08 seam diagnostics. Updates
 * at 4 Hz; allocates GPU verts only for seams that actually need
 * attention so cost scales with regression.
 */
export function createTerrainSeamOverlay(source: TerrainSeamSource): WorldOverlay {
  let lines: THREE.LineSegments | null = null;
  let positionAttr: THREE.Float32BufferAttribute | null = null;
  let mountedGroup: THREE.Group | null = null;
  let lastUpdateMs = Number.NEGATIVE_INFINITY;

  return {
    id: 'terrain-seams', label: 'Terrain Seams', hotkey: 'Y', defaultVisible: false,

    mount(group: THREE.Group): void {
      mountedGroup = group;
      const geom = new THREE.BufferGeometry();
      positionAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_SEGMENTS * 2 * 3), 3);
      positionAttr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('position', positionAttr);
      geom.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0.85, depthTest: false });
      lines = new THREE.LineSegments(geom, mat);
      lines.renderOrder = 9999;
      group.add(lines);
    },

    unmount(): void {
      if (lines && mountedGroup) {
        mountedGroup.remove(lines);
        lines.geometry.dispose();
        (lines.material as THREE.Material).dispose();
      }
      lines = null;
      positionAttr = null;
      mountedGroup = null;
    },

    update(): void {
      if (!lines || !positionAttr) return;
      const now = performance.now();
      if (now - lastUpdateMs < UPDATE_INTERVAL_MS) return;
      lastUpdateMs = now;

      const tiles = source.getActiveTiles();
      const arr = positionAttr.array as Float32Array;
      let seg = 0;
      const len = tiles.length;
      for (let i = 0; i < len && seg < MAX_SEGMENTS; i++) {
        const a = tiles[i];
        for (let j = i + 1; j < len && seg < MAX_SEGMENTS; j++) {
          const b = tiles[j];
          const edge = sharedEdgeBetween(a, b);
          if (!edge) continue;
          if (a.lodLevel === b.lodLevel && Math.abs(a.morphFactor - b.morphFactor) <= MORPH_DELTA_THRESHOLD) continue;
          const y0 = source.getHeightAt(edge.x0, edge.z0) + 1.0;
          const y1 = source.getHeightAt(edge.x1, edge.z1) + 1.0;
          const base = seg * 6;
          arr[base] = edge.x0; arr[base + 1] = y0; arr[base + 2] = edge.z0;
          arr[base + 3] = edge.x1; arr[base + 4] = y1; arr[base + 5] = edge.z1;
          seg++;
        }
      }
      positionAttr.needsUpdate = true;
      lines.geometry.setDrawRange(0, seg * 2);
    },
  };
}

interface SharedEdge { x0: number; z0: number; x1: number; z1: number }

function sharedEdgeBetween(
  a: { x: number; z: number; size: number },
  b: { x: number; z: number; size: number },
): SharedEdge | null {
  const halfA = a.size * 0.5;
  const halfB = b.size * 0.5;
  const aMinX = a.x - halfA, aMaxX = a.x + halfA, aMinZ = a.z - halfA, aMaxZ = a.z + halfA;
  const bMinX = b.x - halfB, bMaxX = b.x + halfB, bMinZ = b.z - halfB, bMaxZ = b.z + halfB;
  const eps = 1e-3;
  if (Math.abs(aMaxX - bMinX) < eps || Math.abs(bMaxX - aMinX) < eps) {
    const x = Math.abs(aMaxX - bMinX) < eps ? aMaxX : aMinX;
    const z0 = Math.max(aMinZ, bMinZ), z1 = Math.min(aMaxZ, bMaxZ);
    if (z1 > z0 + 1e-6) return { x0: x, z0, x1: x, z1 };
  }
  if (Math.abs(aMaxZ - bMinZ) < eps || Math.abs(bMaxZ - aMinZ) < eps) {
    const z = Math.abs(aMaxZ - bMinZ) < eps ? aMaxZ : aMinZ;
    const x0 = Math.max(aMinX, bMinX), x1 = Math.min(aMaxX, bMaxX);
    if (x1 > x0 + 1e-6) return { x0, z0: z, x1, z1: z };
  }
  return null;
}
