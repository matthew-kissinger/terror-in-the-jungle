<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 1) -->
# radio-command-menu

The owner pressed `T`, saw the radio, and concluded "I don't know what any of
this does... I don't even know if any of those are working." They ARE working —
7 fire-support sorties + smoke/WP/grid marks are fully wired
(`AirSupportRadioCatalog.ts`, `AirSupportManager.requestSupport`), and squad
commands work on `Z` / Shift+1-6. The gap is a discoverable, legible interface.
This unifies them into the owner's requested "radio as an item" menu: one compact
surface that lists fire-support assets AND squad commands with plain labels, live
cooldowns, and the mark mode, so the RTS layer is usable without memorizing keys.

## Files touched

- `src/systems/combat/CommandInputManager.ts`
- `src/ui/hud/CommandModeOverlay.ts`
- `src/systems/combat/SquadCommandPresentation.ts`
- `*.test.ts` (new)

## Scope

1. One menu (opened by `T`) with two readable sections: FIRE SUPPORT (the 7
   catalog assets + per-asset cooldown + current mark mode smoke/WP/grid) and
   SQUAD (the 6 Shift+1-6 commands with labels).
2. Each row shows its key + a one-line effect; selecting a fire-support asset
   drives the existing `requestSupport` path (do not reimplement the sortie).
3. Surface the `Z`/`T` entry points so the player can discover the menu without
   the console log or Settings modal.
4. Keep the look consistent with the Field Journal HUD styling.

## Non-goals

- New sortie types, new squad behaviors, or changing leash/IFF logic.
- The world-pointing "mark where I aim" radio (note as a follow-up, do not build).
- Touching the fenced `IGameRenderer`/world-marker path — reuse existing markers.

## Acceptance

- [ ] `T` opens a menu listing all 7 assets (with cooldowns) + all 6 squad
      commands with labels; a marked strike still flies + lands (existing test
      path) and squad commands still issue.
- [ ] `npm run lint && npm run test:run && npm run build` green; fence-safe.
- [ ] PR linking this brief; combat-reviewer APPROVE; owner walk → PLAYTEST_PENDING.

## Dependencies

- Reviewer: combat-reviewer (touches `src/systems/combat/**`).
