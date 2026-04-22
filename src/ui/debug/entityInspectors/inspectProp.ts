import type * as THREE from 'three';

export interface PropPick {
  id: string;
  type: string;
  position: THREE.Vector3;
  featureId?: string;
}

/** Props have no central registry — we format whatever the caller resolved. */
export function inspectProp(pick: PropPick | null): Record<string, unknown> | null {
  if (!pick) return null;
  const p = pick.position;
  return {
    id: pick.id,
    type: pick.type,
    position: `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`,
    featureId: pick.featureId ?? null,
  };
}
