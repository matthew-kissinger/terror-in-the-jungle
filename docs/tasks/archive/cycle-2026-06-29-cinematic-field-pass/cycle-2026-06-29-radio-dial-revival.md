<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase 3). -->
# cycle-2026-06-29-radio-dial-revival

Phase 3 — revive the squad/fire-support radial dial (deleted in `0f436d77` for
"blocked mobile") as ONE catalog-driven data model with TWO presentations:
desktop SVG wheel + touch bottom-sheet. Surfaced from a new dedicated non-weapon
Radio HUD slot. The player gets a minimal, discoverable drill-in (inner ring =
category, outer ring = options) on both PC and phone.

## Files touched

- `src/ui/hud/radio/RadioDialModel.ts`, `RadioDialController.ts` (+ tests, new)
- `src/ui/hud/radio/RadialDialView.ts`(+css), `RadioBottomSheet.ts`(+css) (new)
- `src/ui/hud/radio/RadioHotbarSlot.ts`(+css) (new)
- `src/systems/combat/CommandInputManager.ts`, `src/ui/hud/HUDElements.ts` (modify)
- `src/ui/hud/CommandRadioFireSupportPanel.ts` (consume shared model)
- `src/ui/hud/AirSupportRadioMenu.module.css` (overflow-to-top fix)

## Scope

1. P3a — RE-TRACE FIRST: `T` opens the unified `CommandModeOverlay`; reuse the existing `CommandRadioFireSupportPanel` (311 LOC). Extract its catalog into `RadioDialModel` (compose `SQUAD_QUICK_COMMAND_OPTIONS` + `AIR_SUPPORT_RADIO_ASSETS` + markings); `RadioDialController` handles drill + cooldown-by-resolved-support-TYPE + intent.
2. P3b — desktop `RadialDialView` (SVG annular sectors, hover-drill, release-to-select) + touch `RadioBottomSheet` (drill list, segmented marking, safe-area), chosen by `root.dataset.device`.
3. P3c — dedicated Radio HUD slot (sibling pill, placeholder icon: ship one PNG OR inline SVG, not both); open via slot-click + the existing `onAirSupportMenu`/`KeyT` path.

## Non-goals

- DO NOT bind right-mouse to open the dial — RMB is ADS (`PlayerInput` btn-2).
- NO 7th `WeaponSlot` enum entry; NO carried-radio loadout item (HUD affordance only). STATIONS category is always-available, routed in P4/P3d.
- NO new fenced `IGameRenderer` marker; `PlayerInput.ts` (819) + `CommandModeOverlay.ts` (867) are at ceiling — reuse callbacks; STATIONS rows go in a NEW sibling panel + ratchet re-base if a wire crosses.

## Acceptance

- [ ] Dial opens via radio-slot click + `KeyT` on desktop (radial) and touch (bottom-sheet); squad orders + fire support issue correctly; cooldowns grey by support type.
- [ ] Budgets verified (`lint-source-budget`); `lint && test:run && build` green; fence-safe.
- [ ] Owner playtest deferred to `docs/PLAYTEST_PENDING.md`.

## Dependencies

- P3a precedes P3b/P3c. STATIONS routing (P3d) depends on `radio-stations-music` core.
