# ground-vehicle-glb-cutover

Cut drivable + scenery ground vehicles over to the normalized repaint GLBs
with tank articulation intact: m48 turret/gun ride the grafted joints,
m151/m35/m113/pt76 swap as visuals, and net-new t54/ontos/zil-157/m42-duster
register as catalog entries for scenery placement (placed by the
world-catalog-refresh task). Part of `cycle-2026-06-11-war-asset-repaint`;
read `docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md` (breaks #1, #2) first.

## Files touched

- `src/systems/vehicle/VehicleGlbVisuals.ts`
- `src/systems/vehicle/M48TankSpawn.ts` / `M151JeepSpawn.ts` (only if spawn
  conform constants depend on model dims)
- Sibling tests for changed `src/systems/**` files

## Scope

1. m48: consume the importer-grafted `Joint_Turret`/`Joint_MainGun` exactly as
   the current contract (`applyM48TankGlbVisual` re-seats them on the
   TankTurret rig — pattern documented in the 2026-06-10 swap). Verify gunner
   aim still traverses/elevates the visual turret+barrel; cupola/searchlight
   meshes ride the turret joint.
2. m151: swap visual; verify wheel contact and the follow-cam 15-40°
   down-angle band still holds (model is now X→−Z normalized, ground-at-0).
   If the old GLB's `Joint_GunMount` is load-bearing for an M2 mount, re-seat
   from catalog metadata or measured offset — verify first whether anything
   consumes it.
3. m35-truck / m113-apc / pt76: drop-in visual swaps wherever currently
   placed (m35 static prefab precedent); confirm ground contact + yaw.
4. Procedural fallback retained for load failure (existing pattern).
5. t54-tank, ontos, zil-157, m42-duster: ensure catalog registration exposes
   them for prefab scenery placement (no drive physics, no AI this cycle;
   t54 is a budget EXCEPTION at 8k tris — note it).

## Non-goals

- No driving-feel/physics changes. No WorldFeaturePrefabs placements (the
  world-catalog-refresh task owns ALL prefab edits). No NPC enemy-armor AI
  (deferred follow-up). No modelPaths edits (importer task owns it).

## Acceptance

- [ ] `npx tsx scripts/check-land-vehicle-runtime.ts --only=open_frontier:m48`
      and `--only=open_frontier:m151` pass (board→drive→camera band→exit), and
      the A Shau variants pass.
- [ ] Screenshot: m48 gunner aim at two different yaw/pitch poses showing
      turret+barrel tracking, committed to
      `artifacts/cycle-war-asset-repaint/ground/`.
- [ ] m35/m113/pt76 in-scene screenshots (orientation + ground contact).
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Depends on: `war-asset-import-pipeline`.
