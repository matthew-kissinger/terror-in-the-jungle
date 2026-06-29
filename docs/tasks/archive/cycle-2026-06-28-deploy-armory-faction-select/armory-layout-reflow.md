<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 5) -->
# armory-layout-reflow

From the 2026-06-28 owner walk: the armory column is cluttered — redundant
PREV/NEXT controls duplicated by a chip strip, awkward spacing, and the insertion
map + kit can't be read together (a `setActiveView` toggle hides one with
`display:none`). Reflow the armory so it reads cleanly and the map + kit are both
visible. **Builds on `weapon-stats-panel`** (which adds the stats block to the
same column) — rebase onto it.

## Files touched

- `src/ui/screens/DeployScreen.ts` (armory layout structure + the view toggle)
- `src/ui/screens/DeployScreen.module.css` (spacing, column layout)
- `*.test.ts` (new, if behavior changes are testable)

## Scope

1. Remove the redundant weapon-selection duplication (keep ONE clear
   prev/select/next affordance + the chip strip serving distinct purposes, not
   two copies of the same control).
2. Fix the armory column spacing so the weapon, stats (from `weapon-stats-panel`),
   equipment, and preset read as a coherent stack, not crowded.
3. Let the insertion map and the kit read together where the screen allows
   instead of the `setActiveView` `display:none` either/or, OR make the toggle
   obvious and labeled if both genuinely can't fit.

## Non-goals

- The weapon stats content (that is `weapon-stats-panel`).
- The respawn/insertion MAP navigation behavior (that is `deploy-map-navigation`).
- Faction selection (that is `faction-side-picker`).
- A full visual redesign — this is a reflow/declutter, not a new design language.

## Acceptance

- [ ] The armory column has no duplicated PREV/NEXT, reads cleanly, and map+kit
      are both visible (or the toggle is explicit). Note before/after in the PR.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- **Depends on `weapon-stats-panel`** (shared armory column — rebase onto its merge).
- No reviewer (UI).
