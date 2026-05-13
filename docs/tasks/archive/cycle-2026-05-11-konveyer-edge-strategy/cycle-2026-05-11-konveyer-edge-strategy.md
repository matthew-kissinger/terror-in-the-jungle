# Cycle: KONVEYER-12 Finite Map Edge Strategy

Last verified: 2026-05-11

## Objective

Pick and prove the finite-map edge model for the WebGPU/TSL renderer direction.
The current render-only terrain apron is measurable and useful as diagnostic
coverage, but K10/K11 screenshots still show unfinished-looking world ends from
elevated and flight-scale views. This cycle decides the visual and gameplay
contract before changing CDLOD ranges, terrain shadow policy, or fog density.

This is vision-first work. Do not preserve WebGL-era edge compromises just
because they were previously shippable.

## Branch And Hard Stops

- Continue `exp/konveyer-webgpu-migration`.
- Do not merge to `master`.
- Do not deploy experimental renderer code.
- Do not update perf baselines.
- Do not accept WebGL fallback as proof.
- Do not edit fenced interfaces without explicit owner approval.

## Current Evidence

- Strict K11 CDLOD/pass proof for Open Frontier + A Shau:
  `artifacts/perf/2026-05-11T19-27-26-995Z/konveyer-scene-parity/scene-parity.json`.
- Strict K11 CDLOD/pass proof for Zone Control + Team Deathmatch + combat120:
  `artifacts/perf/2026-05-11T19-29-34-958Z/konveyer-scene-parity/scene-parity.json`.
- Every finite-edge pose reports `hasTerrainAtTarget=false`; the existing
  apron is not a complete world presentation model.
- Skyward terrain triangles are active CDLOD terrain submitted three times
  (two main submissions plus one shadow submission), so any edge model that
  adds terrain must budget both visible and shadow pass impact.
- A render-only horizon-ring prototype was tested in strict WebGPU across Open
  Frontier, Zone Control, Team Deathmatch, combat120, and A Shau at
  `artifacts/perf/2026-05-11T19-44-30-183Z/konveyer-scene-parity/scene-parity.json`.
  The numeric checks passed and the ring cost was only 384 main-pass triangles,
  but visual review rejected it: the screenshots still read as large slabs,
  walls, and hard cloud/terrain cut lines. The prototype was removed from the
  active terrain runtime; keep the artifact as rejected evidence only.
- First source-backed visual-extent slice was tested in strict WebGPU across
  Open Frontier, Zone Control, Team Deathmatch, combat120, and A Shau at
  `artifacts/perf/2026-05-11T20-21-57-694Z/konveyer-scene-parity/scene-parity.json`.
  This artifact also corrects the probe's Team Deathmatch runtime alias:
  `team_deathmatch` now starts the actual `tdm` mode instead of the default
  mode config.
- After visual review flagged the bright-lime `tall-grass.webp` source tile,
  the asset was palette-corrected to dark humid olive. Candidate review tiles
  live under `artifacts/perf/2026-05-11T20-30-tall-grass-palette/`; the live
  tile now has no bright-lime pixels by the local asset metric. Current
  force-built strict WebGPU proof is
  `artifacts/perf/2026-05-11T20-58-48-929Z/konveyer-scene-parity/scene-parity.json`.
- Current full-mode strict WebGPU proof after the cloud anchoring slice and
  rejected A Shau 1600m-collar experiment is
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`.
  It preserves the source-backed visual-extent evidence while recording the new
  `camera-followed-dome-world-altitude-clouds` model for every requested mode.
- A later A Shau-only experiment added DEM clamp detection, damped edge-slope
  continuation, a 1600m visual margin, and visual-edge terrain tint, then ran
  strict WebGPU proof at
  `artifacts/perf/2026-05-11T21-58-04-137Z/konveyer-scene-parity/scene-parity.json`.
  The backend/path proof was clean, but visual review rejected the finite-edge
  screenshot because the right side still read as a tan/gold synthetic band.
  That 1600m A Shau collar is rejected evidence, not the active runtime
  strategy.

## Candidate Strategies

### Low-detail far ring

Render a coarse outer terrain band beyond the playable world, using clamped or
procedural height/material data. Gameplay remains bounded to the playable map.
This best serves aircraft/elevated views but may add terrain/shadow cost unless
it has its own material and pass policy.

### Horizon skirt

Attach a low-cost vertical or sloped horizon skirt to the terrain edge. This is
cheaper than a far ring but can look artificial from aircraft if the silhouette
or material transition is visible.

### Edge fade with fog support

Fade terrain/material detail into atmosphere near the playable boundary. This
can support other strategies but must not be the only fix; hiding a hard world
end with fog alone is explicitly not accepted.

### Boundary clamp

Clamp aircraft/camera/gameplay before the edge becomes visible. This may be
valid for small combat modes but is not enough for A Shau or future flight
scenarios unless paired with visible world continuation.

## K12 Interim Decision

Do not accept a standalone skirt/ring as the finite-map solution. It is too
easy for that model to pass triangle and category probes while still looking
unfinished from aircraft and elevated infantry views.

Preferred next architecture: make visual terrain extent a first-class terrain
source concept, separate from playable/gameplay extent. For procedural modes,
generate a low-detail visual continuation from the same height/material source
and mask gameplay, nav, combat, hydrology, and spawning to the playable extent.
For A Shau, prefer low-resolution DEM continuation or source-derived outer
tiles over a synthetic slab. Edge fade, fog, and flight boundaries can support
the strategy, but none of them should own the illusion alone.

## K12 Implementation Slice

The active branch now has a first source-backed visual extent:

- `VisualExtentHeightProvider` preserves the playable height provider inside
  the gameplay square, then continues terrain outside the playable square by
  sampling the same source terrain and applying its edge-relative height delta.
- Terrain surface height/normal textures are baked over the visual extent when
  a visual margin exists; prepared playable heightmaps are still used directly
  only when the visual margin is zero.
- CDLOD covers `worldSize + visualMargin * 2`, while LOD ranges remain tied to
  playable scale so the larger visual extent does not explode skyward tile
  selection.
- Open Frontier uses a 1600m visual margin, Zone Control uses 1600m, actual
  Team Deathmatch uses 1200m, and combat120 uses 900m. A Shau remains at the
  conservative 200m margin until it has real outer DEM/source data.
- The terrain material now receives playable and visual extent uniforms so the
  visual-only collar can trend toward far-canopy color. This is a supporting
  treatment for source-backed visual terrain, not a substitute for real A Shau
  outer data.

Latest current-code strict WebGPU proof:

`artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`

Skyward terrain submission after the source-backed visual extent:

| Mode | Playable | Visual margin | Sky tiles | Terrain submit triangles |
| --- | ---: | ---: | ---: | ---: |
| Open Frontier | 3200m | 1600m | 174 | 1,336,320 |
| Zone Control | 800m | 1600m | 52 | 399,360 |
| Team Deathmatch | 400m | 1200m | 40 | 307,200 |
| combat120 | 200m | 900m | 28 | 215,040 |
| A Shau Valley | 21136m | 200m | 200 | 1,536,000 |

Visual review:

- Open Frontier, Zone Control, Team Deathmatch, and combat120 no longer read as
  a cheap wall or slab from the finite-edge camera. The direction is accepted
  for procedural/small-map continuation, but material, water, vegetation, and
  cloud/horizon presentation still need art-direction review.
- The old `tall-grass.webp` tile was too saturated and read as bright game-lawn
  green. It is now a dark olive humid-grass tile; this fixes that source asset
  without claiming the whole terrain/lighting palette is solved.
- A Shau remains blocked. With only the current 21km DEM coverage and a 200m
  apron, the finite-edge view still reads as a flat data boundary. Do not fake
  this with a skirt; solve it with a low-resolution DEM collar, source-derived
  outer terrain, flight/camera boundary policy, or an explicit hybrid.
- The rejected 1600m A Shau experiment is useful because it proves the problem
  is not simply "more terrain beyond the edge." Without real outer source data
  or an explicit airspace/camera boundary, the result still looks unfinished.
- The finite-edge check intentionally remains `warn`; screenshot review, not a
  numeric `hasTerrainAtTarget` flag, owns acceptance.

## Exit Criteria

- One edge strategy, or explicit hybrid, is selected for small maps and A Shau.
- Strict WebGPU proof covers Open Frontier, Zone Control, Team Deathmatch,
  combat120, and A Shau.
- Ground, elevated, skyward, and finite-edge poses prove the edge no longer
  reads as unfinished terrain.
- CDLOD node/ring evidence and terrain pass attribution are recorded before and
  after the candidate.
- Gameplay/playable boundaries remain separate from visual terrain coverage.
- Remaining blockers are assigned to terrain, atmosphere, mode boundary,
  aircraft camera policy, or asset/material work.
