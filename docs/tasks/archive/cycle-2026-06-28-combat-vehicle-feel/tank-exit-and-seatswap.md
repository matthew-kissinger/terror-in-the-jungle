<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 2) -->
# tank-exit-and-seatswap

Real bug from the 2026-06-28 owner playtest: **you cannot dismount a tank.** `E`
has no ground-vehicle exit branch (`PlayerVehicleController.ts`), and `F` is
consumed by the seat-swap (driver↔gunner), so the exit path is never reached —
only `Escape` (which also opens the pause menu) gets you out. This adds a clear,
discoverable tank exit while keeping `F` seat-swap, plus a HUD cue. Pairs with
Phase 1's `seat-and-fire-cues` (which surfaced the seat/exit cues but explicitly
deferred the F-overload fix here).

## Files touched

- `src/systems/player/PlayerVehicleController.ts` (add the ground/tracked exit branch)
- `src/systems/player/PlayerInput.ts` (route the exit key; ~line 532)
- `src/systems/vehicle/TankPlayerAdapter.ts` (seat-swap vs exit disambiguation; ~line 399)
- `*.test.ts` (new — repro-first)

## Scope

1. Make tank exit reachable WITHOUT Escape: keep `F` as seat-swap when a second
   seat exists, and add an unambiguous exit (e.g. hold-`F`, or `E` ground branch,
   or `G`/`Q` — pick the least-surprising given existing binds; document it).
2. Eject the player to the side of the hull (not inside, not under terrain),
   matching the existing jeep/M48 exit ejection pattern.
3. Show the bind on the HUD (reuse Phase-1 `HudControlHints` vehicle context — do
   not duplicate the legend).
4. Keep heli/jeep/fixed-wing exit behavior unchanged.

## Non-goals

- New seat types or changing the seat-swap mechanic itself (only disambiguate it
  from exit).
- Reworking the pause menu or the Escape binding.
- Widening the fenced `IPlayerController`/`SystemInterfaces.ts` — see Fence below.

## Acceptance

- [ ] **Repro-first L3 test** (per docs/TESTING.md): board a tank → assert exit
      via the new bind returns the player to infantry with side-ejection, AND `F`
      still swaps seats when a second seat exists (the bug: exit was unreachable
      except via Escape).
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` linking this brief; owner walk → PLAYTEST_PENDING.

## Fence watch (hard-stop)

- If a clean exit requires changing `src/types/SystemInterfaces.ts`
  (`IPlayerController` routing), STOP, do not push, report `fence_change: yes`.
  Prefer routing through existing controller methods / the adapter; the fence
  hard-stop fires by design if you must widen it.

## Dependencies

- Root (no blockers). Disjoint from the other Phase-2 tasks.
