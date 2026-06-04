<!-- 80 LOC cap. Diagnosis handed down from the 2026-06-04 deploy/zone/vehicle triage. -->
# zone-base-ditch-placement

Owner report: "zone control stamping is bad — enemy spawn and closest base always
in a ditch." In Zone Control the two home bases (and the enemies spawning from
them) sit in terrain depressions instead of on flat ground. Closes DEFEKT-7. The
player will see: both home bases and all three capture zones resting on flat,
sensible ground on every ZC boot; enemies do not spawn in a hole.

## Required reading first

- `src/systems/world/ZoneManager.ts` — `validateAndNudgeZones()` :326 (mutates
  `zone.position` in place :331), `setGameModeConfig()` :337, `initializeZones()` :304.
- `src/systems/world/ZoneTerrainAdapter.ts` — `validateAndNudge()` :83 calls
  `getHeightAt` with **no terrain-readiness guard**; search rejects any candidate
  with slope > 0.25 and only probes fixed 15/30/45 m rings (cannot climb a
  steep-walled ditch).
- `src/config/ZoneControlConfig.ts` — home bases `us_base`/`opfor_base` :228-246
  do NOT set `validateTerrain:false`, yet they already have guaranteed flatten
  pads from the `firebase_us`/`nva_bunkers` features :82-123 (`targetHeightMode:'max'`).
  So the nudge drags the base OFF its own flat pad.
- `src/systems/combat/SpawnPositionCalculator.ts` — `canUseTerrainAt()` :338 is the
  readiness pattern to mirror; base spawn anchors at `getBaseSpawnPosition()` :69.
- `src/systems/terrain/StampedHeightProvider.ts` :23 — stamps ARE reflected in
  `getHeightAt`, but only once resolved/ready. `docs/TESTING.md` before the test.

## Files touched

- `src/systems/world/ZoneTerrainAdapter.ts`
- `src/systems/world/ZoneManager.ts`
- `src/config/ZoneControlConfig.ts`
- `src/.../<zone-ditch>.test.ts` (new)

## Scope

1. **Repro first.** L3 test: build ZoneManager over a terrain stub with a known
   steep-walled ditch at the home-base coords; assert post-init home-base AND
   capturable-zone positions are NOT in a ditch (centerHeight ≥ ringMean − threshold)
   and slope within bound.
2. Add a terrain-readiness guard to `validateAndNudge` (mirror `canUseTerrainAt`)
   so it never nudges against unready/unstamped terrain.
3. Stop the nudge dragging flattened home bases off-pad: set `validateTerrain:false`
   on `us_base`/`opfor_base` (they have guaranteed flatten pads) — or coordinate
   nudge with the stamp. Take the minimal fix the test proves correct.
4. Strengthen the nudge for the stamp-less capture zones so it can escape a
   steep-walled ditch (wider/denser search or allow climbing steeper rims).
5. Verify combatant base-spawn anchors land on flat ground.

## Non-goals

- No terrain-compositor / stamp-policy rewrite; no map-seed or layout redesign; no
  new zone features. Inject seedable RNG only where `Math.random`
  (`findSuitableZonePosition`) blocks L3 determinism.

## Acceptance

- [ ] New L3 test green over the ZC config: 2 home bases + 3 zones on flat ground.
- [ ] `npm run lint && npm run test:run && npm run build` green; `terrain-nav-reviewer`
      APPROVE / APPROVE-WITH-NOTES pre-merge.
- [ ] PR against `master` linking this brief; owner playtest deferred to
      `docs/PLAYTEST_PENDING.md`.
