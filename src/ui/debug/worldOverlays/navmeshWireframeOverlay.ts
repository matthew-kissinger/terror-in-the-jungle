import * as THREE from 'three';
import type { WorldOverlay } from '../WorldOverlayRegistry';

/** Read-surface needed from the NavmeshSystem. Optional so tests can fake it. */
export interface NavmeshHandle {
  getNavMesh?(): unknown | null;
  isReady?(): boolean;
}

/**
 * Renders the current navmesh as a 50%-opacity green wireframe. Falls back to
 * a tiny placeholder cross at origin when the NavMesh / helper module is
 * unavailable so the overlay surfaces its failure visually.
 */
export function createNavmeshWireframeOverlay(handle: NavmeshHandle): WorldOverlay {
  let helper: THREE.Object3D | null = null;
  let placeholder: THREE.LineSegments | null = null;
  let mountedGroup: THREE.Group | null = null;

  return {
    id: 'navmesh-wireframe',
    label: 'Navmesh Wireframe',
    hotkey: 'N',
    defaultVisible: false,

    async mount(group: THREE.Group): Promise<void> {
      mountedGroup = group;
      const navMesh = handle.getNavMesh?.();
      if (!navMesh || !handle.isReady?.()) {
        placeholder = makePlaceholder();
        group.add(placeholder);
        return;
      }
      try {
        const three = await import('@recast-navigation/three');
        const mat = new THREE.MeshBasicMaterial({
          color: 0x33dd66, transparent: true, opacity: 0.5, wireframe: true, depthWrite: false,
        });
        const HelperCtor = (three as unknown as {
          NavMeshHelper: new (nm: unknown, opts?: { navMeshMaterial?: THREE.Material }) => THREE.Object3D;
        }).NavMeshHelper;
        helper = new HelperCtor(navMesh, { navMeshMaterial: mat });
        if (mountedGroup) mountedGroup.add(helper);
      } catch {
        placeholder = makePlaceholder();
        group.add(placeholder);
      }
    },

    unmount(): void {
      if (helper && mountedGroup) {
        mountedGroup.remove(helper);
        disposeTree(helper);
      }
      if (placeholder && mountedGroup) {
        mountedGroup.remove(placeholder);
        placeholder.geometry.dispose();
        (placeholder.material as THREE.Material).dispose();
      }
      helper = null;
      placeholder = null;
      mountedGroup = null;
    },
  };
}

function makePlaceholder(): THREE.LineSegments {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, 0.1, 0, 1, 0.1, 0, 0, 0.1, -1, 0, 0.1, 1,
  ], 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x33dd66, transparent: true, opacity: 0.5 });
  return new THREE.LineSegments(geom, mat);
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }
  });
}
