<!-- cycle-2026-06-09-lighting-rig-core R1 (Phase 1 of CAMPAIGN_2026-06-09-lighting-rig) -->
# terrain-rig-and-scene-lights

Phase 0 proved the rig mechanism (foliage clamp bypass works) and found the
blocker: with the flag ON, terrain is lit by rig terms × legacy scene-light
PBR (double-lighting), so families cannot cohere (foliage corr 0.533 vs the
≥0.92 band). Per the spike re-scope, terrain migration and scene-light
unification are ONE task. Spec: `docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md`.

## Files touched

- `src/systems/environment/AtmosphereSystem.ts` (scene lights driven from rig
  values on the rig path; absorb the `shapeDirectLightForRenderer` call)
- `src/systems/environment/LightingRig.ts` (+ test; night ambient floor raise)
- `src/systems/terrain/TerrainMaterial.ts` (resolve the rig-path
  double-lighting: rig branch must not stack with legacy-shaped scene lights)
- `src/systems/terrain/TerrainSystem.ts` (absorb the `setAtmosphereLighting`
  re-shaping layer on the rig path — memo inventory item)
- `src/core/SystemUpdater.ts` (wiring, only if required)

## Scope

1. Rig path ON: scene lights (directional sun, ambient/hemisphere) take their
   color/intensity from the SAME rig state (linear radiance + the one
   exposure policy) — no `shapeDirectLightForRenderer` compression on this
   path. Legacy path byte-identical when OFF (flag default stays OFF).
2. Resolve terrain double-lighting per the memo: the rig terrain branch and
   the scene lights must compose to ONE application of sun/sky energy (pick
   the memo-consistent split: PBR keeps scene lights once they are rig-driven,
   and the colorNode rig branch drops its own sun/hemi duplication — or
   document the alternative chosen).
3. Absorb `TerrainSystem.setAtmosphereLighting` shaping on the rig path (no
   second re-shaping site between snapshot and material).
4. Raise the rig night ambient floor so midnight terrain is dark but readable
   (Phase 0 reviewer note: 21h terrain region was unmeasurable).
5. A/B evidence with `capture:tod-sweep` (`--label=core-off` /
   `--label=core-on --rig-on`): paste both tables. Target with flag ON:
   foliage corrVsTerrain ≥ 0.92 AND rangeRatio in [0.6, 1.6]; GLB corr
   positive and materially improved vs the 0.042 prototype value; all 8 TODs
   measurable (no n/a).

## Non-goals

- No billboard/NPC/effects changes (Phase 2) beyond what already landed.
- No preset retune, no fog unification (Phase 3).
- No legacy deletion, no flag-default flip (Phase 4).

## Acceptance

- [ ] core-on coherence table meets the targets in Scope 5; core-off matches
      the Phase 0 baseline (legacy untouched).
- [ ] `npm run lint && npm run test:run && npm run build` pass; no
      `src/types/SystemInterfaces.ts` diff; lint:budget green.
- [ ] PR against `master` linking this brief; terrain-nav-reviewer gates
      (touches `src/systems/terrain/**`).

## Round 2 / Dependencies

- Depends on: Phase 0 (merged: #363 #365 #368).
- Feeds: Phase 2 `foliage-npc-lighting` (NPC impostors + effects sweep).
