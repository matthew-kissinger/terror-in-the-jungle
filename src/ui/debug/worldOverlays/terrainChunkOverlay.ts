import * as THREE from 'three';
import type { WorldOverlay } from '../WorldOverlayRegistry';

const CYAN = 0x22eedd;
const UPDATE_INTERVAL_MS = 250;
const MAX_TILES = 2048;

interface TerrainChunkSource {
  getActiveTiles(): ReadonlyArray<{ x: number; z: number; size: number; lodLevel: number }>;
  getHeightAt(x: number, z: number): number;
}

/** CDLOD tile selection rendered as cyan wireframe squares at ground level. Rebuilds at 4 Hz. */
export function createTerrainChunkOverlay(source: TerrainChunkSource): WorldOverlay {
  let lines: THREE.LineSegments | null = null;
  let positionAttr: THREE.Float32BufferAttribute | null = null;
  let mountedGroup: THREE.Group | null = null;
  // -Infinity ensures the first update() always runs. Using 0 is unsafe because
  // performance.now() can be <250ms in a fresh process (observed in CI), which
  // would trip the throttle and skip the first draw.
  let lastUpdateMs = Number.NEGATIVE_INFINITY;

  return {
    id: 'terrain-chunks', label: 'Terrain Chunks', hotkey: 'X', defaultVisible: false,

    mount(group: THREE.Group): void {
      mountedGroup = group;
      const geom = new THREE.BufferGeometry();
      positionAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_TILES * 8 * 3), 3);
      positionAttr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('position', positionAttr);
      geom.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55, depthTest: false });
      lines = new THREE.LineSegments(geom, mat);
      lines.renderOrder = 9998;
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
      const limit = Math.min(MAX_TILES, tiles.length);
      for (let i = 0; i < limit; i++) {
        const t = tiles[i];
        const half = t.size * 0.5;
        const y = source.getHeightAt(t.x, t.z) + 0.5;
        const minX = t.x - half, maxX = t.x + half;
        const minZ = t.z - half, maxZ = t.z + half;
        pushSeg(arr, seg++, minX, y, minZ, maxX, y, minZ);
        pushSeg(arr, seg++, maxX, y, minZ, maxX, y, maxZ);
        pushSeg(arr, seg++, maxX, y, maxZ, minX, y, maxZ);
        pushSeg(arr, seg++, minX, y, maxZ, minX, y, minZ);
      }
      positionAttr.needsUpdate = true;
      lines.geometry.setDrawRange(0, seg * 2);
    },
  };
}

function pushSeg(arr: Float32Array, segIndex: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const base = segIndex * 6;
  arr[base] = x0; arr[base + 1] = y0; arr[base + 2] = z0;
  arr[base + 3] = x1; arr[base + 4] = y1; arr[base + 5] = z1;
}
