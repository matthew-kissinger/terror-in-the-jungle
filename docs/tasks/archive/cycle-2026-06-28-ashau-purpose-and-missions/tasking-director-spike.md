<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 6) -->
# tasking-director-spike

From the 2026-06-28 owner decision ("A Shau purpose = both: surface the existing
war/zone systems AND build an opt-in tasking director"). This is the DESIGN half:
a spike memo for an opt-in dynamic tasking director that derives missions from
live zone/war state. The conservative MVP (`tasking-director-mvp`) is built from
this doc's recommendation — so the spike must land a concrete, buildable plan.

## Files touched

- `docs/rearch/TASKING_DIRECTOR_SPIKE_2026-06-28.md` (new)

## Scope

1. Define 2-3 mission archetypes derivable from live state the engine already
   tracks (capture a contested zone, defend a held zone, destroy a target) —
   name the exact `WarSimulator`/zone read paths each would consume.
2. Specify the opt-in UX (how the player accepts/declines a task, where the task
   card lives in the HUD, how it clears) and the reward model (score/impact).
3. Give a perf budget + reuse strategy (read-only off existing strategy state;
   no new per-frame hot path) and recommend the MVP's exact scope so
   `tasking-director-mvp` stays ≤400 net LOC (or documents the split).

## Non-goals

- Any implementation/code — design doc only.
- New strategy/AI computation — the director reads existing state, not new sims.
- The premiere BR mode (that is `premiere-battle-royale-design`).

## Acceptance

- [ ] `docs/rearch/TASKING_DIRECTOR_SPIKE_2026-06-28.md` exists with the mission
      archetypes + their state read paths, the opt-in UX + reward model, a perf
      budget, and a recommended MVP scope (with the ≤400-net-LOC call).
- [ ] `npm run lint` green (doc-only; no `src/...` path reference that doesn't exist).
- [ ] PR linking this brief.

## Dependencies

- Root. **Blocks `tasking-director-mvp`** (the MVP builds the spike's recommendation).
- No reviewer. Doc-only.
