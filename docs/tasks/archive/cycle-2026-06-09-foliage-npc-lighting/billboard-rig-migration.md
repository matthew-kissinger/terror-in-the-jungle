<!-- cycle-2026-06-09-foliage-npc-lighting R1 (Phase 2 of CAMPAIGN_2026-06-09-lighting-rig) -->
# billboard-rig-migration

Phase 1 closed the terrain+GLB half of the coherence problem (GLB corr
-0.831 → +0.927). The remaining foliage gap is now an OVERSHOOT, not a
clamp: with the rig on, foliage corr 0.821 and rangeRatio 3.425 — the
up-biased card normal `(0,1,0)` + wrap 0.5 over-catch the low warm sun
(17h: terrain 0.054 vs foliage 0.180) while terrain's true sloped normals +
horizon occlusion suppress it. This task owns the foliage wrapped-Lambert
constants and closes the band. Spec:
`docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md` §2c/§5; Phase 1 evidence in
PR #371.

## Files touched

- `src/systems/world/billboard/BillboardNodeMaterial.ts` (+ test if one
  exists; else assert via the existing billboard test surface)
- `src/systems/world/billboard/BillboardBufferManager.ts` — the direct
  `scene.fog.color` read (memo finding: parallel fog authority) moves to the
  rig fog terms on the rig path
- `src/systems/environment/LightingRig.ts` (+ test) — only if a shared term
  needs adjusting (prefer billboard-side constants)

## Scope

1. Tune the rig-path foliage response to track terrain: reduce the low-sun
   over-catch (options, pick with evidence: sun-elevation-weighted sun term,
   lower wrap, horizon-occlusion-equivalent attenuation reusing the rig
   `sunElevation`, or a card-normal blend). Decision documented in-code.
2. Fold the `BillboardBufferManager` direct `scene.fog.color` read into the
   rig fog terms when the flag is ON (legacy read unchanged when OFF).
3. Keep the legacy path byte-identical when OFF (flag default OFF).
4. A/B with `capture:tod-sweep` (`--label=p2-off`, `--label=p2-on --rig-on`):
   target with flag ON — foliage corrVsTerrain ≥ 0.92 AND rangeRatio in
   [0.6, 1.6] (the memo band, now enforceable since both families are
   rig-lit). Paste both tables; do not loosen the measurement.

## Non-goals

- No NPC impostor changes (sibling `npc-impostor-rig-migration`).
- No terrain/scene-light changes (Phase 1 landed).
- No preset retune / exposure policy change (Phase 3).
- No legacy deletion (Phase 4).

## Acceptance

- [ ] p2-on table: foliage corr ≥ 0.92, rangeRatio [0.6, 1.6]; p2-off
      matches the Phase 1 core-off baseline.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Depends on: Phase 1 (merged PR #371).
- Sibling: `npc-impostor-rig-migration` (dispatch after this merges — the
  NPC migration should consume the SAME tuned response).
