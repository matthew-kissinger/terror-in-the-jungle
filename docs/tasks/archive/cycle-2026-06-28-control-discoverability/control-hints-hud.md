<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 1) -->
# control-hints-hud

Closes the campaign's dominant finding: the game does more than it shows. The
owner could not tell that planes fire, that seats swap, that the radio and squad
commands exist — because control hints live ONLY in a console log
(`PlayerInput.ts:737-768`) and the pre-game Settings modal. This adds a
persistent, context-sensitive control legend to the live HUD that changes with
what the player is doing (on foot / in a vehicle seat / flying). It is the shared
surface that `seat-and-fire-cues` (Phase 1) and `situation-readout-hud` (Phase 6)
extend, so keep it small and composable.

## Files touched

- `src/ui/hud/HudControlHints.ts` (new)
- `src/ui/hud/HUDSystem.ts` (mount + per-frame context)
- `src/ui/hud/HudControlHints.test.ts` (new)

## Scope

1. New `HudControlHints` HUD element: a compact, low-opacity legend pinned to an
   unused HUD edge (NOT bottom-left — that corner is health/attribution).
2. Context switching: read the active vehicle/session state (on-foot vs
   ground-vehicle vs aircraft vs emplacement) and show only the relevant binds.
3. Source the bind strings from the existing keybind definitions, not hardcoded
   duplicates that can drift from `PlayerInput`.
4. Make it toggleable (a key + a setting) and default-on; respect reduced-clutter.

## Non-goals

- Seat labels / fire cues / airborne-fire feedback — that is `seat-and-fire-cues`.
- Rebinding or changing any keybind. Display only.
- The radio/squad menu content — that is `radio-command-menu`.

## Acceptance

- [ ] Legend renders on foot, in a ground vehicle, and in an aircraft with the
      right binds for each (Playwright smoke screenshots, 3 contexts).
- [ ] Does not overlap the health pill or attribution notice at any HUD size.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Blocks: `seat-and-fire-cues` (same HUD surface).
