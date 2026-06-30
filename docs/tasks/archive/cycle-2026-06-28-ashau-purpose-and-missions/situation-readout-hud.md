<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 6) -->
# situation-readout-hud

From the 2026-06-28 owner walk: A Shau feels like a blank exploration — the
player drops in with no sense of "what's happening + where to go", even though
the `WarSimulator` + zone systems already track the front. Surface that existing
state as a compact, readable situation readout (overall war posture + nearest
contested objective + a directional nudge), extending Phase 1's control-hint
surface so the HUD legend and the situation line read as one panel. **Builds on
`control-hints-hud`** (`src/ui/hud/HudControlHints.ts`) — read-only consumer of
war/zone state; do NOT add new strategy logic.

## Files touched

- `src/ui/hud/HudSituationReadout.ts` (new — the readout widget)
- `src/ui/hud/HUDSystem.ts` (mount/update the readout alongside the control hints)
- `src/ui/hud/HudSituationReadout.test.ts` (new)

## Scope

1. Add a situation readout that reads existing `WarSimulator` posture + zone
   state (`HUDZoneDisplay`/zone snapshot) — no new strategy computation, just a
   read of what those systems already expose.
2. Show: overall war posture (who's winning / tickets), the nearest contested
   objective, and a directional "go here" nudge toward it.
3. Mount it through `HUDSystem` so it coexists with `control-hints-hud` (shared
   panel placement; no overlap with the health/ammo/scoreboard slots).

## Non-goals

- New mission/tasking logic (that is `tasking-director-spike`/`-mvp`).
- Any change to `WarSimulator` or zone-capture rules — read-only.
- Widening the fenced `SystemInterfaces.ts` to reach war/zone state — reuse
  existing read paths.

## Acceptance

- [ ] On A Shau the readout shows war posture + nearest contested objective + a
      direction nudge; behavior test asserts that given a war/zone snapshot the
      readout renders the correct posture + nearest-objective text (no live
      WarSimulator rewrite).
- [ ] No overlap with existing HUD slots in a smoke screenshot.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- **Depends on `control-hints-hud`** (Phase 1, already merged — shared HUD panel
  surface). Root within Phase 6.
- Reviewer: `combat-reviewer` ONLY if the diff touches `src/systems/combat/**`
  (it should not — readout is HUD + a read of `src/systems/strategy`).
