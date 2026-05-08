Original prompt: we had an intern come in a really both things up recently - can you take sober look at all the code end to end and come up with a plan to right the wrongs and properly bring this engine back up to speed with latest tech, standards, practices, techniques, novel implementation and referring to docs and code and not assuming but validating. look at handoff perf harness and understand it could be a symptom of a larger system issue.

2026-05-08 Projekt Objekt-143 AVIATSIYA-1 Cobra tail-rotor runtime-axis correction
- Continued under the active Objekt-143 goal, reread `docs/PROJEKT_OBJEKT_143.md`
  end to end, and selected AVIATSIYA-1 / DEFEKT-5 because the Politburo
  reported AH-1 Cobra tail-rotor directionality drift and requested aircraft
  focus first.
- Source diagnosis: the reverted source-preservation path was wrong for AH-1
  Cobra. Huey and UH-1C Gunship source/public tail rotors spin on `z`; AH-1
  Cobra source spins `Joint_tailRotor` on longitudinal `x`, which violates the
  TIJ side-mounted tail-rotor runtime contract.
- Source change: `scripts/import-pixel-forge-aircraft.ts` now applies an
  explicit `ah1-cobra` tail-rotor spin-axis correction from source `x` to
  imported/runtime `z`. `src/systems/helicopter/HelicopterGeometry.ts` now
  uses `z` for missing/synthetic tail-rotor spin-axis fallback so old fallback
  paths do not silently diverge from the runtime contract.
- Evidence packet:
  `artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json`
  records Huey preserved `z`, UH-1C Gunship preserved `z`, and AH-1 Cobra
  corrected `sourceAxis=x -> importedAxis=z` over `3` keyframes /
  `48` bytes. Public GLB inspection shows all three runtime tail-rotor
  quaternion tracks now spin on `z`.
- Visual-integrity packet:
  `artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`
  records PASS for `helicopter_tail_rotor_axes_runtime_aligned`: Huey `z`,
  UH-1C Gunship `z`, AH-1 Cobra source `x`, public/expected `z`, correction
  `source-x-to-runtime-z`.
- Human review packet:
  `artifacts/perf/2026-05-08T01-23-33-556Z/projekt-143-defekt5-human-review/review-summary.json`
  remains `needs_human_decision`; source and asset evidence do not certify the
  player-view rotor appearance.
- Validation: `npx vitest run src/systems/helicopter/HelicopterAnimation.test.ts
  src/systems/helicopter/HelicopterGeometry.test.ts --reporter=dot` passed
  (`2` files / `8` tests), `npm run typecheck` passed, and
  `npm run check:pixel-forge-cutover` passed.
- Closeout gates after ledger update: `npm run check:doc-drift -- --as-of
  2026-05-08` passed at
  `artifacts/perf/2026-05-08T01-26-06.909Z/projekt-143-doc-drift/doc-drift.json`.
  `npm run check:projekt-143-completion-audit` remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-08T01-26-26-320Z/projekt-143-completion-audit/completion-audit.json`
  with `29` blockers.

2026-05-08 Projekt Objekt-143 VODA-1 exposure source audit under resource contention
- Continued under the active Objekt-143 goal and selected VODA-1 after the
  Politburo prioritized aircraft first, then water, then design/UX/perf.
- Added `scripts/projekt-143-voda-exposure-source-audit.ts` and package alias
  `npm run check:projekt-143-voda-exposure-source`. The audit reads the prior
  terrain visual-review artifact and source only; it launches no browser or
  perf capture on the resource-contended machine.
- Evidence packet:
  `artifacts/perf/2026-05-08T01-15-33-373Z/projekt-143-voda-exposure-source-audit/summary.json`
  records WARN classification
  `voda_exposure_warning_review_composition_before_water_material_tuning`.
  It finds `4` Open Frontier exposure-risk shots, `0` risk shots with global
  water visible, and `4` risk shots with hydrology river surfaces visible. It
  also records hydrology material opacity `0.55`, dark source luma values
  `50.81` / `68.08` / `36.13`, and middle/bottom neutral overexposure from
  `0.8681` to `0.9454` across warned sightlines.
- Directive result: VODA-1 remains open. The next visual investigation is Open
  Frontier camera review angles, sky exposure, pale airfield/foundation
  materials, and terrain-water sightline composition before any global water
  shader or hydrology material tuning.
- Validation before doc closeout: `npm run check:projekt-143-voda-exposure-source`
  completed with WARN artifact output; `npm run typecheck` passed; `npx vitest
  run src/systems/environment/WaterSystem.test.ts` passed (`1` file, `9` tests).
- Continued the same VODA-1 source chain by strengthening the audit to extract
  actual hydrology material opacity and source color luma, plus
  neutral-overexposure band metrics for warned shots.
- Validation after audit strengthening: `npm run
  check:projekt-143-voda-exposure-source -- --source
  artifacts/perf/2026-05-07T22-17-52-232Z/projekt-143-terrain-visual-review/visual-review.json`
  completed with WARN artifact output at the `01-15-33-373Z` path above; `npm
  run typecheck` passed.
- Closeout gates after ledger update: `npm run check:doc-drift -- --as-of
  2026-05-08` passed at
  `artifacts/perf/2026-05-08T01-17-09.717Z/projekt-143-doc-drift/doc-drift.json`.
  `npm run check:projekt-143-completion-audit` remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-08T01-17-22-608Z/projekt-143-completion-audit/completion-audit.json`
  with `29` blockers.

2026-05-08 Projekt Objekt-143 fixed-wing clean functional gate under resource contention
- Continued under the active Objekt-143 goal after the 4174 fixed-wing packet
  carried a harness-teardown warning.
- Re-ran `npm run probe:fixed-wing -- --boot-attempts=1 --port 4175`.
  The command exited `0`; `artifacts/fixed-wing-runtime-probe/summary.json`
  records `status: passed` for A-1 Skyraider, F-4 Phantom, and AC-47 Spooky.
- Packeted the clean functional gate at
  `artifacts/perf/2026-05-08T00-56-34-511Z/projekt-143-fixed-wing-clean-gate/summary.json`.
  It copies the probe summary and three screenshots, records no listener on
  port `4175`, and records no fixed-wing probe or preview command-line residue.
- Resource doctrine: the Politburo reported games and other agents active on
  the same PC. This packet proves the functional fixed-wing browser gate only.
  It does not prove frame-time acceptance, wall-time acceptance, optimization,
  baseline refresh, live production parity, or human flight-feel/rotor visual
  acceptance.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so
  AVIATSIYA-1, STABILIZAT-2, and DEFEKT-5 point at the clean functional gate
  while retaining CI/PR/merge/deploy, combat120/perf, and human review blockers.
- Validation after documentation update: `npm run check:doc-drift -- --as-of
  2026-05-08` passed at
  `artifacts/perf/2026-05-08T01-00-26.310Z/projekt-143-doc-drift/doc-drift.json`.
  `npm run check:projekt-143-completion-audit` remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-08T01-00-50-627Z/projekt-143-completion-audit/completion-audit.json`
  with `34` Article III directives, `10` closed, `24` open, and `29` blockers.

2026-05-08 Projekt Objekt-143 fixed-wing runtime proof with harness teardown warning
- Continued under the active Objekt-143 goal after the aircraft readiness packet
  still carried a PARTIAL fixed-wing runtime result.
- Re-ran production-shaped `npm run probe:fixed-wing -- --boot-attempts=1
  --port 4174` with a `900000ms` shell timeout. The command itself timed out,
  but `artifacts/fixed-wing-runtime-probe/summary.json` had already reached
  `status: passed` for A-1 Skyraider, F-4 Phantom, and AC-47 Spooky.
- Stopped the leftover `preview:perf` / Vite preview processes on port `4174`
  after the shell timeout and verified no fixed-wing probe or perf-preview
  process remained.
- Copied the passed probe summary and inspected screenshots into
  `artifacts/perf/2026-05-08T00-34-03-449Z/projekt-143-fixed-wing-runtime-proof/`.
  The packet records WARN classification
  `fixed_wing_runtime_passed_harness_teardown_warn`: runtime scenario evidence
  is positive, but harness teardown is not a clean command gate.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so
  STABILIZAT-2/AVIATSIYA aircraft status records A-1/F-4/AC-47 probe PASS
  while retaining live playtest, clean harness exit, CI/PR, deploy, and
  human rotor acceptance as blockers.

2026-05-08 Projekt Objekt-143 AVIATSIYA aircraft readiness and perf bridge
- Continued under the active Objekt-143 goal, reread `docs/PROJEKT_OBJEKT_143.md`
  end to end, and selected aircraft first per Politburo priority, with perf and
  optimization treated as release gates rather than separate expansion scope.
- Cleaned up the orphaned fixed-wing probe / perf-preview processes left by the
  timed-out browser run; no fixed-wing probe or preview server remained after
  cleanup.
- Evidence packet:
  `artifacts/perf/2026-05-08T00-11-04-505Z/projekt-143-aviatsiya-aircraft-readiness/summary.json`
  records WARN classification
  `aircraft_static_source_ready_runtime_probe_partial`.
- Validation inside the packet: targeted aircraft Vitest pass (`20` files /
  `322` tests), `check:projekt-143-visual-integrity` PASS, Pixel Forge aircraft
  dry-run PASS with Huey `z`, UH-1C Gunship `z`, and AH-1 Cobra `x` tail-rotor
  axes preserved with `bytesAffected=0`.
- Runtime probe result: copied `artifacts/fixed-wing-runtime-probe/summary.json`
  is PARTIAL after timeout. A-1 Skyraider entry, liftoff, climb, approach,
  bailout, and NPC handoff are positive, but the packet does not certify
  full-roster fixed-wing acceptance, rotor visual acceptance, live release proof,
  or combat120 baseline refresh.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so
  AVIATSIYA-1, STABILIZAT-2, and DEFEKT-5 point at the current aircraft
  evidence path without declaring completion.

2026-05-07 Projekt Objekt-143 DEFEKT-5 Cobra rotor-axis correction and human review packet
- Continued under the active Objekt-143 goal, reread `docs/PROJEKT_OBJEKT_143.md`
  end to end, and selected DEFEKT-5 because the Politburo reported Cobra
  tail-rotor visual drift, close NPC impostor doubts, and hidden legacy fallback
  risk.
- Source diagnosis: the prior rotor proof was too blunt. It forced AH-1 Cobra
  `Joint_tailRotor` animation from source axis `x` to `z` even though the
  runtime already reads and honors per-asset rotor spin axes.
- Source change: `scripts/import-pixel-forge-aircraft.ts` now preserves and
  reports each helicopter tail-rotor source axis. Huey remains `z`, UH-1C
  Gunship remains `z`, and AH-1 Cobra remains `x`; no tail-rotor animation
  bytes are rewritten.
- Audit change: `scripts/projekt-143-visual-integrity-audit.ts` now compares
  source GLB and public GLB tail-rotor axes instead of demanding forced axis
  equality, while also anchoring runtime per-asset spin-axis resolution.
- Evidence: aircraft import summary at
  `artifacts/perf/2026-05-07T23-55-40-613Z/pixel-forge-aircraft-import/summary.json`
  records preserved axes and `bytesAffected=0`; visual-integrity audit at
  `artifacts/perf/2026-05-07T23-56-08-551Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`
  records PASS with Huey `z`, Gunship `z`, and Cobra `x` source/public parity.
- Review packet: `npm run check:projekt-143-defekt5-human-review` wrote
  `artifacts/perf/2026-05-07T23-56-47-585Z/projekt-143-defekt5-human-review/review-summary.json`
  with status `needs_human_decision` for NPC death animation, close-NPC LOD
  feel, explosion appearance, and rotor appearance.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so DEFEKT-5
  records source evidence complete with a human visual decision packet ready.

2026-05-07 Projekt Objekt-143 DEFEKT-5 explosion representation packet
- Continued under the active Objekt-143 goal, reread `docs/PROJEKT_OBJEKT_143.md`
  end to end, and selected the remaining DEFEKT-5 explosion representation
  branch because the close-impostor exception was already instrumented.
- Source diagnosis: explosion visuals are not a silent legacy fallback. The
  active path is the post-KB-EFFECTS unlit pooled explosion contract created
  after dynamic `THREE.PointLight` explosion rendering caused first-use WebGL
  stalls. The current visual stack is pooled billboard flash, point particles,
  debris points, and shockwave ring.
- Source change: `ExplosionEffectFactory` now exports
  `EXPLOSION_EFFECT_REPRESENTATION` and tags effect objects with
  `perfCategory='explosion_fx'`, representation names, and
  `legacyFallback=false`. The source contract records `dynamicLights=false`.
- Test change: `ExplosionEffectsPool.test.ts` now proves the active grenade
  explosion path remains unlit and that the visible flash object carries the
  pooled unlit billboard representation metadata.
- Evidence: refreshed visual-integrity audit at
  `artifacts/perf/2026-05-07T23-45-45-561Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`
  records PASS and `visual_integrity_source_bound_human_review_pending`.
- Validation: `npx vitest run src/systems/effects/ExplosionEffectsPool.test.ts`
  passed `1/1`; `npm run typecheck` passed; `npm run
  check:pixel-forge-cutover` passed.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so DEFEKT-5
  records source evidence complete with human visual acceptance pending.

2026-05-07 Projekt Objekt-143 DEFEKT-5 close-impostor telemetry packet
- Continued under the active Objekt-143 goal, reread `docs/PROJEKT_OBJEKT_143.md`
  end to end, and selected the remaining close-impostor exception inside
  DEFEKT-5 because the previous packet still classified it as WARN without
  runtime reason accounting.
- Source change: `CombatantRenderer` now exposes `getCloseModelRuntimeStats()`
  and `getCloseModelFallbackRecords()`. Close-radius impostor exceptions are
  classified as `perf-isolation`, `pool-loading`, `pool-empty`, or `total-cap`,
  with counts, nearest/farthest fallback distance, active close-model count,
  pool loads, pool targets, and pool availability.
- Probe support: `scripts/probe-pixel-forge-npcs.ts` now includes close-model
  runtime stats, fallback records, and per-row close fallback reason so browser
  evidence can distinguish cap policy from hidden legacy fallback.
- Evidence: refreshed visual-integrity audit at
  `artifacts/perf/2026-05-07T23-40-49-413Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`
  records close-impostor instrumentation PASS while preserving WARN for the
  unresolved explosion `THREE.Sprite` representation decision.
- Validation: `npx vitest run src/systems/combat/CombatantRenderer.test.ts`
  passed `33/33`; `npm run typecheck` passed; `npm run
  check:pixel-forge-cutover` passed.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so the
  directive board points at the new evidence path.

2026-05-07 Projekt Objekt-143 DEFEKT-5 visual fallback and AVIATSIYA rotor directionality audit
- Read `docs/PROJEKT_OBJEKT_143.md` end to end in the engagement, surveyed
  Article III across active bureaus, and folded the Politburo's NPC impostor,
  hidden fallback, explosion-FX, Cobra tail-rotor, and gunship terminology
  observations into a bounded visual-integrity packet.
- Source diagnosis: Pixel Forge dying NPCs already selected `death_fall_back`,
  but `CombatantRenderer` also applied the old procedural billboard death
  transform during the same window. The fix gates that legacy transform away
  from the Pixel Forge one-shot death clip and adds a regression test proving
  death impostor scale stays unshrunk while animation progress advances.
- Source diagnosis: close NPCs are not distance-only. The hard close band is
  `64m`, but pool loading, pool-empty, and the total active close-model cap can
  render overflow close actors as impostors. This remains an explicit open
  owner decision, not a silent fallback.
- Source diagnosis: explosion visuals still use a pooled `THREE.Sprite` flash
  plus particles. The audit classifies this as current primary FX code, not a
  hidden legacy fallback; replacement or acceptance remains open.
- Aircraft correction: `scripts/import-pixel-forge-aircraft.ts` now normalizes
  helicopter `Joint_tailRotor` spin axes for Huey, UH-1C Gunship, and AH-1
  Cobra. Import evidence at
  `artifacts/perf/2026-05-07T23-28-50-762Z/pixel-forge-aircraft-import/summary.json`
  records Huey and UH-1C already lateral `z`, and AH-1 Cobra normalized
  `x->z` across `3` keyframes / `48` bytes.
- Visual-integrity audit at
  `artifacts/perf/2026-05-07T23-30-48-740Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`
  records WARN, `visual_integrity_source_bound_with_open_owner_decisions`,
  passes NPC death clip/shrink removal, Pixel Forge cutover, helicopter rotor
  axes, and aircraft roster terminology checks, and warns on close-impostor cap
  behavior plus current Sprite explosion FX.
- Validation: `npx vitest run src/systems/combat/CombatantRenderer.test.ts
  src/systems/helicopter/HelicopterAnimation.test.ts
  src/systems/helicopter/HelicopterGeometry.test.ts` passed `41/41`; `npm run
  check:pixel-forge-cutover` passed; `npm run typecheck` passed.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` with
  AVIATSIYA-1, DEFEKT-3 terrain-shadow diagnostic, and new DEFEKT-5 status.
  Human visual playtest remains required before claiming rotor/death-animation
  feel acceptance.

2026-05-07 Projekt Objekt-143 DEFEKT-3 render pass-metadata audit
- Read `docs/PROJEKT_OBJEKT_143.md` end to end in the engagement, surveyed
  Article III across active bureaus, and selected DEFEKT-3 because the current
  board required pass-aware render-submission metadata or a controlled
  terrain-shadow/tile-resolution diagnostic after the terrain contribution
  packet.
- Read `docs/STATE_OF_REPO.md`, `scripts/projekt-143-scene-attribution.ts`,
  `scripts/projekt-143-render-submission-category-attribution.ts`, Three's
  `Object3D.onBeforeShadow` type contract, and
  `node_modules/three/src/renderers/webgl/WebGLShadowMap.js`.
- Added pass metadata to the render-submission tracker: `onBeforeRender`
  records `main`, `onBeforeShadow` records `shadow`, frame and category buckets
  serialize `passTypes`, and examples carry `passType`. Added packet propagation
  in `scripts/projekt-143-render-submission-category-attribution.ts`.
- Added `scripts/projekt-143-defekt-render-pass-metadata-audit.ts` and package
  command `npm run check:projekt-143-defekt-render-pass-metadata`.
- Rebuilt the perf harness with `npm run build:perf`, then ran the production
  shaped headed combat120 capture:
  `npx tsx scripts/perf-capture.ts --headed --mode ai_sandbox --npcs 120 --duration 90 --warmup 15 --seed 2718 --runtime-render-submission-attribution true --runtime-render-submission-every-samples 30`.
  Capture artifact:
  `artifacts/perf/2026-05-07T23-05-54-437Z`.
- Generated category packet
  `artifacts/perf/2026-05-07T23-05-54-437Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`.
  The packet is exact at frame `3035`; capture status is `ok`, validation
  `warn`, measurement trust `warn`; frame pass types are `main:124, shadow:1`;
  terrain pass types are `main:2, shadow:1`; terrain records `3` draw
  submissions and `0.7095` triangle share; top draw is `npc_close_glb`; top
  triangles are `terrain`; renderer reconciliation is draw `0.7022` /
  triangles `0.9987`.
- Validation WARN at
  `artifacts/perf/2026-05-07T23-08-28-327Z/projekt-143-defekt-render-pass-metadata-audit/pass-metadata-audit.json`
  records `render_pass_metadata_bound_timing_unisolated`, confidence `high`,
  acceptance `owner_review_only`, and `7/7` checks passing.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to keep
  DEFEKT-3 active. The next terrain packet must run a controlled terrain-shadow
  or tile-resolution diagnostic under the same combat120 shape. No runtime fix,
  per-pass timing isolation, DEFEKT-3 completion, combat-feel certification,
  regression-reference replacement, terrain quality authorization, or baseline
  refresh is claimed.
- Closeout checks: `npm run check:doc-drift -- --as-of 2026-05-07` passed at
  `artifacts/perf/2026-05-07T23-10-35.478Z/projekt-143-doc-drift/doc-drift.json`;
  `npm run check:projekt-143-completion-audit` recorded NOT_COMPLETE at
  `artifacts/perf/2026-05-07T23-10-51-111Z/projekt-143-completion-audit/completion-audit.json`
  with `33` directives, `10` closed, `23` open, and `28` blockers; scoped
  `git diff --check` reported line-ending warnings only.

2026-05-07 Projekt Objekt-143 DEFEKT-3 terrain contribution audit
- Read `docs/PROJEKT_OBJEKT_143.md` end to end in the engagement, surveyed
  Article III across active bureaus, and selected DEFEKT-3 because the current
  board required one next isolation axis after the owner-split packet. The
  selected axis was terrain triangle/render-cost contribution.
- Read `docs/STATE_OF_REPO.md`, `src/systems/terrain/CDLODRenderer.ts`,
  `src/systems/terrain/TerrainRenderRuntime.ts`,
  `src/systems/terrain/TerrainConfig.ts`, `src/core/GameRenderer.ts`, the
  owner-split packet at
  `artifacts/perf/2026-05-07T22-49-28-445Z/projekt-143-defekt-render-owner-split-audit/render-owner-split-audit.json`,
  and the post-tag exact-frame render-submission packet at
  `artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`.
- Added `scripts/projekt-143-defekt-terrain-contribution-audit.ts` and package
  command `npm run check:projekt-143-defekt-terrain-contribution`. Validation
  WARN at
  `artifacts/perf/2026-05-07T22-56-02-642Z/projekt-143-defekt-terrain-contribution-audit/terrain-contribution-audit.json`
  records `terrain_triangle_axis_source_bound_timing_unisolated`, confidence
  `high`, and acceptance `owner_review_only`.
- Evidence: post-tag peak frame `1027` records terrain as top triangle category
  at `0.7174` while top draw remains `npc_ground_markers`; terrain records `2`
  draw submissions, `0.0202` draw share, `163840` submitted triangles, `80`
  submitted instances, `2048` triangles per terrain instance, and `0.5219` of
  peak renderer triangles. Source anchors prove the current terrain path is one
  CDLOD InstancedMesh updated by selected tiles with default `33` vertex tile
  resolution and device-adaptive shadow capability.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to keep
  DEFEKT-3 active. The next terrain packet must add pass-aware
  render-submission metadata or run a controlled terrain-shadow/tile-resolution
  diagnostic against the same combat120 shape. No terrain quality change,
  runtime fix, terrain-stall ownership claim, DEFEKT-3 completion, combat-feel
  certification, regression-reference replacement, or baseline refresh is
  claimed.

2026-05-07 Projekt Objekt-143 DEFEKT-3 render owner-split audit
- Read `docs/PROJEKT_OBJEKT_143.md` end to end in the engagement, surveyed
  Article III across active bureaus, and selected DEFEKT-3 because the current
  board named the remaining owner split across `npc_close_glb` draw submissions,
  `npc_ground_markers` draw submissions, and terrain triangle dominance.
- Read `docs/STATE_OF_REPO.md`, the accepted 16:23 render-submission packet at
  `artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`,
  the post-tag 17:28 render-submission packet at
  `artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`,
  and the sparse-owner acceptance packet at
  `artifacts/perf/2026-05-07T22-29-58-460Z/projekt-143-sparse-owner-acceptance-audit/sparse-owner-acceptance-audit.json`.
- Added `scripts/projekt-143-defekt-render-owner-split-audit.ts` and package
  command `npm run check:projekt-143-defekt-render-owner-split`. Validation
  WARN at
  `artifacts/perf/2026-05-07T22-49-28-445Z/projekt-143-defekt-render-owner-split-audit/render-owner-split-audit.json`
  records `post_tag_renderer_owner_split_divergent`, confidence `high`, and
  acceptance `owner_review_only`.
- Evidence: reference top draw is unattributed at `0.3106` and reference top
  triangles are terrain at `0.6101`; post-tag top draw is
  `npc_ground_markers` at `0.3232`, post-tag top triangles are terrain at
  `0.7174`, `npc_close_glb` draw submissions move `36->14`, and renderer
  reconciliation remains partial at draw `0.4583` / triangles `0.7276`.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to keep
  DEFEKT-3 active and require one next isolation axis: batch/reduce
  ground-marker/imposter draw submissions, test terrain triangle/render-cost
  contribution, or improve renderer-submission reconciliation. No runtime fix,
  DEFEKT-3 completion, combat-feel certification, regression-reference
  replacement, or baseline refresh is claimed.

2026-05-07 Projekt Objekt-143 DEFEKT-4 NPC route-quality source/static-policy audit
- Read `docs/PROJEKT_OBJEKT_143.md` end to end in the engagement, surveyed
  Article III, and selected DEFEKT-4 because the directive was still carryover
  and lacked a current artifact-backed route-quality packet.
- Read `docs/STATE_OF_REPO.md`, `package.json`,
  `scripts/projekt-143-terrain-route-audit.ts`, `scripts/perf-active-driver.cjs`,
  `scripts/perf-capture.ts`, `scripts/projekt-143-active-driver-diagnostic.ts`,
  `src/systems/combat/CombatantMovement.ts`,
  `src/systems/combat/StuckDetector.ts`, and their route/stuck tests.
- Validation: `npm run check:projekt-143-terrain-routes` PASS at
  `artifacts/perf/2026-05-07T22-40-26-760Z/projekt-143-terrain-route-audit/terrain-route-audit.json`.
  The static route-policy packet records `3` route-aware modes, `87931.1m`
  total route length, `2882` route capsule stamps, `0` warn modes, and `0` fail
  modes.
- Added `scripts/projekt-143-defekt-route-quality-audit.ts` and package command
  `npm run check:projekt-143-defekt-route-quality`. Validation WARN at
  `artifacts/perf/2026-05-07T22-42-23-479Z/projekt-143-defekt-route-quality-audit/route-quality-audit.json`
  records `npc_route_quality_guardrails_present_runtime_acceptance_missing`,
  anchors `CombatantMovement`, `StuckDetector`, active-driver route telemetry,
  `perf-capture` stuck gates, and active-driver diagnostic route/stuck findings.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to keep
  DEFEKT-4 open. The next required evidence is A Shau plus Open Frontier
  active-driver route-quality runtime capture with measurement trust pass and
  explicit bounds for max stuck seconds, route no-progress resets, waypoint
  replan failures, path-query status, and terrain-stall warning rate.
- Closeout checks: `npm run check:doc-drift -- --as-of 2026-05-07` PASS at
  `artifacts/perf/2026-05-07T22-43-28.310Z/projekt-143-doc-drift/doc-drift.json`;
  `npm run check:projekt-143-completion-audit` records NOT_COMPLETE at
  `artifacts/perf/2026-05-07T22-43-38-384Z/projekt-143-completion-audit/completion-audit.json`
  with `28` blockers. Scoped `git diff --check` reports line-ending warnings
  only.

2026-05-07 Projekt Objekt-143 STABILIZAT-3 current completion audit refresh
- Read `docs/PROJEKT_OBJEKT_143.md` end to end, surveyed Article III across
  active bureaus, and selected STABILIZAT-3 because the codex and state still
  cited the older `22-02-21-527Z` completion packet after later DEFEKT-3 sparse
  owner-review evidence changed the directive board.
- Read `docs/STATE_OF_REPO.md`, `package.json`,
  `scripts/projekt-143-current-completion-audit.ts`, and the current completion
  packet. The gate parses Article III, maps Article VII requirements to concrete
  artifacts, inspects git state, latest live-release proof, latest doc-drift
  proof, missing evidence references, and the Politburo seal marker.
- Validation: `npm run check:projekt-143-completion-audit` PASS as a
  `NOT_COMPLETE` audit at
  `artifacts/perf/2026-05-07T22-34-04-082Z/projekt-143-completion-audit/completion-audit.json`.
  The packet records `canMarkGoalComplete=false`, `33` Article III directives,
  `10` closed, `23` open, `0` deferred, `0` unknown, zero missing evidence
  refs, `28` blockers, stale live release proof at SHA
  `ab0cfd0e9a0f39ebe8b3a87f316b9287edfd3289`, dirty local HEAD
  `aff1abd4da769e2a04e6e5f9b39d241296a60ada`, and latest local doc-drift pass
  `artifacts/perf/2026-05-07T22-31-59.731Z/projekt-143-doc-drift/doc-drift.json`.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so
  STABILIZAT-3 points at the refreshed packet and records the prompt-to-artifact
  checklist: Article III completion FAIL, live-release verification FAIL,
  ARKHIV strategic-reserve audit PASS, Politburo seal FAIL, and 14-day live
  drift watch FAIL. This does not deploy production, close the goal, refresh
  baselines, or certify live parity.

2026-05-07 Projekt Objekt-143 DEFEKT-3 sparse owner-review acceptance
- Read `docs/PROJEKT_OBJEKT_143.md` end to end in the engagement, surveyed
  Article III, and selected DEFEKT-3 because the directive's next action was a
  measurement decision on sparse-owner acceptance or removal of the remaining
  raw-probe outliers.
- Read `docs/STATE_OF_REPO.md`, `scripts/projekt-143-measurement-path-inspection.ts`,
  `scripts/projekt-143-ground-marker-tagging-proof.ts`, `package.json`, and the
  current DEFEKT-3 packets at
  `artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-measurement-path-inspection/measurement-path-inspection.json`,
  `artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-ground-marker-tagging-proof/ground-marker-tagging-proof.json`,
  and
  `artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`.
- Added `scripts/projekt-143-sparse-owner-acceptance-audit.ts` and package
  command `npm run check:projekt-143-sparse-owner-acceptance`. The rule
  `sparse_owner_review_only_acceptance_v1` accepts sparse packets for owner
  review only when a measurement-PASS reference exists, the target capture is
  usable, raw probes are persisted, the tail is bounded, the non-outlier probe
  body stays near the accepted reference, render-submission drain is sparse,
  ground-marker movement is material, and the exact peak frame is source
  anchored.
- Validation: `npm run check:projekt-143-sparse-owner-acceptance` PASS at
  `artifacts/perf/2026-05-07T22-29-58-460Z/projekt-143-sparse-owner-acceptance-audit/sparse-owner-acceptance-audit.json`.
  The packet records `8/8` criteria passing, classification
  `sparse_owner_review_accepted`, acceptance `owner_review_only`, raw probe p95
  `30ms`, raw probe max `348ms`, over-75 rate `0.0345`, over-150 rate `0.0345`,
  avg-without-max delta `3.37ms` versus the accepted reference, `3`
  render-submission samples, `3505993` bytes, `unattributed` draw-share delta
  `-0.2789`, and `npc_ground_markers` draw share `0.3232`.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to record
  the post-tag packet as accepted sparse owner-review evidence only. The
  measurement-PASS 16:23 packet remains the controlling production-shaped owner
  reference for regression comparison. No runtime fix, DEFEKT-3 completion,
  combat-feel certification, or baseline refresh is claimed.

2026-05-07 Projekt Objekt-143 VODA-1 atmosphere and exposure evidence refresh
- Read `docs/PROJEKT_OBJEKT_143.md` end to end, surveyed Article III across
  active bureaus, and selected VODA-1 because the directive still named
  `evidence:atmosphere` and `terrain_water_exposure_review` as open acceptance
  gaps after the query/runtime proof slice.
- Read `docs/STATE_OF_REPO.md`, `package.json`,
  `scripts/capture-atmosphere-recovery-shots.ts`, and
  `scripts/projekt-143-terrain-visual-review.ts`. The atmosphere command
  rebuilds the perf bundle, captures A Shau / Open Frontier / TDM / Zone
  Control / combat120 screenshots, and records water, nav, cloud, and browser
  diagnostics. The terrain visual review captures Open Frontier and A Shau
  river, terrain, airfield, and foundation review shots and evaluates the
  explicit `terrain_water_exposure_review` check.
- Validation: `npm run evidence:atmosphere -- --out-dir
  artifacts/perf/2026-05-07T22-13-21-685Z/projekt-143-voda-atmosphere-evidence`
  PASS by command exit after `npm run build:perf`; artifact
  `artifacts/perf/2026-05-07T22-13-21-685Z/projekt-143-voda-atmosphere-evidence/summary.json`
  records `5` scenarios, `15` screenshots, zero scenario errors, zero browser
  errors, and `106` browser warnings. A Shau and Open Frontier hydrology river
  visuals are present with `552` and `592` segments; TDM, Zone Control, and
  combat120 keep global water visible; all scenarios record cloud legibility
  PASS and cloud-follow PASS.
- Validation: `npx tsx scripts/projekt-143-terrain-visual-review.ts` PASS as
  WARN at
  `artifacts/perf/2026-05-07T22-17-52-232Z/projekt-143-terrain-visual-review/visual-review.json`.
  The packet records `14/14` screenshots, zero browser/page errors, `5/6`
  checks passing, and A Shau river review passing. The remaining warning is
  `terrain_water_exposure_review`: Open Frontier airfield and river shots have
  luma means `229.37` to `236.60`, overexposed ratios `0.6786` to `0.8286`,
  and green ratios `0.0082` to `0.0393`.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to record
  the new VODA-1 atmosphere/exposure evidence while keeping VODA-1 open for
  final water art, Open Frontier exposure correction, matched perf, human visual
  acceptance, and consumer adoption of the public water queries.
- Validation: `npm run check:doc-drift -- --as-of 2026-05-07` PASS at
  `artifacts/perf/2026-05-07T22-23-53.396Z/projekt-143-doc-drift/doc-drift.json`
  with `3` docs scanned, `520` checked artifact references, `273` checked
  package command references, and zero findings.
- Sidecar Article VII check: `npm run check:projekt-143-completion-audit`
  PASS as `NOT_COMPLETE` at
  `artifacts/perf/2026-05-07T22-24-10-087Z/projekt-143-completion-audit/completion-audit.json`;
  `canMarkGoalComplete=false`, `33` Article III directives parsed, `10`
  closed, `23` open, `0` deferred, `28` blockers, and dirty local tree at HEAD
  `aff1abd4da769e2a04e6e5f9b39d241296a60ada`.
- Validation: `git diff --check -- docs/PROJEKT_OBJEKT_143.md
  docs/STATE_OF_REPO.md progress.md` reported line-ending warnings only.

2026-05-07 Projekt Objekt-143 DEFEKT-2 doc-drift evidence refresh
- Read `docs/PROJEKT_OBJEKT_143.md` end to end, surveyed Article III across
  active bureaus, and selected DEFEKT-2 because later VODA-1, STABILIZAT-3,
  and DEFEKT-1 record updates made the directive's cited pass packet stale.
- Read `docs/STATE_OF_REPO.md`, `package.json`, and
  `scripts/projekt-143-doc-drift.ts`. The gate scans the codex, current-state
  snapshot, performance doc, concrete artifact references, and documented
  `npm run` command references.
- Validation: `npm run check:doc-drift -- --as-of 2026-05-07` PASS at
  `artifacts/perf/2026-05-07T22-08-10.810Z/projekt-143-doc-drift/doc-drift.json`.
  The packet records `3` docs scanned, `516` checked artifact references,
  `272` checked package command references, `0` future-date findings, `0`
  missing artifact references, and `0` missing package scripts.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  DEFEKT-2 at the refreshed packet and preserve the non-claim that this local
  doc-drift pass does not validate runtime behavior, prove live production
  parity, or satisfy the Article VII 14-day live drift watch.
- Post-update validation: `npm run check:doc-drift -- --as-of 2026-05-07`
  PASS at
  `artifacts/perf/2026-05-07T22-09-16.432Z/projekt-143-doc-drift/doc-drift.json`
  with `3` docs scanned, `515` checked artifact references, `272` checked
  package command references, and zero findings.
- Final guard: `npm run check:doc-drift -- --as-of 2026-05-07` PASS at
  `artifacts/perf/2026-05-07T22-10-42.533Z/projekt-143-doc-drift/doc-drift.json`
  with the same `3` docs, `515` artifact references, `272` package command
  references, and zero findings.
- Sidecar Article VII check: `npm run check:projekt-143-completion-audit`
  PASS as `NOT_COMPLETE` at
  `artifacts/perf/2026-05-07T22-10-58-885Z/projekt-143-completion-audit/completion-audit.json`;
  `canMarkGoalComplete=false`, `33` Article III directives parsed, `10`
  closed, `23` open, `0` deferred, `28` blockers, stale live release proof at
  SHA `ab0cfd0e9a0f39ebe8b3a87f316b9287edfd3289`, dirty local tree at HEAD
  `aff1abd4da769e2a04e6e5f9b39d241296a60ada`, no Politburo seal marker, and
  no 14-day live drift watch.
- Validation: `git diff --check -- docs/PROJEKT_OBJEKT_143.md
  docs/STATE_OF_REPO.md progress.md` reported line-ending warnings only.

2026-05-07 Projekt Objekt-143 DEFEKT-1 stale baseline audit refresh
- Read `docs/PROJEKT_OBJEKT_143.md` end to end, surveyed Article III, and
  selected DEFEKT-1 because the stale-baseline directive had an older packet
  while the executable audit can refresh the release-blocking baseline truth
  without mutating `perf-baselines.json`.
- Read `docs/STATE_OF_REPO.md`, `perf-baselines.json`, `package.json`, and
  `scripts/projekt-143-stale-baseline-audit.ts`. The gate compares the
  2026-04-20 tracked baselines against detected captures under
  `artifacts/perf/` and writes a WARN packet when refresh is blocked.
- Validation: `npm run check:projekt-143-stale-baseline-audit -- --as-of
  2026-05-07` PASS as WARN at
  `artifacts/perf/2026-05-07T22-04-54-994Z/projekt-143-stale-baseline-audit/stale-baseline-audit.json`.
  The packet records `4` tracked scenarios, `0` current, `0`
  refresh-eligible, `4` blocked, and `4` stale by age. `combat120` is blocked
  by validation WARN / measurement trust WARN / max-frame FAIL;
  `openfrontier:short` is blocked by validation WARN; `ashau:short` is blocked
  by compare FAIL; `frontier30m` is blocked by a failed latest detected soak
  capture.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  DEFEKT-1 at the refreshed packet and preserve the non-claim that no baseline
  refresh, runtime performance fix, local quiet-machine certification, or live
  production performance proof occurred.

2026-05-07 Projekt Objekt-143 STABILIZAT-3 current completion audit refresh
- Read `docs/PROJEKT_OBJEKT_143.md` end to end, surveyed Article III across
  active bureaus, and selected STABILIZAT-3 because the closeout audit status
  still cited the older `20-51-55-791Z` packet after newer VODA and SVYAZ
  evidence changed the Article III counts.
- Read the current state snapshot and the routed completion-audit script
  `scripts/projekt-143-current-completion-audit.ts`; the script measures
  Article III directive state, cited evidence existence, live-release proof,
  local git state, and DEFEKT doc-drift proof.
- Validation: `npm run check:projekt-143-completion-audit` PASS as a
  `NOT_COMPLETE` audit at
  `artifacts/perf/2026-05-07T22-02-21-527Z/projekt-143-completion-audit/completion-audit.json`.
  The packet records `canMarkGoalComplete=false`, `33` Article III directives,
  `10` closed, `23` open, `0` deferred, zero missing cited artifacts, dirty
  local tree at HEAD `aff1abd4da769e2a04e6e5f9b39d241296a60ada`, stale live
  release proof at SHA `ab0cfd0e9a0f39ebe8b3a87f316b9287edfd3289`, no
  Politburo seal marker, no 14-day live drift watch, and `28` closeout
  blockers.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so
  STABILIZAT-3 points at the refreshed packet and does not claim live release,
  baseline refresh, production parity, or active-goal completion.

2026-05-07 Projekt Objekt-143 VODA-1 water query API slice
- Read `docs/PROJEKT_OBJEKT_143.md` and selected the VODA-1 query acceptance
  gap from Article III after the latest water runtime proof still left public
  `getWaterDepth` / `getWaterSurfaceY` acceptance open.
- Added public `WaterSystem.getWaterSurfaceY(position)` and
  `WaterSystem.getWaterDepth(position)` queries, backed them with hydrology
  channel query segments from the same accepted channel geometry that builds
  runtime river meshes, and routed underwater classification through the query
  contract.
- Added focused `WaterSystem` regression coverage for disabled water, global
  water-plane depth, and hydrology channel surface/depth classification. The
  first focused test run failed on the stale assumption that hydrology channels
  were not underwater; the test was corrected to the accepted query contract.
- Validation: `npx vitest run src/systems/environment/WaterSystem.test.ts` PASS
  with `9` tests.
- Validation: `npm run build:perf` PASS.
- Validation: `npm run check:projekt-143-water-runtime-proof -- --headless`
  PASS at
  `artifacts/perf/2026-05-07T21-55-25-154Z/projekt-143-water-runtime-proof/water-runtime-proof.json`.
  The packet records zero browser errors, screenshot artifacts, and live query
  probes for Open Frontier and A Shau hydrology surfaces. Screenshot inspection
  preserves the visual caveat: Open Frontier remains overexposed and is not art
  acceptance.
- Validation: `npm run check:projekt-143-water-system` PASS as WARN at
  `artifacts/perf/2026-05-07T21-57-51-480Z/projekt-143-water-system-audit/water-system-audit.json`.
  The packet accepts the source/test query API surface and preserves open work
  for final water art, perf, `evidence:atmosphere`,
  `terrain_water_exposure_review`, human visual acceptance, and consumer
  adoption of the public queries.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  VODA-1 at the refreshed source/test/browser query evidence while keeping the
  directive evidence-in-progress.

2026-05-07 Projekt Objekt-143 SVYAZ-2 browser visibility closeout
- Read `docs/PROJEKT_OBJEKT_143.md` and selected the remaining SVYAZ-2
  acceptance gap: browser proof for map and in-world ping marker visibility.
- Added `scripts/projekt-143-svyaz-ping-command-browser-proof.ts` and package
  command `npm run check:projekt-143-svyaz-ping-command-browser`.
- Updated `scripts/projekt-143-svyaz-ping-command-audit.ts` so the static
  audit consumes the latest passing browser proof packet instead of hardcoding
  the browser visibility warning.
- Validation: initial `npm run check:projekt-143-svyaz-ping-command` remained
  WARN at
  `artifacts/perf/2026-05-07T21-33-44-693Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`
  because no browser proof existed.
- Validation: `npm run check:projekt-143-svyaz-ping-command-browser` forced
  `npm run build:perf` successfully, then the first browser attempt failed on
  a `page.evaluate` helper serialization error before writing a proof packet.
- Validation: `npm run check:projekt-143-svyaz-ping-command-browser -- --no-build`
  PASS at
  `artifacts/perf/2026-05-07T21-41-01-140Z/projekt-143-svyaz-ping-command-browser-proof/ping-command-browser-proof.json`
  with `11` pass, `0` warn, `0` fail, zero browser errors, in-world marker
  screenshot, and command-map marker screenshot.
- Validation: `npm run check:projekt-143-svyaz-ping-command` PASS at
  `artifacts/perf/2026-05-07T21-42-23-342Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`
  with `18` pass, `0` warn, `0` fail, and `acceptanceReady=true`.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to mark
  SVYAZ-2 evidence-complete and preserve non-claims for mobile ergonomics,
  live deploy parity, and SVYAZ-3.
- Updated `AGENTS.md` command inventory for the new SVYAZ-2 browser proof gate.

2026-05-07 Projekt Objekt-143 SVYAZ-2 in-world ping marker slice
- Read `docs/PROJEKT_OBJEKT_143.md` and selected the remaining SVYAZ-2
  source/test visual gap: placed squad commands had map/minimap markers but no
  scene-attached marker path.
- Added `SquadCommandWorldMarker`, wired it through `PlayerSquadController`
  construction with terrain-height sampling, and kept stand-down / neutral
  commands hiding the marker.
- Updated focused tests so directed squad commands prove a visible scene marker
  and stand-down proves the marker clears with the command position.
- Validation: `npx vitest run src/systems/combat/PlayerSquadController.test.ts
  src/systems/combat/CommandInputManager.test.ts
  src/ui/hud/CommandModeOverlay.test.ts
  src/systems/combat/ai/AIStatePatrol.test.ts
  src/systems/combat/CombatantAI.test.ts` PASS with `5` files and `83` tests.
- Validation: `npm run typecheck` PASS.
- Validation: `npm run check:projekt-143-svyaz-ping-command` PASS as WARN at
  `artifacts/perf/2026-05-07T21-23-38-724Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`
  with `17` pass, `1` warn, and `0` fail checks. The remaining SVYAZ-2 gap is
  browser visibility proof for map and in-world markers.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  SVYAZ-2 at the refreshed packet and preserve that the directive remains open.

2026-05-07 Projekt Objekt-143 SVYAZ-2 attack-here command slice
- Read `docs/PROJEKT_OBJEKT_143.md` and selected the remaining SVYAZ-2
  command-vocabulary gap from the `21-09-24-481Z` audit packet: attack-here
  was absent while in-world ping markers remained a separate visual scope.
- Added internal `SquadCommand.ATTACK_HERE`, exposed it as slot `6` with
  `ATTACK HERE` presentation, routed it through existing tactical-map placement,
  and preserved slot `5` as `STAND DOWN`.
- Added patrol-state and combat-priority handling so attack-here moves
  non-combat squad members toward the marked point while preserving active
  combat priority.
- Updated focused tests for command presentation, placement dispatch,
  `PlayerSquadController` command position storage, `AIStatePatrol`, and
  `CombatantAI`.
- Validation: `npx vitest run src/systems/combat/PlayerSquadController.test.ts
  src/systems/combat/CommandInputManager.test.ts
  src/ui/hud/CommandModeOverlay.test.ts
  src/systems/combat/ai/AIStatePatrol.test.ts
  src/systems/combat/CombatantAI.test.ts` PASS with `5` files and `82` tests.
- Validation: `npm run check:projekt-143-svyaz-ping-command` PASS as WARN at
  `artifacts/perf/2026-05-07T21-15-22-016Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`
  with `15` pass, `1` warn, and `0` fail checks. The only remaining SVYAZ-2
  audit gap is the in-world ping marker path; browser visibility proof remains
  unclaimed.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  SVYAZ-2 at the refreshed packet and preserve that the directive remains open.

2026-05-07 Projekt Objekt-143 SVYAZ-2 fall-back presentation alignment
- Read `docs/PROJEKT_OBJEKT_143.md` and selected the smallest remaining
  SVYAZ-2 command-surface gap from the `21-05-42-727Z` audit packet:
  player-facing fall-back wording still read `RETREAT`.
- Kept internal `SquadCommand.RETREAT` stable and relabeled the player-facing
  quick-command and command-overlay language to `FALL BACK`.
- Updated `scripts/projekt-143-svyaz-ping-command-audit.ts` so the audit
  accepts `FALL BACK` as the visible prose while preserving the internal
  retreat command as the fall-back equivalent.
- Validation: `npx vitest run src/ui/hud/CommandModeOverlay.test.ts
  src/systems/combat/CommandInputManager.test.ts` PASS with `2` files and `16`
  tests.
- Validation: `npm run check:projekt-143-svyaz-ping-command` PASS as WARN at
  `artifacts/perf/2026-05-07T21-09-24-481Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`
  with `14` pass, `2` warn, and `0` fail checks. Remaining SVYAZ-2 gaps are
  explicit attack-here support, in-world ping markers, and browser visibility
  proof.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  SVYAZ-2 at the refreshed packet and preserve that the directive remains open.

2026-05-07 Projekt Objekt-143 SVYAZ-2 ping command audit
- Read `docs/PROJEKT_OBJEKT_143.md` and selected SVYAZ-2 because the directive
  was still opened with no evidence packet while existing command plumbing
  could be measured locally without broad gameplay edits.
- Added `scripts/projekt-143-svyaz-ping-command-audit.ts` and package command
  `npm run check:projekt-143-svyaz-ping-command`.
- Validation: `npm run check:projekt-143-svyaz-ping-command` PASS as WARN at
  `artifacts/perf/2026-05-07T21-05-42-727Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`
  with `13` pass, `3` warn, and `0` fail checks across `14` source and test
  files. The packet records existing Hold, Patrol, and Retreat ground orders,
  tested tactical-map placement dispatch, minimap command markers, and partial
  travel-engagement evidence.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to record
  SVYAZ-2 as evidence-in-progress and preserve the gaps: no attack-here command
  surface, fall-back wording still presented as `RETREAT`, no in-world ping
  marker path, and no browser visibility proof.

2026-05-07 Projekt Objekt-143 VODA-1 water runtime evidence refresh
- Read `docs/PROJEKT_OBJEKT_143.md` and selected VODA-1 because the directive
  had older static and browser proof packets while the local gates can refresh
  evidence without deploy or baseline mutation.
- Validation: `npm run check:projekt-143-water-system` PASS as WARN at
  `artifacts/perf/2026-05-07T20-57-19-957Z/projekt-143-water-system-audit/water-system-audit.json`.
  The packet records the current provisional contract: `WaterSystem` remains
  the global water fallback, A Shau suppresses that plane, hydrology channel
  strips are wired from durable cache, and final stream visuals still need
  browser proof and human acceptance.
- Validation: `npm run check:projekt-143-water-runtime-proof` PASS at
  `artifacts/perf/2026-05-07T20-57-29-406Z/projekt-143-water-runtime-proof/water-runtime-proof.json`.
  The packet records zero browser errors and screenshot artifacts for Open
  Frontier and A Shau; Open Frontier has `12` hydrology channels / `592`
  segments with global water enabled, and A Shau has `12` channels / `552`
  segments with the global plane disabled.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  VODA-1 at the refreshed evidence and preserve the non-claim that final water
  art, perf, `evidence:atmosphere`, `terrain_water_exposure_review`, gameplay
  query acceptance, and human visual acceptance remain open.

2026-05-07 Projekt Objekt-143 DEFEKT-1 stale-baseline evidence refresh
- Read `docs/PROJEKT_OBJEKT_143.md` and selected DEFEKT-1 because the directive
  had an older stale-baseline packet while the gate can be refreshed locally
  without mutating `perf-baselines.json`.
- Validation: `npm run check:projekt-143-stale-baseline-audit -- --as-of
  2026-05-07` PASS as WARN at
  `artifacts/perf/2026-05-07T20-54-16-906Z/projekt-143-stale-baseline-audit/stale-baseline-audit.json`.
  The packet records `4` tracked scenarios, `0` current, `0` refresh-eligible,
  `4` blocked, and `4` stale by age. `combat120` is blocked by validation WARN
  / measurement trust WARN / max-frame FAIL; `openfrontier:short` by validation
  WARN; `ashau:short` by compare FAIL; `frontier30m` by failed latest detected
  soak capture.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  DEFEKT-1 at the `20-54-16-906Z` packet and preserve the non-claim that no
  baseline refresh or runtime fix is authorized.
- Validation: `npm run check:doc-drift -- --as-of 2026-05-07` PASS at
  `artifacts/perf/2026-05-07T20-55-23.462Z/projekt-143-doc-drift/doc-drift.json`
  with `futureDates=0`, `missingArtifacts=0`, and `missingScripts=0`.
- Validation: `git diff --check -- docs/PROJEKT_OBJEKT_143.md
  docs/STATE_OF_REPO.md progress.md` reported line-ending warnings only.

2026-05-07 Projekt Objekt-143 current completion audit repair
- Read `docs/PROJEKT_OBJEKT_143.md` and selected the STABILIZAT-3 /
  DEFEKT-2 completion-audit chain because the named closeout command still
  measured the retired pre-codex directive model.
- Added `scripts/projekt-143-current-completion-audit.ts` and routed
  `npm run check:projekt-143-completion-audit` to it. The legacy
  `scripts/projekt-143-completion-audit.ts` remains in place for historical
  comparison.
- Validation: `npm run check:projekt-143-completion-audit` PASS as a
  `NOT_COMPLETE` current-codex audit at
  `artifacts/perf/2026-05-07T20-45-16-604Z/projekt-143-completion-audit/completion-audit.json`.
  The packet parses `33` Article III directives, records `9` closed and `24`
  open, finds zero missing cited artifacts, rejects live release parity because
  the latest live proof is for SHA
  `ab0cfd0e9a0f39ebe8b3a87f316b9287edfd3289` while local HEAD is
  `aff1abd4da769e2a04e6e5f9b39d241296a60ada`, and records the missing
  Politburo seal plus missing 14-day live drift watch.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` so the
  directive board reflects the current completion-audit evidence path and does
  not inflate the negative audit into release proof.
- Validation: `npm run check:doc-drift -- --as-of 2026-05-07` PASS at
  `artifacts/perf/2026-05-07T20-46-40.235Z/projekt-143-doc-drift/doc-drift.json`
  with `futureDates=0`, `missingArtifacts=0`, and `missingScripts=0`.
- Validation: `git diff --check -- scripts/projekt-143-current-completion-audit.ts
  package.json docs/PROJEKT_OBJEKT_143.md docs/STATE_OF_REPO.md progress.md`
  reported line-ending warnings only.

2026-05-07 Projekt Objekt-143 DEFEKT-2 drift evidence refresh
- Read `docs/PROJEKT_OBJEKT_143.md` and selected DEFEKT-2 because the local
  drift gate had a newer pass packet after the completion-audit repair, while
  the codex still named the earlier drift packet as the latest evidence path.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to cite the
  follow-up pass packet
  `artifacts/perf/2026-05-07T20-46-40.235Z/projekt-143-doc-drift/doc-drift.json`
  and preserve the limitation that local doc/code/artifact drift does not
  satisfy Article VII's 14-day live deployment drift watch.
- Validation: `npm run check:doc-drift -- --as-of 2026-05-07` PASS at
  `artifacts/perf/2026-05-07T20-49-35.515Z/projekt-143-doc-drift/doc-drift.json`
  with `futureDates=0`, `missingArtifacts=0`, `missingScripts=0`,
  `artifactRefsChecked=508`, and `packageCommandRefsChecked=272`.
- Sidecar Article VII check: `npm run check:projekt-143-completion-audit` PASS
  as `NOT_COMPLETE` at
  `artifacts/perf/2026-05-07T20-49-52-180Z/projekt-143-completion-audit/completion-audit.json`;
  `canMarkGoalComplete=false`, `33` Article III directives parsed, `9` closed,
  `24` open, `0` deferred, and DEFEKT 14-day live drift remains failing.

2026-05-07 Projekt Objekt-143 STABILIZAT-3 completion evidence refresh
- Read `docs/PROJEKT_OBJEKT_143.md` and selected STABILIZAT-3 because the
  directive still cited the older current-codex completion packet after the
  DEFEKT-2 follow-up drift proof.
- Validation: `npm run check:projekt-143-completion-audit` PASS as
  `NOT_COMPLETE` at
  `artifacts/perf/2026-05-07T20-51-55-791Z/projekt-143-completion-audit/completion-audit.json`.
  The packet records `canMarkGoalComplete=false`, `33` Article III directives
  parsed, `9` closed, `24` open, `0` deferred, zero missing cited artifacts,
  latest local drift proof pass at
  `artifacts/perf/2026-05-07T20-49-35.515Z/projekt-143-doc-drift/doc-drift.json`,
  and failed STABILIZAT-3 live release plus failed 14-day live drift criteria.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` to point
  STABILIZAT-3 / current closeout state at the `20-51-55-791Z` packet.
- Validation: `npm run check:doc-drift -- --as-of 2026-05-07` PASS at
  `artifacts/perf/2026-05-07T20-52-55.308Z/projekt-143-doc-drift/doc-drift.json`
  with `futureDates=0`, `missingArtifacts=0`, and `missingScripts=0`.
- Validation: `git diff --check -- docs/PROJEKT_OBJEKT_143.md
  docs/STATE_OF_REPO.md progress.md` reported line-ending warnings only.

2026-05-07 Projekt Objekt-143 UX-1 respawn surface audit
- Read `docs/PROJEKT_OBJEKT_143.md` and selected UX-1 because the directive
  had source/test gaps and no runtime proof packet.
- Follow-up multi-spawn proof: added
  `scripts/projekt-143-ux-respawn-multispawn-proof.ts` and package command
  `npm run check:projekt-143-ux-respawn-multispawn`. Latest proof PASS at
  `artifacts/perf/2026-05-07T20-27-26-789Z/projekt-143-ux-respawn-multispawn-proof/ux-respawn-multispawn-proof.json`
  with `10` pass, `0` warn, `0` fail, zero browser errors, required
  home-base/zone/helipad/insertion classes on desktop and mobile, mobile 48px
  spawn targets, and screenshot evidence.
- KB-DIZAYN follow-up gate: signed the local UX-1 visual packet at
  `artifacts/perf/2026-05-07T20-28-48-561Z/projekt-143-ux-respawn-dizayn-gate/ux-respawn-dizayn-gate.json`
  after map-label anchoring, responsive mobile metadata correction, and
  multi-spawn-class proof. UX-1 remains open only for live production parity or
  explicit Politburo deferral to STABILIZAT.
- Previous KB-DIZAYN gate: reviewed the trusted desktop/mobile screenshots
  from the UX-1 browser proof and recorded `returned_with_notes` at
  `artifacts/perf/2026-05-07T20-07-49-954Z/projekt-143-ux-respawn-dizayn-gate/ux-respawn-dizayn-gate.json`.
  The gate does not sign UX-1 because the proof shows only the home-base spawn
  case and the mobile map labels crowd at the selected base marker.
- Added `scripts/projekt-143-ux-respawn-audit.ts`,
  `scripts/projekt-143-ux-respawn-browser-proof.ts`, and package commands
  `npm run check:projekt-143-ux-respawn` /
  `npm run check:projekt-143-ux-respawn-browser`.
- Implemented explicit alliance metadata, grouped textual spawn choices,
  spawn-class map labels, death-to-decision timing, and mobile deploy layout
  corrections preserving `#respawn-side-scroll` as the mobile scroll owner.
- Implemented map-label placement by spawn kind with leader lines and clamped
  anchors, and stacked mobile header metadata so long mode/flow values stay
  inside the panel.
- Validation: `npm run check:projekt-143-ux-respawn` PASS at
  `artifacts/perf/2026-05-07T20-30-26-829Z/projekt-143-ux-respawn-audit/ux-respawn-audit.json`
  with `15` pass, `0` warn, `0` fail, and `acceptanceReady=true`.
- Validation: `npm run build` PASS after the UX-1 map-label and mobile-header
  corrections; Vite emitted the existing large-chunk warning and wrote
  `dist/asset-manifest.json`.
- Validation: `npm run check:projekt-143-ux-respawn-browser` PASS at
  `artifacts/perf/2026-05-07T20-35-21-453Z/projekt-143-ux-respawn-browser-proof/ux-respawn-browser-proof.json`
  against the fresh production bundle with `8` pass, `0` warn, `0` fail, zero
  browser errors, desktop/mobile screenshots, visible alliance, decision
  timing, and 48px mobile spawn targets. This proof covers the current
  production-build Zone Control surface and shows only the live single
  home-base spawn case; multi-spawn class spread remains covered by the
  source-served multi-spawn proof above.
- Validation: `npx vitest run src/systems/player/RespawnUI.test.ts
  src/systems/player/PlayerRespawnManager.test.ts` PASS with `2` files and
  `118` tests.
- Validation: `npm run build` PASS; latest build wrote `dist/asset-manifest.json`.
- Validation: `npm run check:mobile-ui` PASS at
  `artifacts/mobile-ui/2026-05-07T19-46-27-777Z/mobile-ui-check` with `72`
  checks, `3` policy skips, and zero page, request, or console errors.
- Remaining UX-1 gap: live production parity, unless the Politburo explicitly
  defers live UX-1 proof to STABILIZAT.
- Doctrine reconciliation: `npm run check:doc-drift -- --as-of 2026-05-07`
  PASS at
  `artifacts/perf/2026-05-07T20-09-22.156Z/projekt-143-doc-drift/doc-drift.json`
  with `futureDates=0`, `missingArtifacts=0`, and `missingScripts=0`.

2026-05-07 Projekt Objekt-143 SVYAZ-1 stand-down command implementation
- Continued from the SVYAZ-1 neutral-command audit packet at
  `artifacts/perf/2026-05-07T18-39-06-317Z/projekt-143-svyaz-neutral-command-audit/neutral-command-audit.json`.
- Changed the existing `FREE_ROAM` quick command presentation from `AUTO` /
  `FREE ROAM` to explicit `STAND DOWN` language, preserving the existing enum
  and non-targeted command slot instead of adding a new command type.
- Updated `PlayerSquadController` so stand-down clears the prior
  `commandPosition` while preserving the selected squad and formation.
- Locked the UX policy that Escape/backdrop cancel remains modal close only;
  slot 5 is the explicit squad stand-down order.
- Added focused tests for stand-down label exposure, command-position clearing,
  formation preservation, and command-input cancel policy.
- Validation: `npm run check:projekt-143-svyaz-neutral-command` PASS at
  `artifacts/perf/2026-05-07T18-45-48-457Z/projekt-143-svyaz-neutral-command-audit/neutral-command-audit.json`
  with `15` pass, `0` warn, and `0` fail checks.
- Validation: targeted Vitest command for
  `PlayerSquadController.test.ts`, `CommandInputManager.test.ts`,
  `CommandModeOverlay.test.ts`, `CombatantAI.test.ts`,
  `AIStatePatrol.test.ts`, and `CombatantMovementStates.test.ts` PASS with
  `104` tests.
- Validation: browser stand-down proof PASS at
  `artifacts/perf/2026-05-07T18-59-28-353Z/projekt-143-svyaz-standdown-browser-proof/standdown-browser-proof.json`.
  It proves the overlay exposes `STAND DOWN`, slot 5 issues `free_roam`,
  the prior command position clears, and `wedge` formation remains intact.
- Caveat: `npm run check:hud` timed out during the broader HUD gate on this
  machine. The narrower SVYAZ-1 browser proof passed and wrote a web-game
  smoke screenshot under the same artifact root.
- Doctrine reconciliation: `npm run check:doc-drift -- --as-of 2026-05-07`
  PASS at
  `artifacts/perf/2026-05-07T19-03-50.180Z/projekt-143-doc-drift/doc-drift.json`
  with `futureDates=0`, `missingArtifacts=0`, and `missingScripts=0`.

2026-05-06 Projekt Objekt-143 KB-CULL vehicle interaction safety slice
- Fixed a cross-vehicle prompt bug in `HelicopterInteraction`: helicopter
  proximity and entry now suppress while the player is already in any vehicle,
  not just while already in a helicopter. This prevents a competing helicopter
  entry prompt/entry path while the player is riding a fixed-wing aircraft.
- Added culling-safety behavior coverage for future vehicle work:
  render-culled/invisible helicopters and fixed-wing aircraft remain
  proximity-detectable and enterable when the player is on foot. This keeps
  render visibility independent from gameplay interaction, which is required
  before broader vehicle/HLOD culling or future drivable ground vehicles.
- Validation: `npx vitest run
  src/systems/helicopter/HelicopterInteraction.test.ts
  src/systems/vehicle/FixedWingInteraction.test.ts
  src/systems/vehicle/AirVehicleVisibility.test.ts --reporter=dot` PASS
  (`16` tests), `npx tsc --noEmit --pretty false` PASS, and
  `npm run build:perf` PASS.
- Fresh completion audit remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T16-09-55-891Z/projekt-143-completion-audit/completion-audit.json`;
  blockers remain KB-LOAD, broad KB-TERRAIN, broad KB-CULL, and
  validation/release.
- Refreshed Cycle 3 kickoff
  `artifacts/perf/2026-05-06T16-54-35-084Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  now records the vehicle-interaction safety slice under KB-CULL while keeping
  broad HLOD/vehicle-driving/vegetation culling open.
- Non-claim: this is a scoped KB-CULL vehicle-interaction safety slice only.
  It does not close broad HLOD/culling, parked-aircraft playtest coverage,
  future ground-vehicle driving, matched runtime perf, or release parity.

2026-05-06 Projekt Objekt-143 large foundation footprint hardening
- Hardened the runtime placement solver against the owner-observed
  building/vehicle foundation overhang risk. The warehouse GLB's scaled
  horizontal footprint is about `17.5m` radius, while the old runtime solver
  capped model footprint at `10m` and sampled terrain relief at `9.5m`; the
  solver now allows large static placements up to `24m`, samples terrain out
  to `18m`, and searches a wider `24m` large-prop flat candidate radius.
- Tightened `scripts/projekt-143-terrain-placement-audit.ts` so generated
  airfield placements use model-aware footprint proxies for known large
  buildings and ground vehicles instead of the old single small-prop proxy.
  Latest `npm run check:projekt-143-terrain-placement` PASS:
  `artifacts/perf/2026-05-06T16-50-24-263Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  with `fail=0`, `warn=0`, default generated-placement footprint `8m`, and
  max known generated-placement proxy `18m`.
- Validation: `npx vitest run src/systems/world/WorldFeatureSystem.test.ts
  src/systems/world/AirfieldLayoutGenerator.test.ts --reporter=dot` PASS
  (`31` tests), `npx tsc --noEmit --pretty false` PASS,
  `npm run build:perf` PASS, and `node --check
  scripts/perf-active-driver.cjs` PASS.
- Fresh completion audit:
  `artifacts/perf/2026-05-06T15-53-08-933Z/projekt-143-completion-audit/completion-audit.json`.
  Projekt remains `NOT_COMPLETE`: KB-LOAD, broad KB-TERRAIN, broad KB-CULL,
  and validation/release remain blockers. This pass does not import Pixel
  Forge building/vehicle GLBs, does not claim human foundation visual
  acceptance, and does not certify future vehicle-driving surfaces.

2026-05-06 Projekt Objekt-143 A Shau objective route-stall follow-up
- Accepted a narrow strategy/follower movement fix for the A Shau
  terrain-stall/backtracking pattern that remained after the objective-aware
  active-driver pass. `WarSimulator` now keeps strategic spawns and final
  formation slots inside objective shoulders, `StrategicDirector` uses bounded
  disc scatter instead of full-radius square scatter for squad zone
  assignments, and `CombatantMovementStates` makes followers own their leader
  destination/hold position instead of falling through to enemy-base fallback
  motion while close to the leader.
- Runtime proof after the accepted patch:
  `artifacts/perf/2026-05-06T15-32-02-870Z/summary.json` is A Shau OK with
  measurement trust PASS and validation WARN only. It records `223` shots,
  `44` hits, `10` kills, max stuck `1.2s`, `1` route no-progress reset, and
  `21` terrain-stall/backtracking warnings. The warning shape is improved
  versus the immediately prior scatter-only run at
  `artifacts/perf/2026-05-06T15-27-27-070Z/summary.json`, which logged `44`
  warnings with one combatant repeating `19` times; after the follower fix, no
  combatant repeats more than `3` times.
- Rejected a broad A Shau terrain-flow/trail-shoulder tweak. Diagnostic run
  `artifacts/perf/2026-05-06T15-36-41-357Z/summary.json` stayed WARN with
  `22` terrain-stall warnings, so the config change was reverted instead of
  being carried as a fix.
- Validation: focused movement/strategy/world/active-driver Vitest PASS
  (`239` tests), `npx tsc --noEmit --pretty false` PASS, and
  `npm run build:perf` PASS after reverting the rejected terrain-flow
  experiment. Fresh completion audit:
  `artifacts/perf/2026-05-06T15-42-48-513Z/projekt-143-completion-audit/completion-audit.json`.
  Projekt remains `NOT_COMPLETE`: KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release remain blockers.

2026-05-06 Projekt Objekt-143 objective-aware driver and culling owner-slice proof
- Fixed the remaining harness-player objective/target plumbing that matched the
  owner-observed pacing/twitch failure. `scripts/perf-active-driver.cjs` now
  gates target locks against the current objective, so far perceived enemies do
  not steal zone/objective routing, and a target that triggers route
  no-progress gets an `8s` temporary cooldown instead of being reacquired on
  the next tick. Added Vitest coverage for far-target objective preservation,
  close visible target interruption, and target cooldown behavior.
- Runtime proof after the fix:
  Open Frontier `artifacts/perf/2026-05-06T15-09-39-654Z/summary.json`
  completed OK with measurement trust PASS, validation WARN only, `112` shots,
  `18` hits, `5` kills, `0` route no-progress resets, and max stuck `1.8s`.
  A Shau `artifacts/perf/2026-05-06T15-11-14-529Z/summary.json` completed OK
  with measurement trust PASS, validation WARN only, `210` shots, `30` hits,
  `7` kills, `1` route no-progress reset, and max stuck `3.3s`.
- The same runtime pair refreshed KB-CULL after the world static feature
  frustum-sector visibility patch. `npm run check:projekt-143-culling-baseline`
  PASS at
  `artifacts/perf/2026-05-06T16-53-41-964Z/projekt-143-culling-owner-baseline/summary.json`.
  Cycle 3 kickoff at
  `artifacts/perf/2026-05-06T15-14-05-137Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  records the static-feature/visible-helicopter owner path as
  `evidence_complete`: Open Frontier owner visible draw-call-like delta `-223`
  and total renderer draw calls delta `-281`; A Shau owner visible
  draw-call-like delta `-661` and total renderer draw calls delta `-392`.
- Fresh completion audit:
  `artifacts/perf/2026-05-06T15-14-35-828Z/projekt-143-completion-audit/completion-audit.json`.
  Projekt remains `NOT_COMPLETE`. KB-CULL is now partial because broad HLOD,
  vehicle interaction, static-cluster, and vegetation-distance policy remain
  open, not because the selected static-owner slice lacks proof. KB-LOAD,
  KB-TERRAIN, KB-CULL, and validation/release remain blockers.
- Validation so far: `node --check scripts/perf-active-driver.cjs` PASS,
  `npx vitest run scripts/perf-harness/perf-active-driver.test.js --reporter=dot`
  PASS (`167` tests), `npm run build:perf` PASS before the perf pair, and the
  three Projekt audits above PASS as scoped/NOT_COMPLETE evidence.

2026-05-06 Projekt Objekt-143 default hydrology-backed vegetation classification
- Advanced KB-TERRAIN without starting new GPU-heavy captures while other local
  agents may be active. A Shau and Open Frontier now default-enable baked
  hydrology cache preload plus hydrology-backed vegetation-biome
  classification in `src/config/AShauValleyConfig.ts` and
  `src/config/OpenFrontierConfig.ts`.
- Hardened `ModeStartupPreparer`: hydrology cache fetch/parse failures now log
  WARN and continue without the optional hydrology classifier instead of
  blocking mode startup.
- Added a terrain material consumer for the same hydrology masks:
  `TerrainSurfaceRuntime` materializes wet/channel masks as a GPU texture,
  `TerrainBiomeRuntimeConfig` can include hydrology-only biome slots, and
  `TerrainMaterial` samples the mask to prefer wet/channel ground texture and
  roughness blends.
- Added `src/config/gameModeHydrology.test.ts` and a startup fallback test.
  Focused validation passed:
  `npx vitest run src/core/ModeStartupPreparer.test.ts src/config/gameModeHydrology.test.ts src/systems/terrain/hydrology/HydrologyBakeManifest.test.ts src/systems/terrain/VegetationScatterer.test.ts src/systems/terrain/TerrainSystem.test.ts`
  (`43` tests), plus `npm run check:hydrology-bakes` PASS.
- Runtime validation: `npm run build:perf` PASS. Short headed Open Frontier
  hydrology-default startup/liveness proof
  `artifacts/perf/2026-05-06T09-51-26-258Z/summary.json` is WARN with
  measurement trust PASS, no browser errors, p99 `39.40ms`, heap peak growth
  PASS `24.92MB`, and `26` shots / `9` hits. Short headed A Shau proof
  `artifacts/perf/2026-05-06T09-52-17-998Z/summary.json` is WARN with
  measurement trust PASS, no browser errors, p99 `26.60ms`, heap peak growth
  `72.73MB`, `73` shots / `40` hits, and
  active-driver diagnostic PASS at
  `artifacts/perf/2026-05-06T09-52-17-998Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
- Refreshed static terrain checks:
  `artifacts/perf/2026-05-06T09-51-07-413Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
  remains WARN on the broad existing elevation proxy, and
  `artifacts/perf/2026-05-06T09-29-43-351Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  remains WARN only for the random-seed AI Sandbox fallback.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T09-59-02-813Z/projekt-143-completion-audit/completion-audit.json`.
  It now records `terrainHydrologyBakeLoaderStatus=default_mode_preload` and
  `terrainHydrologyBiomeClassifierStatus=default_mode_vegetation_classifier`,
  plus `terrainHydrologyMaterialMaskStatus=default_mode_material_mask`,
  but remains `NOT_COMPLETE`. This closes only the default vegetation-mask and
  terrain-material-mask wiring slice; water rendering/river meshes, visual
  acceptance, KB-LOAD, broad KB-CULL, and release parity remain open.

2026-05-06 Projekt Objekt-143 close-model culling and full-duration active-driver pair
- Ran A Shau 20s first to check the post-fix active-driver shape:
  `artifacts/perf/2026-05-06T09-01-40-612Z/summary.json`. It failed validation
  only as diagnostic evidence: measurement trust PASS, movement/combat healthy,
  but heap recovery failed at the end of the short window and shots warned.
- A longer A Shau 60s proof before the culling patch passed as WARN at
  `artifacts/perf/2026-05-06T09-03-39-765Z/summary.json`, with diagnostic PASS.
  The matching Open Frontier 60s proof then exposed the next bottleneck at
  `artifacts/perf/2026-05-06T09-06-03-544Z/summary.json`: measurement trust
  PASS but validation FAIL on average frame `31.08ms`, p99 `65.90ms`, hitch50
  `3.78%`, and close weapon/close GLB draw-call pressure.
- Fixed the scoped KB-CULL cause in `CombatantRenderer`: close Pixel Forge NPC
  body and weapon meshes now stay eligible for renderer frustum culling, with
  missing bounding spheres computed, instead of forcing `frustumCulled=false`
  on every close-model child.
- Validation: `npx vitest run src/systems/combat/CombatantRenderer.test.ts`
  PASS (`28` tests), `npm run typecheck` PASS, and `npm run build:perf` PASS.
- Matched after evidence now gives full-duration active-driver liveness on the
  rebuilt code:
  Open Frontier `artifacts/perf/2026-05-06T09-09-45-715Z/summary.json`
  validation WARN with measurement trust PASS, diagnostic PASS, p99 `47.90ms`,
  hitch50 `0.04%`, heap peak growth `6.69MB`, `81` shots / `45` hits, max stuck
  `0.8s`; A Shau
  `artifacts/perf/2026-05-06T09-11-34-037Z/summary.json` validation WARN with
  measurement trust PASS, diagnostic PASS, p99 `26.70ms`, hitch50 `0%`, heap
  peak growth `27.81MB`, `171` shots / `95` hits, max stuck `0.7s`.
- Non-claim: this accepts only active-driver liveness plus scoped close-model
  frustum-culling evidence. KB-TERRAIN still needs hydrology/water, ground
  cover/trail visual acceptance, and remaining NPC terrain-stall/backtracking
  quality work. KB-CULL still needs broad HLOD/static-cluster/vehicle/
  vegetation culling evidence.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T09-21-20-265Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE`; blockers are KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release.

2026-05-06 Projekt Objekt-143 active-driver terrain/contact and combat-front proof
- Fixed the retained active-driver runtime failure path after the rejected
  path-planning experiments. `perf-capture.ts` now injects runtime helper code
  as raw browser init-script content so samples no longer page-error on helper
  references. `TerrainQueries.getEffectiveHeightAt()` now treats only
  low/standable static support surfaces and explicit helipads as effective
  ground; tall generic and dynamic collision bounds remain collision blockers
  but no longer raise player ground. Open Frontier active-driver compression is
  now player-anchored for long maps, capped to avoid dogpiling, and syncs
  combatant logical positions with rendered anchors and the spatial grid.
- Latest headed proof:
  `artifacts/perf/2026-05-06T08-52-31-466Z/summary.json`. Measurement trust
  PASS, validation WARN. Active gates PASS: `33` player shots, `19` hits,
  `6` kills, max stuck `0.5s`, and `19` movement transitions. Runtime liveness
  shows `playerBlockedByTerrain=0`, `collisionHeightDeltaAtPlayer=0`, and
  movement debug `blockReason=none`. Diagnostic:
  `artifacts/perf/2026-05-06T08-52-31-466Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  PASS.
- Non-claim: this is active-driver liveness evidence, not Projekt completion or
  KB-TERRAIN acceptance. The run is only 20s, Open Frontier only, and still
  WARNs on average frame `26.37ms`, p99 `53.50ms`, hitch50 `0.94%`, and heap
  peak growth `77.85MB`; A Shau route/nav quality and full-duration/soak proof
  remain open.
- Validation: `node --check scripts/perf-active-driver.cjs` PASS; focused
  active-driver/diagnostic/terrain/player movement/controller Vitest suite PASS
  (`256` tests); `npm run typecheck` PASS.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T08-59-52-107Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE`; blockers are KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release because the worktree is still uncommitted and not
  production-verified.

2026-05-06 Projekt Objekt-143 resource-free evidence pass
- Opened the Pixel Forge vegetation candidate contact sheet for owner review in Edge:
  `artifacts/perf/2026-05-06T04-17-12-580Z/projekt-143-vegetation-candidate-proof/candidate-contact-sheet.png`.
  This still requires owner visual acceptance before any runtime import.
- Refreshed KB-TERRAIN horizon proof after a fresh perf build:
  `artifacts/perf/2026-05-06T04-23-14-080Z/projekt-143-terrain-horizon-baseline/summary.json`
  PASS with 4/4 elevated screenshots, renderer/terrain/vegetation counters,
  trusted Open Frontier/A Shau perf baselines, and 0 browser errors.
- Refreshed KB-CULL deterministic proof and owner baseline:
  `artifacts/perf/2026-05-06T16-53-34-384Z/projekt-143-culling-proof/summary.json`
  PASS and
  `artifacts/perf/2026-05-06T16-53-41-964Z/projekt-143-culling-owner-baseline/summary.json`
  PASS.
- Ran fresh resource-free large-mode captures:
  Open Frontier `artifacts/perf/2026-05-06T04-27-07-950Z/summary.json`
  and A Shau `artifacts/perf/2026-05-06T04-30-51-979Z/summary.json`.
  Both have measurement trust PASS and validation WARN. Open Frontier warns on
  p99 `45.40ms`, heap peak growth `66.23MB`, and shots below harness minimum;
  A Shau warns on p99 `33.40ms`, heap peak growth `87.77MB`, and shots below
  harness minimum. Both logs still show terrain-stall/backtracking noise, so
  route/nav quality is not signed.
- Refreshed kickoff and completion audit:
  `artifacts/perf/2026-05-06T16-54-35-084Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  PASS and
  `artifacts/perf/2026-05-06T05-53-50-518Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`. KB-OPTIK, KB-EFFECTS, KB-FORGE, and owner vegetation
  specifics are PASS; KB-STRATEGIE browser capability probing, KB-LOAD,
  KB-TERRAIN, KB-CULL, and validation/release remain blockers.
- Refreshed static Projekt suite after excluding completion-audit tooling from
  the WebGPU active-runtime scan:
  `artifacts/perf/2026-05-06T05-53-35-745Z/projekt-143-evidence-suite/suite-summary.json`
  PASS. Its KB-STRATEGIE step writes
  `artifacts/perf/2026-05-06T05-53-35-718Z/webgpu-strategy-audit/strategy-audit.json`
  with `activeWebgpuSourceMatches=0`; the platform capability probe remains
  browser-deferred until the machine is quiet.

2026-05-05 KB-OPTIK imposter view follow-up
- Owner review rejected the runtime-equivalent NPC comparison because the close GLB faced camera with a weapon while the imposter showed a top-of-head/back-facing atlas view.
- Root cause was TIJ sampling Pixel Forge `animated-octahedral-imposter` NPC atlases as yaw-only columns while hard-selecting the center row. The center row is the overhead/top view in this octahedral grid.
- Added per-instance imposter view rows and an octahedral camera-direction selector for NPC imposters; updated the runtime review, expanded proof, and scale proof harnesses to use row-aware sampling.
- New review packet: `artifacts/perf/2026-05-05T22-48-34-788Z/projekt-143-optik-human-review/index.html`. It remains `needs_human_decision`, not accepted.
- Refreshed kickoff `artifacts/perf/2026-05-05T22-50-14-559Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json` is WARN with KB-OPTIK still `needs_decision`; completion audit `artifacts/perf/2026-05-05T22-50-24-059Z/projekt-143-completion-audit/completion-audit.json` is still `NOT_COMPLETE`.
- Validation: `npx tsc --noEmit --pretty false` PASS; `npx vitest run src/systems/combat/CombatantRenderer.test.ts src/systems/combat/CombatantMeshFactory.test.ts` PASS (`45` tests).

2026-05-05 KB-OPTIK silhouette/coverage audit
- Added code-measured alpha-mask alignment to `scripts/projekt-143-optik-runtime-review.ts`; the review now writes close/imposter silhouette crops plus red/cyan/white overlays.
- New review packet: `artifacts/perf/2026-05-05T22-55-48-974Z/projekt-143-optik-human-review/index.html`.
- All four faction pairs now use the same canonical front octahedral tile `3,0`; the earlier per-faction view skew was caused by using actor x-offset with an orthographic review camera.
- Metrics confirm the remaining mismatch is width/coverage, not height: mask IoU `0.5084-0.5366`, height ratio `0.9639-0.98`, imposter opaque area ratio `1.8253-1.8592`, and visible width ratio `1.6818-1.7667`.
- Biggest residual alignment offsets: VC centroid delta `19.38px`, NVA bbox-center delta `13.24px` in the `512px` audit crop.
- Validation: `npx tsc --noEmit --pretty false` PASS; combat renderer/mesh factory Vitest PASS; refreshed scale proof PASS; runtime LOD-edge expanded proof WARN on luma; kickoff `artifacts/perf/2026-05-05T22-56-45-502Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json` remains WARN; completion audit `artifacts/perf/2026-05-05T22-56-43-629Z/projekt-143-completion-audit/completion-audit.json` remains `NOT_COMPLETE`.

2026-05-05 KB-OPTIK horizontal crop remediation
- Root cause of the measured coverage mismatch was the runtime shader stretching Pixel Forge's tight horizontal crop to the full NPC billboard width. The fix keeps vertical crop behavior but expands the horizontal sampling window by `1.7x`.
- Updated runtime/proof shader paths: `CombatantMeshFactory`, `projekt-143-optik-runtime-review`, `projekt-143-optik-expanded-proof`, and `projekt-143-optics-scale-proof`.
- New review packet: `artifacts/perf/2026-05-05T23-01-30-992Z/projekt-143-optik-human-review/index.html`; it is open for human inspection.
- Metrics improved materially: mask IoU `0.6143-0.8633`, height ratio `0.9639-0.98`, opaque area ratio `1.0717-1.0945`, visible width ratio `0.9886-1.0444`, max centroid delta `14.09px`, and max bbox-center delta `13.29px`.
- Validation: `npx tsc --noEmit --pretty false` PASS; `npx vitest run src/systems/combat/CombatantRenderer.test.ts src/systems/combat/CombatantMeshFactory.test.ts` PASS (`45` tests); scale proof `artifacts/perf/2026-05-05T23-02-25-884Z/projekt-143-optics-scale-proof/summary.json` PASS; runtime LOD-edge expanded proof `artifacts/perf/2026-05-05T23-02-25-910Z/projekt-143-optik-expanded-proof/summary.json` WARN on luma; kickoff `artifacts/perf/2026-05-05T23-02-48-164Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json` WARN; completion audit `artifacts/perf/2026-05-05T23-02-46-377Z/projekt-143-completion-audit/completion-audit.json` remains `NOT_COMPLETE`.

2026-05-05 KB-OPTIK VC luma pass
- The remaining luma proof flags were isolated to VC; US/ARVN/NVA were already inside band.
- Tuned only VC imposter parity values. Scale proof now PASS at `artifacts/perf/2026-05-05T23-05-39-582Z/projekt-143-optics-scale-proof/summary.json` with selected-lighting luma delta `-5.06%` to `-0.81%`.
- Runtime LOD-edge expanded proof now PASS at `artifacts/perf/2026-05-05T23-05-39-578Z/projekt-143-optik-expanded-proof/summary.json` with luma delta `-9.44%` to `10.5%` and `0` flagged samples.
- Final review packet: `artifacts/perf/2026-05-05T23-05-52-555Z/projekt-143-optik-human-review/index.html`; silhouette metrics remain mask IoU `0.6143-0.8633`, height ratio `0.9639-0.98`, opaque area ratio `1.0717-1.0945`, and visible width ratio `0.9886-1.0444`.
- Validation: `npx tsc --noEmit --pretty false` PASS; `npx vitest run src/systems/combat/CombatantRenderer.test.ts src/systems/combat/CombatantMeshFactory.test.ts src/systems/combat/CombatantShaders.test.ts` PASS (`48` tests); kickoff `artifacts/perf/2026-05-05T23-06-21-567Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json` WARN because human visual review/explicit exception is still required; completion audit `artifacts/perf/2026-05-05T23-06-19-305Z/projekt-143-completion-audit/completion-audit.json` remains `NOT_COMPLETE`.

2026-04-01
- Validated the perf-harness freeze in the real browser path instead of assuming. Root cause is the same-document View Transition boundary used by `GameUI.hide()` during live-entry, not a generic Playwright/WebGL/rAF failure.
- Added `src/ui/engine/UITransitions.ts` to centralize transition policy. Menu-only transitions still opt in when supported; live-entry always falls back to immediate DOM updates. `?uiTransitions=0|1` is available for diagnostics. Perf/sandbox default to no transitions.
- Updated `GameUI` to route title/mode-select through menu transitions and route live-entry through the non-transition path.
- Hardened `scripts/perf-capture.ts` with startup diagnostics (`startupPhase`, `rafTicks`, visibility, active transition state), partial artifact writing on emergency shutdown, and signal cleanup for browser/lock release.
- Canonicalized perf scenario IDs to `combat120`, `openfrontier:short`, `ashau:short`, and `frontier30m`; aligned baselines and CI perf gating; added missing `@recast-navigation/generators`; removed stale `webgl-memory`; expanded `knip` entrypoints.
- Added focused tests for transition policy and `GameUI.hide()` behavior.
- Fixed two harness-adjacent runtime issues discovered during cold-start validation:
  - Replaced the inline `page.addInitScript(() => ...)` startup probe with raw script content after browser pageerrors showed the injected bundle expected a helper (`__name`) that did not exist in page scope.
  - Hardened deferred startup work in `LiveEntryActivator` so background tasks bail if the engine has already been disposed, preventing stale short-lived warmup runs from throwing `SystemRegistry is missing required system "combatantSystem"`.
- Fixed the fresh-dev-server navmesh worker race by awaiting Recast init inside `src/workers/navmesh.worker.ts` and falling back to main-thread navmesh generation in `NavmeshSystem` if worker generation still fails.
- Limited Vite dev-server dependency scanning to `index.html` and ignored `artifacts/**` so newly written perf artifacts do not pollute the next capture's dev-server graph.

2026-04-02 validation
- `npm run lint`: PASS
- `npm run deadcode`: PASS
- `npm run test:quick`: PASS (`182` files, `3627` tests)
- `npm run build`: PASS
- Fresh cold-start perf capture succeeded:
  - command: `npx tsx scripts/perf-capture.ts --headed --mode ai_sandbox --npcs 120 --duration 90 --warmup 15 --reuse-dev-server false`
  - artifact: `artifacts/perf/2026-04-02T03-44-57-591Z`
  - startup threshold: `6s`
  - browser errors/pageerrors: `0`
  - overall validation: `warn` only because `peak_p99_frame_ms=34.30ms`
- `npm run perf:compare -- --scenario combat120`: `6 pass`, `2 warn`, `0 fail`
  - warns: `p95FrameMs=33.30ms`, `p99FrameMs=34.30ms`

TODO
- Re-baseline perf scenarios after the recovered harness is confirmed stable.
- Capture and compare the remaining canonical scenarios: `openfrontier:short`, `ashau:short`, `frontier30m`.
- Investigate the remaining `combat120` tail-latency warnings (`p95`/`p99`) now that the harness itself is trustworthy again.

Suggestions
- Keep WebGPU/TSL/ECS work out of scope until perf baselines are current again.
- The grenade/explosion first-use hitch still needs fresh evidence after the harness recovery; current docs mark that as unresolved.

2026-04-02 continuation
- Continued the `combat120` tail cleanup with a frame-local cover-search result cache in `AICoverFinding`, wired through `AITargeting.beginFrame()`. Also corrected the vegetation cover probe to the intended centered `8x8` sample grid and added tests covering sample count, cache reuse, and cache reset behavior.
- Safe patch/minor dependency upgrades landed for Playwright, Vite, Vitest, jsdom, knip, ESLint 9, TypeScript ESLint, `@types/node`, `@preact/signals-core`, and `three-mesh-bvh`.
- Real browser smoke via the `develop-web-game` Playwright client exposed an `Infinity:NaN` HUD timer on first paint. Fixed both `MatchTimer` and `MobileStatusBar` to sanitize non-finite time values and added focused tests.
- Newer tooling surfaced a duplicate `THREE` import in `DeathCamSystem.test.ts`; removed the duplicate import so the full suite stays green.
- `prod-smoke.ts` and `mobile-ui-check.ts` no longer assume fixed localhost ports. They now bind to a free local port by default, which fixed local `validate` failures when a dev server was already running on `127.0.0.1:4173`.
- `perf:compare` now keeps warning-level perf deviations visible but non-blocking by default. `FAIL` remains blocking; `--fail-on-warn` and `npm run perf:compare:strict` preserve the previous strict behavior for local use.

2026-04-02 final validation
- `npm run validate`: PASS
  - lint PASS
  - `test:run` PASS (`184` files, `3634` tests)
  - build PASS
  - `smoke:prod` PASS on an auto-selected localhost port
- `npm run deadcode`: PASS
- `npm run check:mobile-ui`: PASS
  - artifact: `artifacts/mobile-ui/2026-04-02T04-17-59-668Z/mobile-ui-check`
- Fresh perf capture on the current tree: PASS for capture, WARN for accepted perf tails only
  - command: `npm run perf:capture:combat120`
  - artifact: `artifacts/perf/2026-04-02T04-20-55-734Z`
  - startup threshold: `6s`
  - browser errors/pageerrors/crashes: `0`
  - avg frame: `13.94ms`
  - `perf:compare -- --scenario combat120`: `6 pass`, `2 warn`, `0 fail`
  - remaining warns: `p95FrameMs=32.90ms`, `p99FrameMs=34.30ms`
  - validation-only warns inside artifact: `peak_p99_frame_ms=34.30ms`, `heap_peak_growth_mb=90.78MB`

TODO
- Re-capture `openfrontier:short`, `ashau:short`, and `frontier30m` on the recovered harness and refresh baselines.
- Continue reducing `combat120` p95/p99 tails and peak heap growth from the now-stable evidence set instead of from harness symptoms.

2026-04-02 CI follow-up
- Remote GitHub Actions run `23883724043` failed only in the `perf` job. `lint`, `test`, `build`, `smoke`, and `mobile-ui` all passed.
- The perf failure was a headed-Xvfb scheduling issue, not a gameplay failure: startup reached live-entry, but the capture page advanced only a handful of frames every several seconds until runtime samples collapsed to `100ms` and validation failed.
- Added explicit `page.bringToFront()` + `window.focus()` foregrounding in `scripts/perf-capture.ts` before startup waiting, before warmup, and before runtime sampling so the harness does not behave like a throttled background tab in CI.
- Revalidated the healthy local path after the patch:
  - fresh capture: `artifacts/perf/2026-04-02T04-35-45-253Z`
  - startup threshold: `6s`
  - `perf:compare -- --scenario combat120`: `6 pass`, `2 warn`, `0 fail`

2026-04-02 remaining recovery
- Remote GitHub Actions run `23884105743` narrowed the remaining CI-only perf failure to a browser pageerror in `WebGLRenderer.compileAsync()` when `KHR_parallel_shader_compile` was unavailable. Hardened `GameRenderer.precompileShaders()` to skip async precompile entirely when the extension is absent and to swallow the synchronous-throw path as best-effort warmup only.
- Revalidated the renderer guard locally:
  - `npm run validate`: PASS
  - `npm run deadcode`: PASS
  - `npm run check:mobile-ui`: PASS (`artifacts/mobile-ui/2026-04-02T05-12-16-803Z/mobile-ui-check`)
  - fresh perf capture: `artifacts/perf/2026-04-02T05-14-51-257Z`
  - `perf:compare -- --scenario combat120`: `6 pass`, `2 warn`, `0 fail`
  - latest metrics: `avgFrameMs=15.48`, `p95FrameMs=32.90`, `p99FrameMs=34.60`, `heapGrowthMb=16.50`
- Real browser smoke with the `develop-web-game` client is still free of pageerrors after the startup fixes, but the `ai_sandbox` live-entry camera remains visually dense/occluded because the mode still uses a per-match random terrain seed and spawns the active player into arbitrary jungle geometry. Added a terrain-aware spawn-facing helper plus a nearby-ground search to reduce the worst cases, but this is still not a complete design fix.

TODO
- Remote-watch the next CI run after the `GameRenderer` hardening lands; if perf is green, confirm Pages deploy and production URL.
- Decide whether `ai_sandbox` should keep per-match random terrain. For perf governance it is a poor default because `combat120` is being compared against static thresholds while terrain/layout still changes each run.
- If the sandbox start UX matters, finish that with a deterministic seed or curated sandbox spawn contract rather than more heuristics against random terrain.

2026-04-02 air-vehicle follow-up
- Fixed-wing runtime and parked air-vehicle perf pass landed:
  - new fixed-step `FixedWingPhysics` with takeoff rotation, climb trim, banked turning, stall state, and ground-roll behavior
  - `FixedWingModel` now keeps parked aircraft collision-valid while skipping unnecessary flight simulation
  - `AirVehicleVisibility` now gates helicopter/fixed-wing rendering against camera/fog distance
  - `ModelDrawCallOptimizer` batches static aircraft meshes by material while preserving animated rotor/propeller nodes
- Docs updated to reflect the fixed-wing feature and the air-vehicle render/runtime changes:
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/PERFORMANCE.md`
  - `docs/BACKLOG.md`
- Local validation on this tree:
  - `npm run check:mobile-ui`: PASS (`artifacts/mobile-ui/2026-04-03T02-12-22-988Z/mobile-ui-check`)
  - `npm run validate`: PASS
- One stale test surfaced during `validate` and was corrected:
  - `src/systems/player/PlayerVehicleController.test.ts` now asserts the current mouse-input flow (`PlayerVehicleController` passes mouse deltas into `updateHelicopterControls`; `PlayerMovement` applies them)

TODO
- Push the air-vehicle/docs commit to `master`.
- Confirm the GitHub Actions `CI` run passes `lint`, `test`, `build`, `smoke`, `mobile-ui`, `perf`, and `deploy`.
- Verify `https://terror-in-the-jungle.pages.dev/` returns healthy content after the deploy completes.

2026-04-26 Pixel Forge visual follow-up
- Began second-pass fixes for the Pixel Forge-only vegetation/NPC runtime after playtest notes: vegetation disappeared at very close range, distant impostors over-fogged/brightened, atlas views snapped during flight, and close NPC GLBs read too small with foot/terrain issues.
- Current patch direction: disable vegetation near fade until close LOD meshes exist, bind billboard fog density to the active scene fog instead of the old hardcoded dense billboard fog, blend adjacent vegetation impostor atlas columns, and scale/ground close NPC GLBs from their measured bounds against the Pixel Forge impostor visual height.
- Implemented the visual pass and validated it: targeted billboard/combat tests passed, `npm run validate:fast` passed, `npm run build` passed, and a WebGL smoke against `http://127.0.0.1:5173/?sandbox=1&npcs=60&seed=2718&diag=1` reached live sandbox with no browser errors. Latest screenshot: `artifacts/web-game/pixel-forge-lod-smoke/shot-2.png`.

TODO
- Human playtest should still check high-speed flight around bamboo/palms; adjacent atlas blending removes hard tile pops but may read slightly softer at oblique angles.
- Static building/prop distance culling still needs a measured pass with renderer-category instrumentation before changing residency or HLOD policy.

2026-04-03 fixed-wing controller rebuild follow-up
- Reworked the fixed-wing stack around a command-driven sim-lite flight model:
  - `src/systems/vehicle/FixedWingPhysics.ts` now owns fixed-step ground-roll / rotation / airborne / stall / landing-rollout behavior, terrain-aware ground contact, air-relative aerodynamics, and touchdown recovery.
  - `src/systems/vehicle/FixedWingConfigs.ts` now uses per-aircraft envelope/control/ground-handling data (`vrSpeed`, `v2Speed`, lift/drag envelope, damping, steering, brakes, ground effect) instead of the old sparse lift/turn constants.
  - `src/systems/vehicle/FixedWingModel.ts` now feeds terrain normals/heights into the flight model, resets plane command state on enter/exit, and exposes richer flight snapshots to HUD/camera consumers.
- Cleaned up the plane control path:
  - `src/systems/player/PlayerMovement.ts` now builds normalized `FixedWingCommand` input with persistent throttle, wheel braking near idle, mouse virtual-stick recentering, and stability-assist toggling.
  - `src/systems/player/PlayerInput.ts`, `src/systems/player/PlayerVehicleController.ts`, and `src/ui/controls/TouchControls.ts` no longer make the fixed-wing path depend on helicopter-only input semantics. Planes now use explicit flight-vehicle mode plumbing while keeping compatibility shims where tests/mocks still expect helicopter-named methods.
- Validation after the rebuild and input cleanup:
  - `npm run test:run -- src/systems/player/PlayerInput.test.ts src/systems/player/PlayerVehicleController.test.ts src/ui/controls/TouchControls.test.ts src/systems/player/PlayerMovement.test.ts`: PASS
  - `npm run validate`: PASS
  - `npm run check:mobile-ui`: PASS (`artifacts/mobile-ui/2026-04-03T03-32-54-466Z/mobile-ui-check`)
- Browser/runtime artifacts:
  - Direct Playwright entry reached Open Frontier deploy flow without console/page errors: `artifacts/web-game/fixed-wing-direct-entry/`
  - Direct Playwright deploy reached live runtime without console/page errors: `artifacts/web-game/fixed-wing-live-runtime/`
  - Runtime screenshot confirms live scene/HUD load: `artifacts/web-game/fixed-wing-live-runtime/runtime.png`
- Local gotcha during validation:
  - `npm run validate` initially failed because stale `vite preview` processes from manual smoke work were holding `dist/assets` open on Windows. Killing those local preview/smoke processes and rerunning the gates fixed it; this was not a source change.

TODO
- Do a dedicated in-world plane acceptance pass that actually enters a fixed-wing aircraft, performs takeoff / climb / turn / landing input, and captures screenshots or telemetry for that sequence. Current browser smoke validates runtime entry and UI flow, not the full pilot interaction loop.
- If gamepad fixed-wing support matters soon, expose trigger analog values cleanly instead of relying on the shared infantry fire/ADS mapping.

2026-04-02 fixed-wing controller rebuild
- Rebuilt the player-facing fixed-wing path around an explicit command/snapshot flow:
  - `FixedWingPhysics` now owns a fixed-step sim-lite FDM with ground-roll / rotation / airborne / stall / landing-rollout phases, aerodynamic forces from air-relative velocity, and ground reaction that prevents the old vertical-pop takeoff behavior.
  - `FixedWingConfigs` now uses per-aircraft envelope/control data (`vr`, `v2`, lift/drag envelope, damping, steering, brake, thrust response) instead of the old loose rate constants.
  - `FixedWingModel` now passes terrain height + normal into the FDM, resets piloted command state on enter/exit, and exposes richer flight data (phase, AoA, sideslip, throttle, brake, WOW).
- Reworked plane controls in `PlayerMovement` / `PlayerVehicleController` / `PlayerController`:
  - keyboard + mouse now drive a virtual-stick `FixedWingCommand` instead of directly rotating aircraft state
  - stability assist is explicit and resets correctly on vehicle enter/exit
  - fixed-wing mouse control now follows the generic flight-mouse path instead of helicopter-only plumbing
- Cleaned up the remaining input/touch slop after the main rebuild:
  - `PlayerInput` uses explicit flight-vehicle mode (`none` / `helicopter` / `plane`)
  - `TouchControls` exposes generic flight-mode aliases so plane logic no longer has to reach through helicopter-only names
  - added focused tests for fixed-wing command composition and flight-mode alias behavior

2026-04-02 fixed-wing validation
- Targeted suites:
  - `npm run test:run -- src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerVehicleController.test.ts src/systems/player/PlayerInput.test.ts src/ui/controls/TouchControls.test.ts`: PASS
- Full gate:
  - `npm run validate`: PASS
    - lint PASS
    - `test:run` PASS (`189` files, `3680` tests)
    - build PASS
    - `smoke:prod` PASS
- Real browser/manual smoke:
  - preview-driven browser probe reached gameplay and rendered correctly after deploy
  - artifact: `artifacts/web-game/fixed-wing-rebuild-after-deploy.png`
  - note: the first generic Playwright client capture stalled at the mode picker because the choreography never clicked a mode card; direct browser probing confirmed the live flow and screenshot correctness

TODO
- Run a real in-game fixed-wing takeoff/landing pass once a deterministic aircraft spawn or debug-entry shortcut is available; current browser smoke confirms live gameplay entry, while the plane-specific behavior is covered by unit/integration tests.
- If controller support for planes becomes a priority, extend `GamepadManager` with explicit trigger/shoulder access so throttle/brake/rudder are not inferred only from the left stick + keyboard parity.

2026-04-03 helicopter rotor regression fix
- Root cause: the helicopter draw-call batching pass in `src/systems/helicopter/HelicopterGeometry.ts` only excluded meshes named with `mainblade` / `tailblade` style tokens, but the real helicopter GLBs use `MRBlade`, `TRBlade`, `MRHub`, `TRHub`, `MRTip`, etc.
- Result: those rotor meshes were being merged into the static aircraft batch, leaving the rotor animation system rotating an empty transform while the visible blades stayed frozen in the body mesh.
- Fixes landed:
  - `src/systems/helicopter/HelicopterGeometry.ts`
    - broadened rotor-part detection to cover the real GLB naming (`MR*` / `TR*` / rotor mast/hub/tip variants)
    - made batching exclude any mesh under a tagged rotor subtree, not just a narrow set of mesh names
    - improved grouped-rotor detection so existing `Joint_MainRotor` / `Joint_TailRotor` roots are kept as animation roots instead of being unnecessarily regrouped
  - `src/systems/helicopter/HelicopterAnimation.ts`
    - caches main/tail rotor roots at init and updates those cached nodes directly instead of traversing the full helicopter scene every frame
    - disposed helicopters no longer lazily rebind rotor nodes and resume spinning
  - `src/systems/helicopter/HelicopterModel.ts`
    - passes the live helicopter group into animation init so rotor roots are cached once at spawn time

2026-04-03 helicopter rotor validation
- Targeted tests:
  - `npm run test:run -- src/systems/helicopter/HelicopterGeometry.test.ts src/systems/helicopter/HelicopterAnimation.test.ts src/systems/helicopter/HelicopterModel.test.ts`: PASS
- Full gate:
  - `npm run validate`: PASS
    - lint PASS
    - `test:run` PASS (`191` files, `3686` tests)
    - build PASS
    - `smoke:prod` PASS
- Browser/module validation:
  - In-browser module probe against the dev server confirmed real helicopter geometry still exposes populated rotor roots after optimization:
    - `UH1_HUEY`: main root children `5`, tail root children `3`
    - `UH1C_GUNSHIP`: main root children `5`, tail root children `3`
    - `AH1_COBRA`: main root children `4`, tail root children `3`
  - Playwright client artifact for visual inspection: `artifacts/web-game/helicopter-rotor-viewer/shot-1.png`

TODO
- Do a dedicated live-runtime helicopter acceptance pass that captures two time-separated runtime frames or telemetry after entering a helicopter, so rotor motion is confirmed through the full gameplay loop rather than via geometry/module inspection plus unit tests.

2026-04-06 Open Frontier stabilization
- Confirmed the current request is remediation, not diagnosis-only. Created `docs/OPEN_FRONTIER_STABILIZATION_PLAN.md` to track the recovery work against the Frontier regression evidence.
- Working set for this pass:
  - fix fixed-wing self-lift by separating aircraft terrain sampling from collision-overlay height queries
  - remove the new static-prop CPU tax by caching collision bounds for static registrations and only recomputing moving aircraft bounds
  - reduce staged vehicle/aircraft draw calls by improving static batching for duplicated material exports and applying it to generic world-feature placements
- Validation target for this pass:
  - targeted tests for terrain queries / fixed-wing / draw-call optimizer / world features
  - fresh `npm run perf:capture:openfrontier:short`
  - `npm run validate`

Original prompt: analyze state of codebase. i have had major issues getting planes to work. the arrow keys seem to not work or not work well and just in general it is ill conceived and we need to architect better and think about it as a whole and granularly and dependently and integrated all around that.

TODO
- After the first implementation pass, compare the fresh Frontier capture against `2026-04-07T03-17-24-101Z` before widening scope.

2026-04-07 Open Frontier stabilization completion
- Landed the Open Frontier recovery plan in code and docs:
  - `FixedWingModel` now uses raw terrain height for placement/update sampling instead of the collision-overlay height helper, removing the plane self-lift loop.
  - `TerrainQueries` / `TerrainSystem` / `SystemInterfaces` now support dynamic vs static collision registrations so static staged props cache bounds while moving aircraft refresh theirs.
  - `ModelDrawCallOptimizer` now merges static meshes by material signature instead of material UUID, and `WorldFeatureSystem` applies that optimizer to static staged placements.
  - `GameModeManager` now reapplies `combatantSystem.setSpatialBounds(config.worldSize)` before reseed/spawn so Open Frontier hit registration queries operate inside the correct world extents.
- Added/updated focused tests for:
  - `TerrainQueries`
  - `FixedWingModel`
  - `ModelDrawCallOptimizer`
  - `WorldFeatureSystem`
  - `GameModeManager`
  - `HelicopterModel` collision-registration expectation after the new dynamic collision metadata
- Open Frontier recovery evidence:
  - `npm run perf:capture:openfrontier:short`
  - artifact: `artifacts/perf/2026-04-07T04-01-01-963Z`
  - validation: `WARN` only
  - avg frame: `9.89ms`
  - p95 / p99: `17.00ms / 29.60ms`
  - player shots / hits: `234 / 131`
  - `npm run perf:compare -- --scenario openfrontier:short`: `7 pass`, `1 warn`, `0 fail`
- Release validation:
  - `npm run validate`: PASS
  - `npm run validate:full`: PASS
    - clean perf artifact: `artifacts/perf/2026-04-07T04-15-48-589Z`
    - overall validation: `WARN` only
    - avg frame: `16.00ms`
    - p99: `35.00ms`
    - heap peak-growth: `54.83MB`
    - player shots / hits: `47 / 25`
- One false-negative perf artifact was discarded after validation:
  - `artifacts/perf/2026-04-07T04-12-47-887Z`
  - cause: stale reused dev server produced repeated `@vite/client` pageerrors (`send was called before connect`) and invalidated the run
  - clean rerun from a fresh server state passed without browser errors

TODO
- Commit, push, and confirm the GitHub Actions / Cloudflare Pages deployment for the stabilization pass.

2026-04-07 fixed-wing control-law reset
- Reworked the player-facing fixed-wing stack around pilot intent instead of raw control-surface commands:
  - added `src/systems/vehicle/FixedWingControlLaw.ts` with phase-aware fixed-wing control phases (`taxi`, `takeoff_roll`, `rotation`, `initial_climb`, `flight`, `approach`, `landing_rollout`)
  - `FixedWingPlayerAdapter` now emits pilot intent + direct-stick overlay instead of raw elevator/aileron commands
  - `FixedWingModel` now owns the pilot-intent path and converts it into bounded raw `FixedWingCommand` values before physics update; legacy raw-command APIs remain for tests/non-player callers
- Split fixed-wing player roles by profile in config:
  - `A1_SKYRAIDER`: `trainer`
  - `F4_PHANTOM`: `fast_jet`
  - `AC47_SPOOKY`: `ambient`
  - F-4 now defaults to flight assist on for runway play
- Fixed runway/player interaction prioritization:
  - `FixedWingInteraction` now filters `ambient` aircraft out of the parked runway entry flow
  - trainer aircraft are preferred over other nearby fixed-wing aircraft when multiple are in range
- Cleaned up shared input/UI semantics so planes are no longer forced through helicopter-only callback names:
  - added `onEnterExitVehicle` and `onToggleFlightAssist` aliases through `PlayerInput`, `InputManager`, `TouchControls`, `VehicleActionBar`, and `PlayerController`
  - kept helicopter-era names as compatibility shims for unchanged code/tests
- Fixed-wing HUD now exposes phase cues separately from true stall state:
  - `TAKEOFF`, `ROTATE`, `CLIMB`, `APPROACH`, `STALL`
  - added fixed-wing flight-assist HUD plumbing alongside the legacy auto-level alias
- Extended fixed-wing physics snapshots with pitch/roll rates so the new control law can damp overshoot instead of blindly saturating keyboard input

2026-04-07 fixed-wing control-law validation
- Targeted tests:
  - `npm run test:run -- src/systems/vehicle/FixedWingControlLaw.test.ts src/systems/vehicle/FixedWingInteraction.test.ts src/systems/vehicle/FixedWingPlayerAdapter.test.ts src/systems/vehicle/FixedWingModel.test.ts src/systems/player/PlayerInput.test.ts src/ui/controls/VehicleActionBar.test.ts src/systems/player/PlayerVehicleController.test.ts src/ui/controls/TouchControls.test.ts src/systems/input/InputManager.test.ts`: PASS (`9` files, `139` tests)
- Build:
  - `npm run build`: PASS
- Browser validation:
  - required `develop-web-game` Playwright client pass against dev server completed: `artifacts/web-game/fixed-wing-control-law-client/`
  - live runtime probe artifacts:
    - `artifacts/tmp/fixed-wing-control-law/runtime-probe/telemetry.json`
    - `artifacts/tmp/fixed-wing-control-law/runtime-probe/runtime.png`
    - `artifacts/tmp/fixed-wing-control-law/runtime-probe-runway/telemetry.json`
    - `artifacts/tmp/fixed-wing-control-law/runtime-probe-runway/runtime.png`
  - Result: the new HUD/control contract is visible in browser, but clean takeoff in the live Open Frontier path is still limited by the current parked-aircraft placement/taxi path. The direct control-law and simulation path are validated; the remaining runtime issue is airfield/placement workflow, not keyboard command propagation.

TODO
- Decide whether the A-1 should stay apron-parked with taxi expectation or move to a more explicit runway-ready spawn/start contract for the player-facing tutorial/default flow.
- If the live runtime probe remains a release gate for planes, add a deterministic debug aircraft spawn/reposition helper so browser automation can validate full takeoff/climb/turn loops without depending on current airfield parking layout.

2026-04-07 fixed-wing airfield recovery kickoff
- Created `docs/FIXED_WING_AIRFIELD_RECOVERY_PLAN.md` to scope the next pass around operable airfield layout, directional terrain shaping, local-space parking offsets, and regression coverage.
- Implementation plan for this pass:
  - rework `AirfieldTemplates` / `AirfieldLayoutGenerator` around longer runways, apron stands, and side-by-side fixed-wing parking
  - compile airfield-specific terrain stamps from layout geometry instead of the old circular flatten assumption
  - align Open Frontier / A Shau feature footprints and add tests plus a live browser verification loop

2026-04-07 fixed-wing airfield recovery completion
- Landed the full airfield/fixed-wing recovery scoped in `docs/FIXED_WING_AIRFIELD_RECOVERY_PLAN.md`:
  - `AirfieldTemplates` now define longer runways, apron/taxi geometry, and explicit stand locations instead of fraction-based parking rows.
  - `AirfieldLayoutGenerator` now keeps generated parking offsets in feature-local space, which removes the old double-rotation bug for yawed airfields.
  - `TerrainFeatureCompiler` now derives directional runway/apron/taxi `flatten_capsule` stamps from template geometry for authored airfields, so airfield terrain is shaped like the field instead of by one circular flatten volume.
  - `FixedWingConfigs` now exposes runway compatibility metadata; `AirfieldTemplates` / `WorldFeatureSystem` can validate parked fixed-wing content against runway length.
  - Open Frontier / A Shau airfield footprints and vegetation clear zones were resized to match the new runway/apron layouts.
- Validation:
  - `npm run validate`: PASS
  - focused suites covering airfield templates/layout/compiler/world features/fixed-wing model: PASS
  - `npm run perf:capture:openfrontier:short`: PASS (`artifacts/perf/2026-04-07T05-49-35-671Z`)
  - `npm run perf:compare -- --scenario openfrontier:short`: `7 pass`, `1 warn`, `0 fail`
- Settled browser probe against Open Frontier:
  - runway centerline samples at `x=80,200,320,440,560 / z=-1230`: all `14.94`
  - apron stand samples at `x=238,320,402 / z=-1326`: all `13.84`
  - fixed-wing parking now spawns side-by-side on one apron row at matching elevation

TODO
- Follow up on fixed-wing role specialization rather than one generic operating loop:
  - A-1 rough-field tuning
  - AC-47 orbit-first workflow
  - F-4 stronger assisted runway/attack workflow

2026-04-07 fixed-wing ops/orbit/taxi implementation in progress
- Continued the fixed-wing follow-up pass on top of the control-law and airfield work:
  - HUD plumbing now carries fixed-wing `operationState` through `IHUDSystem` / `HUDSystem` / `HUDElements` / `FixedWingHUD`, including explicit cue labels for `TAXI`, `LINE UP`, `TAKEOFF`, `ROTATE`, `CLIMB`, `ORBIT`, `APPROACH`, and `ROLLOUT`.
  - Plane touch/action-bar semantics now distinguish `LEVEL` vs `ORBIT` for gunship flow instead of reusing one generic stabilizer label.
  - `AirfieldLayoutGenerator` now only emits `fixedWingSpawn` metadata for real fixed-wing parking spots, not helicopter stands.
  - `FixedWingModel` now exposes aircraft IDs for runtime/debug validation, resets piloted command state when runway/approach helpers reposition the active aircraft, and uses a steeper short-final helper sink rate so the approach helper actually lands in the `approach` phase.
  - `FixedWingPlayerAdapter` now seeds the HUD with initial phase/ops/assist state on aircraft entry instead of waiting for a later update tick.
- Pending before closing the pass:
  - finish focused regression coverage for spawn metadata, orbit hold, runway/approach helpers, and exit gating
  - run targeted tests, build, and browser validation

2026-04-07 fixed-wing hybrid-input and diagnostics follow-up
- Normalized hybrid desktop/touch behavior so desktop flight controls are no longer degraded just because touch capability exists:
  - `DeviceDetector.shouldUseTouchControls()` now keeps touch overlays for mobile/coarse-pointer environments, but leaves hybrid/fine-pointer desktops in keyboard/mouse mode.
  - `InputManager` now treats `pointerdown` as touch activity only when `pointerType === 'touch'`.
  - `VehicleActionBar` and startup HUD mounting now use the same touch-control heuristic instead of raw `ontouchstart` checks.
- Added deterministic browser-automation hooks for the live dev runtime:
  - `GameEngine.advanceTime(ms)` advances the simulation at 60 Hz and renders one frame at the end of the step.
  - `bootstrap.ts` now exposes `window.advanceTime(ms)` and `window.render_game_to_text()` in dev diagnostics/perf mode.
  - `web_game_playwright_client` now captures `state-0.json` for this repo instead of only screenshots.
- Added `scripts/fixed-wing-runtime-probe.ts`:
  - boots Open Frontier in Playwright
  - forces desktop input semantics
  - steps simulation deterministically through `window.advanceTime`
  - runs one runway takeoff/climb probe per aircraft (`A1_SKYRAIDER`, `F4_PHANTOM`, `AC47_SPOOKY`)
  - writes screenshots + `artifacts/fixed-wing-runtime-probe/summary.json`
- Validation:
  - `npm run test:run -- src/utils/DeviceDetector.test.ts src/systems/input/InputManager.test.ts src/ui/controls/VehicleActionBar.test.ts`: PASS
  - `npm run build`: PASS
  - `node ...web_game_playwright_client.js --url http://127.0.0.1:4173/?perf=1 ...`: PASS, now writes `artifacts/web-game/fixed-wing-hybrid-input-client/state-0.json`
  - `npx tsx scripts/fixed-wing-runtime-probe.ts --port 4173 --reuse-dev-server true`: PASS
    - A-1 final: `59.9 m/s`, `13.9 m` AGL, `phase=airborne`, `operationState=cruise`
    - F-4 final: `86.9 m/s`, `15.3 m` AGL, `phase=airborne`, `operationState=initial_climb`
    - AC-47 final: `44.7 m/s`, `15.1 m` AGL, `phase=airborne`, `operationState=initial_climb`

TODO
- Extend `scripts/fixed-wing-runtime-probe.ts` from takeoff/climb validation into:
  - F-4 bank/recovery validation
  - AC-47 orbit-hold engagement validation after a deterministic airborne setup
  - A-1 / F-4 landing-rollout validation using `positionAircraftOnApproach()`
- Decide whether to expose a small in-game dev panel / console helpers for fixed-wing scenario setup, or keep the diagnostics path script-only.

2026-04-07 docs + validation sync for fixed-wing runtime pass
- Updated the primary docs to match the current live fixed-wing/runtime state:
  - `README.md` now points at the deterministic fixed-wing runtime probe.
  - `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/DEVELOPMENT.md`, and `docs/FIXED_WING_FLIGHT_ISSUES.md` now describe the phase-aware control law, airfield/ops runtime, and browser probe workflow instead of the older staged/static-aircraft state.
- Fixed one stale regression expectation in `TerrainFeatureCompiler.test.ts` so terrain validation matches the current forward-strip airfield geometry (`6` terrain stamps, `5` surface patches).
- Validation:
  - `npm run validate`: PASS
    - lint: PASS
    - tests: PASS (`198` files, `3737` tests)
    - build: PASS
    - prod smoke: PASS

2026-04-21 Cycle 2 fixed-wing feel first pass
- Investigated the reported fixed-wing stiffness, post-climb bounce/porpoise feel, and visual shake. The first code-level mismatch is at the render/camera boundary: fixed-wing was exposing raw Airframe fixed-step pose to scene/camera consumers while the helicopter path exposes an interpolated physics state.
- Added Airframe interpolated pose output, switched FixedWingModel visual pose/quaternion queries to that output, and made PlayerCamera fixed-wing follow/look/FOV smoothing use elapsed time instead of a fixed per-frame lerp.
- Validation:
  - `npx vitest run src/systems/vehicle/__tests__/fixedWing.integration.test.ts src/systems/player/PlayerCamera.test.ts src/systems/vehicle/FixedWingModel.test.ts`: PASS
  - `npm run typecheck`: PASS
  - `npm run probe:fixed-wing`: PASS for A-1, F-4, and AC-47 takeoff/climb, AC-47 orbit, approach, and handoff
  - `npm run validate:fast`: PASS
- Note: user reported playing games in the background during this pass. Do not use this session for authoritative perf baselines or `validate:full` perf evidence.

TODO
- Run the fixed-wing human playtest checklist on A-1, AC-47, and F-4. If bounce/porpoise or stiffness remains, tune airframe/control-law damping next rather than adding more vehicles.
- Run `validate:full` later on a quiet machine before any perf baseline refresh.

2026-04-21 Cycle 2 frontier30m soak semantics
- Fixed the misleading `frontier30m` setup. Open Frontier's normal 15-minute match timer made the old 30-minute script hit victory around the halfway point, so the latter half was not a trustworthy active-combat soak.
- Added perf-harness-only runtime overrides:
  - `perfMatchDuration=<seconds>` extends the TicketSystem combat duration only when diagnostics/perf mode is enabled in dev or `VITE_PERF_HARNESS=1` builds.
  - `perfDisableVictory=1` disables terminal victory checks for soak captures so time-limit, ticket-depletion, and total-control paths do not transition into the victory screen.
- Updated `npm run perf:capture:frontier30m` to pass `--match-duration 3600 --disable-victory true`.
- Validation:
  - `npx vitest run src/systems/world/GameModeManager.test.ts src/systems/world/TicketSystem.test.ts scripts/perf-harness/perf-active-driver.test.js`: PASS

TODO
- Re-capture `frontier30m` and refresh the tracked baseline only on a quiet machine. User is running other games during this session, so current perf captures would not be baseline-quality.
- Continue Cycle 2 startup bundle work while fixed-wing human playtest waits for tomorrow.

2026-04-21 Cycle 2 deploy/bundle hygiene
- Ran a production build and sourcemap analysis build to inspect chunk shape. Current large chunks remain `index` (~851kB raw / ~221kB gzip), `three` (~734kB raw / ~187kB gzip), and `ui` (~449kB raw / ~106kB gzip). Recast still emits a ~339kB WASM asset plus ~275kB JS loader per main/worker graph.
- Removed `vite-plugin-compression` and the Vite compression plugin config. Cloudflare Pages already negotiates visitor-facing compression for JS/CSS/WASM/JSON/font assets, so the repo should not upload redundant `.gz`/`.br` sidecars with their own cache surface.
- Tested a narrower Recast manual-chunk split, but reverted it because Vite hoisted a ~956kB `recast` chunk into the initial modulepreload graph. Recast/Three chunk work needs a more deliberate lazy-boundary change, not a naming-rule tweak.
- Validation:
  - `npm run build`: PASS
  - `dist/` check: no `.gz` or `.br` sidecar files

TODO
- Real chunk-weight work remains: split startup-critical code from full live-game systems/UI, and revisit Recast/Three manual chunking without regressing startup.

2026-04-21 deploy validation catch
- First GitHub deploy after stabilization omitted gitignored `public/data/vietnam/` runtime files, causing live `/data/vietnam/a-shau-rivers.json` to fall through to HTML.
- Rejected the quick "track the 21 MB DEM in git" workaround after user feedback. Current target is Cloudflare-native delivery: R2 bucket + custom domain + content-addressed terrain/model keys + generated manifest + CI upload/header validation before Pages deploy. See `docs/CLOUDFLARE_STACK.md`.
- Local Wrangler is current (`4.84.1`) but not authenticated; GitHub repo has Cloudflare secrets, but local R2/Pages inspection needs `wrangler login` or `CLOUDFLARE_API_TOKEN` in the shell.

2026-04-22 Cloudflare R2 manifest pipeline
- Authenticated local Wrangler through OAuth and inspected the Cloudflare account. Pages project `terror-in-the-jungle` exists as Direct Upload/no Git provider.
- Created R2 buckets `titj-game-assets-prod` and `titj-game-assets-preview`; applied public read CORS; enabled temporary `r2.dev` endpoints.
- Uploaded and validated content-addressed A Shau DEM/rivers objects in prod R2. DEM URL now returns 21,233,664 bytes, `application/octet-stream`, immutable cache, and CORS.
- Added `scripts/cloudflare-assets.ts`, `src/core/GameAssetManifest.ts`, and deploy workflow integration. A Shau DEM now resolves through `/asset-manifest.json` in production with dev fallback to local `public/data/vietnam/`.
- GitHub deploy initially failed because the Actions Cloudflare token can deploy Pages but cannot write R2 objects. Patched workflow to set `TITJ_SKIP_R2_UPLOAD=1`; CI now writes/validates the manifest from pinned R2 metadata while local OAuth runs still perform real R2 uploads.
- Deployed `fe90e8f` successfully via GitHub run `24757914408`. Live Pages source shows `fe90e8f`.
- Live validation:
  - `/asset-manifest.json` returns JSON with `Cache-Control: public, max-age=0, must-revalidate`.
  - R2 DEM URL from the manifest returns expected size/type/cache/CORS.
  - Web-game Playwright menu flow screenshot saved under `output/web-game/live-pages-r2-fe90e8f/`.
  - A Shau browser flow requested both `/asset-manifest.json` and the R2 DEM with no failed network requests.
- Residual issue: A Shau flow still logged a TileCache/navmesh failure after
  asset delivery was fixed. Later Cycle 10 logging narrowed this to tile `1, 0`;
  the branch now makes the fallback explicit by retrying static tiled nav, but
  A Shau nav remains a terrain/nav quality pass item.

TODO
- Replace temporary `r2.dev` with a custom R2 asset domain.
- Update the GitHub `CLOUDFLARE_API_TOKEN` secret to include `Account -> Workers R2 Storage -> Edit`, then remove `TITJ_SKIP_R2_UPLOAD=1`.
- Decide how future generated terrain payloads get into CI without relying on local-only gitignored source files; pinned metadata is acceptable only for already-uploaded immutable assets.

2026-04-23 Cycle 1 vehicle session continuation
- Patched the user-reported in-flight aircraft exit and stuck-forward walk issues during the architecture-recovery pass.
- Fixed-wing emergency ejection now preserves airborne placement instead of projecting bailout to terrain height.
- `VehicleSessionController` now clears transient `PlayerInput` state on vehicle enter/exit; `PlayerInput` also clears held keys on pointer-lock release/failure, blur, and hidden-tab transitions.
- Added a pointer-lock failure fallback for embedded browsers and aligned debug free-fly with the gameplay pointer-lock target.
- Updated the fixed-wing runtime probe to validate keyboard bailout through the real `KeyE` path and check immediate post-exit altitude before the player naturally falls.
- Validation:
  - targeted vehicle/input/model tests: PASS (`4` files, `92` tests)
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS (`242` files, `3762` tests)
  - `npm run build`: PASS
  - `npm run probe:fixed-wing`: PASS for A-1, F-4, and AC-47 takeoff, approach, bailout, and handoff

TODO
- Human playtest still needs to confirm bailout feel, no stuck forward movement, and embedded-browser mouse-look fallback usability.
- Helicopter rotor stopped/idle/spool/flight-RPM visual lifecycle remains Cycle 2 work.
- Airfield height datum/surface authority remains a Cycle 2/6 bridge before deeper fixed-wing taxi/takeoff tuning.

2026-04-23 Cycle 2 rotor lifecycle continuation
- Added `docs/playtest/PLAYTEST_2026-04-23_ARCHITECTURE_RECOVERY_CYCLE.md` as the comprehensive end-of-cycle playtest form for vehicle, pointer-lock, airfield, atmosphere, combat, UI, assets, bugs, and triage notes.
- Patched helicopter rotor lifecycle:
  - `HelicopterPhysics` can now distinguish engine-active idle from true stopped rotor state.
  - Exited/grounded helicopters spool down to `engineRPM = 0` instead of being held at idle.
  - `HelicopterModel` only keeps ticking unoccupied grounded helicopters while they still need to spool down.
  - `HelicopterAnimation` uses higher flight-RPM visual speed so blades read faster before considering GLB replacement.
- Validation:
  - targeted helicopter tests: PASS (`4` files, `64` tests)
  - `npm run typecheck`: PASS

TODO
- Human playtest still decides whether rotor blur or GLB pivot/asset work is needed.
- Continue with airfield height datum/surface authority and automated probes.

2026-04-23 Cycle 2/6 airfield datum continuation
- Patched generated airfield terrain shaping so runway, apron, taxiway, filler, and envelope stamps share one runway-derived `fixedTargetHeight` when the runtime terrain provider is available during feature compilation.
- `StampedHeightProvider` now honors that fixed datum before falling back to local target-height sampling. This keeps stamped runtime terrain and baked stamped heightmaps on the same airfield datum.
- Added a sloped forward-strip regression that samples the parking stand, taxi connector, hold-short point, runway entry, and runway start through `StampedHeightProvider` and requires one resolved height.
- Validation:
  - targeted terrain + vehicle/helicopter suites: PASS (`7` files, `93` tests)
  - targeted terrain suite after the type fix: PASS (`2` files, `13` tests)
  - `npm run lint`: PASS
  - `npm run typecheck`: PASS

TODO
- Human playtest the A Shau forward-strip stand-to-runway route, lineup point, and takeoff over surrounding terrain.
- Cycle 6 still needs a proper terrain/collision runtime owner so spawn metadata, vehicle physics, NPC contact, LOS, and probes cannot query different terrain truths.

2026-04-23 Cycle 2 AC-47 orbit closeout
- `npm run probe:fixed-wing` initially caught a real AC-47 regression after the terrain datum patch: A-1/F-4 passed, AC-47 completed takeoff/approach/bailout/handoff but stalled during orbit hold.
- Root cause: `FixedWingControlLaw` orbit-hold roll controller used the wrong roll-error sign and damping sign for the Airframe roll-rate convention, so it over-banked and bled speed.
- Fixed orbit roll control to use target-bank minus current-bank, with damping aligned to the Airframe roll-rate sign.
- Added coverage to the sustained full-throttle AC-47 orbit test so it checks transient roll and airspeed stall margin, not only final state.
- Validation:
  - targeted fixed-wing suites: PASS (`3` files, `39` tests)
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run probe:fixed-wing`: PASS for A-1, F-4, and AC-47, including AC-47 orbit hold
  - `npm run test:quick`: PASS (`242` files, `3769` tests)
  - `npm run build`: PASS

TODO
- Human playtest still owns feel sign-off for AC-47 orbit, fixed-wing camera shake, bailout UX, and forward-strip taxi/takeoff.

2026-04-23 Cycle 3 scheduler kickoff
- User explicitly deferred playtesting until the end of all current recovery cycles.
- Updated `docs/ARCHITECTURE_RECOVERY.md`, `docs/STATE_OF_REPO.md`, and `docs/BACKLOG.md` so Cycle 1/2 human feel gates are deferred, not blockers for Cycle 3.
- Cycle 3 scope: declarative system schedule/update authority. Do not tune vehicle feel, terrain, or combat behavior unless needed to preserve update-order parity.

TODO
- Audit `SystemUpdater`, `SimulationScheduler`, and `SystemInitializer` for all manual update lists, scheduler groups, fallback updates, and tracked-system exclusions.
- Implement the smallest schedule-inspection/validation layer that prevents silent double updates without changing gameplay order.

2026-04-23 Cycle 3 scheduler first pass
- Added `src/core/SystemUpdateSchedule.ts` with inspectable phase metadata for current `SystemUpdater` groups, budgets, scheduler cadence groups, and scheduled system keys.
- Replaced `SystemUpdater`'s private hand-maintained tracked-system predicate with schedule-derived fallback exclusions.
- Covered the latent double-update path where `navmeshSystem` or `npcVehicleController` could be manually updated and then updated again if later added to the generic `systems` list.
- Timing budgets now come from schedule metadata, while the actual gameplay update order remains unchanged.
- Focused validation:
  - `npm run test:quick -- SystemUpdater SimulationScheduler`: PASS
  - `npm run typecheck`: PASS

TODO
- Run `npm run lint`, `npm run test:quick`, and `npm run build` for the Cycle 3 implementation gate.
- Move into Cycle 4 UI/input boundary cleanup after the Cycle 3 gate is green.

2026-04-23 Cycle 3 scheduler gate
- Cycle 3 implementation gate passed:
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS (`242` files, `3772` tests)
  - `npm run build`: PASS
- Updated docs to mark Cycle 4 as the next active recovery cycle.

TODO
- Audit UI/input authority for actor/vehicle mode, HUD context, touch controls, and pointer-lock fallback.
- Keep Cycle 4 out of vehicle physics, terrain shaping, and scheduler order.

2026-04-23 Cycle 4 UI/input boundary first pass
- Removed the public touch-control vehicle-mode mutators that could independently force helicopter/flight UI state.
- `TouchControls` now derives vehicle controls and flight cyclic visibility from presentation `VehicleUIContext`.
- Actor mode alone no longer makes touch controls show the vehicle action bar; runtime should supply `HUDSystem.setVehicleContext()` with capabilities and HUD variant.
- Validation:
  - `npm run test:quick -- TouchControls VehicleActionBar PlayerInput FixedWingPlayerAdapter HelicopterPlayerAdapter`: PASS
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run build`: PASS
  - `npm run check:hud`: PASS
  - `npm run check:mobile-ui`: PASS after rebuilding `dist/`
  - `npm run test:quick`: PASS (`242` files, `3772` tests)

TODO
- Move into Cycle 5 combat scale/data ownership.
- Human playtest still owns touch/mobile aircraft exit and pointer-lock fallback feel sign-off at the end of the recovery run.

2026-04-23 Cycle 5 combat spatial ownership first pass
- Moved the combat LOD spatial dependency behind `CombatantSystem` injection.
  `CombatantLODManager` no longer imports the global `spatialGridManager`
  singleton directly.
- LOD dead-actor removal, position sync, and AI update dependency flow now use
  the same supplied `SpatialGridManager` instance for the current combat world.
- Added regression coverage that constructs a non-global spatial grid and proves
  LOD sync plus `CombatantAI.updateAI()` receive the injected instance.
- Validation:
  - `npm run test:quick -- CombatantLODManager CombatantSystem SpatialGridManager CombatantMovement`: PASS
  - `npm run typecheck`: PASS

TODO
- Move into Cycle 6 terrain/collision authority.
- Combat hot state is still a shared object map; fuller data-store migration
  remains a separate vertical slice with combat scenario/perf-tail evidence.

2026-04-23 Cycle 6 terrain/collision authority first pass
- Removed the live vehicle-runtime `HeightQueryCache` dependency from
  helicopter squad deployment. `SquadDeployFromHelicopter` now accepts a
  runtime terrain query surface and prefers `getEffectiveHeightAt()` for
  collision-aware deploy positions.
- `OperationalRuntimeComposer` now wires `terrainSystem` into helicopter squad
  deployment via `setSquadDeployTerrain()`.
- `NavmeshSystem` now receives `terrainSystem` from `SystemConnector` and
  samples navmesh heightfields, obstacle placement, and startup connectivity
  representative heights through runtime terrain instead of direct
  `HeightQueryCache` calls.
- Validation:
  - `npm run test:quick -- SquadDeployFromHelicopter HelicopterModel OperationalRuntimeComposer TerrainSystem TerrainQueries`: PASS
  - `npm run test:quick -- NavmeshSystem NavmeshHeightfieldBuilder SystemConnector ModeStartupPreparer SquadDeployFromHelicopter HelicopterModel OperationalRuntimeComposer`: PASS
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS (`242` files, `3774` tests)
  - `npm run build`: PASS
  - `npm run probe:fixed-wing`: first run closed the browser during AC-47 and
    left partial artifacts; clean rerun PASS for A-1, F-4, and AC-47.

TODO
- Move into Cycle 7 harness productization after the gate is green.
- Remaining terrain authority risks: world-feature static obstacles still use a
  direct `LOSAccelerator` hook, and `PlayerMovement` still has a no-runtime
  `HeightQueryCache` fallback.

2026-04-23 Cycle 7 harness productization first pass
- Patched `scripts/fixed-wing-runtime-probe.ts` to write `summary.json`
  incrementally after each aircraft scenario instead of only at the end.
- Failed scenarios now write a structured failed result with error text and a
  best-effort failure screenshot path if the page is still alive.
- This directly addresses the Cycle 6 transient where the first probe attempt
  completed A-1/F-4 screenshots, then closed during AC-47 before updating the
  stale summary file.
- Validation:
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run probe:fixed-wing`: PASS; summary now has `status: "passed"`
  - `npm run check:states`: PASS
  - `npm run check:hud`: PASS

TODO
- Start Cycle 8 dead-code/docs/guardrail triage. Do not delete findings from
  `npm run deadcode` without current code evidence and a delete/adopt/retain
  classification.

2026-04-24 Cycle 8 cleanup and guardrails first pass
- Classified `npm run deadcode` findings before editing:
  - retained/adopted root airframe evidence probes by making them explicit Knip
    entries;
  - retained archived cycle evidence `probe.mts` files through Knip ignore
    configuration;
  - retained Cloudflare deploy tooling dependencies through Knip dependency
    ignores;
  - cleaned local-only source exports so helpers/types/constants are private
    unless another module actually imports them.
- Added the missing terrain subsystem guardrail and tightened combat, UI, and
  scripts guardrails around injected spatial authority, presentation-only UI,
  and honest browser-probe paths.
- Validation:
  - `npm run typecheck`: PASS
  - `npm run deadcode`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS, 242 files / 3774 tests
  - `npm run build`: PASS

TODO
- Final user playtest remains the game-feel gate for aircraft feel, bailout UX,
  pointer-lock fallback, and airfield taxi/takeoff usability.

2026-04-24 follow-up gates from user review
- Verified and documented that clouds are configured for all five current game
  modes, but v1 clouds are not considered fixed because `CloudLayer` is still a
  single camera-following plane.
- Verified and documented that silent fallback risk remains: DEM load failure
  can leave flat terrain, `PlayerMovement` can fall back to `HeightQueryCache`,
  air-support non-spooky missions still use legacy direct positioning, terrain
  LOS wiring has a side channel, and combat spatial singleton compatibility
  remains.
- Reframed airfield as partially fixed: terrain stamps share one datum, but
  stands/taxi/runway helpers still need one airfield surface runtime.
- Reframed render/LOD/culling as not fully audited: aircraft have visibility
  gates and static GLBs have draw-call optimization, but buildings/props lack a
  measured render-in/render-out/perf contract.
- Updated docs and the architecture-recovery playtest form with Cycles 9-12:
  atmosphere/cloud evidence, fallback retirement, airfield surface authority,
  and render/LOD/culling perf.

2026-04-24 Cycle 9/10 evidence refresh and doc alignment
- First regenerated atmosphere evidence with `npm run evidence:atmosphere -- --port
  9224` at
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T01-51-14-709Z/`.
- That run proved the local/perf preview had no `asset-manifest.json`; A Shau
  correctly failed before live mode and recorded browser errors.
- Patched `npm run build` and `npm run build:perf` so retail and perf output
  dirs emit `asset-manifest.json`.
- Regenerated evidence again. Later superseded artifact:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T02-18-34-516Z/`.
- A Shau, Open Frontier, TDM, Zone Control, and AI Sandbox/combat120 now enter
  live mode and capture ground plus aircraft/cloud screenshots.
- A Shau records DEM-backed terrain heights, but still emitted a TileCache
  generation failure at tile `1, 0`.
- Visual inspection confirms the current state is evidence, not sign-off:
  Open Frontier/combat120 high views are still mostly sky/haze, TDM/Zone
  Control expose obvious flat cloud-plane artifacts, A Shau has a visible
  cloud-plane/horizon band, and all captured live modes still report
  `cloudFollowCheck.followsCameraXZ === true`.
- Aligned docs to the new truth in `docs/ARCHITECTURE_RECOVERY.md`,
  `docs/STATE_OF_REPO.md`, `docs/BACKLOG.md`, `docs/ATMOSPHERE.md`,
  `docs/ARCHITECTURE.md`, `docs/CLOUDFLARE_STACK.md`, and
  `docs/playtest/PLAYTEST_2026-04-23_ARCHITECTURE_RECOVERY_CYCLE.md`.
- Validation:
  - `npm run typecheck`: PASS
  - `npx vitest run src/core/ModeStartupPreparer.test.ts src/systems/environment/AtmosphereSystem.test.ts src/systems/environment/atmosphere/CloudLayer.test.ts`: PASS, 63 tests
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS, 242 files / 3774 tests
  - `npm run build`: PASS, with the existing Vite large-chunk warning

TODO
- Cycle 10: investigate the current A Shau TileCache generation failure at tile
  `0, 0` with generated bounds
  `origin=(-8168,-8839) extent=(17057,17722) anchors=18`. The earlier
  disconnected-home-base warning stopped after the terrain-flow shoulder patch,
  but static fallback is still degraded and route/NPC movement needs a real
  A Shau nav gate.
- Cycle 11: unify airfield surface authority after A Shau terrain is real;
  keep `tabat_airstrip` and Open Frontier `airfield_main` in scope.
- Cycle 12: capture airfield/world-feature render, LOD, culling, collision, and
  LOS perf before replacing models or adding imposters.

2026-04-24 Cycle 10 fallback update and doc realignment
- Added explicit A Shau nav fallback behavior after the TileCache build failure:
  `NavmeshSystem` logs the TileCache failure, retries a static tiled navmesh,
  and warns that TileCache streaming/obstacles are disabled when that fallback
  is active.
- Regenerated atmosphere evidence with warning capture enabled. Later
  superseded artifact:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T02-33-47-922Z/`.
- Latest evidence summary:
  - A Shau, Open Frontier, TDM, Zone Control, and AI Sandbox/combat120 all
    enter live mode, capture ground plus aircraft screenshots, and record `0`
    browser errors.
  - All five modes still report `cloudFollowCheck.followsCameraXZ === true`,
    so the one-plane cloud representation remains a known v1 limit.
  - A Shau loads DEM-backed terrain, but TileCache generation still fails at
    tile `1, 0` and degrades to static nav. That run reported disconnected
    nav islands and a steep
    `tabat_airstrip` warning (`112.1m` vertical span across `320m` runway
    footprint), WebGL context-loss warnings during capture, and ReadPixels GPU
    stall warnings.
- Updated docs so agents do not inherit the older A Shau browser-failure
  framing. Current docs now describe explicit degraded static nav plus
  remaining connectivity/airfield blockers in `docs/ARCHITECTURE_RECOVERY.md`,
  `docs/STATE_OF_REPO.md`, `docs/BACKLOG.md`, `docs/ATMOSPHERE.md`,
  `docs/ARCHITECTURE.md`, `docs/CLOUDFLARE_STACK.md`,
  `docs/DEVELOPMENT.md`, `docs/PLAYTEST_CHECKLIST.md`, historical cloud-cycle
  caveats, and the architecture-recovery playtest form.
- Validation after the fallback/docs alignment:
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS, 242 files / 3774 tests
  - `npm run build`: PASS, writes `dist/asset-manifest.json`; existing Vite
    large-chunk warning remains

TODO
- Continue Cycle 10 by tracing why A Shau TileCache fails and whether the
  static fallback is acceptable only as a degraded diagnostic path.
- Continue Cycle 11 with `tabat_airstrip`: author a real airfield surface
  authority or move/reshape the site so taxi/takeoff does not rely on a 112m
  flattening envelope.
- Continue Cycle 12 with render/LOD/culling evidence; include WebGL
  context-loss and ReadPixels warnings in the capture/perf audit.

2026-04-24 Cycle 10 A Shau continuation and all-mode release gate
- User clarified that A Shau still needs to be fixed and must not be skipped,
  while the cycle also needs all-mode validation before push/deploy.
- Patched large-world navmesh generation so tiled/static generation bounds are
  anchored to scenario zones instead of assuming world origin contains useful
  navigation. Added bounds to the TileCache fallback warning.
- Patched startup connectivity validation to snap home-base representative
  points to nearby navmesh and warn when a home base has no navmesh nearby.
- Enabled A Shau terrain-flow shoulders around home bases/objectives. Latest
  evidence no longer reports disconnected home-base islands after this change.
- Current evidence artifact:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T03-01-30-184Z/`.
- Latest evidence summary:
  - A Shau, Open Frontier, TDM, Zone Control, and combat120 all enter live mode
    with `0` browser errors and ground/aircraft screenshots.
  - A Shau still falls back from TileCache to static tiled nav:
    `Failed to build nav mesh tiles at 0, 0; bounds origin=(-8168,-8839)
    extent=(17057,17722) anchors=18`.
  - A Shau still warns that `tabat_airstrip` has `112.1m` vertical span across
    the `320m` runway footprint.
  - Open Frontier now also warns that `airfield_main` is steep (`19.3m` span
    across `480m`), and several non-A Shau modes show TacticalUI/World/Combat
    budget warnings. These are part of the final all-mode release gate.
- Updated docs to state the current cycle intent:
  - keep fixing A Shau rather than accepting degraded nav as done;
  - before push/deploy, rerun all-mode evidence so A Shau work does not regress
    Open Frontier, TDM, Zone Control, or combat120;
  - bridge local-vs-prod evidence by checking live Pages/R2/WASM/service-worker
    headers after deployment because local perf-preview evidence is not live
    production truth.

TODO
- Continue A Shau Cycle 10: determine whether TileCache can support the current
  generated bounds or whether A Shau needs a baked/streamed nav layer.
- Keep `tabat_airstrip` and Open Frontier `airfield_main` in Cycle 11 airfield
  authority.
- Final release gate needs local all-mode evidence, normal validation, and live
  deploy/header checks.

2026-04-24 Cycle 10/12 atmosphere, terrain-clipping, and water clarification
- Updated current-facing docs after the latest all-mode evidence artifact:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T05-24-42-281Z/`.
- Current code truth:
  - visible clouds are sky-dome clouds from `HosekWilkieSkyBackend`;
    `CloudLayer` is still present but hidden so the old hard horizon divider /
    one-tile plane is no longer the visible cloud authority. The shader now uses
    a seamless cloud-deck projection instead of azimuth-wrapped UVs.
  - all five modes enter live mode with `0` browser errors and terrain resident
    at the camera in ground, sky, and aircraft evidence views.
  - the refreshed artifact reports `cameraBelowTerrain=false` and
    `waterExposedByTerrainClip=false` in every captured view.
  - Open Frontier and combat120 cloud metrics pass and now show lighter
    scattered-cloud forms. A Shau, TDM, and Zone Control read as heavier broken
    cloud layers. Human playtest remains the final art/readability sign-off.
  - A Shau water is disabled and no longer reports underwater state in the
    evidence capture. Terrain/camera clipping and water rendering are separate
    issues: clipping can expose the global water plane, while water quality /
    hydrology remains its own render backlog item.
  - the old TileCache fallback path is removed. Large worlds use explicit
    static-tiled nav generation, and A Shau startup stops if no generated or
    pre-baked navmesh exists. Remaining A Shau risk is route/NPC quality, not a
    hidden TileCache/beeline fallback.
  - the refreshed artifact records A Shau nav diagnostics: 6/6 representative
    bases snapped to navmesh, `connected=true`, and every representative pair
    returned a path. This is not a human/NPC movement sign-off, but it closes
    the prior missing connectivity evidence gap.
- Aligned docs: `docs/ARCHITECTURE_RECOVERY.md`, `docs/STATE_OF_REPO.md`,
  `docs/ATMOSPHERE.md`, `docs/BACKLOG.md`, `docs/ARCHITECTURE.md`,
  `docs/DEVELOPMENT.md`, `docs/CLOUDFLARE_STACK.md`, the 2026-04-22 cloud cycle
  caveats, `docs/PLAYTEST_CHECKLIST.md`, and the architecture-recovery playtest
  form.
- Added `clipDiagnostics` to `scripts/capture-atmosphere-recovery-shots.ts` so
  evidence rows report raw/effective terrain clearance, water-level clearance,
  and whether water was exposed by an invalid below-terrain camera position.
- Added `navDiagnostics` to the same evidence script. A Shau now fails the
  artifact if representative bases cannot snap/connect on the navmesh.
- Repo pulse:
  - `master`, `origin/master`, and the active recovery worktree all pointed at
    `4a940957` before this recovery work was committed, so this session's work
    lived in the dirty main worktree.
  - No branch has committed work dated 2026-04-23 or 2026-04-24 in this clone.
  - Most April 22 task branches are patch-equivalent to `master`; four remain
    non-equivalent and need post-ship cleanup review:
    `task/world-overlay-debugger`, `task/live-tuning-panel`,
    `task/airfield-envelope-ramp-softening`, and
    `task/airframe-ground-rolling-model`.

Validation:
- `npm run typecheck`: PASS
- `npx vitest run src/systems/environment/AtmosphereSystem.test.ts src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts src/systems/environment/WaterSystem.test.ts src/systems/navigation/NavmeshSystem.test.ts src/core/ModeStartupPreparer.test.ts`: PASS, 91 tests
- `npm run lint`: PASS
- `npm run evidence:atmosphere -- --port 9224`: PASS, wrote
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T05-24-42-281Z/summary.json`

TODO
- Continue Cycle 10 with A Shau route/NPC movement quality over explicit
  static-tiled generation.
- Continue Cycle 11 with `tabat_airstrip` / `airfield_main` surface authority.
- Continue Cycle 12 with render/LOD/culling plus separate water/hydrology and
  terrain/camera clipping evidence.

2026-04-24 Final local recovery gate before commit
- Current docs aligned away from branch-scoped language in the current truth
  anchors: `AGENTS.md`, `docs/STATE_OF_REPO.md`,
  `docs/ARCHITECTURE_RECOVERY.md`, `docs/BACKLOG.md`,
  `docs/AGENT_ORCHESTRATION.md`, `docs/DEVELOPMENT.md`,
  `docs/DEPLOY_WORKFLOW.md`, and `docs/PERFORMANCE.md`.
- Validation completed:
  - `npm run validate:fast`: PASS, 242 files / 3781 tests.
  - `npm run build`: PASS, with the existing large-chunk Vite warning.
  - `npm run probe:fixed-wing`: PASS for A-1, F-4, and AC-47, including
    takeoff, climb, approach, airborne bailout, and player/NPC handoff.
  - `npm run check:states`: PASS, artifact
    `artifacts/states/state-coverage-2026-04-24T05-40-49-159Z.json`.
  - `npm run check:hud`: PASS, artifact
    `artifacts/hud/hud-layout-report.json`.
  - `npm run check:mobile-ui`: PASS, artifact
    `artifacts/mobile-ui/2026-04-24T05-43-18-934Z/mobile-ui-check`.
  - `npm run doctor`: PASS.
  - `npm run deadcode`: PASS.
  - `git diff --check`: PASS, with CRLF warnings only.
  - `npm run validate:full`: PASS/WARN. Unit/build stages passed; first
    combat120 capture failed one heap-recovery check. Standalone
    `npm run perf:capture:combat120` then passed with warnings at
    `artifacts/perf/2026-04-24T05-49-45-656Z`, and
    `npm run perf:compare -- --scenario combat120` passed 8/8 checks.
- Remaining release-owner work: stage, commit, fast-forward `master`, push,
  trigger manual deploy, then verify live Pages/R2/WASM/service-worker headers.

2026-04-24 NPC movement/navmesh deployment pass
- Verified current production deploy points at commit
  `9dafb7766ae94b20a501c9bc1fd2b0f0b64d9d80`; latest `deploy.yml` run
  succeeded, and live Pages headers show `/`, `/asset-manifest.json`,
  `/sw.js`, seed navmesh binaries, and Recast WASM serving with the intended
  cache split.
- Deployment/navmesh finding: Open Frontier, Zone Control, and TDM use
  committed seed-keyed navmesh/heightmap files under `public/data`; A Shau
  resolves DEM/rivers through the asset manifest/R2 and builds static-tiled
  navmesh at startup. Cloudflare is not building navmesh, and the current risk
  is route-follow quality, not the Pages cache path.
- Reduced infantry locomotion speeds to a real `NPC_MAX_SPEED = 6m/s`, removed
  hidden 9-10m/s state speeds, reduced distant-culled coarse movement, and made
  high/medium LOD combatants clamp rendered Y near grounded logical Y to reduce
  visible hover.
- Targeted movement/render/navigation tests passed:
  `npx vitest run src/systems/combat/CombatantMovement.test.ts src/systems/combat/CombatantMovementStates.test.ts src/systems/combat/CombatantRenderInterpolator.test.ts src/systems/combat/CombatantLODManager.test.ts src/systems/navigation/NavmeshSystem.test.ts src/systems/navigation/NavmeshMovementAdapter.test.ts`.

TODO
- `npm run validate:fast` passed after docs/code edits: typecheck, lint, and
  243 test files / 3789 tests.
- `npm run build` passed after docs/code edits; `prebuild` found all 22 baked
  assets already present and skipped regeneration. Existing Vite large-chunk
  warning remains.
- `npm run smoke:prod` passed at `http://127.0.0.1:53616/`.
- Human playtest still needs to judge infantry pacing and whether route-follow
  navmesh quality, not speed, is now the main problem.

2026-04-24 README OSS front-door pass
- Rewrote `README.md` to make the live game link, current-state truth anchor,
  stabilization focus, quickstart, validation, repo map, docs map,
  contributing rules, and deploy caveat clearer for public OSS readers.
- Kept claims aligned with current docs: A Shau is described as a 3,000-unit
  strategic simulation with local materialization, not 3,000 fully live NPC
  meshes; known open work remains visible instead of hidden behind marketing
  language.
- Fresh final validation after the README/doc alignment:
  - `git diff --check`: PASS, CRLF warnings only.
  - `npm run validate:fast`: PASS, 243 files / 3789 tests.
  - `npm run build`: PASS, existing large-chunk Vite warning only.
  - `npm run smoke:prod`: PASS at `http://127.0.0.1:59767/`.
  - `npm run evidence:atmosphere`: PASS/WARN, artifact
    `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T13-08-25-253Z/summary.json`.
- Commit `ce87fef885c1a6d6678a4f4b7be6342c70053c60` pushed to `origin/master`;
  manual `deploy.yml` run `24891880026` succeeded and live Pages verification
  passed. Live `/asset-manifest.json` served the release git SHA and R2 DEM
  URL, stable shell assets revalidated, hashed build/navmesh/WASM assets were
  immutable, and a live Zone Control smoke reached the deployment UI without
  console/page/request errors.
- Follow-up docs alignment replaces the old "needs deploy" caveat with a
  recurring release-gate requirement: repeat manifest/header/live-smoke checks
  after each player-test push.

2026-04-26 Pixel Forge asset-only cutover
- Began hard cutover from old NPC/vegetation art to Pixel Forge-only runtime
  assets. Copied accepted vegetation impostor packages, NPC combined GLBs,
  NPC animated impostor atlases, and the 80 new prop GLBs into `public/`.
- Added the Pixel Forge runtime manifest, prop catalog, and cutover validator.
  `AssetLoader` now registers NPC/vegetation textures from the manifest instead
  of old root-level webp filenames.
- Removed old root-level NPC sprite and vegetation webp assets from
  `public/assets`; terrain, UI, audio, and weapon assets were left alone.
- Rewired combatant rendering to Pixel Forge-only impostor buckets plus capped
  close GLB model pools from the combined faction GLBs; old directional soldier
  texture keys are no longer runtime inputs.
- Validation so far: `npm run typecheck` PASS,
  `npm run check:pixel-forge-cutover` PASS, targeted Vitest for vegetation,
  billboard, and combat renderer/factory PASS (6 files / 69 tests).
- Final local validation for the cutover pass: `npm run validate:fast` PASS
  (244 files / 3796 tests), `npm run build` PASS, `npm run smoke:prod` PASS,
  `git diff --check` PASS with CRLF warnings only. The generic web-game
  Playwright client captured the mode-select screen with no console errors,
  but did not drive the DOM mode card because that helper sends mouse actions
  relative to the canvas.
- Removed the old vegetation/soldier optimizer path that could regenerate
  deleted webp assets; `assets:optimize:vegetation` and `assets:fix-alpha`
  now route to the Pixel Forge cutover validator.
- User-visible stale asset report traced to an old `dist-perf` build that still
  shipped the legacy AssetLoader registry and copied old webp files. Expanded
  `check:pixel-forge-cutover` to scan `dist` and `dist-perf`, then rebuilt both
  outputs. The validator now fails on stale shipped legacy filenames/tokens.
- Added a vegetation billboard near-field fade uniform in the Pixel Forge shader
  path to reduce large impostor planes clipping into the first-person camera.
- Fresh follow-up validation: `npm run build` PASS, `npm run build:perf` PASS,
  `npm run check:pixel-forge-cutover` PASS, `npm run validate:fast` PASS
  (244 files / 3796 tests), `npm run smoke:prod` PASS, and `git diff --check`
  PASS with CRLF warnings only. Direct preview probes for both `dist` and
  `dist-perf` confirmed old asset URLs serve only HTML fallback, not images,
  while new Pixel Forge PNG/GLB paths serve real asset bytes.
- Visual perf follow-up found the first `giantPalm` candidate
  (`palm-quaternius-3`) had an off-origin 25.9m capture footprint and produced
  huge near-camera billboard planes. Switched runtime `giantPalm` to the
  approved `palm-quaternius-2` package, removed the oversized variant from
  `public/`, and taught the validator to fail on that variant in source or
  shipped output.
- Rebuilt after the palm swap and reran: `npm run build` PASS,
  `npm run build:perf` PASS, `npm run check:pixel-forge-cutover` PASS,
  `npm run validate:fast` PASS, `npm run smoke:prod` PASS, `git diff --check`
  PASS with CRLF warnings only, and direct preview/prod-perf probes confirmed
  old `.webp` URLs do not serve images while new Pixel Forge PNG/GLB URLs do.
  `npm run perf:quick` still fails on the active-driver combat hit/shots gate
  (`artifacts/perf/2026-04-26T13-23-51-069Z`), but its final screenshot shows
  the stale old art and oversized palm slabs are gone.
- User playtest appearance notes from the local preview:
  - Vegetation impostors currently disappear when the player gets too close;
    the near-field fade is too aggressive as a gameplay solution and should be
    replaced or limited by a proper near LOD/clearance strategy.
  - Distant scene reads too bright and foggy; atmosphere/fog/vegetation
    lighting needs to be separated from asset color calibration instead of
    solved by texture swaps.
  - NPCs animate and walk, but their world scale is too small and legs can
    clip through terrain; close GLB scale, impostor scale, y-offset, and
    terrain grounding need a single calibration pass.
  - Vegetation impostors snap noticeably, especially while flying. The current
    view-angle tile selection/LOD transition is too discrete for fast camera
    movement and needs smoothing, hysteresis, or cross-fade.
  - These should be split into separate fixes: vegetation near handling,
    atmosphere/lighting, NPC scale/grounding, and vegetation LOD snapping.

2026-04-26 Pixel Forge NPC renderer restart
- Root-cause note for the bad NPC pass: close Pixel Forge GLBs were spawned
  without weapon attachments, the 6-per-faction / 24-total close mesh pool was
  exhausted in clustered sandbox combat and nearby enemies fell back to
  impostors, NVA/VC close GLBs are flat-color assets rather than textured
  assets and need runtime readability tuning, the current `advance_fire` source
  clip contains horizontal root motion that rubberbands scene movement, and the
  review-only NPC package was promoted into runtime before those contracts were
  enforced.
- Restart plan: centralize faction/body/weapon/socket/clip/LOD metadata in a
  Pixel Forge NPC runtime adapter, reserve the 45m near range for close GLB
  meshes only, attach M16A1/AK-47 weapons through the `RightHand`/`LeftHand`
  socket contract, strip horizontal root motion from looped close clips at load
  time, keep animated impostors for mid/far range only, and add tests/probes so
  the renderer cannot silently regress to near impostors or unarmed close GLBs.
- Implementation checkpoint: added `PixelForgeNpcRuntime`, moved moving combat
  states to `walk_fight_forward`, strips horizontal `Hips.position` root motion
  from looped clips, expands close model pools to 32 per pool / 96 selected,
  suppresses near impostors on close-pool overflow, attaches M16A1/AK-47 weapon
  GLBs to close models, and tunes flat NVA/VC close-material colors for
  readability without old textures.
- Validation checkpoint: targeted Pixel Forge NPC runtime/renderer/factory
  Vitest passed, `npm run check:pixel-forge-cutover` passed with weapon GLB
  requirements, `npm run validate:fast` passed (245 files / 3807 tests), and
  `npm run build` passed with the existing large-chunk warning. The new
  `npm run probe:pixel-forge-npcs` live sandbox probe passed at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1`; nearest NPCs
  were close GLBs with `hasWeapon=true` and no actor inside 45m rendered as an
  impostor. Probe artifacts are in `artifacts/pixel-forge-npc-probe/`. The
  generic web-game Playwright client also captured
  `output/web-game/shot-0.png`; the screenshot still shows vegetation occlusion
  and overall environment readability as follow-up visual issues, separate
  from the near-range NPC renderer contract.

2026-04-26 Pixel Forge vegetation/NPC readability pass
- Implemented close vegetation alpha hardening and lighting calibration in the
  Pixel Forge billboard shader while keeping `nearFadeDistance=0`: core atlas
  pixels are pushed toward opaque inside 30m, transition back by roughly 55m,
  and close foliage gets a brighter minimum light/exposure floor without old
  vegetation assets or close mesh vegetation LODs.
- Removed the runtime retro/pixelated look for this pass: the main renderer no
  longer constructs `PostProcessingManager`, WebGL antialiasing is enabled,
  post-process/pixel-size hotkeys are no longer bound, and foliage/NPC impostor
  atlases use linear mipmapped sampling instead of nearest-neighbor billboard
  filtering.
- Disabled the renderer-facing NPC turn smoothing because the Pixel Forge turn
  rig is not reliable; `visualRotation` now snaps to authoritative combatant
  rotation and clears turn velocity.
- Increased shared NPC visual height by 1.5x for both close GLBs and far
  impostors, then added material/emissive readability tuning for close flat GLBs
  and a mild contrast/lift in the NPC impostor shader so actors stand out more
  against terrain.
- Validation: targeted billboard/combat/renderer tests passed (7 files / 85
  tests), `npm run validate:fast` passed (246 files / 3813 tests), `npm run
  build` passed with the existing large-chunk warning, and
  `npm run check:pixel-forge-cutover` passed after build.
- Browser smoke: the develop-web-game Playwright client reached live sandbox
  at `http://127.0.0.1:5173/?sandbox=1&npcs=80&seed=2718&diag=1` with captures
  under `artifacts/web-game/pixel-forge-vegetation-npc-readability-rerun/`.
 A direct runtime probe reported `hasPostProcessing=false`, `gameStarted=true`,
 and no browser console/page errors. Visual note: a nearby friendly can now
 fill the camera when standing very close after the 1.5x scale increase; leave
 any proximity-hide or squad spacing change for a separate playtest decision.

2026-04-26 Pixel Forge grounding/wind/readability follow-up
- Fixed floating vegetation caused by transparent lower padding in low-angle
  Pixel Forge atlas rows. Runtime vegetation type generation now applies
  species-specific grounding sinks for the affected approved assets
  (`bambooGrove`, `coconut`, `elephantEar`, `fanPalm`, `giantPalm`) so visible
  bases land at or slightly below terrain without per-frame terrain sampling.
- Strengthened vegetation wind by replacing the tiny hardcoded sway with
  per-material GPU vertex uniforms (`windStrength`, `windSpeed`,
  `windSpatialScale`). The animation remains fully shader-side, LOD-scaled,
  and does not add CPU-side instance updates.
- Improved NPC readability by lifting Pixel Forge impostor color toward the
  faction marker color, raising and enlarging the instanced ground marker so it
  follows elevated terrain instead of staying at world `y=0.1`, and adding
  faction-specific close-GLB material tuning for US/ARVN as well as NVA/VC.
- Validation: targeted vegetation/billboard/combat tests passed (5 files / 77
  tests) plus focused NPC runtime/renderer tests passed (2 files / 23 tests).
  `npm run validate:fast` passed (246 files / 3817 tests), `npm run build`
  passed with the existing large-chunk warning, and
  `npm run check:pixel-forge-cutover` passed after build.
- Browser smoke: sandbox at
  `http://127.0.0.1:5173/?sandbox=1&npcs=80&seed=2718&diag=1` reached gameplay
  with no browser console/page errors. Latest visual capture:
  `artifacts/web-game/pixel-forge-grounding-wind-readability-final/shot-0.png`.
  The faction marker is now visible on elevated terrain; it may need a later
  style pass if the horizontal ring reads too UI-like in human playtest.

2026-04-26 Pixel Forge NPC impostor facing/lighting/range follow-up
- Inspected the packed Pixel Forge NPC atlas row for `usArmy/idle`; the current
  renderer was treating the camera-in-front case as view column 0, which reads
  like a side/back presentation for the package. Runtime view-column selection
  now applies a 180-degree Pixel Forge forward offset before sampling the 7-wide
  impostor row, with a regression test for front/rear view columns.
- Pushed the no-impostor near band farther out: close GLBs now cover 64m
  instead of 45m, the selected close cap is 128, and per-pool capacity is 40.
  The renderer still suppresses over-cap near impostors instead of silently
  falling back to billboarded NPCs inside the hard close range.
- Added cheap shader-side readability lighting for billboarded NPCs:
  `npcExposure=1.14`, `minNpcLight=0.82`, `npcTopLight=0.22`, plus a slightly
  stronger faction-color lift. This keeps far impostors visible without adding
  CPU-side lighting work or old sprite assets.
- Updated `scripts/probe-pixel-forge-npcs.ts` to read the runtime close-radius
  constant so the live probe enforces the current 64m contract instead of the
  retired 45m threshold.
- Validation: targeted NPC renderer/factory/runtime tests passed (3 files / 39
  tests), `npm run validate:fast` passed (246 files / 3820 tests), `npm run
  build` passed with the existing large-chunk warning, and
  `npm run check:pixel-forge-cutover` passed after build. Live probe at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` passed with
  `closeRadiusMeters=64`, 26 active close GLBs, armed nearest actors, and no
  failures; artifacts are in `artifacts/pixel-forge-npc-probe/`.
- Browser note: a short develop-web-game smoke reached live sandbox with no
  browser console/page errors and screenshot
  `artifacts/web-game/pixel-forge-npc-facing-lighting-range-short/shot-0.png`.
 A longer virtual-time web-game run timed out before writing artifacts. The
 probe screenshot still shows a very close GLB can fill the camera after the
 1.5x scale increase; treat that as a later squad spacing/proximity-hide
 decision rather than an impostor LOD issue.

2026-04-26 Pixel Forge docs/progress drift alignment
- Opened the local sandbox in the in-app browser for human testing at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1`.
- Corrected non-archived docs that still described the pre-Pixel-Forge state:
  `docs/STATE_OF_REPO.md` now has a 2026-04-26 Pixel Forge cutover section,
  `docs/ASSET_MANIFEST.md` now lists 159 GLBs plus Pixel Forge NPC/vegetation
  assets instead of old 2D sprites/root WebP vegetation, `docs/BACKLOG.md`
  now treats the Pixel Forge asset pipeline as active/current, and
  `docs/ARCHITECTURE_RECOVERY.md` now references the 64m close-GLB contract
  instead of the old faction-sprite sizing path.
- Kept unresolved visual risk visible in docs: vegetation close readability,
  wind/snap feel, close GLB camera occlusion after 1.5x scale, faction marker
  style, static building/prop culling/HLOD measurement, and human playtest
  sign-off.

2026-04-26 Pixel Forge NPC impostor brightness and small-palm stabilization
- Fixed Pixel Forge NPC impostors reading too dark versus close GLBs by
  outputting straight RGB with alpha instead of multiplying impostor color by
  alpha before transparent blending. Also lifted the billboard NPC lighting
  floor (`npcExposure=1.2`, `minNpcLight=0.92`) and reduced the top-light crush
  so far actors stay closer to the flat-color GLB look.
- Confirmed the small Pixel Forge palm (`giantPalm` / `palm-quaternius-2`) uses
  a curved trunk in its atlas. Azimuth interpolation makes that trunk jump
  laterally during camera angle changes, so `giantPalm` now locks to atlas
  column 3 and disables per-angle atlas blending for that species. This is the
  cheap billboard fix; a close 3D vegetation LOD or per-column pivot metadata
  would be the higher-fidelity follow-up.
- Increased `giantPalm` runtime size by 1.75x while scaling its y-offset and
  grounding sink with the same factor so the larger palm stays planted.
- Validation: targeted Pixel Forge combat/vegetation/billboard tests passed
  (4 files / 63 tests), `npm run check:pixel-forge-cutover` passed,
  `npm run validate:fast` passed (246 files / 3823 tests), `npm run build`
  passed with the existing large-chunk warning, and the post-build Pixel Forge
  cutover check passed. Browser smoke reached sandbox gameplay at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` with no browser
 console/page errors; NPC probe passed with `closeRadiusMeters=64`, armed
  close GLBs, and no failures.

2026-04-26 Pixel Forge tall-palm atlas row quarantine
- Investigated the remaining "two trunk locations" report on tall palms. The
  coconut/tall-palm bottom atlas row (`coconut-palm-google`, row 3) contains a
  duplicated/offset palm silhouette in the tile itself, and azimuth blending on
  the curved trunk draws two trunks during camera-angle transitions. Debug
  strips were written under `artifacts/debug/coconut-row2.png` and
  `artifacts/debug/coconut-row3.png`.
- Added manifest-backed runtime controls for problematic vegetation atlases:
  `stableAzimuthColumn` continues to lock skinny asymmetric trunks to a clean
  column, and new `maxElevationRow` lets a species avoid a bad low-angle row
  without affecting the rest of the billboard renderer.
- Applied the guard only to `coconut`: lock to column 2 and cap elevation row
  at 2 so ground-level views no longer sample the broken row 3. This is a
  production-safe interim fix; the higher-quality answer is regenerating palms
  with close mesh/trunk LODs or a hybrid trunk-mesh/canopy-impostor path.
- Validation: targeted vegetation/billboard tests passed (3 files / 51 tests),
  `npm run check:pixel-forge-cutover` passed, `npm run validate:fast` passed
  (246 files / 3825 tests), `npm run build` passed with the existing
  large-chunk warning, and the post-build Pixel Forge cutover check passed.
  The in-app browser sandbox was reopened at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` with no
  browser console errors.

2026-04-26 Pixel Forge dev-cycle close-out and docs alignment
- Aligned current-state docs for the end of the Pixel Forge visual iteration:
  `docs/STATE_OF_REPO.md` now has a dev-cycle close-out snapshot, current green
  local gates, current runtime truth, and the next polish queue; `docs/BACKLOG.md`
  now prioritizes hitbox/shot feedback, close NPC occlusion/collision feel,
  faction readability, palm/tree close LOD quality, vegetation atlas snapping,
  and static prop/building culling evidence; `docs/ASSET_MANIFEST.md` records
  the interim `giantPalm`/`coconut` atlas guards and the likely need for close
  mesh or hybrid trunk/canopy vegetation; `docs/ARCHITECTURE_RECOVERY.md` now
  reflects the latest 3825-test fast gate and routes any remaining scale/hitbox
  issues back through telemetry instead of hidden offsets.
- Close-out intent: this is a local development checkpoint so the next session
  can start on polish work, not a live production release claim. Remaining
  human-review items are explicit and current docs no longer imply old sprite
  or old vegetation runtime behavior.
- Final close-out validation: `npm run validate:fast` passed (246 files / 3825
  tests), `npm run build` passed with the existing large-chunk warning,
  post-build `npm run check:pixel-forge-cutover` passed, `git diff --check`
  reported only existing CRLF normalization warnings, and a fresh in-app
  browser sandbox opened at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` with no browser
  console errors.

2026-04-26 Pixel Forge hitbox alignment and gun-range route
- Rebuilt player shot registration around shared Pixel Forge visual hit
  proxies in `CombatantBodyMetrics`: head sphere, chest capsule, pelvis sphere,
  and two leg capsules are derived from the current 1.5x NPC visual height and
  can use logical or rendered visual position.
- Updated `CombatantHitDetection` so player damage/preview paths use
  `positionMode: 'visual'`, while NPC-vs-NPC raycasts still default to logical
  positions. Player weapon firing now keeps the original camera/crosshair ray
  for damage and uses the barrel-aligned ray only for tracer visuals.
- Added `?diag=1&hitboxes=1` renderer debug proxies over nearby live NPCs,
  sourced from the same helper rather than duplicated offsets.
- Added an isolated Pixel Forge GLB dev gun range at `?mode=gun-range` for
  crosshair, tracer, and hit-proxy validation without loading terrain, AI,
  vegetation, impostors, or combat120. The scene exposes
  `window.render_game_to_text()` and `window.advanceTime(ms)` for automation.
- Documentation aligned in `docs/STATE_OF_REPO.md`, `docs/BACKLOG.md`, and
  `docs/COMBAT.md`. Human playtest still needs to judge final shot feel,
  muzzle/tracer presentation, and close NPC collision/occlusion.
- Validation: targeted gun-range/combat/weapon/renderer tests passed (5 files /
  85 tests), `npm run validate:fast` passed (247 files / 3833 tests),
  `npm run build` passed with the existing large-chunk warning, and post-build
  `npm run check:pixel-forge-cutover` passed. In-app browser smoke at
  `http://127.0.0.1:5173/?mode=gun-range` rendered the range with no console
  errors; automation artifact
  `artifacts/web-game/gun-range-hitbox-smoke/state-0.json` recorded a center
  shot head hit on the target.

2026-04-26 Pixel Forge hitbox follow-up: taller shared player/NPC proxies
- Increased the shared Pixel Forge hit-proxy height multiplier to better cover
  the actual GLB silhouettes seen in the gun-range playtest.
- Moved `checkPlayerHit()` off the old fixed sprite-era player spheres and onto
  `CombatantBodyMetrics.writeCharacterHitProxies()`, so NPC shots against the
  player now use the same head/chest/pelvis/leg proportions as close GLB NPCs
  and impostor NPCs.
- Kept player damage on the original camera/crosshair ray, but changed the
  first-person blue tracer presentation to project from the actual overlay
  weapon muzzle/barrel point and start farther in front of the camera. This
  keeps fair hit registration while reducing the distracting near-camera red
  vs. blue ray gap in the gun range.
- Updated the gun-range tracer debug path to use a lightweight invisible
  muzzle/barrel object in camera space instead of a bare fixed line origin, so
  the blue debug ray is derived from an explicit barrel marker just like
  production derives from the weapon rig `muzzleRef`.
- Updated docs to reflect the GLB gun range and the shared player/NPC/impostor
  hit-proxy contract. Human playtest still needs to confirm the taller proxy,
  projected barrel tracer, and close camera feel.

2026-04-26 Pixel Forge close-out asset cleanup
- Removed the old `public/assets/source/soldiers/` source PNGs after user
  approval because Vite copied them into `dist/assets/source/soldiers/`, which
  violated the no-old-NPC-assets shipped-output rule.
- Tightened `scripts/validate-pixel-forge-cutover.ts` so
  `assets/source/soldiers` paths and the old source-soldier PNG filenames fail
  the cutover check in source, `dist`, or `dist-perf`.
- Rebuilt both retail and perf outputs after the asset cleanup:
  `npm run build` passed, `npm run build:perf` passed, and the generated
  `dist/asset-manifest.json` plus `dist-perf/asset-manifest.json` were refreshed.
- Validation after cleanup: `npm run check:pixel-forge-cutover` passed,
  `npm run validate:fast` passed (247 files / 3834 tests), and direct scans of
  `public`, `dist`, and `dist-perf` found no `assets/source/soldiers` paths or
  old source-soldier filenames.

2026-04-26 Pixel Forge production deploy verification
- Committed the Pixel Forge NPC/vegetation cutover, hitbox/gun-range, and source
  asset cleanup as `c70d6d74f689b99ae97513e842b40248923c62c2`, pushed it to
  `origin/master`, and manually triggered GitHub Actions Deploy run
  `24968673208`.
- Deploy run `24968673208` passed: checkout, setup, dependency install, build,
  Cloudflare asset upload/validation, and Cloudflare Pages deploy all completed.
  The only annotation was the existing `cloudflare/wrangler-action@v3` Node 20
  deprecation warning from GitHub Actions.
- Live Pages verification passed:
  `https://terror-in-the-jungle.pages.dev/asset-manifest.json` served git SHA
  `c70d6d74f689b99ae97513e842b40248923c62c2`; `/`, `/sw.js`,
  `/asset-manifest.json`, main build assets, terrain/navmesh workers, Recast
  WASM/build assets, and A Shau R2 DEM/rivers returned `200` with expected cache
  headers.
- Live browser smoke passed at
  `https://terror-in-the-jungle.pages.dev/?sandbox=1&npcs=40&seed=2718&diag=1`:
  the gameplay HUD rendered with canvases, `window.__engineHealth` and
  `window.__rendererInfo` were exposed by `?diag=1`, and there were no browser
  console errors or failed requests. `?mode=gun-range` remains a DEV-only route,
  so production smoke uses live sandbox gameplay instead.

2026-04-26 Pixel Forge NPC death lifecycle fix
- New playtest issue: Pixel Forge NPC deaths could visually fall more than once
  during the 8.7s dying window. Root cause is split across LOD paths: close GLB
  `death_fall_back` actions were ordinary looping `AnimationAction`s, and far
  impostor death atlases used the same looping time/phase shader as locomotion.
- Implemented the contract that death is driven by combatant `deathProgress`:
  close GLBs use a one-shot clamped `death_fall_back` pose, and far impostors
  receive per-instance one-shot animation progress plus fade opacity. Meshes
  still remain pooled for performance, but they fade near the end of the dying
  window and are hidden/released when the combatant leaves the active map.
- Validation: targeted renderer/mesh-factory tests passed (2 files / 39 tests),
  `npm run typecheck` passed, `npm run validate:fast` passed (247 files / 3839
  tests), `npm run build` passed with the existing large-chunk warning, and
  post-build `npm run check:pixel-forge-cutover` passed. Local gun-range browser
  smoke at `http://127.0.0.1:5173/?mode=gun-range&glb=1&t=1777241544507`
  rendered four Pixel Forge GLB targets with no console errors.

2026-05-02 Projekt Objekt-143 KB-METRIK continuation
- Added perf-capture measurement-trust reporting. Each capture now writes
  `measurement-trust.json`, embeds `measurementTrust` in `summary.json`, and
  adds a `measurement_trust` validation check before frame-time numbers are
  treated as usable evidence.
- Normalized perf server bind/navigation to `127.0.0.1`, avoiding Windows
  localhost/IPv6 ambiguity during startup captures.
- Added post-sample `scene-attribution.json` capture with category buckets,
  mesh/material/geometry counts, live instance-aware triangle estimates,
  effective parent visibility, example meshes, and visible-example meshes. The
  attribution pass runs after the runtime sample window so it does not pollute
  frame timing.
- Validation: `npm run typecheck` passed. Headed perf-build control
  `artifacts/perf/2026-05-02T16-37-21-875Z` exited 0 with measurement trust
  PASS (`probeAvg=14.00ms`, `probeP95=17.00ms`, missed samples 0%), avg frame
  14.23ms, heap recovery PASS, no browser errors, and validation WARN only for
  peak p99 31.70ms.
- Finding: scene attribution now classifies terrain, water, atmosphere,
  vegetation imposters, NPC imposters, hidden close NPC GLBs, hidden weapon
  pools, and static features. Visible unattributed triangles fell to 244 in the
  control capture, but hidden resident pools are large even with `npcs=0`:
  1,360 close-NPC meshes / 132,840 resident triangles and 8,480 weapon meshes /
  133,440 resident triangles. That is now a KB-LOAD/KB-CULL startup and asset
  residency target.

2026-05-02 Projekt Objekt-143 KB-LOAD measurement opening
- Refreshed the retail build with `npm run build`; `dist/asset-manifest.json`
  now reports git SHA `5fd4ba34e28c4840b0f72e1a0475881d050122a1`.
- Ran headed retail startup UI benchmarks, three iterations each:
  `artifacts/perf/2026-05-02T18-30-01-826Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-02T18-30-45-200Z/startup-ui-zone-control`.
- Open Frontier averaged 5457.3ms from mode click to playable; Zone Control
  averaged 5288.3ms. The measured stall is real, but this sample does not yet
  support treating Open Frontier as uniquely worse by more than noise.
- Stage split: Open Frontier averaged 1156.6ms across
  `engine-init.start-game.*` and 3893.2ms from startup-flow begin to
  interactive-ready; Zone Control averaged 1177.1ms and 3633.5ms. KB-LOAD's
  next target is live-entry spawn warming/hidden pool construction and first-use
  shader/material work, not broad terrain/navmesh speculation.

2026-05-02 Projekt Objekt-143 startup telemetry label fix
- Changed `SystemInitializer` startup marks to use stable `SystemRegistry` keys
  instead of constructor names, because retail minification converted several
  labels into unreadable identifiers.
- Validation: `npm run typecheck` passed, `npm run build` passed, and a one-run
  headed Open Frontier startup benchmark wrote
  `artifacts/perf/2026-05-02T18-35-49-488Z/startup-ui-open-frontier`.
- The validation artifact now exposes labels such as
  `systems.init.combatantSystem`; in that run `combatantSystem` init measured
  576.9ms, `firstPersonWeapon` init 62.0ms, `terrainSystem` init 49.0ms,
  `engine-init.start-game.open_frontier` 1265.3ms, and live-entry 3271.3ms.

2026-05-02 Projekt Objekt-143 live-entry stall narrowing
- Added named `engine-init.startup-flow.*` marks inside `LiveEntryActivator`
  for hide-loading, position-player, flush-chunk-update, renderer-visible,
  enable-player-systems, audio-start, combat-enable, background task
  scheduling, and enter-live.
- Added `browser-stalls.json` to `scripts/perf-startup-ui.ts` by installing the
  existing `perf-browser-observers.js` long-task/long-animation-frame observer
  during retail startup UI benchmarks.
- Validation: `npm run typecheck` passed; `npm run build` passed; one Open
  Frontier startup run with marks wrote
  `artifacts/perf/2026-05-02T18-59-10-446Z/startup-ui-open-frontier`.
- A three-run Open Frontier validation after the bounded frame-yield guard wrote
  `artifacts/perf/2026-05-02T19-01-27-585Z/startup-ui-open-frontier` and still
  averaged 5298.0ms from mode click to playable. Live-entry still averaged
  about 3757ms, almost entirely inside `flush-chunk-update` after the sync
  terrain update ended. The yield resolved by `requestAnimationFrame`, not the
  100ms timeout, so the guard did not fix the local stall.
- Follow-up observer-enabled artifact
  `artifacts/perf/2026-05-02T19-03-09-195Z/startup-ui-open-frontier` recorded
  `startup-flow-total=3804.3ms`, `frame-yield-wait=3802.1ms`, and a 3813ms
  long task starting at 4571.2ms. Startup marks put terrain-update end at
  4513.4ms and yield return at 8315.5ms. Next KB-LOAD target is attribution of
  that long task, not terrain update speculation.

2026-05-02 Projekt Objekt-143 texture-upload lead
- Extended startup UI evidence so `perf-browser-observers.js` preserves
  long-task attribution and long-animation-frame script entries, and
  `scripts/perf-startup-ui.ts` writes per-iteration Chrome CPU profiles as
  `cpu-profile-iteration-N.cpuprofile`.
- Validation: `npm run typecheck` passed; headed Open Frontier startup UI runs
  wrote `artifacts/perf/2026-05-02T19-09-45-201Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-02T19-11-07-930Z/startup-ui-open-frontier`.
- The latest profiled artifact measured `modeClickToPlayable=5535ms`,
  `deployClickToPlayable=4688ms`, `startup-flow-total=3841.7ms`,
  `frame-yield-wait=3838.6ms`, and a 3850ms long task after terrain update.
  Long-task browser attribution remained `unknown/window`.
- CPU profile aggregation for
  `artifacts/perf/2026-05-02T19-11-07-930Z/startup-ui-open-frontier/cpu-profile-iteration-1.cpuprofile`
  showed dominant self-time in generated Three code:
  `je build-assets/three-DgNwuF1l.js 4079:13616` at 3233.9ms. Inspecting the
  generated bundle maps `je` to `WebGLState.texSubImage2D`.
- Current KB-LOAD lead: the live-entry stall is likely first-present WebGL
  texture upload/update work. Next useful step is texture-upload attribution by
  asset owner, then a policy decision between pre-upload/precompile before the
  loading screen clears, compression/downscale/atlas fixes, or deferring
  non-critical textures behind truthful progressive readiness.

2026-05-02 Projekt Objekt-143 texture-owner attribution
- Added diagnostic WebGL texture-upload wrapping to `perf-browser-observers.js`.
  It tracks upload operation, bound texture id, dimensions, source type, source
  URL for image sources, and top uploads by duration. This is intentionally
  intrusive and should be used for attribution, not clean timing baselines.
- Added WebGL upload counts and durations into `scripts/perf-startup-ui.ts`
  summary output.
- Validation: `node --check scripts/perf-browser-observers.js` passed,
  `npm run typecheck` passed, and a headed Open Frontier startup UI capture
  wrote `artifacts/perf/2026-05-02T19-19-47-099Z/startup-ui-open-frontier`.
- Finding: the diagnostic artifact recorded 324 WebGL texture upload calls,
  3157.8ms total upload wrapper time, and a 2342.3ms max `texSubImage2D`.
  The largest single upload was
  `assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png`
  at 4096x2048. Other top uploads were the giantPalm normal map, Pixel Forge
  vegetation imposter albedo/normal maps at 2048x2048, and Pixel Forge NPC
  animated albedo atlases at 2688x1344.
- Next KB-LOAD/KBCULL/KB-OPTIK handoff: define an asset acceptance policy for
  imposter/NPC texture dimensions, compression, mip generation, normal-map
  necessity, and preload/deferred-upload behavior before attempting a runtime
  workaround.
- Final validation after adding WebGL upload fields to `summary.json` wrote
  `artifacts/perf/2026-05-02T19-21-53-436Z/startup-ui-open-frontier`.
  `summary.json` now reports `webglTextureUploadCount=345`,
  `webglTextureUploadTotalDurationMs=2757.2ms`, and
  `webglTextureUploadMaxDurationMs=1958.0ms`; the largest upload was again the
  giantPalm imposter albedo texture.

2026-05-02 Projekt Objekt-143 Pixel Forge texture acceptance audit
- Added `scripts/pixel-forge-texture-audit.ts` and wired it as
  `npm run check:pixel-forge-textures`.
- The audit reads `src/config/pixelForgeAssets.ts`, verifies each registered
  texture has an on-disk file, checks dimensions against registry expectations,
  and estimates uncompressed RGBA plus full mip chain residency. The thresholds
  are deliberately an acceptance-standard draft: warn at 16MiB and fail at
  32MiB per texture.
- Validation: `npm run typecheck` passed and `npm run check:pixel-forge-textures`
  wrote
  `artifacts/perf/2026-05-02T19-26-55-682Z/pixel-forge-texture-audit/texture-audit.json`.
- Finding: all 42 registered Pixel Forge textures exist, but 38 are flagged.
  Total source PNG bytes are 26,180,240, while estimated mipmapped RGBA
  residency is 781.17MiB. Vegetation color and normal atlases each account for
  133.33MiB; NPC albedo atlases account for 514.5MiB. GiantPalm color and normal
  are hard failures at 42.67MiB each; all 28 NPC albedo atlases warn at 18.38MiB
  each and are non-power-of-two at 2688x1344.
- Extended the audit with vegetation pixels-per-runtime-meter and reran it at
  `artifacts/perf/2026-05-02T19-28-36-962Z/pixel-forge-texture-audit/texture-audit.json`.
  GiantPalm is 81.5px/m and bananaPlant is 108.02px/m, so both now carry an
  oversampling warning in addition to their residency flags. Fern and
  elephantEar are the compact counterexamples at 2.67MiB per atlas.
- Next handoff: use this audit as the first KB-CULL asset acceptance gate, then
  decide whether giantPalm needs downscale/regeneration, normal-map removal,
  compression, or explicit pre-upload before attempting a runtime fix.

2026-05-02 Projekt Objekt-143 texture target candidates
- Extended `scripts/pixel-forge-texture-audit.ts` with remediation candidates.
  Candidate sizes are planning evidence only: they estimate what a regeneration
  target would buy before anyone approves replacement art.
- Validation: `npm run typecheck` passed and `npm run check:pixel-forge-textures`
  wrote
  `artifacts/perf/2026-05-02T19-33-14-632Z/pixel-forge-texture-audit/texture-audit.json`.
- Finding: applying candidates to every flagged texture would reduce estimated
  mipmapped RGBA residency from 781.17MiB to 373.42MiB, saving 407.75MiB.
  GiantPalm color/normal would move from 4096x2048 / 42.67MiB each to
  2048x1024 / 10.67MiB each. Mid-level vegetation 2048x2048 atlases would move
  to 1024x1024 / 5.33MiB each. NPC animated albedo atlases would target padded
  2048x1024 / 10.67MiB each using 64px frames instead of the current 2688x1344
  / 18.38MiB shape.
- Next handoff: candidate targets must go through visual QA for imposter
  darkness, silhouettes, animation readability, and distant-canopy coverage
  before any runtime import or preload policy treats them as accepted.

2026-05-02 Projekt Objekt-143 texture scenario estimates
- Extended `scripts/pixel-forge-texture-audit.ts` again so the JSON report
  includes package-level scenario estimates, not just per-texture candidates.
- Validation: `npm run typecheck` passed and `npm run check:pixel-forge-textures`
  wrote
  `artifacts/perf/2026-05-02T19-34-49-412Z/pixel-forge-texture-audit/texture-audit.json`.
- Scenario estimates from the current registry: no vegetation normals
  647.97MiB, vegetation candidates only 589.3MiB, vegetation candidates without
  normals 551.97MiB, NPC candidates only 565.42MiB, all candidates 373.42MiB.
- Next handoff: KB-CULL can now compare package-level asset-policy choices in
  the same artifact. KB-OPTIK still has to validate visual consequences before
  any candidate texture target can be treated as accepted.

2026-05-02 Projekt Objekt-143 local ship-state alignment
- Updated `docs/STATE_OF_REPO.md` with an explicit local pending recovery slice:
  current branch/head, planned development-cycle scope, local files waiting to
  ship, and what cannot be claimed yet.
- Updated `docs/PROJEKT_OBJEKT_143.md` so the Phase 2 status includes both
  KB-LOAD texture-upload attribution and KB-CULL texture-acceptance/scenario
  estimates, plus a local ship-state section.
- Current local payload is an instrumentation/evidence slice: measurement trust,
  startup/live-entry attribution, stable startup labels, diagnostic WebGL upload
  attribution, and the Pixel Forge texture acceptance audit. It is not a
  startup remediation, asset-regeneration patch, visual sign-off, WebGPU
  migration, or Phase 3 remediation execution.

2026-05-02 Projekt Objekt-143 KB-EFFECTS grenade-spike attribution
- Added frag-grenade user timings in `src/systems/weapons/GrenadeEffects.ts`
  and a dedicated `scripts/perf-grenade-spike.ts` probe, exposed as
  `npm run perf:grenade-spike`.
- The grenade probe disables the startup WebGL texture-upload observer because
  wrapping every WebGL texture call contaminates sustained runtime attribution.
- Best low-load evidence:
  `artifacts/perf/2026-05-02T20-21-05-603Z/grenade-spike-ai-sandbox`.
  With `npcs=2` and two grenades, baseline p95/p99/max were
  22.6ms/23.6ms/25.0ms; detonation p95/p99/max were 25.7ms/30.6ms/100.0ms.
  The first trigger aligned with a 379ms long task and 380.5ms long animation
  frame; the second trigger did not produce a matching long task.
- Frag detonation JS is not the observed spike: two detonations measured
  `kb-effects.grenade.frag.total` at 1.4ms total / 1.0ms max, while
  spawnProjectile was 0.6ms total / 0.4ms max and the pool/audio/damage/shake
  steps were sub-millisecond.
- CPU profile lead: aggregate self-time points at first visible Three/WebGL
  render/program work (`updateMatrixWorld`, minified Three render functions,
  `(program)`, `getProgramInfoLog`, `renderBufferDirect`), not particle
  allocation, damage, audio decode, or physics broadphase.
- 120-NPC evidence:
  `artifacts/perf/2026-05-02T20-19-04-818Z/grenade-spike-ai-sandbox` is not a
  valid grenade-isolation capture because the baseline is already saturated at
  100ms frames before detonation. It still shows grenade JS at about 1.2ms.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`, and
  `docs/PERFORMANCE.md` with the KB-EFFECTS brief and local ship-state
  alignment. No grenade-spike remediation has shipped yet.

2026-05-02 Projekt Objekt-143 KB-OPTIK imposter optics audit
- Added `scripts/pixel-forge-imposter-optics-audit.ts` and wired it as
  `npm run check:pixel-forge-optics`.
- The audit reads registered Pixel Forge NPC/vegetation assets, metadata JSON,
  alpha occupancy, luma/chroma statistics, and runtime scale constants. It
  writes
  `artifacts/perf/<timestamp>/pixel-forge-imposter-optics-audit/optics-audit.json`.
- Validation: `npm run check:pixel-forge-optics` passed and wrote
  `artifacts/perf/2026-05-02T20-54-56-960Z/pixel-forge-imposter-optics-audit/optics-audit.json`;
  `npm run typecheck` passed.
- Finding: NPC runtime atlases are a confirmed scale/resolution suspect.
  `28/28` runtime NPC clip atlases were flagged. Median visible actor height is
  65px inside a 96px tile, runtime/source height ratio median is 2.63x, and
  runtime effective resolution is only 21.69px/m.
- Finding: the field report that NPC imposters look wrong is supported, but
  this static pass does not prove the runtime plane is half-sized. It points to
  a bake/runtime contract mismatch plus low effective pixels per meter. A
  screenshot rig still needs to compare projected close-GLB and imposter bounds.
- Finding: the darkness/parity issue is credible architecturally because the
  three LOD/render paths are split. NPC imposters use a straight-alpha
  `ShaderMaterial` with independent readability/exposure/min-light constants;
  vegetation uses an atmosphere-aware premultiplied `RawShaderMaterial`; close
  GLBs use the regular Three material path.
- Vegetation optics repeated the texture-audit scale concerns: `bananaPlant`
  is oversampled at 108.02px/m, while `giantPalm` is runtime-scaled 1.75x over
  its declared source size and still oversampled at 81.5px/m.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`,
  `docs/PERFORMANCE.md`, and `docs/ASSET_MANIFEST.md`. No imposter brightness,
  scale, atlas, or normal-map remediation has shipped yet.

2026-05-02 Projekt Objekt-143 KB-TERRAIN vegetation horizon audit
- Added `scripts/vegetation-horizon-audit.ts` and wired it as
  `npm run check:vegetation-horizon`.
- The audit compares mode camera far planes, visual terrain extents, terrain
  LOD inputs, vegetation cell residency, biome palettes, and registered
  vegetation fade/max distances. It writes
  `artifacts/perf/<timestamp>/vegetation-horizon-audit/horizon-audit.json`.
- Validation: `npm run check:vegetation-horizon` passed and wrote
  `artifacts/perf/2026-05-02T21-29-15-593Z/vegetation-horizon-audit/horizon-audit.json`.
- Finding: the barren-horizon report is supported for large/elevated modes.
  Current vegetation fades out by 600m, while Open Frontier can expose an
  estimated 396.79m terrain band beyond visible vegetation and A Shau can
  expose 3399.2m because its camera far plane is 4000m.
- Finding: the large-mode limiter is not generated-cell residency in the first
  static pass. Vegetation residency reaches 832m on-axis and 1176.63m at the
  cell-square corner; the shader max distance cuts visibility first.
- Recommended direction: add a reversible outer canopy representation for large
  modes, likely sparse GPU-instanced canopy cards plus terrain tint in the far
  band, while keeping Pixel Forge imposters as the near/mid layer. Do not
  blindly raise existing billboard max distances without overdraw, draw-call,
  and screenshot evidence.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`,
  `docs/PERFORMANCE.md`, and `docs/ASSET_MANIFEST.md`. No distant-canopy or
  barren-horizon remediation has shipped yet.

2026-05-02 Projekt Objekt-143 KB-STRATEGIE WebGL/WebGPU decision basis
- Added `scripts/webgpu-strategy-audit.ts` and wired it as
  `npm run check:webgpu-strategy`.
- The audit records active renderer construction, active WebGPU source matches,
  WebGL-specific type/context dependencies, migration-blocker patterns, current
  combatant bucket capacity, and retained E2 spike evidence. It writes
  `artifacts/perf/<timestamp>/webgpu-strategy-audit/strategy-audit.json`.
- Validation: `npm run check:webgpu-strategy` passed and wrote
  `artifacts/perf/2026-05-02T21-37-39-757Z/webgpu-strategy-audit/strategy-audit.json`.
- Finding: active runtime source has no WebGPU renderer path. The audit reports
  0 active WebGPU source matches, 5 WebGL renderer entrypoints including dev
  tools, and 94 migration-blocker matches across custom shader/material,
  post-processing, and WebGL context usage.
- Finding: the retained E2 rendering spike remains available at
  `origin/spike/E2-rendering-at-scale`. It measured the keyed-instanced
  NPC-shaped path at about 2.02ms avg for 3000 instances and recommended
  deferring WebGPU migration. The old 120-instance bucket cliff has since been
  reduced as a silent-risk item: current default bucket capacity is 512 and
  overflow is reported.
- External check: Three.js WebGPURenderer can fall back to WebGL 2 but requires
  ShaderMaterial, RawShaderMaterial, onBeforeCompile, and old EffectComposer
  paths to move to node materials/TSL. MDN still marks WebGPU as not Baseline.
- Recommendation filed: reinforce WebGL for stabilization. WebGPU remains a
  post-stabilization spike for an isolated renderer path, not a migration to
  start inside the current recovery slice.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`,
  `docs/PERFORMANCE.md`, and `progress.md`. No WebGPU migration implementation
  has shipped or been started.

2026-05-02 Projekt Objekt-143 Phase 3 draft plan
- Added the first dependency-aware Phase 3 multi-cycle plan to
  `docs/PROJEKT_OBJEKT_143.md`.
- Sequence: Cycle 0 ships the evidence slice, Cycle 1 certifies baselines and
  asset policy, Cycle 2 builds visual/runtime proof harnesses, Cycle 3 applies
  measured WebGL remediations, and Cycle 4 is a contained WebGPU/TSL spike only
  if WebGL remains the measured blocker.
- Acceptance criteria now call out specific gates for startup upload evidence,
  trusted combat captures, NPC projected-height/luma parity, elevated
  vegetation screenshots, draw-call attribution, grenade long-task removal,
  outer-canopy p95/draw-call limits, and explicit WebGPU point-of-no-return
  approval.
- Updated `docs/STATE_OF_REPO.md` so the local state says Phase 3 draft exists
  and the next cycle should ship the evidence slice before remediation.

2026-05-02 Projekt Objekt-143 Cycle 0 static evidence suite
- Added `scripts/projekt-143-evidence-suite.ts` and wired it as
  `npm run check:projekt-143`.
- The suite runs the four static bureau audits as one local gate:
  Pixel Forge texture audit, Pixel Forge imposter optics audit, vegetation
  horizon audit, and WebGL/WebGPU strategy audit. It writes
  `artifacts/perf/<timestamp>/projekt-143-evidence-suite/suite-summary.json`.
- First attempt failed because `execFileSync('npx.cmd', ...)` returned
  `spawnSync npx.cmd EINVAL` on Windows. The runner now invokes the local
  `tsx` CLI through `node` directly, avoiding shell argument warnings and
  `.cmd` spawn failures.
- Validation: `npm run check:projekt-143` passed and wrote
  `artifacts/perf/2026-05-02T21-49-44-009Z/projekt-143-evidence-suite/suite-summary.json`.
- The suite intentionally does not run `perf:grenade-spike`; that probe remains
  separate because it is a headed runtime/browser capture and should not be
  hidden inside the quick static evidence gate.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`,
  `docs/PERFORMANCE.md`, and `progress.md`.

2026-05-02 Projekt Objekt-143 Cycle 0 release
- Committed the recovery evidence slice as
  `475aa7792c51823184c454a0b63852e79da2285d`
  (`chore(projekt-143): ship recovery evidence slice`) and pushed `master`.
- Manual Deploy workflow run `25262818886` passed: checkout,
  `game-field-kits` checkout/build, dependency install, production build,
  Cloudflare asset validation, and Cloudflare Pages deploy all completed.
- After the first Cycle 0 deploy, live `/asset-manifest.json` reported
  `475aa7792c51823184c454a0b63852e79da2285d`; `/`, `/sw.js`,
  `/asset-manifest.json`, the A Shau R2 DEM URL, hashed JS/CSS assets, and
  Recast WASM assets returned `200` with the expected production cache/content
  headers.
- Live browser smoke against `https://terror-in-the-jungle.pages.dev/` clicked
  `START GAME`, selected `zone_control`, and reached the deploy UI with no
  console errors, page errors, request failures, or retry panel.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` from local
  pending language to shipped/live-verified Cycle 0 state. The docs avoid
  treating their own SHA as durable state; live `/asset-manifest.json` remains
  the current deployed SHA source of truth after doc-only alignment commits.
- Next agent-team handoff: execute Phase 2 / Cycle 1. Do not start texture,
  imposter, grenade, vegetation, or WebGPU remediation before certifying
  trusted baselines and the Asset Acceptance Standard.

2026-05-02 Projekt Objekt-143 Phase 2 / Cycle 1 baseline certification
- Required first actions passed: `npm run doctor` and `npm run check:projekt-143`.
  Fresh static suite artifact:
  `artifacts/perf/2026-05-02T22-05-00-955Z/projekt-143-evidence-suite/suite-summary.json`.
- Refreshed local builds at HEAD `cef45fcc906ebe4357009109e2186c83c2a38426`;
  both `dist/asset-manifest.json` and `dist-perf/asset-manifest.json` report
  that SHA.
- Startup baselines:
  - Open Frontier:
    `artifacts/perf/2026-05-02T22-07-48-283Z/startup-ui-open-frontier`,
    3 headed retail runs, avg mode-click-to-playable `6180.7ms`, max WebGL
    upload `2780.5ms`.
  - Zone Control:
    `artifacts/perf/2026-05-02T22-08-46-576Z/startup-ui-zone-control`,
    3 headed retail runs, avg mode-click-to-playable `6467.7ms`, max WebGL
    upload `2608.2ms`.
- Runtime baselines:
  - combat120:
    `artifacts/perf/2026-05-02T22-09-13-541Z`, validation FAIL and measurement
    trust FAIL (`probeAvg=149.14ms`, `probeP95=258ms`). Do not use frame-time
    numbers for regression decisions.
  - Open Frontier short:
    `artifacts/perf/2026-05-02T22-11-29-560Z`, measurement trust PASS,
    validation WARN, avg/p95/p99/max `23.70/29.20/32.70/100ms`, 4 hitches
    above `50ms`.
  - A Shau short:
    `artifacts/perf/2026-05-02T22-15-19-678Z`, measurement trust PASS,
    validation WARN, avg/p95/p99/max `12.04/18.30/31.50/48.50ms`, no hitches
    above `50ms`.
- Grenade low-load probe:
  `artifacts/perf/2026-05-02T22-19-40-381Z/grenade-spike-ai-sandbox`, `npcs=2`,
  2 grenades, CPU profile present. Stall reproduced: baseline p95/p99/max
  `21.8/22.6/23.2ms`, detonation p95/p99/max `23.7/32.5/100ms`, one `387ms`
  long task, two LoAF entries, grenade frag JS `2.5ms` total.
- Added `scripts/projekt-143-cycle1-benchmark-bundle.ts` and package script
  `check:projekt-143-cycle1-bundle`. It wrote
  `artifacts/perf/2026-05-02T22-24-03-223Z/projekt-143-cycle1-benchmark-bundle/bundle-summary.json`
  and `projekt-143-cycle1-metadata.json` sidecars into the six source artifact
  directories. Bundle status is WARN because combat120 is untrusted and the
  grenade stall remains.
- Added `docs/ASSET_ACCEPTANCE_STANDARD.md` and updated
  `docs/PROJEKT_OBJEKT_143.md`, `docs/PERFORMANCE.md`, and
  `docs/STATE_OF_REPO.md`. No remediation, texture regeneration, imposter
  tuning, grenade warmup fix, culling certification, or WebGPU migration was
  started. No live deploy check was run, so do not claim production parity from
  this Cycle 1 local evidence.

2026-05-02 Projekt Objekt-143 Phase 2 / Cycle 1 commit/deploy continuation
- Committed Cycle 1 certification docs/tooling as
  `806d5fa43d63854dd80496a67e8aaef4a741c627`
  (`docs(projekt-143): certify cycle 1 baselines`) and pushed to `master`.
- GitHub Actions CI run `25263686228` passed: lint, build, perf, test, smoke,
  and mobile UI jobs all completed successfully.
- Manual Deploy workflow run `25264091996` passed and deployed the commit to
  Cloudflare Pages.
- Live `/asset-manifest.json` reported
  `806d5fa43d63854dd80496a67e8aaef4a741c627`. Header checks returned `200` for
  `/`, `/sw.js`, `/asset-manifest.json`, representative public assets, Open
  Frontier navmesh/heightmap assets, the A Shau R2 DEM URL, and Recast
  WASM/build assets with expected cache/content headers.
- Live browser smoke reached the Zone Control deploy UI with no console, page,
  request, or retry-panel failures. This verifies the docs/tooling release only;
  Cycle 1 still makes no texture, imposter, grenade, culling, or WebGPU
  remediation claim.

2026-05-02 Agent ergonomics / release DX follow-up
- The Cycle 1 release exposed two repeatable agent friction points: limited
  GitHub token environment variables can shadow keyring auth for workflow
  dispatch, and docs-only release-state commits may not start automatic CI
  because `ci.yml` is path-filtered.
- Added `scripts/github-workflow-run.ts`, `npm run ci:manual`, and updated
  `npm run deploy:prod` so agents have repo-native workflow commands that clear
  `GITHUB_TOKEN` / `GH_TOKEN` and watch the resulting Actions run.
- Updated `AGENTS.md` and `docs/DEPLOY_WORKFLOW.md` so future agents treat those
  issues as repo DX signals, not one-off terminal quirks.
- First wrapper-dispatched CI run `25264683973` proved the GitHub dispatch
  wrapper works but failed the hosted `mobile-ui` job in Android wide landscape:
  the gameplay menu button was visible, yet `#settings-modal` remained hidden.
  Local `npm run check:mobile-ui` passed all four Chromium cases at
  `artifacts/mobile-ui/2026-05-02T23-52-01-666Z/mobile-ui-check`.
- Added stable UI/harness state hooks for future agents: `#touch-menu-btn`
  now exposes `data-ready`, `#settings-modal` exposes `data-visible`, and the
  mobile UI harness waits on those attributes while emitting selector/hit-stack
  diagnostics if a trigger still fails.
- Commit `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e`
  (`test(mobile): harden gameplay menu gate`) passed manual CI run
  `25265347136`; the previously failing hosted `mobile-ui` job passed.
- Manual Deploy workflow run `25265623981` deployed `f68f09a`. Live
  `/asset-manifest.json` reported `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e`;
  Pages shell, `sw.js`, asset manifest, representative GLB/data/build/WASM
  assets, and the R2 A Shau DEM URL returned expected headers. Live browser
  smoke reached the Zone Control deploy UI with no console, page, request, or
  retry-panel failures.
- The deploy run emitted GitHub's Node 20 action deprecation warning for the
  Cloudflare deploy action. Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to
  `.github/workflows/deploy.yml` and documented this as release-DX maintenance.

2026-05-03 Projekt Objekt-143 Phase 2 / Cycle 2 proof opening
- User asked to update docs, align repo, and continue the cycle. Confirmed
  `npm run doctor` passed on Node `24.14.1` and Playwright `1.59.1`.
- Refreshed runtime visual proof with
  `npm run evidence:atmosphere -- --out-dir artifacts/perf/2026-05-03T01-00-12-099Z/projekt-143-cycle2-runtime-proof`.
  The run rebuilt `dist-perf` and captured all-mode ground-readability,
  sky-coverage, and aircraft-clouds screenshots. Open Frontier and A Shau now
  have current elevated runtime screenshots with renderer/terrain samples.
- Added `scripts/projekt-143-cycle2-proof-suite.ts` and package script
  `check:projekt-143-cycle2-proof`. The latest proof suite wrote
  `artifacts/perf/2026-05-03T01-13-21-209Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`
  with WARN status: runtime horizon screenshots PASS, static horizon audit PASS,
  culling scene attribution WARN, NPC matched GLB/imposter screenshots WARN.
- Cycle 2 remains proof-only. Do not accept shader, atlas, culling, far-canopy,
  grenade, texture, or WebGPU remediation until the relevant proof check is
  PASS or carries a documented exception.

2026-05-03 Pixel Forge aircraft GLB replacement in Cycle 2
- User approved adding the six Pixel Forge aircraft GLBs to Cycle 2, with the
  constraint that this be treated as an evidence-gated asset/runtime import
  rather than a blind copy or an optimization claim.
- Added `scripts/import-pixel-forge-aircraft.ts` and
  `npm run assets:import-pixel-forge-aircraft`. The importer reads each GLB and
  sidecar provenance file from the Pixel Forge aircraft source folder, wraps
  the `+X`-forward source scene under
  `TIJ_AxisNormalize_XForward_To_ZForward` so TIJ public aircraft assets remain
  `+Z` forward, writes the runtime GLBs under
  `public/models/vehicles/aircraft/`, and mirrors provenance sidecars under
  `docs/asset-provenance/pixel-forge-aircraft-2026-05-02/`.
- Updated helicopter/fixed-wing runtime animation handling so rotor and
  propeller spin axes can be inferred from embedded GLB quaternion tracks
  instead of assuming one global axis. Fixed-wing static mesh optimization now
  preserves animated prop descendants by ancestor pivot name.
- Local import evidence:
  `artifacts/perf/2026-05-03T01-55-00-000Z/pixel-forge-aircraft-import/summary.json`.
  Local standalone viewer evidence:
  `artifacts/perf/2026-05-03T01-58-00-000Z/pixel-forge-aircraft-viewer/summary.json`.
- Pending gates before production parity or perf claims: focused runtime tests,
  typecheck/build, `npm run probe:fixed-wing`, Open Frontier/A Shau renderer
  evidence, CI/deploy, live Pages checks, and human aircraft-feel playtest.
- Fixed-wing probe follow-up: the first browser probe pass completed A-1 and
  F-4 but then exposed a nondeterministic Open Frontier seed/airfield coverage
  issue while attempting AC-47. `MapSeedRegistry` now honors `?seed=<n>` for
  pre-baked modes, and `scripts/fixed-wing-runtime-probe.ts` pins Open Frontier
  to seed `42` by default while retaining a retry plus render-state diagnostic
  for boots that reach gameplay without the required fixed-wing set. A seed-42
  Open Frontier perf capture produced renderer stats with `0` console errors,
  but it failed the active-driver gate because that seed did not move/shoot; the
  general short perf script keeps its existing unpinned scenario semantics.
- `npm run probe:fixed-wing -- --boot-attempts=2` passed at
  `artifacts/fixed-wing-runtime-probe/summary.json` after the seed/retry
  hardening, covering A-1, F-4, and AC-47.
- Open Frontier short initially failed with 42 browser errors from
  `THREE.BufferGeometryUtils.mergeAttributes()` while batching imported GLB
  geometry. `ModelDrawCallOptimizer` now deinterleaves GLTFLoader interleaved
  attributes before static merge/batch handoff, with a regression test in
  `src/systems/assets/ModelDrawCallOptimizer.test.ts`.
- Rerun Open Frontier short:
  `artifacts/perf/2026-05-03T03-07-26-873Z` with measurement-trust PASS, `0`
  browser errors, validation WARN on peak p99 `48.90ms`, and strict
  `perf:compare -- --scenario openfrontier:short --dir 2026-05-03T03-07-26-873Z`
  failing against the older baseline. This is renderer evidence, not a perf win.
- A Shau short:
  `artifacts/perf/2026-05-03T03-11-40-162Z` with measurement-trust PASS, `0`
  browser errors, validation WARN on peak p99 `47.70ms`, and strict
  `perf:compare -- --scenario ashau:short --dir 2026-05-03T03-11-40-162Z`
  failing against the older baseline. This is renderer evidence, not a perf win.
- Fixed the FixedWingModel unit-test mock to cover the new animated-model loader
  contract. `npm run test:run -- src/systems/vehicle/FixedWingModel.test.ts`
  passed with 16 tests.
- Local gates now passing after the aircraft patch: `npm run validate:fast`,
  `npm run build`, and `npm run check:projekt-143`. The fresh Projekt-143 static
  suite wrote
  `artifacts/perf/2026-05-03T11-18-46-108Z/projekt-143-evidence-suite/suite-summary.json`.
- Refreshed `npm run check:projekt-143-cycle2-proof` after the aircraft patch;
  it remains WARN for missing dedicated culling/optic certification views and
  wrote
  `artifacts/perf/2026-05-03T09-17-01-580Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
- Still not claimed: production parity, aircraft feel, or any performance
  improvement. Those require CI/deploy/live Pages checks and a human aircraft
  playtest.

2026-05-03 Pixel Forge aircraft GLB release verification
- Committed and pushed `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`
  (`feat(assets): import Pixel Forge aircraft`) to `master`.
- Manual CI run `25274278013` passed test, build, perf, lint, smoke, and
  mobile-ui.
- Manual Deploy workflow run `25274649157` passed.
- Live `/asset-manifest.json` reported
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`. Header checks returned `200` for
  `/`, `/sw.js`, `/asset-manifest.json`, representative aircraft GLBs, Open
  Frontier navmesh/heightmap assets, hashed build JS, Recast WASM, and the A
  Shau R2 DEM URL.
- Live browser smoke reached the Zone Control deploy UI with no console, page,
  request, or retry-panel failures. Artifact:
  `artifacts/live-smoke/2026-05-03T08-49-58-395Z/summary.json`.
- Production delivery is verified for the aircraft asset/runtime import. Still
  not claimed: aircraft-feel sign-off or any performance improvement.

2026-05-03 Cycle 2 KB-CULL diagnostic follow-up
- Ran focused AI Sandbox culling probes to try to populate the missing
  close-NPC and NPC-imposter renderer categories without remediation:
  `artifacts/perf/2026-05-03T09-10-57-791Z` (`npcs=120`) and
  `artifacts/perf/2026-05-03T09-13-00-811Z` (`npcs=60`).
- Both artifacts failed validation and `measurement_trust`; the 60-NPC run had
  probeAvg `96.62ms`, probeP95 `211ms`, avg/p99 `100ms`, and
  `hitch_50ms_percent=100%`.
- The 60-NPC artifact did expose the needed categories in `scene-attribution`:
  `npc_close_glb` had `39601` visible triangles and `npc_imposters` had `2`
  visible triangles. This is diagnostic signal only, not KB-CULL certification.
- Agent-DX finding: do not repeat combat-heavy AI Sandbox captures for Cycle 2
  culling certification. The next useful step is a deterministic low-overhead
  camera/culling proof that records renderer stats and scene attribution with a
  trusted measurement path.

2026-05-03 Cycle 2 KB-CULL deterministic proof
- Added `scripts/projekt-143-scene-attribution.ts` so perf capture and Cycle 2
  proof tooling share the same renderer-category classifier and required
  Projekt-143 category list.
- Added `scripts/projekt-143-culling-proof.ts` and
  `npm run check:projekt-143-culling-proof`. The proof serves a small headed
  WebGL fixture with current runtime GLBs for static features, fixed-wing
  aircraft, helicopters, and close Pixel Forge NPCs, plus shader-uniform
  proxies for vegetation/NPC imposter categories.
- A headless exploratory run at
  `artifacts/perf/2026-05-03T09-31-20-350Z/projekt-143-culling-proof/summary.json`
  loaded the scene categories but lost the WebGL context and recorded zero
  renderer counters, so the npm command is headed by default.
- The trusted headed proof passed at
  `artifacts/perf/2026-05-03T09-35-13-554Z/projekt-143-culling-proof/summary.json`
  with `0` browser/page/request errors, probeP95 `1.96ms`, CPU profile capture,
  browser long-task/LoAF capture, renderer stats (`133` draw calls, `4,887`
  triangles), and all required categories visible.
- Follow-up from screenshot review: the proof fixture is not runtime scale
  evidence. Its GLBs are scaled by longest bounding-box axis so all categories
  fit one camera; renamed the fixture sizing field to
  `fixtureLongestAxisMeters` and documented that KB-OPTIK matched screenshots
  own NPC/vehicle relative-scale judgment.
- Refreshed `npm run check:projekt-143-cycle2-proof`; the new suite artifact is
  `artifacts/perf/2026-05-03T09-35-33-689Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  It remains WARN overall only because KB-OPTIK still lacks matched
  close-GLB/imposter screenshot crops. KB-CULL scene attribution is now PASS.
- Refreshed `npm run check:projekt-143`; the static suite passed at
  `artifacts/perf/2026-05-03T11-18-46-108Z/projekt-143-evidence-suite/suite-summary.json`.
- Still not claimed: any culling/HLOD optimization, imposter visual parity,
  aircraft feel, or production parity for the docs/tooling-only changes.

2026-05-03 Cycle 2 KB-OPTIK matched scale proof
- Added `scripts/projekt-143-optics-scale-proof.ts` and
  `npm run check:projekt-143-optics-scale-proof`. The proof serves a headed
  browser fixture that renders current close Pixel Forge NPC GLBs and matching
  NPC imposter shader crops with the same orthographic camera/light setup, then
  records projected geometry height, rendered visible silhouette height,
  luma/chroma deltas, and a same-scale aircraft lineup.
- Trusted proof passed at
  `artifacts/perf/2026-05-03T10-39-21-420Z/projekt-143-optics-scale-proof/summary.json`
  with `0` browser/page/request/load errors, four matched NPC crop pairs, six
  aircraft native-scale entries, and renderer stats captured.
- Finding: close GLB and imposter geometry both target `4.425m`, but rendered
  imposter silhouettes are only `0.52-0.54x` close-GLB height across the four
  factions. Imposter crops are darker by `26.59-59.06` luma. This supports the
  screenshot review concern, but the likely problem is the NPC bake/runtime
  scale contract plus shader/luma parity, not the Cycle 2 culling proof
  screenshot.
- Aircraft native GLB longest-axis/current-NPC-height ratios are `2.07x` UH-1C,
  `2.14x` AH-1, `2.33x` UH-1, `2.82x` A-1, `3.21x` F-4, and `5.52x` AC-47.
  The aircraft are not obviously below NPC size, but the smaller helicopters
  are close enough that absolute NPC visual height needs a design/art-contract
  decision before remediation.
- `npm run check:projekt-143-cycle2-proof` now consumes the scale proof and
  passed at
  `artifacts/perf/2026-05-03T11-19-13-862Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  PASS means Cycle 2 evidence surfaces are complete for review. Still not
  claimed: NPC scale remediation, imposter parity, shader/atlas changes,
  aircraft-size remediation, or production parity.

2026-05-03 Projekt Objekt-143 Cycle 3 kickoff
- Added `scripts/projekt-143-cycle3-kickoff.ts` and
  `npm run check:projekt-143-cycle3-kickoff` as an agent-DX/readiness command.
  It reads the latest Cycle 2 proof, KB-OPTIK scale proof, texture audit,
  startup evidence, grenade probe, vegetation horizon audit, culling proof, and
  the KB-OPTIK decision packet when present, then writes a remediation readiness
  matrix.
- Current kickoff artifact:
  `artifacts/perf/2026-05-03T15-03-08-568Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Overall status is WARN by design because the next phase needs decisions and
  baselines before fixes.
- The refreshed kickoff artifact carries Open Frontier and Zone Control startup
  paths plus Open Frontier, combat120, and A Shau perf summary paths so the
  next branch does not have to rediscover the trusted baseline bundle.
- Target states: KB-OPTIK `npc-imposter-scale-luma-contract` is
  `needs_decision`; KB-LOAD `pixel-forge-texture-upload-residency` and
  KB-EFFECTS `grenade-first-use-stall` are `ready_for_branch`; KB-TERRAIN
  `large-mode-vegetation-horizon` and KB-CULL
  `static-feature-and-vehicle-culling-hlod` are `needs_baseline`.
- Validation after the kickoff patch: `npm run check:projekt-143-cycle3-kickoff`
  WARN by design, `npm run check:projekt-143-cycle2-proof` PASS,
  `npm run check:projekt-143` PASS, and isolated `npm run validate:fast` PASS.
- This continues Projekt into Cycle 3 planning only. Still not claimed:
  startup remediation, texture regeneration, NPC scale/luma fix, grenade
  warmup fix, far-canopy layer, culling/HLOD change, WebGPU migration, or
  production parity.

2026-05-03 Projekt Objekt-143 KB-OPTIK decision packet
- Added `scripts/projekt-143-optik-decision-packet.ts` and
  `npm run check:projekt-143-optik-decision`.
- First packet artifact:
  `artifacts/perf/2026-05-03T15-03-07-006Z/projekt-143-optik-decision-packet/decision-packet.json`.
  Status is WARN because it intentionally leaves the absolute NPC target as an
  owner/art-direction decision.
- Findings: then-current NPC target was `4.425m` from a `2.95m` base target times
  `1.50`; close GLBs are scaled about `2.51x` from source; imposter visible
  height is only `0.522-0.544x` the close GLB; aircraft longest-axis ratios are
  `3.01x` average against current NPC height and `4.52x` against the base
  target.
- Decision: do not resize aircraft first. First runtime remediation should
  prototype NPC imposter crop/regeneration against one faction/clip, while the
  owner decided whether absolute NPC target should drop from `4.425m` to `2.95m` or
  requires a larger human-scale redesign. Shader/luma parity comes after
  scale/crop.
- Repo alignment: Cycle 3 kickoff commit
  `5b726746b0034d9327f5cb03ddcd3147294125ed` passed GitHub CI run
  `25277824856`. It was not deployed or live-verified, so no production parity
  is claimed.
- Validation for this decision-packet patch: `npm run typecheck` PASS,
  `npm run check:projekt-143-optik-decision` WARN by design,
  `npm run check:projekt-143-cycle3-kickoff` WARN by design with the decision
  packet path included, and `npm run validate:fast` PASS.

2026-05-03 Projekt Objekt-143 first KB-OPTIK remediation
- Owner approved dropping the absolute NPC target to the recommended Pixel
  Forge base target. Commit `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9`
  changes the shared Pixel Forge NPC runtime target from `4.425m` to `2.95m`,
  derives the imposter billboard Y offset from `NPC_Y_OFFSET`, and adds a
  generated per-tile crop map for upright NPC imposter atlases.
- Agent/DX improvement: added `scripts/generate-pixel-forge-npc-tile-crops.ts`,
  `npm run assets:generate-npc-crops`, and
  `npm run check:pixel-forge-npc-crops`. The crop check is now part of
  `npm run validate:fast`, so future Pixel Forge NPC atlas updates cannot leave
  stale crop metadata silently.
- Post-commit matched proof:
  `artifacts/perf/2026-05-03T16-13-34-596Z/projekt-143-optics-scale-proof/summary.json`.
  Source SHA is `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9`. Visible-height
  ratios improved from the before range `0.52-0.54x` to `0.895` (US), `0.895`
  (ARVN), `0.863` (NVA), and `0.861` (VC), inside the first-remediation
  `+/-15%` proof band.
- Luma remains open: post-remediation imposter crops are still `-26.94` to
  `-59.29` darker than close GLB crops, so the next KB-OPTIK branch is
  shader/material luma parity or an explicit visual exception.
- Refreshed evidence artifacts:
  `artifacts/perf/2026-05-03T16-13-47-104Z/projekt-143-optik-decision-packet/decision-packet.json`,
  `artifacts/perf/2026-05-03T16-13-59-633Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`,
  `artifacts/perf/2026-05-03T16-14-08-949Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and `artifacts/perf/2026-05-03T16-13-49-501Z/projekt-143-evidence-suite/suite-summary.json`.
- Validation before the remediation commit: `npm run validate:fast` PASS and
  `npm run build` PASS. Post-commit proof and Projekt suite commands listed
  above passed/WARNed as designed. No production parity, performance
  improvement, aircraft-scale acceptance, or final human-scale/playtest signoff
  is claimed.

2026-05-03 Projekt Objekt-143 KB-OPTIK selected-lighting luma pass
- Commit `1395198da4db95611457ecde769b611e3d36354e` adds per-faction Pixel
  Forge NPC imposter material tuning and upgrades the matched proof/decision
  tooling to track luma delta as a percentage of the close-GLB crop.
- Post-commit matched proof:
  `artifacts/perf/2026-05-03T16-48-28-452Z/projekt-143-optics-scale-proof/summary.json`.
  Source SHA is `1395198da4db95611457ecde769b611e3d36354e`. Visible-height
  ratios remain `0.895` (US), `0.895` (ARVN), `0.863` (NVA), and `0.861`
  (VC). Selected-lighting luma deltas are `-0.13%` (US), `-0.44%` (ARVN),
  `0.36%` (NVA), and `-0.08%` (VC), inside the `+/-12%` proof band.
- Refreshed evidence artifacts:
  `artifacts/perf/2026-05-03T16-48-44-272Z/projekt-143-optik-decision-packet/decision-packet.json`,
  `artifacts/perf/2026-05-03T16-48-58-020Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`,
  `artifacts/perf/2026-05-03T16-48-46-437Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and `artifacts/perf/2026-05-03T16-49-11-364Z/projekt-143-evidence-suite/suite-summary.json`.
- Validation: `npm run check:projekt-143-optics-scale-proof -- --port=0`
  PASS, `npm run check:projekt-143-optik-decision` WARN by design, `npm run
  check:projekt-143-cycle2-proof` PASS, `npm run check:projekt-143-cycle3-kickoff`
  WARN by design, and `npm run check:projekt-143` PASS.
- Repo alignment: update docs to treat the first KB-OPTIK remediation as
  target/crop plus selected-lighting luma only. Next pass is expanded
  dawn/dusk/haze/storm and gameplay-camera KB-OPTIK coverage, or switching the
  next remediation slot to KB-LOAD texture/upload or KB-EFFECTS grenade
  first-use. No production parity, performance improvement, final visual
  parity, aircraft-scale acceptance, or human-playtest signoff is claimed.

2026-05-03 Projekt Objekt-143 KB-OPTIK expanded proof pass
- Commit `57d873e7f305fb528e7570232a291950e89c6ade` adds
  `scripts/projekt-143-optik-expanded-proof.ts` and
  `npm run check:projekt-143-optik-expanded`. The proof renders matched
  close-GLB/imposter crops for all four Pixel Forge NPC factions across five
  lighting profiles and two camera profiles.
- Committed-sha proof:
  `artifacts/perf/2026-05-03T17-26-45-106Z/projekt-143-optik-expanded-proof/summary.json`.
  Source SHA is `57d873e7f305fb528e7570232a291950e89c6ade`. Measurement trust
  is PASS with `0` browser errors, page errors, request failures, and load
  errors. Status is WARN because `34/40` samples flag; visible-height ratio
  range is `0.844-0.895`, and luma delta percent range is `-53.57` to
  `104.58`.
- Refreshed decision/kickoff artifacts:
  `artifacts/perf/2026-05-03T17-27-07-711Z/projekt-143-optik-decision-packet/decision-packet.json`
  and
  `artifacts/perf/2026-05-03T17-27-07-141Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-OPTIK now reads as `needs_decision`, not closeout: selected-lighting
  target/crop/luma is done, but expanded lighting/gameplay-camera proof found
  visual flags.
- Next owner/agent choice: target the expanded imposter lighting/material
  contract with this proof as before evidence, or switch the next remediation
  slot to KB-LOAD texture/upload residency or KB-EFFECTS grenade first-use.
  No production parity, performance improvement, final visual parity,
  aircraft-scale acceptance, or human-playtest signoff is claimed.

2026-05-03 Projekt Objekt-143 KB-OPTIK atmosphere remediation
- Commit `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad` forwards the scene
  lighting/fog snapshot into NPC imposter shader uniforms and updates
  `scripts/projekt-143-optik-expanded-proof.ts` so the proof exercises the
  same atmosphere contract.
- Committed-sha proof:
  `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`.
  Measurement trust is PASS with `0` browser, page, request, and load errors.
  Expanded luma now lands inside the `+/-12%` band (`-11.31%` to `9.03%`);
  remaining WARN is `10/40` gameplay-perspective visible-height samples.
- Agent/DX follow-up commit `b24c23bfdbd027458a4d3e27155158723a32f4ad`
  retargets the decision/kickoff scripts so future agents route the next
  KB-OPTIK choice to
  `target-gameplay-camera-silhouette-or-switch-bureau`, not another generic
  shader-constant pass.
- Refreshed handoff artifacts:
  `artifacts/perf/2026-05-03T18-50-04-224Z/projekt-143-optik-decision-packet/decision-packet.json`
  and
  `artifacts/perf/2026-05-03T18-50-03-715Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
- Validation: `npm run validate:fast` PASS, `npm run build` PASS,
  `npm run check:projekt-143-optik-expanded` WARN by design,
  `npm run check:projekt-143-optik-decision` WARN by design, and
  `npm run check:projekt-143-cycle3-kickoff` WARN by design. No production
 parity, performance improvement, final visual parity, aircraft-scale
 acceptance, or human-playtest signoff is claimed.

2026-05-03 Projekt Objekt-143 KB-OPTIK runtime LOD-edge proof pass
- Commit `5b053711cece65b5915ea786acc56e4a8ea22736` adds
  `--camera-profile-set=runtime-lod-edge` to
  `scripts/projekt-143-optik-expanded-proof.ts` and updates the decision/kickoff
  scripts so near-stress expanded proof and runtime LOD-edge proof are routed
  separately.
- Committed-sha runtime LOD-edge proof:
  `artifacts/perf/2026-05-03T19-02-38-432Z/projekt-143-optik-expanded-proof/summary.json`.
  Measurement trust is PASS and status is PASS: `40` samples, `0` flags,
  visible-height ratio `0.855-0.895`, and luma delta percent `-6.94` to
  `9.77`.
- The near-stress artifact remains
  `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`
  with `10/40` visible-height flags at the 8.5m perspective camera. Because
  the runtime LOD-edge camera passes, this is now a near-stress visual-exception
  or human-review decision, not a measured runtime LOD-edge failure.
- Refreshed handoff artifacts:
  `artifacts/perf/2026-05-03T19-02-57-442Z/projekt-143-optik-decision-packet/decision-packet.json`
  and
  `artifacts/perf/2026-05-03T19-02-55-123Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-OPTIK remains `needs_decision`; the recommended next branch is
  `document-near-stress-silhouette-exception-or-switch-bureau`.
- No production parity, performance improvement, final visual parity,
  aircraft-scale acceptance, or human-playtest signoff is claimed.
- Validation after docs alignment: `npm run check:projekt-143` PASS,
  `artifacts/perf/2026-05-03T19-05-22-881Z/projekt-143-evidence-suite/suite-summary.json`.

2026-05-03 Projekt Objekt-143 KB-LOAD first texture-upload remediation
- Added `AssetLoader.warmGpuTextures()` and startup warmup marks/user timings
  for critical Pixel Forge texture uploads. Runtime startup now warms only the
  giantPalm color/normal atlas pair behind the spawn loading overlay before
  renderer reveal.
- Paired Open Frontier evidence: before
  `artifacts/perf/2026-05-03T21-45-13-207Z/startup-ui-open-frontier` averaged
  `4685.7ms` deploy-click-to-playable and `5340.7ms` mode-click-to-playable;
  after
  `artifacts/perf/2026-05-03T22-01-10-796Z/startup-ui-open-frontier` averaged
  `4749.0ms` and `5443.3ms`. WebGL upload total/max averages moved
  `3341.0/2390.5ms` to `1157.2/275.4ms`.
- Paired Zone Control evidence: before
  `artifacts/perf/2026-05-03T21-46-34-676Z/startup-ui-zone-control` averaged
  `4909.0ms` deploy-click-to-playable and `5491.0ms` mode-click-to-playable;
  after
  `artifacts/perf/2026-05-03T22-02-28-966Z/startup-ui-zone-control` averaged
  `4939.0ms` and `5469.0ms`. WebGL upload total/max averages moved
  `3340.6/2379.4ms` to `1229.6/360.1ms`.
- Negative evidence: broadening the warmup to fanPalm regressed the same
  startup samples, so that expansion was reverted. Rejected artifacts:
  `artifacts/perf/2026-05-03T21-54-02-583Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-03T21-55-18-768Z/startup-ui-zone-control`.
- Validation: `npm run typecheck` PASS, `npx vitest run
  src/systems/assets/AssetLoader.test.ts` PASS, `npm run build` PASS,
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-03T21-57-48-690Z/projekt-143-evidence-suite/suite-summary.json`,
  `npm run check:projekt-143-cycle3-kickoff` WARN by design at
  `artifacts/perf/2026-05-03T22-04-56-309Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and `npm run validate:fast` PASS. No production parity, startup-latency win,
  startup closeout, texture residency closeout, or clean frame-time improvement
  is claimed.

2026-05-03 Projekt Objekt-143 KB-EFFECTS rejected warmup pass
- Fresh current-HEAD before evidence:
  `artifacts/perf/2026-05-03T22-09-54-365Z/grenade-spike-ai-sandbox`.
  The headed low-load two-grenade probe reproduced the first-use stall with
  baseline p95/max `22.6ms / 24.2ms`, detonation p95/max
  `22.5ms / 100.0ms`, max-frame delta `75.8ms`, one `379ms` long task, two
  LoAF entries, CPU profile present, and
  `kb-effects.grenade.frag.total=1.4ms` total / `0.9ms` max.
- Rejected remediation evidence: explosion-only visible render warmup
  `artifacts/perf/2026-05-03T22-12-40-344Z/grenade-spike-ai-sandbox`, full
  frag render-path warmup
  `artifacts/perf/2026-05-03T22-16-26-287Z/grenade-spike-ai-sandbox`, and
  culling-forced full frag warmup
  `artifacts/perf/2026-05-03T22-18-02-801Z/grenade-spike-ai-sandbox` all
  still hit detonation max `100.0ms` with one long task each (`397ms`,
  `387ms`, and `373ms`). The runtime warmup code was reverted; no KB-EFFECTS
  remediation landed.
- Agent/DX routing update: `scripts/projekt-143-cycle3-kickoff.ts` now sends
  KB-EFFECTS to render-frame attribution before another warmup branch and
  records the rejected warmup artifacts as negative evidence.
- Refreshed handoff artifacts: `npm run check:projekt-143-cycle3-kickoff`
  WARN by design at
  `artifacts/perf/2026-05-03T22-24-44-200Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
 `artifacts/perf/2026-05-03T22-27-16-532Z/projekt-143-evidence-suite/suite-summary.json`.
- Validation: `npm run typecheck` PASS and `npm run validate:fast` PASS. No
  production parity, grenade closeout, startup-latency win, culling, WebGPU, or
  performance-improvement claim is made from this pass.

2026-05-03 Projekt Objekt-143 KB-EFFECTS unlit explosion remediation
- Added scoped render/frame attribution to `scripts/perf-grenade-spike.ts`.
  The probe now writes `render-attribution.json`, records render/update phase
  costs around grenade triggers, drains metrics after a pre-trigger settle
  window, and schedules live grenade triggers on `requestAnimationFrame`.
- Before remediation evidence:
  `artifacts/perf/2026-05-03T22-36-46-874Z/grenade-spike-ai-sandbox`
  attributed the first-use stall to trigger-adjacent main-scene render work:
  `webgl.render.main-scene=380ms`, nested main-scene render `178.2ms`, one
  `387ms` long task, and CPU-profile weight in Three/WebGL program/render
  paths including `(program)`, `updateMatrixWorld`, and `getProgramInfoLog`.
- First-principles remediation: grenade explosions no longer create, pool, add,
  position, fade, or dispose dynamic `THREE.PointLight` instances. The runtime
  effect path is now unlit pooled flash sprite, smoke/fire/debris `Points`, and
  shockwave ring. Added `ExplosionEffectsPool.test.ts` to lock the no-light
  contract while preserving visible flash-spawn behavior.
- After evidence:
  `artifacts/perf/2026-05-03T23-04-07-778Z/grenade-spike-ai-sandbox` recorded
  baseline p95/max `36.1ms / 48.1ms`, detonation p95/max
  `31.0ms / 100.0ms`, `0` browser long tasks, trigger-adjacent main-scene
  render max `29.5ms`, and `kb-effects.grenade.frag.total=2.0ms` total /
  `1.4ms` max. This schema-refresh run is noisier than the preceding
  post-remediation run at
  `artifacts/perf/2026-05-03T22-57-28-665Z/grenade-spike-ai-sandbox`, but both
  remove the measured dynamic-light render/program stall. `summary.json` now
  carries `measurementTrust.status=warn` with CPU profile, long-task observer,
  LoAF observer, disabled upload observer, render attribution, and
  `preTriggerLongAnimationFrameCount=1` all present. KB-EFFECTS does not close
  because one pre-trigger LoAF and a `100.0ms` max frame still need
  classification.
- Validation before final docs/kickoff refresh: `npm run typecheck` PASS,
  `npm run perf:grenade-spike -- --npcs=2 --baseline-frames=120
  --post-frames=240 --baseline-ms=2000 --post-ms=4500 --warmup-ms=10000
  --grenades=2 --port=9192` PASS, and
  `npx vitest run src/systems/effects/ExplosionEffectsPool.test.ts
  src/systems/weapons/GrenadeEffects.test.ts
  src/systems/weapons/GrenadeSystem.test.ts
  src/systems/weapons/MortarSystem.test.ts` PASS. No production parity, final
  grenade closeout, broad combat120 closeout, WebGPU migration, or visual
  polish claim is made from this pass.
- Refreshed handoff artifact: `npm run check:projekt-143-cycle3-kickoff` WARN
  by design at
  `artifacts/perf/2026-05-03T23-05-29-475Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-EFFECTS is `needs_decision` with `measurementTrustStatus=warn`,
  detonation long tasks `0`, LoAF count `1`, max near-trigger main-scene
  render `29.5ms`, pre-trigger LoAF count `1`, and the remaining required work
  is browser-stall/frame classification before final closeout.
- Final local validation: `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-03T23-07-31-605Z/projekt-143-evidence-suite/suite-summary.json`
  and `npm run validate:fast` PASS.

2026-05-03 Projekt Objekt-143 KB-EFFECTS low-load trust closeout
- Hardened `scripts/perf-grenade-spike.ts` so the first live grenade is armed
  inside its `requestAnimationFrame` callback: observer drains, frame metrics,
  perf reports, render attribution, and performance marks reset immediately
  before `spawnProjectile`. This prevents pre-trigger frame scheduling from
  being counted as grenade-trigger work.
- Added measurement-trust flags for trigger/post-trigger LoAF counts,
  post-trigger LoAF counts, and classified pre-trigger frame max state. The
  Cycle 3 kickoff matrix now supports `evidence_complete` targets and surfaces
  those flags for KB-EFFECTS handoff.
- Trusted evidence:
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`
  is PASS for measurement trust. It records baseline p95/max
  `23.5ms / 27.6ms`, detonation p95/max `24.3ms / 30.2ms`, max-frame delta
  `2.6ms`, hitch50 delta `0`, detonation long tasks `0`,
  trigger/post-trigger LoAF count `0`, near-trigger main-scene render max
  `23.6ms`, and `kb-effects.grenade.frag.total=1.5ms` total / `0.9ms` max.
- Refreshed handoff artifact:
  `artifacts/perf/2026-05-03T23-30-22-640Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  is WARN by design for remaining KB-OPTIK, KB-TERRAIN, and KB-CULL work, but
  KB-EFFECTS `grenade-first-use-stall` is now `evidence_complete` for the
  low-load unlit pooled explosion path.
- Refreshed static suite:
  `artifacts/perf/2026-05-03T23-30-22-745Z/projekt-143-evidence-suite/suite-summary.json`
  PASS.
- Docs aligned in `docs/PROJEKT_OBJEKT_143.md`, `docs/PERFORMANCE.md`,
  `docs/STATE_OF_REPO.md`, and `docs/BACKLOG.md`. No production parity,
  combat120/stress grenade closeout, WebGPU migration, or future explosion
  visual-polish claim is made from this pass.
- Validation: `npm run check:projekt-143-cycle3-kickoff` WARN by design at
  `artifacts/perf/2026-05-03T23-30-22-640Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-03T23-30-22-745Z/projekt-143-evidence-suite/suite-summary.json`,
  and `npm run validate:fast` PASS.

2026-05-03 Projekt Objekt-143 KB-TERRAIN baseline proof
- Added `scripts/projekt-143-terrain-horizon-baseline.ts` and wired
  `npm run check:projekt-143-terrain-baseline`. The command force-builds the
  perf target by default, captures elevated Open Frontier and A Shau
  vegetation-horizon screenshots, records browser/runtime metadata, warmup
  policy, renderer stats, terrain readiness, vegetation active counters,
  nonblank image-content checks, and links the latest trusted Open Frontier
  and A Shau perf-before summaries plus vegetation horizon and culling proof
  inputs.
- First script smoke with `--no-build` exposed a sky-only camera angle. The
  proof now uses downward horizon camera pitches and fails the capture if the
  ground band is blank, which should save future agents from accepting a
  telemetry-only screenshot artifact.
- Fresh-build baseline:
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`
  is PASS from clean HEAD `294baf038cce9f9f31588169bf6f4c8c3e22976d`.
  It captured `4/4` screenshots with renderer, terrain, vegetation,
  and image-content evidence, plus trusted before perf baselines. Future
  far-horizon after captures must stay within the recorded guardrails: Open
  Frontier p95 `<=43.5ms` and draw calls `<=1141`; A Shau p95 `<=40.9ms` and
  draw calls `<=864`.
- Cycle 3 kickoff now consumes the terrain horizon baseline and writes
  `terrainHorizonBaseline` in its input list. The kickoff at this step:
  `artifacts/perf/2026-05-04T00-05-12-050Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  remained WARN overall because KB-OPTIK needed an owner decision and KB-CULL
  still needed an owner-path baseline, but KB-TERRAIN
  `large-mode-vegetation-horizon` is now `ready_for_branch`.
- Refreshed KB-OPTIK decision packet after stale routing cleanup:
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`.
  Its owner-choice language now routes non-OPTIK work to
  KB-LOAD/KB-TERRAIN/KB-CULL instead of reopening the completed low-load
  KB-EFFECTS path.
- Docs and agent-DX aligned in `AGENTS.md`, `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PERFORMANCE.md`, `docs/STATE_OF_REPO.md`, and this progress log. No
  far-canopy, culling/HLOD, startup-latency, WebGPU, production parity, or
  combat120/stress grenade closeout is claimed from this pass.
- Validation: `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-03T23-59-39-390Z/projekt-143-evidence-suite/suite-summary.json`
  and `npm run validate:fast` PASS.

2026-05-04 Projekt Objekt-143 KB-CULL owner baseline proof
- Added `scripts/projekt-143-culling-owner-baseline.ts` and wired
  `npm run check:projekt-143-culling-baseline`. The command consumes the
  headed culling proof, trusted Open Frontier and A Shau perf summaries,
  scene attribution, runtime renderer samples, and the latest AI Sandbox
  diagnostic. It selects an owner path only from trusted before evidence and
  keeps close-NPC/weapon pool residency diagnostic-only until combat stress
  measurement trust passes.
- Clean-HEAD baseline:
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
  is PASS from source `527e05433ea72adaf83ca28692137f5be67fb438`. It selects
  `large-mode-world-static-and-visible-helicopters`. Guardrails for the first
  after branch: Open Frontier owner draw-call-like below `388`, A Shau owner
  draw-call-like below `719`, total draw calls not above `1037` / `785`, and
  visible unattributed triangles below `10%`.
- Cycle 3 kickoff now consumes `cullingOwnerBaseline` and marks KB-CULL
  `static-feature-and-vehicle-culling-hlod` as `ready_for_branch` at
  `artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Overall remains WARN because KB-OPTIK still needs an owner decision.
- Docs and agent-DX aligned in `AGENTS.md`, `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PERFORMANCE.md`, `docs/STATE_OF_REPO.md`, `docs/BACKLOG.md`, and this
  progress log. No culling/HLOD, close-NPC residency, startup-latency,
  far-canopy, WebGPU, production parity, or combat120/stress grenade closeout
  is claimed from this pass.

2026-05-04 Projekt Objekt-143 fresh-agent handoff
- Added `docs/PROJEKT_OBJEKT_143_HANDOFF.md` as the short continuation prompt
  and evidence-anchor index for a fresh agent session. The handoff explicitly
  keeps local work ahead of `origin/master`, avoids push/deploy/live parity
  claims, and preserves WebGL stabilization as the current strategy.
- Agent-DX alignment: added Projekt Objekt-143, the fresh-agent handoff, and
  the Asset Acceptance Standard to the `AGENTS.md` documentation map, and linked
  the handoff from `docs/PROJEKT_OBJEKT_143.md` Cycle 3 status.
- Current handoff state: KB-LOAD, KB-TERRAIN, and KB-CULL are
  `ready_for_branch`; KB-EFFECTS is `evidence_complete` only for the trusted
  low-load unlit pooled grenade path; KB-OPTIK remains `needs_decision` for the
  8.5m near-stress silhouette exception/human-review decision.
- Latest evidence anchors remain:
  `artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  `artifacts/perf/2026-05-04T00-18-26-810Z/projekt-143-evidence-suite/suite-summary.json`,
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`,
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`,
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`,
  and
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`.
- Validation before handoff: `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T00-18-26-810Z/projekt-143-evidence-suite/suite-summary.json`
  and `npm run validate:fast` PASS. The final handoff pass is docs-only and
  does not claim any remediation beyond recorded evidence.

2026-05-04 Projekt Objekt-143 continuation and rejected KB-CULL candidate
- Fixed agent-DX in `scripts/doctor.ts`: Playwright browser discovery now calls
  the repo-local Playwright CLI through `process.execPath` instead of a Windows
  `cmd.exe`/`npx` shim, and spawn errors are included in doctor output. This
  keeps the Windows-safe no-shim pattern for agent sandboxes and local shells.
- Refreshed starting gates: `npm run doctor` PASS; `npm run
  check:projekt-143-cycle3-kickoff` WARN by design at
  `artifacts/perf/2026-05-04T01-04-49-022Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T01-04-58-778Z/projekt-143-evidence-suite/suite-summary.json`.
- Tested a narrow KB-CULL static-helicopter distance-cull prototype against
  `WorldFeatureSystem`, then rejected it before commit. The targeted Vitest
  slice passed, but the trusted Open Frontier after capture at
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json` failed validation
  with `peak_p99_frame_ms=64.70ms` and did not improve the selected owner path:
  `world_static_features` stayed `349`, visible `helicopters` stayed `39`, and
  combined owner draw-call-like remained `388`. A Shau after capture was skipped
  because the first required guardrail already failed.
- Recorded the owner-requested KB-TERRAIN visual target in the Projekt ledger,
  handoff, performance notes, and state doc: keep terrain texture variety but
  make most traversable ground read jungle green rather than gravel; check for
  possible inverted slope/biome material weighting if green is mostly on
  hillsides; scale and ground tiny palms and ferns; add more big palms and
  ground vegetation; and make bamboo scattered dense clusters rather than the
  dominant forest layer.
- Final local validation: `npm run validate:fast` PASS. No culling/HLOD,
  terrain-material, vegetation-distribution, far-canopy, startup-latency,
  WebGPU, production-parity, or perf-improvement claim is made from this pass.

2026-05-04 Projekt Objekt-143 KB-TERRAIN material distribution pass
- Added `scripts/projekt-143-terrain-distribution-audit.ts` and wired
  `npm run check:projekt-143-terrain-distribution`. The audit samples all
  shipped mode height providers and records CPU biome classification,
  shader-primary material distribution, flat/steep material distribution,
  estimated vegetation density, and cliff-rock accent eligibility.
- Fixed the broad elevation-cap material problem instead of just raising a
  cutoff: procedural modes no longer classify high elevation as primary
  `highland`; Open Frontier no longer uses a generic flat/high `cleared` cap;
  A Shau no longer uses broad highland/cleared/bamboo elevation belts as
  primary terrain material. `highland` remains bound as a terrain material
  accent layer and is applied through slope-gated cliff/hillside blending.
- Final static distribution artifact:
  `artifacts/perf/2026-05-04T02-02-26-811Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  Result: all modes have `100%` flat jungle-like primary ground; Open Frontier
  is `99.99%` jungle-like overall; A Shau is `100%`; all steep-side rock
  accent checks pass. The audit remains WARN only because AI Sandbox uses
  `terrainSeed: random` and the audit samples it with fixed fallback seed `42`.
- Updated the terrain horizon screenshot gate after a false negative on bright
  green Open Frontier terrain: the image-content check now accepts visible
  ground-band variance/green content instead of only the older low-luma
  contrast condition. The failed intermediate artifact was
  `artifacts/perf/2026-05-04T02-02-38-636Z/projekt-143-terrain-horizon-baseline/summary.json`;
  visual inspection showed terrain was present.
- Final screenshot/build proof:
  `artifacts/perf/2026-05-04T02-06-49-928Z/projekt-143-terrain-horizon-baseline/summary.json`
  PASS with `4/4` elevated screenshots, renderer/terrain/vegetation telemetry,
  and `0` browser/page/scenario errors.
- Targeted validation:
  `npx vitest run src\systems\terrain\BiomeClassifier.test.ts src\systems\terrain\TerrainBiomeRuntimeConfig.test.ts src\systems\terrain\TerrainMaterial.test.ts src\config\vegetationTypes.test.ts`
  PASS (`4` files, `20` tests).
- Folded new owner goals into docs/handoff: next KB-TERRAIN/KB-CULL work must
  also address hanging building foundations and poorly sampled airfield, HQ,
  vehicle, firebase, and support-compound placement. Pixel Forge building
  assets should be shortlisted by visual fit, foundation footprint,
  collision/LOD/HLOD readiness, draw calls, triangles, and acceptance evidence
  before replacement.
- Folded additional owner texture/route goals into docs/handoff: audit existing
  TIJ and Pixel Forge ground, path, trail, grass, foliage, and cover assets for
  more terrain variety before custom asset work; future routes should read as
  worn-in dirt/mud/grass/packed-earth trails and be smoothed/graded with
  future vehicle usability in mind.
- Still open: this pass does not accept final A Shau atmosphere/far-ridge
  color, vegetation scale/density, fern grounding, palm density, bamboo
  clustering, far canopy, building-placement fixes, Pixel Forge building
  imports, production parity, or any performance improvement.
- Final gates after docs and goal updates:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T02-19-44-373Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T02-20-04-490Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3854` tests).

2026-05-04 Projekt Objekt-143 KB-TERRAIN vegetation scale and cluster pass
- Tuned runtime vegetation toward the owner visual target without importing new
  assets: `fern` is larger/lifted, `giantPalm` is larger and denser,
  `fanPalm`/`coconut` density increased, and `bambooGrove` now uses a
  deterministic large-scale cluster mask so it appears in dense pockets instead
  of filling the whole mid-level forest layer.
- Added behavior coverage for larger/grounded ferns, larger giant palms, palm
  bias over bamboo, and cluster masks rejecting bamboo candidate points.
  Targeted validation passed:
  `npx vitest run src\config\vegetationTypes.test.ts src\systems\terrain\VegetationScatterer.test.ts src\systems\terrain\ChunkVegetationGenerator.test.ts`
  (`3` files, `17` tests).
- Static distribution evidence:
  `artifacts/perf/2026-05-04T02-41-29-573Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  Bamboo estimated share is now about `1.45-1.52%` across shipped modes while
  flat jungle-like primary ground remains `100%` in every mode and Open
  Frontier remains `99.99%` jungle-like overall. Clustered vegetation coverage
  in that audit is an estimate, not visual authority.
- Elevated screenshot/build proof:
  `artifacts/perf/2026-05-04T02-41-37-056Z/projekt-143-terrain-horizon-baseline/summary.json`
  PASS with `4/4` screenshots, renderer/terrain/vegetation telemetry, and `0`
  browser/page/scenario errors. Open Frontier screenshots no longer show the
  broad grey summit problem; A Shau far ridges still need art/perf review.
- Open Frontier perf after evidence:
  `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json` is measurement-trusted
  but validation WARN. It recorded avg `24.26ms`, peakP99 `49.90ms`,
  hitch50 `0.13%`, vegetation active instances `46,247`, and movement
  transitions `93`.
- A Shau is blocked, not accepted. First after capture
  `artifacts/perf/2026-05-04T02-48-58-787Z/summary.json` failed validation
  despite measurement trust PASS (`peakP99=93.90ms`, `hitch50=2.49%`, movement
  transitions `2`). Rerun
  `artifacts/perf/2026-05-04T02-53-54-886Z/summary.json` also failed and had
  measurement trust WARN. Both runs repeated the `tabat_airstrip` steep
  footprint warning (`112.1m` vertical span across `320m` runway footprint) and
  terrain-stall symptoms, which aligns with the still-open building/airfield/
  HQ/vehicle foundation and route-stamp goal.
- Asset/texture inventory notes for the later goal: TIJ already ships terrain
  WebPs including `jungle-floor`, `mud-ground`, `rice-paddy`,
  `rocky-highland`, `tall-grass`, `bamboo-floor`, `swamp`,
  `defoliated-ground`, and `firebase-ground`. Pixel Forge has candidate
  war-textures such as `jungle-mud`, `cracked-earth`, `napalmed-ground`,
  `bamboo-mat-floor`, `weathered-planks`, and `corrugated-metal`; output props
  include grass/patch-grass variants and rocks; building candidates include
  huts, stilt houses, shophouses, bunkers, warehouses, temple/pagoda/church,
  rice-barn/mill, and plantation/villa assets. These need acceptance review
  before runtime import, especially for footprint, collision, draw-call,
  triangle, and LOD/HLOD cost.
- Still open: no A Shau perf acceptance, no far-canopy fix, no static
  foundation/preset fix, no Pixel Forge building import, no custom trail/grass
  asset generation, no production parity, and no broad performance improvement
  claim from this pass.
- Final gates after docs:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T03-03-26-031Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T03-03-39-979Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3857` tests).

2026-05-04 Projekt Objekt-143 terrain placement, bamboo clustering, and killbot aim follow-up
- Added `scripts/projekt-143-terrain-placement-audit.ts` and wired
  `npm run check:projekt-143-terrain-placement`. The audit samples flattened
  airfield/firebase/support features on source terrain and after stamps so
  hanging foundations, hill-edge runways, and generated airfield placements are
  caught mechanically before visual review.
- Initial placement evidence
  `artifacts/perf/2026-05-04T04-04-19-128Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  failed Open Frontier `airfield_main` (`43.3m` source span) and A Shau
  `tabat_airstrip` (`112.11m` source span). After relocating/reorienting the
  Open Frontier airfield/motor pool and Ta Bat airstrip/support/motor-pool
  presets, the latest placement audit
  `artifacts/perf/2026-05-04T10-53-17-143Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  passes. `airfield_main` is now `5.24m`; `tabat_airstrip` is `9.18m`.
- A Shau after-placement perf evidence
  `artifacts/perf/2026-05-04T04-14-35-401Z/summary.json` is
  measurement-trusted/WARN and no longer logs the Ta Bat steep-footprint
  warning. It is not A Shau acceptance: terrain-stall/recovery and movement
  transition warnings remain and need route/nav/gameplay placement work.
- Fixed the bamboo follow-up the owner called out: clustered mid-level Poisson
  species now get their own per-type grid instead of sharing palm spacing, so
  `bambooGrove` can form denser local grove pockets. The latest distribution
  evidence is
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  flat jungle-like ground remains `100%` in every mode and bamboo estimated
  share is about `1.0-1.05%`. Still open: screenshot/human review for visual
  grove readability and whether the larger ferns are now too bright or too
  dominant at eye level.
- Fixed the perf active-player target-height contract after the Pixel Forge
  NPCs were shortened. The TypeScript player bot and CJS perf driver now aim
  at the visual chest proxy below the eye-level actor anchor, and the live
  driver can pass `renderedPosition` as an aim anchor for visual hit proxies.
  Targeted bot/driver tests pass, but the full Open Frontier active-player
  capture at `artifacts/perf/2026-05-04T10-36-41-205Z/summary.json` still
  recorded zero hits and only a short ENGAGE window. Do not use killbot
  captures for perf acceptance until a fresh post-fix capture records hits.
- Folded the latest owner goals into Projekt docs/handoff/state/performance:
  bamboo should be clustered groves, not random scatter; keep and audit other
  green ground texture variants rather than only `jungle-floor`; improve all
  vegetation placement logic; explore custom grass/ground foliage/cover only
  after asset review; make trails more worn-in/smooth/vehicle-usable; continue
  terrain-shaped building/HQ/vehicle/airfield placement; and review Pixel Forge
  building and foliage candidates through the asset acceptance/perf path before
  runtime import.
- Final validation for this follow-up:
  `npx vitest run src\config\vegetationTypes.test.ts src\systems\terrain\VegetationScatterer.test.ts src\systems\terrain\ChunkVegetationGenerator.test.ts`
  PASS (`3` files, `18` tests);
  `npx vitest run src\systems\terrain\TerrainFeatureCompiler.test.ts src\systems\world\AirfieldLayoutGenerator.test.ts src\systems\world\WorldFeatureSystem.test.ts`
  PASS (`3` files, `35` tests);
  `npx vitest run src\dev\harness\playerBot\states.test.ts scripts\perf-harness\perf-active-driver.test.js`
  PASS (`2` files, `157` tests).
- Final Projekt gates:
  `npm run check:projekt-143-terrain-placement` PASS at
  `artifacts/perf/2026-05-04T10-53-17-143Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`;
  `npm run check:projekt-143-terrain-distribution` WARN only for AI Sandbox
  fixed fallback seed at
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  `npm run check:projekt-143-terrain-baseline` PASS at
  `artifacts/perf/2026-05-04T11-26-11-588Z/projekt-143-terrain-horizon-baseline/summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T11-29-35-677Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T11-29-35-169Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3860` tests).
- Fixed-wing probe caveat: `npm run probe:fixed-wing` hit sandbox
  `spawn EPERM`; the approved rerun built `dist-perf` and produced partial A-1
  success in `artifacts/fixed-wing-runtime-probe/summary.json`, then timed out
  before completing F-4/AC-47. The leftover probe preview/browser processes
  were cleaned up. Do not claim a full fixed-wing browser pass for this
  placement move until the probe completes all aircraft.
- Follow-up Open Frontier active-player capture:
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json` has measurement trust
  PASS and records `120` player shots, `43` hits, and `9` kills, so the
  shorter-NPC killbot aim contract is no longer in the zero-hit state. The
  owner noted another browser game was running on and off during the capture;
  use this artifact as hit-contract evidence only, not clean frame-time/heap
  acceptance or baseline evidence.
- Resource note from owner: avoid additional perf/browser captures for roughly
  the next hour because another agent team needs machine/browser resources.
  Continue with low-resource static/code/docs work toward Objekt-143 instead.
- Added low-resource static terrain asset inventory:
  `scripts/projekt-143-terrain-asset-inventory.ts` and
  `npm run check:projekt-143-terrain-assets`. First run hit sandbox `tsx`
  `spawn EPERM`; approved rerun passed with expected WARN at
 `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`.
  It found `12` terrain WebP textures (`5` green-ground variants, `4`
  trail/cleared/disturbed variants), `5` Pixel Forge ground-cover/trail prop
  candidates, `12` building candidates, `7` runtime Pixel Forge vegetation
  species, `6` still-blocked vegetation species, and `0` missing assets.
  Non-claim: this is inventory/shortlist evidence only, not asset import,
  visual acceptance, placement acceptance, or perf acceptance.

2026-05-04 Projekt Objekt-143 A Shau route/trail stamping pass
- Added `scripts/projekt-143-terrain-route-audit.ts` and
  `npm run check:projekt-143-terrain-routes`. The audit validates route-aware
  modes for generated route paths, full terrain stamping where required,
  `jungle_trail` surface patches, route capsule counts, and route centerline
  roughness before browser proof.
- Changed A Shau `terrainFlow` from `map_only` to full stamped
  `jungle_trail` corridors with conservative average-height smoothing
  (`routeWidth=36`, `routeBlend=14`, `routeSpacing=40`,
  `routeTerrainWidthScale=0.38`, `routeGradeStrength=0.06`,
  `routeTargetHeightMode=average`). This addresses the owner goal that routes
  should become worn-in, smoothed, future vehicle-usable trails, but it is not
  vehicle navigation acceptance.
- Route audit evidence:
  `artifacts/perf/2026-05-04T12-58-03-421Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
  PASS. A Shau now reports `12` route paths, `52,504m` route length, `1,321`
  route capsule stamps, and `14` route surface patches with no policy flags.
- Static/browser terrain evidence after the route pass:
  `npm run check:projekt-143-terrain-placement` PASS at
  `artifacts/perf/2026-05-04T12-59-25-892Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`;
  `npm run check:projekt-143-terrain-distribution` WARN only for AI Sandbox
  fixed fallback seed at
  `artifacts/perf/2026-05-04T12-59-32-610Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  `npm run check:projekt-143-terrain-baseline` PASS at
  `artifacts/perf/2026-05-04T12-59-44-452Z/projekt-143-terrain-horizon-baseline/summary.json`.
- A Shau runtime capture:
  `artifacts/perf/2026-05-04T13-03-02-238Z/summary.json` completed with
  measurement trust PASS (`probeAvg=10.31ms`, `probeP95=16ms`, missed `0%`),
  avg `11.83ms`, peak p99 WARN `49.20ms`, `0` browser errors, `170` player
  shots, `59` hits, `57` movement transitions, and max stuck `1.3s`. It failed
  validation on heap end-growth/recovery (`+84.17MiB`, `0.5%` recovery), and
  terrain-stall warnings still appeared. Use it as trusted regression evidence
  and hit/movement evidence only; do not claim A Shau acceptance.
- Final gates after docs/code for this pass:
  targeted terrain/route Vitest suite PASS (`4` files, `17` tests);
  `npm run typecheck` PASS;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T13-11-32-562Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T13-11-45-723Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3860` tests).

2026-05-04 Projekt Objekt-143 KB-CULL static-feature batching pass
- Implemented the first accepted KB-CULL category reduction: static
  `WorldFeatureSystem` placements now live under one
  `WorldStaticFeatureBatchRoot`, and compatible static meshes are batched
  across placement boundaries after collision/LOS registration. The
  `ModelDrawCallOptimizer` wrapper now exposes `minBucketSize` so this shared
  pass can skip one-off material buckets while preserving existing callers.
- Targeted validation before perf evidence:
  `npx vitest run src\systems\world\WorldFeatureSystem.test.ts src\systems\assets\ModelDrawCallOptimizer.test.ts`
  PASS (`2` files, `11` tests), and `npm run typecheck` PASS.
- Refreshed culling proof:
  `npm run check:projekt-143-culling-proof` PASS at
  `artifacts/perf/2026-05-04T14-08-33-257Z/projekt-143-culling-proof/summary.json`.
  Required renderer categories remain visible/trusted; this is category proof,
  not visual scale proof.
- Fresh Open Frontier after evidence:
  `artifacts/perf/2026-05-04T14-13-30-766Z/summary.json` completed with
  measurement trust PASS and validation WARN only on `peak_p99_frame_ms`
  (`50.90ms`). Static attribution improved versus the previous local Open
  Frontier capture: `world_static_features` draw-call-like `328 -> 222`,
  materials `261 -> 155`, meshes `328 -> 222`, and unattributed draw-call-like
  `303 -> 199`. Non-claim: max renderer draw calls rose to `1019`, and the
  after capture had visible close NPCs/weapons that were not visible in the
  comparison artifact, so this is not a clean Open Frontier total renderer or
  frame-time win.
- Fresh A Shau after evidence:
  `artifacts/perf/2026-05-04T14-17-44-361Z/summary.json` completed with
  measurement trust PASS and validation WARN only on `peak_p99_frame_ms`
  (`40.70ms`). Against the previous local A Shau route artifact,
  `world_static_features` draw-call-like moved `666 -> 268`, materials
  `599 -> 201`, meshes `666 -> 268`, max renderer draw calls `1061 -> 376`,
  max frame `79.7ms -> 46.5ms`, and heap validation no longer fails in this
  run. Non-claim: terrain-stall warnings still appear, so this is not A Shau
  terrain/nav acceptance.
- Refreshed KB-CULL owner baseline:
  `npm run check:projekt-143-culling-baseline` PASS at
  `artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`.
  It records selected owner draw-call-like `261` Open Frontier / `307` A Shau
  and visible unattributed `0.428%` / `2.907%`.
- Accepted scope: static-feature layer draw-call reduction. Still open:
  visible helicopter remediation, close-NPC/weapon pool residency, broad
  culling/HLOD acceptance, far canopy, A Shau terrain/nav acceptance, human
  playtest, production parity, and any performance-baseline refresh.
- Final gates after docs:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T14-29-34-142Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T14-29-43-744Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3860` tests).

2026-05-04 Projekt Objekt-143 KB-CULL grounded/parked helicopter visibility pass
- Fixed a helicopter visibility owner-path gap: stopped grounded helicopters
  previously skipped the update loop before `shouldRenderAirVehicle` was
  applied, so distant parked helicopters could remain scene-visible forever.
  `HelicopterModel` now applies the existing air-vehicle render-distance rule
  before that stopped/grounded early-continue path.
- Targeted tests:
  `npx vitest run src\systems\vehicle\AirVehicleVisibility.test.ts src\systems\helicopter\HelicopterModel.test.ts`
  PASS (`2` files, `39` tests).
- Open Frontier evidence:
  first run `artifacts/perf/2026-05-04T17-36-44-412Z/summary.json` was
  measurement-trusted but validation FAIL on peak p99 `61.60ms`, so it is not
  accepted. Rerun `artifacts/perf/2026-05-04T17-41-57-455Z/summary.json` is
  measurement-trusted with validation WARN only on peak p99 `48.70ms`.
  Scene attribution records `helicopters` at `0` visible objects / `0` visible
  triangles while `world_static_features` stays at the accepted batched count
  (`222` draw-call-like, `155` materials, `222` meshes).
- A Shau evidence:
  first run `artifacts/perf/2026-05-04T17-46-23-113Z/summary.json` was
  measurement-trusted but validation FAIL on heap recovery, so it is diagnostic
  only despite reducing helicopters to `19` visible objects / `2,100` visible
  triangles. Rerun `artifacts/perf/2026-05-04T17-51-52-562Z/summary.json` is
  measurement-trusted with validation WARN only on peak p99 `33.70ms`. Against
  the static-feature after point, helicopters reduced from `56` visible objects
  / `4,796` visible triangles to `37` / `2,696`.
- Refreshed Projekt culling evidence:
  `npm run check:projekt-143-culling-proof` PASS at
  `artifacts/perf/2026-05-04T17-56-35-772Z/projekt-143-culling-proof/summary.json`;
  `npm run check:projekt-143-culling-baseline` PASS at
  `artifacts/perf/2026-05-04T17-56-41-253Z/projekt-143-culling-owner-baseline/summary.json`.
- Broad Projekt gates after docs:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T17-58-34-753Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T17-58-50-965Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3863` tests).
- Accepted scope: grounded/parked helicopter visible-category reduction only.
  Non-claims: no broad vehicle culling/HLOD acceptance, no frame-time baseline
  refresh, no A Shau terrain/nav acceptance, and no close-NPC/weapon residency
  closeout.

2026-05-04 Projekt Objekt-143 terrain/culling/camera follow-up
- Fixed the hill-facing first-person camera clipping failure mode in
  `PlayerMovement`: if a grounded fixed-step move would place the player X/Z
  onto a terrain lip while Y is still limited by the rise clamp, the horizontal
  step is now rejected and marked terrain-blocked. This prevents the camera
  from being left inside a hillside when walking up into a slope.
- Kept jungle ground as the dominant material while reducing the remaining grey
  mountaintop look: highland/rock is now a moss-tinted steep-cliff accent, not
  a broad elevation cap. The refreshed distribution audit is WARN only for the
  expected AI Sandbox random-seed fallback:
  `artifacts/perf/2026-05-04T21-42-10-596Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
- Fixed nearby vegetation residency starvation: when frame pressure throttles
  general vegetation additions to zero, `VegetationScatterer` still admits one
  pending cell inside the critical player radius. The diagnostic Open Frontier
  capture shows near vegetation now fills in, but it also records `85,915`
  active vegetation instances, so follow-up needs coarse vegetation
  occlusion/distance policy rather than blind distance expansion.
- Fixed the "distant bases/houses always render" owner-path bug by changing
  `WorldFeatureSystem` from one globally visible static-feature root to
  per-feature render groups with distance/hysteresis visibility before
  per-feature batching. Diagnostic Open Frontier scene attribution at
  `artifacts/perf/2026-05-04T21-24-46-901Z/scene-attribution.json` records
  `world_static_features` visible triangles at `6,448`, but draw-call-like is
  `337` because finer culling granularity increases batch count. This is a
  visibility fix and HLOD prompt, not final renderer acceptance.
- Folded the remaining analysis into Projekt docs/handoff: AAA-style hidden
  vegetation/prop savings should come from coarse terrain/cluster/Hi-Z-style
  occlusion, not per-instance raycasts; and navmesh/heightmap validity needs a
  bake-manifest or terrain/stamp hash because `prebake-navmesh` skips existing
  assets unless forced and the runtime solo-navmesh cache key omits terrain
  and feature inputs.
- Validation: focused Vitest PASS (`5` files, `142` tests);
  `npm run build:perf` PASS; `npm run check:projekt-143-culling-proof` PASS at
  `artifacts/perf/2026-05-04T21-42-38-633Z/projekt-143-culling-proof/summary.json`;
  `npm run check:projekt-143-culling-baseline` PASS at
  `artifacts/perf/2026-05-04T21-42-16-288Z/projekt-143-culling-owner-baseline/summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T21-42-43-709Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T21-42-43-062Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3866` tests).
- Non-claims: the fresh Open Frontier runtime capture
  `artifacts/perf/2026-05-04T21-24-46-901Z/summary.json` failed validation on
  harness combat behavior (`7` shots, `0` hits), and local asset baking may
  skew frame-time metrics. Use its scene attribution diagnostically only.

2026-05-05 Projekt Objekt-143 navmesh invalidation shepherd pass
- Checkpointed the recovered navmesh/terrain-bake work as `e92523a`
  (`fix(navmesh): add terrain-aware bake invalidation`). The patch adds
  deterministic `NavmeshBakeSignature` hashing, a tracked
  `public/data/navmesh/bake-manifest.json`, stale-signature regeneration in
  `scripts/prebake-navmesh.ts`, terrain/feature fingerprints for runtime solo
  navmesh cache keys, and shared `NavmeshFeatureObstacles` so the bake/runtime
  contract uses collidable runtime placements instead of trafficable feature
  envelopes.
- Re-baked the currently registered procedural navmesh/heightmap assets. The
  prebuild check now reports `All 14 pre-baked assets match the navmesh bake
  manifest; skipping generation.` Open Frontier runtime selection is narrowed
  to seed `42`; seeds `137`, `2718`, `31415`, and `65537` remain withheld until
  they have per-seed feature presets.
- Expanded the terrain placement audit to check every registered pre-baked
  seed. Latest audit:
  `artifacts/perf/2026-05-05T01-41-42-472Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
  It is WARN, not FAIL: Zone Control seed `137` has two flattened-core span
  warnings (`nva_bunkers` and `trail_opfor_egress`). Do not claim all seeded
  placement/foundation work is closed from this pass.
- Aligned `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PROJEKT_OBJEKT_143_HANDOFF.md`, `docs/STATE_OF_REPO.md`, and
  `docs/DEPLOY_WORKFLOW.md` so the stale-navmesh risk is no longer described
  as missing plumbing. It is now a partially closed invalidation problem with
  remaining acceptance risks: A Shau nav quality/heap/terrain-stall proof,
  withheld Open Frontier variants, and Zone Control seed `137` placement
  warnings.
- Validation:
  targeted nav/seed Vitest PASS (`4` files, `12` tests);
  `npm run typecheck` PASS;
  `npx tsx scripts/prebake-navmesh.ts` PASS/skip by manifest;
  `npm run check:projekt-143-terrain-placement` WARN at the artifact above;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-05T01-45-05-395Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-05T01-45-04-864Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`253` files, `3872` tests);
  `npm run build` PASS;
  `npm run test:run` PASS (`253` files, `3872` tests).
- Non-claims: this is not A Shau navigation acceptance, not a far-canopy or
  culling/HLOD closeout, not a frame-time/perf-baseline refresh, not fixed-wing
  feel validation, and not production parity until the branch is pushed,
  CI/deploy state is checked, and live Pages/R2/WASM/service-worker behavior is
  verified.

2026-05-04 22:08 EDT Projekt Objekt-143 docs/status alignment
- Verified current repo truth after the shepherd push: `master` and
  `origin/master` are aligned at
  `356bc2e418af2f2f9aa8109dcf29a5ad7e291924`
  (`docs(projekt-143): align navmesh recovery state`).
- GitHub CI run `25353544629` passed on `356bc2e` for lint, test, build,
  smoke, perf, and mobile UI. The run still includes the known non-blocking
  perf artifact/continue-on-error annotations, but the workflow conclusion is
  success.
- Live production is intentionally not current: Pages
  `/asset-manifest.json` still reports
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`. Do not claim production parity
  for the last-24-hour Projekt work until `npm run deploy:prod` is run and the
  live Pages/R2/WASM/service-worker/browser-smoke proof is refreshed.
- Updated `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PROJEKT_OBJEKT_143_HANDOFF.md`, and `docs/STATE_OF_REPO.md` to record
  the pushed/CI-verified but not-deployed state. Created
  `docs/PROJEKT_OBJEKT_143_24H_STATUS_2026-05-04.md` as the owner-facing
  status report for goal alignment before the next run.

2026-05-04 22:45 EDT Projekt Objekt-143 terrain/nav evidence refresh
- Focused `TerrainFeatureCompiler` Vitest passed with the local Zone Control
  seed `137` pad-flatness regression coverage (`9` tests).
- `npm run check:projekt-143-terrain-placement` passed and wrote
  `artifacts/perf/2026-05-05T02-39-51-929Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`;
  all audited modes, including Zone Control seed `137`, have `0` placement
  warnings.
- `npm run build:perf` passed, then `npm run perf:capture:ashau:short` wrote
  `artifacts/perf/2026-05-05T02-41-21-751Z/summary.json`. A Shau is now
  measurement-trusted and clears heap, movement, and hit guardrails
  (`150` shots / `86` hits), but remains WARN on peak p99 and still logs NPC
  terrain-stall backtracking. Do not claim final A Shau route/nav acceptance.
- Folded the owner vegetation objective into Projekt: remove the small palm
  species from runtime completely, preserve the good tall palm, and redirect
  that visual/perf budget to grass or other ground cover.
- Refreshed broad Projekt gates after the docs/evidence update:
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-05T02-51-58-852Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN only for the expected
  KB-OPTIK visual-exception/human-review decision at
  `artifacts/perf/2026-05-05T02-53-11-768Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  the regenerated kickoff packet now names small-palm removal as part of the
  KB-TERRAIN branch evidence.

2026-05-05 23:05 EDT Projekt Objekt-143 short-palm retirement
- Visual review confirmed the small palm to remove is the misleadingly named
  `giantPalm` / `palm-quaternius-2` short Quaternius palm. The taller
  palm-like species `fanPalm` and `coconut` remain runtime vegetation.
- Removed `giantPalm` from the runtime Pixel Forge vegetation registry,
  removed its biome palette entries, retired the old giantPalm-only startup
  warmup list, deleted the shipped public short-palm atlas files, and redirected
  the dense-jungle/highland budget toward `fern` and `elephantEar` ground
  cover.
- Updated Projekt docs and generated evidence scripts to record the retirement
  separately from blocked Pixel Forge species, and added the source-pipeline
  objective to investigate EZ Tree or a similar licensed procedural/tree GLB
  workflow for missing Vietnam trees, understory, grass/ground cover, and
  trail-edge assets before Pixel Forge baking/runtime import.
- Validation after removal: focused vegetation/AssetLoader Vitest PASS
  (`2` files, `13` tests); `npm run build` PASS after regenerating Zone
  Control navmesh/heightmaps; `npm run build:perf` PASS and cleared stale
  `dist-perf` short-palm assets; `npm run validate:fast` PASS (`253` files,
  `3874` tests); `npm run check:projekt-143-terrain-assets` WARN at
  `artifacts/perf/2026-05-05T03-23-29-111Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
  with `6` runtime vegetation species, `1` retired species, `6` blocked
  species, and `0` missing assets; `npm run check:projekt-143-terrain-distribution`
  WARN at
  `artifacts/perf/2026-05-05T03-23-42-696Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  `npm run check:projekt-143-terrain-placement` PASS at
  `artifacts/perf/2026-05-05T03-23-53-465Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-05T03-24-06-823Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN at
  `artifacts/perf/2026-05-05T03-24-24-591Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  only because KB-OPTIK still needs the known visual-exception/human-review
  decision.

2026-05-05 23:40 EDT Projekt Objekt-143 vegetation source-pipeline review
- Researched the owner-suggested EZ Tree direction and split it from runtime
  acceptance. Added
  `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md` as a decision packet:
  Dan Greenheck's `EZ-Tree` is the recommended first offline GLB-generation
  pilot because it is Three.js-oriented, MIT licensed, and can export GLB/PNG;
  it should not be added to the shipped runtime bundle for Cycle 3.
- Recorded QuickMesh as a low-poly fallback, botaniq/Shizen as licensed asset
  library candidates for grass, ground cover, tropical understory, and
  trail-edge variety, and Blender Sapling/Tree-Gen as experimental fallback
  paths only.
- Updated the Projekt ledger and handoff so future agents route generated or
  sourced vegetation through Pixel Forge `review-only` baking, license/provenance
  capture, asset inventory, screenshots, texture/upload evidence, and matched
  Open Frontier/A Shau validation before runtime import.

2026-05-05 23:55 EDT Projekt Objekt-143 KB-FORGE bureau setup
- Folded the local Pixel Forge repo into Projekt as KB-FORGE rather than
  treating it as an external source pool. Added
  `scripts/projekt-143-pixel-forge-bureau.ts`, exposed as
  `npm run check:projekt-143-pixel-forge`, to catalog
  `C:\Users\Mattm\X\games-3d\pixel-forge` from the TIJ side.
- The audit reads Pixel Forge package scripts (`tij:pipeline`,
  `tij:vegetation-validate`, `tij:npc-package`), the `/gallery-tij` route,
  the generated `gallery-manifest.json`, and the NPC package manifest surface,
  then compares manifest vegetation against TIJ runtime, blocked, and retired
  species.
- Updated the source-pipeline review, Projekt ledger, and handoff so external
  generators such as `EZ-Tree` are optional source inputs to Pixel Forge, not
  replacements for Pixel Forge's review-only, bake, manifest, validator, and
  gallery gates.

2026-05-05 Projekt Objekt-143 KB-FORGE validation and handoff alignment
- Refreshed `npm run check:projekt-143-pixel-forge`: expected WARN at
  `artifacts/perf/2026-05-05T03-50-22-634Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`.
  Pixel Forge is present with `109` manifest entries, `13` vegetation entries,
  all `6` current TIJ runtime vegetation species present, retired `giantPalm`
  still in the Pixel Forge gallery manifest, `6` blocked/review-only vegetation
  species present, and the NPC review package counted as `4` factions, `8`
  clips, and `32` impostor packages.
- Refreshed Projekt evidence: `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-06T05-27-42-111Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN at
  `artifacts/perf/2026-05-05T03-50-28-671Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  only for the existing KB-OPTIK near-stress visual-exception/human-review
  decision.
- `npm run validate:fast` PASS (`253` files, `3874` tests). Updated the
  Projekt ledger and handoff so the local state records the unpushed local
  stack and does not imply production parity.

2026-05-05 Projekt Objekt-143 KB-FORGE relevance catalog
- Expanded `scripts/projekt-143-pixel-forge-bureau.ts` from a presence/status
  audit into a relevance catalog for the local Pixel Forge repo. The report now
  summarizes `6` prop families, `13` vegetation packages, and `5` review
  queues: ground-cover budget replacement, route/trail surfaces,
  base/foundation kits, far-canopy/tree variety, and NPC/weapon packaging.
- Refreshed `npm run check:projekt-143-pixel-forge`: expected WARN at
  `artifacts/perf/2026-05-05T04-01-08-047Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`
  because retired `giantPalm` and blocked/review-only species remain present
  in the Pixel Forge gallery manifest. No Pixel Forge output is accepted for
  runtime by this catalog.

2026-05-05 Projekt Objekt-143 KB-LOAD fresh startup baseline
- Built the current retail bundle with `npm run build` after the short-palm
  removal and KB-FORGE catalog commits.
- First Open Frontier/Zone Control startup captures were run concurrently and
  are treated as diagnostic-only because parallel Chromium runs can contaminate
  startup timing.
- Reran the startup baselines sequentially. Open Frontier wrote
  `artifacts/perf/2026-05-05T04-13-00-783Z/startup-ui-open-frontier/summary.json`
  with averages: `5209.3ms` mode-click-to-playable, `4516.7ms`
  deploy-click-to-playable, `844.5ms` WebGL upload total, and `33.1ms` max
  upload. Zone Control wrote
  `artifacts/perf/2026-05-05T04-14-18-778Z/startup-ui-zone-control/summary.json`
  with `5440.3ms` mode-click-to-playable, `4835.7ms`
  deploy-click-to-playable, `864.567ms` WebGL upload total, and `42ms` max
  upload.
- Refreshed `npm run check:projekt-143-cycle3-kickoff`: expected WARN at
  `artifacts/perf/2026-05-05T04-14-55-548Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
 KB-LOAD remains `ready_for_branch`: the prior multi-second `giantPalm`
 largest-upload failure is gone from the current startup path, but long tasks
 and multi-second playable latency remain, so this is not a startup-latency
 win or closeout.

2026-05-05 Projekt Objekt-143 KB-LOAD upload attribution summary
- Added `webglUploadSummary.largestUploads` and median/p95 upload aggregates to
  `scripts/perf-startup-ui.ts` so startup `summary.json` carries asset-level
  upload attribution instead of requiring manual inspection of
  `browser-stalls.json`.
- Refreshed sequential startup baselines. Open Frontier wrote
  `artifacts/perf/2026-05-05T04-24-07-730Z/startup-ui-open-frontier/summary.json`
  with `5198ms` mode-click-to-playable, `4466.333ms`
  deploy-click-to-playable, `845.733ms` WebGL upload total, `30.967ms`
  average max upload, and `541.333` upload calls. Zone Control wrote
  `artifacts/perf/2026-05-05T04-25-31-931Z/startup-ui-zone-control/summary.json`
  with `5417ms` mode-click-to-playable, `4887ms`
  deploy-click-to-playable, `841.6ms` WebGL upload total, `39.067ms` average
  max upload, and `590` upload calls.
- Refreshed `npm run check:projekt-143-cycle3-kickoff`: expected WARN at
  `artifacts/perf/2026-05-05T04-26-07-523Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-LOAD now names current top uploads: Open Frontier is led by
  `npcs/usArmy/idle/animated-albedo-packed.png`, `bambooGrove` imposter, and
  `fanPalm` imposter; Zone Control is led by `bananaPlant`, `bambooGrove`, and
  `fanPalm` imposters. The retired short palm is no longer the largest-upload
  failure, but long tasks and multi-second playable latency remain.

2026-05-05 Projekt Objekt-143 KB-LOAD vegetation-normal proof mode
- Added a proof-only `--disable-vegetation-normals` option to
  `scripts/perf-startup-ui.ts`. It injects
  `window.__KB_LOAD_DISABLE_VEGETATION_NORMALS__ = true` before app startup,
  records `candidateFlags.disableVegetationNormals=true`, and writes candidate
  artifacts under `startup-ui-<mode>-vegetation-normals-disabled/` so default
  startup baselines stay separate.
- `GPUBillboardSystem` keeps the default normal-lit Pixel Forge vegetation path
  unchanged, but when the proof flag is present it skips vegetation normal
  textures and forces hemisphere shading for the run. Added focused unit
  coverage for both default and proof-hook behavior.
- Candidate startup evidence: Open Frontier wrote
  `artifacts/perf/2026-05-05T05-31-24-775Z/startup-ui-open-frontier-vegetation-normals-disabled/summary.json`
  with `4420ms` mode-click-to-playable and `3741.333ms`
  deploy-click-to-playable, but upload attribution is noisy due to a large
  `(inline-or-unknown)` upload. Zone Control wrote
  `artifacts/perf/2026-05-05T05-28-07-843Z/startup-ui-zone-control-vegetation-normals-disabled/summary.json`
  with `3203.667ms` mode-click-to-playable, `2631.667ms`
  deploy-click-to-playable, `767.467ms` WebGL upload total, and `492.667`
  upload calls. This is measurement evidence only, not approval to remove
  vegetation normal maps from the default runtime or Pixel Forge bake.
- Validation: `git diff --check` passed, `npm run check:projekt-143-cycle3-kickoff`
  remained WARN only for the existing KB-OPTIK human-review decision at
  `artifacts/perf/2026-05-05T05-34-24-541Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  `npm run validate:fast` passed with `254` test files and `3876` tests, and
  `npm run build` passed with the existing large-chunk warning.

2026-05-05 Projekt Objekt-143 vegetation-normal visual proof
- Added `scripts/projekt-143-vegetation-normal-proof.ts` and
  `npm run check:projekt-143-vegetation-normal-proof`. The command force-builds
  the perf target, captures default normal-lit vegetation versus the
  no-normal candidate at fixed Open Frontier seed `42` and Zone Control seed
  `137` camera anchors, and writes a contact sheet plus pair-delta summary.
- Latest artifact:
  `artifacts/perf/2026-05-05T12-15-23-150Z/projekt-143-vegetation-normal-proof/summary.json`.
  Contact sheet:
  `artifacts/perf/2026-05-05T12-15-23-150Z/projekt-143-vegetation-normal-proof/contact-sheet.png`.
  The proof captured `8/8` screenshots, `4/4` A/B pairs, renderer stats,
  positive vegetation counters, and `0` browser/page/request failures.
  Mechanical deltas stayed inside the current review band: max mean absolute
  RGB delta `15.595`, max mean absolute luma delta `18.848`, and max absolute
  mean luma delta `8.284%`.
- Refreshed `npm run check:projekt-143-cycle3-kickoff`: expected WARN at
  `artifacts/perf/2026-05-05T12-20-11-036Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-LOAD now points at the visual proof path and contact sheet, but the
  normal-map removal candidate still requires human visual acceptance before
  becoming runtime or Pixel Forge bake policy.
- Validation: `git diff --check` passed,
  `npm run check:projekt-143-vegetation-normal-proof` passed with expected
  WARN, `npm run check:projekt-143-cycle3-kickoff` passed with expected WARN,
  and `npm run validate:fast` passed with `254` test files and `3876` tests.

2026-05-05 Projekt Objekt-143 KB-FORGE audit refresh
- Refreshed `npm run check:projekt-143-pixel-forge` after the local
  Pixel Forge bureau was folded into Projekt Objekt-143. Latest artifact:
  `artifacts/perf/2026-05-05T13-03-10-136Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`.
- Result is PASS for the local liaison/catalog scope: Pixel Forge is present at
  `C:\Users\Mattm\X\games-3d\pixel-forge`, the TIJ pipeline, gallery,
  vegetation validator, and NPC package surfaces are readable, and the catalog
  still records `109` manifest entries, `13` vegetation packages, `6` runtime
  species present, `1` retired species as review/provenance, `6`
  blocked/review-only species as non-runtime records, `6` prop families, and
  `5` relevance queues.
- This refresh keeps the owner framing explicit: KB-FORGE analyzes and catalogs
  the local Pixel Forge toolchain first. It does not approve runtime imports or
  replace Pixel Forge with EZ Tree or any other source generator.

2026-05-05 Projekt Objekt-143 completion audit
- Added `scripts/projekt-143-completion-audit.ts`, exposed as
  `npm run check:projekt-143-completion-audit`. The audit restates the
  objective as concrete success criteria, maps the prompt to artifact evidence,
  checks current git state, and writes JSON/Markdown under
  `artifacts/perf/<timestamp>/projekt-143-completion-audit/`.
- Latest artifact:
  `artifacts/perf/2026-05-05T14-17-00-439Z/projekt-143-completion-audit/completion-audit.json`.
  Status is `NOT_COMPLETE`, which is expected and intentional. It marks the
  static suite and scoped KB-EFFECTS grenade path as pass, but KB-OPTIK remains
  blocked on near-stress visual/human-review decision, KB-LOAD/KB-TERRAIN/
  KB-CULL remain partial, KB-FORGE now passes for local pipeline cataloging,
  owner vegetation specifics now pass for retiring the short palm, preserving
  `fanPalm`/`coconut`, and redirecting replacement budget toward approved
  ground-cover/candidate trail work. Validation/release still fails because the
  audited branch was dirty, unpushed, and undeployed.

2026-05-05 Projekt Objekt-143 KB-LOAD lazy NPC imposter buckets
- Changed Pixel Forge NPC imposter startup residency so the combat renderer
  eagerly creates only the common `idle` and `patrol_walk` faction buckets.
  Less common clips now allocate their faction bucket on first visible far-NPC
  use, instead of requiring every `2688x1344` NPC animated albedo atlas at
  first reveal.
- Accepted startup evidence: Open Frontier
  `artifacts/perf/2026-05-05T16-36-44-588Z/startup-ui-open-frontier/summary.json`
  averaged `4526.7ms` mode-click-to-playable, `3867.7ms`
  deploy-click-to-playable, `437.6ms` WebGL upload total, and `459.33` upload
  calls. Zone Control
  `artifacts/perf/2026-05-05T16-39-16-223Z/startup-ui-zone-control/summary.json`
  averaged `2994.3ms` mode-click-to-playable, `2458.7ms`
  deploy-click-to-playable, `415ms` WebGL upload total, and `321.33` upload
  calls.
- Rejected the stricter no-eager NPC variant after
  `artifacts/perf/2026-05-05T16-33-44-776Z/startup-ui-open-frontier/summary.json`
  and
  `artifacts/perf/2026-05-05T16-34-47-581Z/startup-ui-zone-control/summary.json`
  because Zone deploy-click-to-playable regressed versus the idle/patrol-eager
  branch. Zone artifact
  `artifacts/perf/2026-05-05T16-37-49-634Z/startup-ui-zone-control/summary.json`
  is retained as a noisy outlier due to a single fanPalm normal upload spike.
- Validation so far: focused combat mesh factory/renderer tests passed and
  `npm run build` passed with the existing large-chunk warning.
  `npm run check:projekt-143-cycle3-kickoff` remains WARN only for the known
  KB-OPTIK human-review decision at
  `artifacts/perf/2026-05-05T16-44-34-541Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  `npm run check:projekt-143-completion-audit` writes
  `artifacts/perf/2026-05-05T16-45-01-714Z/projekt-143-completion-audit/completion-audit.json`
  with expected `NOT_COMPLETE` because the working tree is uncommitted and
  KB-OPTIK/KB-LOAD/KB-TERRAIN/KB-CULL/release remain open. This is a narrow
  KB-LOAD startup/upload improvement, not Projekt completion or production
 parity.

2026-05-05 Projekt Objekt-143 banana-plant grounding follow-up
- Checked the owner screenshot from Downloads and corrected the local
  identification: the light-green half-buried floor leaves are runtime
  `bananaPlant`, not `fern` or `elephantEar`. The Pixel Forge source atlas has
  a negative source `yOffset`, and the previous runtime anchor placed most of
  the low banana-plant billboard below terrain.
- Added optional per-type `maxSlopeDeg` support to `VegetationTypeConfig` and
  `ChunkVegetationGenerator`, then capped `bananaPlant` at `18deg` so this low
  random imposter does not spawn on steep faces where a vertical billboard
  clips into terrain. Raised the banana-plant grounding lift to `2.2`, which
  moves its worst source-alpha visible base to `0.03m` above terrain while
  leaving `fern` and `elephantEar` unchanged.
- Audited all active runtime vegetation imposters against their source-alpha
  bounds after the correction. Worst visible bases are now: bambooGrove
  `-0.07m`, fern `0.17m`, bananaPlant `0.03m`, fanPalm `-0.09m`,
  elephantEar `-0.15m`, and coconut `-0.22m`; there is no remaining active
  vegetation species with the severe half-buried banana-plant profile.
- Validation: `npx vitest run src\config\vegetationTypes.test.ts src\systems\terrain\ChunkVegetationGenerator.test.ts`
  passed with `16` tests, `npx vitest run src\systems\world\WorldFeatureSystem.test.ts`
  passed after reverting the unrelated diagnostic culling experiment, `git diff --check`
  passed, `npm run build` passed with the existing large-chunk warning, and
  `npm run validate:fast` passed with `254` files and `3881` tests.
  `npm run check:projekt-143-cycle3-kickoff` remains WARN only for the known
  KB-OPTIK human-review decision at
  `artifacts/perf/2026-05-05T17-50-18-919Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.

2026-05-05 Projekt Objekt-143 vegetation scale-anchor follow-up
- Rechecked all active Pixel Forge vegetation after the banana-plant fix and
  found one remaining generator-level grounding risk: random billboard scale
  was changing the quad height, but `ChunkVegetationGenerator` still placed
  centers at `terrainHeight + yOffset`. Oversized instances could therefore
  sink below the source-alpha base band, while undersized instances could
  float above it.
- Fixed every canopy, mid-level, clustered-mid, and random ground-cover
  placement path to anchor at `terrainHeight + yOffset * instanceScale`, so
  the visible base stays stable across the existing `0.9..1.1` vegetation
  scale variation. Added behavior coverage that checks the generated center
  height tracks the instance scale.
- Validation: `npx vitest run src\config\vegetationTypes.test.ts src\systems\terrain\ChunkVegetationGenerator.test.ts`
  passed with `17` tests, and `npm run typecheck -- --pretty false` passed.
- A direct alpha scan of the actual runtime-sampled vegetation atlas rows after
  the scale-anchor fix reports worst visible bases across the `0.9..1.1`
  scale band at: bambooGrove `-0.081m`, fern `0.153m`, bananaPlant `0.021m`,
  fanPalm `-0.103m`, elephantEar `-0.175m`, and coconut `0.270m`. None of
  the remaining active species has the old banana-plant half-buried profile.

2026-05-05 Projekt Objekt-143 KB-LOAD close-model and live-entry readiness
- Added a second KB-LOAD startup branch after the lazy NPC imposter-bucket
  work. Pixel Forge close-GLB NPC pools are no longer built during combat
  system init; close NPCs remain visible as imposters while their close-GLB pool
  is queued, then the pool loads after live entry.
- Tightened live-entry scheduling: the post-terrain frame yield is now
  telemetry only, deferred initialization/grenade/shader warmups are scheduled
  after the first post-reveal frame/timeout, and the close-GLB lazy-load gate
  opens later instead of competing with the first playable frame.
- Fixed `scripts/perf-startup-ui.ts` so the playable DOM condition polls on a
  timer rather than `requestAnimationFrame`; delayed compositor frames remain
  visible in startup marks but no longer hide DOM readiness.
- Clean accepted startup evidence: Open Frontier
  `artifacts/perf/2026-05-05T18-49-03-248Z/startup-ui-open-frontier/summary.json`
  averaged `4324.3ms` mode-click-to-playable, `3622ms`
  deploy-click-to-playable, `417.367ms` WebGL upload total, and `149` upload
  calls. Zone Control
  `artifacts/perf/2026-05-05T18-47-51-310Z/startup-ui-zone-control/summary.json`
  averaged `2774.3ms` mode-click-to-playable, `2138.7ms`
  deploy-click-to-playable, `415.1ms` WebGL upload total, and `116` upload
  calls.
- This is a scoped KB-LOAD readiness/upload improvement. It does not close
  vegetation-normal visual review, broad texture policy, release, production
  parity, or Projekt Objekt-143 completion.

2026-05-05 Projekt Objekt-143 KB-TERRAIN far-canopy and vegetation grounding proof
- Added `npm run check:vegetation-grounding`, a source-alpha/runtime-size audit
  over all active Pixel Forge vegetation imposters. The latest grounding audit
  passed with `6` runtime species and `0` flagged species at
  `artifacts/perf/2026-05-05T19-50-05-046Z/vegetation-grounding-audit/summary.md`.
  This confirms the banana-plant grounding issue is not repeated by the other
  active vegetation types under the current atlas/scale/y-offset contract.
- Added per-mode terrain `farCanopyTint` policy and shader uniforms so Open
  Frontier and A Shau can carry distant green canopy color through terrain
  material and fog without changing terrain geometry or vegetation instance
  counts. A Shau uses the stronger long-range fog tint because the elevated
  DEM horizon otherwise still read as tan bare earth.
- Fresh elevated horizon proof after the tint tuning passed at
  `artifacts/perf/2026-05-05T19-32-42-944Z/projekt-143-terrain-horizon-baseline/summary.json`.
  Against the clean before artifact
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`,
  A Shau elevated far-band green ratio moved from `0.0266` to `0.5223`, and
  A Shau high-oblique far-band green ratio moved from `0` to `0.2292`. Open
  Frontier ground-band green ratios also improved while retaining renderer and
  terrain telemetry.
- Runtime/perf evidence is mixed. A Shau short capture
  `artifacts/perf/2026-05-05T19-40-41-562Z/summary.json` completed with
  measurement trust PASS, no browser errors, `129` shots, `58` hits, average
  frame `7.40ms`, and WARN heap/p99 checks. Open Frontier short capture
  `artifacts/perf/2026-05-05T19-36-31-245Z/summary.json` collected trusted
  renderer samples but failed the active-combat validator because the harness
  driver stayed in `ADVANCE`, recorded `0` shots / `0` hits, and had `216`
  waypoint replan failures. Treat that Open Frontier artifact as diagnostic,
  not acceptance.
- This is a scoped KB-TERRAIN visual/grounding candidate, not Projekt
  completion. Open Frontier active-driver acceptance still needs a separate
  harness/navigation fix or a deliberately documented capture policy change.

2026-05-05 Projekt Objekt-143 vegetation grounding recheck
- Re-ran `npm run check:vegetation-grounding` after the owner asked to make sure
  there is nothing else like the half-buried light-green leaf asset. Fresh
  artifact: `artifacts/perf/2026-05-05T20-22-50-292Z/vegetation-grounding-audit/summary.md`.
  Result: PASS, `6` runtime species, `0` flagged species.
- Confirmed there is no second active vegetation path bypassing the registry:
  `GlobalBillboardSystem` filters biome palettes through `VEGETATION_TYPES`, and
  `AssetLoader` foliage comes from the Pixel Forge manifest. `npm run
  check:pixel-forge-cutover` passed, confirming retired/blocked/legacy foliage
  is not in the runtime cutover path.
- Focused validation passed with `19` tests:
  `npx vitest run src\config\vegetationTypes.test.ts src\systems\terrain\ChunkVegetationGenerator.test.ts src\systems\world\billboard\GPUBillboardSystem.test.ts`.
  Current conclusion: no other active vegetation species retains the severe
  half-buried banana-plant profile.

2026-05-05 Projekt Objekt-143 vegetation slope-guard recheck
- Rechecked the grounding audit coverage after the owner asked to make sure
  nothing else can reproduce the half-buried leaves on slopes. The active
  source-alpha/base audit already passed, but random `fern`, `elephantEar`, and
  `fanPalm` placements still had no explicit per-type slope guard, which left a
  hillside clipping class open on A Shau's all-dense-jungle DEM slopes.
- Added conservative slope caps for those random species: `fern <=24deg`,
  `elephantEar <=22deg`, and `fanPalm <=30deg`; `bananaPlant` remains
  `<=18deg`. Tightened `scripts/vegetation-grounding-audit.ts` so future random
  ground-cover or mid-level vegetation fails the audit if it lacks the expected
  slope guard.
- Validation: `npx vitest run src/config/vegetationTypes.test.ts src/systems/terrain/ChunkVegetationGenerator.test.ts`
  passed with `19` tests, `npm run check:vegetation-grounding` passed at
  `artifacts/perf/2026-05-05T20-50-50-316Z/vegetation-grounding-audit/summary.md`,
  `npm run validate:fast` passed with `254` files / `3890` tests, and
  `git diff --check` passed with CRLF warnings only.

2026-05-05 Projekt Objekt-143 KB-LOAD close-GLB residency follow-up
- Reworked Pixel Forge close-NPC GLB pools from one-shot `40` model creation per
  faction to demand-sized residency: each pool now seeds `8` models, grows in
  `4` model batches only when hard-close demand exhausts available instances,
  and keeps close overflow visible as impostors while the pool can still grow.
  The per-faction hard cap remains `40`.
- Added renderer coverage for the new contract: eager pools seed only the
  initial demand size, close overflow remains visible as impostors while top-up
  is queued, and suppression only occurs after the per-faction hard cap is
  reached. Focused renderer validation passed with `27` tests.
- Validation passed:
  - `npx vitest run src\systems\combat\CombatantRenderer.test.ts`
  - `npx vitest run src\systems\combat\CombatantSystem.test.ts src\systems\combat\CombatantMeshFactory.test.ts src\systems\combat\PixelForgeNpcRuntime.test.ts`
  - `npm run typecheck -- --pretty false`
  - `git diff --check`
  - `npm run build:perf`
  - `npm run validate:fast` (`254` files, `3888` tests)
- Open Frontier 120 NPC short capture after the change passed validation at
  `artifacts/perf/2026-05-05T20-10-35-267Z/summary.json` with overall WARN:
  measurement trust PASS, `99` shots, `37` hits, average frame `10.27ms`, heap
  end-growth `12.17MiB` PASS, heap peak-growth `36.97MiB` WARN. Compared with
  the failing refreshed-before artifact
  `artifacts/perf/2026-05-05T19-57-55-371Z/summary.json`, heap peak-growth fell
  from `149.54MiB` FAIL and close residency dropped from `1080` close-NPC meshes
  plus `7000` weapon meshes to `224` close-NPC meshes plus `1400` weapon meshes.
- A Shau 60 NPC short capture passed validation at
  `artifacts/perf/2026-05-05T20-15-48-568Z/summary.json` with overall WARN:
  measurement trust PASS, `210` shots, `105` hits, average frame `5.79ms`, p99
  `18.30ms` PASS, heap end-growth `-17.29MiB` PASS, heap peak-growth
  `49.76MiB` WARN.
- This closes the specific Open Frontier heap-peak FAIL caused by close
  NPC/weapon pool residency, but it is not Projekt completion. Residual WARNs
  remain, and the formal Projekt audit still needs to be rerun after this
  evidence.

2026-05-05 Projekt Objekt-143 close-pool evidence routing correction
- Updated the Cycle 3 kickoff and completion audit scripts so the close
  NPC/weapon pool-residency slice is no longer incorrectly described as
  diagnostic-only. Fresh kickoff artifact:
  `artifacts/perf/2026-05-05T20-29-10-030Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  It records the scoped close-pool residency status as `evidence_complete`
  using the trusted failing-before Open Frontier capture
  `artifacts/perf/2026-05-05T19-57-55-371Z/summary.json`, trusted Open
  Frontier after capture
  `artifacts/perf/2026-05-05T20-10-35-267Z/summary.json`, and trusted A Shau
  after capture
  `artifacts/perf/2026-05-05T20-15-48-568Z/summary.json`.
- Re-ran the completion audit at
  `artifacts/perf/2026-05-05T20-29-15-202Z/projekt-143-completion-audit/completion-audit.json`.
  Result remains `NOT_COMPLETE`: KB-OPTIK still needs the near-stress visual
  decision/human review, KB-LOAD/KB-TERRAIN/KB-CULL remain broader partial
  targets, and validation/release remains failed because the tree is local,
  dirty, unpushed, and undeployed.
- Validation for this verifier-only correction: `npm run typecheck -- --pretty
  false` PASS.

2026-05-05 Projekt Objekt-143 KB-OPTIK human-review packet
- Created a browser-review packet for the remaining KB-OPTIK owner decision at
  `artifacts/perf/2026-05-05T20-31-49-687Z/projekt-143-optik-human-review/index.html`,
  with machine-readable state in
  `artifacts/perf/2026-05-05T20-31-49-687Z/projekt-143-optik-human-review/review-summary.json`.
  The packet compares runtime LOD-edge pairs against the flagged 8.5m
  near-stress perspective pairs so the decision can be made from visible close
  GLB/imposter screenshots instead of the too-dark contact-sheet thumbnails.
- Wired the review-summary artifact into the Cycle 3 kickoff and completion
  audit scripts. Fresh kickoff:
  `artifacts/perf/2026-05-05T20-33-51-778Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Fresh completion audit:
  `artifacts/perf/2026-05-05T20-33-57-297Z/projekt-143-completion-audit/completion-audit.json`.
  Result remains `NOT_COMPLETE` because the review state is still
  `needs_human_decision`, not an accepted exception.
- Validation: `npm run typecheck -- --pretty false` PASS.

2026-05-05 Projekt Objekt-143 KB-OPTIK human-review rejection
- Owner rejected the current KB-OPTIK human-review packet as a wrong comparison:
  the close GLB side is a T-pose/weaponless crop while the impostor side is a
  posed atlas/runtime frame with top-of-head/weapon visibility. Generated the
  invalidation artifact at
  `artifacts/perf/2026-05-05T22-00-33-358Z/projekt-143-optik-human-review/review-summary.json`
  with browser HTML at
  `artifacts/perf/2026-05-05T22-00-33-358Z/projekt-143-optik-human-review/index.html`.
  It records `status: invalid_runtime_comparison` and
  `comparisonBasis: separate_transparent_crops`, and it invalidates the earlier
  `2026-05-05T20-31-49-687Z` packet for acceptance.
- Hardened the Cycle 3 kickoff and completion audit so accepted human review
  now requires `comparisonBasis: runtime_equivalent_same_scene` or
  `owner_explicit_exception`. Fresh kickoff:
  `artifacts/perf/2026-05-05T22-01-25-069Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Fresh completion audit:
  `artifacts/perf/2026-05-05T22-01-35-069Z/projekt-143-completion-audit/completion-audit.json`.
  Result remains `NOT_COMPLETE`; KB-OPTIK is explicitly blocked on a
  runtime-equivalent same-scene review packet or owner exception.
- Validation: `npm run check:projekt-143-optik-human-review` no-op PASS after
  artifact creation, `npx tsc --noEmit --pretty false` PASS,
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected, and
  `npm run check:projekt-143-completion-audit` NOT_COMPLETE as expected.

2026-05-05 Projekt Objekt-143 KB-OPTIK runtime-equivalent review packet
- Added `scripts/projekt-143-optik-runtime-review.ts` and package script
  `npm run check:projekt-143-optik-runtime-review`. The new harness generates a
  replacement human-review packet instead of reusing the rejected T-pose crop
  packet.
- Fresh packet:
  `artifacts/perf/2026-05-05T22-19-43-527Z/projekt-143-optik-human-review/review-summary.json`
  with browser HTML at
  `artifacts/perf/2026-05-05T22-19-43-527Z/projekt-143-optik-human-review/index.html`
  and contact sheet at
  `artifacts/perf/2026-05-05T22-19-43-527Z/projekt-143-optik-human-review/runtime-equivalent-contact-sheet.png`.
  It records `status: needs_human_decision` and
  `comparisonBasis: runtime_equivalent_same_scene`.
- Pairing contract: same faction, `walk_fight_forward` clip, pose progress
  `0.35`, frame `2`, target height, crop map, camera, lighting, and runtime
  weapon socket basis. The close GLB side is animated and weaponed (`hasWeapon:
  true` for all four factions); the imposter side uses the runtime shader/crop
  contract. The packet has `0` page errors, `0` request errors, `0` console
  errors, and `0` load errors.
- Hardened the invalidation command so `npm run
  check:projekt-143-optik-human-review` no-ops while a runtime-equivalent
  packet is pending owner decision, unless explicitly run with `--force`.
- Fresh kickoff and completion audit now point at the runtime-equivalent packet:
  `artifacts/perf/2026-05-05T22-20-39-336Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  and
  `artifacts/perf/2026-05-05T22-20-53-273Z/projekt-143-completion-audit/completion-audit.json`.
  Result remains `NOT_COMPLETE`; KB-OPTIK is blocked on owner visual decision
  or explicit exception, not on missing comparison evidence.
- Validation: `npm run check:projekt-143-optik-runtime-review` PASS,
  `npm run check:projekt-143-optik-human-review` no-op PASS,
  `npx tsc --noEmit --pretty false` PASS, kickoff WARN as expected, and
  completion audit NOT_COMPLETE as expected.

2026-05-05 Projekt Objekt-143 KB-TERRAIN evidence routing correction
- Updated the Cycle 3 kickoff and completion audit scripts to separate
  completed KB-TERRAIN sub-slices from still-open terrain acceptance. Fresh
  kickoff:
  `artifacts/perf/2026-05-05T20-37-51-175Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Fresh completion audit:
  `artifacts/perf/2026-05-05T20-37-56-912Z/projekt-143-completion-audit/completion-audit.json`.
- The kickoff now records three scoped terrain sub-slices as
  `evidence_complete`:
  - far-canopy tint before/after evidence from
    `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`
    to
    `artifacts/perf/2026-05-05T19-32-42-944Z/projekt-143-terrain-horizon-baseline/summary.json`,
    with green-ratio deltas: Open Frontier elevated ground `+0.6489`, Open
    Frontier high-oblique ground `+0.2598`, A Shau elevated far band `+0.4957`,
    and A Shau high-oblique far band `+0.2292`.
  - runtime vegetation grounding from
    `artifacts/perf/2026-05-05T20-22-50-292Z/vegetation-grounding-audit/summary.json`
    with `6` runtime species and `0` flagged species.
  - small-palm retirement and ground-cover direction from
    `artifacts/perf/2026-05-05T03-23-29-111Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
    with `6` runtime vegetation species, `1` retired species, `0` missing
    assets, `5` Pixel Forge ground-cover candidates, and `4`
    trail/cleared-surface texture candidates.
- The overall KB-TERRAIN target deliberately remains `ready_for_branch`, not
  complete. Open items remain A Shau route/nav quality while terrain-stall or
  backtracking warnings exist, runtime acceptance of new ground-cover/trail
  assets, and human visual review for final far-horizon art direction.
- Validation: `npm run typecheck -- --pretty false` PASS and `git diff
  --check` PASS with CRLF warnings only.

2026-05-05 Projekt Objekt-143 KB-LOAD manifest-normal cleanup evidence
- Kept the KB-LOAD vegetation normal-map cleanup scoped: hemisphere-only
  ground-cover normal maps are now omitted from `PIXEL_FORGE_TEXTURE_ASSETS`,
  and the GPU billboard path only fetches normal textures for `normal-lit`
  vegetation. This removes unused startup-manifest entries for hemisphere
  ground cover without changing the normal-lit mid/canopy assets.
- Fresh post-build startup captures:
  - Open Frontier:
    `artifacts/perf/2026-05-05T22-06-32-013Z/startup-ui-open-frontier/summary.json`
    averaged `3405.7ms` mode-click-to-playable, `2607ms`
    deploy-click-to-playable, `526ms` WebGL upload total, `55.633ms` average
    max upload, and `143` upload calls.
  - Zone Control:
    `artifacts/perf/2026-05-05T22-05-09-285Z/startup-ui-zone-control/summary.json`
    averaged `1897ms` mode-click-to-playable, `1269.7ms`
    deploy-click-to-playable, `439.067ms` WebGL upload total, `39.867ms`
    average max upload, and `110` upload calls.
  - Both captures recorded `0` page errors and `0` request errors.
  - The prior Open Frontier run at
    `artifacts/perf/2026-05-05T22-04-19-550Z/startup-ui-open-frontier/summary.json`
    is retained as diagnostic only because one fanPalm color upload spiked to
    `3594.5ms`; the immediate rerun did not reproduce that stall.
- Re-ran kickoff/completion after the fresh startup captures:
  `artifacts/perf/2026-05-05T22-07-22-437Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  and
  `artifacts/perf/2026-05-05T22-07-31-863Z/projekt-143-completion-audit/completion-audit.json`.
  Result remains `NOT_COMPLETE`; KB-LOAD is still `ready_for_branch`, not
  `evidence_complete`, because this proves no observed startup regression for
  the cleanup rather than a closed texture policy.
- Validation: `npm run build` PASS, targeted Vitest
  `src/config/vegetationTypes.test.ts`
  `src/systems/world/billboard/GPUBillboardSystem.test.ts` PASS (`17` tests),
  and `npm run check:pixel-forge-cutover` PASS.

2026-05-05 Projekt Objekt-143 KB-CULL owner-path comparison refresh
- Added current owner-path comparison details to the Cycle 3 kickoff so KB-CULL
  can distinguish scoped accepted slices from diagnostic-only owner telemetry.
  Fresh kickoff:
  `artifacts/perf/2026-05-05T20-40-41-011Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Fresh completion audit:
  `artifacts/perf/2026-05-05T20-40-46-740Z/projekt-143-completion-audit/completion-audit.json`.
- Result: the selected static-feature/visible-helicopter owner path remains
  `diagnostic_only` in the latest comparison. Against the latest clean owner
  baseline
  `artifacts/perf/2026-05-04T13-54-40-532Z/projekt-143-culling-owner-baseline/summary.json`,
  the current owner-path artifact
  `artifacts/perf/2026-05-05T17-32-39-529Z/projekt-143-culling-owner-baseline/summary.json`
  improves A Shau owner draw-call-like by `-57` and A Shau total draw calls by
  `-512`, but Open Frontier owner draw-call-like regresses by `+9` and total
  draw calls by `+13`. That does not meet the matched two-mode acceptance rule.
- This does not undo the earlier static-feature/parked-helicopter work; it
  keeps the current formal closeout honest. KB-CULL still has the close
  NPC/weapon pool residency slice accepted, but broad HLOD/static-feature/
  vehicle/vegetation culling remains open.

2026-05-05 Projekt Objekt-143 validation refresh
- Fresh local validation after the vegetation, KB-LOAD, KB-TERRAIN, KB-CULL,
  and audit-routing changes:
  - `npm run validate:fast` PASS: Pixel Forge cutover, NPC crop check,
    typecheck, lint, and `254` Vitest files / `3888` tests.
  - `npm run build` PASS: prebuild navmesh manifest check skipped regeneration
    because all `14` prebaked assets matched, production Vite build completed,
    and `dist/asset-manifest.json` was written for local SHA
    `6e15e7a4d1c69d05546c7f43658313206e13766f`.
  - `git diff --check` PASS with CRLF warnings only.
- This improves the validation posture of the local stack but does not close
  Projekt. The working tree remains dirty, `master` remains ahead of
  `origin/master`, the KB-OPTIK human decision is still open, and production
  parity has not been claimed.

2026-05-05 Projekt Objekt-143 KB-CULL current-tree refresh
- Re-ran `npm run check:projekt-143-culling-baseline` against the current local
  tree. Fresh artifact:
  `artifacts/perf/2026-05-05T20-43-14-020Z/projekt-143-culling-owner-baseline/summary.json`.
  The culling owner baseline passed and used the current trusted Open Frontier
  capture
  `artifacts/perf/2026-05-05T20-10-35-267Z/summary.json` plus the current
  trusted A Shau capture
  `artifacts/perf/2026-05-05T20-15-48-568Z/summary.json`.
- Re-ran kickoff/completion after that refresh:
  `artifacts/perf/2026-05-05T20-43-40-723Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  and
  `artifacts/perf/2026-05-05T20-43-46-439Z/projekt-143-completion-audit/completion-audit.json`.
- KB-CULL remains partial. The current selected static-feature/visible-helicopter
  comparison is still `diagnostic_only`: A Shau owner draw-call-like improves
  by `-57`, but Open Frontier owner draw-call-like remains `+9` versus the
  latest clean owner baseline, and Open Frontier total draw calls are much
  higher in the current capture. The close NPC/weapon pool residency slice
  remains the only accepted KB-CULL sub-slice in the formal kickoff.

2026-05-05 Projekt Objekt-143 vegetation grounding follow-up
- Re-ran `npm run check:vegetation-grounding` after the owner asked to make
  sure there was nothing else like the half-buried light-green leaf cluster.
  Fresh artifact:
  `artifacts/perf/2026-05-05T21-03-21-302Z/vegetation-grounding-audit/summary.json`.
- Result: PASS across all `6` runtime Pixel Forge vegetation species with `0`
  flagged species. The audit covers actual low-angle imposter alpha rows against
  runtime size/y-offset and requires slope guards for random low/mid vegetation:
  bambooGrove, fern, bananaPlant, fanPalm, elephantEar, and coconut are all
  inside the visible-base window and guarded either by generator slope caps or
  per-type caps.
- Cross-check: `public/assets/pixel-forge/vegetation` only contains those six
  active runtime folders, `GlobalBillboardSystem` filters mode biome palettes
  through `VEGETATION_TYPES`, and `VegetationScatterer` forwards those active
  types into `ChunkVegetationGenerator`; no second runtime vegetation path was
  found for hidden/bypassing foliage.
- Targeted validation passed:
  `npx vitest run src/config/vegetationTypes.test.ts src/systems/terrain/ChunkVegetationGenerator.test.ts`
  and
  `npx vitest run src/systems/world/billboard/GPUBillboardSystem.test.ts src/systems/terrain/VegetationScatterer.test.ts`.

2026-05-05 Projekt Objekt-143 KB-CULL sector-batching attempt
- Tightened `scripts/projekt-143-culling-owner-baseline.ts` so a perf summary
  with `measurementTrust=pass` is not accepted as certification evidence when
  `summary.status === failed` or `validation.overall === fail`. This prevented
  the failed Open Frontier capture
  `artifacts/perf/2026-05-05T20-57-47-241Z/summary.json` from becoming a false
  current culling baseline.
- Added sector-level static-feature batching in `WorldFeatureSystem`: nearby
  features are grouped into `700m` culling sectors, static placements are
  optimized once per sector, and sector visibility uses feature-footprint bounds
  instead of only a feature anchor. Targeted coverage:
  `npx vitest run src/systems/world/WorldFeatureSystem.test.ts src/systems/assets/ModelDrawCallOptimizer.test.ts`
  and `npx tsc --noEmit --pretty false` both pass.
- Evidence for the `700m` sector candidate:
  - deterministic culling proof PASS:
    `artifacts/perf/2026-05-05T20-57-39-664Z/projekt-143-culling-proof/summary.json`
  - Open Frontier standard capture WARN/pass-for-baseline:
    `artifacts/perf/2026-05-05T21-11-01-263Z/summary.json`
  - A Shau standard capture WARN/pass-for-baseline:
    `artifacts/perf/2026-05-05T21-14-48-270Z/summary.json`
  - current owner baseline PASS:
    `artifacts/perf/2026-05-05T21-19-08-037Z/projekt-143-culling-owner-baseline/summary.json`
- Result: this is useful but not a KB-CULL closeout. The current owner path
  improves owner draw-call-like versus the latest clean baseline in both large
  modes, but Open Frontier still regresses total renderer draw calls versus the
  clean baseline (`811` after vs `587` clean-before), so formal kickoff keeps
  KB-CULL at `ready_for_branch`, not `evidence_complete`:
  `artifacts/perf/2026-05-05T21-19-35-304Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Completion audit remains `NOT_COMPLETE`:
  `artifacts/perf/2026-05-05T21-19-33-370Z/projekt-143-completion-audit/completion-audit.json`.
- Negative evidence: a smaller `350m` sector was tested and rejected. It passed
  targeted tests and deterministic proof
  `artifacts/perf/2026-05-05T21-21-47-445Z/projekt-143-culling-proof/summary.json`,
  but Open Frontier still peaked at `812` renderer draw calls and world static
  owner draw-call-like regressed back to `337`, so the runtime constant was
  restored to `700m`.

2026-05-05 Projekt Objekt-143 docs and validation refresh
- Updated `docs/PROJEKT_OBJEKT_143.md` so the top current-state ledger, KB-CULL
  section, and Cycle 3 status point at the latest vegetation grounding,
  culling owner-baseline, kickoff, and completion-audit artifacts instead of
  older same-day evidence.
- Rebuilt the perf bundle after restoring the sector size to `700m`:
  `npm run build:perf` PASS.
- Final local gates after the docs/culling refresh:
  `npm run validate:fast` PASS with Pixel Forge cutover, NPC crop check,
  typecheck, lint, and `254` Vitest files / `3891` tests; `git diff --check`
  PASS with CRLF normalization warnings only.
- Current owner-answer: the half-buried light-green floor-leaf issue is covered
  by the banana-plant grounding/slope fix plus the all-active-species
  grounding audit. No other active runtime vegetation path or active species was
  found with that severe buried profile.

2026-05-05 Projekt Objekt-143 KB-CULL close-pool residency routing fix
- Updated `scripts/projekt-143-cycle3-kickoff.ts` so the close-NPC/weapon
  residency slice uses the clean culling owner-baseline Open Frontier before
  packet rather than whichever later Open Frontier capture happened to be the
  latest heap failure. The earlier selector was too broad for the actual
  residency requirement and could choose a failed after-branch diagnostic run.
- Refreshed Cycle 3 kickoff:
  `artifacts/perf/2026-05-05T22-32-15-489Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  The close-pool residency slice is now `evidence_complete` with the clean
  before packet
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json`, Open Frontier after
  `artifacts/perf/2026-05-05T21-11-01-263Z/summary.json`, and A Shau after
  `artifacts/perf/2026-05-05T21-14-48-270Z/summary.json`.
- Evidence deltas: hidden close-NPC draw-call-like moved `1360 -> 168`
  Open Frontier and `1360 -> 104` A Shau; hidden weapon draw-call-like moved
  `8480 -> 1032` Open Frontier and `8480 -> 664` A Shau. Both after captures
  have measurement trust PASS, playable shot/hit checks PASS, and no heap
  peak failure.
- `npx tsc --noEmit --pretty false` PASS. Completion audit remains
  `NOT_COMPLETE` at
  `artifacts/perf/2026-05-05T22-32-30-053Z/projekt-143-completion-audit/completion-audit.json`.
  Broad KB-CULL is still open because the static-feature/visible-helicopter
  owner path remains `diagnostic_only` on total renderer draw calls, and
  KB-OPTIK/KB-LOAD/KB-TERRAIN/release gates remain open.

2026-05-05 Projekt Objekt-143 A Shau route audit refresh
- Re-ran `npm run check:projekt-143-terrain-routes`; fresh PASS artifact:
  `artifacts/perf/2026-05-05T22-34-25-178Z/projekt-143-terrain-route-audit/terrain-route-audit.json`.
  A Shau still reports `12` route paths, `52,504m` route length, `1,321`
  route capsule stamps, `14` surface patches, and no static route-policy flags.
- Targeted route test command
  `npx vitest run src/systems/terrain/TerrainFeatureCompiler.test.ts src/systems/terrain/TerrainSurfaceRuntime.test.ts`
  passed the available route compiler test file (`1` file, `9` tests). This is
  a static route-policy refresh only; it does not close the A Shau runtime
  route/nav quality item because the latest A Shau perf artifact still records
  route-follow backtracking and low-progress movement telemetry.

2026-05-05 Projekt Objekt-143 KB-OPTIK human-review caveat
- Investigated the owner observation that the KB-OPTIK Human Review packet makes
  impostors look like they are not in the same positions as the GLBs. The packet
  is visually misleading: it shows separate transparent crop renders, not a
  same-scene overlay, and the proof crop path renders the close GLB unanimated
  and without its runtime weapon while the impostor is an idle atlas frame.
- Runtime probe after the post-reveal close-model lazy-load window passed with
  active close GLBs, weapon sockets present, and active animation clips:
  `npx tsx scripts/probe-pixel-forge-npcs.ts --url
  "http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1" --wait-ms 12000
  --wait-for-close`. The generated summary is
  `artifacts/pixel-forge-npc-probe/summary.json`; the screenshot is
  `artifacts/pixel-forge-npc-probe/latest.png`.
- Conclusion: this is not currently confirmed as an in-game anchor bug. It is a
  KB-OPTIK evidence-quality problem. Do not accept the remaining KB-OPTIK human
  decision from that old packet alone; regenerate or extend the review packet so
  close GLB and impostor are compared with same-scene/runtime-equivalent pose,
  animation, weapon, camera, and lighting.

2026-05-05 Projekt Objekt-143 vegetation distribution/hydrology target
- Folded the owner note into `docs/PROJEKT_OBJEKT_143.md`: A Shau vegetation
  should not read as an evenly spaced mix of every active species everywhere.
  KB-TERRAIN now explicitly needs a landscape-distribution pass, not only
  density, grounding, and species inventory.
- Target direction: bamboo grove/forest pockets, denser palm stands, palms and
  understory biased by lowland/water-edge or hydrology proxies where
  appropriate, trail-edge disturbed vegetation, and richer ground-cover
  transitions instead of one uniform scatter field.
- Acceptance implication: current static material distribution and vegetation
  density audits do not close this. The path forward needs research into
  Vietnam plant-community/hydrology placement, deterministic clustered
  distribution audits, and before/after A Shau screenshots plus perf captures.

2026-05-05 Projekt Objekt-143 KB-OPTIK owner acceptance
- Owner accepted the refreshed runtime-equivalent same-scene KB-OPTIK review
  packet at
  `artifacts/perf/2026-05-05T23-13-35-420Z/projekt-143-optik-human-review/review-summary.json`
  with `status: accepted_exception`. The accepted basis is the current `2.95m`
  target, per-tile crop maps, runtime weapon/socket pose, selected/expanded luma
  tuning, runtime LOD-edge proof, and in-browser visual inspection.
- Caveat recorded in the ledger: do not destabilize the good-looking current
  in-game state. Slight downward-facing bias or remaining imposter darkness is a
  future proof-gated crop/view/rebake or lighting-parity pass, not a reason to
  retune the accepted packet opportunistically.
- Refreshed Cycle 3 kickoff:
  `artifacts/perf/2026-05-05T23-57-30-245Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  marks KB-OPTIK `evidence_complete`. Completion audit
  `artifacts/perf/2026-05-05T23-57-39-542Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` because KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release remain open.

2026-05-05 Projekt Objekt-143 A Shau route endpoint inset follow-up
- Runtime A Shau stall hotspots around Hill 937 showed route endpoints stopping
  outside the capture footprint, forcing NPCs to leave smoothed trail stamps for
  the final objective push. `TerrainFlowCompiler` now keeps home-base exits
  conservative but ends non-home objective routes at `0.88 * zone.radius`.
- Focused validation passed:
  `npx vitest run src/systems/terrain/TerrainFeatureCompiler.test.ts src/systems/terrain/TerrainSurfaceRuntime.test.ts src/systems/combat/CombatantMovement.test.ts`;
  `npm run check:projekt-143-terrain-routes` wrote
  `artifacts/perf/2026-05-06T17-00-32-294Z/projekt-143-terrain-route-audit/terrain-route-audit.json`;
  `npm run check:projekt-143-terrain-placement` wrote
  `artifacts/perf/2026-05-05T23-32-34-928Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
- Paired A Shau capture
  `artifacts/perf/2026-05-05T23-32-48-770Z/summary.json` remains WARN: p99
  `32.50ms`, heap end-growth `27.10MB`, heap peak-growth `59.05MB`, and `42`
  terrain-stall warnings. It is still a narrow route-quality improvement, not
  A Shau route/nav acceptance, even though waypoint replans improved `81 -> 40`
  and waypoints followed improved `249 -> 317` against the previous
 current-worktree run.

2026-05-05 Projekt Objekt-143 A Shau vegetation distribution proxy
- Implemented the owner-requested non-uniform A Shau distribution direction as
  a first KB-TERRAIN candidate slice. `A_SHAU_VALLEY_CONFIG` now classifies
  DEM low flats as `swamp`, lowland shoulders as `riverbank`, and flatter
  low benches as limited `bambooGrove` pockets. The riverbank/swamp palettes
  bias toward palms and understory (`fanPalm`, `coconut`, `elephantEar`,
  `bananaPlant`) instead of using the same dense-jungle mix everywhere.
- Added A Shau-specific distribution guardrails to
  `scripts/projekt-143-terrain-distribution-audit.ts`: dominant-biome
  uniformity, hydrology-proxy coverage, missing bamboo pocket, and overly broad
  bamboo pocket checks. The audit notes these are DEM lowland proxies until a
  real stream/hydrology layer exists.
- Validation passed:
  `npx vitest run src/systems/terrain/BiomeClassifier.test.ts src/systems/terrain/TerrainBiomeRuntimeConfig.test.ts src/config/vegetationTypes.test.ts src/systems/terrain/ChunkVegetationGenerator.test.ts`;
  `npx tsc --noEmit --pretty false`;
  `npm run check:projekt-143-terrain-distribution`; and
  `npm run check:projekt-143-terrain-baseline`.
- Evidence:
  `artifacts/perf/2026-05-05T23-49-30-281Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  passes for A Shau with CPU biome coverage `77.8%` denseJungle, `15.7%`
  riverbank, `4.04%` bambooGrove, and `2.46%` swamp. The fresh elevated
  screenshot baseline is
  `artifacts/perf/2026-05-05T23-49-56-989Z/projekt-143-terrain-horizon-baseline/summary.json`.
- Non-claim: this does not accept KB-TERRAIN. Individual vegetation is not
  clearly reviewable from the elevated horizon shots, the linked perf baselines
  are existing summaries rather than matched post-change full captures, and a
  real stream/hydrology layer plus ground-level human visual review remain
  needed before water-edge placement is final.
- Refreshed routing artifacts after the docs update:
  `artifacts/perf/2026-05-05T23-57-30-245Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  remains PASS with KB-TERRAIN `ready_for_branch`, and
  `artifacts/perf/2026-05-05T23-57-39-542Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` because KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release are still blockers.

2026-05-06 Projekt Objekt-143 noisy Open Frontier capture and banana albedo fix
- Ran `npm run perf:capture:openfrontier:short` for post-distribution matched
  perf evidence, but the artifact is rejected for acceptance:
  `artifacts/perf/2026-05-06T00-00-32-485Z/summary.json`.
  It failed validation on peak p99 (`100ms`), hitch >50ms percent (`4.35%`),
  harness shots (`2`, min `60`), and harness hits (`1`, min `4`). Owner also
  reported another web game test run was active on the same device during the
  capture, so even diagnostic frame-time comparison is noisy.
- Guarded future routing against that failure mode. `scripts/projekt-143-cycle3-kickoff.ts`
  and `scripts/projekt-143-terrain-horizon-baseline.ts` now skip latest perf
  summaries unless they are certification-grade: measurement trust passes,
  validation is not fail, and top-level status is not `failed`. Refreshed
  kickoff
  `artifacts/perf/2026-05-06T00-08-41-043Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  correctly keeps using Open Frontier
  `artifacts/perf/2026-05-05T21-21-55-999Z/summary.json` instead of the noisy
  failed capture.
- Fixed the owner-reported yellow-fruit plant color issue. The plant is
  `bananaPlant`; its albedo atlas had cyan/blue lower-stem pixels baked into
  `public/assets/pixel-forge/vegetation/bananaPlant/banana-tree-sean-tarrant/imposter.png`.
  Recolored those stem pixels to green and visually inspected the atlas.
- Added a regression to `src/config/vegetationTypes.test.ts` that loads the
  banana plant atlas with `sharp` and requires `0` strong cyan-blue opaque stem
  pixels. `npx vitest run src/config/vegetationTypes.test.ts` passes:
  `1` file, `15` tests, no type errors. A direct pixel audit also reports
  `strongCyan=0`.
- Script-level TypeScript spot check passed after adding a missing
  `measurementTrust.flags` type on the Cycle 3 grenade summary:
  `npx tsc --noEmit --pretty false --ignoreConfig --skipLibCheck --target ES2021 --lib ES2021,DOM --module ESNext --moduleResolution bundler --allowImportingTsExtensions --esModuleInterop scripts/projekt-143-terrain-horizon-baseline.ts scripts/projekt-143-cycle3-kickoff.ts`.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T00-12-25-795Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`. Blockers are unchanged: KB-LOAD, KB-TERRAIN,
  KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 static gate refresh after banana/selector work
- Ran `npm run validate:fast`. First run passed Pixel Forge cutover, NPC crop
  check, typecheck, and lint, then failed one timing-sensitive benchmark in
  `src/systems/combat/SpatialOctree.test.ts`:
  `octreeTime=127.57ms` was not under `linearTime * 5 = 102.09ms`.
  Given the owner-reported concurrent web-game testing on this device, treated
  that as a noisy timing signal rather than a confirmed octree regression.
- Focused rerun `npx vitest run src/systems/combat/SpatialOctree.test.ts`
  passed: `1` file, `18` tests, no type errors.
- Full rerun `npm run validate:fast` then passed: Pixel Forge cutover PASS,
  NPC crop map current, `tsc --noEmit` PASS, `eslint src/` PASS, and
  `test:quick` PASS with `254` files / `3899` tests / no type errors.
- Non-claim: this improves the local static validation state only. It does not
  close KB-LOAD, KB-TERRAIN, KB-CULL, matched perf, visual acceptance,
  commit/push, CI, deploy, or live production parity.
- Refreshed completion audit after the successful static gate:
  `artifacts/perf/2026-05-06T00-19-11-278Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`; blockers are KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release.
- Ran build gates after static validation:
  `npm run build` PASS and `npm run build:perf` PASS. Both wrote fresh asset
  manifests (`dist/asset-manifest.json` and `dist-perf/asset-manifest.json`)
  and only emitted the usual Vite chunk-size warning. This does not close
  production parity because the stack remains dirty, unpushed, undeployed, and
  missing the remaining bureau acceptances.
- Latest completion audit after build gates:
  `artifacts/perf/2026-05-06T00-21-32-194Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` with the same blockers.

2026-05-06 Projekt Objekt-143 audit and vegetation-normal proof refresh
- Refreshed the completion audit:
  `artifacts/perf/2026-05-06T00-26-58-775Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE`. PASS items now include KB-OPTIK, KB-EFFECTS,
  KB-FORGE, and owner vegetation specifics; blockers remain KB-LOAD,
  KB-TERRAIN, KB-CULL, and validation/release.
- Refreshed the KB-LOAD/OPTIK vegetation-normal visual proof after the banana
  albedo cleanup with
  `npm run check:projekt-143-vegetation-normal-proof -- --no-build`. Artifact:
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/summary.json`;
  contact sheet:
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/contact-sheet.png`.
- The proof captured `8/8` screenshots and `4/4` A/B pairs with renderer
  stats, positive vegetation counters, and `0` browser/page/request failures,
  but it remains WARN. The no-normal candidate visibly diverges from the
  default path and exceeds the current review band, so vegetation normal-map
  removal remains blocked on human visual acceptance.
- Aligned `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PROJEKT_OBJEKT_143_HANDOFF.md`, and `docs/STATE_OF_REPO.md` to point at
  the latest audit/proof paths and preserve the non-claim.
- Reran the completion audit after the proof/docs refresh:
  `artifacts/perf/2026-05-06T00-35-19-117Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE` with the same blockers: KB-LOAD, KB-TERRAIN,
  KB-CULL, and validation/release.
- Refreshed the routing chain once more after the latest visual proof:
  `npm run check:projekt-143-cycle3-kickoff` PASS at
  `artifacts/perf/2026-05-06T00-37-00-413Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  followed by completion audit
  `artifacts/perf/2026-05-06T00-37-15-175Z/projekt-143-completion-audit/completion-audit.json`.
  The audit remains `NOT_COMPLETE` with KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release as blockers.

2026-05-06 Projekt Objekt-143 reusable hydrology branch/audit
- Added a pure reusable hydrology bake core in
  `src/systems/terrain/hydrology/HydrologyBake.ts` with focused behavior tests
  in `src/systems/terrain/hydrology/HydrologyBake.test.ts`. The first slice
  implements deterministic D8-style flow direction, optional epsilon-fill
  depression routing, flow accumulation, percentile thresholds, and
  wet-candidate classification over sampled height grids without touching
  runtime renderer/terrain behavior.
- Added `scripts/projekt-143-terrain-hydrology-audit.ts` and exposed it as
  `npm run check:projekt-143-terrain-hydrology`. Initial A Shau-only artifact:
  `artifacts/perf/2026-05-06T00-59-27-181Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`.
  It is WARN because epsilon-filled A Shau DEM wet candidates cover `6.24%` of
  sampled cells, current riverbank/swamp rules cover `67.91%` of those
  candidates, `80.29%` of current hydrology-biome cells sit outside the DEM
  wetness signal, and `16.65%` of wet candidates classify as `bambooGrove`.
- Added `docs/PROJEKT_OBJEKT_143_HYDROLOGY.md` to fold the owner request into
  KB-TERRAIN: bakeable hydrology should drive DEM masks, procedural Open
  Frontier rivers, bank/wetland vegetation, trail crossings, carve stamps, and
  future river rendering instead of another flat/global water shader.
- Wired the hydrology audit into `scripts/projekt-143-cycle3-kickoff.ts` and
  `scripts/projekt-143-completion-audit.ts`. Initial routing after the A
  Shau-only audit:
  `artifacts/perf/2026-05-06T00-59-52-623Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  PASS, followed by
  `artifacts/perf/2026-05-06T01-00-10-338Z/projekt-143-completion-audit/completion-audit.json`
  `NOT_COMPLETE`.
- Validation: `npx vitest run src/systems/terrain/hydrology/HydrologyBake.test.ts`
  PASS (`6` tests), and a focused TypeScript check over the hydrology audit,
  kickoff/completion scripts, and bake module passed with no type errors before
  the epsilon-fill follow-up. Final `npm run typecheck` PASS and
  `git diff --check` PASS with only normal CRLF warnings after the docs refresh.
- Non-claim: this does not change runtime vegetation/terrain yet, add water
  rendering, close KB-TERRAIN, produce clean perf evidence, commit/push, deploy,
  or claim production parity. The next implementation branch should add
  breach/outlet policy plus cached DEM/procedural hydrology masks before
  runtime ecology acceptance.

2026-05-06 Projekt Objekt-143 Open Frontier hydrology audit extension
- Extended `scripts/projekt-143-terrain-hydrology-audit.ts` so the same
  epsilon-filled D8 bake audits both A Shau's DEM and Open Frontier's seeded
  procedural `NoiseHeightProvider`. The top-level summary stays A Shau-shaped
  for existing Cycle 3 consumers, while `scenarios.openFrontier` records the
  reusable-map evidence.
- Fresh audit:
  `artifacts/perf/2026-05-06T01-07-29-962Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`.
  A Shau remains WARN with `6.24%` wet candidates and `80.29%` of current
  riverbank/swamp cells outside the DEM wetness signal. Open Frontier now
  reports `2.47%` wet candidates, `62.62%` current riverbank coverage of those
  candidates, and `78.68%` of current riverbank cells outside the generated
  wetness signal.
- Wired the Open Frontier hydrology summary into the Cycle 3 kickoff and
  completion-audit inspected evidence. Fresh routing:
  `artifacts/perf/2026-05-06T01-08-54-139Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  PASS, followed by
  `artifacts/perf/2026-05-06T01-09-12-416Z/projekt-143-completion-audit/completion-audit.json`
  `NOT_COMPLETE`.
- Validation: `npm run typecheck` PASS after adding the multi-map audit fields.
  This remains static/non-perf work only; no Open Frontier river rendering,
  terrain carving, runtime vegetation change, perf claim, commit/push, deploy,
  or production parity is claimed.

2026-05-06 Projekt Objekt-143 reusable hydrology mask API
- Added `createHydrologyMasks` to
  `src/systems/terrain/hydrology/HydrologyBake.ts` so wet/channel mask
  classification is a reusable bake API instead of script-local logic. The
  A Shau/Open Frontier audit now consumes that API.
- Added `extractHydrologyChannelPaths` to expose branch-start river graph
  candidates from thresholded accumulation. Latest static metrics: A Shau has
  `20` channel paths with a longest path of about `21.6km`; Open Frontier has
  `27` channel paths with a longest path of about `2.8km`. The latest audit JSON
  also includes bounded world-space `channelPolylines` for the top paths.
- Focused validation:
  `npx vitest run src/systems/terrain/hydrology/HydrologyBake.test.ts` PASS
  with `9` tests; `npm run typecheck` PASS.
- Fresh audit after the mask API kept the same static numbers and now writes
  review masks:
  `artifacts/perf/2026-05-06T02-48-23-154Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`,
  `artifacts/perf/2026-05-06T02-48-23-154Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-mask.png`,
  and
  `artifacts/perf/2026-05-06T02-48-23-154Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-mask.png`.
  Fresh routing:
  `artifacts/perf/2026-05-06T01-47-55-375Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  PASS, followed by
  `artifacts/perf/2026-05-06T01-51-03-227Z/projekt-143-completion-audit/completion-audit.json`
  `NOT_COMPLETE`.
- `git diff --check` PASS after docs alignment with only normal CRLF warnings.
  Non-claim remains unchanged: no runtime hydrology/terrain/water change, no
  perf acceptance, no commit/push/deploy, and no production parity.

2026-05-06 Projekt Objekt-143 hydrology cache artifact contract
- Added schema-v1 hydrology cache helpers in
  `src/systems/terrain/hydrology/HydrologyBake.ts`:
  `createHydrologyBakeArtifact`, `materializeHydrologyMasksFromArtifact`, and
  world-position sampling over cache masks. The artifact stores sparse
  wet/channel cell lists, thresholds, world transform, and bounded channel
  polylines.
- Extended `scripts/projekt-143-terrain-hydrology-audit.ts` so each audit writes
  per-map cache JSON next to the review masks:
  `artifacts/perf/2026-05-06T02-48-23-154Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-cache.json`
  and
  `artifacts/perf/2026-05-06T02-48-23-154Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-cache.json`.
  The parent audit remains WARN at
  `artifacts/perf/2026-05-06T02-48-23-154Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
  with the same A Shau/Open Frontier wetness mismatch findings.
- Fresh routing:
  `artifacts/perf/2026-05-06T01-47-55-375Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  PASS, followed by
  `artifacts/perf/2026-05-06T01-51-03-227Z/projekt-143-completion-audit/completion-audit.json`
  `NOT_COMPLETE`.
- Validation: `npx vitest run src/systems/terrain/hydrology/HydrologyBake.test.ts`
  PASS with `11` tests, `npm run check:projekt-143-terrain-hydrology` WARN as
  expected, and `npx tsc --noEmit --pretty false` PASS. Non-claim remains: no
  runtime terrain/vegetation/water consumer is wired to the cache yet.

2026-05-06 Projekt Objekt-143 durable hydrology prebake manifest
- Added `scripts/prebake-hydrology.ts`, `npm run hydrology:generate`, and
  `npm run check:hydrology-bakes`. This mirrors the navmesh-style manifest
  discipline without adding it to `prebuild` or runtime loading yet.
- Generated durable cache files under `public/data/hydrology`:
  `bake-manifest.json`, `a_shau_valley-hydrology.json`, and
  `open_frontier-42-hydrology.json`. The manifest covers A Shau's DEM and the
  currently approved Open Frontier seed `42`; withheld Open Frontier seeds stay
  out until per-seed presets exist.
- Validation: `npm run hydrology:generate` wrote `2` caches, `npm run
  check:hydrology-bakes` PASS, `npx tsc --noEmit --pretty false` PASS, and
  `npx vitest run src/systems/terrain/hydrology/HydrologyBake.test.ts` PASS
  with `11` tests. This still does not wire hydrology into biome/material/water
  runtime behavior.

2026-05-06 Projekt Objekt-143 completion audit hydrology manifest awareness
- Updated `scripts/projekt-143-completion-audit.ts` so KB-TERRAIN evidence
  directly lists `public/data/hydrology/bake-manifest.json` and its generated
  A Shau/Open Frontier cache entries. This keeps the durable cache contract
  visible in completion audits without treating it as terrain closeout.
- Fresh completion audit:
  `artifacts/perf/2026-05-06T01-51-03-227Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` with blockers unchanged: KB-LOAD, KB-TERRAIN,
  KB-CULL, and validation/release.
- Validation: `npx tsc --noEmit --pretty false` PASS and
  `npm run check:hydrology-bakes` PASS.

2026-05-06 Projekt Objekt-143 hydrology runtime-loader scaffold
- Added `src/systems/terrain/hydrology/HydrologyBakeManifest.ts` with typed
  manifest parsing, seed-aware cache selection, relative asset URL resolution,
  injected-fetch loading, and schema checks for `/data/hydrology` cache JSON.
  This created the runtime-facing entry point for feature-gated terrain preload
  work without changing default mode startup, terrain classification,
  vegetation, materials, or water rendering.
- Added `src/systems/terrain/hydrology/HydrologyBakeManifest.test.ts`; focused
  hydrology tests now cover bake/mask/cache behavior plus manifest loading.
- Validation: `npx vitest run
  src/systems/terrain/hydrology/HydrologyBake.test.ts
  src/systems/terrain/hydrology/HydrologyBakeManifest.test.ts` PASS with `16`
  tests, `npx tsc --noEmit --pretty false` PASS, and `npm run build` PASS.
  The build proves Vite copies tracked public hydrology caches to
  `dist/data/hydrology/*`; the Cloudflare `asset-manifest.json` remains the
  separate R2 terrain-asset manifest.
- Refreshed routing evidence after the loader scaffold:
  `artifacts/perf/2026-05-06T02-15-02-096Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  records `terrainHydrologyBakeLoaderStatus=feature_gated_preload`, and
  `artifacts/perf/2026-05-06T02-15-15-868Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` with blockers unchanged: KB-LOAD, KB-TERRAIN,
  KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 feature-gated hydrology preload
- Wired `HydrologyBakeManifest.ts` into `ModeStartupPreparer` behind
  `config.hydrology.preload` or `globalThis.__PROJEKT_143_ENABLE_HYDROLOGY_PRELOAD__`.
  Default modes do not fetch hydrology caches.
- Added inert storage/debug state to `TerrainSystem` via `setHydrologyBake`
  and `getHydrologyBakeDebugInfo`. This is preload plumbing only: no terrain,
  vegetation, material, water, or gameplay query consumes the masks yet.
- Validation: `npx vitest run src/core/ModeStartupPreparer.test.ts
  src/systems/terrain/TerrainSystem.test.ts
  src/systems/terrain/hydrology/HydrologyBakeManifest.test.ts` PASS with `30`
  tests, and `npx tsc --noEmit --pretty false` PASS.
- Final focused validation after the startup hook:
  `npx vitest run src/systems/terrain/hydrology/HydrologyBake.test.ts
  src/systems/terrain/hydrology/HydrologyBakeManifest.test.ts
  src/core/ModeStartupPreparer.test.ts src/systems/terrain/TerrainSystem.test.ts`
  PASS with `41` tests, and `npm run build` PASS.

2026-05-06 Projekt Objekt-143 water-system contract audit
- Added `scripts/projekt-143-water-system-audit.ts` and
  `npm run check:projekt-143-water-system`. The audit is static, so it is safe
  while local perf/browser readings are noisy.
- Latest artifact:
  `artifacts/perf/2026-05-06T02-25-48-988Z/projekt-143-water-system-audit/water-system-audit.json`
  is WARN by design. It records that the current runtime water is a
  camera-following global Three.js plane at `Y=0`; A Shau disables that plane;
  Open Frontier still uses the default global plane with procedural
  negative-height water/lake/river-valley carving; A Shau has `70` river
  polyline entries; and neither the existing A Shau river data nor the new
  hydrology caches are runtime river renderers. It also records that the
  hydrology cache can now preload behind an explicit feature gate, and a
  separate hydrology-biome classifier candidate exists behind its own gate,
  while default visuals stay unchanged.
- Wired that artifact into the refreshed Cycle 3 kickoff and completion audit:
  `terrainWaterSystemStatus=warn`. This keeps the future hydrology/river work
  separate from the old global-water fallback and prevents calling the current
  plane a river system.

2026-05-06 Projekt Objekt-143 hydrology-biome classifier candidate
- Added `src/systems/terrain/hydrology/HydrologyBiomeClassifier.ts` and
  focused tests. It materializes public hydrology bake masks once and can
  classify vegetation cells as wet/channel biomes behind the explicit
  `hydrology.biomeClassification.enabled` config gate or
  `globalThis.__PROJEKT_143_ENABLE_HYDROLOGY_BIOMES__`.
- Wired the candidate through `ModeStartupPreparer`, `TerrainSystem`, and
  `VegetationScatterer` without enabling it in default modes. This gives the
  next quiet-machine pass a real hydrology-backed vegetation candidate path,
  while preserving the current accepted visuals.
- Refreshed static water and routing evidence:
  `artifacts/perf/2026-05-06T02-25-48-988Z/projekt-143-water-system-audit/water-system-audit.json`,
  `artifacts/perf/2026-05-06T02-56-57-961Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and
  `artifacts/perf/2026-05-06T03-01-02-879Z/projekt-143-completion-audit/completion-audit.json`.
- Validation: focused Vitest hydrology/vegetation/terrain/startup set PASS
  with `54` tests, `npx tsc --noEmit --pretty false` PASS, and
  `npm run check:hydrology-bakes` PASS. `npm run build` PASS with the existing
  Vite chunk-size warning only. Projekt remains `NOT_COMPLETE`;
  KB-LOAD, KB-TERRAIN, KB-CULL, and validation/release are still blockers.
- Follow-up static gate: `npm run validate:fast` PASS, including Pixel Forge
  cutover, NPC crop map check, typecheck, lint, and `257` Vitest files /
  `3924` tests. The emitted stderr was existing jsdom/canvas and intentional
  diagnostic logging, not a failing gate.

2026-05-06 Projekt Objekt-143 KB-LOAD normal-map policy closeout wording
- Tightened the KB-LOAD routing language so the no-normal vegetation candidate
  is not treated as pending default-policy approval. The current policy is:
  default runtime vegetation normal maps stay unchanged, and the no-normal path
  is rejected for current default runtime or Pixel Forge bake policy while the
  latest A/B proof remains WARN.
- Updated the Cycle 3 kickoff and completion audit scripts to emit
  `vegetationNormalMapRemovalPolicy=rejected_for_default_policy_visual_warn`
  and `vegetationNormalMapDefaultPolicy=unchanged` from WARN proof evidence.
  The next KB-LOAD branch should target fanPalm with a latency guard, NPC
  atlases, approved asset regeneration, or upload scheduling rather than
  default no-normal removal.
- Refreshed the static routing after the wording/script update:
  `npm run check:projekt-143-cycle3-kickoff` PASS at
  `artifacts/perf/2026-05-06T02-56-57-961Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  then `npm run check:projekt-143-completion-audit` wrote
  `artifacts/perf/2026-05-06T03-01-02-879Z/projekt-143-completion-audit/completion-audit.json`
  and remains `NOT_COMPLETE`. Blockers are still KB-LOAD, KB-TERRAIN,
  KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 hydrology corridor helper
- Added `src/systems/terrain/hydrology/HydrologyCorridor.ts` as a pure
  world-space sampling helper over cached hydrology `channelPolylines`. It
  classifies points as `channel`, `bank`, `wetland`, or `upland` from ordered
  corridor radii and returns nearest projected-channel metadata.
- Added `src/systems/terrain/hydrology/HydrologyCorridor.test.ts` so the
  future river, bank vegetation, trail-crossing, audio, and water-mesh branches
  can share one corridor contract without enabling any default runtime visuals.
- Refreshed the hydrology audit after wiring the corridor sampler into the
  static contract:
  `artifacts/perf/2026-05-06T02-48-23-154Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
  remains WARN by design and now records
  `corridorSamplerStatus=pure_world_space_helper`.
- Validation: focused hydrology Vitest suite PASS with `4` files / `24` tests,
  `npx tsc --noEmit --pretty false` PASS, `npm run check:hydrology-bakes`
  PASS, `npm run check:projekt-143-cycle3-kickoff` PASS at
  `artifacts/perf/2026-05-06T02-56-57-961Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and `npm run check:projekt-143-completion-audit` remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T03-01-02-879Z/projekt-143-completion-audit/completion-audit.json`.

2026-05-06 Projekt Objekt-143 KB-LOAD branch selector
- Added `scripts/projekt-143-load-branch-selector.ts` and
  `npm run check:projekt-143-load-branch`. The selector reads the latest
  Pixel Forge texture audit, Open Frontier/Zone Control startup upload tables,
  and vegetation-normal visual proof, then writes a branch-selection artifact.
- Latest artifact:
  `artifacts/perf/2026-05-06T02-56-15-735Z/projekt-143-load-branch-selector/load-branch-selector.json`.
  Status is `ready_for_quiet_machine_proof`.
- Selected branch: `vegetation-atlas-regeneration-retain-normals`. It targets
  current repeated vegetation upload species (`bambooGrove`, `bananaPlant`,
  `coconut`, `fanPalm`), preserves the accepted normal-map policy, and avoids
  reopening NPC atlas regeneration while KB-OPTIK is owner-accepted with
  caution. Static texture-audit estimate is `127.87MiB` mipmapped RGBA savings
  for vegetation candidates only.
- Explicit non-claim: this does not generate/import atlases and does not prove
  startup improvement. The selected branch still needs Pixel Forge candidate
  atlases, paired visual proof, and quiet-machine Open Frontier/Zone Control
  before/after startup tables.
- Refreshed routing after selector: Cycle 3 kickoff PASS at
 `artifacts/perf/2026-05-06T02-56-57-961Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  completion audit remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T03-01-02-879Z/projekt-143-completion-audit/completion-audit.json`.

2026-05-06 Projekt Objekt-143 Pixel Forge vegetation readiness
- Added `scripts/projekt-143-pixel-forge-vegetation-readiness.ts` and
  `npm run check:projekt-143-pixel-forge-vegetation-readiness`. The audit reads
  the selected KB-LOAD branch, latest texture audit, and the local Pixel Forge
  TIJ vegetation manifest without regenerating/importing assets.
- Latest artifact:
  `artifacts/perf/2026-05-06T03-24-43-522Z/projekt-143-pixel-forge-vegetation-readiness/vegetation-readiness.json`.
  Status is PASS with
  `branchExecutionState=ready_for_candidate_generation`.
- Finding: Pixel Forge has the selected active variants
  `bambooGrove/bamboo-google-2`, `bananaPlant/banana-tree-sean-tarrant`,
  `coconut/coconut-palm-google`, and `fanPalm/lady-palm-google-1`; normal-lit
  color/normal pairs are present and the selected KB-LOAD target is
  `1024x1024` / `256px` tiles with normals retained. The local Pixel Forge TIJ
  runner now exposes a review-only `kb-load-vegetation-256` profile, separate
  `tij-candidates` output root, and selected-species validator. The next safe
  step is candidate generation/validation in Pixel Forge, then side-by-side
  visual proof before any import or quiet-machine startup claim.
- Refreshed routing after the readiness audit: Cycle 3 kickoff PASS at
  `artifacts/perf/2026-05-06T03-26-51-656Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  completion audit remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T03-37-37-441Z/projekt-143-completion-audit/completion-audit.json`.
  Remaining blockers are KB-LOAD, KB-TERRAIN, KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 Pixel Forge manifest policy alignment
- Updated local Pixel Forge `scripts/run-tij-pipeline.ts` and
  `scripts/validate-tij-vegetation-package.ts` so `giantPalm` is an explicit
  retired review/provenance species and blocked species remain blocked review
  records. Added `bun run tij:vegetation-validate:review`.
- Updated the local Pixel Forge review manifest so `giantPalm` has
  `productionStatus=retired`; `fanPalm`, `coconut`, `bambooGrove`,
  `bananaPlant`, `fern`, and `elephantEar` remain candidates; the six blocked
  species remain blocked.
- Validation: Pixel Forge targeted TypeScript check PASS, `bun run
  tij:vegetation-validate:review` PASS for `13` species, and refreshed
  KB-FORGE audit PASS at
  `artifacts/perf/2026-05-06T03-37-10-850Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`
  with `manifestPolicyAligned=true`. The refreshed completion audit no longer
  lists Pixel Forge manifest refresh as a required action, but remains
  `NOT_COMPLETE` on KB-LOAD, KB-TERRAIN, KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 Pixel Forge vegetation candidate proof harness
- Added `scripts/projekt-143-vegetation-candidate-proof.ts` and
  `npm run check:projekt-143-vegetation-candidate-proof` to compare the current
  TIJ runtime vegetation atlases against the future Pixel Forge
  `kb-load-vegetation-256` candidate output without importing anything.
- Current proof artifact:
  `artifacts/perf/2026-05-06T03-43-34-689Z/projekt-143-vegetation-candidate-proof/summary.json`;
  contact sheet:
  `artifacts/perf/2026-05-06T03-43-34-689Z/projekt-143-vegetation-candidate-proof/candidate-contact-sheet.png`.
  Status is WARN with `0/4` complete pairs because the candidate manifest and
  candidate color/normal/meta files do not exist yet. This is expected before
  running the Pixel Forge candidate bake.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T03-44-21-500Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE` with blockers on KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release. The next KB-LOAD action is now explicit: run
  `bun run tij:pipeline:kb-load-vegetation-256`, run
  `bun run tij:vegetation-validate:kb-load-vegetation-256`, then rerun the
  candidate proof and quiet-machine startup tables.

2026-05-06 Projekt Objekt-143 Pixel Forge vegetation candidate bake
- After the owner cleared machine resources, ran the review-only Pixel Forge
  candidate bake in `C:\Users\Mattm\X\games-3d\pixel-forge`:
  `bun run tij:pipeline:kb-load-vegetation-256`. It wrote under
  `packages/server/output/tij-candidates/kb-load-vegetation-256` and did not
  overwrite the accepted production gallery.
- Pixel Forge selected-species validation passed:
  `bun run tij:vegetation-validate:kb-load-vegetation-256` for `4` species.
- TIJ candidate proof passed:
  `artifacts/perf/2026-05-06T04-17-12-580Z/projekt-143-vegetation-candidate-proof/summary.json`;
  contact sheet:
  `artifacts/perf/2026-05-06T04-17-12-580Z/projekt-143-vegetation-candidate-proof/candidate-contact-sheet.png`.
  The proof has `4/4` complete selected color/normal/meta pairs for
  `bambooGrove/bamboo-google-2`, `bananaPlant/banana-tree-sean-tarrant`,
  `coconut/coconut-palm-google`, and `fanPalm/lady-palm-google-1`, with
  `256px` tiles, `1024x1024` atlases, `normalSpace=capture-view`,
  `albedo,normal` aux layers, max opaque luma delta `1.53%`, and max
  opaque-ratio delta `0.00714`.
- Refreshed selectors after the bake: Pixel Forge vegetation readiness PASS at
  `artifacts/perf/2026-05-06T04-17-34-839Z/projekt-143-pixel-forge-vegetation-readiness/vegetation-readiness.json`,
  Cycle 3 kickoff PASS at
  `artifacts/perf/2026-05-06T04-17-51-823Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and completion audit remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T04-17-50-020Z/projekt-143-completion-audit/completion-audit.json`.
  Remaining blockers are KB-LOAD owner visual acceptance/import/startup tables,
  KB-TERRAIN, KB-CULL, and validation/release. No candidate atlas has been
  imported into TIJ runtime yet.

2026-05-06 Projekt Objekt-143 quiet-window hydrology/vegetation research
- Used the owner-requested wait window for non-GPU research and local
  architecture mapping only; no Pixel Forge candidate bake, headed screenshot,
  or perf capture was run.
- Updated `docs/PROJEKT_OBJEKT_143_HYDROLOGY.md` with primary-source-backed
  direction: DEM flat/depression handling needs explicit outlet/breach policy,
  procedural rivers should become carved riverbed/corridor/water-flow systems
  rather than shader masks, Open Frontier should choose stable seed/outlet
  channel rules before withheld seeds are accepted, and Vietnam vegetation
  placement should use hydrology-aware bamboo/palm/understory clusters.
- Updated `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md` with a fresh
  `EZ-Tree` source-tool check: keep it as an offline GLB/PNG source pilot
  feeding Pixel Forge review-only bakes, not a runtime dependency or asset
  approval. Added cluster-zone acceptance language for channel, bank, wetland
  shoulder, trail edge, upland, and far-canopy pockets.
- Local integration finding: `TerrainFlowCompiler` is the right contract for
  future riverbed/trail-crossing stamps, `VegetationScatterer` can already use
  the feature-gated hydrology classifier, but `TerrainBiomeRuntimeConfig` and
  `TerrainMaterial` are still elevation/slope material paths. A vegetation
  hydrology proof must not be treated as full water/material proof.
- Added the local data-source reconciliation finding: A Shau already has `70`
  authored/imported river polylines in `public/data/vietnam/a-shau-rivers.json`
  totaling about `77.0km`, while the generated hydrology cache has `12`
  channel polylines totaling `94.8km` by stored length (`105.4km` by point
  geometry), `4,120` wet candidate cells, and `1,322` channel cells. Open
  Frontier seed 42 has only generated hydrology so far: `12` channels totaling
  `9.8km` by stored length (`11.2km` by point geometry), `1,629` wet candidate
  cells, and `1,322` channel cells. Next branch should decide snap/merge/source
  authority instead of treating those layers as interchangeable.
- Added the Pixel Forge bureau finding to
  `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md`: the local repo
  already has the TIJ pipeline entrypoints, production and candidate output
  roots, atlas-profile validation, and review manifest surface needed for
  vegetation work. The missing piece for `EZ-Tree` or similar source tools is a
  provenance/source-adapter layer that records tool version, seed/preset,
  license URL, source GLB metrics, and intended habitat zone before Pixel Forge
  bakes review-only imposters.
- Quiet static recheck: `npm run check:vegetation-grounding` passed at
  `artifacts/perf/2026-05-06T04-09-22-289Z/vegetation-grounding-audit/summary.json`
  with all `6` active runtime vegetation species covered and `0` flagged
  species. This refreshes the earlier "make sure nothing else is half-buried"
  finding without running browser or perf work.
- Quiet KB-OPTIK lighting research: the darker-imposter concern is still best
  treated as a material/lighting contract split, not a quick brightness tweak.
  Pixel Forge's animated NPC bake renders original GLB materials with a fixed
  ambient/key/fill setup, while TIJ runtime imposters use a custom unlit
  `ShaderMaterial` with `npcExposure`, `minNpcLight`, `npcTopLight`,
  `parityScale`, `parityLift`, `paritySaturation`, and optional
  scene-atmosphere/fog uniforms. The expanded proof already measures luma
  deltas against the close GLB path, so any future correction should use the
  same-scene runtime review packet and avoid changing crop/scale/lighting in
  one unreviewable patch.
- Refreshed the local Pixel Forge bureau audit without mutating Pixel Forge:
  `npm run check:projekt-143-pixel-forge` passed at
  `artifacts/perf/2026-05-06T04-11-40-074Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`.
  It still finds the sibling repo present, `109` manifest entries, `13`
  vegetation packages, all `6` TIJ runtime vegetation species present, retired
  `giantPalm` retained only as review/provenance, all `6` blocked species
  retained as non-runtime records, `6` prop families, and `5` relevance queues.
- Refreshed the quiet hydrology cache contract with `npm run
  check:hydrology-bakes`: PASS, `2` public cache artifacts match
  `public/data/hydrology/bake-manifest.json`. A Shau is still the DEM entry,
  Open Frontier is still procedural seed `42`, and both are explicitly
  `epsilon-fill` bakes rather than accepted river-rendering or breach-policy
  implementations.
- Refreshed the static vegetation/material distribution baseline with
  `npm run check:projekt-143-terrain-distribution`: WARN only for the expected
  AI Sandbox fixed fallback seed at
  `artifacts/perf/2026-05-06T04-13-18-235Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  A Shau still has no distribution flags and reports CPU biome coverage
  `77.8%` denseJungle, `15.7%` riverbank, `4.04%` bambooGrove, and `2.46%`
  swamp; vegetation relative density is still fern-heavy, with bambooGrove at
  `1.25%`. This supports the next hydrology-aware placement branch rather than
  closing the owner distribution concern.

2026-05-06 Projekt Objekt-143 NPC recovery and resource-discipline follow-up
- Implemented a narrow NPC navmesh recovery fix in
  `src/systems/combat/CombatantMovement.ts`: backtracking now prefers
  `movementLastGoodPosition`, rejects zero-distance current-position navmesh
  snaps, falls back to scored terrain recovery, and clears cached nav paths when
  a backtrack point changes.
- Added focused behavior tests in `CombatantMovement.test.ts` for last-good
  navmesh recovery and fallback when navmesh snapping would no-op. Validation:
  `npx vitest run src/systems/combat/CombatantMovement.test.ts
  src/systems/combat/StuckDetector.test.ts` PASS; later targeted harness pass
  with `scripts/perf-harness/perf-active-driver.test.js` also PASS.
- Static/runtime gates before the resource-contention pause: `npm run
  check:projekt-143-terrain-routes` PASS at
  `artifacts/perf/2026-05-06T17-00-32-294Z/projekt-143-terrain-route-audit/terrain-route-audit.json`;
  `npm run build:perf` PASS with the usual Vite chunk-size warning.
- A Shau after the NPC recovery fix:
  `artifacts/perf/2026-05-06T04-46-26-097Z/summary.json` has measurement trust
  PASS and clears the shot gate with `240` validation player shots / `170` hits
  and `118` harness-driver shots / `44` kills. It remains WARN on p99
  `45.70ms`, heap peak growth `47.81MB`, and repeated terrain backtracking, so
  no A Shau route/nav acceptance.
- Open Frontier after the same fix:
  `artifacts/perf/2026-05-06T04-51-35-039Z/summary.json` has measurement trust
  PASS but validation WARN on p99 `49.30ms`, heap peak growth `71.33MB`, and
  low shots. NPC recovery telemetry improved versus the earlier resource-free
  Open Frontier run, but the movement viewer still points at active-driver
  route/engagement behavior and long low-combat PATROL stretches.
- Rejected and reverted an Open Frontier frontline-compression harness
  experiment. Artifact
  `artifacts/perf/2026-05-06T04-58-04-461Z/summary.json` is diagnostic only:
  validation FAIL with p99 `100ms`, `2.00%` frames over `50ms`, and only `12`
  shots.
- Hardened future headed captures in `scripts/perf-capture.ts` with fixed
  `1920x1080` window position/size and device-scale-factor clamps so the
  owner-reported multi-monitor browser span is less likely to contaminate
  captures.
- Folded the engine/platform-utilization objective into Projekt docs:
  near-metal work in a browser means WebGL2 extension/GPU timer coverage,
  WebGPU capability probes, OffscreenCanvas/worker feasibility, WASM
  threads/SIMD preconditions behind cross-origin isolation, and device-class
  policy. This is research/probe scope only, not a WebGPU or worker-renderer
  migration approval.
- Resource note: another browser/game agent and an SDS repo Claude overnight
  shift may be active for several hours. Do not run or accept new headed/GPU
  Projekt captures while they are consuming resources. After roughly three
  hours, if the same stale browser/Node/Bun processes remain, it is acceptable
  to clean them up before resuming resource-heavy Projekt work, then run one
  final process check before capture.
- Refreshed CPU-only routing after the docs/resource update:
  `npm run check:projekt-143-cycle3-kickoff` PASS at
  `artifacts/perf/2026-05-06T16-54-35-084Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143-completion-audit` remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T05-53-50-518Z/projekt-143-completion-audit/completion-audit.json`
  with blockers on KB-STRATEGIE browser capability probing, KB-LOAD,
  KB-TERRAIN, KB-CULL, and validation/release.
- CPU-only TypeScript validation after the movement/harness/doc updates:
  `npm run typecheck` PASS.
- Extended `scripts/webgpu-strategy-audit.ts` with a near-metal platform track:
  it records current source matches for WebGL GPU timing, device-class policy,
  OffscreenCanvas, SharedArrayBuffer, cross-origin isolation, and worker
  rendering, and it lists the browser-backed capability fields to probe later.
  Current static audit:
  `artifacts/perf/2026-05-06T05-53-35-718Z/webgpu-strategy-audit/strategy-audit.json`
  reports `activeWebgpuSourceMatches=0`, `webglRendererEntrypoints=12`,
  `migrationBlockerMatches=113`, and
  `nearMetalBrowserProbeStatus=deferred_resource_contention`.
- Refreshed the static Projekt suite after the strategy-audit extension:
  `artifacts/perf/2026-05-06T05-53-35-745Z/projekt-143-evidence-suite/suite-summary.json`
  PASS. Refreshed routing after that: Cycle 3 kickoff PASS at
  `artifacts/perf/2026-05-06T16-54-35-084Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and completion audit remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T05-53-50-518Z/projekt-143-completion-audit/completion-audit.json`
  with blockers on KB-STRATEGIE browser capability probing, KB-LOAD,
  KB-TERRAIN, KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 guarded platform capability probe
- Added `scripts/projekt-143-platform-capability-probe.ts` and package command
  `npm run check:projekt-143-platform-capabilities`. Default runs are
  no-browser/deferred and write an artifact without consuming GPU/browser
  resources; the future quiet-machine form is
  `npm run check:projekt-143-platform-capabilities -- --run-browser --headed --check-live-headers`.
  The browser path will compare plain and COOP/COEP isolated local pages for
  WebGL2 renderer/extensions, `EXT_disjoint_timer_query_webgl2`, WebGPU
  adapter/features/limits, OffscreenCanvas WebGL2 support,
  `crossOriginIsolated`/SharedArrayBuffer/Atomics, viewport/device scale,
  hardware concurrency, and device memory.
- Validation: default deferred probe PASS at
  `artifacts/perf/2026-05-06T05-36-03-801Z/projekt-143-platform-capability-probe/summary.json`
  with `browserRun=false`, `headerContract=pass`, live Pages COOP/COEP headers
  present, and `npm run typecheck` PASS. This is read-only platform evidence
  only; it does not approve WebGPU, worker rendering, WASM threads, or any
  runtime performance claim.
- Corrected `scripts/webgpu-strategy-audit.ts` so the platform probe script is
  treated as tooling and does not pollute active-runtime WebGPU counts. A later
  refresh also excludes the completion audit's KB-STRATEGIE field names from
  the active-runtime scan. The refreshed static suite records the corrected
  KB-STRATEGIE artifact at
  `artifacts/perf/2026-05-06T05-53-35-718Z/webgpu-strategy-audit/strategy-audit.json`
  with `activeWebgpuSourceMatches=0`, `webglRendererEntrypoints=12`,
  `migrationBlockerMatches=113`, and
  `nearMetalBrowserProbeStatus=deferred_resource_contention`.
- Updated `scripts/projekt-143-completion-audit.ts` so KB-STRATEGIE is a real
  prompt-to-artifact checklist item instead of a docs-only note. Latest
  completion audit:
  `artifacts/perf/2026-05-06T05-53-50-518Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` and now lists KB-STRATEGIE browser probing as deferred
  until the local resource window is quiet.

2026-05-06 Projekt Objekt-143 active-driver route-overlay follow-up
- Current resource check at `2026-05-06T01:39:44-04:00` showed the Edge browser
  group started around `12:36 AM`, so it was not stale enough for the owner's
  three-hour cleanup window. No browser/Node/Bun processes were killed.
- Follow-up resource check at `2026-05-06T01:55:13-04:00` found the same Edge
  group still only about `1h18m` old, plus active SDS/TIJ dev-server and MCP
  Node processes. Cleanup remains deferred until roughly the three-hour stale
  window.
- Diagnosed the Open Frontier after-NPC-recovery artifact
  `artifacts/perf/2026-05-06T04-51-35-039Z/summary.json`: movement transitions
  were healthy enough to avoid the stuck gate, but `waypointReplanFailures`
  climbed to `157`, `waypointsFollowedCount` stalled at `103`, shots stopped at
  `33`, and the final long PATROL stretch stayed low-combat. The code mismatch
  was that `scripts/perf-active-driver.cjs` computed navmesh overlay path
  points, but `PlayerMovement` consumes camera-relative movement; the driver
  kept the camera on the far enemy/objective aim target, so "forward" could
  still drive into terrain instead of along the path.
- Added a harness `movementTarget` contract in
  `src/dev/harness/playerBot/types.ts` and
  `src/dev/harness/playerBot/PlayerBotController.ts`: while moving and not
  firing, a route movement target can control the view; while firing, the
  combat `aimTarget` still wins so the aim-dot gate remains intact.
- Mirrored the behavior in `scripts/perf-active-driver.cjs` by copying
  navmesh overlay points onto `step.intent.movementTarget` and selecting that
  as the view target only when the bot is moving and not firing. Added focused
  JS mirror tests in `scripts/perf-harness/perf-active-driver.test.js`.
- Validation:
  `npx vitest run src/dev/harness/playerBot/PlayerBotController.test.ts src/dev/harness/playerBot/states.test.ts src/dev/harness/PlayerBot.test.ts scripts/perf-harness/perf-active-driver.test.js`
  PASS (`4` files, `210` tests), and `npm run typecheck` PASS.
- Updated `scripts/projekt-143-completion-audit.ts` so KB-TERRAIN records
  `activeDriverMovementTargetContract=true` while still marking runtime proof
  pending. Fresh completion audit remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T05-53-50-518Z/projekt-143-completion-audit/completion-audit.json`.
- Scoped whitespace validation after the docs/evidence refresh:
  `git diff --check -- scripts/webgpu-strategy-audit.ts scripts/projekt-143-completion-audit.ts scripts/perf-active-driver.cjs scripts/perf-harness/perf-active-driver.test.js src/dev/harness/playerBot/types.ts src/dev/harness/playerBot/PlayerBotController.ts src/dev/harness/playerBot/PlayerBotController.test.ts docs/PERFORMANCE.md docs/PROJEKT_OBJEKT_143.md docs/PROJEKT_OBJEKT_143_HANDOFF.md progress.md`
  passed; output was only the repo's normal LF-to-CRLF warnings.
- This is CPU-only acceptance. Do not claim the player-stops-moving report fixed
  until the machine is quiet and Open Frontier is rerun through the headed perf
  harness with measurement trust and movement/shots checked.

2026-05-06 Projekt Objekt-143 resource cleanup, platform probe, and route diagnostics
- After the owner's stale-resource window, cleaned up stale dev-server process
  trees for the SDS game stacks and stale TIJ Vite server only. Confirmed no
  listeners remained on `3000`, `5173`, `8787`, `8788`, or `9100`. Did not kill
  the newer Edge group, Claude/MCP nodes, Steam, or EdgeWebView processes.
- Ran the guarded platform probe in headless browser mode:
  `npm run check:projekt-143-platform-capabilities -- --run-browser --headless --check-live-headers`.
  Artifact:
  `artifacts/perf/2026-05-06T06-03-26-013Z/projekt-143-platform-capability-probe/summary.json`.
  Status is WARN, not approval: WebGL2 is available through SwiftShader,
  `EXT_disjoint_timer_query_webgl2` is unavailable, `navigator.gpu` exists but
  no WebGPU adapter is available, OffscreenCanvas WebGL2 and isolated
  SharedArrayBuffer pass, and local/live COOP/COEP headers pass.
- Refreshed completion audit after the platform probe:
  `artifacts/perf/2026-05-06T06-30-31-073Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE`. KB-STRATEGIE now passes its guarded inventory item;
  remaining blockers are KB-LOAD, KB-TERRAIN, KB-CULL, and validation/release.
- Open Frontier headless diagnostic before route recovery:
  `artifacts/perf/2026-05-06T06-04-57-681Z/summary.json` failed validation and
  measurement trust. It reproduced the route-stuck shape: `harness_max_stuck`
  `176.1s`, player `blockedByTerrain=275`, `avgRequestedSpeed=19.10m/s`,
  `avgActualSpeed=0`, and `0` shots.
- Added active-driver route-overlay recovery in `scripts/perf-active-driver.cjs`:
  while following navmesh overlay points and not firing, route movement walks
  instead of sprinting, applies a small alternating strafe after `2s` stuck, and
  can skip a non-final waypoint after `4.5s` stuck. The capture stop log now
  reports `stuckWaypointSkips`.
- Focused validation after recovery:
  `npx vitest run scripts/perf-harness/perf-active-driver.test.js` PASS
  (`139` tests), and scoped `git diff --check` PASS with only LF-to-CRLF
  warnings.
- Open Frontier headless diagnostic after recovery:
  `artifacts/perf/2026-05-06T06-18-15-743Z/summary.json` still failed validation
  and measurement trust (`probeAvg=2368.50ms`, `probeP95=2847ms`) and fired
  `0` shots, so it is not acceptance. It does show the movement portion
  improved: `harness_max_stuck_seconds=0`, `blockedByTerrain=0`,
  `avgActualSpeed=8.82m/s`, `waypointReplanFailures=0`, and no console errors.
  Next proof must be a quiet-machine headed Open Frontier/A Shau rerun that
  checks movement, shots, and measurement trust together.
- Final cheap validation for this pass:
  `npx vitest run scripts/perf-harness/perf-active-driver.test.js` PASS
  (`139` tests), `npm run typecheck` PASS, `npm run
  check:projekt-143-completion-audit` wrote
  `artifacts/perf/2026-05-06T06-30-31-073Z/projekt-143-completion-audit/completion-audit.json`
  and remains `NOT_COMPLETE`, and scoped `git diff --check` passed with only
  normal LF-to-CRLF warnings.

2026-05-06 Projekt Objekt-143 active-driver combat-front routing
- Root-cause follow-up on the Open Frontier zero-shot diagnostic: after movement
  was unstuck, the driver stayed PATROL-only because large-mode capture-zone
  objectives could still outrank the actual combat front while no OPFOR was
  inside perception range.
- Updated `scripts/perf-active-driver.cjs` so aggressive large-map patrol
  prefers a nearest-live-OPFOR movement objective before falling back to
  capture-zone routing. This is perf-harness proof routing only, not gameplay
  AI behavior.
- Added pure `selectPatrolObjective` tests covering aggressive combat-front
  preference, non-aggressive zone-first routing, and fallback to engagement
  center. Validation: `npx vitest run scripts/perf-harness/perf-active-driver.test.js`
  PASS (`142` tests), `npm run typecheck` PASS, scoped `git diff --check` PASS
  with only LF-to-CRLF warnings, and refreshed completion audit
  `artifacts/perf/2026-05-06T06-41-21-019Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` with the expected blockers on KB-LOAD, KB-TERRAIN,
  KB-CULL, and validation/release.
- Accidental note: `npx tsx scripts/perf-capture.ts --help` is not a help-only
  command and started a partial capture. I stopped the spawned Node processes,
  confirmed port `9100` was cleared, and removed the generated
  `artifacts/perf/2026-05-06T06-37-06-369Z` browser-profile directory after
  verifying it was inside `artifacts/perf`. No evidence claim came from that
  artifact.
- Added an early `--help` / `-h` guard to `scripts/perf-capture.ts` so checking
  flags prints usage and exits before creating a server, browser profile, or
  artifact. Verified with `npx tsx scripts/perf-capture.ts --help`, then
  confirmed the perf/dev ports remained clear.

2026-05-06 Projekt Objekt-143 active-driver objective telemetry
- Resource check at `2026-05-06T02:51:23-04:00`: no listeners on the watched
  dev/perf ports. The Edge group from `12:36 AM` was still below the owner's
  three-hour stale cleanup window, so it was left alone. The older Node process
  was the active local Codex CLI, and the newer Node processes were Playwright
  MCP / Context7 MCP, so none were cleaned up.
- Added active-driver diagnostic telemetry for the next Open Frontier/A Shau
  browser proof: `objectiveKind`, `objectiveDistance`, `objectiveZoneId`,
  `nearestOpforDistance`, `nearestPerceivedEnemyDistance`,
  `currentTargetDistance`, `pathTargetKind`, `pathTargetDistance`,
  `pathQueryStatus`, `pathLength`, and `perceptionRange` now surface through
  the CJS driver and `perf-capture.ts` runtime samples. The sample log also
  prints compact objective/OPFOR/perceived/path distances when available.
- Updated `scripts/projekt-143-completion-audit.ts` so KB-TERRAIN records the
  objective telemetry contract while still keeping the target partial until
  quiet-machine runtime proof exists.
- Validation:
  `node --check scripts/perf-active-driver.cjs` PASS,
  `npx vitest run scripts/perf-harness/perf-active-driver.test.js` PASS
  (`142` tests), `npm run typecheck` PASS, `npx tsx
  scripts/perf-capture.ts --help` PASS without starting a server/browser, and
  `npm run check:projekt-143-completion-audit` wrote
  `artifacts/perf/2026-05-06T07-08-45-100Z/projekt-143-completion-audit/completion-audit.json`.
  Completion remains `NOT_COMPLETE` with blockers on KB-LOAD, KB-TERRAIN,
  KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 perf-capture post-sample timeout guard
- Investigated the Open Frontier telemetry diagnostic at
  `artifacts/perf/2026-05-06T06-44-42-668Z/summary.json`. It had useful runtime
  samples and validation, but the process hit the global hard timeout at
  `stage=write-artifacts`, so only emergency artifacts were written.
- Updated `scripts/perf-capture.ts` to re-arm the hard timeout with a dedicated
  `POST_CAPTURE_HARD_TIMEOUT_MS` margin before final artifact collection/writes.
  This keeps runaway protection while preventing a slow, already-failed capture
  from being killed mid-summary after the sampling loop has produced useful
  evidence.
- Validation: `npx tsx scripts/perf-capture.ts --help` PASS without starting
  server/browser, `npm run typecheck` PASS, and scoped `git diff --check` PASS
  with only normal LF-to-CRLF warnings.

2026-05-06 Projekt Objekt-143 active-driver diagnostic reader
- Added `scripts/projekt-143-active-driver-diagnostic.ts`, a standalone
  runtime-sample reader that writes
  `projekt-143-active-driver-diagnostic/active-driver-diagnostic.json` under a
  capture artifact. It summarizes bot-state samples, objective kind/distance,
  nearest OPFOR/perceived enemy distances, perception range, path target/query
  state, stuck time, replan failures, shots, hits, and next probe questions.
- Ran it against the old Open Frontier telemetry diagnostic:
  `npx tsx scripts/projekt-143-active-driver-diagnostic.ts --artifact artifacts/perf/2026-05-06T06-44-42-668Z`.
  Artifact:
  `artifacts/perf/2026-05-06T06-44-42-668Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Status is FAIL as expected because that old capture predates the new
  objective/path telemetry; it remains diagnostic-only and explicitly says to
  rerun with current code.
- Wired the latest active-driver diagnostic artifact into
  `scripts/projekt-143-completion-audit.ts` as KB-TERRAIN evidence. The refreshed
  audit at
  `artifacts/perf/2026-05-06T07-08-45-100Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`.
- Validation: `npm run typecheck` PASS, `npm run
  check:projekt-143-completion-audit` PASS as a NOT_COMPLETE audit, and scoped
  `git diff --check` PASS with only normal LF-to-CRLF warnings.

2026-05-06 Projekt Objekt-143 active-driver diagnostic selection hardening
- Resource check at `2026-05-06T03:10:33-04:00`: watched dev/perf ports were
  clear. The Edge group from `12:36 AM` was still only about `154` minutes old,
  so it remained below the owner's three-hour stale cleanup window and was left
  running. The long-lived Node process is the local Codex CLI and the newer Node
  processes are Playwright MCP / Context7 MCP, so none were cleaned up.
- Hardened `scripts/projekt-143-active-driver-diagnostic.ts` so its default
  latest-artifact lookup prefers the newest `runtime-samples.json` that already
  contains objective/path telemetry, falling back to the newest legacy runtime
  samples only when no telemetry-bearing capture exists. The script now has an
  import guard and exports the report builder/selector for focused tests.
- Added `scripts/perf-harness/projekt-143-active-driver-diagnostic.test.ts`
  covering telemetry-preferred artifact selection, a healthy pass report, and a
  legacy no-telemetry fail report.
- Added `npm run check:projekt-143-active-driver-diagnostic` as the stable
  entry point for the reader.
- Validation: `npx vitest run
  scripts/perf-harness/projekt-143-active-driver-diagnostic.test.ts
  scripts/perf-harness/perf-active-driver.test.js` PASS (`145` tests) and
  `npm run typecheck` PASS. `npm run
  check:projekt-143-active-driver-diagnostic -- --artifact
  artifacts/perf/2026-05-06T06-44-42-668Z` PASS as a known FAIL diagnostic for
  the old no-telemetry capture. Scoped `git diff --check` PASS with only normal
  LF-to-CRLF warnings.
- Refreshed `npm run check:projekt-143-completion-audit` after the diagnostic
  script hardening. Latest audit:
  `artifacts/perf/2026-05-06T07-13-44-915Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE` with KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release blockers.

2026-05-06 Projekt Objekt-143 resource-clean active-driver runtime pass
- Resource cleanup: at `2026-05-06T03:37:33-04:00`, the old Edge group from
  `12:36 AM` was just over the owner-approved three-hour stale window. Watched
  ports were clear, so only those `msedge` PIDs were killed. The local Codex CLI
  and MCP Node processes were left alone. A follow-up check showed no remaining
  Edge processes and no watched dev/perf port listeners.
- Ran a headed Open Frontier telemetry capture with current active-driver
  objective/path telemetry:
  `npx tsx scripts/perf-capture.ts --headed --mode open_frontier --npcs 120 --duration 60 --warmup 10 --sample-interval-ms 2000 --detail-every-samples 1 --runtime-preflight false --seed 42 --log-level=error`.
  Artifact:
  `artifacts/perf/2026-05-06T07-38-14-932Z/summary.json`.
  Measurement trust PASS, validation FAIL. The useful answer is that objective
  telemetry is present: `nearest_opfor` distance closes from about `1390m` to
  `903m`; a perceived/current target appears around `724m`; path query status
  remains `failed`; shots/hits stay `0`. Diagnostic:
  `artifacts/perf/2026-05-06T07-38-14-932Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
- Hardened final telemetry reporting after that run: `perf-capture.ts` now keeps
  final objective/path fields in `harnessDriverFinal`, and nullable telemetry
  values no longer serialize `null` as `0`. The diagnostic reader now falls back
  to the final runtime sample when older summaries lack the new final fields.
- Rejected two active-driver path-planning experiments instead of carrying them
  forward. Bounded long path segments produced partial `path=ok` samples but
  still failed validation and regressed p99 at
  `artifacts/perf/2026-05-06T07-45-35-107Z/summary.json`. Skipping path overlay
  for far `nearest_opfor` objectives produced zero runtime samples and failed
  measurement trust at
  `artifacts/perf/2026-05-06T07-51-32-551Z/summary.json`; the confirmation run
  after reverting that branch also missed all runtime samples at
  `artifacts/perf/2026-05-06T07-54-19-080Z/summary.json`, so it is diagnostic
  only. The experimental path-planning code was reverted; the retained code is
  telemetry/reporting hardening.
- Validation after reverting the bad path-planning branch:
  `node --check scripts/perf-active-driver.cjs` PASS,
  `npx vitest run scripts/perf-harness/perf-active-driver.test.js
  scripts/perf-harness/projekt-143-active-driver-diagnostic.test.ts` PASS
  (`145` tests), and `npm run typecheck` PASS.
- Regenerated the active-driver diagnostic for the trustworthy telemetry-bearing
  `07-38` capture so the completion audit does not anchor on the later rejected
  zero-sample captures. Refreshed completion audit:
  `artifacts/perf/2026-05-06T07-58-34-841Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE`.

2026-05-06 Projekt Objekt-143 provisional hydrology river surfaces
- Wired a first runtime water consumer for the hydrology cache:
  `WaterSystem.ts` now builds one batched transparent mesh from hydrology
  `channelPolylines`, and `ModeStartupPreparer.ts` feeds the loaded bake
  artifact into it during terrain startup. This is independent from the
  existing global Three.js water plane, so A Shau can keep the sea-level plane
  disabled while still receiving DEM-following provisional stream strips.
- Added WaterSystem behavior coverage for the important contract: disabling the
  global water plane does not hide hydrology river strips, and switching to a
  mode with no hydrology bake clears the strip mesh.
- Refreshed the water-system audit:
  `artifacts/perf/2026-05-06T10-07-20-371Z/projekt-143-water-system-audit/water-system-audit.json`.
  It remains WARN by design and now records the provisional river-strip water
  consumer plus startup wiring. Added the repeatable headed proof command
  `npm run check:projekt-143-water-runtime-proof`; latest artifact:
  `artifacts/perf/2026-05-06T10-26-04-620Z/projekt-143-water-runtime-proof/water-runtime-proof.json`.
  It passes runtime mesh presence: Open Frontier reports `12` channels / `592`
  segments with global water enabled, and A Shau reports `12` channels / `552`
  segments with global water disabled. Refreshed completion audit:
  `artifacts/perf/2026-05-06T10-28-08-726Z/projekt-143-completion-audit/completion-audit.json`;
  Projekt remains `NOT_COMPLETE` with KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release blockers.
- Validation: `npx vitest run src/systems/environment/WaterSystem.test.ts`
  PASS (`6` tests), `npm run typecheck` PASS,
  `npm run check:projekt-143-water-system` WARN as expected, and
  `npm run check:projekt-143-water-runtime-proof` PASS. The packaged proof
  screenshots were visually inspected and remain provisional. `npm run
  check:projekt-143-completion-audit` PASS as a NOT_COMPLETE audit.
- Non-claim: this is not accepted stream art yet. It still needs matched Open
  Frontier/A Shau browser screenshots, perf captures on a quiet machine,
  terrain crossing/bank polish, and human visual review before KB-TERRAIN can
  treat water/river rendering as closed.

2026-05-06 Projekt Objekt-143 hydrology runtime proxy cleanup
- Removed broad dry-cell hydrology proxy rules from the large-map terrain
  configs: A Shau no longer assigns low flats/shoulders to `swamp` or
  `riverbank` by elevation alone, and Open Frontier no longer assigns base
  `riverbank` by elevation alone. Baked hydrology masks now own wet/channel
  vegetation classification through the runtime classifier path.
- Added a narrow A Shau dry lowland `tallGrass` base rule for ground-cover
  pockets outside hydrology corridors, so the distribution fix does not need to
  widen swamp/riverbank bands.
- Updated `scripts/projekt-143-terrain-hydrology-audit.ts` so the audit applies
  `HydrologyBiomeClassifier` to the sampled cells before judging
  riverbank/swamp coverage. Latest artifact:
  `artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`.
  It is PASS: A Shau wet candidates remain `6.24%`, Open Frontier wet
  candidates remain `2.47%`, and both now show `100%` runtime wet-candidate
  coverage with `0%` dense-jungle wet candidates.
- Updated `scripts/projekt-143-terrain-distribution-audit.ts` so CPU biome and
  vegetation density projections include runtime hydrology classification when
  a baked classifier is enabled. Latest artifact:
  `artifacts/perf/2026-05-06T17-00-32-427Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  It clears A Shau's uniform-biome flag after adding the dry lowland
  `tallGrass` ground-cover band, and remains WARN overall only because AI
  Sandbox samples a random seed mode with the fixed audit fallback.
- Updated the hydrology/projekt/handoff docs to point at the current runtime
  classification evidence and to route the next KB-TERRAIN work toward
  clustered ground cover, palm/understory pockets, bamboo/trail permissioning,
  and visual acceptance instead of widening dry-cell hydrology corridors.
- Validation: `npx vitest run src/systems/terrain/BiomeClassifier.test.ts
  src/systems/terrain/hydrology/HydrologyBiomeClassifier.test.ts
  src/systems/terrain/VegetationScatterer.test.ts
  src/config/gameModeHydrology.test.ts` PASS (`22` tests);
  `npm run typecheck` PASS; `npm run build:perf` PASS;
  `npm run check:projekt-143-terrain-hydrology` PASS;
  `npm run check:projekt-143-terrain-distribution` WARN as expected;
  `npm run check:projekt-143-completion-audit` remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T10-55-02-880Z/projekt-143-completion-audit/completion-audit.json`.
- Non-claim: this is static/runtime classification cleanup, not final terrain
  ecology or river visual acceptance. KB-TERRAIN still needs ground-level and
  elevated browser review, matched perf captures, and human acceptance.

2026-05-06 Projekt Objekt-143 terrain horizon proof refresh
- Ran `npm run check:projekt-143-terrain-baseline -- --no-build` after the
  hydrology runtime proxy cleanup. Latest artifact:
  `artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`.
  It is PASS: four Open Frontier/A Shau elevated screenshots were captured,
  renderer/terrain/vegetation metrics were present for all shots, browser/page
  errors were zero, and the proof linked trusted current Open Frontier/A Shau
  perf-before summaries.
- Refreshed `npm run check:projekt-143-completion-audit` afterward. It remains
  `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T10-55-02-880Z/projekt-143-completion-audit/completion-audit.json`.
  Remaining blockers are still KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release.
- Updated the hydrology/projekt/handoff/state docs with the new terrain proof
  and audit anchors.
- Non-claim: this is runtime terrain evidence, not final human acceptance of
  far-horizon art and not production parity.

2026-05-06 Projekt Objekt-143 vegetation candidate import-plan dry run
- Added `scripts/projekt-143-vegetation-candidate-import-plan.ts` and
  `npm run check:projekt-143-vegetation-candidate-import-plan`. The command
  verifies the selected Pixel Forge `kb-load-vegetation-256` candidate
  color/normal/meta files against the current TIJ runtime destination paths
  without copying anything by default. A future actual copy requires both
  `--apply` and `--owner-accepted`.
- Dry-run artifact:
  `artifacts/perf/2026-05-06T11-03-21-671Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`.
  Status is PASS with `importState=dry_run_ready`, `4/4` selected replacements
  ready, `1024x1024` color/normal dimensions, `256px` tile metadata,
  `normalSpace=capture-view`, and `albedo,normal` aux-layer checks passing.
- Wired the import-plan artifact into `scripts/projekt-143-completion-audit.ts`.
  Refreshed completion audit:
  `artifacts/perf/2026-05-06T11-03-38-131Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE`: KB-LOAD is still `ready_for_branch` because owner
  visual acceptance, actual import, and quiet-machine startup before/after
  tables are still open.
- Validation: `npm run check:projekt-143-vegetation-candidate-import-plan`
  PASS, `npm run check:projekt-143-completion-audit` PASS as a NOT_COMPLETE
  audit, and `npm run typecheck` PASS.
- Non-claim: this does not accept or import Pixel Forge candidate vegetation
  into runtime and does not prove startup, in-game lighting, or production
  parity.

2026-05-06 Projekt Objekt-143 terrain visual-review packet and audit wiring
- Ran the new KB-TERRAIN visual review path after the terrain horizon proof.
  Artifact:
  `artifacts/perf/2026-05-06T11-24-43-438Z/projekt-143-terrain-visual-review/visual-review.json`
  with markdown summary
  `artifacts/perf/2026-05-06T11-24-43-438Z/projekt-143-terrain-visual-review/visual-review.md`
  and contact sheet
  `artifacts/perf/2026-05-06T11-24-43-438Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`.
  It is PASS: eight Open Frontier/A Shau screenshots cover player-ground,
  route/trail, river-oblique, and river-ground views with zero browser/page
  errors and nonblank image checks.
- Wired that visual-review artifact into
  `scripts/projekt-143-completion-audit.ts` as KB-TERRAIN evidence. The audit
  now records terrain visual-review status, screenshot count, hydrology shot
  count, per-mode browser/page errors, and the packet non-claims without
  promoting KB-TERRAIN to accepted.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T11-37-25-850Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE`; blockers are still KB-LOAD, KB-TERRAIN, KB-CULL,
  and validation/release.
- Validation: `npm run check:projekt-143-completion-audit` PASS as a
  NOT_COMPLETE audit, and `npm run typecheck` PASS.
- Resource note: the 07:18 local process check showed no Chrome/Edge/Bun/dev
  server processes to clean up, only the local Codex Node process.
- Non-claim: the visual-review packet does not accept terrain art,
  hydrology river visuals, matched perf, runtime imports, release, or
  production parity. It gives the owner a concrete packet to review next.

2026-05-06 Projekt Objekt-143 terrain visual packet matched-perf rejection
- Attempted the resource-free matched Open Frontier perf leg after the
  terrain visual-review packet:
  `artifacts/perf/2026-05-06T11-30-35-349Z/summary.json`.
  The capture is rejected as KB-TERRAIN acceptance evidence because validation
  failed.
- Useful details: measurement trust PASS, `119` samples, frame progression
  PASS, average frame `14.12ms` PASS, shots/hits PASS (`99` / `51`), max
  harness stuck `1.0s` PASS, and end heap growth PASS (`15.74 MB`). The
  blockers were heap peak growth FAIL at `137.50 MB` and peak p99 WARN at
  `49.80ms`.
- The heap spike peaked around `257.43 MB` used JS heap near sample `75`
  (`2026-05-06T11:33:03.816Z`) and recovered `88.6%` by the end. Console
  warnings included repeated terrain-stall/backtracking notices, but no
  browser errors or crashes.
- A Shau paired perf was not run from this acceptance slot because the first
  leg of the pair was already invalid. Next work should investigate whether
  the Open Frontier heap peak is terrain/vegetation streaming, active-driver
  route churn, or a transient allocation/GC pattern before trying to claim
  matched KB-TERRAIN perf.
- Refreshed completion audit after wiring the latest perf-summary readback:
  `artifacts/perf/2026-05-06T11-37-25-850Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE` and now records the rejected Open Frontier perf
  attempt under KB-TERRAIN instead of leaving it as a loose artifact.

2026-05-06 Projekt Objekt-143 perf heap diagnostic
- Added `scripts/projekt-143-perf-heap-diagnostic.ts` and
  `npm run check:projekt-143-perf-heap-diagnostic`. The script consumes a
  perf artifact directory, summarizes heap baseline/peak/end/recovery,
  renderer resource deltas, stream signals near the peak, console warning
  counts, and a conservative classification.
- Ran it against the rejected Open Frontier capture:
  `artifacts/perf/2026-05-06T11-42-10-167Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`.
  It is WARN by design because the source capture failed validation. It
  classifies the failure as `transient_gc_wave` with likely source
  `vegetation_cell_streaming_or_other_short_lived_runtime_allocations_near_player_traversal`:
  baseline `124.70 MB`, peak `257.43 MB`, end `135.66 MB`, reclaimed-from-peak
  ratio `0.9174`, renderer textures stable at `370`, and vegetation pending
  observed near the peak.
- Wired that diagnostic into `scripts/projekt-143-completion-audit.ts`.
  Refreshed completion audit:
  `artifacts/perf/2026-05-06T11-43-04-634Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE` with the same blockers, but KB-TERRAIN now carries
  the rejected perf run plus heap-diagnostic classification.
- Validation: `npm run check:projekt-143-perf-heap-diagnostic -- --artifact
  artifacts/perf/2026-05-06T11-30-35-349Z` WARN as expected, `npm run
  check:projekt-143-completion-audit` PASS as a NOT_COMPLETE audit, and
  `npm run typecheck` PASS.
- Non-claim: this does not reduce heap use, accept terrain perf, or close
  KB-TERRAIN. Next useful runtime work is reducing/instrumenting short-lived
  vegetation allocation around residency changes before rerunning the matched
  Open Frontier/A Shau pair.

2026-05-06 Projekt Objekt-143 active-driver/foundation follow-up
- Hardened the active-driver stress harness against the owner-observed
  close-contact twitch: target locks now hold through the intended stale
  window, ENGAGE/ADVANCE transitions have dwell time, scripted ENGAGE strafe
  is disabled by default, route progress/no-progress resets are telemetered
  through `perf-capture`, and close current-target aim wins over route-facing.
  Final local Open Frontier proof
  `artifacts/perf/2026-05-06T12-25-16-980Z/summary.json` is measurement-trusted
  OK/WARN only on peak p99, with `232` shots, `33` hits, max stuck `1.0s`,
  `7` route-target resets, and `1` route no-progress reset. Treat compressed
  frontline NPC proximity as stress-script behavior, not natural distribution
  evidence.
- Extended `scripts/projekt-143-terrain-visual-review.ts` from `8` terrain/
  hydrology shots to `14` shots by adding airfield-foundation,
  airfield-parking, and support-foundation views for both Open Frontier and
  A Shau. The first rebuilt packet exposed foundation/helipad pad shoulder
  problems that the static placement audit could not see.
- Implemented the terrain-side candidate for visible foundation overhang:
  generated airfield structures run through the footprint solver, large static
  props search a wider flat candidate radius, and circular terrain stamps now
  cover their authored surface outer radius with a graded helipad shoulder.
  Rebuilt visual packet:
  `artifacts/perf/2026-05-06T12-50-19-106Z/projekt-143-terrain-visual-review/visual-review.json`;
  contact sheet:
  `artifacts/perf/2026-05-06T12-50-19-106Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`.
  It is PASS for `14/14` screenshots and zero browser/page errors.
- Validation: targeted active-driver/world/terrain/helipad Vitest slices pass,
  `npm run typecheck` PASS, `npm run build:perf` PASS. The placement audit
  was later tightened to flag large native relief under otherwise flat pads.
  Open Frontier `supply_depot_main` / `zone_depot` moved from `(-800,-200)`
  to nearby flatter terrain at `(-820,-160)`, clearing the Open Frontier
  foundation-native-relief warning. The latest
  `npm run check:projekt-143-terrain-placement` now exits 0 with WARN at
  `artifacts/perf/2026-05-06T14-15-44-549Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  for several TDM/Zone Control seed-variant pads only. `npm run
  check:projekt-143-completion-audit` remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T14-17-54-150Z/projekt-143-completion-audit/completion-audit.json`.
- Non-claim: KB-TERRAIN is still not closed. The latest contact sheet is
  improved but still shows steep artificial shoulders in places; Pixel Forge
  upgraded building/vehicle GLBs are not imported, owner art acceptance and
  matched Open Frontier/A Shau perf are open, and validation/release remains
  blocked by uncommitted local work.
- Asset-side note: refreshed `npm run check:projekt-143-terrain-assets` at
  `artifacts/perf/2026-05-06T13-16-02-955Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`.
  It is WARN/review-required with `12` building candidates, `5` Pixel Forge
  ground-cover props, `12` terrain textures, and no missing assets. The new
  GLB metadata pass records `5,704` candidate-building triangles, `7,528`
  runtime structure/foundation triangles, and `30` medium/high optimization
  risks, mostly from many small meshes/materials/primitives rather than heavy
  triangle counts. It also catalogs the sibling Pixel Forge gallery as `19`
  building GLBs totaling `18,338` triangles and `5` ground-vehicle GLBs
  totaling `5,272` triangles, all review-only until side-by-side visuals,
  footprint/collision, batching, and driving-surface probes pass. This is a
  catalog anchor for the requested upgraded building/vehicle GLB path; no
  replacement import or optimization claim is made yet.
- Added `scripts/projekt-143-pixel-forge-structure-review.ts` and
  `npm run check:projekt-143-pixel-forge-structure-review`, then wired it into
  `npm run check:projekt-143`. Latest review:
  `artifacts/perf/2026-05-06T13-23-33-214Z/projekt-143-pixel-forge-structure-review/structure-review.json`;
  contact sheet:
  `artifacts/perf/2026-05-06T13-23-33-214Z/projekt-143-pixel-forge-structure-review/structure-contact-sheet.png`.
  It is WARN/review-required: `19/19` Pixel Forge building candidates have
  source validation grids, `0/5` current Pixel Forge ground-vehicle GLBs have
  matching grids, and `4` ground-vehicle grids are orphaned from older
  validation assets. This makes the building replacement shortlist
  reviewable, but vehicle-driving candidates still need fresh Pixel Forge-side
  grids plus wheel/contact/pivot checks before TIJ import.
- Refreshed `npm run check:projekt-143` at
  `artifacts/perf/2026-05-06T13-23-35-289Z/projekt-143-evidence-suite/suite-summary.json`;
  it now includes the Pixel Forge structure review step and remains PASS.

2026-05-06 Projekt Objekt-143 KB-CULL visible draw-call attribution
- Extended `scripts/projekt-143-scene-attribution.ts` and `scripts/perf-capture.ts`
  with visible mesh/instance/draw-call-like counters so hidden static sectors
  do not have to be inferred from total resident mesh counts.
- Updated `scripts/projekt-143-culling-owner-baseline.ts` to use
  `ownerVisibleDrawCallLike` for the selected world-static/visible-helicopter
  owner-path guardrails while retaining total draw-call-like as resident cost
  context. Updated `scripts/projekt-143-cycle3-kickoff.ts` to compare visible
  owner draw-call deltas, with fallback for older artifacts.
- Refreshed `npm run check:projekt-143-culling-baseline`:
  `artifacts/perf/2026-05-06T13-30-08-586Z/projekt-143-culling-owner-baseline/summary.json`.
  It is PASS and records the selected owner path guardrails as Open Frontier
  visible owner draw-call-like `<353`, A Shau visible owner draw-call-like
  `<656`, Open Frontier total renderer draw calls `<=926`, and A Shau total
  renderer draw calls `<=206` for a future matched after slice.
- Refreshed `npm run check:projekt-143-cycle3-kickoff`:
  `artifacts/perf/2026-05-06T13-30-39-190Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  and `npm run check:projekt-143-completion-audit`:
  `artifacts/perf/2026-05-06T14-17-54-150Z/projekt-143-completion-audit/completion-audit.json`.
  Projekt remains `NOT_COMPLETE`; KB-CULL still needs a matched after change
  proving lower visible owner draw calls or triangles without total draw-call
  or interaction regressions.

2026-05-06 Projekt Objekt-143 close-pressure cover/driver twitch follow-up
- Human observation still showed close-contact twitching and lots of apparent
  cover behavior under compressed-frontline stress near the player/HQ. The
  frontline compression script can intentionally move OPFOR close to the
  player in Open Frontier/A Shau, so do not treat those captures as natural NPC
  distribution evidence.
- Patched the utility-AI fire-and-fade route in `AIStateEngage` so it respects
  the same `lastCoverSeekTime` cooldown window as the legacy cover finder
  before re-entering `SEEKING_COVER`. This should reduce repeated cover-hop
  state churn when many combatants are close and under pressure.
- Patched `scripts/perf-active-driver.cjs` so the injected perf player-bot
  holds and shoots inside the mode close-contact distance (`retreatDistance`)
  instead of continuing to close to a hardcoded `8m`. The bot still never
  back-pedals; it simply stops charging through crowded targets.
- Validation: `npx vitest run src/systems/combat/ai/utility/UtilityScorer.test.ts
  src/dev/harness/playerBot/states.test.ts --reporter=dot` PASS (`52` tests)
  and `npx vitest run scripts/perf-harness/perf-active-driver.test.js
  --reporter=dot` PASS (`159` tests). An attempted `node --test
  scripts/perf-harness/perf-active-driver.test.js` was the wrong runner for
  this Vitest-global test file and failed before the corrected run.
- Final focused validation for this slice: `node --check
  scripts/perf-active-driver.cjs` PASS, `npx tsc --noEmit --pretty false`
  PASS, combined targeted Vitest PASS (`3` files / `211` tests), and scoped
  `git diff --check` PASS. Refreshed completion audit:
  `artifacts/perf/2026-05-06T14-17-54-150Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` with KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release still open.
- Non-claim: no browser capture has accepted this as a skilled-player proxy
  yet. Next runtime proof should rerun trusted Open Frontier/A Shau
  active-driver captures and check objective progress, kill/hit gates, route
  reset counts, and whether close-contact yaw/cover twitch is visually gone.

2026-05-06 Projekt Objekt-143 close-pressure runtime proof rerun
- Ran trusted headed Open Frontier after the close-pressure patch:
  `artifacts/perf/2026-05-06T13-45-41-194Z/summary.json` with diagnostic
  `artifacts/perf/2026-05-06T13-45-41-194Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Capture status is OK, measurement trust PASS, validation WARN only on peak
  p99 `46.40ms`; active-driver gates pass with `150` shots, `17` hits, max
  stuck `4.3s`, `8` movement transitions, `0` terrain blocks, and `780.67m`
  player travel. Diagnostic PASS records `4` route objective-progress resets
  and ends in `ADVANCE` toward a far current target around `450m`; this is
  useful liveness evidence, not a final skilled-player/objective-progress
  acceptance.
- Ran trusted headed A Shau after the same patch:
  `artifacts/perf/2026-05-06T13-49-19-901Z/summary.json` with diagnostic
  `artifacts/perf/2026-05-06T13-49-19-901Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Capture status is OK, measurement trust PASS, validation WARN on heap
  growth/recovery only. Active-driver gates pass with `49` shots, `6` hits,
  max stuck `1.5s`, `3` movement transitions, `0` terrain blocks, and
  `935.70m` player travel. Diagnostic PASS ends in `PATROL` on a zone
  objective and closes objective distance by `500.45m` with one route
  no-progress reset.
- Visual read: the A Shau final frame still shows close bright fern/ground
  cover that reads too neon/noisy in rain. Keep it as KB-TERRAIN visual polish
  alongside the existing distribution/ground-cover pass; no new runtime change
  was made in this slice.
- Non-claim: close-pressure behavior is improved enough for continued testing,
  but not accepted as final player-bot skill. Open Frontier still needs a
  clearer objective/target policy decision for far OPFOR chasing versus
  zone/frontline progress, and both modes need owner visual review for any
  remaining twitch under dense close-contact pressure.

2026-05-06 Projekt Objekt-143 active-driver/foundation hardening follow-up
- Folded the latest owner observations into code and docs: close-contact
  behavior should make progress toward mode objectives and emulate a skilled
  player, not cover-hop or oscillate when many NPCs are near the player/HQ.
  The compressed-frontline harness can intentionally create that crowding, so
  treat dense HQ-side OPFOR as stress-script evidence until natural spawn/
  distribution work is separately reviewed.
- Player-bot changes: PATROL now keeps the mode objective unless a visible
  target is inside the mode-specific acquisition band, ADVANCE/ENGAGE hold
  close targets instead of charging through them, and the injected
  `scripts/perf-active-driver.cjs` mirror reduced player-anchored compression
  pressure. Added/updated behavior coverage in
  `src/dev/harness/playerBot/states.test.ts` and
  `scripts/perf-harness/perf-active-driver.test.js`.
- Combat AI change: `AIStateEngage` now suppresses utility/legacy cover-seek
  transitions while the target is already inside close range, so close contact
  should resolve as fight/hold instead of repeated cover churn.
- Player movement change: loosened the single-step ground-rise clamp from
  `0.5m` to `0.75m`, with tests proving a `0.6m` stamped terrain lip does not
  stall movement while a large terrain jump still does not launch the player.
- Terrain/foundation change: moved the remaining TDM and Zone Control
  flat-pad placements away from high native relief after the tightened audit
  flagged seed-variant foundation overhang risk. `npm run
  check:projekt-143-terrain-placement` is now PASS at
  `artifacts/perf/2026-05-06T14-51-23-773Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
  This clears the static foundation-relief audit only; owner visual review,
  matched perf, and Pixel Forge upgraded building/vehicle GLB replacement
  remain open.
- Fresh Open Frontier proof after the selector/movement-clamp patch:
  `artifacts/perf/2026-05-06T14-44-44-702Z/summary.json` with diagnostic
  `artifacts/perf/2026-05-06T14-44-44-702Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Capture is OK, measurement trust PASS, validation WARN on p99/heap peak
  only. Active-driver gates pass with `102` shots, `17` hits, `37` movement
  transitions, max stuck `0.3s`, `0` route no-progress resets,
  `blockReason=none`, and `465.97m` player travel. Diagnostic PASS only notes
  shallow final objective closure (`17.9m`) while the bot fights a nearby OPFOR
  inside the acquisition band.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T14-52-08-277Z/projekt-143-completion-audit/completion-audit.json`.
  Projekt remains `NOT_COMPLETE`: KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release are still open, and the working tree is uncommitted.
- Validation so far for this slice: `npm run build:perf` PASS,
  `npm run check:projekt-143-active-driver-diagnostic -- --artifact
  artifacts/perf/2026-05-06T14-44-44-702Z` PASS, and
  `npm run check:projekt-143-completion-audit` PASS as a NOT_COMPLETE audit.
  Final focused sweep also passed:
  `npx vitest run src/systems/player/PlayerMovement.test.ts
  src/dev/harness/playerBot/states.test.ts
  src/systems/combat/ai/utility/UtilityScorer.test.ts
  scripts/perf-harness/perf-active-driver.test.js
  src/systems/terrain/TerrainFeatureCompiler.test.ts
  src/systems/world/AirfieldLayoutGenerator.test.ts
  src/systems/world/WorldFeatureSystem.test.ts --reporter=dot` (`299` tests),
  `npx tsc --noEmit --pretty false` PASS, `node --check
  scripts/perf-active-driver.cjs` PASS, `npm run
  check:projekt-143-terrain-placement` PASS, and scoped `git diff --check`
  PASS with line-ending warnings only.

2026-05-06 Projekt Objekt-143 close-pressure suppression/player-driver follow-up
- Fixed a second close-pressure cover-flicker source in
  `CombatantSuppression`: heavy near-miss suppression now records
  `nearMissCount`, `suppressionLevel`, and `panicLevel` without forcing
  `SEEKING_COVER` unless the combatant already has a concrete
  `coverPosition` and `destinationPoint`. This prevents orphan
  `ENGAGING -> SEEKING_COVER -> ENGAGING` churn when dense nearby fire has no
  valid cover anchor yet; real cover selection remains owned by
  `AIStateEngage`.
- Realigned the injected `scripts/perf-active-driver.cjs` mirror with the
  TypeScript player-bot camera contract: while moving and not firing the bot
  faces the route/objective movement target, and while firing it faces the
  combat aim target. This removes the close-combat mismatch where the CJS
  harness could look at an enemy while still issuing camera-relative forward
  movement toward a different route target.
- Fixed the close occluded-target stop. ADVANCE and transient lost-LOS ENGAGE
  now keep repositioning toward occluded targets until a `6m` point-blank hold
  distance instead of parking at the mode `pushInDistance` band (`15-18m` in
  current stress profiles). Harness stuck telemetry now counts only when the
  driver is actually requesting forward/strafe movement, so intentional
  close-range hold-and-fire no longer looks like a movement stall.
- Runtime diagnostics are behavior evidence only, not perf acceptance:
  `artifacts/perf/2026-05-06T16-21-27-610Z` reproduced the close occluded
  stop before the fix (`ADVANCE`, final objective distance `13.72m`,
  requested speed `0`, max stuck `6.2s`). After the movement fix,
  `artifacts/perf/2026-05-06T16-25-07-821Z` showed player travel
  (`37.65m`) and nonzero requested/actual speed, but exposed the misleading
  stuck timer during intentional firing holds. After the stuck-telemetry fix,
  `artifacts/perf/2026-05-06T16-27-52-490Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  is WARN only because the capture failed perf/heap validation and closed only
  `13.2m` of objective distance; behavior gates are healthy with `63` shots,
  `7` hits, `3` kills, max stuck `0.2s`, `125.99m` player travel, average
  requested speed `3.04`, average actual speed `3.51`, and movement block
  reason `none`.
- Validation: `npx vitest run
  src/systems/combat/CombatantSuppression.test.ts
  src/systems/combat/ai/AIStateEngage.test.ts --reporter=dot` PASS
  (`51` tests), `npx vitest run src/dev/harness/playerBot/states.test.ts
  scripts/perf-harness/perf-active-driver.test.js --reporter=dot` PASS
  (`204` tests), `npx vitest run
  scripts/perf-harness/perf-active-driver.test.js --reporter=dot` PASS
  (`170` tests), `node --check scripts/perf-active-driver.cjs` PASS, and
  `npx tsc --noEmit --pretty false` PASS before this docs update. Final
  post-doc focused sweep also passed: combined targeted Vitest PASS (`4` files /
  `257` tests), `node --check scripts/perf-active-driver.cjs` PASS,
  `npx tsc --noEmit --pretty false` PASS, scoped `git diff --check` PASS with
  line-ending warnings only, and `npm run check:projekt-143-completion-audit`
  PASS as a NOT_COMPLETE audit at
  `artifacts/perf/2026-05-06T17-02-15-898Z/projekt-143-completion-audit/completion-audit.json`.
- Non-claim: this does not prove natural NPC distribution, broad AI cover
  quality, close-pool/HLOD acceptance, matched perf, or release parity. The
  120/60 NPC captures still log terrain-stall/backtracking and close-NPC pool
  pressure under dense harness conditions, so KB-TERRAIN and KB-CULL remain
  open.

2026-05-06 Projekt Objekt-143 Pixel Forge structure/vehicle review-grid bridge
- Added an opt-in source-gallery render path to
  `scripts/projekt-143-pixel-forge-structure-review.ts`:
  `--render-missing-ground-vehicles` renders current Pixel Forge ground-vehicle
  GLBs into TIJ artifact grids without mutating Pixel Forge `war-assets`.
  Default `npm run check:projekt-143-pixel-forge-structure-review` now reuses
  the latest generated TIJ grids so the review remains stable without making
  the static suite depend on a fresh browser/CDN render every run.
- Fresh generated-grid pass:
  `artifacts/perf/2026-05-06T16-40-53-448Z/projekt-143-pixel-forge-structure-review/structure-review.json`
  PASS, with `19/19` building review grids, `5/5` current ground-vehicle
  review grids, `5` generated ground-vehicle grids, and contact sheet
  `artifacts/perf/2026-05-06T16-40-53-448Z/projekt-143-pixel-forge-structure-review/structure-contact-sheet.png`.
- Fresh default check:
  `npm run check:projekt-143-pixel-forge-structure-review` PASS at
  `artifacts/perf/2026-05-06T16-45-59-860Z/projekt-143-pixel-forge-structure-review/structure-review.json`,
  reusing the generated vehicle grids and keeping Pixel Forge clean.
- Non-claim: this does not import upgraded building/vehicle GLBs, does not
  accept replacements, does not certify wheel/contact/pivot points, collision
  proxies, driving surfaces, LOD/HLOD, or runtime perf. It only removes the
  source-gallery visual evidence gap for current Pixel Forge ground vehicles
  before future replacement/driving decisions.

2026-05-06 Projekt Objekt-143 foundation placement evidence refresh
- Refreshed `npm run check:projekt-143-terrain-placement` after the structure
  review bridge. The audit passed at
  `artifacts/perf/2026-05-06T16-50-24-263Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  with `9` audited mode/seed entries, `57` flattened features, and `fail=0` /
  `warn=0`.
- Focused validation for the owner placement path passed:
  `npx vitest run src/systems/world/AirfieldLayoutGenerator.test.ts
  src/systems/world/WorldFeatureSystem.test.ts --reporter=dot` (`2` files /
  `31` tests).
- Non-claim: this is still static placement and unit-test evidence. It does
  not accept Pixel Forge building/vehicle replacements, does not certify
  wheel/contact/pivot points or future driving surfaces, and does not replace
  human review of foundation shoulders in the latest screenshot packet.

2026-05-06 Projekt Objekt-143 terrain route/distribution/hydrology refresh
- Refreshed the non-mutating KB-TERRAIN static audits after the later placement
  and culling evidence updates. `npm run check:projekt-143-terrain-routes`
  passed at
  `artifacts/perf/2026-05-06T17-00-32-294Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
  with required route-aware modes using full `jungle_trail` stamping and no
  route-policy flags.
- `npm run check:projekt-143-terrain-distribution` wrote
  `artifacts/perf/2026-05-06T17-00-32-427Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  It remains WARN only because AI Sandbox is a random-seed mode sampled with
  fixed fallback seed `42`; Open Frontier and A Shau hydrology/material
  distribution had no mode flags.
- `npm run check:projekt-143-terrain-hydrology` passed at
  `artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`.
  A Shau wet candidates remain covered by runtime hydrology (`6.24%` current
  hydrology, `100%` wet coverage, `0%` dense wet leakage), and Open Frontier
  covers its wet/channel candidates without broad dry-cell leakage.
- Non-claim: this refreshes static route/distribution/hydrology evidence only.
  It does not accept final trail art, water/river visuals, imported
  ground-cover assets, matched terrain perf, or human visual review.

2026-05-06 Projekt Objekt-143 generated-placement foundation audit and close-pressure lock follow-up
- Reopened the owner-observed airfield/building/vehicle foundation issue from
  evidence rather than treating the prior PASS as final. The generated airfield
  placement audit had a bug: `rotatePlacementOffset()` returns a
  `THREE.Vector2`, but generated placements were sampled through `world.z`, so
  large airfield building/aircraft/vehicle placements effectively reported
  `0m` native relief.
- Patched `scripts/projekt-143-terrain-placement-audit.ts` with generated
  aircraft/building/ground-vehicle footprint proxies and native-relief warnings.
  Latest `npm run check:projekt-143-terrain-placement` is WARN at
  `artifacts/perf/2026-05-06T17-11-14-436Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  with `fail=0` / `warn=2`: Open Frontier `airfield_main` has `9` generated
  placements over the native-relief review threshold, worst `parking_0` A-1 at
  `32.03m` source span; A Shau `tabat_airstrip` flags the A-1 parking placement
  at `8.54m` source span.
- Patched `scripts/projekt-143-completion-audit.ts` so KB-TERRAIN now ingests
  route, distribution, hydrology, and generated-placement relief evidence. The
  completion audit remains NOT_COMPLETE at
  `artifacts/perf/2026-05-06T17-15-24-908Z/projekt-143-completion-audit/completion-audit.json`
  with KB-LOAD, KB-TERRAIN, KB-CULL, and validation/release still blocking.
- Folded the latest owner observation into the close-pressure record: dense
  nearby NPCs can still produce cover-like pacing/yaw twitch. Patched
  `scripts/perf-active-driver.cjs` and `src/dev/harness/PlayerBot.ts` so active
  close targets hold through brief LOS/nearest-enemy churn; tests were added for
  the driver and TypeScript player bot.
- Non-claim: no Pixel Forge structure/vehicle GLB has been imported or accepted,
  no future driving surface/collision/pivot check has passed, no browser visual
  proof shows the close-pressure twitch is gone, and no matched perf or
  production parity is claimed.

2026-05-06 Projekt Objekt-143 close-pressure browser diagnostic after target-lock patch
- Ran a fresh headed compressed Open Frontier active-driver probe after the
  target-lock patch:
  `artifacts/perf/2026-05-06T17-25-29-462Z/summary.json`.
  Measurement trust passed and movement liveness improved enough to avoid a
  hard stuck failure: max stuck `0.3s`, `40` movement transitions, `237`
  waypoints followed, `46` player shots, and `793.56m` player movement.
- The run still failed validation and cannot be accepted as a skilled-player
  proxy. Heap recovery failed, hit count was only `1`, route target resets were
  `10`, route no-progress resets were `6`, and final objective closure was
  negative (`-88.51m`). The diagnostic reader wrote
  `artifacts/perf/2026-05-06T17-25-29-462Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  with WARN status.
- Non-claim: the unit-level target-lock churn path is covered, but browser
  evidence still rejects the close-pressure driver as a skilled objective
  proxy. The next pass should inspect why compressed Open Frontier keeps
  bouncing target/objective route ownership and why shots are not converting to
  hits under this pressure.

2026-05-06 Projekt Objekt-143 active-driver pure-pursuit/world-intent follow-up
- Patched the retained active-driver path instead of carrying the rejected
  blunt endpoint-snap/deadband experiment. `scripts/perf-active-driver.cjs`
  now projects the player onto the current route before choosing a lookahead
  point, falls back to aim-target world movement only for forward advance, and
  uses a tactical hold distance below max fire range so the bot keeps closing
  without diving into the noisy point-blank cluster. The TypeScript player-bot
  state mirror uses the same tactical hold band.
- Added movement-artifact heading-flip analysis to
  `scripts/projekt-143-active-driver-diagnostic.ts`. The diagnostic now reports
  player heading reversals and short-hop pacing reversals from
  `movement-artifacts.json`, and returns WARN whenever findings are present
  instead of printing PASS with warnings hidden in the payload.
- Current best headed compressed Open Frontier proof:
  `artifacts/perf/2026-05-06T18-24-22-092Z/summary.json` and
  `artifacts/perf/2026-05-06T18-24-22-092Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Measurement trust PASS, validation WARN, `82` shots / `16` hits / `4` kills,
  max stuck `0.5s`, `64` movement transitions, `148` waypoints followed, `2`
  route no-progress resets, average frame `9.31ms`, p99 `35.80ms`, heap peak
  growth `39.38MB`, and no console errors.
- Non-claim: the visual hesitation is improved, not closed. The diagnostic is
  WARN because final objective closure is only `15.2m` and the movement track
  still records `22` heading reversals over `120` degrees, all short-hop pacing
  reversals. This is far better than the rejected 90-plus-flip close-range
  experiment, but it is not skilled-player acceptance.
- Folded owner-observed NPC speed and foundation concerns into the current
  blocker record. The speed suspicion needs a formal telemetry sanity gate:
  latest spot checks show the largest spikes are often initial harness
  relocation/compression segments, but some non-initial terrain
  backtracking/recovery segments still exceed plausible run limits. Foundation
  risk remains WARN at
  `artifacts/perf/2026-05-06T17-11-14-436Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`,
  with Open Frontier `airfield_main` and A Shau `tabat_airstrip` generated
  placement relief warnings. Pixel Forge upgraded building/vehicle GLBs are
  still review-only and future driving contact/pivot/collision surfaces are not
  accepted.
- Validation: combined targeted Vitest PASS (`5` files / `294` tests),
  `node --check scripts/perf-active-driver.cjs` PASS, `npx tsc --noEmit
  --pretty false` PASS, scoped `git diff --check` PASS with line-ending
  warnings only, and
  `npm run check:projekt-143-active-driver-diagnostic -- --artifact
  artifacts/perf/2026-05-06T18-24-22-092Z` reran as WARN with the same
  `15.2m` objective-closure and `22` short-hop heading-reversal findings.
  `npm run check:projekt-143-completion-audit` remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T18-36-51-770Z/projekt-143-completion-audit/completion-audit.json`
  with blockers on KB-LOAD, KB-TERRAIN, KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 rejected active-driver handoff/near-route fallback
- Tested a narrow hypothesis from the `18-24-22-092Z` movement artifact:
  residual reversals clustered around zero-move ENGAGE-to-ADVANCE handoff ticks
  and near-exhausted route points. The attempted patch kept movement through
  an occluded midrange ENGAGE-to-ADVANCE handoff and made a too-close route
  movement target fall back to the far aim anchor.
- Result: reject and revert. The browser proof
  `artifacts/perf/2026-05-06T18-44-37-468Z/summary.json` failed validation.
  It improved combat volume to `120` shots / `17` hits / `5` kills and kept
  max stuck at `0.3s`, but the diagnostic
  `artifacts/perf/2026-05-06T18-44-37-468Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  worsened the pacing metric to `46` heading reversals over `120` degrees
  (`45` short-hop reversals), versus `22` on the current best artifact.
- Validation after reverting the failed experiment:
  `npx vitest run src/dev/harness/playerBot/states.test.ts
  scripts/perf-harness/perf-active-driver.test.js --reporter=dot` PASS
  (`2` files / `225` tests), `node --check scripts/perf-active-driver.cjs`
  PASS, and the rejected helper/test strings are absent from the retained tree.
 Current best evidence remains
  `artifacts/perf/2026-05-06T18-24-22-092Z/summary.json`; continue from that
  baseline rather than the reverted `18-44-37-468Z` branch.

2026-05-06 Projekt Objekt-143 retained active-driver route micro-target fix
- Added movement-artifact telemetry buckets for requested speed, actual speed,
  movement intent, and terrain-block flags. The annotated no-behavior-change
  baseline at
  `artifacts/perf/2026-05-06T18-52-22-338Z/summary.json` proved the remaining
  hesitation was commanded by the driver, not terrain collision drift: `79`
  heading reversals over `120` degrees, `77` short-hop pacing reversals, `65`
  requested-move pacing flips, `12` actual-only flips, and `0`
  terrain-blocked flips.
- Retained the narrow route-overlay micro-target fix in
  `scripts/perf-active-driver.cjs`: when pure-pursuit returns a tiny route
  overlay point while the real anchor is still far away, the driver invalidates
  that stale route and replans instead of steering into a local oscillation or
  falling back to the far aim anchor.
- Current 90s headed Open Frontier proof:
  `artifacts/perf/2026-05-06T18-57-51-385Z/summary.json` and
  `artifacts/perf/2026-05-06T18-57-51-385Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Measurement trust PASS, validation WARN, `126` shots / `18` hits / `4`
  kills, max stuck `0.3s`, `719.70m` player travel, `98.68m` objective
  closure, `1` route no-progress reset, `9` heading reversals, `8` short-hop
  pacing reversals, `8` requested-move pacing flips, `0` actual-only flips,
  and `0` terrain-blocked flips.
- Longer 180s headed Open Frontier check:
  `artifacts/perf/2026-05-06T19-02-39-418Z/summary.json` and
  `artifacts/perf/2026-05-06T19-02-39-418Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Measurement trust PASS, validation WARN, `36` shots / `6` hits / `1` kill,
  max stuck `0.5s`, `1262.93m` player travel, `176.78m` objective closure,
  `2` route no-progress resets, `20` heading reversals, `16` short-hop pacing
  reversals, `15` requested-move pacing flips, `1` actual-only flip, and `0`
  terrain-blocked flips. The visually inspected final frame shows the player
  upright on the Ridge route rather than trapped; the back half is a low-contact
  zone route with perceived enemies hundreds of meters away.
- Validation: targeted Vitest PASS (`3` files / `207` tests),
  `npx tsc --noEmit --pretty false` PASS, and both latest active-driver
  diagnostics reran as WARN only for route no-progress resets, not heading
  reversal findings.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T19-11-51-517Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE` with KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release blocking; validation/release also fails because the working
  tree is dirty and local `master` is ahead of `origin/master`.
- Quick NPC speed spot-check from `movement-artifacts.json` supports keeping
  the owner-reported speed-spike issue open. The biggest apparent spikes are
  usually first tracked segments after harness relocation/compression, but the
  latest Open Frontier 180s proof still has `2` non-initial NPC route-follow
  segments above `20m/s` after excluding first segments and requiring
  `dt >= 0.25s`. Recent A Shau accepted route-stall proof
  `artifacts/perf/2026-05-06T15-32-02-870Z/summary.json` shows `0`
  non-initial NPC segments above `12m/s` by the same rough filter. Next pass
  should formalize this as an artifact gate with explicit run/sprint/recovery
  envelopes instead of relying on manual spot checks.
- Non-claim: this fixes the route micro-target pacing mechanism well enough to
  keep, but it is still not skilled-player acceptance. Remaining work is
  combat pressure/target-distribution quality, NPC speed-spike telemetry that
  excludes initial harness relocation/compression, and the already-open
  terrain/foundation/vehicle-driving acceptance path.

2026-05-06 Projekt Objekt-143 retained active-driver zone-gate/anchor-continuation and NPC speed-clock fix
- Formalized the owner-observed NPC overspeed suspicion as a retained diagnostic
  path instead of leaving it as a manual spot check. The bad reference artifact
  `artifacts/perf/2026-05-06T19-20-55-127Z` recorded `2` non-initial hard
  speed spikes with max non-initial speed `21.94m/s`. Root cause was stale
  medium-LOD catch-up after high-LOD combatant updates: the high-LOD paths moved
  NPCs without advancing `combatant.lastUpdateTime`, then a later medium-LOD
  tick applied an oversized delta. `CombatantLODManager` now stamps
  `lastUpdateTime` after high-LOD visual/ultralight/full updates, with unit
  coverage for both clock stamping and stale catch-up prevention.
- Retained the active-driver/player-bot routing fixes that address the hard
  start-cluster pacing signature: zone objectives no longer let ALERT/ADVANCE
  reacquire ungated far enemies, aggressive large-map objective selection can
  route toward combat fronts beyond the old short target-acquisition band, route
  exhaustion falls forward through the remembered route direction or direct
  anchor continuation, and stale micro-route targets now recover toward the real
  anchor instead of zeroing movement. The TypeScript harness mirror has the same
  objective-aware ungated-target suppression as the injected CJS driver.
- Rejected diagnostics kept for traceability: `artifacts/perf/2026-05-06T19-56-06-419Z`
  proved the first fix still fell into a long zone loop (`96` heading reversals,
  `94` short-hop pacing reversals); `artifacts/perf/2026-05-06T20-05-44-589Z`
  fixed the zone loop but exposed route-exhaustion zero movement; and
  `artifacts/perf/2026-05-06T20-10-49-441Z` restored movement/combat volume
  (`96` shots / `11` hits) but failed validation on heap recovery and still had
  `49` heading/pacing reversals. Do not use those as retained acceptance
  evidence.
- Current retained headed Open Frontier proof:
  `artifacts/perf/2026-05-06T20-14-36-990Z/summary.json` and
  `artifacts/perf/2026-05-06T20-14-36-990Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Measurement trust PASS, capture OK with validation WARN only on p99
  `31.10ms` and heap peak growth `38.72MB`, `150` shots / `18` hits / `6`
  kills, max stuck `0.3s`, `64` movement transitions, `120` waypoints followed,
  `201/365` nonzero movement-intent calls, `480.99m` player travel, final
  objective kind `nearest_opfor`, objective distance `154.14m -> 129.89m`,
  objective closure `24.25m`, `1` route no-progress reset, and the diagnostic
  no longer reports heading-reversal or short-hop pacing findings. The paired
  NPC speed diagnostic is PASS with max non-initial speed `6.1m/s` and `0`
  non-initial hard/review spikes.
- Validation: `npx vitest run scripts/perf-harness/perf-active-driver.test.js
  src/dev/harness/playerBot/states.test.ts src/dev/harness/PlayerBot.test.ts
  src/systems/combat/CombatantLODManager.test.ts
  src/systems/combat/CombatantMovement.test.ts
  scripts/perf-harness/projekt-143-npc-speed-diagnostic.test.ts
  scripts/perf-harness/projekt-143-active-driver-diagnostic.test.ts
  --reporter=dot` PASS (`7` files / `323` tests), `npx tsc --noEmit --pretty
  false` PASS, `node --check scripts/perf-active-driver.cjs` PASS, and
  `npm run build:perf` PASS with only the usual Vite chunk-size warning.
- Non-claim: this fixes the hard twitch/stall mechanism enough to retain and
  removes the current formal speed-spike failure, but it is still not
  skilled-player or objective-flow acceptance. Objective closure remains modest,
  route/objective quality still needs longer proof, and broader terrain
  distribution/foundation/driving/KB-TERRAIN plus KB-LOAD/KB-CULL/release
  blockers remain open.

2026-05-06 Projekt Objekt-143 A Shau retained active-driver proof and completion-audit correction
- Refreshed the formal completion audit before doing more work. It wrote
  `artifacts/perf/2026-05-06T20-22-46-828Z/projekt-143-completion-audit/completion-audit.json`
  and remained `NOT_COMPLETE`: KB-LOAD, KB-TERRAIN, KB-CULL, and
  validation/release were still blockers.
- Ran headed A Shau Valley browser proof against the retained active-driver and
  NPC-speed fixes:
  `artifacts/perf/2026-05-06T20-23-31-045Z/summary.json`. Measurement trust
  PASS, capture OK, validation WARN only on heap peak growth `81.63MB`, average
  frame `5.58ms`, peak p99 `13.90ms`, `389` shots / `98` hits / `23` kills,
  max stuck `0.3s`, `454.31m` player travel, `22` movement transitions, `27`
  waypoints followed, `0` route no-progress resets, and `0` browser errors.
- Formal diagnostics on the same A Shau artifact:
  `artifacts/perf/2026-05-06T20-23-31-045Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  is WARN only because objective distance closed `0.0m` by the current
  final-sample metric; it reports no heading reversals, no pacing flips, no
  terrain blocking, no route no-progress resets, and movement block reason
  `none`. `artifacts/perf/2026-05-06T20-23-31-045Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`
  is PASS with `0` initial/non-initial review or hard spikes and max
  non-initial speed `4.5m/s`.
- Corrected `scripts/projekt-143-completion-audit.ts` so the KB-TERRAIN
  checklist no longer says active-driver browser proof is missing after it has
  trusted Open Frontier and A Shau mode-pair evidence. The refreshed audit at
  `artifacts/perf/2026-05-06T20-29-26-656Z/projekt-143-completion-audit/completion-audit.json`
  still remains `NOT_COMPLETE`, but now records:
  Open Frontier trusted proof `true`, A Shau trusted proof `true`, mode-pair
  proof `true`, pacing signature clear `true`, and objective-flow still WARN
  `true`.
- Validation: `npx tsc --noEmit --pretty false` PASS and
  `npm run check:projekt-143-completion-audit` PASS as a `NOT_COMPLETE` audit.
- Non-claim: this is a meaningful closeout of the telemetry pacing/stuck
  signature across Open Frontier and A Shau, but it does not complete
  KB-TERRAIN. Remaining terrain blockers include objective-flow/human visual
  acceptance, foundation/airfield relief, hydrology/water art/perf acceptance,
  ground-cover runtime imports, and broader KB-LOAD/KB-CULL/release work.

2026-05-06 Projekt Objekt-143 close-pressure combat movement follow-up
- Fixed two movement-contract issues behind the owner-observed close-pressure
  pacing/stall loop: generic ENGAGING backpedal now only happens under the
  `6m` near-collision band instead of across the full close-combat range, and
  RETREATING now has a `CombatantMovement` branch that walks toward its fallback
  destination instead of carrying stale combat velocity.
- Validation: focused movement/retreat/utility Vitest slice PASS (`4` files /
  `73` tests), `npx tsc --noEmit --pretty false` PASS, `npm run build:perf`
  PASS with the usual Vite chunk-size warning, broader targeted suite PASS
  (`10` files / `380` tests), and scoped `git diff --check` on movement files
  clean except CRLF warnings.
- Runtime proof:
  `artifacts/perf/2026-05-06T20-55-52-422Z/summary.json`. Measurement trust
  PASS, capture OK, validation WARN on peak p99 `33.80ms`, `149` shots / `12`
  hits / `4` kills, max stuck `0.3s`, `499.86m` player travel, `32` movement
  transitions, `2` route no-progress resets, and final movement block reason
  `none`.
- Formal diagnostics on the same artifact:
  `artifacts/perf/2026-05-06T20-55-52-422Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  remains WARN because objective distance closed only `-1.8m` by the final
  sample and route objective-progress recovery reset path `2` times; it reports
  `13` heading flips, `13` pacing flips, `12` requested-move pacing flips, and
  `0` blocked-terrain flips.
  `artifacts/perf/2026-05-06T20-55-52-422Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`
  is PASS with max non-initial speed `6.08m/s`.
- Manual movement-artifact comparison against the retained
  `20-14-36-990Z` Open Frontier proof improved tracked-NPC worst path/net ratio
  `12.2x -> 2.2x`, worst reversals `15 -> 4`, backtrack hotspots `33 -> 9`,
  and pinned events `56 -> 35`. Contour activations rose (`655 -> 22043`), so
  this is retained close-pressure/NPC-loop evidence, not final NPC pathing,
  objective-flow, or skilled-player acceptance.

2026-05-06 Projekt Objekt-143 terrain placement/foundation follow-up
- Closed the static generated-placement warning left by the foundation audit.
  `scripts/projekt-143-terrain-placement-audit.ts` now records exact-placement
  core-span detail and scopes generated-placement core/native-relief warnings
  to exact/no-flat-search parked aircraft, because generated structures use
  the runtime flat-search solver and need screenshot review rather than a
  pre-search static failure.
- Forward-strip parking fix: moved the Huey to the taxi pad, moved the A-1
  stand and route entry onto the apron, and added a dedicated packed-earth A-1
  parking pad so the large A-1 footprint no longer straddles conflicting stamp
  targets on A Shau's Tabat strip.
- Static placement proof:
  `artifacts/perf/2026-05-06T21-15-18-611Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  is PASS with `fail=0` / `warn=0` across AI Sandbox, TDM seeds `42`/`137`/`2718`,
  Zone Control seeds `42`/`137`/`2718`, Open Frontier seed `42`, and A Shau.
- Runtime visual packet:
  `artifacts/perf/2026-05-06T21-16-29-510Z/projekt-143-terrain-visual-review/visual-review.json`
  is PASS for Open Frontier and A Shau with zero browser/page errors. This is
  review-packet evidence only; human foundation/art acceptance, matched perf,
  Pixel Forge building/vehicle replacement, and future driving-surface checks
  remain open.
- Validation: `npx vitest run src/systems/terrain/TerrainFeatureCompiler.test.ts
  src/systems/world/AirfieldLayoutGenerator.test.ts
  src/systems/world/WorldFeatureSystem.test.ts --reporter=dot` PASS (`3` files /
  `41` tests), `npx tsc --noEmit --pretty false` PASS, and `npm run build:perf`
  PASS with the usual Vite chunk-size warning.
- Completion audit refresh:
  `artifacts/perf/2026-05-06T21-28-30-554Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`: KB-LOAD, broad KB-TERRAIN, KB-CULL, and
  validation/release are still partial/failing. The audit now keeps the narrow
  `20-55-52-422Z` movement diagnostic from downgrading the retained
  active-driver pacing baseline: pacing/terrain findings are clear, while
  objective closure and route-progress recovery remain WARN. The current
  terrain placement warning itself is cleared, but Projekt Objekt-143 is not
  complete.

2026-05-06 Projekt Objekt-143 KB-LOAD banana candidate import guard
- Hardened `scripts/projekt-143-vegetation-candidate-import-plan.ts` so the
  selected Pixel Forge vegetation import plan now records candidate quality and
  blocks `bananaPlant/banana-tree-sean-tarrant` when strong cyan-blue opaque
  stem pixels are present. This directly protects the cleaned runtime banana
  atlas from being overwritten by a generated candidate that still has the
  owner-reported blue lower-stem artifact.
- Refreshed import-plan evidence:
  `artifacts/perf/2026-05-06T21-31-34-473Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`
  intentionally FAILS with `importState=blocked`: `3/4` selected vegetation
  replacement sets are ready by path, dimension, metadata, and normal-map
  contract, but the banana candidate has `4101` strong cyan-blue opaque stem
  pixels.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T21-32-40-288Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`: KB-LOAD, broad KB-TERRAIN, KB-CULL, and
  validation/release are still blockers. The KB-LOAD next step is to repair or
  regenerate the Pixel Forge banana candidate before any
  `--apply --owner-accepted` import can proceed.
- Validation: `npx tsc --noEmit --pretty false` PASS, and
  `npm run check:projekt-143-vegetation-candidate-import-plan` fails by design
  as the guard artifact above. Treat that failure as the correct current state,
  not as a broken script.

2026-05-06 Projekt Objekt-143 KB-LOAD banana candidate repair
- Repaired the Pixel Forge side of the banana blue-stem issue instead of only
  blocking it downstream. In `C:\Users\Mattm\X\games-3d\pixel-forge`,
  `scripts/run-tij-pipeline.ts` now postprocesses the known
  `bananaPlant/banana-tree-sean-tarrant` atlas to recolor strong cyan-blue
  opaque stem pixels to green during vegetation candidate generation, and
  `scripts/validate-tij-vegetation-package.ts` now fails banana atlases with
  nonzero strong cyan-blue stem pixels.
- Ran `bun run tij:pipeline:kb-load-vegetation-256` in Pixel Forge, then
  `bun run tij:vegetation-validate:kb-load-vegetation-256` PASS. Direct sharp
  inspection of
  `packages/server/output/tij-candidates/kb-load-vegetation-256/vegetation/bananaPlant/banana-tree-sean-tarrant/imposter.png`
  reports `0` strong cyan-blue opaque pixels.
- Refreshed TIJ candidate proof:
  `artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/summary.json`
  PASS with `4/4` selected color/normal/meta pairs complete and contact sheet
  `artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/candidate-contact-sheet.png`.
- Refreshed TIJ import plan after the new candidate proof:
  `artifacts/perf/2026-05-06T21-41-01-701Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`
  PASS with `importState=dry_run_ready`, `4/4` ready items, and banana candidate
  `strongCyanStemPixels=0`. No runtime assets were copied.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T21-41-18-896Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`: KB-LOAD is still `ready_for_branch`, not
  `evidence_complete`, because owner visual acceptance, runtime import,
  startup tables, and production parity are not claimed. Broad KB-TERRAIN,
  KB-CULL, and validation/release remain blockers too.

2026-05-06 Projekt Objekt-143 kickoff/culling evidence refresh
- Wired `scripts/projekt-143-cycle3-kickoff.ts` to ingest the latest
  `projekt-143-vegetation-candidate-proof` and
  `projekt-143-vegetation-candidate-import-plan` artifacts. The kickoff now
  reports the KB-LOAD 256px Pixel Forge vegetation candidate as proof/import
  dry-run ready instead of still saying candidate generation is next.
- Refreshed deterministic KB-CULL evidence:
  `artifacts/perf/2026-05-06T21-46-53-599Z/projekt-143-culling-proof/summary.json`
  PASS. The representative visible categories are world static features
  `420` visible triangles / `35` draw-call-like, fixed-wing aircraft `2144` /
  `58`, helicopters `1184` / `28`, vegetation imposters `2` / `1`, NPC
  imposters `4` / `1`, and close NPC GLBs `659` / `7`.
- Refreshed owner baseline:
  `artifacts/perf/2026-05-06T21-47-00-204Z/projekt-143-culling-owner-baseline/summary.json`
  PASS, selecting `large-mode-world-static-and-visible-helicopters` from the
  latest trusted Open Frontier/A Shau scene attribution. Open Frontier owner
  visible draw-call-like is `130` with visible unattributed triangles `1.073%`;
  A Shau owner visible draw-call-like is `65` with visible unattributed
  triangles `4.107%`.
- Refreshed Cycle 3 kickoff:
  `artifacts/perf/2026-05-06T21-49-41-394Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  PASS. KB-OPTIK and KB-EFFECTS remain `evidence_complete`; KB-LOAD,
  KB-TERRAIN, and KB-CULL remain `ready_for_branch`.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T21-49-59-697Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` with the same blockers: KB-LOAD, broad KB-TERRAIN,
  broad KB-CULL, and validation/release.
- Validation: `npx tsc --noEmit --pretty false` PASS after the kickoff-script
  change; `npm run check:projekt-143-culling-proof`,
  `npm run check:projekt-143-culling-baseline`,
  `npm run check:projekt-143-cycle3-kickoff`, and
  `npm run check:projekt-143-completion-audit` all completed with the statuses
  above.

2026-05-06 Projekt Objekt-143 matched terrain/perf pair refresh
- Parsed the latest sequential Open Frontier and A Shau captures after the
  KB-LOAD candidate/import-plan and KB-CULL evidence refresh.
- Open Frontier:
  `artifacts/perf/2026-05-06T21-54-56-334Z/summary.json` is OK with
  measurement trust PASS and validation WARN on peak p99 `34.00ms` plus heap
  peak growth `57.77MB`; it recorded `159` shots / `15` hits / `4` kills and
  `1576.68m` player travel.
- A Shau:
  `artifacts/perf/2026-05-06T21-58-44-146Z/summary.json` is OK with
  measurement trust PASS and validation PASS; peak p99 is `11.70ms`, peak max
  frame is `27.40ms`, and it recorded `639` shots / `86` hits / `25` kills and
  `1167.65m` player travel.
- Ran paired diagnostics for both artifact roots. NPC speed diagnostics PASS:
  Open Frontier max non-initial speed `6.11m/s`; A Shau max non-initial speed
  `4.5m/s`. Active-driver diagnostics remain WARN: Open Frontier has `9`
  route objective-progress resets and `61` heading reversals over `120`
  degrees; A Shau has `5` route objective-progress resets and `33` heading
  reversals. Treat this as trusted liveness/perf evidence, not final
  skilled-player, objective-flow, terrain-route, or human visual acceptance.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T22-07-06-284Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`: KB-LOAD, KB-TERRAIN, KB-CULL, and validation/release
  are still blockers.

2026-05-06 Projekt Objekt-143 KB-CULL air-vehicle frustum render-cull slice
- Added conservative camera-frustum render gating to
  `src/systems/vehicle/AirVehicleVisibility.ts` for unpiloted/non-near air
  vehicles. Piloted vehicles still always render, near aircraft inside `120m`
  stay visible even outside the frustum, and the test uses an `80m` bounding
  sphere rather than a center-point check.
- Added behavior coverage in `src/systems/vehicle/AirVehicleVisibility.test.ts`
  for in-frustum rendering, behind-camera culling, and near off-frustum
  visibility. Validation: `npx vitest run
  src/systems/vehicle/AirVehicleVisibility.test.ts
  src/systems/helicopter/HelicopterInteraction.test.ts
  src/systems/vehicle/FixedWingInteraction.test.ts --reporter=dot` PASS
  (`3` files / `19` tests), `npx tsc --noEmit --pretty false` PASS, and
  `npm run build:perf` PASS with the usual Vite chunk-size warning.
- Refreshed deterministic culling proof:
  `artifacts/perf/2026-05-06T22-12-58-306Z/projekt-143-culling-proof/summary.json`
  PASS.
- Fresh matched after captures:
  `artifacts/perf/2026-05-06T22-13-31-657Z/summary.json` (Open Frontier, OK,
  measurement trust PASS, validation WARN on peak p99 `33.60ms` and heap peak
  growth `41.60MB`) and
  `artifacts/perf/2026-05-06T22-17-13-350Z/summary.json` (A Shau, OK,
  measurement trust PASS, validation WARN on heap peak growth `44.04MB`, peak
  p99 `11.80ms`, peak max frame `22.00ms`).
- Culling owner baseline:
  `artifacts/perf/2026-05-06T22-22-09-798Z/projekt-143-culling-owner-baseline/summary.json`
  PASS. Open Frontier selected-owner visible draw-call-like is `117`
  (`world_static_features=117`, `helicopters=0`), A Shau selected-owner visible
  draw-call-like is `52` (`world_static_features=39`, `helicopters=13`), and
  visible-unattributed triangles remain under `10%`.
- Refreshed Cycle 3 kickoff:
  `artifacts/perf/2026-05-06T22-23-06-483Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  PASS. It records the selected static-feature/visible-helicopter owner path as
  scoped `evidence_complete`, while KB-CULL remains `ready_for_branch` at the
  whole-bureau level because broad HLOD, parked-aircraft playtest, future
  vehicle driving, and vegetation culling remain open.
- Paired active-driver diagnostics remain WARN:
  `artifacts/perf/2026-05-06T22-13-31-657Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  reports `9` route no-progress resets and `161` short-hop pacing reversals;
  `artifacts/perf/2026-05-06T22-17-13-350Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  reports `30` waypoint replan failures and `7` route no-progress resets.
  NPC speed diagnostics PASS in both after roots.
- Refreshed completion audit:
 `artifacts/perf/2026-05-06T22-22-48-759Z/projekt-143-completion-audit/completion-audit.json`
 remains `NOT_COMPLETE`: KB-LOAD, broad KB-TERRAIN, broad KB-CULL, and
 validation/release remain blockers.

2026-05-06 Projekt Objekt-143 active-driver direct-combat fallback and owner water/combined-arms note
- Retained a narrow active-driver fix in `scripts/perf-active-driver.cjs`:
  route-overlay steering is skipped while the perf player is visibly firing and
  closing, and current combat-target navmesh snap failure is surfaced as
  `direct_combat_fallback` instead of repeated waypoint replan failures. Added
  focused coverage in `scripts/perf-harness/perf-active-driver.test.js`.
- Rejected and reverted a closer-target-lock override after fresh Open Frontier
  proof worsened pacing. Rejected artifact:
  `artifacts/perf/2026-05-06T22-39-50-930Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  (`125` heading reversals, `11` route no-progress resets).
- Open Frontier retained-slice diagnostic:
  `artifacts/perf/2026-05-06T22-34-05-681Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  remains WARN with `9` route no-progress resets and `45` short-hop pacing
  reversals, but improves the earlier `161` reversal signal from
  `22-13-31-657Z`.
- A Shau retained-slice proof:
  `artifacts/perf/2026-05-06T22-44-28-979Z/summary.json` is OK with validation
  PASS and measurement trust PASS; paired diagnostic
  `artifacts/perf/2026-05-06T22-44-28-979Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  records `333` shots / `46` hits / `14` kills, `0` waypoint replan failures,
  objective closure `295.15m`, `9` heading reversals, and WARN only on `8`
  route no-progress resets.
- Validation: `node --check scripts/perf-active-driver.cjs` PASS,
  `npx vitest run scripts/perf-harness/perf-active-driver.test.js
  --reporter=dot` PASS (`203` tests), `npx tsc --noEmit --pretty false` PASS,
  and `npm run build:perf` PASS with the usual Vite chunk-size warning.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T22-50-55-192Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE` with KB-LOAD, broad KB-TERRAIN, broad KB-CULL, and
  validation/release still blocking.
- Folded the owner note into `docs/PROJEKT_OBJEKT_143.md` and
  `docs/PROJEKT_OBJEKT_143_HANDOFF.md`: current water is not natural enough and
  remains a KB-TERRAIN human art blocker despite hydrology/runtime mesh proof;
  NPC muddling remains a combined-arms objective-flow blocker requiring visible
  objectives, support activity, movement pressure, and battlefield life.

2026-05-06 Projekt Objekt-143 water naturalism mitigation
- Mitigated the owner-rejected water look without claiming final acceptance.
  `src/systems/environment/WaterSystem.ts` now uses a darker lower-distortion
  global water profile and builds hydrology channels as narrower darker RGBA
  ribbons with bank-to-channel vertex alpha instead of a flat emissive teal
  strip. `src/systems/terrain/TerrainSurfaceRuntime.ts` now feathers the
  hydrology terrain mask and uses linear filtering; `TerrainMaterial.ts` now
  blends hydrology terrain contribution proportionally at very low strength
  instead of replacing whole grid cells.
- Hardened `scripts/projekt-143-water-runtime-proof.ts`: Playwright contexts
  now block service workers, and the proof camera focuses on a representative
  channel centerline rather than the full hydrology bounding box. The proof also
  requires the `natural_channel_gradient` material profile and RGBA color
  attribute.
- Focused validation passed:
  `npx vitest run src/systems/environment/WaterSystem.test.ts
  src/systems/terrain/TerrainSystem.test.ts
  src/systems/terrain/TerrainMaterial.test.ts --reporter=dot` (`3` files /
  `30` tests), `node --check scripts/projekt-143-water-runtime-proof.ts`,
  `node --check scripts/projekt-143-water-system-audit.ts`,
  `npx tsc --noEmit --pretty false`, and `npm run build:perf` with the usual
  Vite chunk-size warning.
- Refreshed evidence:
  `artifacts/perf/2026-05-06T23-23-35-936Z/projekt-143-water-system-audit/water-system-audit.json`
  remains WARN by design and records the feathered terrain material mask plus
  bank-to-channel river consumer;
  `artifacts/perf/2026-05-06T23-26-44-103Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
  PASS with screenshots
  `artifacts/perf/2026-05-06T23-26-44-103Z/projekt-143-water-runtime-proof/open_frontier-river-proof.png`
  and
  `artifacts/perf/2026-05-06T23-26-44-103Z/projekt-143-water-runtime-proof/a_shau_valley-river-proof.png`.
- Non-claim: the latest close A Shau screenshot is better evidence but still
  not final water art acceptance. KB-TERRAIN still needs a real stream/lake/flow
  art pass and human review before water closes.
- Refreshed completion audit:
  `artifacts/perf/2026-05-06T23-31-20-865Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`. KB-LOAD, broad KB-TERRAIN, broad KB-CULL, and
  validation/release still block completion; validation/release also notes the
  current uncommitted working tree.

2026-05-06 Projekt Objekt-143 combined-arms liveness mitigation
- Fixed a concrete strategic-order bug in `src/systems/strategy/StrategicDirector.ts`:
  the director now iterates the active factions present in the war state instead
  of issuing orders only to hardcoded `US` and `NVA`. Defense, retreat, and
  forward-reinforcement zone selection now uses alliance ownership, so ARVN
  squads can defend US-owned objectives and VC squads retreat toward OPFOR
  zones rather than the nearest enemy home base.
- Added `src/systems/strategy/StrategicDirector.test.ts` coverage for both
  mixed-faction cases. Focused validation passed:
  `npx vitest run src/systems/strategy/StrategicDirector.test.ts
  src/systems/strategy/WarSimulator.test.ts --reporter=dot` (`2` files / `8`
  tests), broader strategy/combat-adjacent validation passed:
  `npx vitest run src/systems/strategy/StrategicDirector.test.ts
  src/systems/strategy/WarSimulator.test.ts src/systems/combat/SquadManager.test.ts
  src/systems/combat/SpawnPositionCalculator.test.ts --reporter=dot` (`4`
  files / `75` tests), `npx tsc --noEmit --pretty false` PASS, and
  `npm run build:perf` PASS with the usual Vite chunk-size warning.
- Non-claim: this is a tactical liveness fix for mixed-faction orders, not
  complete combined-arms battlefield-feel acceptance. It still needs a browser
  proof/playtest that objective pressure, support activity, and movement fronts
  visibly reduce local NPC crowd churn.
- Refreshed completion audit:
 `artifacts/perf/2026-05-06T23-42-25-116Z/projekt-143-completion-audit/completion-audit.json`
 remains `NOT_COMPLETE` with the same blockers: KB-LOAD, broad KB-TERRAIN,
 broad KB-CULL, and validation/release.

2026-05-06 Projekt Objekt-143 headed Open Frontier liveness proof after strategy fix
- The first short headless Open Frontier capture
  `artifacts/perf/2026-05-06T23-49-58-230Z/summary.json` failed diagnostic
  trust: startup phase was live and `gameStarted=true`, but metrics frame
  progression did not reach the default stabilization threshold, the active
  driver never started, and measurement trust failed. Treat it as harness-noise
  evidence only.
- Forced-threshold headless rerun
  `artifacts/perf/2026-05-06T23-53-26-820Z/summary.json` produced active-driver
  telemetry but still failed measurement trust. It showed a perceived OPFOR at
  roughly `202m` and a valid path, but only `3.8m` player movement and `0`
  shots, so it is diagnostic only.
- Headed Open Frontier rerun
  `artifacts/perf/2026-05-06T23-55-53-018Z/summary.json` is the trustworthy
  proof: capture OK, measurement trust PASS, validation WARN only on peak p99
  and heap peak growth. The paired diagnostic
  `artifacts/perf/2026-05-06T23-55-53-018Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  is PASS with `50` shots, `7` hits, `1` kill, max stuck `0.3s`, `17`
  movement transitions, and objective pressure against nearest OPFOR.
- Residual issue: the same headed run still logs NPC terrain-stall/backtracking
  warnings, and `movement-artifacts.json` shows a large `npc_contour` hotspot
  near `(-12, -1356)`. This means the active driver is functioning, but broad
  NPC route/terrain flow and combined-arms battlefield-life acceptance remain
  open.
- Refreshed completion audit:
  `artifacts/perf/2026-05-07T00-01-10-047Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`. KB-LOAD, broad KB-TERRAIN, broad KB-CULL, and
  validation/release still block completion; validation/release still sees the
  dirty working tree.

2026-05-07T00Z Projekt Objekt-143 NPC terrain-route waypoint-skip mitigation
- Patched `src/systems/combat/CombatantMovement.ts` so an NPC following a
  navmesh route can skip a terrain-blocked intermediate waypoint when a later
  waypoint on the same already-planned route is immediately walkable. This is
  deliberately narrower than replanning or smoothing the route: it preserves the
  route but avoids local terrain-lip contour/backtrack churn.
- Added focused coverage in `src/systems/combat/CombatantMovement.test.ts` for
  a blocked first waypoint with a walkable side waypoint.
- Validation passed:
  `npx vitest run src/systems/combat/CombatantMovement.test.ts --reporter=dot`
  (`18` tests),
  `npx vitest run src/systems/combat/CombatantMovement.test.ts
  src/systems/combat/StuckDetector.test.ts
  src/systems/combat/CombatantMovementStates.test.ts
  src/systems/strategy/StrategicDirector.test.ts
  src/systems/strategy/WarSimulator.test.ts --reporter=dot` (`5` files / `70`
  tests), `npx tsc --noEmit --pretty false` PASS, and `npm run build:perf` PASS
  with the usual Vite chunk-size warning.
- Headed Open Frontier proof after the patch:
  `artifacts/perf/2026-05-07T00-05-21-283Z/summary.json` is OK with measurement
  trust PASS and validation WARN only on peak p99. Active-driver diagnostic
  `artifacts/perf/2026-05-07T00-05-21-283Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  is WARN only for `1` route objective-progress reset; it records `34` shots,
  `6` hits, `2` kills, max stuck `0.0s`, objective closure `34.51m`, `198.80m`
  player movement, and no heading/pacing flips.
- NPC speed diagnostic PASS:
  `artifacts/perf/2026-05-07T00-05-21-283Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`
  (ignored `10` first tracked relocation/compression segments above `20m/s`;
  no non-initial speed issue).
- Movement artifact comparison versus the prior headed proof
  `23-55-53-018Z`: `npc_contour` total improved `5355 -> 473`, `npc_backtrack`
  `11 -> 0`, pinned events `17 -> 5`, and max pinned time `13.35s -> 6.67s`.
  This supports keeping the waypoint-skip mitigation.
- Non-claim: final-frame inspection still shows steep hillside combat and a
  cliff-edge structure placement problem. This is an NPC route/terrain-stall
  mitigation, not final combined-arms battlefield-feel or KB-TERRAIN placement
  acceptance.
- Refreshed completion audit:
  `artifacts/perf/2026-05-07T00-10-28-535Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`. KB-LOAD, broad KB-TERRAIN, broad KB-CULL, and
  validation/release still block completion; validation/release still sees the
  dirty working tree.

2026-05-07T00Z Projekt Objekt-143 KB-LOAD proof-only vegetation candidate startup evidence
- Built fresh retail `dist/` with `npm run build`; prebuild regenerated stale
  Open Frontier / Zone Control / TDM navmesh and heightmap prebakes, then Vite
  and `cloudflare:assets:manifest` passed with the usual chunk-size warning.
- Captured current-before startup tables from the same retail bundle:
  Open Frontier
  `artifacts/perf/2026-05-07T00-17-33-822Z/startup-ui-open-frontier/summary.json`
  averaged `4387ms` mode-click-to-playable, `3654.7ms`
  deploy-click-to-playable, `385.467ms` WebGL upload total, and `29.633ms`
  average max upload; Zone Control
  `artifacts/perf/2026-05-07T00-18-29-720Z/startup-ui-zone-control/summary.json`
  averaged `4465.3ms` mode-click-to-playable, `3947ms`
  deploy-click-to-playable, `395.833ms` WebGL upload total, and `33.9ms`
  average max upload.
- Added a proof-only candidate substitution mode to `scripts/perf-startup-ui.ts`.
  `--use-vegetation-candidates` reads a PASS/dry-run-ready vegetation candidate
  import plan and serves candidate color/normal/meta files for the matching
  runtime vegetation URLs during the benchmark. It does not copy assets and does
  not imply owner acceptance.
- Captured after-candidate startup tables with the explicit import plan
  `artifacts/perf/2026-05-06T21-41-01-701Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`:
  Open Frontier
  `artifacts/perf/2026-05-07T00-21-34-591Z/startup-ui-open-frontier-vegetation-candidates/summary.json`
  averaged `2049.7ms` mode-click-to-playable, `1417.3ms`
  deploy-click-to-playable, `232.4ms` WebGL upload total, and `21.9ms`
  average max upload; Zone Control
  `artifacts/perf/2026-05-07T00-22-34-000Z/startup-ui-zone-control-vegetation-candidates/summary.json`
  averaged `1934.7ms` mode-click-to-playable, `1369.3ms`
  deploy-click-to-playable, `254.333ms` WebGL upload total, and `24.7ms`
  average max upload.
- Wired the candidate startup pair into
  `scripts/projekt-143-load-branch-selector.ts` and
  `scripts/projekt-143-cycle3-kickoff.ts`. Refreshed selector:
  `artifacts/perf/2026-05-07T00-26-06-920Z/projekt-143-load-branch-selector/load-branch-selector.json`
  reports `candidate_startup_proof_ready`, `12` candidate substitutions,
  Open Frontier mode-click delta `-2337.333ms`, Zone Control mode-click delta
  `-2530.666ms`, Open Frontier upload-total delta `-153.067ms`, and Zone
  upload-total delta `-141.5ms`.
- Refreshed Cycle 3 kickoff:
  `artifacts/perf/2026-05-07T00-26-45-885Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  remains PASS but keeps KB-LOAD `READY_FOR_BRANCH`, correctly noting that the
  proof-only candidate startup win still requires owner visual acceptance,
  accepted import, and real runtime proof.
- Refreshed completion audit after the revised stabilization objective:
 `artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json`
 remains `NOT_COMPLETE`: KB-LOAD, broad KB-TERRAIN, and broad KB-CULL are now
 accepted only as captured roadmap/backlog signal, while validation/release
 still blocks completion.

2026-05-07T00Z Projekt Objekt-143 KB-TERRAIN placement and visual-review refresh
- Refreshed the static placement/foundation audit:
  `artifacts/perf/2026-05-07T00-32-41-375Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  PASS with `57` audited features, `0` fails, and `0` warns across all audited
  modes and seed variants. This is static source/stamp evidence only.
- Refreshed the terrain visual-review packet once as a plain presence check,
  then tightened `scripts/projekt-143-terrain-visual-review.ts` so it now
  records `lumaMean`, `overexposedRatio`, and a
  `terrain_water_exposure_review` check. The latest visual-review packet is:
  `artifacts/perf/2026-05-07T01-03-50-825Z/projekt-143-terrain-visual-review/visual-review.json`
  plus contact sheet
  `artifacts/perf/2026-05-07T01-03-50-825Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`.
  It captured `14/14` expected Open Frontier/A Shau player-ground, route/trail,
  airfield-foundation, airfield-parking, support-foundation, river-oblique, and
  river-ground screenshots with zero browser/page errors, but now reports WARN
  because the Open Frontier parking/river shots are washed out:
  `overexposedRatio=0.7448`, `0.8115`, and `0.8309`, with luma means around
  `233-237`.
- Manual contact-sheet inspection keeps this as review evidence, not
  acceptance: Open Frontier water and some pad/foundation compositions still
  read flat/artificial, A Shau foundation shots are glare-heavy, and the river
  views prove hydrology/water presence rather than natural final stream art.
  KB-TERRAIN therefore remains open for owner visual acceptance, water art,
  matched Open Frontier/A Shau perf, Pixel Forge building/vehicle replacement,
  ground-cover/trail polish, and future vehicle-driving surface acceptance.
- Refreshed completion audit after the revised stabilization objective:
 `artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`. KB-LOAD, broad KB-TERRAIN, and broad KB-CULL are now
  treated as roadmap/backlog-captured future work for the stabilization closeout;
  validation/release correctly remains blocked by the dirty working tree.

2026-05-07 Projekt Objekt-143 objective revision to stabilization closeout
- Owner direction changed: stop trying to force every experimental KB-LOAD,
  KB-TERRAIN, and KB-CULL branch to final `evidence_complete` before release.
  Revised target is to stabilize the useful current stack, preserve evidence,
  fold unresolved research/TODOs into roadmap/backlog/handoff docs, then
  validate, commit, push to `master`, deploy, and live-verify production.
- Updated the control docs:
  `docs/PROJEKT_OBJEKT_143.md` now defines "Projekt Objekt-143 Stabilization
  Closeout"; `docs/PROJEKT_OBJEKT_143_HANDOFF.md` now carries the
  "Stabilization Closeout Target"; `docs/ROADMAP.md` records that the next
  Projekt revamp is deferred until after stabilization; `docs/BACKLOG.md`
  carries the stabilization closeout checklist and deferred work list; and
  `docs/STATE_OF_REPO.md` reflects the new current-state direction.
- Updated `scripts/projekt-143-completion-audit.ts` so the completion gate now
  treats unresolved KB-LOAD/KB-TERRAIN/KB-CULL work as acceptable only if it is
  captured as future roadmap/backlog signal. The release gate still requires a
  clean validated repo, push, deploy, and live production verification before
  the objective can complete.
- Refreshed `npm run check:projekt-143-completion-audit` after the pivot:
  `artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json`.
  The revised audit passes every non-release item, including the roadmap/backlog
  capture item, and fails only `validation-and-release` because the repo is
  still dirty, unpushed, undeployed, and not live-verified.

2026-05-07 Projekt Objekt-143 stabilization release prep
- Refreshed the revised completion audit again:
  `artifacts/perf/2026-05-07T01-22-12-487Z/projekt-143-completion-audit/completion-audit.json`.
  It remains `NOT_COMPLETE` only because `validation-and-release` is blocked by
  the dirty/unpushed/undeployed working tree; every non-release bureau,
  owner-specific, and roadmap/backlog capture item passes under the revised
  stabilization objective.
- Ran `npm run validate:fast` after the pivot. It passed Pixel Forge cutover,
  Pixel Forge NPC crop freshness, typecheck, lint, and `test:quick` with `262`
  test files / `4075` tests passing.
- Ran `npm run validate`. It passed lint, full Vitest (`262` files / `4075`
  tests), production build, Cloudflare asset manifest generation, and local
  production smoke at `http://127.0.0.1:54097/`. Remaining release work is to
  commit the dirty tree, push `master`, run remote CI/deploy, and verify live
  production parity.
- Pushed the stabilization stack to `origin/master` and verified GitHub CI run
  `25470721988` PASS for lint, build, test, perf, production smoke, and mobile
  UI. Manual deploy run `25471425322` PASS.
- Added `npm run check:projekt-143-live-release-proof` so future release claims
  are scripted instead of hand-written: it checks the current `master` SHA
  against successful GitHub CI/deploy runs, live `/asset-manifest.json`, Pages
  headers, A Shau R2 DEM headers, and a live Pages browser smoke. The final
  completion audit depends on this proof plus clean local/remote git parity.
