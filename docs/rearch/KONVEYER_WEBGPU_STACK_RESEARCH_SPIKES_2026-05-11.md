# KONVEYER WebGPU Stack Research Spikes

Last verified: 2026-05-11

## Purpose

This memo records the research spike requested during KONVEYER-10. It is not a
new acceptance gate and it does not redefine parity as WebGL cloning. The point
is to identify what the WebGPU/TSL stack now makes possible, what old renderer
assumptions should be discarded, and which follow-up spikes best align with the
game vision: dense jungle combat, readable soldiers, flight-scale atmosphere,
finite maps that do not look unfinished from the air, water as a connected
scene/physics/gameplay surface, and eventual materialization tiers for 3,000
combatants.

Hard stops still apply: no `master` merge, no production deploy, no perf
baseline update, no WebGL fallback proof, and no fenced-interface edit.

## Sources Checked

- Three.js `WebGPURenderer` docs and manual:
  [API](https://threejs.org/docs/pages/WebGPURenderer.html),
  [manual](https://threejs.org/manual/en/webgpurenderer).
- Three.js Shading Language:
  [TSL docs](https://threejs.org/docs/TSL.html).
- WebGPU API and profiling references:
  [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API),
  [WebGPU timing](https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html).
- WebGPU examples:
  [WebGPU Samples](https://github.com/webgpu/webgpu-samples),
  [Three.js compute water](https://threejs.org/examples/webgpu_compute_water.html),
  [Three.js compute fluid particles](https://threejs.org/examples/webgpu_compute_particles_fluid.html).
- Terrain LOD:
  [CDLOD heightmap paper](https://studylib.net/doc/18275382/continuous-distance-dependent-level-of-detail-for-rendering).
- Clouds:
  [The Real-time Volumetric Cloudscapes of Horizon Zero Dawn](https://d3d3g8mu99pzk9.cloudfront.net/AndrewSchneider/The-Real-time-Volumetric-Cloudscapes-of-Horizon-Zero-Dawn.pdf).
- Water:
  [GPU Gems water chapter](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models),
  [GDC Open-World Water Rendering and Real-Time Simulation](https://www.gdcvault.com/play/1028829/Advanced-Graphics-Summit-Open-World).
- ECS/materialization:
  [ECSY](https://github.com/ecsyjs/ecsy), cloned for local reference at
  `C:\Users\Mattm\X\games-3d\_research\ecsy`, commit
  `c62506f1883bb0cd4b7e0408c8ee7bad0bc2f130`.
- Community signal, not authority:
  [VOIDSTRIKE Three.js/WebGPU RTS notes](https://www.reddit.com/r/threejs/comments/1rus2v8/building_an_rts_with_threejs_webgpu_perinstance/).

## Spike 1: Renderer Direction

Three's WebGPU path is a renderer and material architecture shift, not just a
new backend behind the old scene. The current docs describe
`WebGPURenderer` as a WebGPU-first renderer with backend fallback capability;
for this branch, fallback remains diagnostic only. The manual also makes clear
that WebGPU work is tied to node materials, TSL, and a different
post-processing stack.

KONVEYER implication:

- Keep strict WebGPU as proof, but stop treating old WebGL shader idioms as the
  target implementation.
- Prefer TSL/node material ownership for terrain, vegetation, NPC impostors,
  water, fog, and later post effects when the material needs to survive both
  WebGPU pass rules and future compute-driven data.
- Track renderer backend, pass category, and material family in evidence. A
  visual probe that only says "looks closer to WebGL" is too weak for this
  branch.

Near-term architecture rule:

- Existing compatibility layers may stay while migration is active, but new
  visual work should be WebGPU/TSL-native unless it is explicitly a diagnostic
  comparison.

## Spike 2: Profiling And Frame Attribution

WebGPU timestamp queries are useful but optional and can mislead if they are
treated as the whole performance story. The more useful immediate path for this
repo is category/pass attribution plus CPU frame-budget child timings, then a
later GPU pass-timing spike where browser support is verified.

KONVEYER implication:

- Keep `World` aggregate timing for continuity, but child timings must remain
  visible enough to make budget decisions.
- Continue render-submission category attribution for terrain, vegetation,
  NPCs, atmosphere, world features, overlays, and shadows.
- Add GPU timestamp queries only as a follow-up proof tool, not as the sole
  perf gate.

Near-term architecture rule:

- No optimization should begin from the top-level `renderer.info.triangles`
  number alone. Require category and pass ownership first.

## Spike 3: Terrain, Skyward Triangles, And Edges

The KONVEYER-10 scene probe already shows skyward triangle spikes are dominated
by terrain, including shadow submission. CDLOD research points to the exact
failure mode to examine: LOD based on incomplete distance or poor observer
height handling can over-allocate terrain detail in flight/elevated views.

KONVEYER implication:

- Treat skyward terrain spikes as a CDLOD selection/frustum/shadow ownership
  problem before touching vegetation or NPC budgets.
- Add active terrain-tile and LOD-ring evidence for flight/elevated camera
  views.
- The current render-only terrain apron is not final. It proves there is an
  edge strategy hook, but screenshots still show hard world-end bands.

Recommended next terrain spike:

1. Capture selected CDLOD nodes/rings for ground, horizon, and skyward cameras.
2. Separate main terrain triangles from shadow terrain triangles.
3. Test one low-detail far-ring or horizon-skirt strategy against Zone Control,
   TDM, combat120, Open Frontier, and A Shau.
4. Reject fog-only hiding unless terrain geometry is already coherent.
5. For A Shau, treat synthetic DEM-edge extrapolation as rejected unless visual
   review proves otherwise. The 1600m collar experiment produced geometry but
   still read as a tan/gold artificial band, so the real decision is source
   data, boundary policy, or a documented hybrid.

## Spike 4: Clouds And Atmosphere

The current camera-followed sky dome is defensible for clipping safety, but the
cloud field cannot remain visually attached to the player. The Horizon
cloudscape material points toward an authored atmospheric volume/layer model:
weather has scale, altitude, coverage, and motion independent from the camera.

KONVEYER implication:

- The current world/altitude-projected cloud-deck noise is an anchoring fix,
  not the final representation.
- Straight cloud cutoffs, hard bands, and alignment seams are representation or
  asset-authoring failures, not color-tuning failures.
- A future sky model should distinguish analytic sky color, fog color, cloud
  coverage, cloud shadow/occlusion, and world/altitude anchoring.

First K13 implementation finding:

- `HosekWilkieSkyBackend` now samples clouds by projecting each sky direction
  into an authored 1,800m cloud deck in world X/Z instead of sampling texture
  `u/v` coordinates. This keeps the dome camera-followed for clipping safety
  while removing the old texture-seam anchoring model.
- Strict WebGPU proof at
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`
  records `cloud model=camera-followed-dome-world-altitude-clouds` in Open
  Frontier, Zone Control, actual Team Deathmatch, combat120, and A Shau with
  zero console/page errors.
- This is still a dome-texture cloud pass. It does not solve cloud art
  direction, weather layering, cloud shadows, low-resolution/blocky puffs, or
  A Shau's flat finite data boundary.

Recommended next atmosphere spike:

1. Build one small world/altitude-authored cloud layer prototype.
2. Prove it from ground, aircraft climb, and high/elevated finite-edge views.
3. Decide whether clouds should come from procedural volume/slices, regenerated
   cloud assets, or a hybrid authored weather texture stack.

## Spike 5: Assets And Pixel Forge

WebGPU can expose source-asset problems that WebGL-era materials hid. This is
especially likely for impostor atlases, alpha crops, baked lighting, normal
maps, mips, compression, and color-space assumptions.

KONVEYER implication:

- Do not compensate indefinitely in shader code for bad source bakes.
- Vegetation and NPC probes should separate raw atlas/crop, material lighting,
  fog, and final composite, then decide whether the fix belongs in Pixel Forge,
  the runtime material, or both.
- WebGPU asset acceptance should become an explicit Pixel Forge target:
  neutral albedo bakes, correct alpha coverage, mip-safe silhouettes, normal
  map orientation checks, and LOD scale/anchor agreement.
- The 2026-05-11 `tall-grass.webp` correction is the first concrete example:
  the original generated tile had bright-lime pixels that fought the Vietnam
  jungle palette, so it was corrected at the source asset level rather than
  hidden in the terrain shader. Future Pixel Forge terrain requests should ask
  for humid olive/deep tropical greens, no yellow/orange, and uniform density.

Recommended next asset spike:

1. Pick a small vegetation/NPC shortlist from the current failing visual cases.
2. Capture source texture, crop, mip, material-lit, fogged, and final outputs.
3. Produce a Pixel Forge rebake/edit request only when raw evidence supports it.
4. Keep human visual review as the final design decision.

2026-05-11 first K14 audit:

- `npm run check:konveyer-asset-material -- --input artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`
  writes
  `artifacts/perf/2026-05-11T22-24-56-014Z/konveyer-asset-material-audit/asset-material-audit.json`.
- The audit turns the strict scene-probe JSON into a source-vs-runtime packet.
  It records raw atlas metrics, material lighting lift, fog state, and whole
  pose final-composite proxies for vegetation and NPC impostors.
- Current result is WARN, not acceptance: NPC raw atlases are very dark
  (`lumaMean` about 0.051-0.053) while runtime uniforms lift them hard
  (`npcExposure=1.2`, `minNpcLight=0.92`, `paritySaturation=1.6`); NPC normal
  maps are absent in the active probe; vegetation impostor alpha is sparse
  (`alphaCoverage` about 0.095) and still carries a bright green tint bias.
- The next proof should add per-object final-composite crops and close-GLB
  comparison before issuing a Pixel Forge rebake/edit request. The current
  audit is enough to stop treating the vegetation/NPC problem as simple WebGL
  color parity.
- First crop proof
  `artifacts/perf/2026-05-11T22-41-07-556Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  resolves strict WebGPU and captures final-frame crop attempts for Open
  Frontier and A Shau. It remains WARN: vegetation crops are still
  green/saturated, the Open Frontier NPC crop is background-dominant, A Shau has
  no cropable NPC instance, and no visible close-GLB comparison is available.
  Next K14 work should improve target framing and add an intentional
  close-GLB/impostor comparison scene before any Pixel Forge rebake/edit
  request.
- Close-model telemetry follow-up
  `artifacts/perf/2026-05-11T23-18-06-820Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  proves the bounded startup prewarm now runs before first reveal in Open
  Frontier: startup marks record `npc-close-model-prewarm.*`, and 8 close GLBs
  are active under strict WebGPU. It also proved the then-open policy problem:
  14 NPCs were inside the initial close radius and 6 remained impostors because
  the old fixed close cap/pool policy could not materialize the whole crowded
  spawn cluster. Dev/perf builds now expose the first nearest-NPC render-mode
  debug surface as `window.npcMaterializationProfile()`.
- Follow-up proof
  `artifacts/perf/2026-05-11T23-56-05-104Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  confirms the strict WebGPU crop probe consumes
  `window.npcMaterializationProfile()` rather than private renderer maps for
  nearest materialization rows. The hard-near anti-pop priority makes nearest
  review rows close GLBs with weapons and clears `pool-loading` to zero. The
  residual signal at that checkpoint was still architectural: crowded starts
  could exceed the old fixed total cap and leave fallback impostors.
- The same proof plus
  `artifacts/perf/2026-05-11T23-56-fern-palette/metrics.json` records the
  first fern source-atlas palette edit toward darker humid olive. Final
  vegetation now reads less mint, but green-dominance metrics still warn
  because the crop is unsegmented green foliage. Next vegetation work should
  improve object/background segmentation and Pixel Forge source review rather
  than keep darkening the shader until a scalar passes.
- The isolated close-GLB crop proof at
  `artifacts/perf/2026-05-12T01-03-47-834Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  binds close-GLB candidate selection to the review-pose combatant when that
  combatant is active, derives body bounds from the actual close-model
  geometry, and hides terrain/vegetation for the material crop. It records 8
  visible close GLBs, weapons present, no request failures,
  `selectionReason=preferred-active-close-model`, and a visible soldier/weapon
  crop under strict WebGPU. The warning at that checkpoint was a
  cap/materialization and integrated-scene policy problem, not evidence that
  nearby WebGPU NPCs must start as impostors.
- The bounded spawn-residency proof at
  `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  records 11 visible nearby close GLBs, effective close cap 11, zero close
  fallback records, all nearest startup/review rows as `close-glb` with
  weapons, and the same public materialization telemetry/body-bound crop path.
  It remains WARN for probe-shape reasons: the generic NPC impostor crop has no
  candidate after nearby actors promote to close GLBs, and the isolated close
  crop is bright against a neutral hidden-terrain/vegetation frame. Treat the
  remaining work as multi-mode reserve verification, cap/budget review, and
  Phase F materialization-tier policy.
- The same proof adds startup `terrain-features.compile` attribution for the
  UI "Compiling features" step: the Open Frontier cost is dominated by the
  1024-grid stamped heightmap rebake (~52.1ms), not shader compilation.
  Feature list compile is ~5.5ms and stamped-provider creation is ~2.6ms.

## Spike 6: ECSY And Materialization

The ECSY clone is useful as a reference vocabulary: registered components,
ordered systems, query result sets, reactive added/removed/changed queues,
system-state components, and object pools. It is not a direct dependency
recommendation. The repository is archived, and this game already has
`GameSystem`, `SystemUpdater`, scheduler groups, event bus, pools, and
materialization concepts.

KONVEYER implication:

- Do not replace the engine with ECSY.
- Do extract ideas for Phase F: query-owned iteration, reactive set changes,
  materialization-state components, stable system order, and pools that make
  entity churn explicit.
- The right next step is a repo-native ECS/materialization memo, not an npm
  install.

Recommended next materialization spike:

1. Map current combatant data into proposed hot/cold/materialized component
   lanes.
2. Define which systems need query-style iteration and which should remain
   service-style managers.
3. Keep rendering materialization separate from simulation truth.
4. Design for 120 live combat proof now and 3,000 combatant tiers later.
5. Extend the initial-spawn residency contract beyond the first Open Frontier
   proof: combatants within the close-model radius or first camera frustum
   should either have prewarmed close-model pool slots before reveal or be
   deliberately classified as acceptable impostors with a visible fallback
   reason, with per-mode cap/budget data.

## Spike 7: Terrain Occlusion And Fire Authority

The report that enemies can still be shot through terrain should be treated as
an architecture warning. It may be a local LOS bug, but it can also indicate
that render terrain, collision/effective terrain height, navmesh placement,
cover, combat raycasts, active-driver validation, and materialization state do
not share one authoritative occlusion contract.

KONVEYER implication:

- Do not tune weapon accuracy, NPC behavior, or raycast cadence until the
  shooter-target-terrain contract is known.
- A WebGPU renderer pass can make terrain visible while combat still uses stale
  or simplified CPU terrain data. Visual proof alone is not combat-authority
  proof.
- Any cache or async optimization for LOS/cover must name invalidation
  ownership, terrain source, materialization dependency, and perf impact.

Recommended next occlusion spike:

1. Reproduce or disprove player fire through terrain with a browser probe.
2. Record shooter position, target position, weapon ray, terrain height,
   effective collision height, LOS result, and hit outcome.
3. Compare player fire, NPC fire, AI LOS, active-driver fire validation, and
   cover query ownership.
4. Decide whether the fix belongs in combat raycasts, terrain query authority,
   nav/materialization placement, cover cache invalidation, or a shared
   occlusion service.

First K11 implementation finding:

- `CombatantCombat` had a real player-fire fallback gap: close-range shots
  under 200m used the near-field terrain BVH but skipped the CPU height-profile
  fallback entirely. The first patch changes that from "bypass" to
  "strong-ridge confirmation" for actual player fire and preview fire, with
  targeted Vitest proof at
  `artifacts/perf/2026-05-11T19-05-00-000Z/konveyer-terrain-fire-authority/vitest-combatant-combat.json`.
- Strict WebGPU browser proof at
  `artifacts/perf/2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority/terrain-fire-authority.json`
  found a real Open Frontier shot line where the terrain BVH returned no hit
  but effective terrain height blocked the combat ray. That makes the next
  architecture decision sharper: the renderer can show terrain, the height
  provider can know terrain, and the BVH authority can still miss it.
- This is a local authority repair, not the final architecture. NPC fire,
  AI LOS, cover queries, active-driver validation, nav placement, and
  materialization/cache invalidation still need a shared contract decision.
- Continued reports of shooting enemies through terrain after this first
  player-fire slice should be assumed systemic until disproven. The key
  architecture question is whether terrain authority is one query contract with
  explicit cache ownership, or several partial shortcuts that happen to agree
  only in easy cases.

## Spike 8: Hydrology And Water

Water should be reviewed before the larger first-principles rearchitecture
pass. GPU water references split the problem usefully: large surfaces can use
physically motivated wave sums and normal maps, while interactive water and
flow can use cheaper height/velocity fields or localized compute. Open-world
water talks emphasize data ownership: height, velocity, foam, adaptive mesh,
and simulation/rendering integration.

KONVEYER implication:

- VODA should not be treated as separate cosmetic backlog while evaluating the
  scene architecture.
- Hydrology needs a visible channel/surface authority, not only CPU queries.
- Water shader work should be linked to atmosphere lighting/fog and terrain
  intersection behavior.
- Buoyancy/swimming/wading/watercraft should share the water query contract
  rather than each inventing a local height test.

Recommended next water spike:

1. Audit current `WaterSystem` global plane, hydrology river mesh, and query API.
2. Choose the first shader target: still river/pond water, flowing channels, or
   interactive local ripples.
3. Prove water/terrain intersections in Open Frontier and A Shau.
4. Add a minimal buoyancy/query consumer before designing watercraft.

2026-05-11 water pass:

- `npm run check:hydrology-bakes` passes, proving the current hydrology bake
  artifacts still match `public/data/hydrology/bake-manifest.json`.
- Source audit
  `artifacts/perf/2026-05-11T21-33-05-844Z/projekt-143-water-system-audit/water-system-audit.json`
  records the current contract as WARN: global water remains a standard
  fallback plane, hydrology river strips are the map-space channel authority,
  and final visual water is not accepted.
- Runtime proof
  `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
  passes Open Frontier and A Shau with hydrology meshes visible, query probes
  valid, and `sampleWaterInteraction` returning `source=hydrology`,
  `immersion01=0.5`, and `buoyancyScalar=0.5` one meter below the focused
  river surface.
- The proof screenshots are not visual acceptance. Open Frontier still reads
  washed out around isolated river strips and A Shau remains very dark/matte.
  The next WebGPU-native target should be a TSL hydrology-channel water
  material plus terrain-intersection proof, followed by one gameplay consumer
  of the interaction sample.

## What This Opens

- Compute-assisted culling and visibility work, once evidence proves the CPU
  attribution bottleneck and WebGPU feature availability.
- TSL materials that share fog, atmosphere, and color-space policy across
  terrain, vegetation, NPC impostors, water, and world features.
- Render-pass aware budgets: main terrain, terrain shadow, atmosphere/cloud,
  vegetation impostor, NPC impostor, and overlays can be discussed separately.
- Asset acceptance for WebGPU, not just "loads in the old material."
- A Phase F materialization design where simulation truth, render residency,
  and visual representation are intentionally separate.

## Explicit Non-Goals

- Do not add ECSY as a dependency in this cycle.
- Do not make every manager into an ECS system.
- Do not use WebGL fallback as proof.
- Do not hide terrain-edge failure with fog alone.
- Do not tune probes until assets look numerically close while the scene still
  reads wrong.
- Do not make cloud color tweaks a substitute for fixing hard bands, seams, or
  player-attached weather.

## Recommended Follow-Up Order

1. Continue from the remote branch head on `exp/konveyer-webgpu-migration`.
   The latest strict WebGPU close-NPC and startup-compile proof is
   `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
   Do not restart from the older K0-K9 branch-review packet.
2. K11 terrain budget spike: CDLOD node/ring evidence, main-vs-shadow terrain
   ownership, and a flight/elevated skyward proof. First pass complete in
   `artifacts/perf/2026-05-11T19-27-26-995Z/konveyer-scene-parity/scene-parity.json`
   and `artifacts/perf/2026-05-11T19-29-34-958Z/konveyer-scene-parity/scene-parity.json`.
3. K11 occlusion spike: prove or disprove fire-through-terrain and name the
   shared combat/terrain/nav/materialization authority. First player-fire gap
   proved and locally repaired; keep DEFEKT-6 open for shared authority work.
4. K12 finite-edge spike: standalone ring/skirt prototype rejected in
   `artifacts/perf/2026-05-11T19-44-30-183Z/konveyer-scene-parity/scene-parity.json`;
   first source-backed visual-extent slice proved in
   `artifacts/perf/2026-05-11T20-21-57-694Z/konveyer-scene-parity/scene-parity.json`
   and force-built again after tall-grass palette correction at
   `artifacts/perf/2026-05-11T20-58-48-929Z/konveyer-scene-parity/scene-parity.json`.
   Continue this path for procedural/small maps, but keep A Shau blocked until
   it has a low-resolution DEM collar, source-derived outer terrain, or an
   explicit flight/camera boundary model. A Shau's 1600m DEM-edge extrapolation
   proof at
   `artifacts/perf/2026-05-11T21-58-04-137Z/konveyer-scene-parity/scene-parity.json`
   is rejected visual evidence because the collar still reads synthetic. The
   same earlier artifact fixes the TDM probe alias so actual `tdm` mode is now
   covered.
5. K13 cloud representation spike: first world/altitude-projected cloud-deck
   slice proved in
   `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`.
   Continue with visual review, possible texture resolution/runtime budget
   work, cloud shadows/occlusion, weather layering, or a regenerated/authored
   cloud asset path.
6. K14 Pixel Forge WebGPU asset acceptance spike for vegetation and NPC
   impostors. First audit is
   `artifacts/perf/2026-05-11T22-24-56-014Z/konveyer-asset-material-audit/asset-material-audit.json`;
   first crop proof is
   `artifacts/perf/2026-05-11T22-41-07-556Z/konveyer-asset-crop-probe/asset-crop-probe.json`;
   continue with tighter per-object framing, close-GLB comparison, and a small
   Pixel Forge rebake/edit shortlist.
7. VODA hydrology/water pass: first source/runtime/query/interaction proof is
   recorded in
   `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`.
   Continue with a WebGPU/TSL hydrology-channel water material, terrain
   intersections, flow/foam, one buoyancy or swimming consumer, and later
   watercraft.
8. Phase F materialization/ECS memo using ECSY as vocabulary only.
9. Principles-first scene rearchitecture review using the WebGPU/TSL branch as
   the baseline, not old WebGL parity as the finish line.
