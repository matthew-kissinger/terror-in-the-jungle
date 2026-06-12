# world-catalog-refresh — draw-call / tri delta note

Cycle: `cycle-2026-06-11-war-asset-repaint`, task `world-catalog-refresh` (R3).
Captured from the perf bundle (`dist-perf`) via
`scripts/capture-world-catalog-refresh-shots.ts` over a `vite preview` of the
statically-bundled perf build, booted from the task worktree. Before = master
@ `2b294874` prefab/profile state (stashed); after = this branch.

## What the number measures

`worldStaticFeatureTriangles` = triangles summed over every mesh under the
`WorldStaticFeatureBatchRoot` group, i.e. all buildings / structures / props /
parked-vehicle scenery for the whole map, excluding terrain, foliage, NPCs, and
sky. This is the map-total static-feature budget, not a single-feature slice —
the batch root holds every feature's geometry once and the renderer toggles
sector visibility for culling, so the traverse count is constant across camera
poses within a mode. Whole-scene `triangles` (1.3M–3.5M) is terrain-dominated
and not a useful lever here.

## Map-total static-feature tri delta (before → after)

| Mode | wsf tris before | wsf tris after | delta | meshes before → after |
|---|---|---|---|---|
| Open Frontier | 45,280 | 54,226 | **+8,946** | 281 → 291 |
| A Shau Valley | 99,326 | 114,888 | **+15,562** | 661 → 708 |
| Zone Control | 22,812 | 34,846 | **+12,034** | 204 → 222 |
| Team Deathmatch | 22,812 | 34,846 | **+12,034** | 204 → 222 |

(Draw-call counts in the per-shot `summary-*.json` swing with which culling
sectors the overview camera frames, so they are not a clean before/after lever;
the tri count is the stable metric.)

## Representative firebase

The firebase prefabs (`firebase_us_small/medium/large`, `firebase_hq_small`,
`firebase_artillery_small`) and `FirebaseTemplates` pools were **not touched**
this pass — every firebase structure was already on the repaint catalog from R1.
So the **per-firebase static-feature tri delta is 0**. The TDM firebase
(`firebase_us`, `firebase_hq_small`) renders the full repaint structure set
(TOC bunker, command tent, aid station, comms/guard/water towers, ammo bunker)
at correct scale and grounding — see `team_deathmatch-firebase-after.png`.

## Where the growth comes from

The map-total growth is entirely the village/settlement + motor-pool wiring:

- `village_cluster_small` (placed in every mode): + buddhist-temple landmark
  (14,632 tris) + stilt-house (2,584), swapping out the rice-barn. This single
  prefab change accounts for most of the per-instance growth in ZC/TDM, where
  the only static-feature villages are the `village_cluster_small` instances.
- `motor_pool_heavy_ashau` / `motor_pool_small`: + m42-duster (2,152) + ontos
  (3,544) static dressing.
- `nva_trail_base_small`: + t54-tank (8,004). `nva_tunnel_camp_small`:
  + zil-157 (3,168).
- `village_market_small` / `village_riverside_small`: schoolhouse, tea-house,
  rice-mill, rubber-plantation-mansion (13,396) landmark + pond-heron — these
  prefabs are not yet referenced by any mode config (the `MapFeaturePrefabId`
  union and configs are out of this task's scope), so they add 0 to the live
  map totals above but are catalog-ready for adoption.

## Budget posture

All added buildings are EXCEPTION-tier per the repaint audit (2,500–14,632 tris,
under the 20k REJECT bar) and ship under the cycle's aggregated exception note.
The one-landmark-per-settlement rule keeps the high-tri temple/mansion to a
single instance per village. No REJECTED replacement reaches a fresh placement
(rice-dike stays on its old GLB; its placement was untouched).

The cycle perf headroom (combat120 steady-state p99 1.8 ms under the halt line,
tail 81% render/Other) is unaffected at the per-frame level: world static
features are one batched draw per sector and distance-culled at 900 m, so the
combat120 frame (which frames one firebase) sees the unchanged firebase budget,
not the map-total. The map-total growth lands in load-time geometry, not the
steady-state combat frame.
