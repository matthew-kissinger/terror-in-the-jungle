# helicopter-glb-cutover

Cut helicopters (uh1-huey, uh1c-gunship, ah1-cobra + net-new ch47/oh6/hh3e as
dormant catalog registrations) over to the normalized static repaint GLBs:
rotors spin procedurally off grafted canonical joints instead of baked
animation clips, and airframe configs re-band for the new (larger, real-scale)
dims. Part of `cycle-2026-06-11-war-asset-repaint`; read
`docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md` (breaks #1, #3, #4) first.

## Files touched

- `src/systems/helicopter/HelicopterGeometry.ts`
- `src/systems/helicopter/AircraftConfigs.ts`
- `src/systems/helicopter/HelicopterModel.ts` (only if spin driving lives here)
- Helicopter weapon mount offsets (door guns / chin turret / rocket pods —
  locate via HelicopterWeaponSystem config; gun muzzle nodes renamed
  `Mesh_GunMuzzle*`)
- Sibling tests for changed `src/systems/**` files

## Scope

1. `HelicopterGeometry`: load via the shared `modelLoader` singleton (kill the
   private loader instance); drop animation-clip rotor wiring; resolve
   `Joint_MainRotor`/`Joint_TailRotor` from the catalog/graft contract and
   spin procedurally (spin axis from catalog metadata, not a guessed global
   axis). Keep the synthetic-blade fallback for load failure only.
2. Keep the `-Math.PI/2` yaw (importer stores +Z-forward). Draw-call
   optimization continues to exclude joint subtrees by ancestor name.
3. Re-band `AircraftConfigs` per measured dims (huey length 10.3→13.9m):
   rotor wash/landing clearances, collision bounds, seat/door-gunner
   positions, chase-cam distances. Use catalog dims, not eyeballs.
4. UH1C gun/rocket-pod mount + muzzle offsets re-derived (`Mesh_GunMuzzleR/L`,
   pods now part of model); AH1 chin-turret visual seat re-derived
   (`Mesh_ChinTurret`/`Mesh_Minigun` are static meshes — articulation via
   existing rig nodes, graft if needed).
5. Register ch47-chinook, oh6-kiowa-scout, hh3e-jolly-green-giant in
   `AIRCRAFT_INFO`-style maps as non-spawned (catalog/dormant) entries only —
   no flight configs invented for them this cycle (hh3e is also a scale
   re-roll advisory).

## Non-goals

- No flight-model/feel tuning beyond geometric re-banding. No fixed-wing files
  (sibling task). No air-support catalog changes (arclight task owns that).

## Acceptance

- [ ] `npm run check:helicopter-parity` passes.
- [ ] In-flight screenshots (hover + forward flight) for huey, uh1c, cobra
      with rotors visibly blurred/rotating, committed to
      `artifacts/cycle-war-asset-repaint/helicopters/`.
- [ ] Door-gun/chin-gun tracer origin matches muzzle on uh1c + cobra (short
      clip or screenshot note in PR).
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` with link to this brief. Human feel-walk
      row goes to PLAYTEST_PENDING at cycle close (aircraft feel is
      human-gated per AGENTS.md).

## Round 2 / Dependencies

- Depends on: `war-asset-import-pipeline`.
