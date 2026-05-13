# Cycle: KONVEYER Scene Parity And Frame-Budget Attribution

Last verified: 2026-05-12

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

- Remote pickup for fresh agents:
  `origin/exp/konveyer-webgpu-migration` branch head. Continue from the branch
  head; do not rely on a frozen SHA in this brief, and do not restart from the
  older KONVEYER-0 through KONVEYER-9 packet.
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
  the then-open startup/materialization weakness: 14 NPCs were inside the
  initial close radius and 6 stayed impostors because the old fixed cap and
  pool policy could not materialize the whole crowded spawn cluster. The later
  spawn-residency reserve proof below addresses that Open Frontier symptom;
  do not regress it back into WebGL parity tuning. Dev/perf builds now expose
  `window.npcMaterializationProfile()` so reviewers can inspect the nearest NPC
  render modes and fallback reasons without reaching into renderer internals.
- Public-profile crop probe:
  `artifacts/perf/2026-05-11T23-56-05-104Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  confirms the strict WebGPU crop probe now consumes
  `window.npcMaterializationProfile()` for both initial and review telemetry.
  After the hard-near anti-pop priority slice, `pool-loading` clears to zero
  and nearest review rows are close GLBs with weapons. It still showed
  crowded-start total-cap fallback under the old fixed close-GLB cap; that
  Open Frontier startup symptom is superseded by the 01:26 proof below.
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
- Target-bound close-GLB and spawn-residency proof:
  `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  prefers the review-pose combatant in active close-model selection and records
  a bounded spawn-residency reserve under strict WebGPU. It proves the
  inspected nearby actor can be a close GLB with weapon, with 11 visible close
  GLBs, effective close cap 11, no close fallback records, public
  materialization telemetry, and geometry-derived body bounds. The isolated
  material crop hides vegetation and terrain so the soldier/weapon is visible
  for review. The proof remains WARN because the generic NPC impostor crop has
  no candidate after nearby actors promote to close GLBs and the isolated crop
  is bright against the neutral proof frame. This leaves multi-mode reserve
  verification and Phase F materialization-tier policy, not an Open Frontier
  startup total-cap failure or WebGL parity target.
- Multi-mode close-model reserve verification on `01da7abb`:
  `artifacts/perf/2026-05-12T01-50-30-290Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  runs `webgpu-strict` for `open_frontier`, `zone_control`, `team_deathmatch`,
  `ai_sandbox` (combat120 alias), and `a_shau_valley`. Every mode resolves
  `resolvedBackend=webgpu`, `strictWebGPUReady=true`, zero console errors, and
  zero page errors. The bounded reserve activates as designed in dense modes
  but is undersized for combat120:
  - `open_frontier`: cap 8, 12 candidates, 4 `total-cap` fallbacks, 0
    `pool-loading`/`pool-empty`. Reserve did not activate because the steady
    review pose left no actor inside the 64m spawn-residency bubble after
    initial dispersal; the +4 reserve correctly only applies when
    `isSpawnResident=true` candidates exist.
  - `zone_control`: cap 9, 12 candidates, 3 `total-cap` fallbacks, 0
    `pool-loading`/`pool-empty`. Reserve activated +1.
  - `team_deathmatch`: cap 12, 16 candidates, 4 `total-cap` fallbacks, 0
    `pool-loading`/`pool-empty`. Reserve fully activated +4.
  - `ai_sandbox` (combat120): cap 12, 32 candidates, 18 `total-cap` plus 2
    `pool-empty` fallbacks. Reserve fully activated +4 but density is roughly
    2.7x the cap; faction pool sizing is asymmetric (`US` target 12 exhausts
    while `NVA` keeps 4 available), so faction skew amplifies pool-empty
    behaviour beyond the cap question.
  - `a_shau_valley`: 0 combatants live at probe time. The strategic
    simulation does not materialize live combatants into the review pose's
    close radius, so no reserve activation is observable from the front-line
    impostor path. This is Phase F materialization-tier policy, not a
    renderer regression.
  The multi-mode artifact preserves the hard stops: no `master` merge, no
  deploy, no `perf-baselines.json` change, no WebGL fallback proof, and no
  fenced-interface edit. Vegetation/NPC impostor crops repeat the prior WARN
  pattern (green/saturated for vegetation, background-dominant or absent for
  NPC); these remain Pixel Forge/asset-review carry-overs, not new
  materialization findings.
- Startup "Compiling features" attribution:
  the same strict WebGPU proof records Open Frontier terrain feature compile
  marks. The UI wait is mostly the 1024-grid stamped heightmap rebake
  (~48.5ms), not shader compilation; feature list compile is ~5.2ms and
  stamped-provider creation is ~2.1ms. First optimization candidate:
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
2. Multi-mode reserve verification packet is recorded at
   `artifacts/perf/2026-05-12T01-50-30-290Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
   The next architecture decision is Phase F materialization-tier policy for
   the close-model cap: should `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP` and
   `spawnResidencyExtraCap` scale by mode density and faction balance, or
   should combat120/TDM continue to accept `total-cap` impostor fallback for
   actors past the steady-state cap? combat120 sees ~32 candidates against a
   12-slot cap, so a per-mode policy or impostor-LOD acceptance is the
   choice, not more uniform-cap tuning. Faction pool asymmetry
   (`pool-empty` in combat120 with one faction's pool exhausted while the
   other has slack) is a separate sizing fix for the same decision.
3. Attribute the "Compiling features" UI delay across more than Open Frontier,
   then choose whether stamped heightmap rebake should be prebuilt, chunked, or
   worker-backed.
4. Resolve A Shau finite-edge presentation with real outer DEM/source data,
   flight/camera boundary policy, or a documented hybrid. The multi-mode probe
   also exposes that A Shau materializes zero live combatants at the review
   pose; that is strategic-simulation behaviour and a Phase F
   materialization-tier policy question, not a close-model bug.
5. Continue cloud/weather representation and water/hydrology work before the
   principles-first WebGPU/TSL renderer rearchitecture review.

## Hard Stops

- Fenced-interface change required.
- Perf baseline update required.
- `master` merge or production deploy requested.
- WebGL fallback required for migration proof.
- Visual regression makes the game unfit for playtest.
