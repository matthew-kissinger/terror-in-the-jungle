<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# compositor-playtest-evidence

R3.2 of `cycle-terrain-compositor`. Ships the docs that surface the cycle
to the owner for walk-through: a `docs/playtests/cycle-terrain-compositor.md`
memo and a row in `docs/PLAYTEST_PENDING.md`. Cycle posture is `attended`
(not autonomous-loop), so this is owner-walk-through evidence, not a
deferred merge gate. Design memo:
[docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).

## Files touched

- `docs/playtests/cycle-terrain-compositor.md` (new — owner walk-list)
- `docs/PLAYTEST_PENDING.md` (extend "Active deferrals" table with one row)

## Scope

1. **`docs/playtests/cycle-terrain-compositor.md`** — owner walk memo
   modeled on `cycle-of-river-surface-enable.md`. Sections:
   - **What to walk** — 5 numbered items:
     (1) Fly the OF helicopter over the main airfield at 80 m; confirm flat
         interior + smooth grade ramp; no random mountains.
     (2) Drop in at OF Sampan spawn `(-324, 0, 384)`; confirm boat sits on
         water surface, no float-above-terrain, no z-fight at hull.
     (3) Drop in at OF PBR spawn `(396, 0, 876)`; same check.
     (4) Drive an OF watercraft over a known airfield ∩ hydrology overlap
         (default: `(280, 0, -1280)`); confirm the water surface follows
         the terrain through the overlap.
     (5) Toggle `Shift+\ → J` (R2.3 debug overlay) anywhere on OF;
         confirm airfield envelope renders white, river capsules render
         blue, ≥1 red conflict edge is visible.
   - **A Shau regression check** — same flight pattern on A Shau Valley;
     confirm rivers + airfields still render correctly.
   - **What I look for** — visual cues; no probes / no JSON to read.
   - **Screenshots** — point at the artifacts produced by R3.1's capture
     script.
2. **`docs/PLAYTEST_PENDING.md`** — add one row to the "Active deferrals"
   table:
   - `Cycle slug`: `cycle-terrain-compositor`
   - `Close commit`: `(this cycle's close commit)`
   - `What to walk`: link to the new memo + one-line summary
   - `Playwright smoke screenshots`: paths under
     `artifacts/cycle-terrain-compositor/playtest-evidence/`
   - `Notes`: cycle was attended posture; PLAYTEST_PENDING row added for
     completeness so the owner can batch this with other deferred walks.

## Non-goals

- Capture-script changes (R3.1 owns).
- Rejecting / reverting merged work if the playtest finds a regression —
  per `PLAYTEST_PENDING.md` discipline, owner opens a follow-up cycle.

## Acceptance

- [ ] Memo lands at `docs/playtests/cycle-terrain-compositor.md` with the
      5-item walk-list, A Shau regression section, and a screenshots
      block pointing at R3.1's artifacts.
- [ ] `docs/PLAYTEST_PENDING.md` "Active deferrals" table includes the
      new row.
- [ ] `npm run lint && npm run test:run && npm run build` all pass (docs
      only — should be no-op).
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Depends on: R3.1 (capture artifacts referenced by the memo).
- Blocks: cycle close-out ritual (BACKLOG entry references the memo).
