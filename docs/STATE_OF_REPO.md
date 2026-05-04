# State Of Repo

Last updated: 2026-05-04

This file is the current-state snapshot for the repo. [ROADMAP.md](ROADMAP.md)
remains aspirational. [BACKLOG.md](BACKLOG.md) tracks queued work. This
document answers the narrower question: what is verified in the current repo
state. Historical cycle/archive docs remain historical evidence; this file is
the current truth anchor.

## Stable-Ground Snapshot On 2026-05-02

- A recovery operation is now tracked in
  [PROJEKT_OBJEKT_143.md](PROJEKT_OBJEKT_143.md). Phase 1 was signed on
  2026-05-02 after a read-only audit of code, live deployment state, tooling,
  perf artifacts, and suspect assets. Phase 2 is active with KB-METRIK first:
  the perf/profiling stack must certify measurement trust before optimization
  claims are accepted.
- Current Projekt Objekt-143 continuation has added measurement-trust output
  to perf captures and opened KB-LOAD measurement with retail startup UI
  artifacts. The first measured split shows Open Frontier and Zone Control both
  around 5.3-5.5s from mode click to playable, with most post-selection time
  after deploy click. Follow-up live-entry marks and browser-stall capture now
  narrow the local Open Frontier stall to a multi-second long task during the
  frame-yield window after terrain update, not the terrain update call itself.
  The latest CPU-profiled artifact points the dominant cost at Three/WebGL
  `texSubImage2D`, and the first asset-named diagnostic capture points the
  largest single upload at
  `assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png`
  (`4096x2048`, `2342.3ms`) with more Pixel Forge vegetation and NPC atlas
  uploads behind it. The new `npm run check:pixel-forge-textures` artifact
  inventories 42 Pixel Forge textures and estimates 781.17MiB of mipmapped RGBA
  residency, with giantPalm color/normal as hard failures and every NPC albedo
  atlas warning-sized. The extended audit also flags giantPalm and bananaPlant
  as vegetation oversampling cases above 80 pixels per runtime meter. Its
  candidate-size projection reduces estimated residency to 373.42MiB, saving
  407.75MiB if every flagged texture is regenerated to the proposed target.
  Scenario estimates now show the tradeoff between no-normal-map, vegetation,
  NPC, and all-candidate paths. This is an investigation finding; the current
  code changes are not a final startup remediation or visual asset sign-off.
  The same continuation opened KB-EFFECTS grenade-spike attribution with
  `npm run perf:grenade-spike`: a low-load two-grenade probe reproduced a
  first-use browser stall, while measured frag detonation JS work stayed at
  `1.4ms` total across two grenades. The current lead is first visible
  Three/WebGL explosion render/program work, not particle allocation, damage,
  audio, or physics broadphase. The 2026-05-03 current-HEAD refresh reproduced
  the stall again, and three matched visible warmup variants still hit
  trigger-adjacent `100ms` detonation frames with `373-397ms` long tasks. Those
  runtime warmup changes were rejected and reverted. A follow-up render
  attribution pass then isolated the actionable stall to the dynamic explosion
  `PointLight` render/program path: the before artifact recorded a
  trigger-adjacent `380ms` main-scene render call, while the unlit explosion
  remediation recorded `0` browser long tasks and trigger-adjacent main-scene
  render max `29.5ms`. The follow-up trust pass at
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`
  moved final observer/frame-metric arming into the first live grenade frame
  and now records measurement trust PASS, detonation max `30.2ms`, `0`
  trigger/post-trigger LoAFs, `0` long tasks, and near-trigger main-scene render
  max `23.6ms`. KB-EFFECTS low-load grenade first-use is closed for the unlit
  pooled explosion path; combat120/stress-scene grenade behavior remains
  advisory until its baseline is trustworthy.
- KB-OPTIK measurement has also started. `npm run check:pixel-forge-optics`
  writes a Pixel Forge imposter optics audit; the first artifact,
  `artifacts/perf/2026-05-02T20-54-56-960Z/pixel-forge-imposter-optics-audit/optics-audit.json`,
  flagged `28/28` runtime NPC atlases and `2/7` vegetation atlases. NPC
  imposter bakes use `96px` tiles with median visible actor height `65px`, but
  the original runtime stretched those bakes to a `4.425m` plane, producing a
  median runtime/source height ratio of `2.63x` and only `21.69px/m`. The first
  KB-OPTIK remediation at
  `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9` now uses the approved `2.95m`
  target plus generated upright per-tile crop maps. The first brightness-parity
  finding was architectural: NPC imposters, vegetation imposters, and close
  GLBs used separate shader/material contracts. Commit
  `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad` now forwards scene lighting/fog
  into NPC imposter shader uniforms; expanded luma is inside band, but
  the 8.5m near-stress camera visible-height samples still flag. Commit
  `5b053711cece65b5915ea786acc56e4a8ea22736` adds a runtime LOD-edge camera
  proof path; the committed-sha LOD-edge artifact passes with `0/40` flags, so
  the current open KB-OPTIK decision is near-stress exception/human review, not
  a measured LOD-edge failure.
- KB-TERRAIN measurement has moved from static audit to before-baseline
  screenshot evidence. `npm run check:vegetation-horizon` first wrote
  `artifacts/perf/2026-05-02T21-29-15-593Z/vegetation-horizon-audit/horizon-audit.json`,
  supports the elevated-camera vegetation report for large modes: registered
  vegetation fades out by `600m`, while Open Frontier can expose an estimated
  `396.79m` terrain band beyond vegetation and A Shau Valley can expose
  `3399.2m` because its camera far plane is `4000m`. The scatterer residency
  radius is not the primary large-mode limiter in this static audit; shader
  max distance is. Cycle 3 then added
  `npm run check:projekt-143-terrain-baseline`, with the fresh-build baseline
  at
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`.
  It captures elevated Open Frontier and A Shau screenshots plus renderer,
  terrain, vegetation, browser, warmup, and linked perf-before metadata. It is
  before evidence only; no far-canopy fix is accepted from it.
  A later 2026-05-04 KB-TERRAIN material pass added
  `npm run check:projekt-143-terrain-distribution` and shifted terrain material
  rules so broad highland/cleared/bamboo elevation bands no longer drive the
  primary ground biome in procedural modes or A Shau. The final static
  distribution artifact,
  `artifacts/perf/2026-05-04T02-02-26-811Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`,
  reports `100%` flat jungle-like primary ground in every mode and passes all
  steep-side rock-accent checks; its WARN is only the AI Sandbox random-seed
  fallback. The matching fresh-build screenshot proof is
  `artifacts/perf/2026-05-04T02-06-49-928Z/projekt-143-terrain-horizon-baseline/summary.json`.
  This is a material-distribution correction, not final vegetation density,
  far-canopy, A Shau atmosphere/color, static feature placement, or Pixel Forge
  building replacement acceptance. Current owner goal also includes properly
  shaped foundations for buildings/HQs/airfields/vehicles and a later
  performance-aware review of Pixel Forge building candidates. It also includes
  a future asset audit for TIJ and Pixel Forge ground/path/trail/grass/foliage
  and cover texture variety, with worn-in smoothed route surfaces that can
  support future vehicles where appropriate.
- KB-STRATEGIE filed the WebGL/WebGPU brief. `npm run check:webgpu-strategy`
  wrote
  `artifacts/perf/2026-05-02T21-37-39-757Z/webgpu-strategy-audit/strategy-audit.json`:
  active source has `0` WebGPU runtime matches, the active game renderer is
  still WebGL, the audit found `94` migration-blocker matches, and the retained
  E2 spike remains available. Recommendation: reinforce WebGL for the
  stabilization cycle and defer any WebGPU migration point of no return.
- Cycle 0 now has a static evidence bundle. `npm run check:projekt-143` runs
  the KB-CULL texture audit, KB-OPTIK imposter optics audit, KB-TERRAIN
  vegetation horizon audit, and KB-STRATEGIE WebGPU audit, then writes a suite
  summary. Latest local suite:
  `artifacts/perf/2026-05-02T22-05-00-955Z/projekt-143-evidence-suite/suite-summary.json`.
- Phase 2 / Cycle 1 now has a baseline certification bundle and an Asset
  Acceptance Standard. `npm run check:projekt-143-cycle1-bundle -- ...` wrote
  `artifacts/perf/2026-05-02T22-24-03-223Z/projekt-143-cycle1-benchmark-bundle/bundle-summary.json`
  for source HEAD `cef45fcc906ebe4357009109e2186c83c2a38426`; local retail and
  perf manifests report the same SHA. Bundle status is WARN: Open Frontier
  short and A Shau short passed measurement trust, startup and grenade artifacts
  are diagnostic by design, combat120 failed measurement trust, and the low-load
  grenade probe still reproduces the first-use stall. The standard lives in
  [ASSET_ACCEPTANCE_STANDARD.md](ASSET_ACCEPTANCE_STANDARD.md).
- Projekt Objekt-143 Cycle 1 certification docs/tooling landed at
  `806d5fa43d63854dd80496a67e8aaef4a741c627`. CI run `25263686228` passed and
  manual Deploy workflow run `25264091996` succeeded. At that release, live Pages
  `/asset-manifest.json` reported that SHA; `/`, `/sw.js`,
  `/asset-manifest.json`, representative public assets, Open Frontier
  navmesh/heightmap assets, the A Shau R2 DEM URL, and Recast WASM/build assets
  returned `200` with the expected cache/content headers. A live browser smoke
  reached the Zone Control deploy UI with no console, page, request, or retry
  failures. This verifies the Cycle 1 docs/tooling release, not any optimization
  remediation. Later doc-only release-state commits may advance `master`; live
  `/asset-manifest.json` remains the exact current deployed SHA source of truth.
- Agent-DX follow-up `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e` added the
  repo-native GitHub workflow dispatch wrapper plus stable mobile UI gate hooks.
  Manual CI run `25265347136` passed lint, build, test, perf, smoke, and mobile
  UI; Deploy run `25265623981` passed; live `/asset-manifest.json`, Pages
  headers, R2 A Shau DEM headers, service worker state, and a Zone Control
  browser smoke were verified. This is release workflow and mobile gate
  hardening, not a Projekt Objekt-143 optimization/remediation claim.
- Release-DX hardening `5f46713d101f6fea974da6d77f303c95df58000c` opted the
  deploy workflow into GitHub's Node 24 JavaScript action runtime. Manual CI
  run `25265757159`, Deploy run `25266081872`, live `/asset-manifest.json`,
  Pages/R2/build/WASM headers, service worker state, and a Zone Control browser
  smoke all passed.
- Phase 2 / Cycle 2 is now evidence-complete as visual/runtime proof work.
  Runtime screenshots
  were refreshed at
  `artifacts/perf/2026-05-03T01-00-12-099Z/projekt-143-cycle2-runtime-proof/summary.json`.
  The dedicated headed KB-CULL renderer/category proof passed at
  `artifacts/perf/2026-05-03T10-21-12-603Z/projekt-143-culling-proof/summary.json`
  with nonzero renderer stats (`133` draw calls, `4,887` triangles), CPU
  profile capture, browser long-task/LoAF capture, all required renderer
  categories visible, and trusted probe overhead. The original KB-OPTIK matched
  scale proof at
  `artifacts/perf/2026-05-03T10-39-21-420Z/projekt-143-optics-scale-proof/summary.json`
  showed close-GLB and imposter geometry both targeting `4.425m`, while
  rendered imposter silhouettes averaged only `0.53x` of close-GLB visible
  height and were darker by `26.59-59.06` luma. The first KB-OPTIK remediation
  commit `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9` dropped the shared target
  to `2.95m`, added generated upright per-tile crop maps, and refreshed the
  matched proof at
  `artifacts/perf/2026-05-03T16-13-34-596Z/projekt-143-optics-scale-proof/summary.json`.
  Visible-height ratios are now `0.861-0.895x`, inside the first-remediation
  `+/-15%` proof band. The selected-lighting luma slice commit
  `1395198da4db95611457ecde769b611e3d36354e` then refreshed the matched proof
  at
  `artifacts/perf/2026-05-03T16-48-28-452Z/projekt-143-optics-scale-proof/summary.json`;
  luma delta is now `-0.44%` to `0.36%` under that selected setup. `npm run
  check:projekt-143-cycle2-proof` was refreshed afterward and wrote
  `artifacts/perf/2026-05-03T16-48-58-020Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`
  with PASS status for evidence completeness. This is not final visual,
  expanded-lighting, gameplay-camera, performance, aircraft-scale,
  aircraft-feel, or production parity acceptance.
  The culling proof screenshot is not runtime scale evidence because its
  fixture rescales GLBs by longest bounding-box axis to fit one camera.
- Cycle 2 now also includes the user-approved aircraft GLB replacement as an
  evidence-gated asset/runtime import. The six runtime aircraft GLBs were
  imported from Pixel Forge through `npm run assets:import-pixel-forge-aircraft`
  with source `+X` forward normalized to TIJ public `+Z` forward by an explicit
  wrapper node. Runtime code now reads embedded GLB animation tracks for
  rotor/prop spin-axis hints and protects animated prop/rotor descendants from
  static draw-call batching by ancestor. Provenance sidecars are under
  `docs/asset-provenance/pixel-forge-aircraft-2026-05-02/`; local import and
  viewer evidence are
  `artifacts/perf/2026-05-03T01-55-00-000Z/pixel-forge-aircraft-import/summary.json`
  and
  `artifacts/perf/2026-05-03T01-58-00-000Z/pixel-forge-aircraft-viewer/summary.json`.
  `npm run probe:fixed-wing -- --boot-attempts=2` passed at
  `artifacts/fixed-wing-runtime-probe/summary.json`. Open Frontier short
  renderer evidence at `artifacts/perf/2026-05-03T03-07-26-873Z` and A Shau
  short evidence at `artifacts/perf/2026-05-03T03-11-40-162Z` both have trusted
  measurement paths and `0` browser errors after the wrapper-level
  deinterleaving fix for GLTFLoader interleaved attributes. Both captures are
  WARN on peak p99 and fail strict `perf:compare` thresholds against older
  baselines. Local `npm run validate:fast`, `npm run build`, and
  `npm run check:projekt-143` pass after the aircraft patch; the latest static
  evidence suite is
  `artifacts/perf/2026-05-03T11-18-46-108Z/projekt-143-evidence-suite/suite-summary.json`.
  Commit `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33` passed manual CI run
  `25274278013` and Deploy run `25274649157`. Live `/asset-manifest.json`
  reported that SHA; Pages shell, service worker, manifest, representative
  aircraft GLBs, Open Frontier navmesh/heightmap, hashed build assets, Recast
  WASM, and the A Shau R2 DEM URL returned `200`; live Zone Control browser
  smoke reached the deploy UI with no console, page, request, or retry-panel
  failures. This verifies production delivery, not aircraft-feel or
  perf-improvement certification.
- Failed KB-CULL diagnostic path retained for agent-DX: focused AI Sandbox
  captures at `artifacts/perf/2026-05-03T09-10-57-791Z` (`npcs=120`) and
  `artifacts/perf/2026-05-03T09-13-00-811Z` (`npcs=60`) exposed the close-NPC
  and NPC-imposter categories but failed validation and measurement trust. The
  60-NPC artifact recorded `npc_close_glb` at `39601` visible triangles and
  `npc_imposters` at `2` visible triangles, but probeAvg `96.62ms` and probeP95
  `211ms` make it diagnostic-only. Do not repeat that path for certification
  while `npm run check:projekt-143-culling-proof` exists.
- Projekt Objekt-143 Cycle 0 evidence payload landed at
  `475aa7792c51823184c454a0b63852e79da2285d`; manual Deploy workflow run
  `25262818886` served that payload SHA. Doc-only release-state commits may
  advance `master`; live `/asset-manifest.json` is the current deployed SHA
  source of truth.
- Historical note: the stable-ground audit opened while source was at
  `f99181a0bf8a6b2a8684fc1ae3796022c16aad22` and live Pages still served
  `5f585f7d4bf5ad2c0c85450235ac4c9950988d83`. Those audit-start values are now
  superseded by the refreshed `5fd4ba34e28c4840b0f72e1a0475881d050122a1`
  production parity check.
- Live Pages/R2 spot checks returned `200` for `/`, `/sw.js`,
  `/asset-manifest.json`, the A Shau DEM R2 URL, hashed JS/CSS assets, and the
  Recast WASM assets. A live browser smoke reached the Zone Control deploy UI
  with no console, page, request, or retry-panel failures.
- The root review payload was moved out of the repo after hash verification to
  `C:\Users\Mattm\X\games-3d\tij-local-review-artifacts\2026-05-02-stable-ground`.
  The tracked TIJ worktree was clean at the close of that stable-ground pass;
  the later Projekt Objekt-143 Cycle 0 evidence slice is now committed,
  pushed, deployed, and live-verified.
- Sibling `game-field-kits` is part of the current control plane. Its
  `master`/`origin/master` pointed at
  `a7b71f1e9af61e2f89bb0adefae5121891896f62`; `npm ci`,
  `npm run check`, and `npm run smoke:browser` passed on 2026-05-02.
- Stale open PRs `#47` and `#148` through `#153` were closed, and their head
  branches were deleted. Other unmerged task/spike branches remain retained
  inventory until reviewed for unique work.
- Local stabilization gates passed for `doctor`, `validate:fast`, `build`,
  `smoke:prod`, `check:mobile-ui`, `probe:fixed-wing`, and
  `evidence:atmosphere` on 2026-05-02. `validate:full` is PASS/WARN rather than
  clean: unit/build stages passed, but `perf:capture:combat120` failed the
  local frame-time validation with avg/p99 at 100.00ms and Combat over budget
  in every sample. Artifact:
  `artifacts/perf/2026-05-02T07-29-13-476Z/validation.json`.
- Detailed evidence for this pass lives in
  [STABILIZATION_AUDIT_2026-05.md](STABILIZATION_AUDIT_2026-05.md).

## Shipped Recovery Slice On 2026-05-02

The Cycle 0 evidence payload commit is
`475aa7792c51823184c454a0b63852e79da2285d`. Production Pages was verified
serving that payload after manual Deploy workflow run `25262818886`, then
doc-only release-state alignment followed on `master`. The Projekt Objekt-143
recovery work described below is shipped as a measurement and evidence slice,
not as a performance remediation. For the exact currently deployed SHA, check
live `/asset-manifest.json`.

Shipped scope for this development cycle:

- Establish trusted measurements before optimization: `perf-capture.ts` now
  writes measurement-trust evidence and post-sample scene attribution.
- Open KB-LOAD with startup/UI evidence rather than anecdotes: startup marks,
  browser-stall capture, CPU profiles, and WebGL texture-upload attribution now
  isolate the Open Frontier live-entry stall to first-present texture upload
  work.
- Open KB-CULL asset discipline with a mechanical Pixel Forge texture gate:
  `npm run check:pixel-forge-textures` inventories registered Pixel Forge
  atlases, estimates mipmapped RGBA residency, flags oversize/oversampled
  textures, and emits regeneration scenario estimates.
- Open KB-EFFECTS with a reproducible grenade spike probe: frag detonation
  user timings and `scripts/perf-grenade-spike.ts` now distinguish grenade JS
  cost from browser/render first-use stalls.
- Open KB-OPTIK with a static imposter optics audit: metadata, alpha occupancy,
  runtime scale, atlas luma/chroma, and shader-path notes now identify the
  first NPC scale/resolution and brightness-parity leads.
- Open KB-TERRAIN with a vegetation horizon audit: camera far planes, visual
  terrain extents, vegetation cell residency, shader max distances, and
  per-mode biome palettes now identify the large-mode barren-horizon lead.
- File KB-STRATEGIE with a WebGL/WebGPU decision basis: active renderer
  inventory, retained E2 rendering spike evidence, WebGPU migration blockers,
  capability unlocks, and migration cost estimate.
- Add a Cycle 0 evidence-suite command so the static bureau audits can be
  verified as one local gate before remediation work starts.
- Keep the recovery record current in `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PERFORMANCE.md`, and `progress.md`.

Shipped payload:

- Foundational telemetry/tooling: `scripts/perf-capture.ts`,
  `scripts/perf-browser-observers.js`, `scripts/perf-startup-ui.ts`.
- Runtime instrumentation only: `src/core/SystemInitializer.ts` stable startup
  labels and `src/core/LiveEntryActivator.ts` live-entry marks plus bounded
  frame-yield guard. These do not claim to fix startup; they expose where it
  stalls.
- Asset discipline tooling: new `scripts/pixel-forge-texture-audit.ts` and
  `package.json` script `check:pixel-forge-textures`.
- Combat-effect attribution tooling: `src/systems/weapons/GrenadeEffects.ts`
  diagnostic timings, new `scripts/perf-grenade-spike.ts`, and `package.json`
  script `perf:grenade-spike`.
- First KB-EFFECTS remediation: grenade explosions no longer create or pool
  dynamic `THREE.PointLight` instances. Explosion visuals are now unlit pooled
  sprites, point particles, and shockwave rings to avoid per-detonation scene
  light/program churn.
- Imposter optics tooling: new
  `scripts/pixel-forge-imposter-optics-audit.ts` and `package.json` script
  `check:pixel-forge-optics`.
- Terrain horizon tooling: new `scripts/vegetation-horizon-audit.ts` and
  `package.json` script `check:vegetation-horizon`.
- Strategy tooling: new `scripts/webgpu-strategy-audit.ts` and `package.json`
  script `check:webgpu-strategy`.
- Cycle 0 evidence-suite tooling: new `scripts/projekt-143-evidence-suite.ts`
  and `package.json` script `check:projekt-143`.
- Documentation/ledger updates: new `docs/PROJEKT_OBJEKT_143.md`, updates to
  `docs/PERFORMANCE.md`, `docs/STATE_OF_REPO.md`, and `progress.md`.

What is not ready to claim:

- No startup remediation has shipped. The current evidence identifies WebGL
  `texSubImage2D` texture upload and Pixel Forge atlases as the leading cause.
- No Pixel Forge texture candidate has visual sign-off. Candidate dimensions
  are planning estimates only until KB-OPTIK validates imposter darkness,
  silhouette readability, animation readability, and distant-canopy coverage.
- No combat120/stress-scene grenade closeout has shipped. The low-load
  first-use grenade spike is closed for the unlit pooled explosion path, but
  the 120-NPC AI Sandbox remains saturated before a grenade can be isolated.
- No NPC atlas regeneration, vegetation normal-map fix, or final NPC visual
  closeout has shipped. The first local KB-OPTIK remediation slice spans
  `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9`,
  `1395198da4db95611457ecde769b611e3d36354e`, and
  `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad`: it drops the shared NPC target
  to `2.95m`, adds generated per-tile crop maps, aligns selected-lighting
  luma, and forwards scene lighting/fog into the NPC imposter shader. The
  committed-sha expanded proof at
  `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`
  captures `40` samples across five lighting profiles and two camera profiles.
  Measurement trust is PASS, expanded luma is now `-11.31%` to `9.03%`
  against the `+/-12%` band, and `10/40` samples still flag on
  8.5m near-stress visible-height ratios. The committed-sha runtime LOD-edge
  proof at
  `artifacts/perf/2026-05-03T19-02-38-432Z/projekt-143-optik-expanded-proof/summary.json`
  is PASS with measurement trust PASS, `0/40` flags, visible-height ratio
  `0.855-0.895`, and luma `-6.94%` to `9.77%`. It is not yet live-deployed, it
  has no perf improvement claim, and final visual parity still requires
  documented near-stress exception or human review.
- No distant-canopy or barren-horizon fix has shipped. KB-TERRAIN now has
  static coverage evidence plus the fresh-build elevated runtime before
  baseline at
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`.
  It is ready for a far-horizon branch, but any outer-canopy layer still needs
  matched after screenshots and Open Frontier/A Shau perf deltas before it is
  accepted. The terrain branch now also carries an explicit owner visual target:
  keep texture variety but make most traversable ground read jungle green
  rather than gravel, check for possible inverted slope/biome material
  distribution if green appears mostly on hillsides, scale/ground tiny palms and
  ferns, add more big palms and ground vegetation, and make bamboo scattered
  dense clusters instead of the dominant forest layer.
- No WebGPU migration has shipped or been started. KB-STRATEGIE recommends
  staying on WebGL during stabilization, with a contained WebGPU/TSL spike only
  after the measured blockers are under control.
- Phase 3 now has a refreshed Cycle 3 kickoff/readiness matrix in
  `docs/PROJEKT_OBJEKT_143.md` and
  `artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Cycle 0 evidence, Cycle 1 baseline/policy work, and Cycle 2 proof surfaces
  are shipped. The kickoff marks KB-OPTIK NPC scale/crop/selected-lighting luma
  as inside matched proof bands after the first local remediation slice, but
  `needs_decision` because the 8.5m near-stress camera still flags even though
  runtime LOD-edge proof passes after expanded luma was brought into band.
  KB-LOAD texture upload/residency remains `ready_for_branch` for remaining
  uploads after the partial giantPalm warmup, KB-EFFECTS grenade first-use is
  `evidence_complete` for the trusted low-load probe, KB-TERRAIN is now
  `ready_for_branch` after the fresh-build elevated horizon baseline at
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`,
  and KB-CULL is now `ready_for_branch` after the clean owner-path baseline at
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`.
  It also
  carries Open Frontier and Zone Control startup paths plus Open Frontier,
  combat120, and A Shau perf summary paths for handoff. This is
  planning/agent-DX evidence; no atlas regeneration, gameplay-camera visual
  parity, startup-latency win, far-canopy, combat120 grenade closeout, texture
  residency closeout, culling, WebGPU, or
  production-parity remediation is accepted from it.
- KB-OPTIK now has an executable decision packet at
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`.
  It records the current NPC target as `2.95m`, imposter visible-height ratio
  average as `0.879`, imposter luma delta percent average as `-0.073`,
  near-stress expanded proof flagged samples as `10`, runtime LOD-edge proof
  flagged samples as `0`, aircraft longest-axis/current-NPC average as `4.52x`,
  and the recommended next branch as documenting the near-stress silhouette
  exception or switching to KB-LOAD/KB-TERRAIN/KB-CULL.
  It continues to reject aircraft resizing as the next response without a
  separate vehicle-scale proof.
- KB-CULL now has an executable first owner-path before packet. The selected
  path is `large-mode-world-static-and-visible-helicopters`, backed by trusted
  Open Frontier and A Shau scene attribution. Open Frontier owner draw-call-like
  is `388`; A Shau owner draw-call-like is `719`; visible unattributed
  triangles are `4.729%` and `5.943%`. This is branch-start evidence only:
  no culling/HLOD optimization has shipped, and close-NPC/weapon pool residency
  remains diagnostic-only until combat stress measurement trust passes. A
  static helicopter distance-cull prototype was rejected at
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json` because Open Frontier
  validation failed and the selected owner path did not improve.
- KB-LOAD has a first local runtime remediation, not a closeout. The current
  code warms only the giantPalm color/normal texture pair before renderer
  reveal through `AssetLoader.warmGpuTextures()`. Paired retail startup
  artifacts show WebGL upload totals improved in Open Frontier
  (`3341.0ms` to `1157.2ms`) and Zone Control (`3340.6ms` to `1229.6ms`), but
  deploy-click-to-playable did not improve (`4685.7ms` to `4749.0ms` in Open
  Frontier, `4909.0ms` to `4939.0ms` in Zone Control). The rejected fanPalm
  expansion artifacts are worse in both modes, so future startup warmup
  broadening needs paired evidence before landing.
- Commit `5b726746b0034d9327f5cb03ddcd3147294125ed` passed GitHub CI run
  `25277824856` after the Cycle 3 kickoff docs/tooling release. It was not
  deployed or live-verified; do not claim production parity for that commit.

## Starter-Kits Incubation Close-Out On 2026-04-28

- A sibling incubation repo now exists at
  `C:\Users\Mattm\X\games-3d\game-field-kits`. It is a private npm workspace
  for browser-game packages, kits, templates, examples, and recipes. It uses
  the agnostic `@game-field-kits/*` package scope while retaining TIJ only as
  provenance for the first extracted systems. Current local commits:
  `71e2da4 chore: bootstrap starter-kits incubation repo` and
  `a7b71f1 chore: rename incubation workspace to game field kits`.
- Wave 1 reusable packages are backported into TIJ through compatibility
  wrappers while preserving TIJ-facing APIs: `@game-field-kits/event-bus`,
  `@game-field-kits/frame-scheduler`,
  `@game-field-kits/three-effect-pool`, and
  `@game-field-kits/three-model-optimizer`. TIJ uses local `file:`
  dependencies plus `.npmrc` `install-links=true` so Three peer dependencies
  resolve through the game repo.
- Starter-kits validation passed: `npm ci`, `npm run check`, and
  `npm run smoke:browser`. The smoke gate starts seven visual workspaces and
  captures desktop/mobile Playwright screenshots while asserting no page
  errors, no console errors, nonblank canvas output, and in-viewport overlays.
- TIJ Wave 1 backport validation passed: `npm install`, `npm run typecheck`,
  targeted tests for `GameEventBus`, `SimulationScheduler`,
  `ModelDrawCallOptimizer`, and effect pools, plus `npm run validate:fast`
  with 247 files / 3839 tests passing. The stderr output included known
  existing test warnings from Pixel Forge pool-empty cases, jsdom canvas
  support, and defensive logging tests.
- Wave 2 remains incubating and is not backported: `terrain-height-core`,
  `asset-manifest-core`, and `animated-impostor-runtime`. Terrain now has
  TIJ-derived golden sampled-height tests in the starter-kits repo; runtime
  replacement in TIJ is blocked until those contracts stay green and the game
  has a reviewed integration plan.
- The previously untracked asset/review files in the TIJ root were relocated
  during the 2026-05-02 stable-ground cleanup and are no longer expected in
  the repo root. Their archive path and verification summary are recorded in
  [STABILIZATION_AUDIT_2026-05.md](STABILIZATION_AUDIT_2026-05.md).

## Dev Cycle Close-Out Snapshot On 2026-04-26

- Pixel Forge NPC/vegetation cutover is now the current production runtime
  truth at commit `c70d6d74f689b99ae97513e842b40248923c62c2`. Old NPC
  sprites, old NPC source-soldier PNGs, old root-level vegetation WebPs,
  blocked vegetation species, `dipterocarp`, and `rejected-do-not-import`
  paths are guarded by `npm run check:pixel-forge-cutover`.
- Current local gates are green after the latest hitbox/source-asset cleanup:
  `npm run check:pixel-forge-cutover`, `npm run validate:fast` (247 files /
  3834 tests), `npm run build`, `npm run build:perf`, and a post-build Pixel
  Forge cutover check. `public`, `dist`, and `dist-perf` were scanned after the
  rebuild and no `assets/source/soldiers` paths or old source-soldier filenames
  remain. The local gun range at
  `http://127.0.0.1:5173/?mode=gun-range&glb=1` rendered with `GLBs=4/4` and
  no browser console errors.
- Live verification on 2026-04-26: manual GitHub Actions Deploy run
  `24968673208` passed, `https://terror-in-the-jungle.pages.dev/asset-manifest.json`
  served git SHA `c70d6d74f689b99ae97513e842b40248923c62c2`, Pages/R2/Recast
  headers returned `200`, and a live sandbox smoke reached the gameplay HUD
  with no browser console errors or failed requests. The isolated
  `?mode=gun-range` route remains DEV-only and is not a production route.
- Current visual state: close NPCs are Pixel Forge GLBs with weapons inside
  64m, mid/far NPCs are Pixel Forge animated impostors, vegetation is still
  impostor-only, post-processing/pixelation is disabled, and approved
  vegetation uses Pixel Forge atlas metadata plus normal maps.
- Latest fixes added after playtest: NPC impostors now output straight alpha
  color instead of darkened premultiplied RGB, `giantPalm` is enlarged and
  locked to a stable atlas column, and `coconut` avoids its broken low-angle
  atlas row that showed two trunk locations.
- Return-to-polish queue: human playtest of the new hit-proxy shot feel and
  `?mode=gun-range`, tracer/muzzle feedback, close NPC camera occlusion and
  collision feel, faction readability against terrain, palm/tree close-range
  LOD quality, vegetation atlas snapping under flight, static building/prop
  culling evidence, and human playtest sign-off.

## Pixel Forge Asset Cutover Update On 2026-04-26

- NPC and vegetation runtime art is now Pixel Forge-only. Runtime source,
  tests, and shipped output are guarded by `npm run check:pixel-forge-cutover`,
  which fails on old faction sprite filenames, old NPC source-soldier PNG
  filenames/paths, old root-level vegetation WebP filenames, blocked vegetation
  species IDs, `dipterocarp`, and `rejected-do-not-import` paths.
- Approved runtime vegetation is limited to seven Pixel Forge impostor species:
  `bambooGrove`, `fern`, `bananaPlant`, `fanPalm`, `elephantEar`, `coconut`,
  and `giantPalm`. Blocked species remain out of production until regenerated
  or approved: `rubberTree`, `ricePaddyPlants`, `elephantGrass`, `areca`,
  `mangrove`, and `banyan`.
- Vegetation still uses the GPU billboard path, now with manifest-backed color
  and normal atlases, close alpha hardening, a brighter minimum lighting floor,
  shader-side wind, species grounding sinks for low-angle atlas padding, and
  per-species atlas guards for reviewed problem packages. `giantPalm` is scaled
  up and locked to a stable azimuth column; `coconut` is locked to a clean
  column and capped away from its bad low-elevation row. There is still no
  close 3D vegetation LOD in this pass.
- Close NPCs use Pixel Forge combined skinned GLBs with M16A1/AK-47 weapon
  attachments. The no-impostor near band is currently `64m`, selected close
  GLB capacity is `128`, and per-pool capacity is `40`; over-cap near actors
  are suppressed/logged instead of silently falling back to old sprites or near
  impostors.
- Mid/far NPCs use Pixel Forge animated impostor atlases. Runtime now applies
  the package forward-view offset for view-column selection, strips horizontal
  root motion from looped GLB clips, maps moving states away from
  `advance_fire`, and applies shader-side readability lighting to the impostor
  path.
- Player hit registration now raycasts LOD-independent Pixel Forge visual
  proxies from `CombatantBodyMetrics` instead of the old sprite-era fixed
  spheres. NPC shots against the player use the same taller character proxy.
  The live shot path uses the camera/crosshair ray for damage, keeps the
  projected weapon muzzle/barrel path for tracer visuals, and exposes
  `?diag=1&hitboxes=1` plus the isolated Pixel Forge GLB dev route
  `?mode=gun-range` for hitbox checks without loading combat120.
- The retro pixelation/post-processing path is disabled for this pass. WebGL
  antialiasing is enabled and the post-process/pixel-size hotkeys are no longer
  active runtime controls.
- Local validation on the current cutover state: targeted Pixel Forge combat,
  vegetation, billboard, renderer, hitbox, weapon, and gun-range suites passed;
  `npm run validate:fast` passed with 247 files / 3834 tests; `npm run build`
  and `npm run build:perf` passed with the existing large-chunk warning;
  `npm run check:pixel-forge-cutover` passed after both builds; and
  `npm run probe:pixel-forge-npcs` passed against
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` with
  `closeRadiusMeters=64`, armed close GLBs, and no actors inside 64m rendered
  as impostors.
- Not signed off: human playtest still needs to judge combat hitbox feel,
  vegetation transparency, wind/readability, high-speed vegetation atlas
  snapping, close GLB camera occlusion after the 1.5x NPC scale increase,
  faction marker style, and static building/prop culling/HLOD behavior under
  measured render budgets.

## Architecture Recovery Update On 2026-04-23/24

- Architecture recovery Cycles 0-12 are tracked in
  [ARCHITECTURE_RECOVERY.md](ARCHITECTURE_RECOVERY.md).
- Player vehicle-session transitions are now routed through
  `VehicleSessionController`. `VehicleStateManager` remains as a compatibility
  re-export, but the current session owner is the controller.
- Fixed-wing and helicopter models provide exit capability/placement facts via
  typed exit plans. The session controller owns the final player transition,
  derived `PlayerState` flags, and cleanup order.
- Touch action-bar EXIT wiring is covered at the UI orchestration layer and
  routes through the generic vehicle enter/exit callback.
- Keyboard `KeyE` and gamepad interact routing are covered at the `PlayerInput`
  callback layer and prefer the generic vehicle enter/exit callback.
- `HelicopterModel.exitHelicopter()` routes through the session-aware
  `requestVehicleExit()` path when available, leaving `HelicopterInteraction`
  as a legacy fallback instead of the primary active-player exit authority.
- The fixed-wing browser probe was updated so player/NPC handoff exits through
  the keyboard `KeyE` path instead of directly calling a private exit method.
  It now also validates in-flight emergency bailout through the real keyboard
  path for A-1, F-4, and AC-47.
- Vehicle-session validation completed:
  - targeted vehicle/session contract tests - PASS
  - targeted touch vehicle-exit callback tests - PASS
  - targeted keyboard/gamepad vehicle-exit callback tests - PASS
  - targeted helicopter model/session exit tests - PASS
  - `npm run validate:fast` - PASS
  - `npm run check:mobile-ui` - PASS
  - `npm run build` - PASS
  - `npm run probe:fixed-wing` - PASS, including takeoff, approach, in-flight
    bailout, and player/NPC handoff
- Cycle 3 scheduler recovery first pass is now in place:
  `SystemUpdateSchedule` declares the current `SystemUpdater` phases, budgets,
  cadence groups, and fallback-tracked system keys. `SystemUpdater` derives its
  `Other` fallback exclusions from that schedule instead of maintaining a
  second manual list.
- Cycle 3 implementation gate passed on 2026-04-23:
  `npm run typecheck`, `npm run lint`, `npm run test:quick`, and
  `npm run build`.
- Cycle 4 UI/input boundary first pass is now in place:
  `TouchControls` no longer has public enter/exit vehicle-mode mutators.
  Touch flight layout derives from `VehicleUIContext` supplied by the
  presentation controller, and actor mode alone no longer makes touch controls
  show flight vehicle UI. Cycle 4 automated gate passed: targeted UI/input
  suites, `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run check:hud`, `npm run check:mobile-ui`, and `npm run test:quick`.
- Cycle 5 combat ownership first pass is now in place:
  `CombatantSystem` owns the current combat spatial index dependency and
  injects it into `CombatantLODManager`. The LOD manager no longer imports the
  global spatial singleton directly, and coverage proves injected spatial sync
  plus `CombatantAI.updateAI()` use the supplied grid. Targeted combat suites
  and `npm run typecheck` passed.
- 2026-04-24 Cycle 5 combat actor-height follow-up is in place:
  NPC and player positions now share an eye-level actor-anchor contract.
  `NPC_Y_OFFSET` matches `PLAYER_EYE_HEIGHT` (`2.2m`), `PlayerRespawnManager`
  uses the same player eye height for spawn grounding, and
  `CombatantBodyMetrics` centralizes NPC muzzle, NPC center-mass, player
  center-mass, and LOS eye positions. Ballistics, terrain fire checks, LOS,
  cover threat rays, tracer/muzzle effects, death effects, and hit zones no
  longer stack independent vertical offsets on top of already raised actor
  positions. The older small-sprite visual follow-up has since been superseded
  by the 2026-04-26 Pixel Forge NPC renderer: close actors use skinned GLBs,
  mid/far actors use animated impostors, and both paths share a larger 1.5x
  readability scale. Hit registration now uses a single taller Pixel Forge
  character proxy for close GLB NPCs, impostor NPCs, and the player target, and
  first-person tracer visuals project from the weapon muzzle/barrel presentation
  point while damage stays on the camera/crosshair ray. This addresses the
  playtest symptom where NPC fire appeared above the player's head and the
  player felt short next to combatants, but human playtest still decides
  whether the current Pixel Forge scale, camera proximity, tracer visuals, and
  faction readability feel correct in motion.
- Cycle 6 terrain/collision first pass is now in place:
  helicopter squad deployment uses the runtime terrain query surface and
  collision-aware `getEffectiveHeightAt()` when available; `NavmeshSystem`
  receives `terrainSystem` from `SystemConnector` and samples navmesh
  heightfields plus connectivity representative heights through the terrain
  runtime instead of directly through `HeightQueryCache`. Targeted terrain,
  navigation, helicopter, and composer suites plus `npm run typecheck` passed.
  The Cycle 6 broad gate also passed: `npm run lint`, `npm run test:quick`,
  `npm run build`, and a clean rerun of `npm run probe:fixed-wing`.
- Cycle 7 harness first pass is now in place:
  `scripts/fixed-wing-runtime-probe.ts` writes `summary.json` incrementally
  after each scenario and records structured failure rows plus best-effort
  failure screenshots. `npm run typecheck` and `npm run lint` passed; the
  post-patch `npm run probe:fixed-wing` rerun passed and wrote
  `status: "passed"` to `artifacts/fixed-wing-runtime-probe/summary.json`.
  `npm run check:states` and `npm run check:hud` also passed after the harness
  change.
- Cycle 8 cleanup/guardrail first pass is now in place:
  Knip now has explicit entries/ignores for retained flight evidence probes,
  archived evidence scripts, and Cloudflare deploy tooling; source modules no
  longer export local-only helpers as public API; terrain/combat/UI/scripts
  subsystem guardrails now encode the ownership rules discovered in this run.
  `npm run typecheck`, `npm run deadcode`, `npm run lint`,
  `npm run test:quick`, and `npm run build` all passed.
- 2026-04-24 Cycle 9 atmosphere update: `npm run evidence:atmosphere`
  attempts all five modes from ground, sky-coverage, and aircraft views. Current
  evidence is under
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T13-08-25-253Z/`.
  A Shau, Open Frontier, TDM, Zone Control, and AI Sandbox/combat120 enter live
  mode with `0` browser errors, terrain resident at the camera, and non-zero
  sky-dome cloud coverage. Visible clouds now come from
  `HosekWilkieSkyBackend`; the old planar `CloudLayer` is hidden so it no
  longer owns the horizon. The cloud shader now uses a seamless cloud-deck
  projection instead of azimuth-wrapped UVs. A Shau, TDM, and Zone Control read
  as heavier broken cloud layers; Open Frontier and combat120 read as lighter
  scattered-cloud presets. Cloud art is still not human-signed off.
- 2026-04-24 A Shau evidence update: the DEM/asset-manifest blocker was fixed
  for local retail/perf previews by generating `asset-manifest.json` during
  `npm run build` and `npm run build:perf`. A Shau now enters live mode and
  records DEM-backed terrain heights in the atmosphere evidence. The latest run
  has `0` browser errors and A Shau water is correctly disabled
  (`enabled=false`, `waterVisible=false`, `cameraUnderwater=false`). The old
  TileCache fallback path has been removed; large worlds now use explicit
  static-tiled nav generation, and A Shau startup hard-fails if no generated or
  pre-baked navmesh exists. A Shau navigation is still not signed off because
  static-tiled route/NPC movement still need play-path validation. The latest
  artifact now records an A Shau nav gate: 6/6 representative bases snapped to
  navmesh, `connected=true`, and every representative pair returned a path. The
  run still reports a steep `tabat_airstrip` warning with `112.1m` vertical span
  across the `320m` runway footprint.
- 2026-04-24 all-mode regression note: the same evidence run produced `0`
  browser errors for Open Frontier, TDM, Zone Control, and combat120. A final
  pre-release rerun after the NPC locomotion and README pass kept all five
  modes at `0` browser errors, terrain ready at the camera, cloud legibility
  `pass`, `cameraBelowTerrain=false`, and
  `waterExposedByTerrainClip=false`. Keep non-A Shau warnings visible: A Shau
  still reports the steep `tabat_airstrip` warning, combat120 still reports AI
  and `Combat` budget warnings, and TacticalUI/World budget warnings remain in
  several modes.
- 2026-04-24 NPC movement follow-up: infantry movement now has a real
  `NPC_MAX_SPEED = 6m/s` ceiling instead of hidden 9-10m/s state speeds. Patrol,
  advancing, cover-seeking, combat approach/retreat/strafe, defend, and
  player-squad command movement were reduced accordingly. Distant-culled
  strategic simulation now uses smaller coarse steps, and high/medium LOD
  combatants clamp rendered Y close to their logical grounded position so
  nearby NPCs stop visually hovering during large terrain-height corrections.
  Targeted movement/render/navigation tests passed, and the final local gate
  after README/docs alignment passed `npm run validate:fast`, `npm run build`,
  `npm run smoke:prod`, and `npm run evidence:atmosphere`. Human playtest still
  needs to judge infantry pacing in live combat.
- Silent fallback risk is not fully removed; `PlayerMovement`,
  air-support mission positioning, terrain LOS wiring, and combat spatial
  singleton compatibility all still need an explicit fallback-retirement cycle.
  `ModeStartupPreparer` now hard-fails required A Shau terrain/nav evidence
  instead of masking it. Airfield terrain stamps share one datum, but
  spawn/taxi/runway helpers still do not share a single airfield surface
  runtime. Render/LOD/culling has only partial coverage through aircraft
  visibility and draw-call optimization; it still needs an airfield perf audit.
- Not yet signed off: human playtest for aircraft feel, emergency bailout UX,
  helicopter/fixed-wing enter/exit feel, pointer-lock fallback usability, and
  A Shau airfield taxi/takeoff usability. NPC/player visual scale and AI fire
  height are now code-corrected but still need human combat-feel confirmation.
  Per user direction on 2026-04-23, these feel gates are deferred until the end
  of all current recovery cycles.
- 2026-04-24 release validation did not treat the first `validate:full` run as
  a clean pass because `perf:capture:combat120` failed one heap recovery check.
  The unit/build portions passed, and a follow-up standalone
  `npm run perf:capture:combat120` plus
  `npm run perf:compare -- --scenario combat120` passed. Treat this as
  PASS/WARN, not an unresolved frame-time failure.
- 2026-04-23 in-app browser playtest added findings to
  [ARCHITECTURE_RECOVERY.md](ARCHITECTURE_RECOVERY.md):
  - fixed-wing emergency bailout previously exited successfully but dropped the
    player directly to terrain. Current fix now preserves airborne ejection
    height, and `npm run probe:fixed-wing` validates keyboard bailout for A-1,
    F-4, and AC-47;
  - W/throttle could leak into infantry movement after aircraft exit. Branch
    fix now clears transient input on vehicle session transitions and on
    pointer-lock loss/blur;
  - pointer lock fails in the Codex in-app browser. Current fix now shares the
    same lock target for gameplay/free-fly and activates an unlocked mouse-look
    fallback on `pointerlockerror`;
  - helicopter rotors kept idling after exit because engine RPM floored at
    idle. Cycle 2 patch now gives helicopter physics an explicit
    engine active/stopped lifecycle, lets exited helicopters spool down to
    `engineRPM = 0`, and raises flight-RPM visual rotor speed;
  - airfield stands, taxi routes, and runway helpers exposed a terrain datum
    split. Cycle 2/6 bridge patch now gives generated airfield
    terrain stamps one runway-derived `fixedTargetHeight`, so runway, apron,
    taxiway, filler, and envelope stamps do not resolve separate local heights
    on sloped sites;
  - the fixed-wing browser probe then exposed an AC-47 orbit-hold overbank
    failure. Branch-local fix corrects the orbit roll-error sign in
    `FixedWingControlLaw`; the probe now passes AC-47 orbit hold again;
  - A Shau fog/cloud readability and airfield render cost need targeted
    captures before tuning or asset replacement. Cycle 9 now has all-mode
    atmosphere coverage, A Shau DEM evidence is valid in local perf preview,
  and Cycle 10 has removed the old TileCache fallback path in favor of explicit
  static-tiled generation plus startup failure when no navmesh exists. The
  previous disconnected-home-base warning no longer recurs after the A Shau
  terrain-flow shoulder patch. Current blockers are route/NPC movement quality
  beyond representative-base connectivity, terrain/camera clipping reproduction,
  separate water rendering/hydrology quality, and the steep `tabat_airstrip`
  surface warning.

## Verified locally on 2026-04-21

- `npm run validate:fast` — PASS
- `npm run validate` — PASS
- `npm run build` — PASS
  - current build emits content-hashed Vite output under `/build-assets/`
  - build output no longer emits `.gz` or `.br` sidecar files; Cloudflare
    handles visitor-facing compression for Pages assets
- `npm run smoke:prod` — PASS
- `npm run check:mobile-ui` — PASS
- `npm run check:states` — PASS
- `npm run check:hud` — PASS
- `npm run check:assets` — WARN
  - route is now correct; remaining warnings are duplicate Vite/Recast
    dev-mode requests, not missing `/terror-in-the-jungle/` assets
  - rerun after the cache split still reports no missing GLBs or public assets
- `npm run probe:fixed-wing` — PASS
  - A-1, F-4, and AC-47 all enter, accelerate, rotate, climb to target AGL,
    and can be positioned onto short-final approach
  - AC-47 also reaches its orbit-hold engagement altitude and sustains
    `orbit_hold` in the browser probe
  - player/NPC fixed-wing handoff is covered for all three aircraft: an attached
    NPC mission stays cold while the player owns the aircraft, then resumes
    after player exit
- Helicopter and fixed-wing entry reset shared flight mouse state to
  direct-control mode, preventing stale free-look state from carrying between
  vehicle adapters.
- Fixed-wing feel has its first Cycle 2 fix in place, but it is not human-signed
  off yet. Manual feedback reported stiff aircraft response, altitude
  bounce/porpoise after climb, and visible screen shake at speed. Code
  inspection found fixed-wing was rendering/querying raw airframe steps while
  helicopter physics exposed interpolated state. Airframe now exposes an
  interpolated pose, FixedWingModel renders/queries that visual pose, and
  PlayerCamera smooths fixed-wing follow, look target, and FOV by elapsed time.
  `npm run probe:fixed-wing` passes after the patch; the playtest checklist is
  still required before calling aircraft feel done.
- `npm run perf:compare` — PASS, 8/8 checks against refreshed baselines
- Targeted Cycle 2 soak/lifecycle tests — PASS
  - `npx vitest run src/systems/world/GameModeManager.test.ts src/systems/world/TicketSystem.test.ts scripts/perf-harness/perf-active-driver.test.js`
- Targeted terrain-contact regression tests — PASS on 2026-04-22
  - `npx vitest run src/systems/combat/CombatantMovement.test.ts src/systems/combat/CombatantLODManager.test.ts src/systems/combat/CombatantRenderInterpolator.test.ts src/systems/vehicle/airframe/terrainProbe.test.ts src/systems/vehicle/__tests__/fixedWing.integration.test.ts src/systems/vehicle/FixedWingModel.test.ts src/systems/airsupport/NPCFlightController.test.ts`
- Cycle 2 terrain-contact delta validation — PASS on 2026-04-22
  - `npm run validate:fast`
  - `npm run build`
  - `npm run probe:fixed-wing` (A-1, F-4, and AC-47 all passed takeoff,
    climb, approach, and handoff; AC-47 orbit hold also passed)
- Branch-local Cycle 2/6 airfield datum validation — PASS on 2026-04-23
  - targeted terrain and vehicle suites passed after adding shared airfield
    terrain-stamp datum coverage
  - `npm run lint` — PASS
  - `npm run typecheck` — PASS
- Cycle 2 closeout validation — PASS on 2026-04-23
  - targeted fixed-wing control/model tests passed after the AC-47 orbit
    sign fix
  - `npm run test:quick` — PASS (`242` files, `3769` tests)
  - `npm run build` — PASS
  - `npm run probe:fixed-wing` — PASS for A-1, F-4, and AC-47, including
    AC-47 orbit hold, approach setup, emergency bailout, and handoff
- Cycle 9/10 atmosphere, water, and A Shau fallback validation —
  PASS/WARN on 2026-04-24
  - `npm run typecheck` — PASS after the capture harness and atmosphere patch
  - `npx vitest run src/systems/environment/AtmosphereSystem.test.ts src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts src/systems/environment/WaterSystem.test.ts src/systems/navigation/NavmeshSystem.test.ts src/core/ModeStartupPreparer.test.ts` — PASS after sky-dome cloud coverage, disabled-water state, and explicit static-tiled nav changes
  - `npm run evidence:atmosphere` — PASS and rebuilt the perf
    bundle; current artifact is
    `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T13-08-25-253Z/`
  - WARN: all five modes produced ground, sky, and aircraft screenshots with
    `0` browser errors and terrain resident at the camera. All captured views
    report `cameraBelowTerrain=false` and `waterExposedByTerrainClip=false`.
    A Shau water is disabled and no longer reports underwater state. A Shau nav
    representatives now pass snap/connectivity/path checks, but `tabat_airstrip`
    remains steep and route/NPC movement still needs play-path validation. Open
    Frontier and combat120 now show lighter scattered-cloud forms, but cloud
    art is not final without human review. ReadPixels GPU-stall warnings, Open Frontier
    `airfield_main`, combat120, and UI/system budget warnings remain part of the
    release evidence.
  - `npm run lint` — PASS after the evidence/docs alignment
  - `npm run test:quick` — PASS (`243` files, `3787` tests)
  - `npm run build` — PASS, with the existing large-chunk Vite warning
- 2026-04-24 final local validation for the recovery commit — PASS/WARN
  - `npm run validate:fast` — PASS (`243` files, `3789` tests)
  - `npm run build` — PASS, with the existing large-chunk Vite warning
  - `npm run smoke:prod` — PASS at a local production server
  - `npm run evidence:atmosphere` — PASS/WARN; all five modes reported
    `0` browser errors, cloud follow `true`, nav ready/connected `true`,
    cloud legibility `pass`, terrain ready at camera `true`,
    `cameraBelowTerrain=false`, and `waterExposedByTerrainClip=false`;
    artifact:
    `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T13-08-25-253Z/summary.json`
  - `npm run probe:fixed-wing` — PASS for A-1, F-4, and AC-47, including
    takeoff, climb, approach, in-flight bailout, and player/NPC handoff
  - `npm run check:states` — PASS; artifact
    `artifacts/states/state-coverage-2026-04-24T05-40-49-159Z.json`
  - `npm run check:hud` — PASS; artifact
    `artifacts/hud/hud-layout-report.json`
  - `npm run check:mobile-ui` — PASS; artifact
    `artifacts/mobile-ui/2026-04-24T05-43-18-934Z/mobile-ui-check`
  - `npm run validate:full` — PASS/WARN: unit/build stages passed, first
    combat120 capture failed one heap-recovery gate, standalone
    `npm run perf:capture:combat120` then passed with warnings, and
    `npm run perf:compare -- --scenario combat120` passed 8/8 checks
  - `npm run doctor`, `npm run deadcode`, and `git diff --check` — PASS
- Cycle 5 combat actor-height and billboard-scale validation — PASS on 2026-04-24
  - `npx vitest run src/systems/combat/CombatantMeshFactory.test.ts src/systems/combat/CombatantRenderer.test.ts src/systems/combat/CombatantBallistics.test.ts src/systems/combat/CombatantCombatEffects.test.ts src/systems/combat/CombatantHitDetection.test.ts src/systems/combat/ai/AILineOfSight.test.ts src/systems/combat/CombatantMovement.test.ts src/systems/helicopter/SquadDeployFromHelicopter.test.ts src/systems/player/PlayerRespawnManager.test.ts`
    — PASS, 190 tests after the billboard visual-scale patch
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
- `npm run doctor` — PASS
  - current shell: Node 24.14.1
  - repo target: `.nvmrc` says Node 24
- `npm run deadcode` — PASS
  - file-level removals, export hygiene, and retained historical script ignores
    are documented in `docs/rearch/deadcode-triage-2026-04-21.md`
- `npm audit --audit-level=moderate` — PASS
  - `npm audit fix` updated the ESLint tooling path for the `brace-expansion`
    advisory

## What Is Real Today

- The repo is healthy enough to build, smoke-test, run the mobile UI gate, and
  compare perf against refreshed baselines.
- The project is a playable combined-arms browser game, not just an engine
  shell.
- Helicopters and fixed-wing aircraft are both live in runtime.
- Atmosphere v1 is live: analytic sky, sky-tinted fog, day/night presets, ACES
  tone mapping before quantize, vegetation lighting parity, and procedural
  cloud coverage.
- The legacy static skybox path is gone: no `Skybox.ts`, no `NullSkyBackend`,
  and no `public/assets/skybox.png`.
- A Shau Valley is truthfully a 3,000-unit strategic simulation with selective
  materialization, not 3,000 simultaneous live combatants.
- Performance governance is useful again after the 2026-04-20 baseline refresh,
  and the runtime/toolchain target is now aligned on Node 24.

## Current Drift

- Toolchain truth is aligned on Node 24. CI reads `.nvmrc`, and the refreshed
  2026-04-20 perf baseline memo was captured on Node 24.14.1.
- Local diagnostic scripts now route through the current Vite root path instead
  of the stale `/terror-in-the-jungle/?perf=1` local route.
- The fixed-wing browser probe is restored as `npm run probe:fixed-wing`; keep
  it maintained when `FixedWingModel` or airfield staging APIs change. It now
  validates takeoff, climb, AC-47 orbit hold, player/NPC handoff, and
  short-final approach setup.
- `npm run deadcode` is clean after removing unused files, accidental value
  exports, and unused type-only public surfaces.
- Deploy freshness is now part of the stabilization control plane:
  content-hashed Vite output builds into `/build-assets/`, stable public assets
  and GLBs revalidate through Cloudflare, and the service worker cache is bumped
  to `titj-v2-2026-04-21` so old `titj-v1` Cache Storage entries are dropped.
- Vite no longer runs `vite-plugin-compression`; `dist/` contains canonical
  assets only, while Cloudflare handles gzip/Brotli/Zstandard delivery according
  to visitor `Accept-Encoding` and zone rules.
- A Shau production runtime data now has the first R2 manifest path:
  `titj-game-assets-prod` contains content-addressed DEM/rivers objects,
  public `r2.dev` access is enabled for temporary validation, and
  `scripts/cloudflare-assets.ts` uploads, writes `dist/asset-manifest.json`,
  uploads manifest copies to R2, and validates size/content-type/cache/CORS.
  The custom R2 domain is still open. The 2026-04-24 release was manually
  deployed and live-verified: `/asset-manifest.json` served the release git
  SHA and R2 DEM URL, Pages cache headers matched the deploy contract, and a
  live Zone Control smoke reached the deployment UI without browser/request
  errors. This proves delivery freshness, not A Shau route-play quality.
- Navmesh deployment is split by mode. Open Frontier, Zone Control, and TDM use
  tracked seed-keyed prebaked navmesh/heightmap files under
  `public/data/navmesh/` and `public/data/heightmaps/`, served by Cloudflare
  Pages with immutable cache headers. A Shau currently has no prebaked navmesh
  asset; it loads the DEM via `asset-manifest.json`/R2 and generates explicit
  static-tiled navmesh at startup, hard-failing if generation is unavailable.
  The delivery path is verified, but route-follow movement quality is not.
- Cycle 2 terrain-contact work is active: nearby NPC hillside phasing/floating
  was traced to render Y smoothing treating >1m high-LOD terrain corrections as
  distant snaps, while low-cost/distant NPC paths could preserve stale altitude.
  Fixed-wing and air-support aircraft also used flat terrain probes for each
  airframe step. The code now has targeted fixes and tests, but needs human
  hillside/takeoff playtest before it is called signed off.
- Airfield terrain stamps now share one generated datum when
  compiled with the runtime height provider. This is a terrain-shaping fix, not
  a full terrain/collision runtime unification. `WorldFeatureSystem` and
  `FixedWingModel` still independently consume terrain for spawn/lineup, so
  Cycle 6 remains the owner for a proper terrain/collision/staging service.
- Atmosphere v1 is functional but not playtest-signed for readability. Visible
  clouds now come from a sky-dome pass in `HosekWilkieSkyBackend`; the old flat
  `CloudLayer` plane is hidden so it cannot create the hard divider or "one
  tile" horizon artifact. The sky shader now uses a seamless cloud-deck
  projection instead of azimuth-wrapped UVs. The 2026-04-24 capture proves sky
  coverage is wired and measurable in all five modes; Open Frontier and
  combat120 read as lighter scattered-cloud presets, not final cloud art. A
  Shau terrain evidence is DEM-backed,
  water is disabled without underwater fog, and no navmesh means startup stops
  instead of silently continuing. Terrain clipping and water rendering are not
  the same root cause: clipping can expose the global water plane, while water
  quality/hydrology remains a separate render backlog item. The atmosphere
  evidence harness now records `clipDiagnostics` for raw/effective terrain
  clearance, water-level clearance, and `waterExposedByTerrainClip`. A Shau
  navigation still needs Cycle 10 route and NPC movement validation against the
  explicit static-tiled nav path.
- Pointer-lock behavior is not yet a reliable in-app browser validation path.
  A proper FPS playtest should use a normal browser until the game exposes a
  drag-look/dev fallback and reports `pointerlockerror` instead of silently
  swallowing lock rejection.
- NPC/player combat verticality and billboard container scale now have one code
  contract, but not a human combat-feel sign-off. If playtest still reports
  oversized NPCs, head-high tracers, or shots passing above the player, inspect
  sprite alpha padding, weapon animation/tracer visuals, and live combat
  telemetry before changing `NPC_Y_OFFSET` or adding local ballistics offsets.
- `npm run perf:capture:frontier30m` now uses perf-only Open Frontier lifecycle
  overrides (`perfMatchDuration=3600`, `perfDisableVictory=1`) so the script is
  a non-terminal 30-minute soak again. The tracked 2026-04-20 baseline still
  predates this fix and must be refreshed on a quiet machine.
- Historical docs and archived briefs still describe the pre-cutover skybox and
  stale perf baseline state. Current docs should point at the stabilization
  cycle before new feature work.
- Locked nested agent worktrees have been removed. The 24 local `task/*`
  branches that mapped to merged GitHub PRs were deleted locally.

## Immediate Priorities

1. Run Cycle 10 fallback retirement: classify silent fallbacks as delete,
   explicit failure, dev-only recovery, or named compatibility shim. Continue
   A Shau rather than skipping it: required terrain/nav failures now stop
   startup, and representative-base connectivity has an artifact gate, but
   route/NPC movement quality is not signed off.
2. Use the latest Cycle 9 atmosphere/cloud evidence as the current visual
   baseline, but do not call clouds fixed until human playtest reviews the
   sky-dome clouds in all modes, especially Open Frontier/combat120 haze and
   the absence of horizon divider artifacts.
3. Run Cycle 11 airfield surface authority: stands, taxi routes, runway starts,
   terrain stamps, collision, and validation need one airfield surface truth.
4. Run Cycle 12 render/LOD/culling/water perf: airfield draw calls, triangles,
   collision registrations, LOS obstacles, water/hydrology visuals, object
   pop-in, and aircraft/building visibility before asset replacement.
5. Continue the Cycle 7 probe API audit: decide what broad `window.__engine`
   access remains acceptable and which probe paths should become narrow named
   diagnostic helpers.
6. Keep the full human playtest deferred until the current recovery run is
   complete. The final playtest must still cover grounded exits, in-flight
   bailout, helicopter entry/exit and rotor feel, AC-47 orbit, A Shau
   forward-strip taxi/takeoff, pointer-lock fallback, and keyboard/touch paths.
7. Re-run combat120 `validate:full` from a quiet-machine session before
   claiming perf sign-off or refreshing baselines. The 2026-05-02 stabilization
   run passed unit/build stages but failed local combat120 frame-time gates with
   avg/p99 pinned at 100.00ms, so the current evidence is a blocker candidate,
   not baseline-quality data.
8. Keep the manual deploy/header spot-check in `docs/DEPLOY_WORKFLOW.md` as a
   release gate. The 2026-04-24 release bridged local-vs-prod evidence; repeat
   the check after every push intended for player testing, then replace the
   temporary `r2.dev` endpoint with a custom R2 asset domain.
9. Treat local perf-preview screenshots as non-deployed truth until the live
   Pages URL serves the same `asset-manifest.json`, R2 DEM, service worker,
   WASM, and content-hashed build assets.

