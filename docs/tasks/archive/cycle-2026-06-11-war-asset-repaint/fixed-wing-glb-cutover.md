# fixed-wing-glb-cutover

Cut fixed-wing aircraft (a1-skyraider, f4-phantom, ac47-spooky + net-new
b52/c130/ov10/a37/mig17 as dormant catalog registrations) over to the
normalized static repaint GLBs: prop spin from grafted joints, armament muzzle
nodes re-mapped, airframe geometry re-banded to real-scale dims. Part of
`cycle-2026-06-11-war-asset-repaint`; read
`docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md` (breaks #1, #3, #4) first.

## Files touched

- `src/systems/vehicle/FixedWingModel.ts`
- `src/systems/vehicle/FixedWingConfigs.ts`
- `src/systems/vehicle/FixedWingArmament.ts`
- `src/systems/vehicle/airframe/*` (only where geometry constants live)
- Sibling tests for changed `src/systems/**` files

## Scope

1. `FixedWingModel`: shared `modelLoader` singleton (kill the private
   instance); prop/rotor spin from grafted `Joint_Propeller*` joints with
   catalog spin-axis metadata (repaint a1 has per-blade `Joint_Blade0..3` —
   the importer grafts a single hub joint; consume that, never animation
   clips).
2. Armament muzzle re-map from catalog `muzzleNodes`: AC-47 broadside battery
   (`Mesh_GunMuzzle0..2`), A-1 wing cannons, F-4 nose rotary. Tracer/fire
   geometry must match the craft-specialization behavior (broadside fires ~90°
   left; reuse the existing FixedWingArmament tests as the contract).
3. Re-band `FixedWingConfigs` geometry to measured catalog dims (f4
   14.2→18.8m, ac47 wingspan-axis change): gear height/stance, collision,
   chase-cam distances, AC-47 gunner-view offset.
4. Register b52-stratofortress, c130-hercules, ov10-bronco, a37-dragonfly,
   mig17-nva as catalog/dormant entries (no flight configs except b52 minimal
   high-altitude profile IF trivial here — otherwise leave for the arclight
   task to add; a37 is a scale re-roll advisory).
5. Takeoff/landing re-verify on airfields: gear contact at rest, no prop
   ground-strike (AVIATSIYA-2 bounce gate must stay green).

## Non-goals

- No flight-model feel tuning beyond geometric re-banding. No helicopter
  files (sibling task). No air-support radio catalog changes (arclight task).

## Acceptance

- [ ] `npm run probe:fixed-wing` passes (takeoff/climb/orbit/handoff/approach).
- [ ] Screenshots: a1 + f4 + ac47 parked (gear contact) and in-flight (prop
      spin visible on a1/ac47), committed to
      `artifacts/cycle-war-asset-repaint/fixed-wing/`.
- [ ] AC-47 broadside + A-1/F-4 forward-fire tracer origins verified against
      muzzles (note per airframe in PR).
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` with link to this brief. Feel-walk row goes
      to PLAYTEST_PENDING at cycle close.

## Round 2 / Dependencies

- Depends on: `war-asset-import-pipeline`.
