<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# healing-mvp

Active-healing MVP per owner decision F3 (campaign manifest
`docs/CAMPAIGN_2026-07-02-greenlight-followthrough.md`) and the accepted design memo
`docs/rearch/HEALING_AND_LOOTING_SCOPE_2026-06-28.md`: an instant-heal bandage layered on
top of the existing passive regen. `PlayerHealthSystem` owns player health and had no
`heal()`; this adds the symmetric write-up plus a count-based bandage consumable, a KeyH
on-foot bind, and a HUD pip + heal flash. Serves A Shau's "stay alive between fights" loop.

## Files touched

- `src/systems/player/PlayerHealthSystem.ts` — `heal(amount)` + bandage-HUD forwarders
- `src/systems/player/InventoryManager.ts` — bandage count (3/3, loadout-independent)
- `src/systems/player/PlayerInput.ts` — on-foot KeyH `onUseBandage` bind
- `src/systems/player/PlayerController.ts` — `handleUseBandage` glue + `setPlayerHealthSystem`
- `src/systems/player/PlayerHealthUI.ts` — bandage pip + heal-flash affordance
- `src/core/GameplayRuntimeComposer.ts` — wire health system into player controller
- `src/ui/hud/HudControlHints.ts` — `H: Bandage` on the on-foot legend
- matching `*.test.ts` for the above + `scripts/lint-source-budget.ts` snapshot re-base

## Scope

1. `PlayerHealthSystem.heal(amount): number` — clamps to max, no-op (returns 0) when dead /
   `amount <= 0` / already full, re-evaluates the low-health effect, and DELIBERATELY does
   NOT touch `lastDamageTime` so healing stacks with (never restarts) the regen-delay clock.
2. `InventoryManager` bandages: `MAX_BANDAGES = 3`, loadout-independent, `useBandage()`
   (returns false when empty), `bandages`/`maxBandages` in `InventoryState`, refilled to max
   in `reset()` (the same respawn / match-restart path that restocks grenades).
3. KeyH bandage bind in `PlayerInput`, gated to on-foot (`!isInFlightVehicle` + not sandbag
   mode); a seated ground vehicle disables controls entirely; a heli keeps `H` as
   altitude-lock (its own mode block owns it). `PlayerController.handleUseBandage` heals
   FIRST and consumes a bandage ONLY when the heal restored HP (full-HP press keeps it) and
   is suppressed in any vehicle.
4. HUD: bandage pip beside the health pill + a brief green heal flash, both in
   `PlayerHealthUI` (CSS in its existing style block — outside the src/ui injectStyles ban).
   `H: Bandage` added to the `HudControlHints` on-foot legend.

## Non-goals

- No cast time / hold-to-bandage (owner chose instant); no interrupt semantics.
- No `addBandages` / crate + loot refill (owned by `task/loot-resupply-drops`, wave 2).
- No new audio asset (audio-cue-redesign owns cues); reuse-or-silent — shipped silent (gap).
- No touch bandage button (no obvious existing slot; keyboard-first MVP — gap).
- No fence change (`SystemInterfaces.ts` untouched); no DIRECTIVES/CARRY_OVERS/PLAYTEST edits.

## Acceptance

- [x] heal clamps at max, returns delta, no-ops when dead / full, keeps regen timing.
- [x] bandage consumed only on effective heal; 3 per life; resets to 3 on respawn.
- [x] KeyH heals on foot; in a heli it still toggles altitude-lock; no-op in a vehicle.
- [x] `npm run typecheck && npm run lint && npm run test:run -- <touched paths>` pass; build green.
- [ ] Owner feel-walk (PLAYTEST_PENDING row proposed in the PR).
