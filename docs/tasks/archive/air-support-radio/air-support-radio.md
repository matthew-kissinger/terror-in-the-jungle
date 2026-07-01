<!-- 80 LOC cap. Spike: docs/rearch/AIR_SUPPORT_RADIO_SPIKE_2026-06-03.md -->
# air-support-radio

Closes SVYAZ-3. The FJ-styled radio shell (keybound `T`) and a working sortie
engine (`AirSupportManager.requestSupport()` + 4 sortie types + NPC pilot state
machine + mission files that fly-to-target and deal damage) both already exist
but are NOT connected — `CommandInputManager.handleRadioSelection` is a stub.
The player will mark a ground target, pick an asset, watch the per-asset
cooldown, and have an NPC pilot actually fly the sortie and strike the mark.
Spike (read it — file:line for every seam): `docs/rearch/AIR_SUPPORT_RADIO_SPIKE_2026-06-03.md`.

## Scope decision (owner, 2026-06-03)

- FIX the friendly-fire bug this cycle. Called strikes pass no faction
  (`applyExplosionDamage(..., undefined, ...)` at `SpookyMission.ts:99`,
  `NapalmMission.ts:84`) so they damage friendlies. Thread the requester's
  `Faction` through so player-called strikes do ZERO damage to friendlies.

## Files touched (per spike)

- `src/.../CommandInputManager.ts` (handleRadioSelection stub → dispatch; cooldown feed)
- `src/.../AirSupportManager.ts` (cooldown source; faction-aware request)
- `src/.../CommandTacticalMap.ts` (reuse click→Vector3 for the mark)
- `src/.../SpookyMission.ts`, `NapalmMission.ts` (thread shooterFaction)
- `*.test.ts` (new IFF + fulfillment)

## R1 (parallel)

1. `radio-asset-type-mapping` — 6 radio assets → 4 runtime sortie types.
2. `radio-target-marking` — reuse tactical-map click→world point for the mark.
3. `air-support-cooldown-feed` — `AirSupportManager` becomes the cooldown source via `setRadioCooldowns`.

## R2

4. `radio-call-in-dispatch` — wire `handleRadioSelection` → `requestSupport` (dep: mapping + marking).
5. `air-support-iff-faction` — thread requester `Faction` → no friendly damage + deterministic IFF test.
6. `air-support-npc-fulfillment-test` — L3 deterministic "marked target struck by NPC sortie".
7. `retire-legacy-air-support-call` — remove orphaned `PlayerVehicleController.handleAirSupportRequest` (optional).

## Non-goals

- AVIATSIYA-6 work: no new firing on the generic `NPCFlightController` attack-run,
  no named maneuvers. Map radio assets only onto sortie types whose mission files
  already fire.
- New world-marker via `IGameRenderer` (FENCED) — reuse minimap/tactical-map markers.
- **`rocket_run` IFF (follow-up):** napalm + spooky use direct `applyExplosionDamage`
  and are faction-threaded now. `rocket_run` (a1_rockets, cobra_rocket_run) fires
  through `GrenadeSystem.spawnProjectile` → `GrenadeEffects.explodeFrag`, the SHARED
  player-grenade explosion path (`attackerId:'PLAYER'`, no faction). Threading a
  per-projectile `shooterFaction` there also touches player grenades, so it is a
  separate focused follow-up — out of scope here to keep the grenade core stable.

## Acceptance

- [ ] `T` → mark → select → NPC sortie flies + strikes; per-asset cooldown enforced;
      friendlies take ZERO damage from called strikes (deterministic test).
- [ ] `npm run lint && npm run test:run && npm run build` green; fence-safe (flag if not).
- [ ] Owner playtest — deferred to `docs/PLAYTEST_PENDING.md`.
