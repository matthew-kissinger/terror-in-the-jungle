# Projekt Objekt-143 24-Hour Status

Report time: 2026-05-04 22:10 EDT / 2026-05-05 02:10 UTC

## Repo State

- `master` and `origin/master` are aligned at
  `356bc2e418af2f2f9aa8109dcf29a5ad7e291924`.
- GitHub CI run `25353544629` passed on `356bc2e` for lint, test, build,
  smoke, perf, and mobile UI.
- Live production is not current. Pages `/asset-manifest.json` still reports
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`.
- No production parity is claimed until the manual deploy path and live
  Pages/R2/WASM/service-worker/browser-smoke checks are refreshed.

## Last 24 Hours

- `9388f19` made jungle ground the primary material.
- `c62c1fb` rebalanced jungle ground cover.
- `1958477` aligned jungle placement and harness aim.
- `00e6bed` inventoried terrain asset candidates.
- `f80339c` stamped A Shau jungle routes.
- `5b1c015` batched world static features.
- `d30c3f9` culled parked aircraft visibility.
- `caf74b1` aligned jungle visibility and camera clearance.
- `e92523a` added terrain-aware navmesh bake invalidation.
- `356bc2e` aligned Projekt docs to the recovered navmesh state.

## What Actually Improved

- Terrain art direction moved toward green jungle floor instead of broad grey
  highland material.
- A Shau now has stamped jungle-trail route corridors rather than map-only
  route overlays.
- Static world features have accepted draw-call reduction evidence for the
  static-feature layer.
- Grounded/parked helicopter visibility now uses the existing air-vehicle
  distance rule before stopped helicopters skip updates.
- Nearby vegetation no longer starves completely when frame pressure drops
  general vegetation additions to zero.
- Terrain-lip camera clipping is guarded by rejecting grounded horizontal
  steps that would put the eye into a hillside.
- Registered prebaked navmesh/heightmap assets now have a bake manifest and
  deterministic terrain/feature signatures.

## Still Not Accepted

- A Shau navigation/runtime quality is not signed off. The current rerun clears
  the hard heap recovery failure, but terrain-stall warnings remain blocking
  evidence.
- The current local placement fix clears the Zone Control seed `137` warnings
  for `nva_bunkers` and `trail_opfor_egress`, but that fix is not shipped.
- Open Frontier seeds `137`, `2718`, `31415`, and `65537` are intentionally
  withheld until they have per-seed feature presets.
- Static-feature batching is not broad HLOD/culling acceptance.
- Vegetation behind hills still needs coarse terrain/cluster/Hi-Z-style
  occlusion or distance policy; do not solve it with per-instance raycasts.
- Small palm removal is now part of KB-TERRAIN: remove the short Quaternius
  palm (`giantPalm` / `palm-quaternius-2`) from
  runtime and shipped assets, preserve the taller `fanPalm` and `coconut`
  palm-like species, and spend that budget on grass or other ground cover. The
  vegetation backlog should also investigate EZ Tree or a similar licensed
  source generator for browser-budget GLBs that can be baked into TIJ
  impostors/LODs for missing Vietnam trees, understory, ground cover/grass, and
  trail-edge assets.
- KB-OPTIK still needs a near-stress visual-exception or human-review decision.
- Fixed-wing feel/probe validation is not complete for the latest terrain
  placement changes.

## Recommended Next Run Goal

Recommended goal: **KB-TERRAIN/NAV Acceptance Gate**.

Definition:

1. Land the Zone Control seed `137` placement-warning fix.
2. Add route-to-nav/path-quality proof for A Shau stamped trails and key
   scenario anchors.
3. Run A Shau with heap, terrain-stall, movement, and hit-contract guardrails.
4. Fold the small-palm removal/replacement decision into the vegetation pass.
5. Update Projekt docs with clear PASS/WARN/FAIL evidence.

Reason:

The last 24 hours moved a lot of terrain, culling, vegetation, and navmesh
plumbing. Before starting far-canopy, HLOD, or texture-upload work, the project
needs one clean acceptance gate that proves the terrain/nav foundation is not
drifting under the next optimization branch.
