<!-- cycle-2026-06-09-lighting-acceptance R2 (Phase 4 of CAMPAIGN_2026-06-09-lighting-rig) -->
# legacy-path-deletion

The campaign's payoff: the rig flag flips default-ON and the legacy lighting
paths are deleted — the owner-visible lighting rework ships. Large
retired-code deletion (the sanctioned >400-net class). Spec: memo §4
deletion list + the reviewer checklist items accumulated in BACKLOG entries
for PRs #368 #371 #376 #378.

## Files touched (the accumulated deletion list)

- `src/systems/environment/LightingRig.ts` — flag default ON (keep the
  runtime kill-switch for one release; document)
- `src/systems/environment/AtmosphereLightingColor.ts` —
  `shapeDirectLightForRenderer` compression deleted (with its callers'
  legacy branches)
- `src/systems/environment/AtmosphereSystem.ts` — legacy scene-light
  shaping + legacy fog shaping branches removed
- `src/systems/terrain/TerrainMaterial.ts` / `TerrainSystem.ts` — legacy
  color stabilizer + night-fill emissive + setAtmosphereLighting re-shaping
  removed; rig branch becomes the only path (selects collapse)
- `src/systems/world/billboard/BillboardNodeMaterial.ts` — [0.40, 0.78]
  clamp-band mechanism deleted; rig response is the path
- `src/systems/combat/CombatantShaders.ts` / `CombatantMeshFactory.ts` —
  `resolveNpcAtmosphereSnapshot` scene scan deleted; legacy npc atmosphere
  uniforms removed; re-validate per-faction PIXEL_FORGE parity readability
  under the rig (Phase 2 review item) and retune those constants if NPCs
  read wrong
- Tests updated to the rig-only behavior; knip/grep prove no stragglers

## Scope

1. Flip default ON; collapse the flag-gated selects so the rig path is the
   compiled path (kill the dead ALU both terrain reviews flagged); keep a
   single runtime kill-switch (documented) for one release.
2. Delete every item on the memo §4 list + reviewer checklist; the
   terrain→environment binding import stays (documented coupling).
3. Re-run `npm run check:tod-coherence` (the gate) — green required.
4. Run a combat120 perf capture; p99 within ±5% of the pre-flip baseline.
5. Visual evidence: 4-TOD capture set (dawn/noon/dusk/midnight) attached
   paths in the PR for the owner acceptance walk.

## Non-goals

- No new lighting features or tuning beyond the parity re-validation.
- No water terms. No preset redesign beyond what Phase 3 landed.

## Acceptance

- [ ] Gate green post-flip; combat120 p99 flat; all families on one path;
      knip + grep show no legacy stragglers.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief; combat + terrain-nav
      reviewers gate (touches both fenced-adjacent areas).

## Round 2 / Dependencies

- Depends on: `tod-coherence-gate` (merged).
- After merge: orchestrator deploys + `check:live-release` + owner
  acceptance row (campaign close).
