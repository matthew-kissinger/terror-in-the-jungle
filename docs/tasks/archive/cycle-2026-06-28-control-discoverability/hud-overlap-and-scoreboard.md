<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 1) -->
# hud-overlap-and-scoreboard

Two small HUD truths from the playtest. (1) Confirmed bug: the attribution notice
(`AttributionNotice.ts` `left:6px; bottom:4px`, max z-index, on `document.body`)
sits directly over the bottom-left health pill — they overlap. (2) The owner
thought "the scoreboard isn't working," but the kill→stats→display path is fully
wired and unit-tested — it is hold-**Tab**, not a toggle, so it read as broken.
This fixes the overlap and adds a discoverability hint, and live-verifies the
tracking rather than rewriting it.

## Files touched

- `src/ui/AttributionNotice.ts`
- `src/ui/layout/HUDLayoutStyles.ts`
- `src/ui/hud/ScoreboardPanel.ts` (hint only)
- `*.test.ts` (new)

## Scope

1. Move/relayout the attribution notice (or the health slot) so they no longer
   occupy the same bottom-left pixels at any HUD size. Attribution stays
   readable + `pointer-events:none`.
2. Add a small "Hold Tab: scoreboard" hint (route through `control-hints-hud` if
   landed, else a minimal standalone hint).
3. Live-verify kills/score increment and display while Tab is held (a smoke
   screenshot mid-firefight). Do NOT change the tracking logic — it is correct.

## Non-goals

- Reworking the scoreboard layout or the K/D stats panel.
- Any change to `PlayerStatsTracker` kill/death/score accounting.

## Acceptance

- [ ] Attribution and health do not overlap (screenshot at default + small HUD).
- [ ] Scoreboard hint visible; a mid-match screenshot shows non-zero kills/score
      while Tab is held.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.
