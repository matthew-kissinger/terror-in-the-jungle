# Projekt Objekt-143 Handoff

Last updated: 2026-05-04

Use this as the first-read handoff for a fresh agent session continuing
Projekt Objekt-143. `docs/PROJEKT_OBJEKT_143.md` remains the authoritative
ledger; this file is the short operational prompt.

## Current Local State

- Repo: `C:\Users\Mattm\X\games-3d\terror-in-the-jungle`
- Branch: `master`
- Local branch is intentionally ahead of `origin/master`; do not push/deploy
  unless the owner explicitly asks for that release step.
- No production parity is claimed for the latest local work. Live production
  truth still comes from `/asset-manifest.json` and live Pages/R2/WASM/service
  worker checks.
- Keep WebGL stabilization as the active strategy. Do not start WebGPU
  migration unless the project owner explicitly approves that point of no
  return after evidence.
- Fixed-wing browser validation is incomplete for the latest local terrain
  placement move. `npm run probe:fixed-wing` hit sandbox `spawn EPERM`; the
  approved rerun built the perf bundle and wrote partial A-1 success to
  `artifacts/fixed-wing-runtime-probe/summary.json`, then timed out before
  completing F-4/AC-47. Do not claim a full fixed-wing probe pass from this
  handoff.

## Latest Evidence Anchors

- Cycle 3 kickoff/readiness:
  `artifacts/perf/2026-05-04T13-11-32-562Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
- Static Projekt suite:
  `artifacts/perf/2026-05-04T13-11-45-723Z/projekt-143-evidence-suite/suite-summary.json`
- KB-OPTIK decision packet:
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`
- KB-TERRAIN before baseline:
  `artifacts/perf/2026-05-04T11-26-11-588Z/projekt-143-terrain-horizon-baseline/summary.json`
- KB-TERRAIN material distribution audit:
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
- KB-TERRAIN placement/foundation audit:
  `artifacts/perf/2026-05-04T12-59-25-892Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
- KB-TERRAIN terrain asset inventory:
  `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
- KB-TERRAIN route/trail policy audit:
  `artifacts/perf/2026-05-04T12-58-03-421Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
- KB-TERRAIN Open Frontier after vegetation pass:
  `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json`
- KB-TERRAIN A Shau after placement pass:
  `artifacts/perf/2026-05-04T04-14-35-401Z/summary.json`
- KB-TERRAIN A Shau after route-stamping pass:
  `artifacts/perf/2026-05-04T13-03-02-238Z/summary.json`
  (measurement trust PASS; validation FAIL on heap end-growth/recovery)
- Active-player hit-contract evidence after shorter-NPC aim investigation:
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json`
  (`120` shots / `43` hits; frame-time metrics are not clean acceptance
  because another browser game was running on and off during the capture)
- KB-CULL owner baseline:
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
- Rejected KB-CULL static-helicopter candidate:
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json`
- KB-EFFECTS trusted low-load closeout:
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`

## Current Bureau State

- KB-LOAD `pixel-forge-texture-upload-residency`: `ready_for_branch`.
  GiantPalm warmup reduced WebGL upload totals but did not improve startup
  latency. Do not broaden warmup from the rejected fanPalm evidence without a
  paired proof.
- KB-TERRAIN `large-mode-vegetation-horizon`: `ready_for_branch`.
  The first far-horizon branch must use the terrain baseline before/after
  screenshot path and matched Open Frontier/A Shau perf captures.
  The goal now also includes ground and vegetation art-direction correction:
  most traversable ground should read jungle green rather than gravel while
  preserving texture variety; verify whether slope/biome material distribution
  is inverted if green is mostly on hillsides; scale and ground tiny palms and
  ferns; increase big palms and ground vegetation; and make bamboo scattered
  dense clusters rather than the dominant forest layer. The first
  material-distribution pass removes broad highland/cleared/bamboo elevation
  caps as primary terrain rules and keeps rock available as a slope-gated
  accent; the follow-up vegetation pass enlarges/lifts ferns, increases large
  palm density, and changes bamboo into clustered pockets. The current local
  branch adds a second bamboo fix because the first pass still looked
  scattered: clustered mid-level vegetation now uses its own Poisson grid so
  bamboo can form denser grove pockets instead of being thinned by palm
  spacing. It also adds a terrain placement/foundation audit and moves the
  first Open Frontier/A Shau airfield/support presets onto flatter terrain.
  The latest A Shau after-placement capture no longer logs the Ta Bat steep
  airfield warning, and A Shau now has full stamped `jungle_trail`
  terrain-flow corridors instead of map-only route overlays. The route audit
  passes with `12` A Shau routes, `52,504m` of route length, `1,321` route
  capsule stamps, and `14` surface patches. The paired A Shau capture records
  `170` shots, `59` hits, and `57` movement transitions with measurement trust
  PASS, but validation fails on heap growth/recovery and terrain-stall warnings
  still appear, so A Shau is still not accepted. Later terrain/world-placement
  work must continue fixing hanging building foundations and review airfield,
  HQ, vehicle, firebase, and support-compound presets before considering Pixel
  Forge building replacements. Also inventory existing TIJ and Pixel Forge
  ground, path, trail, grass, foliage, and cover texture/assets before custom
  work; routes should become worn-in, smoothed, vehicle-usable trails where
  that fits future gameplay. The first low-resource inventory now exists at
  `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`;
  it is shortlist evidence only and does not accept any asset for runtime use.
- Active-player perf harness: shorter Pixel Forge NPCs require the killbot to
  aim at the visual chest proxy below the eye-level actor anchor. The local
  TypeScript bot and CJS perf driver have unit coverage for that contract, and
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json` records `120` player
  shots and `43` hits. Use that artifact to close the zero-hit target-height
  question only. The owner reported another browser game was running on and
  off during the capture, so its frame-time/heap numbers are potentially
  skewed and cannot be used as perf acceptance or baseline refresh.
- KB-CULL `static-feature-and-vehicle-culling-hlod`: `ready_for_branch`.
  The selected owner path is
  `large-mode-world-static-and-visible-helicopters`. Close-NPC/weapon pool
  residency remains diagnostic-only until combat stress measurement trust
  passes.
  A static helicopter distance-cull prototype was rejected because the trusted
  Open Frontier after capture failed validation and owner draw-call-like stayed
  `388`; do not repeat it as a claimed fix without new evidence.
- KB-EFFECTS `grenade-first-use-stall`: `evidence_complete` for the low-load
  unlit pooled explosion path. Do not infer combat120/stress closeout or
  future visual-polish safety from the low-load probe.
- KB-OPTIK `npc-imposter-scale-luma-contract`: `needs_decision`.
  Runtime LOD-edge proof passes; the remaining issue is the 8.5m near-stress
  silhouette exception/human-review decision. Do not resize aircraft as the
  first response without a separate vehicle-scale proof.

## Suggested Fresh Agent Prompt

```text
You are taking over Projekt Objekt-143 for Terror in the Jungle.

Repo: C:\Users\Mattm\X\games-3d\terror-in-the-jungle
Branch: master
Strategy: stabilize WebGL first. Do not start WebGPU migration unless the
project owner explicitly approves that point of no return.

Read first:
- AGENTS.md
- docs/PROJEKT_OBJEKT_143.md
- docs/PROJEKT_OBJEKT_143_HANDOFF.md
- docs/STATE_OF_REPO.md
- docs/PERFORMANCE.md
- docs/ASSET_ACCEPTANCE_STANDARD.md
- progress.md tail

Initial commands:
1. git status --short --branch
2. npm run doctor
3. npm run check:projekt-143-cycle3-kickoff
4. npm run check:projekt-143

Current evidence anchors:
- Cycle 3 kickoff:
  artifacts/perf/2026-05-04T13-11-32-562Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json
- KB-TERRAIN before baseline:
  artifacts/perf/2026-05-04T12-59-44-452Z/projekt-143-terrain-horizon-baseline/summary.json
- KB-TERRAIN material distribution:
  artifacts/perf/2026-05-04T12-59-32-610Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json
- KB-TERRAIN placement/foundation audit:
  artifacts/perf/2026-05-04T12-59-25-892Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json
- KB-TERRAIN terrain asset inventory:
  artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json
- KB-TERRAIN route/trail policy audit:
  artifacts/perf/2026-05-04T12-58-03-421Z/projekt-143-terrain-route-audit/terrain-route-audit.json
- KB-TERRAIN Open Frontier after vegetation pass:
  artifacts/perf/2026-05-04T02-45-03-756Z/summary.json
- KB-TERRAIN A Shau after placement pass:
  artifacts/perf/2026-05-04T04-14-35-401Z/summary.json
- KB-TERRAIN A Shau after route-stamping pass:
  artifacts/perf/2026-05-04T13-03-02-238Z/summary.json
- Active-player hit-contract evidence:
  artifacts/perf/2026-05-04T11-35-07-274Z/summary.json
- KB-CULL owner baseline:
  artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json
- KB-EFFECTS low-load closeout:
  artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json
- KB-OPTIK decision packet:
  artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json

Current bureau state:
- KB-LOAD: ready_for_branch, but no startup-latency win yet.
- KB-TERRAIN: ready_for_branch, before baseline exists; no far-canopy fix yet.
  Include the owner visual target: majority green/jungle floor, possible
  inverted material distribution, bigger/grounded palms and ferns, more big
  palms and ground cover, bamboo as scattered dense clusters, terrain-shaped
  building/HQ/airfield/vehicle foundations with no hill-edge overhangs, and a
  performance-aware Pixel Forge building shortlist before replacement. Include
  an asset audit for ground/path/grass/foliage/cover variety and future
  vehicle-usable trail surfaces. Current local terrain work has Open Frontier
  WARN/trusted evidence, clustered-bamboo static distribution evidence, a
  passing placement/foundation audit, a static terrain asset inventory, and a
  passing route/trail policy audit. A Shau now stamps full `jungle_trail`
  corridors instead of map-only route overlays, but the after-route capture
  fails heap validation and still shows terrain-stall warnings; do not claim
  A Shau acceptance. The
  active-player killbot has a shorter-NPC visual-chest aim fix in unit tests
  and a fresh Open Frontier capture with `120` shots / `43` hits. Do not trust
  that capture for frame-time acceptance because another browser game was
  running on and off during it.
- KB-CULL: ready_for_branch, selected owner path is large-mode world static
  features plus visible helicopters; close-NPC/weapon residency remains
  diagnostic-only. Rejected static-helicopter distance-cull after artifact:
  artifacts/perf/2026-05-04T00-55-00-501Z/summary.json.
- KB-EFFECTS: evidence_complete only for low-load grenade first-use stall.
- KB-OPTIK: needs_decision for near-stress silhouette exception/human review.

Goal: continue toward completing Projekt Objekt-143 without making unsupported
claims. Pick the next remediation only after refreshing the kickoff matrix and
checking that the selected bureau has before evidence. Prefer a narrow,
bisectable branch:
- KB-CULL first path: large-mode world_static_features + visible helicopters,
  using the owner baseline guardrails.
- KB-TERRAIN first path: far-horizon representation/distance policy, using the
  elevated screenshot baseline and Open Frontier/A Shau perf guardrails.
- KB-LOAD first path: texture/upload residency with paired Open Frontier and
  Zone Control startup artifacts; do not revive the rejected fanPalm warmup
  without new paired evidence.

Hard constraints:
- KB-METRIK first: measurement trust gates every claim.
- Do not certify culling from static inventory or proof screenshots alone.
- Do not accept imposter fixes without matched GLB/imposter visual evidence.
- Do not reopen low-load KB-EFFECTS unless visuals change; stress/combat120
  grenade claims need fresh trusted stress evidence.
- No production parity claim without push/deploy/live Pages verification.

After each pass, update docs/progress, run the relevant Projekt checks plus
validate:fast, commit locally, and leave the repo clean.
```
