<!-- cycle-2026-06-09-lighting-acceptance R1 (Phase 4 of CAMPAIGN_2026-06-09-lighting-rig) -->
# tod-coherence-gate

Phase 4 opener: the TOD sweep becomes a standing acceptance instrument with
committed tolerances, an NPC actually in the capture frame, and a pre-deploy
npm entry point — the gate that would have caught the original cross-material
incoherence. Spec: `docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md` §5; Phase 2
review checklist items included.

## Files touched

- `scripts/capture-tod-coherence-sweep.ts` — gate mode + NPC fixture
- `package.json` — `check:tod-coherence` script
- `docs/RELEASE.md` or the deploy checklist doc the repo uses (trace it) —
  one line adding the gate to the pre-deploy checklist

## Scope

1. NPC-in-frame fixture: in gate mode, spawn/teleport one combatant impostor
   into the fixture view (worldbuilder/dev surface — trace what exists; no
   combat-AI changes) so the npc row finally measures real pixels.
2. `--gate` mode: runs the sweep with the rig flag ON, asserts committed
   tolerances (foliage AND npc corrVsTerrain ≥ 0.92, rangeRatio [0.6, 1.6];
   dawn terrain ≤ 0.85; all TODs measurable), exits nonzero on failure,
   writes a JSON verdict artifact. Tolerances live as named constants with
   the memo reference.
3. A new package script (name it check:tod-coherence) wires it; document in
   the deploy checklist as a pre-deploy step (NOT a blocking CI job —
   headless GPU sweeps are ~5min and CI GPU runners are starvation-prone
   per STABILIZAT-1; record that decision in the script header).
4. Run the gate; paste the verdict. If the NPC row fails the band with the
   shared constants, flag it with numbers (per-faction parity re-validation
   is the deletion task's tuning surface) — do not loosen tolerances.

## Non-goals

- No shader changes (deletion task owns any final tuning).
- No CI workflow changes.
- No legacy deletion or flag flip.

## Acceptance

- [ ] Gate runs green on the rig path (or red with an honest numeric flag
      for the deletion task); NPC row measures real pixels.
- [ ] `npm run lint && npm run test:run && npm run build` pass.
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Depends on: Phase 3 (`exposure-fog-presets-rig`) merged.
- Blocks: `legacy-path-deletion` (the gate proves the flip).
