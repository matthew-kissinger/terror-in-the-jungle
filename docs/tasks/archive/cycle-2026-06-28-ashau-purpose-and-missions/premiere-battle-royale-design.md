<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 6) -->
# premiere-battle-royale-design

From the 2026-06-28 owner decision: the A Shau "premiere" Battle Royale (player
battalion + ~25 NPC teams + a closing storm) is **design/feasibility only this
campaign — defer the build**. Produce a design doc a future cycle + the owner can
act on, grounded in the engine's actual materialization-tier budget (architected
for 3,000 combatants; live-fire verified at ~120). **Informed by Phase 5's
`faction-side-picker`** (the BR uses faction choice).

## Files touched

- `docs/rearch/PREMIERE_BATTLE_ROYALE_DESIGN_2026-06-28.md` (new)

## Scope

1. Define the mode: player battalion + ~25 NPC teams, the closing-storm
   mechanic (shrinking play area + push), win/lose conditions, and how squad
   command + the faction picker plug in.
2. Map it onto the engine: materialization-tier budget for ~3,000 units vs the
   verified ~120 live-fire ceiling — what tiers/LOD/AI-throttle make ~25 teams
   feasible, and the honest gap (what must improve first).
3. Recommend a phased build plan (MVP scope → full), call out the top risks
   (perf at scale, navmesh on the 21km A Shau DEM, AI density), and what to
   prototype first.

## Non-goals

- Any implementation/code — design doc only (the build is a future campaign).
- Re-deciding the faction picker (shipped Phase 5) or A Shau terrain.

## Acceptance

- [ ] `docs/rearch/PREMIERE_BATTLE_ROYALE_DESIGN_2026-06-28.md` exists with the
      mode definition, the materialization-tier feasibility mapping (3,000 target
      vs ~120 verified), a phased build plan, and the ranked risks.
- [ ] `npm run lint` green (doc-only; no `src/...` path reference that doesn't exist).
- [ ] PR linking this brief.

## Dependencies

- Root. Informed by Phase 5 `faction-side-picker` (already merged).
- No reviewer. Doc-only.
