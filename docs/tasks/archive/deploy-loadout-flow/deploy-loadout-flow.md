<!-- 80 LOC cap. Spike: docs/rearch/DEPLOY_LOADOUT_FLOW_SPIKE_2026-06-03.md -->
# deploy-loadout-flow

Closes the functional half of UX-2 / UX-3 / UX-4 (the Field Journal visual layer
already shipped in the FJ campaign). The player will see: spawn points reliably
tappable on mobile, a loadout sheet that shows which weapons/equipment their
faction can take AND lets them pick ammo loads, and a spawn-point threat readout
so "where is it hot" is readable before deploy. Spike (read it — file:line for
every gap): `docs/rearch/DEPLOY_LOADOUT_FLOW_SPIKE_2026-06-03.md`.

## Scope decision (owner, 2026-06-03)

- UX-3 goes DEEP: ammo loads are SELECTABLE, not just displayed. Investigate the
  minimal path FIRST; if it requires changing `IAmmoManager` (FENCED), STOP and
  surface the exact interface delta for `[interface-change]` approval before
  editing `src/types/SystemInterfaces.ts`.

## Files touched (per spike)

- `src/ui/map/OpenFrontierRespawnMap.ts` (zoom/touch-aware hit radius)
- `src/ui/screens/DeployScreen.ts` (affordance copy, renderer)
- `src/ui/loadout/*` (faction-availability readout, mobile touch parity, selectable ammo)
- `src/.../SpawnPointSelector.ts` (threat readout source: `countNearbyAgents`)
- `*.test.ts` (new)

## R1 (parallel)

1. `map-spawn-tap-target-sizing` — zoom/touch-aware hit radius + nearest-on-miss snap.
2. `deploy-spawn-affordance-copy` — click+tap affordance copy.
3. `loadout-faction-availability-readout` — render the already-computed `availableWeapons/Equipment`.
4. `loadout-mobile-touch-parity` — PREV/NEXT ≥44px on mobile.
5. `loadout-selectable-ammo` — selectable ammo loads (FENCE-GATED; investigate `IAmmoManager` first).

## R2

6. `deploy-spawn-threat-readout` — read-only threat readout from `countNearbyAgents` (dep: affordance-copy).
7. `deploy-first-frame-continuity` — menu→first-frame readability (dep: threat-readout).

## Non-goals

- Deploy-into-vehicle (gameplay; the CREW-A-VEHICLE panel stays informational this cycle).
- Restyling (FJ visual layer shipped).
- Changing spawn-selection sim logic; only inject seedable RNG where `Math.random`
  (`createDeployPosition`) blocks L3 determinism.

## Acceptance

- [ ] Faction availability + selectable ammo + threat readout visible PC + mobile;
      `check:mobile-ui` + `check:hud` green.
- [ ] `npm run lint && npm run test:run && npm run build` green; no fenced-interface
      change without `[interface-change]` approval.
- [ ] Owner playtest (PC + phone) — deferred to `docs/PLAYTEST_PENDING.md`.
