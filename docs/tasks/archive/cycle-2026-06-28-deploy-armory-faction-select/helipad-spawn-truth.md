<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 5) -->
# helipad-spawn-truth

From the 2026-06-28 owner walk: a spawn labeled "Helipad: UH1 HUEY" implies a
boardable helicopter, but arriving there often has no helicopter — the label
lies. Make it honest: either guarantee a boardable helicopter is present on
arrival at a helipad spawn, OR relabel the spawn as an on-foot pad when no
helicopter is provisioned. **Builds on `deploy-map-navigation`** (shared
spawn/map path) — rebase onto it.

## Files touched

- `src/systems/player/SpawnPointSelector.ts` (the helipad label + spawn metadata)
- `src/systems/player/PlayerRespawnManager.ts` (provision/guarantee or relabel on spawn)
- `src/systems/helicopter/HelicopterModel.ts` (boardable-heli presence check — read; touch minimally)
- `*.test.ts` (new)

## Scope

1. Determine, for a helipad spawn, whether a boardable helicopter is actually
   present/provisioned at spawn time.
2. If yes — guarantee it (provision/ensure one is boardable on arrival). If no —
   relabel the spawn so it does not promise a helicopter (e.g. "Forward Pad"
   on-foot), so the label always matches reality.
3. Keep the change minimal in `HelicopterModel` — read presence, don't rework
   helicopter spawning (it is a grandfathered file; watch the LOC budget).

## Non-goals

- Reworking helicopter spawning or the vehicle-provisioning system.
- The map navigation (that is `deploy-map-navigation`).
- The CREW-A-VEHICLE panel (that is `crew-vehicle-selectable`).

## Acceptance

- [ ] A helipad spawn either has a boardable helicopter on arrival OR is labeled
      as an on-foot pad — the label never promises a helicopter that isn't there.
      Behavior test asserts the label matches helicopter presence.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green
      (if a grandfathered file crosses its snapshot, raise it per the ratchet +
      note it in the PR — no CARRY_OVERS row for in-cycle growth).
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- **Depends on `deploy-map-navigation`** (shared spawn/map path — rebase onto its merge).
- **Blocks `crew-vehicle-selectable`** (shared `PlayerRespawnManager` spawn path — serialize).
- No reviewer.
