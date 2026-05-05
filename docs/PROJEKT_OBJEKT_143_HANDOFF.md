# Projekt Objekt-143 Handoff

Last updated: 2026-05-05

Use this as the first-read handoff for a fresh agent session continuing
Projekt Objekt-143. `docs/PROJEKT_OBJEKT_143.md` remains the authoritative
ledger; this file is the short operational prompt.

## Current Local State

- Repo: `C:\Users\Mattm\X\games-3d\terror-in-the-jungle`
- Branch: `master`
- Verified pushed state before this handoff report:
  `origin/master` at `356bc2e418af2f2f9aa8109dcf29a5ad7e291924`
  (`docs(projekt-143): align navmesh recovery state`).
- Current local `master` has an unpushed local stack on top of
  `origin/master`. The stack includes the Zone Control pad fix, short-palm
  retirement, vegetation source-pipeline review, KB-FORGE bureau audit, and
  this handoff refresh. Run `git log --oneline origin/master..master` for the
  exact current count. These are not pushed or deployed.
- GitHub CI run `25353544629` passed on `356bc2e` for lint, test, build,
  smoke, perf, and mobile UI.
- No production parity is claimed for the latest `master` state. Live Pages
  `/asset-manifest.json` still reports
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`; deploy remains manual.
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
  `artifacts/perf/2026-05-05T03-50-28-671Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
- Static Projekt suite:
  `artifacts/perf/2026-05-05T03-50-27-087Z/projekt-143-evidence-suite/suite-summary.json`
- KB-OPTIK decision packet:
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`
- KB-TERRAIN before baseline:
  `artifacts/perf/2026-05-04T11-26-11-588Z/projekt-143-terrain-horizon-baseline/summary.json`
- KB-TERRAIN material distribution audit:
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
- KB-TERRAIN placement/foundation audit:
  `artifacts/perf/2026-05-05T02-39-51-929Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
- KB-TERRAIN terrain asset inventory:
  `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
- KB-TERRAIN vegetation source pipeline review:
  `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md`
- KB-FORGE local Pixel Forge bureau audit:
  `artifacts/perf/2026-05-05T03-50-22-634Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`
- KB-TERRAIN route/trail policy audit:
  `artifacts/perf/2026-05-04T12-58-03-421Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
- KB-TERRAIN Open Frontier after vegetation pass:
  `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json`
- KB-TERRAIN A Shau after placement pass:
  `artifacts/perf/2026-05-04T04-14-35-401Z/summary.json`
- KB-TERRAIN A Shau after route-stamping pass:
  `artifacts/perf/2026-05-04T13-03-02-238Z/summary.json`
  (measurement trust PASS; validation FAIL on heap end-growth/recovery)
- KB-TERRAIN A Shau current rerun:
  `artifacts/perf/2026-05-05T02-41-21-751Z/summary.json`
  (measurement trust PASS; validation WARN only on peak p99; heap, movement,
  and hit guardrails PASS; NPC terrain-stall backtracking still visible)
- KB-TERRAIN local mossy cliff/material follow-up:
  `artifacts/perf/2026-05-04T21-42-10-596Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
- Local Open Frontier visibility/vegetation diagnostic:
  `artifacts/perf/2026-05-04T21-24-46-901Z/summary.json`
  (measurement trust PASS but validation FAIL on harness combat behavior; also
  noisy because local asset baking was running)
- Active-player hit-contract evidence after shorter-NPC aim investigation:
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json`
  (`120` shots / `43` hits; frame-time metrics are not clean acceptance
  because another browser game was running on and off during the capture)
- KB-CULL owner baseline:
  `artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`
- KB-CULL static-feature batching evidence:
  `artifacts/perf/2026-05-04T14-08-33-257Z/projekt-143-culling-proof/summary.json`,
  `artifacts/perf/2026-05-04T14-13-30-766Z/summary.json`, and
  `artifacts/perf/2026-05-04T14-17-44-361Z/summary.json`
  (static-feature draw-call reduction only; no broad Open Frontier perf win or
  A Shau acceptance)
- KB-CULL grounded/parked helicopter visibility evidence:
  `artifacts/perf/2026-05-04T17-41-57-455Z/summary.json`,
  `artifacts/perf/2026-05-04T17-51-52-562Z/summary.json`,
  `artifacts/perf/2026-05-04T21-42-38-633Z/projekt-143-culling-proof/summary.json`, and
  `artifacts/perf/2026-05-04T21-42-16-288Z/projekt-143-culling-owner-baseline/summary.json`
  (visible-helicopter category reduction only; not broad vehicle/HLOD or A Shau
  terrain acceptance)
- Rejected KB-CULL static-helicopter candidate:
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json`
- KB-EFFECTS trusted low-load closeout:
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`

## Current Bureau State

- KB-LOAD `pixel-forge-texture-upload-residency`: `ready_for_branch`.
  GiantPalm warmup reduced WebGL upload totals but did not improve startup
  latency. Do not broaden warmup from the rejected fanPalm evidence without a
  paired proof.
- KB-FORGE `local-pixel-forge-asset-pipeline`: local liaison bureau.
  Pixel Forge is our sibling repo at
  `C:\Users\Mattm\X\games-3d\pixel-forge`, not a third-party asset source.
  Use `npm run check:projekt-143-pixel-forge` from TIJ to catalog its TIJ
  pipeline commands, review gallery, output manifest, NPC package surface, and
  vegetation package state. Latest audit is WARN with Pixel Forge present,
  `109` manifest entries, `13` vegetation entries, all `6` current TIJ runtime
  vegetation species present, retired `giantPalm` still present in the Pixel
  Forge gallery manifest, all `6` blocked/review-only species still present,
  and the NPC review package counted as `4` factions, `8` clips, and `32`
  impostor packages. KB-FORGE should analyze relevance and package readiness
  before KB-TERRAIN or KB-OPTIK imports anything into runtime.
- KB-TERRAIN `large-mode-vegetation-horizon`: `ready_for_branch`.
  The first far-horizon branch must use the terrain baseline before/after
  screenshot path and matched Open Frontier/A Shau perf captures.
  The goal now also includes ground and vegetation art-direction correction:
  most traversable ground should read jungle green rather than gravel while
  preserving texture variety; verify whether slope/biome material distribution
  is inverted if green is mostly on hillsides; remove the short Quaternius palm
  (`giantPalm` / `palm-quaternius-2`) from runtime and shipped assets
  completely; preserve the taller palm-like species (`fanPalm` and
  `coconut`); spend the freed vegetation budget on grass or other ground cover;
  increase big palms and ground vegetation; and make bamboo scattered dense
  clusters rather than the dominant forest layer. Also add a source-pipeline
  investigation for EZ Tree or a similar licensed procedural/tree workflow as
  optional source input to Pixel Forge, not as a replacement for the local
  pipeline. The current review in
  `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md` recommends Dan
  Greenheck's `EZ-Tree` as a possible offline GLB-generation pilot for tree
  families, while grass, ground cover, and trail-edge assets should start with
  Pixel Forge catalog/review work, a licensed asset-library review, or custom
  low-card bake. Every candidate must be baked through Pixel Forge-compatible
  impostors/LODs before runtime import.
  The first
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
  still appear. The current rerun at
  `artifacts/perf/2026-05-05T02-41-21-751Z/summary.json` clears the hard heap
  blocker (`heap_growth_mb=-61.58`, peak growth `16.64MB`, recovery PASS) and
  keeps movement/hit guardrails green, but terrain-stall backtracking still
  appears, so A Shau is improved but not accepted. Later terrain/world-placement
  work must continue fixing hanging building foundations and review airfield,
  HQ, vehicle, firebase, and support-compound presets before considering Pixel
  Forge building replacements. Also inventory existing TIJ and Pixel Forge
  ground, path, trail, grass, foliage, and cover texture/assets before custom
  work; routes should become worn-in, smoothed, vehicle-usable trails where
  that fits future gameplay. The first low-resource inventory now exists at
  `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`;
  it is shortlist evidence only and does not accept any asset for runtime use.
  Current local follow-up reduces the remaining grey/rocky high-elevation
  look by keeping rock as a moss-tinted steep-cliff accent, not a blanket
  mountaintop biome. It also fixes a first-person hill-clipping failure mode:
  when a grounded movement step would put the player X/Z onto a terrain lip
  while Y is still clamped to the previous eye height, `PlayerMovement` now
  rejects the horizontal step so the camera does not enter the hillside. The
  Recast/navmesh stale-cache concern is partially closed by `e92523a`:
  registered pre-baked variants now use `public/data/navmesh/bake-manifest.json`
  plus deterministic terrain/feature signatures, and runtime solo navmesh
  cache keys include a terrain/feature fingerprint. The bake/runtime obstacle
  contract now uses collidable runtime placements instead of trafficable
  feature footprints. Remaining navigation risk is acceptance-level, not just
  invalidation plumbing: withheld Open Frontier seeds need per-seed feature
  presets, the current working tree clears the two Zone Control seed `137`
  placement warnings in
  `artifacts/perf/2026-05-05T02-39-51-929Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`,
  and A Shau still needs route/nav quality plus terrain-stall proof before
  signoff.
- Active-player perf harness: shorter Pixel Forge NPCs require the killbot to
  aim at the visual chest proxy below the eye-level actor anchor. The local
  TypeScript bot and CJS perf driver have unit coverage for that contract, and
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json` records `120` player
  shots and `43` hits. Use that artifact to close the zero-hit target-height
  question only. The owner reported another browser game was running on and
  off during the capture, so its frame-time/heap numbers are potentially
  skewed and cannot be used as perf acceptance or baseline refresh.
- KB-CULL `static-feature-and-vehicle-culling-hlod`: partial local
  static-feature batching evidence filed. Static placements now share a
  `WorldStaticFeatureBatchRoot` and are batched across placement boundaries.
  The selected owner path remains
  `large-mode-world-static-and-visible-helicopters`, but the current accepted
  scope is only static-feature layer draw-call reduction plus grounded/parked
  helicopter visibility reduction: refreshed owner evidence records Open
  Frontier owner draw-call-like `261` and A Shau `307` after static batching,
  then a parked-helicopter pass takes Open Frontier helicopter attribution to
  `0` visible objects / `0` visible triangles and reduces A Shau from `56`
  visible objects / `4,796` visible triangles to `37` / `2,696`.
  Open Frontier static attribution improved, but total renderer max is mixed
  because close NPCs/weapons were visible in the after capture; A Shau improved
  materially and no longer heap-fails in the fresh run, but it remains WARN and
  still surfaces terrain-stall warnings. Close-NPC/weapon pool residency
  remains diagnostic-only until combat stress measurement trust passes.
  A static helicopter distance-cull prototype was rejected because the trusted
  Open Frontier after capture failed validation and owner draw-call-like stayed
  `388`; do not repeat it as a claimed fix without new evidence. Current local
  follow-up changes world static features from one globally visible batch root
  to per-feature render groups with distance/hysteresis culling, because bases
  and houses were visibly rendering at any distance. The first diagnostic
  Open Frontier scene attribution shows lower visible static triangles but
  higher draw-call-like from finer granularity, so this needs final gates and a
  later HLOD/cluster plan before broad acceptance. For vegetation behind hills,
  use coarse terrain/cluster/Hi-Z-style occlusion planning; do not add
  per-instance raycasts.
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
5. npm run check:projekt-143-pixel-forge

Current evidence anchors:
- Cycle 3 kickoff:
  artifacts/perf/2026-05-05T03-50-28-671Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json
- Static Projekt suite:
  artifacts/perf/2026-05-05T03-50-27-087Z/projekt-143-evidence-suite/suite-summary.json
- KB-FORGE local Pixel Forge bureau:
  artifacts/perf/2026-05-05T03-50-22-634Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json
- KB-TERRAIN before baseline:
  artifacts/perf/2026-05-04T12-59-44-452Z/projekt-143-terrain-horizon-baseline/summary.json
- KB-TERRAIN material distribution:
  artifacts/perf/2026-05-04T21-42-10-596Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json
- KB-TERRAIN placement/foundation audit:
  artifacts/perf/2026-05-05T02-39-51-929Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json
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
- KB-TERRAIN A Shau current rerun:
  artifacts/perf/2026-05-05T02-41-21-751Z/summary.json
- KB-TERRAIN local mossy cliff/material follow-up:
  artifacts/perf/2026-05-04T21-42-10-596Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json
- Local Open Frontier visibility/vegetation diagnostic:
  artifacts/perf/2026-05-04T21-24-46-901Z/summary.json
  (measurement trust PASS but validation FAIL on harness combat behavior; also
  noisy because local asset baking was running)
- Active-player hit-contract evidence:
  artifacts/perf/2026-05-04T11-35-07-274Z/summary.json
- KB-CULL owner baseline:
  artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json
- KB-CULL static-feature batching:
  artifacts/perf/2026-05-04T14-08-33-257Z/projekt-143-culling-proof/summary.json
  artifacts/perf/2026-05-04T14-13-30-766Z/summary.json
  artifacts/perf/2026-05-04T14-17-44-361Z/summary.json
- KB-CULL grounded/parked helicopter visibility:
  artifacts/perf/2026-05-04T17-41-57-455Z/summary.json
  artifacts/perf/2026-05-04T17-51-52-562Z/summary.json
  artifacts/perf/2026-05-04T21-42-16-288Z/projekt-143-culling-owner-baseline/summary.json
- KB-EFFECTS low-load closeout:
  artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json
- KB-OPTIK decision packet:
  artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json

Current bureau state:
- KB-LOAD: ready_for_branch, but no startup-latency win yet.
- KB-TERRAIN: ready_for_branch, before baseline exists; no far-canopy fix yet.
  Include the owner visual target: majority green/jungle floor, possible
  inverted material distribution, remove the short Quaternius palm
  (`giantPalm` / `palm-quaternius-2`) from runtime and shipped assets, preserve
  the taller `fanPalm` and `coconut` palm-like species, redirect that budget
  toward grass or ground cover, add more big palms and ground cover, bamboo as
  scattered dense clusters, terrain-shaped building/HQ/airfield/vehicle
  foundations with no hill-edge overhangs, and a performance-aware Pixel Forge
  building shortlist before replacement. Include an asset audit for
  ground/path/grass/foliage/cover variety and future vehicle-usable trail
  surfaces, plus an EZ Tree or similar source-pipeline investigation for
  licensed browser-budget GLBs that can become Pixel Forge-compatible
  impostors/LODs. Current local terrain work has Open Frontier
  WARN/trusted evidence, clustered-bamboo static distribution evidence, a
  passing placement/foundation audit, a static terrain asset inventory, and a
  passing route/trail policy audit. A Shau now stamps full `jungle_trail`
  corridors instead of map-only route overlays. The older after-route capture
  fails heap validation and still shows terrain-stall warnings; the current
  rerun clears heap but still shows terrain-stall backtracking, so do not claim
  A Shau acceptance. Current local follow-up keeps rock as a reduced
  moss-tinted cliff accent rather than a broad grey elevation cap, fixes the
  hill-clipping camera case by rejecting terrain-lip horizontal steps that
  would put the eye inside the hillside, and records the navmesh invalidation
  risk: `e92523a` now gives registered bakes a manifest/signature gate and
  runtime solo navmesh cache fingerprints, but it does not sign off A Shau nav
  quality or withheld Open Frontier seed variants. Current local placement
  evidence clears the Zone Control seed `137` placement warnings. The latest
  short-palm retirement validation has `npm run validate:fast` PASS,
  `npm run build` PASS, `npm run build:perf` PASS, `6` runtime vegetation
  species, `1` retired short palm, and `0` missing assets at
  `artifacts/perf/2026-05-05T03-23-29-111Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`.
  The
  active-player killbot has a shorter-NPC visual-chest
  aim fix in unit tests
  and a fresh Open Frontier capture with `120` shots / `43` hits. Do not trust
  that capture for frame-time acceptance because another browser game was
  running on and off during it.
- KB-CULL: partial static-feature batching pass filed. Shared static-feature
  root reduced world-static draw-call-like in Open Frontier and A Shau; treat
  it as static-feature draw-call reduction only, not broad culling/HLOD or
  perf acceptance. A follow-up grounded/parked helicopter pass applies the
  existing air-vehicle render-distance rule before stopped grounded helicopters
  skip physics; treat it as visible-helicopter category reduction only. Open
  Frontier reaches `0` visible helicopter objects/triangles, while A Shau is
  reduced but not closed (`37` visible objects / `2,696` visible triangles).
  Current local follow-up changes world static features to per-feature
  distance/hysteresis render groups because distant bases/houses were staying
  visible at any distance. The first diagnostic capture lowers visible static
  triangles but increases draw-call-like, so final gates plus HLOD/cluster work
  are still required. Vegetation hidden behind hills should be handled with
  coarse terrain/cluster/Hi-Z-style occlusion, not per-instance raycasts.
  Close-NPC/weapon residency remains diagnostic-only. Rejected
  static-helicopter distance-cull after artifact:
  artifacts/perf/2026-05-04T00-55-00-501Z/summary.json.
- KB-EFFECTS: evidence_complete only for low-load grenade first-use stall.
- KB-OPTIK: needs_decision for near-stress silhouette exception/human review.

Goal: continue toward completing Projekt Objekt-143 without making unsupported
claims. Pick the next remediation only after refreshing the kickoff matrix and
checking that the selected bureau has before evidence. Prefer a narrow,
bisectable branch:
- KB-CULL next path: continue from the shared static-feature batching evidence
  with matched Open Frontier/A Shau captures, and only claim the category that
  actually improves. Static-feature draw-call reduction and grounded/parked
  helicopter visibility reduction have evidence; A Shau visible helicopters and
  close-NPC/weapon residency are not closed.
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
