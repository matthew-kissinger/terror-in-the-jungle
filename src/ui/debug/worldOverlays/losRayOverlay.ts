import * as THREE from 'three';
import type { WorldOverlay } from '../WorldOverlayRegistry';
import type { Combatant } from '../../../systems/combat/types';

const MAX_RAYS = 100;
const UPDATE_INTERVAL_MS = 100;
const CLEAR_COLOR = 0x33ff66;
const BLOCKED_COLOR = 0xff3333;

interface LosRaySource {
  combatants: Map<string, Combatant>;
  getCameraPosition(): THREE.Vector3;
}

/**
 * Combatant→target rays colored green (live target, clear LOS implied) or red
 * (last-known target only, suspected blocked). Capped at 100 nearest-to-camera,
 * updated at 10 Hz to avoid frame-sync iteration of all combatants.
 */
export function createLosRayOverlay(source: LosRaySource): WorldOverlay {
  let lines: THREE.LineSegments | null = null;
  let positionAttr: THREE.Float32BufferAttribute | null = null;
  let colorAttr: THREE.Float32BufferAttribute | null = null;
  let mountedGroup: THREE.Group | null = null;
  let lastUpdateMs = 0;

  return {
    id: 'los-rays', label: 'LOS Rays', hotkey: 'L', defaultVisible: false,

    mount(group: THREE.Group): void {
      mountedGroup = group;
      const geom = new THREE.BufferGeometry();
      positionAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_RAYS * 2 * 3), 3);
      colorAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_RAYS * 2 * 3), 3);
      positionAttr.setUsage(THREE.DynamicDrawUsage);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('position', positionAttr);
      geom.setAttribute('color', colorAttr);
      geom.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.75, depthTest: false,
      });
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
      colorAttr = null;
      mountedGroup = null;
    },

    update(): void {
      if (!lines || !positionAttr || !colorAttr) return;
      const now = performance.now();
      if (now - lastUpdateMs < UPDATE_INTERVAL_MS) return;
      lastUpdateMs = now;

      const posArr = positionAttr.array as Float32Array;
      const colArr = colorAttr.array as Float32Array;
      const camera = source.getCameraPosition();

      const candidates: Array<{ c: Combatant; tx: number; ty: number; tz: number; clear: boolean; distSq: number }> = [];
      for (const c of source.combatants.values()) {
        const target = c.target;
        let tx = 0, ty = 0, tz = 0, clear = false;
        if (target && typeof target === 'object' && 'position' in target) {
          const p = (target as { position: THREE.Vector3 }).position;
          tx = p.x; ty = p.y + 1.5; tz = p.z;
          clear = true;
        } else if (c.lastKnownTargetPos) {
          tx = c.lastKnownTargetPos.x; ty = c.lastKnownTargetPos.y + 1.5; tz = c.lastKnownTargetPos.z;
          clear = false;
        } else continue;
        const dx = c.position.x - camera.x;
        const dy = c.position.y - camera.y;
        const dz = c.position.z - camera.z;
        candidates.push({ c, tx, ty, tz, clear, distSq: dx * dx + dy * dy + dz * dz });
      }
      candidates.sort((a, b) => a.distSq - b.distSq);
      const limit = Math.min(MAX_RAYS, candidates.length);

      for (let i = 0; i < limit; i++) {
        const { c, tx, ty, tz, clear } = candidates[i];
        const color = clear ? CLEAR_COLOR : BLOCKED_COLOR;
        const r = ((color >> 16) & 0xff) / 255;
        const g = ((color >> 8) & 0xff) / 255;
        const b = (color & 0xff) / 255;
        const base = i * 6;
        posArr[base] = c.position.x; posArr[base + 1] = c.position.y + 1.5; posArr[base + 2] = c.position.z;
        posArr[base + 3] = tx; posArr[base + 4] = ty; posArr[base + 5] = tz;
        colArr[base] = r; colArr[base + 1] = g; colArr[base + 2] = b;
        colArr[base + 3] = r; colArr[base + 4] = g; colArr[base + 5] = b;
      }
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      lines.geometry.setDrawRange(0, limit * 2);
    },
  };
}
