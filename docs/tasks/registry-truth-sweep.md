# Task: registry-truth-sweep

Wave 1 of `CAMPAIGN_2026-07-02-greenlight-followthrough` (manifest forks F7, Q17,
Q20, U3). One batched documentation-truth PR fixing verified registry/status
drift. Registry-truth-sweep alone owns the registries this campaign.

## Goal

Bring the status registries back into agreement with what is on `master` and
with `docs/DIRECTIVES.md`, record owner decisions from the campaign manifest,
and fix a handful of stale code comments (comment-only, zero runtime risk).

## Scope

- `docs/state/CURRENT.md` — demote the Directive-status section to links-only;
  fix the `perf-baselines.json` claim (RESTORED 2026-06-29, not missing); make
  the `check:tod-coherence` foliage-FAIL "carry-over" claim true.
- `docs/CARRY_OVERS.md` — unpark AVIATSIYA-2 to Closed (fixed on master
  `768d7717`); verify+close (or keep+rewrite) KB-STARTUP-1 against the
  StampSpatialIndex fix; add an Active row for the tod-coherence foliage FAIL.
- `docs/DIRECTIVES.md` — resolve the DEFEKT-6 banner-vs-row split (close the
  row); de-stale the SVYAZ-3 audio clause (fal.ai pipeline); refresh DEFEKT-2
  drift counts; update STABILIZAT-1 latest-evidence + re-baseline note.
- `docs/PLAYTEST_PENDING.md` — annotate row 30 (orbital-topo-map, superseded);
  move the three July-1 rejections to "Walked & rejected"; add a top-of-Active
  "Priority walk" note (Q17).
- `docs/directives/vekhikl-2.md` + `docs/DIRECTIVES.md` VEKHIKL-2 row —
  annotate the NPC-gunner checkbox (AI-layer complete; production wire pending).
- `AGENTS.md` — add the U3 owner-decision hard rule (default-ON experiential
  surfaces need owner sign-off).
- `src/systems/combat/CombatantAI.ts`, `src/systems/combat/ai/utility/actions.ts`
  — fix two stale utility-AI comments (all four factions now `useUtilityAI:true`).

## Non-goals

- No fence changes (`src/types/SystemInterfaces.ts` untouched).
- Do NOT touch `src/systems/combat/weapons/NpcM2HBAdapter.ts` (owned by
  `task/npc-m2hb-gunners`) or anything under `src/ui/map/orbital` (owned by
  `task/orbital-map-prune`).
- No runtime behavior change. The two code edits are comment-only.

## Validation

- `npm run check:doc-drift` — green (`failing=0`).
- `npm run lint:docs` — 0 failures.
- `npm run typecheck` — green (covers the two comment edits).
- `npm run lint` + focused `npm run test:run -- <touched code paths>`.
