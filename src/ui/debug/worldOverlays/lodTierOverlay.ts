import * as THREE from 'three';
import type { WorldOverlay } from '../WorldOverlayRegistry';
import type { Combatant } from '../../../systems/combat/types';

export interface CombatantLodSource {
  combatants: Map<string, Combatant>;
}

const TIER_COLORS: Record<Combatant['lodLevel'], number> = {
  high: 0xff5533, medium: 0xffaa22, low: 0x33aaff, culled: 0x777777,
};
const MARKER_HEIGHT_OFFSET = 2.4;
const MAX_MARKERS = 2048;

/**
 * Draws a colored dot above every combatant indicating its current LOD tier.
 * One `Points` draw call — no mutation of combatant meshes, so "restore on
 * toggle-off" is trivial.
 */
export function createLodTierOverlay(source: CombatantLodSource): WorldOverlay {
  let points: THREE.Points | null = null;
  let positionAttr: THREE.Float32BufferAttribute | null = null;
  let colorAttr: THREE.Float32BufferAttribute | null = null;
  let mountedGroup: THREE.Group | null = null;

  return {
    id: 'lod-tier', label: 'LOD Tier Markers', hotkey: 'T', defaultVisible: false,

    mount(group: THREE.Group): void {
      mountedGroup = group;
      const geom = new THREE.BufferGeometry();
      positionAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_MARKERS * 3), 3);
      colorAttr = new THREE.Float32BufferAttribute(new Float32Array(MAX_MARKERS * 3), 3);
      positionAttr.setUsage(THREE.DynamicDrawUsage);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('position', positionAttr);
      geom.setAttribute('color', colorAttr);
      geom.setDrawRange(0, 0);
      const mat = new THREE.PointsMaterial({
        size: 8, sizeAttenuation: false, vertexColors: true,
        depthTest: false, transparent: true, opacity: 0.9,
      });
      points = new THREE.Points(geom, mat);
      points.renderOrder = 9999;
      group.add(points);
    },

    unmount(): void {
      if (points && mountedGroup) {
        mountedGroup.remove(points);
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
      }
      points = null;
      positionAttr = null;
      colorAttr = null;
      mountedGroup = null;
    },

    update(): void {
      if (!points || !positionAttr || !colorAttr) return;
      const posArr = positionAttr.array as Float32Array;
      const colArr = colorAttr.array as Float32Array;
      const c = new THREE.Color();
      let i = 0;
      for (const combatant of source.combatants.values()) {
        if (i >= MAX_MARKERS) break;
        const p = combatant.renderedPosition ?? combatant.position;
        posArr[i * 3] = p.x;
        posArr[i * 3 + 1] = p.y + MARKER_HEIGHT_OFFSET;
        posArr[i * 3 + 2] = p.z;
        c.setHex(TIER_COLORS[combatant.lodLevel] ?? 0xffffff);
        colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
        i++;
      }
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      points.geometry.setDrawRange(0, i);
    },
  };
}
