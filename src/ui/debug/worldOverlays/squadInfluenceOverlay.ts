import * as THREE from 'three';
import type { WorldOverlay } from '../WorldOverlayRegistry';
import type { InfluenceCell } from '../../../systems/combat/InfluenceMapGrid';

const OVERLAY_RADIUS = 400;
const UPDATE_INTERVAL_MS = 500;
const CELL_HEIGHT_OFFSET = 1.0;

export interface InfluenceSource {
  getInfluenceGrid(): {
    grid: ReadonlyArray<ReadonlyArray<InfluenceCell>>;
    gridSize: number;
    cellSize: number;
    worldOffset: THREE.Vector2;
  } | null;
  getCameraPosition(): THREE.Vector3;
}

/**
 * Ground-plane grid colored by influence score (R = threat, G = opportunity,
 * B = cover). InstancedMesh so it's one draw call regardless of cell count.
 * Clipped to a 400m radius around the camera, updated at 2 Hz (matches
 * InfluenceMapSystem refresh).
 */
export function createSquadInfluenceOverlay(source: InfluenceSource): WorldOverlay {
  let mesh: THREE.InstancedMesh | null = null;
  let mountedGroup: THREE.Group | null = null;
  let lastUpdateMs = 0;

  return {
    id: 'squad-influence', label: 'Squad Influence', hotkey: 'I', defaultVisible: false,

    mount(group: THREE.Group): void {
      mountedGroup = group;
      const geom = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.35, depthWrite: false,
        vertexColors: true, side: THREE.DoubleSide,
      });
      const grid = source.getInfluenceGrid();
      const maxInstances = grid ? Math.min(grid.gridSize * grid.gridSize, 4096) : 0;
      if (maxInstances === 0) {
        const placeholder = new THREE.Mesh(geom, mat);
        placeholder.visible = false;
        group.add(placeholder);
        return;
      }
      mesh = new THREE.InstancedMesh(geom, mat, maxInstances);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
      mesh.count = 0;
      mesh.frustumCulled = false;
      group.add(mesh);
    },

    unmount(): void {
      if (mesh && mountedGroup) {
        mountedGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      mesh = null;
      mountedGroup = null;
    },

    update(): void {
      if (!mesh) return;
      const now = performance.now();
      if (now - lastUpdateMs < UPDATE_INTERVAL_MS) return;
      lastUpdateMs = now;

      const grid = source.getInfluenceGrid();
      if (!grid) { mesh.count = 0; return; }
      const cam = source.getCameraPosition();
      const radiusSq = OVERLAY_RADIUS * OVERLAY_RADIUS;

      const m = new THREE.Matrix4();
      const c = new THREE.Color();
      let i = 0;
      for (let x = 0; x < grid.gridSize && i < mesh.instanceMatrix.count; x++) {
        for (let z = 0; z < grid.gridSize && i < mesh.instanceMatrix.count; z++) {
          const cell = grid.grid[x][z];
          const wx = cell.position.x + grid.cellSize * 0.5;
          const wz = cell.position.y + grid.cellSize * 0.5;
          const dx = wx - cam.x;
          const dz = wz - cam.z;
          if (dx * dx + dz * dz > radiusSq) continue;
          m.makeScale(grid.cellSize * 0.9, 1, grid.cellSize * 0.9);
          m.setPosition(wx, CELL_HEIGHT_OFFSET, wz);
          mesh.setMatrixAt(i, m);
          c.setRGB(
            Math.min(1, cell.threatLevel),
            Math.min(1, cell.opportunityLevel),
            Math.min(1, cell.coverValue * 0.4),
          );
          mesh.setColorAt(i, c);
          i++;
        }
      }
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
