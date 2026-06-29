<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 5) -->
# crew-vehicle-selectable

From the 2026-06-28 owner walk: the CREW-A-VEHICLE deploy panel is a dead end —
selecting it is a logging no-op that never enables the Deploy button. Make it a
real spawn choice: adopt the vehicle's position as the selected spawn, show its
map marker, and surface an F-board hint so the player deploys to and boards the
vehicle. **Builds on `helipad-spawn-truth`** (shared `PlayerRespawnManager` spawn
path) — rebase onto it.

## Files touched

- `src/systems/player/PlayerRespawnManager.ts` (adopt vehicle position as the selected spawn; enable Deploy)
- `src/ui/screens/DeployScreen.ts` (CREW-A-VEHICLE selection state + map marker + F-board hint)
- `*.test.ts` (new)

## Scope

1. When the player selects a crewable vehicle, set it as the selected spawn
   (vehicle position) so the Deploy button enables — not a logging no-op.
2. Show the vehicle's position as a map marker and surface an "F to board" hint
   so the player knows they will arrive at and board the vehicle.
3. Deploy to the vehicle position; keep the existing on-foot/zone spawn paths
   unchanged.

## Non-goals

- The map navigation overhaul (that is `deploy-map-navigation`).
- The helipad label truth (that is `helipad-spawn-truth`).
- New vehicle provisioning — reuse the existing crewable-vehicle list/position.

## Acceptance

- [ ] Selecting a crewable vehicle enables Deploy, shows its map marker + an
      F-board hint, and deploys the player to that vehicle. Behavior test asserts
      selecting a crew vehicle sets a valid selected spawn (Deploy enabled) at the
      vehicle position (no longer a no-op).
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- **Depends on `helipad-spawn-truth`** (shared `PlayerRespawnManager` spawn path — rebase onto its merge).
- No reviewer. NOTE: `DeployScreen.ts` co-edited across the phase — keep edits to the crew panel localized.
