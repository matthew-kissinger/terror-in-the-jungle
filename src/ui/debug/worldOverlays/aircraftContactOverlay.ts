import * as THREE from 'three';
import type { WorldOverlay } from '../WorldOverlayRegistry';
import type { LOSAccelerator } from '../../../systems/combat/LOSAccelerator';

interface AircraftContactSource {
  getLOSAccelerator(): LOSAccelerator | null;
  sampleActiveAircraft?(): { position: THREE.Vector3; velocity: THREE.Vector3 } | null;
}

const MAGENTA = 0xff44cc;
const CAPSULE_LOOKAHEAD_SEC = 1.0;

/**
 * Magenta wireframe AABBs for every registered static LOS obstacle + a
 * sweep line projected one second along the active aircraft's velocity.
 * Rebuilds the obstacle set at 2 Hz — registrations are rare.
 */
export function createAircraftContactOverlay(source: AircraftContactSource): WorldOverlay {
  let boxHelpers: THREE.Box3Helper[] = [];
  let sweepLine: THREE.Line | null = null;
  let sweepGeom: THREE.BufferGeometry | null = null;
  let mountedGroup: THREE.Group | null = null;
  let lastRebuildMs = 0;

  return {
    id: 'aircraft-contact', label: 'Aircraft Contact', hotkey: 'C', defaultVisible: false,

    mount(group: THREE.Group): void {
      mountedGroup = group;
      sweepGeom = new THREE.BufferGeometry();
      sweepGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const sweepMat = new THREE.LineBasicMaterial({ color: MAGENTA, depthTest: false, transparent: true, opacity: 0.9 });
      sweepLine = new THREE.Line(sweepGeom, sweepMat);
      sweepLine.renderOrder = 9999;
      group.add(sweepLine);
      rebuildBoxes(source, group, boxHelpers);
      lastRebuildMs = performance.now();
    },

    unmount(): void {
      if (!mountedGroup) return;
      for (const h of boxHelpers) {
        mountedGroup.remove(h);
        (h.material as THREE.Material).dispose();
        h.geometry.dispose();
      }
      boxHelpers = [];
      if (sweepLine) {
        mountedGroup.remove(sweepLine);
        (sweepLine.material as THREE.Material).dispose();
      }
      if (sweepGeom) sweepGeom.dispose();
      sweepLine = null;
      sweepGeom = null;
      mountedGroup = null;
    },

    update(): void {
      if (!mountedGroup) return;
      const now = performance.now();
      if (now - lastRebuildMs > 500) {
        rebuildBoxes(source, mountedGroup, boxHelpers);
        lastRebuildMs = now;
      }
      updateSweep(source, sweepGeom);
    },
  };
}

function rebuildBoxes(source: AircraftContactSource, group: THREE.Group, existing: THREE.Box3Helper[]): void {
  for (const h of existing) {
    group.remove(h);
    (h.material as THREE.Material).dispose();
    h.geometry.dispose();
  }
  existing.length = 0;
  const los = source.getLOSAccelerator();
  if (!los || typeof los.iterChunkBounds !== 'function') return;
  for (const { key, bounds } of los.iterChunkBounds()) {
    if (!key.startsWith('static:')) continue;
    const helper = new THREE.Box3Helper(bounds, new THREE.Color(MAGENTA));
    (helper.material as THREE.Material).depthTest = false;
    (helper.material as THREE.Material).transparent = true;
    helper.renderOrder = 9999;
    group.add(helper);
    existing.push(helper);
  }
}

function updateSweep(source: AircraftContactSource, geom: THREE.BufferGeometry | null): void {
  if (!geom) return;
  const sample = source.sampleActiveAircraft?.();
  const pos = geom.getAttribute('position') as THREE.Float32BufferAttribute;
  const arr = pos.array as Float32Array;
  if (!sample) {
    arr.fill(0);
    pos.needsUpdate = true;
    return;
  }
  arr[0] = sample.position.x; arr[1] = sample.position.y; arr[2] = sample.position.z;
  arr[3] = sample.position.x + sample.velocity.x * CAPSULE_LOOKAHEAD_SEC;
  arr[4] = sample.position.y + sample.velocity.y * CAPSULE_LOOKAHEAD_SEC;
  arr[5] = sample.position.z + sample.velocity.z * CAPSULE_LOOKAHEAD_SEC;
  pos.needsUpdate = true;
}
