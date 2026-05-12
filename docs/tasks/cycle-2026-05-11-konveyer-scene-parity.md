# Cycle: KONVEYER Scene Parity And Frame-Budget Attribution

Last verified: 2026-05-11

## Objective

Continue `exp/konveyer-webgpu-migration` from the completed KONVEYER-0 through
KONVEYER-9 branch-review packet into KONVEYER-10. Preserve strict WebGPU proof
with no WebGL fallback in the acceptance path. Terrain color is accepted for
now; this cycle owns rest-of-scene visual parity and frame-budget attribution.

Parity in this cycle means "the WebGPU implementation serves the game vision
at least as well as the former WebGL implementation." Treat WebGL as the
previous attempt at the vision, not a pixel-perfect aesthetic target. If a
WebGPU-native solution better supports a dense Vietnam jungle battlefield,
readable combatants, flight-scale views, stable performance, or future 3,000
combatant materialization tiers, prefer that solution and document the
rationale.

When this initial KONVEYER migration/parity objective is satisfied, do not
declare the renderer architecture finished. The next closure step is a
principles-first rearchitecture review against the vision: what should the
scene, material, atmosphere, culling, and materialization systems become if we
were designing them properly for this game now, using the migrated WebGPU/TSL
path as the new baseline.

Before that principles-first rearchitecture pass, run a water/hydrology review
pass. The scene cannot be considered vision-ready until hydrology visibility,
water shader/material behavior, water/terrain intersections, interaction,
buoyancy/swimming, and later watercraft integration are reviewed as connected
systems instead of isolated VODA backlog items.

Also treat assets as part of the rendering contract. Some vegetation/NPC/cloud
defects may come from atlases, impostor bakes, normal maps, alpha crops, LOD
source, compression, or color-space assumptions that were tuned around the old
WebGL implementation. If evidence points there, prefer regenerating or editing
assets through Pixel Forge or the asset pipeline over stacking shader
compensation on top of bad source data.

## Branch

- Continue `exp/konveyer-webgpu-migration`.
- Do not merge to `master`.
- Do not deploy experimental renderer code.
- Do not update `perf-baselines.json`.
- Do not edit `src/types/SystemInterfaces.ts` without explicit owner approval.

## Required Reading

1. `AGENTS.md`
2. `docs/state/CURRENT.md`
3. `docs/DIRECTIVES.md` (`KONVEYER-10`)
4. `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
5. `docs/rearch/KONVEYER_TERRAIN_LIGHTING_ANALYSIS_2026-05-11.md`
6. `docs/tasks/konveyer-full-autonomous-migration.md`
7. `docs/state/perf-trust.md`
8. `docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md`

## Round Schedule

| Round | Tasks | Cap |
|-------|-------|-----|
| 1 | `world-budget-attribution`, `vegetation-npc-parity-probes`, `skyward-triangle-attribution` | 3 |
| 2 | `atmosphere-sky-anchor`, `finite-map-edge-strategy` | 2 |
| 3 | `strict-webgpu-cross-mode-proof`, `docs-review-packet` | 2 |

## Task Scope

### world-budget-attribution

- Split or expose child timings under the aggregate `World` bucket: atmosphere
  sky texture, atmosphere light/fog, weather, water, and zone/ticket work.
- Keep the existing aggregate `World` timing for continuity.
- Update perf summaries or runtime samples so child timings are visible.

### vegetation-npc-parity-probes

- Add strict-WebGPU evidence for vegetation and NPC impostors that separates
  raw atlas/crop, material lighting, fog contribution, and final output.
- Compare NPC impostors against close GLBs where possible.
- Use the evidence to identify whether the material model supports the intended
  visual hierarchy: dark canopy mass, non-neon foliage, readable but grounded
  soldiers, and coherent fog with terrain/GLBs. Do not tune only to satisfy a
  probe number.
- If raw atlas/crop/normal evidence shows the WebGPU material is exposing bad
  source assumptions, file the fix as Pixel Forge regeneration, impostor rebake,
  texture edit, or LOD/source-asset work instead of forcing shader parity.
- Do not broadly retune terrain color unless the strict terrain packet fails
  again. Source texture outliers are separate: if an asset visibly fights the
  Vietnam jungle palette, fix the asset rather than compensating in shader code.

### skyward-triangle-attribution

- Capture the reported high triangle-count case while looking skyward.
- Attribute renderer counters by scene category and pass: terrain, shadows,
  vegetation, NPCs, world features, overlays.
- Record whether WebGPU `renderer.info` aggregates passes differently from the
  team's mental model.

### atmosphere-sky-anchor

- Fix or document `todCycle.startHour` phase drift before tuning atmosphere by
  eye.
- Choose a sky/cloud anchoring path that keeps flight views stable without
  bringing back the retired finite flat cloud plane as a WebGPU blocker.
- Preferred implementation direction: keep the sky dome camera-followed for
  clipping safety, but make cloud features world-offset or otherwise
  world/altitude-authored so they read as weather, not a texture attached to
  the player. The current implementation slice samples a projected
  world/altitude cloud deck inside the camera-followed sky dome.
- The current dome-texture cloud pass is interim. Straight-line cloud cutoffs,
  hard bands, obvious texture seams, blocky low-resolution puffs, or clouds
  that do not align with terrain/flight motion should be treated as
  representation or asset-authoring defects, not just tuning problems.

### finite-map-edge-strategy

- Pick a finite-map edge solution for Zone Control and similar small maps:
  terrain apron, low-res far ring, edge fade, flight clamp, or documented
  equivalent.
- Judge edge strategy against the intended combat space and flight/readability
  goals. A small mode can keep a bounded playable square, but elevated views
  should not expose an obviously unfinished world.
- Include visual evidence from a flight/elevated view.

### strict-webgpu-cross-mode-proof

- Run strict-WebGPU Open Frontier, Zone Control, Team Deathmatch, combat120,
  and A Shau short captures or document exact blockers.
- Do not refresh baselines.

### docs-review-packet

- Update `docs/rearch/KONVEYER_PARITY_2026-05-10.md` with artifact paths and
  remaining decisions.
- Keep `docs/state/CURRENT.md`, `docs/DIRECTIVES.md`, and this brief aligned.
- Preserve the follow-up loop explicitly: finish the scoped migration/parity
  objective, run hydrology/water review, then run the principles-first
  rearchitecture/research spike covering optimization, assets, and vision-led
  renderer architecture.

## Success Criteria

- Strict WebGPU remains the proof path and fallback success is not accepted.
- Terrain color remains accepted unless new evidence fails the terrain packet.
- Vegetation/NPC parity evidence exists with staged material contributions.
- `World` timing is actionable below the aggregate bucket.
- Skyward triangle counts have attribution before optimization choices.
- Sky/cloud and finite-map edge strategies are selected with evidence.
- Cross-mode strict-WebGPU captures are linked or blockers are explicit.
- `npm run lint:docs` passes for documentation changes.

## Current Evidence Notes

- Remote checkpoint for fresh agents:
  `ca587625` on `origin/exp/konveyer-webgpu-migration`
  (`feat(konveyer): stabilize webgpu scene parity cycle`). Continue from this
  branch head; do not restart from the older KONVEYER-0 through KONVEYER-9
  packet.
- Strict WebGPU renderer matrix: `artifacts/perf/2026-05-11T18-17-20-942Z/konveyer-renderer-matrix/matrix.json`.
- Scene parity probe, Open Frontier + Zone Control:
  `artifacts/perf/2026-05-11T18-30-56-546Z/konveyer-scene-parity/scene-parity.json`.
- Scene parity probe, Team Deathmatch + combat120 + A Shau:
  `artifacts/perf/2026-05-11T18-31-39-756Z/konveyer-scene-parity/scene-parity.json`.
- Strict WebGPU `perf-capture` blocker:
  `artifacts/perf/2026-05-11T18-37-33-773Z/summary.json` failed before
  runtime samples with `page.addScriptTag: Target page, context or browser has
  been closed`. K11 follow-up separates this historical target-closed failure
  from attribution overhead and records the current summary-attribution command
  shape in `docs/tasks/cycle-2026-05-11-konveyer-k11-proof-terrain-budget.md`.
- Research spike memo:
  `docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md`.
- The skyward triangle issue is terrain-dominated in current strict WebGPU
  evidence, with terrain submitted as two main passes plus one shadow pass.
- Vegetation/NPC asset-material audit:
  `artifacts/perf/2026-05-11T22-24-56-014Z/konveyer-asset-material-audit/asset-material-audit.json`
  turns the strict WebGPU material probe JSON into source-vs-runtime findings:
  dark raw NPC atlases with heavy material lift, absent NPC normal maps in the
  active probe, sparse vegetation alpha, and bright green vegetation tint bias.
  It is K14 input, not visual acceptance, because per-object final-composite
  crops are still missing.
- First final-frame crop probe:
  `artifacts/perf/2026-05-11T22-41-07-556Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  resolves strict WebGPU and captures representative crop attempts. It stays
  WARN because vegetation crops are green/saturated, the Open Frontier NPC crop
  is background-dominant rather than a clean readable soldier crop, A Shau has
  no cropable NPC instance, and no close-GLB comparison is visible.
- Close-model telemetry follow-up:
  `artifacts/perf/2026-05-11T23-18-06-820Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  resolves strict WebGPU in Open Frontier and records the bounded startup
  close-model prewarm before first reveal. It proves the close-GLB path is live
  (`activeClose=8`, weapons present on active nearest rows), but it also proves
  the remaining startup/materialization weakness: 14 NPCs were inside the
  initial close radius and 6 stayed impostors because the current close cap and
  pool policy cannot materialize the whole crowded spawn cluster. The design
  fix is deterministic initial close-model residency policy for spawn-adjacent
  actors, not WebGL parity tuning. Dev/perf builds now expose
  `window.npcMaterializationProfile()` so reviewers can inspect the nearest NPC
  render modes and fallback reasons without reaching into renderer internals.
- Public-profile crop probe:
  `artifacts/perf/2026-05-11T23-56-05-104Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  confirms the strict WebGPU crop probe now consumes
  `window.npcMaterializationProfile()` for both initial and review telemetry.
  After the hard-near anti-pop priority slice, `pool-loading` clears to zero
  and nearest review rows are close GLBs with weapons. It remains WARN because
  crowded starts can still exceed the fixed close-GLB cap and leave total-cap
  fallback impostors.
- Fern palette slice:
  `artifacts/perf/2026-05-11T23-56-fern-palette/metrics.json` records the
  source-atlas candidate used for the fern imposter. The latest crop proof
  above shows darker final vegetation, but the crop still trips the simple
  green-dominance metric. Do not keep tuning to that number; the next asset
  step is better object/background segmentation and Pixel Forge source review
  for flat-color ground cover.
- Close-GLB crop framing remains weak. A later probe at
  `artifacts/perf/2026-05-12T00-15-01-972Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  hides vegetation for the isolated close-GLB material crop and widens the
  frame, but it still does not reliably capture a full readable soldier. The
  next proof should use object-ID, stencil, or known combatant skeleton/body
  bounds rather than color-dominance heuristics.
- Target-bound close-GLB proof:
  `artifacts/perf/2026-05-12T01-03-47-834Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  prefers the review-pose combatant in active close-model selection and records
  `selectionReason=preferred-active-close-model`. It proves the inspected
  nearby actor can be a close GLB with weapon under strict WebGPU, with 8
  visible close GLBs, no request failures, public materialization telemetry,
  and geometry-derived body bounds. The isolated material crop hides
  vegetation and terrain so the soldier/weapon is visible for review. The
  proof remains WARN because total-cap fallback can still leave some
  crowded-spawn actors as impostors and the isolated crop is bright against the
  neutral proof frame. This is a materialization-tier policy question, not a
  WebGL parity target.
- Startup "Compiling features" attribution:
  the same strict WebGPU proof records Open Frontier terrain feature compile
  marks. The UI wait is mostly the 1024-grid stamped heightmap rebake
  (~52.1ms), not shader compilation; feature list compile is ~5.5ms and
  stamped-provider creation is ~2.6ms. First optimization candidate:
  prebake or chunk the stamped heightmap rebake after multi-mode evidence.
- Cloud anchoring first slice:
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`
  proves strict WebGPU across Open Frontier, Zone Control, actual Team
  Deathmatch, combat120, and A Shau with
  `cloud model=camera-followed-dome-world-altitude-clouds`, zero console
  errors, and zero page errors. This is anchoring evidence, not final
  cloud/weather art acceptance.
- Water/hydrology bridge pass:
  `artifacts/perf/2026-05-11T21-33-05-844Z/projekt-143-water-system-audit/water-system-audit.json`
  records source wiring as WARN and
  `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
  proves hydrology river meshes, channel queries, and
  `sampleWaterInteraction` in Open Frontier and A Shau. Treat this as VODA
  contract proof, not final water shader/art/physics acceptance. Detailed note:
  `docs/tasks/cycle-2026-05-11-konveyer-water-hydrology.md`.
- Finite-edge strategy evidence is mixed. Source-backed visual terrain extent
  is accepted as the direction for procedural/small maps whose source terrain
  can continue beyond the playable square. A Shau remains blocked: the later
  1600m DEM edge-slope collar/tint experiment at
  `artifacts/perf/2026-05-11T21-58-04-137Z/konveyer-scene-parity/scene-parity.json`
  still read as a tan/gold synthetic band. The next A Shau decision is real
  outer DEM/source data, explicit flight/camera boundary, or a documented
  hybrid, not more probe-driven tinting.
- ECSY was cloned outside the repo root at
  `C:\Users\Mattm\X\games-3d\_research\ecsy` for reference only; it should
  inform materialization vocabulary, not become a dependency.
- The first failed scene probe at
  `artifacts/perf/2026-05-11T18-16-29-104Z/konveyer-scene-parity/scene-parity.json`
  is browser-target-closed noise and should not be used for visual acceptance.

## Next Agent Pickup

1. Preserve the hard stops: no `master` merge, no deploy, no baseline update,
   no fenced interface edit, no WebGL fallback proof.
2. Use `window.npcMaterializationProfile(24)` in dev/perf builds to inspect
   nearby NPC materialization. The next implementation target is deterministic
   spawn-proximity close-model residency for actors near first reveal, not
   more crop-threshold tuning.
3. Attribute the "Compiling features" UI delay across more than Open Frontier,
   then choose whether stamped heightmap rebake should be prebuilt, chunked, or
   worker-backed.
4. Resolve A Shau finite-edge presentation with real outer DEM/source data,
   flight/camera boundary policy, or a documented hybrid.
5. Continue cloud/weather representation and water/hydrology work before the
   principles-first WebGPU/TSL renderer rearchitecture review.

## Hard Stops

- Fenced-interface change required.
- Perf baseline update required.
- `master` merge or production deploy requested.
- WebGL fallback required for migration proof.
- Visual regression makes the game unfit for playtest.
