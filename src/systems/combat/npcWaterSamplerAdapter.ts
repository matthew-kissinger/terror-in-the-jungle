import * as THREE from 'three';
import type { NpcWaterSampler } from './CombatantMovement';

/**
 * Minimal surface required to build an `NpcWaterSampler`. Matches
 * `WaterSystem.sampleWaterInteraction` exactly so the production WaterSystem
 * satisfies it without a wrapper; tests pass a stub.
 *
 * The returned sample only needs `immersion01` (the wade scalar). Other
 * fields on the WaterSystem sample are intentionally ignored here so the
 * adapter survives future additions to `WaterInteractionSample`.
 */
export interface WaterInteractionSource {
  sampleWaterInteraction(position: THREE.Vector3): { immersion01: number };
}

/**
 * Build the thin signature-bridging adapter that lets `CombatantSystem`
 * consume `WaterSystem`. The combatant movement layer wants
 * `sampleImmersion01(x, z, surfaceY) -> number`; the WaterSystem speaks
 * `sampleWaterInteraction(Vector3) -> { immersion01, ... }`. The adapter
 * reuses ONE shared `THREE.Vector3` per call to avoid per-tick allocation
 * (NPCs invoke this every movement frame for wade slowdown + deep-water
 * routing checks).
 *
 * The `surfaceY` parameter is the NPC's terrain height (its feet). It is
 * written into the scratch vector's `.y` so the WaterSystem's depth math
 * (`waterSurfaceY - position.y`) reports the water column standing above
 * the ground — which is exactly the wade depth the NPC cares about.
 */
export function createNpcWaterSamplerAdapter(
  source: WaterInteractionSource,
): NpcWaterSampler {
  const scratch = new THREE.Vector3();
  return {
    sampleImmersion01(x: number, z: number, surfaceY: number): number {
      scratch.set(x, surfaceY, z);
      const sample = source.sampleWaterInteraction(scratch);
      const immersion = sample?.immersion01;
      return Number.isFinite(immersion) ? Math.max(0, Math.min(1, immersion)) : 0;
    },
  };
}
