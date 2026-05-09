# State Of Repo

Last updated: 2026-05-08

This file is the current-state snapshot for the repo. [ROADMAP.md](ROADMAP.md)
remains aspirational. [BACKLOG.md](BACKLOG.md) tracks queued work. This
document answers the narrower question: what is verified in the current repo
state. Historical cycle/archive docs remain historical evidence; this file is
the current truth anchor.

## Current Stabilization Direction On 2026-05-08

`cycle-2026-05-08-perception-and-stuck` closed 2026-05-08 on top of the
prior STABILIZAT-2 closeout. Single integration PR
[#165](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/165)
shepherded four parallel task branches to `master`:
`npc-unfreeze-and-stuck`, `npc-imposter-distance-priority`,
`zone-validate-nudge-ashau`, `terrain-cdlod-seam`. Behaviour changes are
gated by config flags exposed in the existing Tweakpane (`\` toggle) so
the human can A/B at runtime. CI green on lint + test (4153 tests) +
build + smoke + perf (combat120 5m47s within baseline) + mobile-ui.
Reviewers (combat-reviewer, terrain-nav-reviewer) APPROVE-WITH-NOTES;
notes captured in the cycle retrospective as deferred follow-ups (no
blockers). Cycle retrospective:
`docs/cycles/cycle-2026-05-08-perception-and-stuck/RESULT.md`.

A user-reported regression on top of that cycle landed as a hotfix on
2026-05-08. Stage D2's `createTileGeometry` shipped with an inverted
Z coordinate (`z = 0.5 - j/(N-1)` vs the rotated PlaneGeometry's
`z = j/(N-1) - 0.5`), which flipped triangle winding so every interior
face had a -Y normal; default `MeshStandardMaterial(FrontSide)`
backface-culled the terrain from above on every map. The hotfix removes
the extra negation in `src/systems/terrain/CDLODRenderer.ts` and adds a
face-normal regression test in `CDLODRenderer.test.ts`. Stage D1
(AABB-distance morph) and Stage D2 (skirt ring + per-LOD vertex drop)
both survive the hotfix unchanged. Live deploy SHA updates with this
hotfix on `https://terror-in-the-jungle.pages.dev`; verify via
`/asset-manifest.json gitSha`.

Prior cycle remains the active stabilization anchor: 
`cycle-2026-05-08-stabilizat-2-closeout` closed 2026-05-08. Six themed PRs
(helicopter rotor axis, water audits, terrain+effects, UX respawn, combat
AI/squad/core mega-cluster with documented GOST-TIJ-001 exception, docs +
audit script catalog) shepherded the codex agent's 143-file working tree to
`master`. Live release verified at SHA `babae19a76e5ff622976a632e10f7055315d2698`
on `https://terror-in-the-jungle.pages.dev` (live-release-proof 7/7 PASS).
Codex revision 1.3 — 2026-05-08, Politburo seal applied for STABILIZAT-2/3,
SVYAZ-1, SVYAZ-2, UX-1. STABILIZAT-1 deferred to Strategic Reserve under
Politburo direction. AVIATSIYA-1 / DEFEKT-5 source evidence complete; human
visual review remains pending. DEFEKT-2 14-day live drift watch active from
T+0 = 2026-05-08. Cycle retrospective:
`docs/cycles/cycle-2026-05-08-stabilizat-2-closeout/RESULT.md`.

The earlier release path is preserved: local validation, commit to `master`,
push to `origin/master`, GitHub CI, manual Cloudflare Pages deploy via
`deploy.yml`, and live Pages/R2/browser verification via
`check:projekt-143-live-release-proof`. Exact production SHA remains the live
`/asset-manifest.json` source of truth; do not freeze it into this doc.

The release preserves the useful fixes and evidence from the long
agent/orchestration cycle and records unresolved KB-LOAD, KB-TERRAIN, KB-CULL,
water, vegetation, Pixel Forge, culling/HLOD, and combined-arms findings as
roadmap/backlog work. Do not claim final water art, accepted Pixel Forge
candidate import, broad HLOD/culling, future driving surfaces, or skilled
combined-arms feel from the current partial artifacts.

Latest positive STABILIZAT-1 / DEFEKT-3 sparse owner-review decision is
`artifacts/perf/2026-05-07T22-29-58-460Z/projekt-143-sparse-owner-acceptance-audit/sparse-owner-acceptance-audit.json`;
latest bounded owner-split audit is
`artifacts/perf/2026-05-07T22-49-28-445Z/projekt-143-defekt-render-owner-split-audit/render-owner-split-audit.json`;
latest bounded terrain contribution audit is
`artifacts/perf/2026-05-07T22-56-02-642Z/projekt-143-defekt-terrain-contribution-audit/terrain-contribution-audit.json`;
latest bounded render pass-metadata audit is
`artifacts/perf/2026-05-07T23-08-28-327Z/projekt-143-defekt-render-pass-metadata-audit/pass-metadata-audit.json`;
latest bounded terrain-shadow diagnostic audit is
`artifacts/perf/2026-05-07T23-20-53-503Z/projekt-143-defekt-terrain-shadow-diagnostic-audit/terrain-shadow-diagnostic-audit.json`;
latest visual fallback / directionality audit is
`artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`;
latest aircraft import / rotor-axis packet is
`artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json`;
latest aircraft readiness bridge packet is
`artifacts/perf/2026-05-08T00-11-04-505Z/projekt-143-aviatsiya-aircraft-readiness/summary.json`;
latest fixed-wing runtime proof packet is
`artifacts/perf/2026-05-08T00-56-34-511Z/projekt-143-fixed-wing-clean-gate/summary.json`;
latest VODA exposure source audit is
`artifacts/perf/2026-05-08T01-15-33-373Z/projekt-143-voda-exposure-source-audit/summary.json`;
the accepted post-tag proof remains
`artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-ground-marker-tagging-proof/ground-marker-tagging-proof.json`,
and the paired KB-METRIK measurement-path packet is
`artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-measurement-path-inspection/measurement-path-inspection.json`.
The sparse rebuilt headed combat120 capture is status `ok`, validation `warn`,
and measurement trust WARN with `87` runtime samples and `3` render-submission
drain samples. `perf:compare -- --scenario combat120` selects this capture and
fails with `6 pass, 1 warn, 1 fail`: avg frame `16.19ms` WARN, p99 `34.20ms`
PASS, max-frame `100.00ms` FAIL, heap end-growth `6.51MB`, and heap recovery
`86.2%`. Raw probe evidence records p50 `21ms`, p95 `30ms`, avg `28.93ms`,
max `348ms`, `3/87` samples over `75ms`, and `3505993` render-submission bytes,
so sparse drain avoids the per-sample overhead class proven by the failed
17:19 packet. The proof records `unattributed` draw-share movement from
`0.2991` to `0.0202` and new `npc_ground_markers` draw share `0.3232` after the
source edit tagged `PixelForgeNpcGroundMarker.${key}` with
`userData.perfCategory = 'npc_ground_markers'`. The sparse-owner audit records
PASS, `8/8` criteria passing, `sparse_owner_review_accepted`, raw probe over-75
rate `0.0345`, over-150 rate `0.0345`, and avg-without-max delta `3.37ms`
versus the accepted reference. It accepts the post-tag packet for owner review
only. The owner-split audit records WARN, `post_tag_renderer_owner_split_divergent`,
and `owner_review_only`: post-tag top draw is `npc_ground_markers` at `0.3232`,
post-tag top triangles are terrain at `0.7174`, `npc_close_glb` draw submissions
move `36->14`, and renderer reconciliation remains partial at draw `0.4583` /
triangles `0.7276`. The terrain contribution audit records WARN,
`terrain_triangle_axis_source_bound_timing_unisolated`, and `owner_review_only`:
terrain contributes `2` draw submissions at `0.0202` draw share, `163840`
submitted triangles at `0.7174` triangle share, `80` submitted instances,
`2048` triangles per terrain instance, and `0.5219` of peak renderer triangles;
source anchors bind the path to the CDLOD InstancedMesh, selected-tile instance
updates, default `33` vertex tile resolution, and device-adaptive shadow
capability. The pass-metadata audit records WARN,
`render_pass_metadata_bound_timing_unisolated`, and `owner_review_only` from
capture `artifacts/perf/2026-05-07T23-05-54-437Z`: capture status `ok`,
validation `warn`, measurement trust `warn`, exact peak frame `3035`, frame
pass types `main:124, shadow:1`, terrain pass types `main:2, shadow:1`,
terrain `3` draw submissions, terrain triangle share `0.7095`, top draw
`npc_close_glb`, top triangles `terrain`, and renderer reconciliation draw
`0.7022` / triangles `0.9987`. Because formal measurement trust remains WARN,
the controlling
production-shaped owner packet for regression comparison remains the
measurement-PASS packet at
`artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`.
Baseline refresh remains blocked; the next DEFEKT-3 terrain step must run a
controlled terrain-shadow or tile-resolution diagnostic against the same
combat120 shape.
Ground-marker/imposter draw batching and renderer-submission reconciliation
remain separate open axes. The next step is not per-sample render-submission
drain or a baseline update.

The controlled terrain-shadow diagnostic at
`artifacts/perf/2026-05-07T23-20-53-503Z/projekt-143-defekt-terrain-shadow-diagnostic-audit/terrain-shadow-diagnostic-audit.json`
records WARN status, `7/7` checks passing, classification
`terrain_shadow_contribution_isolated_timing_still_untrusted`, and
`owner_review_only` acceptance. The shadow-off capture
`artifacts/perf/2026-05-07T23-18-42-597Z` records
`perfRuntime.terrainShadowsDisabled=true`, removes the terrain shadow pass
(`main:99`; terrain pass types `main:2`), and keeps terrain as the top triangle
category. It does not improve timing: control avg/p99 is `17.57/34.3ms`,
shadow-off avg/p99 is `20.49/45.3ms`, and max-frame remains `100ms`. Do not
disable terrain shadows as the DEFEKT-3 fix from this packet.

DEFEKT-5 is now open for visual fallback and directionality integrity. The
visual-integrity audit at
`artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`
records PASS status for source-bound visual integrity and classifies the packet
as `visual_integrity_source_bound_human_review_pending`. It verifies that
Pixel Forge dying NPCs select `death_fall_back`, that the shader runs it as a
one-shot atlas clip, and that `CombatantRenderer` no longer applies the old
procedural billboard death shrink to that clip. It verifies the Pixel Forge
cutover gate against old NPC sprite/source-soldier assets. It now records close
NPC exceptions as instrumented runtime policy: the close-model distance remains
`64m`, and `CombatantRenderer` exposes fallback records plus runtime stats for
`perf-isolation`, `pool-loading`, `pool-empty`, and `total-cap`, including
counts, distance bounds, pool loads, pool targets, and pool availability.
Explosion visuals are now explicitly classified as the active optimized pooled
unlit billboard flash plus point particles and shockwave ring:
`EXPLOSION_EFFECT_REPRESENTATION` marks `dynamicLights=false` and
`legacyFallback=false`. The aircraft import proof at
`artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json`
records runtime-axis alignment instead of blind source preservation: Huey `z`
and UH-1C Gunship `z` are preserved with `bytesAffected=0`, while AH-1 Cobra
is corrected from source `x` to imported/runtime `z` with `bytesAffected=48`.
The DEFEKT-5 review packet at
`artifacts/perf/2026-05-08T01-23-33-556Z/projekt-143-defekt5-human-review/review-summary.json`
records `needs_human_decision`. The remaining acceptance gap is human visual
review of death animation, close-NPC LOD feel, explosion appearance, and rotor
appearance; this packet also does not certify combat120 or stress-scene grenade
performance.

The aircraft readiness bridge packet at
`artifacts/perf/2026-05-08T00-11-04-505Z/projekt-143-aviatsiya-aircraft-readiness/summary.json`
records WARN classification
`aircraft_static_source_ready_runtime_probe_partial`: targeted aircraft tests
pass (`20` files / `322` tests), `check:projekt-143-visual-integrity` passes,
the older Pixel Forge aircraft dry-run preserves Huey `z`, UH-1C Gunship `z`,
and AH-1 Cobra `x` tail-rotor axes with `bytesAffected=0`, and the copied
fixed-wing browser probe is PARTIAL. A-1 Skyraider entry, liftoff, climb,
approach, bailout, and NPC handoff are positive in that partial packet, but it
does not certify full fixed-wing runtime acceptance, human rotor review, live
release proof, or combat120 baseline refresh.

The follow-up fixed-wing runtime proof packet at
`artifacts/perf/2026-05-08T00-34-03-449Z/projekt-143-fixed-wing-runtime-proof/summary.json`
records WARN classification `fixed_wing_runtime_passed_harness_teardown_warn`.
The copied probe summary is `passed` for A-1 Skyraider, F-4 Phantom, and AC-47
Spooky. All three record `success=true`, liftoff, climb, approach, bailout, and
NPC handoff; AC-47 also records `orbitValid=true`. The wrapper command timed
out after `900000ms` and left the perf preview server to be stopped manually,
so this is runtime scenario evidence with a harness-teardown warning, not a
clean command gate, human flight-feel acceptance, live production parity, or
combat120 baseline proof.

The later fixed-wing clean gate at
`artifacts/perf/2026-05-08T00-56-34-511Z/projekt-143-fixed-wing-clean-gate/summary.json`
supersedes the teardown warning for the functional browser gate. The command
`npm run probe:fixed-wing -- --boot-attempts=1 --port 4175` exited `0`; the copied probe
summary is `passed` for A-1 Skyraider, F-4 Phantom, and AC-47 Spooky; all three
record entry, liftoff, climb, approach, bailout, and NPC handoff; AC-47 records
`orbitValid=true`; the residue scan found no listener on port `4175` and no
fixed-wing probe or preview command line after teardown. The Politburo reported
local games and other agents active on the same PC, so the packet is functional
evidence only. It rejects frame-time acceptance, wall-time acceptance, perf
baseline refresh, optimization claims, and resource-isolation claims.

AVIATSIYA-1 has fresh rotor-axis evidence.
`npm run assets:import-pixel-forge-aircraft` wrote
`artifacts/perf/2026-05-08T01-23-12-400Z/pixel-forge-aircraft-import/summary.json`:
the importer preserves the declared Huey and UH-1C Gunship `z` tail-rotor spin
axes and applies an explicit AH-1 Cobra `x->z` correction because the TIJ
side-mounted tail-rotor contract requires runtime `z`. The packet records
Cobra `sourceAxis=x`, `importedAxis=z`, `keyframes=3`, and
`bytesAffected=48`. The latest visual-integrity audit verifies public runtime
axes against expected axes: Huey `z`, UH-1C Gunship `z`, and AH-1 Cobra
public/expected `z` with correction `source-x-to-runtime-z`. The aircraft
readiness bridge packet adds targeted test evidence, and the fixed-wing runtime
proof adds passed A-1/F-4/AC-47 scenario evidence with a clean functional gate
after the later port-4175 rerun. This is source, asset, and local runtime
evidence only; human visual playtest acceptance, CI/PR/merge, live production
parity, and quiet-machine performance evidence are still required.

DEFEKT-4 now has an executable route-quality source/static-policy gate:
`npm run check:projekt-143-defekt-route-quality`. Latest packet
`artifacts/perf/2026-05-07T22-42-23-479Z/projekt-143-defekt-route-quality-audit/route-quality-audit.json`
records WARN status, `npc_route_quality_guardrails_present_runtime_acceptance_missing`,
and `source_and_static_route_policy_only`. It anchors `CombatantMovement`,
`StuckDetector`, route/stuck behavior tests, `perf-active-driver.cjs`
route-recovery telemetry, the `perf-capture` `harness_max_stuck_seconds` gate,
and active-driver diagnostic route/stuck findings. The paired terrain-route
audit
`artifacts/perf/2026-05-07T22-40-26-760Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
passes static route policy with `3` route-aware modes, `87931.1m` total route
length, and `2882` route capsule stamps. This is not runtime acceptance:
DEFEKT-4 remains open until A Shau plus Open Frontier active-driver captures
pass measurement trust, record route/stuck telemetry, and satisfy explicit
bounds for max stuck seconds, route no-progress resets, waypoint replan
failures, path-query status, and terrain-stall warning rate.

DEFEKT-1 now has an executable stale-baseline audit:
`npm run check:projekt-143-stale-baseline-audit -- --as-of 2026-05-07`.
Latest packet
`artifacts/perf/2026-05-07T22-04-54-994Z/projekt-143-stale-baseline-audit/stale-baseline-audit.json`
records WARN status, `4` tracked scenarios, `0` current, `0`
refresh-eligible, `4` blocked, and `4` stale by age. The tracked
`perf-baselines.json` date remains 2026-04-20. `combat120` is blocked by
validation WARN / measurement trust WARN / max-frame FAIL, `openfrontier:short`
by validation WARN, `ashau:short` by compare FAIL, and `frontier30m` by failed
latest detected soak capture. This packet audits the baseline gate only; it
does not refresh baselines or prove a runtime fix.

DEFEKT-2 has an executable drift gate: `npm run check:doc-drift -- --as-of
2026-05-08`. The failing packet
`artifacts/perf/2026-05-07T17-38-11.026Z/projekt-143-doc-drift/doc-drift.json`
found three codex future-date errors for Article III / Annex A May 8, 2026
status claims and stale historical command references. The codex date claims
were reissued to `2026-05-07`, and sibling-workspace command references were
clarified. Current aircraft rotor closeout pass packet
`artifacts/perf/2026-05-08T01-26-06.909Z/projekt-143-doc-drift/doc-drift.json`
records zero future-date findings, zero missing concrete artifact references,
zero missing package scripts, `573` checked artifact references, and `276`
checked package command references after the AVIATSIYA-1 / DEFEKT-5 evidence
update.
This is doc-drift evidence, not runtime or live-production evidence.

The `check:projekt-143-completion-audit` alias now routes to
`scripts/projekt-143-current-completion-audit.ts`, which measures the current
codex Article III / Article VII board instead of the retired pre-codex bureau
board. Current packet
`artifacts/perf/2026-05-08T01-26-26-320Z/projekt-143-completion-audit/completion-audit.json`
is `NOT_COMPLETE`: `34` Article III directives parsed, `10` closed, `24` open,
`0` deferred, zero missing cited artifacts, stale live release proof at SHA
`ab0cfd0e9a0f39ebe8b3a87f316b9287edfd3289`, dirty local HEAD
`aff1abd4da769e2a04e6e5f9b39d241296a60ada`, DEFEKT local drift proof pass at
`artifacts/perf/2026-05-08T01-26-06.909Z/projekt-143-doc-drift/doc-drift.json`,
no Politburo seal marker, no 14-day live drift watch, and `29` closeout
blockers. The prompt-to-artifact checklist fails Article III completion,
live-release verification, Politburo seal, and 14-day live drift; it passes the
30-day ARKHIV strategic-reserve audit. This is a current closeout audit, not a
production deploy, baseline refresh, or goal-completion claim.

ARKHIV-1 supporting-doc disposition is now audited locally. The handoff,
hydrology, and vegetation source pipeline docs remain topic-specific references;
the old 24-hour status snapshot moved to
`docs/archive/PROJEKT_OBJEKT_143_24H_STATUS_2026-05-04.md`. Latest audit
packet:
`artifacts/perf/2026-05-07T17-47-15.786Z/projekt-143-arkhiv-supporting-doc-audit/supporting-doc-audit.json`.
This is document-graph evidence, not runtime or production evidence.

ARKHIV-2 backlog consolidation is now audited locally. `docs/BACKLOG.md` is a
compact Strategic Reserve index at `133/200` measured lines. Active directive
status routes to `docs/PROJEKT_OBJEKT_143.md` Article III, and historical cycle
records route to `docs/cycles/<cycle-id>/RESULT.md`. Latest audit packet:
`artifacts/perf/2026-05-07T18-01-14.369Z/projekt-143-arkhiv-backlog-consolidation-audit/backlog-consolidation-audit.json`.
This is document-graph evidence, not runtime or production evidence.

ARKHIV-3 spike memo disposition is now audited locally. The archive index at
`docs/archive/E_TRACK_SPIKE_MEMO_INDEX_2026-05-07.md` records E1-E6 source
refs, current SHAs, branch memo paths, folded decisions, and branch-deletion
constraints. Latest audit packet:
`artifacts/perf/2026-05-07T18-07-09.771Z/projekt-143-arkhiv-spike-memo-audit/spike-memo-audit.json`.
It records `6/6` spike refs present, `9/9` branch memo paths present, and `6/6`
checks passing. This is document-graph evidence, not runtime or production
evidence.

DIZAYN-1 now has a charter memo at `docs/dizayn/vision-charter.md`. The audit
packet
`artifacts/perf/2026-05-07T17-49-40.255Z/projekt-143-dizayn-vision-charter-audit/vision-charter-audit.json`
passes `6/6` required surfaces: water, air combat, squad command, deploy flow,
art-direction gate, and bureau interfaces. This is design-governance evidence,
not runtime acceptance, human playtest acceptance, or production evidence.

DIZAYN-2 now has an invocable KB-DIZAYN art-direction gate at
`docs/dizayn/art-direction-gate.md`. The audit packet
`artifacts/perf/2026-05-07T17-55-41.245Z/projekt-143-dizayn-art-direction-gate-audit/art-direction-gate-audit.json`
passes `6/6` required gate surfaces: invocation, evidence trust, decision
vocabulary, source operating docs, non-claims, and KB-METRIK boundary. This is
gate-procedure evidence, not visual signoff for any runtime directive.

SVYAZ-1 now has an executable neutral-command source/test audit:
`npm run check:projekt-143-svyaz-neutral-command`. Latest packet
`artifacts/perf/2026-05-07T18-45-48-457Z/projekt-143-svyaz-neutral-command-audit/neutral-command-audit.json`
records `15` pass, `0` warn, and `0` fail checks across `13` source and test
files. Browser proof
`artifacts/perf/2026-05-07T18-59-28-353Z/projekt-143-svyaz-standdown-browser-proof/standdown-browser-proof.json`
records the live command overlay exposing `STAND DOWN`, suppressing the old
`FREE ROAM` label, converting a directed `hold_position` squad to `free_roam`,
clearing the prior command position, and preserving the selected `wedge`
formation. Escape/backdrop cancel remains modal close by policy; slot 5 is the
explicit squad stand-down order. SVYAZ-1 is evidence-complete in
`docs/PROJEKT_OBJEKT_143.md`. This is source/test and browser-runtime evidence,
not mobile UX signoff, human playtest, production deploy proof, or a claim that
SVYAZ-2/3 command surfaces exist.

SVYAZ-2 is evidence-complete in `docs/PROJEKT_OBJEKT_143.md`. The executable
source/test audit `npm run check:projekt-143-svyaz-ping-command` now passes at
`artifacts/perf/2026-05-07T21-42-23-342Z/projekt-143-svyaz-ping-command-audit/ping-command-audit.json`
with `18` pass, `0` warn, and `0` fail checks across `16` source and test files.
It consumes browser proof
`artifacts/perf/2026-05-07T21-41-01-140Z/projekt-143-svyaz-ping-command-browser-proof/ping-command-browser-proof.json`,
which records `11` pass, `0` warn, `0` fail, zero browser errors, a retained
live `attack_here` command position, a visible in-world
`SquadCommandWorldMarker`, tactical-map command-marker pixels, and screenshot
artifacts. The accepted scope is squad ping command availability, map/world
marker visibility, travel engagement behavior, and documented
movement-versus-combat priority. This does not prove mobile command ergonomics,
live production parity, or SVYAZ-3 air-support radio.

UX-1 now has source/test, production-build browser, multi-spawn visual, and local
KB-DIZAYN evidence. `npm run check:projekt-143-ux-respawn` produced
`artifacts/perf/2026-05-07T20-30-26-829Z/projekt-143-ux-respawn-audit/ux-respawn-audit.json`
with `15` pass, `0` warn, `0` fail, and `acceptanceReady=true`. `npm run
check:projekt-143-ux-respawn-browser` produced
`artifacts/perf/2026-05-07T20-35-21-453Z/projekt-143-ux-respawn-browser-proof/ux-respawn-browser-proof.json`
with `8` pass, `0` warn, `0` fail, zero browser errors, desktop/mobile
screenshots, visible alliance, grouped spawn options, selected-spawn state,
decision timing, and 48px mobile spawn targets after a fresh `npm run build`.
That production-build proof verifies the current `dist/` Zone Control deploy
surface and exposes only the live single home-base spawn case. `npm run
check:projekt-143-ux-respawn-multispawn` produced
`artifacts/perf/2026-05-07T20-27-26-789Z/projekt-143-ux-respawn-multispawn-proof/ux-respawn-multispawn-proof.json`
with `10` pass, `0` warn, `0` fail, zero browser errors, required
home-base/zone/helipad/insertion classes on desktop and mobile, mobile 48px
spawn targets, and map/spawn-option screenshots. `npm run check:mobile-ui`
completed at `artifacts/mobile-ui/2026-05-07T19-46-27-777Z/mobile-ui-check`
with `72` checks, `3` policy skips, and zero page, request, or console errors.
The first KB-DIZAYN gate packet
`artifacts/perf/2026-05-07T20-07-49-954Z/projekt-143-ux-respawn-dizayn-gate/ux-respawn-dizayn-gate.json`
returned UX-1 with notes. The signed follow-up gate
`artifacts/perf/2026-05-07T20-28-48-561Z/projekt-143-ux-respawn-dizayn-gate/ux-respawn-dizayn-gate.json`
accepts the local visual packet after the multi-spawn proof, map-label anchor
correction, and mobile metadata stacking correction. UX-1 remains open for live
production parity or explicit Politburo deferral to STABILIZAT; this does not
close UX-2, UX-3, or UX-4.

AVIATSIYA-3 now has a helicopter player/session parity memo at
`docs/rearch/helicopter-parity-audit.md`. The audit packet
`artifacts/perf/2026-05-07T18-11-27.481Z/projekt-143-aviatsiya-helicopter-parity-audit/helicopter-parity-audit.json`
passes `6/6` required surfaces: scope/source paths, authority map,
state-authority gaps, recommended consolidation, fixed-wing parity comparison,
and validation boundaries. The memo records `VehicleSessionController` as the
player-session authority, `HelicopterPlayerAdapter` as player helicopter
control authority, `HelicopterVehicleAdapter` as the `IVehicle` seat facade,
and duplicated helicopter exit placement as the main consolidation target.
This is architecture-audit evidence, not helicopter feel, rotor visual parity,
runtime implementation, human playtest acceptance, or production evidence.

STABILIZAT-1 remains blocked after the 2026-05-07 rerun at
`artifacts/perf/2026-05-07T04-11-20-627Z/validation.json`. The capture failed:
avg frame `94.34ms`, peak p99 `100.00ms`, frames >50ms `86.78%`, over-budget
samples `100%`, Combat dominated every sample over 16.67ms, heap end-growth
`29.88MB` WARN, heap peak-growth `257.69MB` FAIL, heap recovery `88.4%` PASS,
and measurement trust WARN. No `perf-baselines.json` refresh is authorized from
this artifact.

DEFEKT-3 now has a follow-up dominance audit at
`artifacts/perf/2026-05-07T04-19-12-176Z/projekt-143-defekt-combat120-dominance-audit/summary.json`.
The old suppression-only explanation is incomplete in the current repo: Combat
tail evidence splits across high-LOD AI update, close GLB / weapon rendering,
close-model pool exhaustion, and NPC movement pressure.

The next DEFEKT-3 isolation run at
`artifacts/perf/2026-05-07T04-28-10-437Z/projekt-143-close-npc-isolation/summary.json`
attributes the dominant release blocker to close-actor rendering. With
`perfDisableNpcCloseModels=1`, validation moves from FAIL to WARN, measurement
trust passes, avg frame moves `94.34ms` to `18.98ms`, Combat avg `24.96ms` to
`5.14ms`, billboard/render avg `14.32ms` to `0.54ms`, average draw calls
`3680.91` to `247.14`, weapon and close-NPC GLB visible draw-call-like entries
drop to `0`, and close-model pool-empty warnings drop `165` to `0`. This is not
baseline or release evidence because it removes the production close-actor
visual contract.

The follow-up production-path DEFEKT-3 remediation at
`artifacts/perf/2026-05-07T04-51-00-922Z/projekt-143-close-actor-remediation/summary.json`
keeps a limited close-actor visual contract instead of disabling close models:
attached weapon clones merge to one render mesh, active close GLB actors cap at
`16`, overflow close actors render as impostors, and desktop high/medium AI
full-update caps drop to `12/16`. The standard `npm run perf:capture:combat120`
artifact remains validation FAIL but measurement trust passes. It records avg
frame `19.82ms`, peak p99 `70.50ms`, frames >50ms `0.11%`, over-budget
`0.35%`, Combat avg `5.93ms`, AI avg `3.82ms`, billboard/render avg `2.05ms`,
draw-call avg `286.72`, visible weapon draw-call-like `16`, visible close-NPC
GLB draw-call-like `112`, visible NPC impostor instances `73`, close-model
pool-empty warnings `0`, AI starvation avg `1.58`, heap end-growth `-25.67MB`,
heap peak-growth `18.33MB`, and heap recovery `240.0%`. STABILIZAT-1 remains
blocked because peak p99 fails and avg frame is still above the codex `<=17ms`
baseline criterion. The next blocker is residual capture-start/tail spikes plus
human visual acceptance of the lower close-model cap.

The next DEFEKT-3 metric-window remediation at
`artifacts/perf/2026-05-07T05-00-06-198Z/projekt-143-tail-window-remediation/summary.json`
moves in-page metrics, perf telemetry, and browser-stall observer reset after
the active scenario driver restart. The standard `npm run
perf:capture:combat120` command now exits successfully with validation WARN and
measurement trust PASS. It records avg frame `19.24ms`, peak p99 `37.70ms`,
frames >50ms `0.11%`, over-budget `0.36%`, Combat avg `6.44ms`, AI avg
`4.41ms`, billboard/render avg `2.00ms`, draw-call avg `227.65`, visible
weapon draw-call-like `16`, visible close-NPC GLB draw-call-like `112`, visible
NPC impostor instances `95`, close-model pool-empty warnings `0`, AI
starvation avg `2.65`, heap end-growth `25.28MB`, heap peak-growth `61.13MB`,
and heap recovery `58.7%`. STABILIZAT-1 remains blocked because only the heap
recovery criterion passes; avg frame, p99, and heap end-growth still miss the
codex baseline thresholds. No `perf-baselines.json` refresh is authorized.

The next standard DEFEKT-3 repeatability pass at
`artifacts/perf/2026-05-07T05-10-12-139Z/projekt-143-repeatability-check/summary.json`
keeps measurement trust PASS but fails validation on heap recovery. It records
avg frame `19.27ms`, peak p99 `36.70ms`, frames >50ms `0.06%`, over-budget
`0.33%`, Combat avg `5.55ms`, AI avg `3.52ms`, billboard/render avg `1.99ms`,
draw-call avg `241.24`, visible weapon draw-call-like `16`, visible close-NPC
GLB draw-call-like `112`, visible NPC impostor instances `93`, heap end-growth
`40.45MB`, heap peak-growth `47.49MB`, and heap recovery `14.8%`. The current
blocker is no longer close-render dominance alone. STABILIZAT-1 remains blocked
by repeatable avg-frame, p99, heap-recovery, and heap-end-growth misses.

The current close-model-disabled DEFEKT-3 diagnostic at
`artifacts/perf/2026-05-07T05-19-21-519Z/projekt-143-heap-close-model-isolation/summary.json`
narrows the blocker to the close-model resource path on the current harness.
With `perfDisableNpcCloseModels=1`, validation is WARN, measurement trust is
PASS, avg frame is `14.21ms`, peak p99 is `33.40ms`, heap end-growth is
`-14.97MB`, heap recovery is `155.7%`, Combat avg is `4.00ms`, AI avg is
`3.50ms`, and billboard/render avg is `0.46ms`. The diagnostic is not baseline
evidence because close GLB actors are removed. It shows that the production
close-model path is the active STABILIZAT-1 blocker: production repeat texture
count moved `199 -> 309` and geometry count `238 -> 272`; close-model isolation
moved texture count only `52 -> 54` and geometry count `203 -> 231`.

The accepted production DEFEKT-3 close-model pool-bound remediation at
`artifacts/perf/2026-05-07T05-26-55-636Z/projekt-143-close-model-pool-bound/summary.json`
keeps close GLB actors enabled while bounding resource growth. Active close GLB
actors now cap at `8`; the per-faction pool cap is coupled to that active cap;
initial per-faction pool seed is `4`; top-up batch is `2`. The standard
`npm run perf:capture:combat120` command records validation WARN with
measurement trust PASS: avg frame `17.50ms`, peak p99 `34.20ms`, frames >50ms
`0.02%`, over-budget `0.15%`, heap end-growth `4.64MB`, heap peak-growth
`37.43MB`, heap recovery `87.6%`, texture count `137 -> 165`, geometry count
`234 -> 267`, visible weapon draw-call-like `8`, visible close-NPC GLB
draw-call-like `56`, and visible NPC impostor instances `105`. The follow-up
scheduler trim artifact `artifacts/perf/2026-05-07T05-30-03-496Z` was rejected
and reverted because avg frame and heap recovery worsened. STABILIZAT-1 remains
open because avg frame still misses the `<=17ms` criterion by `0.50ms`, and the
lower close-actor cap still requires visual acceptance.

The follow-up STABILIZAT-1 pool-bound repeatability capture at
`artifacts/perf/2026-05-07T05-38-56-942Z/projekt-143-pool-bound-repeatability/summary.json`
keeps the same production close-actor contract and remains measurement-trusted.
It records validation WARN, avg frame `17.36ms`, peak p99 `34.50ms`, frames
>50ms `0.06%`, over-budget `0.28%`, heap end-growth `13.94MB`, heap
peak-growth `47.37MB`, heap recovery `70.6%`, texture count `136 -> 166`,
geometry count `218 -> 256`, visible weapon draw-call-like `8`, visible
close-NPC GLB draw-call-like `56`, and visible NPC impostor instances `103`.
This capture improves the average-frame miss but blocks baseline refresh
because it still misses avg `<=17ms` by `0.36ms` and heap end-growth `<=10MB`
by `3.94MB`.

The residual DEFEKT-3 heap diagnostic at
`artifacts/perf/2026-05-07T05-47-22-079Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
consumes the trusted pool-bound repeatability capture and classifies the heap
shape as `transient_gc_wave` from short-lived runtime allocations after renderer
resources stabilized. It records peak heap `131.74MB`, end heap `98.31MB`,
reclaimed ratio `0.776`, renderer texture delta `+30` start-to-peak and `+0`
peak-to-end, renderer geometry delta `+32` start-to-peak and `+6`
peak-to-end, `343` terrain-stall backtracking console signals, `19` AI-budget
warnings, and `15` system-budget warnings. This is attribution evidence only:
it does not prove a heap fix, does not refresh baselines, and does not certify
the lower close-actor visual contract.

The current DEFEKT-3 terrain-stall warning-bound packet at
`artifacts/perf/2026-05-07T05-54-31-155Z/projekt-143-stuck-warning-bound/summary.json`
records a callsite rate limiter for terrain-stall recovery warnings before
per-NPC message formatting. The standard `npm run perf:capture:combat120`
artifact at `artifacts/perf/2026-05-07T05-54-31-155Z` remains
measurement-trusted but fails validation: avg frame `17.85ms`, peak p99
`78.10ms`, frames >50ms `0.06%`, over-budget `0.34%`, heap end-growth
`16.26MB`, heap peak-growth `38.15MB`, and heap recovery `57.4%`. Console
terrain-stall backtracking signals drop from `343` to `21`, with `20`
suppression summaries proving the limiter activated. STABILIZAT-1 remains open:
this reduces warning churn only and does not authorize a `perf-baselines.json`
refresh.

The current DEFEKT-3 heap-sampling attribution packet at
`artifacts/perf/2026-05-07T06-18-22-151Z/projekt-143-heap-sampling-attribution/summary.json`
consumes the dev-shape deep-CDP combat120 capture
`artifacts/perf/2026-05-07T06-13-38-855Z`. The capture is measurement-trusted
but fails validation under profiler overhead: avg frame `21.42ms`, peak p99
`85.70ms`, heap end-growth `1.02MB`, heap peak-growth `42.49MB`, and heap
recovery `97.6%`. Its `heap-sampling.json` records `132238` allocation samples
and `4275.84MB` sampled self-size allocation volume. The top categories are
`three_renderer_math_and_skinning` (`53.08%`), `terrain_height_sampling`
(`10.15%`), `browser_or_unknown` (`10.00%`),
`native_array_string_or_eval_churn` (`8.91%`),
`combatant_renderer_runtime` (`6.30%`), and
`combat_movement_terrain_queries` (`4.14%`). Top source URL owners are
`three.module`, native churn, `CombatantRenderer.ts`,
`GameplaySurfaceSampling.ts`, `CombatantMovement.ts`, `HeightQueryCache.ts`,
and `InfluenceMapComputations.ts`. This is attribution evidence only; it does
not prove a heap fix or authorize baseline refresh.

The current DEFEKT-3 close-model material-state bound stops steady close GLB
opacity updates from forcing `material.needsUpdate` every frame. The next
standard combat120 artifact at `artifacts/perf/2026-05-07T06-24-48-025Z`
records validation PASS and measurement trust PASS: avg frame `16.99ms`, peak
p99 `34.30ms`, frames >50ms `0.11%`, over-budget `0.33%`, heap end-growth
`16.26MB`, heap peak-growth `44.23MB`, and heap recovery `63.2%`. This meets
the codex avg-frame, p99, and heap-recovery thresholds, but it still misses the
codex heap end-growth threshold `<=10MB`. The sidecar at
`artifacts/perf/2026-05-07T06-27-39-705Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
classifies the remaining heap as `retained_or_unrecovered_peak`. `perf:compare -- --scenario combat120` now reaches the correct capture after filtering
non-capture artifact folders, but still fails release comparison with `6 pass,
1 warn, 1 fail`; the fail is `maxFrameMs` at `100.00ms`. No
`perf-baselines.json` refresh is authorized.

The latest DEFEKT-3 WebGL-attributed repeat capture at
`artifacts/perf/2026-05-07T06-36-34-481Z` records validation WARN and
measurement trust PASS: avg frame `17.15ms`, peak p99 `34.20ms`, frames >50ms
`0.08%`, heap end-growth `-19.39MB`, heap peak-growth `22.89MB`, heap recovery
`184.7%`, and peak max-frame `100.00ms`. The heap sidecar at
`artifacts/perf/2026-05-07T06-39-17-152Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
classifies the heap shape as `transient_gc_wave`. The max-frame sidecar at
`artifacts/perf/2026-05-07T06-41-29-405Z/projekt-143-maxframe-diagnostic/maxframe-diagnostic.json`
classifies the first max-frame event as
`longtask_without_webgl_upload_or_system-timing_owner`: first peak sample index
`5`, long task `167ms`, long-animation-frame `169.7ms`, WebGL texture upload
max `0.1ms`, and max observed system timing `9.2ms`. The latest
`perf:compare -- --scenario combat120` result is `6 pass, 0 warn, 2 fail`;
failures are `avgFrameMs` at `17.15ms` and `maxFrameMs` at `100.00ms`.
Baseline refresh remains blocked.

The follow-up DEFEKT-3 deep-CDP attribution packet at
`artifacts/perf/2026-05-07T06-46-38-609Z` is diagnostic evidence only. The
capture writes `cpu-profile.cpuprofile` and `heap-sampling.json`; `chrome-trace.json`
did not write because trace shutdown timed out. The capture remains
measurement-trusted but fails validation under profiler overhead: avg frame
`22.49ms`, peak p99 `79.80ms`, heap end-growth `6.60MB`, heap recovery
`87.5%`, and peak max-frame `100.00ms`. The production heap sidecar at
`artifacts/perf/2026-05-07T06-50-10-651Z/projekt-143-heap-sampling-attribution/summary.json`
records `205766` allocation samples and `6660.98MB` sampled self-size volume;
top categories are `three_renderer_math_and_skinning`, `gameplay_bundle_other`,
`browser_or_unknown`, and `native_array_string_or_eval_churn`. The production
CPU sidecar at
`artifacts/perf/2026-05-07T06-52-40-345Z/projekt-143-cpu-profile-attribution/cpu-profile-attribution.json`
records five long-task samples and six >50ms hitch events; top CPU categories
are `three_matrix_skinning_and_scenegraph` (`67.60%`),
`gameplay_bundle_other` (`6.70%`), `system_update_timing` (`5.63%`), and
`terrain_height_sampling` (`3.30%`). The source-shaped CPU sidecar at
`artifacts/perf/2026-05-07T06-52-40-297Z/projekt-143-cpu-profile-attribution/cpu-profile-attribution.json`
maps the same work class to source owners led by Three scenegraph/render-program
work, then `CombatantRenderer.ts`, `CombatantMovement.ts`,
`CombatantLODManager.ts`, `HeightQueryCache.ts`, and
`GameplaySurfaceSampling.ts`. Baseline refresh remains blocked; the next
accepted action is narrow source instrumentation or targeted owner work, not
another broad cap. `perf:compare -- --scenario combat120` now excludes failed
diagnostic captures before selecting the latest successful capture, so it again
compares `artifacts/perf/2026-05-07T06-36-34-481Z` and reports `6 pass, 0
warn, 2 fail`.

The latest DEFEKT-3 close-model overflow-bound packet at
`artifacts/perf/2026-05-07T07-00-28-388Z/projekt-143-close-model-overflow-bound/summary.json`
adds a per-update overflow-report guard in `CombatantRenderer` and verifies the
bound with `CombatantRenderer.test.ts`. The standard combat120 artifact
`artifacts/perf/2026-05-07T07-00-28-388Z` remains production-shaped with close
GLB actors enabled and records validation WARN with measurement trust PASS: avg
`17.14ms`, peak p99 `34.50ms`, frames >50ms `0.06%`, over-budget `0.51%`, heap
end-growth `-5.08MB`, heap peak-growth `29.85MB`, heap recovery `117.0%`,
visible close-NPC GLB draw-call-like `56`, visible weapon draw-call-like `8`,
visible NPC impostor instances `106`, textures `137 -> 166`, and geometries
`224 -> 257`. `npm run perf:compare -- --scenario combat120` auto-selects this
artifact and fails with `6 pass, 0 warn, 2 fail`: `avgFrameMs` is `17.14ms` and
`maxFrameMs` is `100.00ms`. STABILIZAT-1 remains blocked; no baseline refresh is
authorized.

The prior DEFEKT-3 post-distribution max-frame attribution sidecar at
`artifacts/perf/2026-05-07T09-41-19-775Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
consumes the latest status-ok combat120 capture after the target-distribution
stability-bound change. The source artifact records validation WARN and
measurement trust PASS: avg `15.47ms`, peak p99 `34.30ms`, max-frame
`100.00ms`, heap end-growth `-2.30MB`, heap recovery `106.4%`, and AI budget
starvation `0.98` PASS. The first peak is sample index `5`: runtime frame-event
frame `392` at `100ms`, long task `127ms`, long-animation-frame `126.7ms`,
blocking `76.73ms`, WebGL texture-upload max `17.9ms`, and top user timing
`SystemUpdater.Combat` at `7.8ms`. The sidecar classifies the event as
`mixed_or_insufficient_attribution` with low confidence.
`perf:compare -- --scenario combat120` remains red with `6 pass, 1 warn, 1
fail`; `avgFrameMs` is WARN and `maxFrameMs` remains the failing comparison
gate. This is diagnostic evidence only; it does not refresh baselines.

The prior DEFEKT-3 focused max-frame trace probe at
`artifacts/perf/2026-05-07T10-02-39-414Z/projekt-143-max-frame-trace-probe/trace-probe.json`
uses the new opt-in `perf-capture.ts` trace window flags
`--trace-window-start-ms` and `--trace-window-duration-ms`. It records a focused
Chrome trace window after the status-ok attribution packet, but the capture is
diagnostic-only: validation FAIL, measurement trust FAIL, probe average
`1388.82ms`, probe p95 `1549.00ms`, avg frame `100.00ms`, and frames >50ms
`100%`. The packet still advances ownership evidence because it writes
`chrome-trace.json` (`5739628` bytes, `24539` events, `9994.77ms` span), CPU
profile, and heap sampling. The sidecar classifies the trace as
`trace_captured_under_untrusted_deep_cdp_gpu_commit_stalls` with low confidence:
longest trace event `RunTask` `2544.94ms`, GPU-like max `2517.15ms`,
render/commit-like max `2513.04ms`, GC-like count `76`, and GC-like max
`0.90ms`. This separates GC from the observed trace-window stall class but does
not prove a production owner or authorize baseline refresh.

The prior DEFEKT-3 production-shaped trace-overhead isolation packet at
`artifacts/perf/2026-05-07T10-32-39-527Z/projekt-143-trace-overhead-isolation/isolation.json`
supersedes the short/headless diagnostic chain. The headed combat120 trace-only
capture at `artifacts/perf/2026-05-07T10-32-39-527Z` uses seed `2718`, starts
the trace window at capture-window zero, suppresses CPU profile and heap
sampling, and writes `chrome-trace.json` (`149320928` bytes, `704069` events,
`12323.96ms` span). Measurement trust PASSES with probe avg `19.39ms`, p95
`29.00ms`, and missed samples `0.0%`; runtime validation still FAILS on
`9.25s` frame-progression stall and `60.00ms` peak p99. The max-frame trace
sidecar records the first `100ms` max frame event at frame `22`, page time
`24141.6ms`, and classifies `focused_trace_only_measurement_trusted` with medium
confidence: longest trace event `RunTask` `163.26ms`, GPU-like max `52.85ms`,
render/commit-like max `1.01ms`, and GC-like max `9.39ms`. The isolation packet
compares against the trusted non-trace control
`artifacts/perf/2026-05-07T09-41-19-775Z` and classifies
`trace_collection_overhead_not_detected` with medium confidence; probe deltas
are avg `+1.46ms` and p95 `+2.00ms`. This keeps Chrome trace collection out of
the measured overhead-owner path, but it does not fix the runtime stall or
authorize a baseline refresh.

The prior DEFEKT-3 trace-boundary attribution packet at
`artifacts/perf/2026-05-07T10-32-39-527Z/projekt-143-trace-boundary-attribution/boundary-attribution.json`
consumes the same production-shaped trace-only headed combat120 artifact and
classifies `runtime_combat_spike_plus_late_raf_gpu_clusters` with medium
confidence. Runtime evidence reports `6` unique frames at or above `50ms`: the
first boundary is frame `5` at page time `23745.9ms` for `60ms`, the max boundary
is frame `22` at `100ms`, and the same observer window records
`SystemUpdater.Combat` max `136.4ms`. Console evidence records `[AI spike]`
`133.1ms` for `combatant_12` in `patrolling` state, squad `squad_NVA_3`, target
`none`, followed by a `138.0ms` slow frame attributed to `Combat(136.4ms)`.
Chrome trace evidence records renderer-main `FunctionCall` `161.84ms` at
`index-DgRsSaJr.js:1736:12289`, GPU command-buffer
`ThreadControllerImpl::RunTask` `52.86ms`, and trace-start
`CpuProfiler::StartProfiling` `131.33ms` isolated as trace-internal. This is
owner-review evidence only: it separates the first game-side combat spike from
late RAF/GPU clusters, but it does not resolve the TypeScript callsite, prove a
runtime fix, or authorize baseline refresh.

The prior DEFEKT-3 bundle-callsite resolution packet at
`artifacts/perf/2026-05-07T10-58-00-876Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
consumes the trace-boundary packet and resolves the renderer-main
`FunctionCall` source `index-DgRsSaJr.js:1736:12289` to the
`GameEngineLoop.animate` / `RenderMain` boundary. Vite sourcemaps are disabled
(`sourcemap: false`), the perf bundle has no `sourceMappingURL`, and no
adjacent `.map` file exists. Static resolution still matches
`dist-perf/build-assets/index-DgRsSaJr.js` (`1002733` bytes), finds `8/11`
readable minified-loop markers in the callsite window, and scores
`src/core/GameEngineLoop.ts` at `11/11` source anchors. This proves the late
renderer-main trace cluster is the main-loop render boundary, not a direct
Combat AI method location. The first game-side Combat spike still requires
source-level timing around the patrolling/high-LOD CombatantAI path before any
behavior change or baseline refresh.

The prior DEFEKT-3 AI method-attribution packet at
`artifacts/perf/2026-05-07T11-09-31-428Z/projekt-143-ai-method-attribution/ai-method-attribution.json`
consumes a fresh headed standard combat120 capture with status `ok`, validation
WARN, and measurement trust PASS. Runtime samples number `88`; `82` carry
`combatBreakdown.aiMethodMs` and `16` carry `combatBreakdown.aiSlowestUpdate`.
The frame-event ring reports `3` unique frames at or above `50ms`: first
boundary frame `246` at `81.8ms` and max boundary frame `523` at `100ms`. The
max boundary leaders are `SystemUpdater.Combat:7.2ms`,
`SystemUpdater.Other:0.8ms`, and AI methods `state.alert:0.1ms`,
`state.engaging:0.1ms`. Aggregate method leaders are `state.engaging:44.7ms`,
`state.patrolling:32.7ms`, `patrol.canSeeTarget:25.6ms`, and
`patrol.findNearestEnemy:6.1ms`; the slowest sampled update is `9.4ms` in
`state.engaging`. No console `[AI spike]` line reproduces in the standard
capture. `perf:compare -- --scenario combat120` still reports `6 pass, 1 warn,
1 fail`: avg frame `15.23ms` is WARN and `maxFrameMs` `100.00ms` is FAIL.
Baseline refresh remains blocked.

The prior DEFEKT-3 browser-boundary attribution packet at
`artifacts/perf/2026-05-07T11-09-31-428Z/projekt-143-browser-boundary-attribution/browser-boundary-attribution.json`
consumes the same status-ok, measurement-trusted combat120 artifact and
classifies the residual max-frame blocker as
`browser_longtask_loaf_without_instrumented_system_ai_or_webgl_owner` with high
confidence. The runtime boundary ring records `3` unique frames at or above
`50ms`; max boundary frame `523` records `100ms`, long task `177ms`,
long-animation-frame `177.4ms`, blocking `127.28ms`, WebGL upload `0.1ms`,
top user timing `SystemUpdater.Combat:7.2ms`, and AI method leaders
`state.alert:0.1ms` and `state.engaging:0.1ms`. Console counts are `[AI spike]`
`0`, AI-budget warnings `18`, slow frames `6`, system-budget warnings `11`,
and terrain-stall signals `21`. The packet is diagnostic-only: it blocks AI
behavior tuning for this max-frame failure and sends the next accepted proof to
focused browser/native render-present or main-thread task-slice attribution.

The prior DEFEKT-3 corrected trace-category packet at
`artifacts/perf/2026-05-07T11-32-00-011Z/projekt-143-max-frame-trace-probe/trace-probe.json`
follows the pre-fix focused trace-only capture at
`artifacts/perf/2026-05-07T11-28-18-728Z`, where the trace still recorded
`CpuProfiler::StartProfiling` at `144.45ms` even though CPU profiling and heap
sampling were disabled. `perf-capture.ts` now keeps
`disabled-by-default-v8.cpu_profiler` out of focused trace-only captures unless
`--cdp-profiler` is enabled. The corrected capture is measurement-trusted but
validation-failed: avg `17.03ms`, peak p99 `65.50ms`, max-frame `100ms`, heap
end-growth `2.67MB`, and heap recovery `92.6%`. It writes `46999648` trace
bytes across `216933` events, records longest trace event `RunTask` at
`29.8ms`, GC-like max `10.28ms`, GPU-like max `3.02ms`, and no long
trace-start instrumentation event. The paired trace-boundary sidecar at
`artifacts/perf/2026-05-07T11-32-00-011Z/projekt-143-trace-boundary-attribution/boundary-attribution.json`
classifies `trace_boundary_owner_unresolved`; it records `4` runtime frames at
or above `50ms`, no console combat-AI spike at or above `50ms`, no renderer-main
RAF/FunctionCall boundary above `50ms`, and no GPU command-buffer boundary
above `40ms`. This is owner-review evidence only and does not authorize
baseline refresh. `perf:compare -- --scenario combat120` currently selects the
latest status-ok capture at `artifacts/perf/2026-05-07T11-28-18-728Z` and
fails with `5 pass, 1 warn, 2 fail`: avg `16.43ms` WARN, p99 `46.00ms` FAIL,
and max-frame `100.00ms` FAIL.

The prior DEFEKT-3 bundle-callsite resolution packet at
`artifacts/perf/2026-05-07T11-45-11-238Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
consumes the corrected trace-boundary packet and resolves the source-bearing
renderer-main `FunctionCall` from `rendererMainTop`, not the obsolete
`rendererMainLongOver50Ms` threshold. It parses `index-BsYYgvZn.js:1736:12289`,
matches `dist-perf/build-assets/index-BsYYgvZn.js` (`1005347` bytes), records
Vite `sourcemap: false`, no `sourceMappingURL`, and no adjacent `.map` file.
Static anchor scoring maps the bundle window to `src/core/GameEngineLoop.ts`
with `11/11` loop anchors and classifies
`bundle_callsite_resolved_to_game_engine_loop_render_boundary` with medium
confidence. This packet resolves the renderer-main bundle owner to the
`GameEngineLoop` / `RenderMain` boundary; it does not assign the remaining
runtime Combat timing to a specific Combat AI TypeScript callsite.

The prior DEFEKT-3 repeatability/max-frame packet at
`artifacts/perf/2026-05-07T14-29-53-738Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
consumes the measurement-trusted combat120 repeatability capture at
`artifacts/perf/2026-05-07T14-29-53-738Z` plus avg-frame, combat-phase,
suppression cover-cache, and suppression raycast-cost sidecars. The source
capture is status-ok, validation-WARN, and measurement-trusted, with avg
`15.14ms`, peak p99 `33.90ms`, max-frame `100.00ms`, frames >50ms `0.03%`,
over-budget `0.04%`, heap end-growth `12.61MB`, heap peak-growth `55.18MB`,
and heap recovery `77.2%`. `perf:compare -- --scenario combat120` selects this
repeatability capture and fails with `6 pass, 1 warn, 1 fail`: avg `15.14ms`
WARN and max-frame `100.00ms` FAIL. The score-gate sidecar still classifies
`suppression_raycast_score_gate_reduces_raycastTerrain_under_two_search_cap`
with high confidence and records `52` suppression cover searches, `51` uncached
searches, `1224` height queries, `404` score-gate skips, `100` terrain
raycasts, and raycasts per uncached search moving `7.51 -> 1.961` against the
prior cost packet. The max-frame sidecar classifies
`browser_native_gc_or_uninstrumented_render_present` with high confidence:
first peak sample index `7`, runtime frame event `509` at `100ms`, long task
`286ms`, long-animation-frame `290.5ms`, blocking `236.08ms`, WebGL upload max
`0.1ms`, and top user timing `SystemUpdater.Combat` at `7.8ms`. Baseline
refresh remains blocked.

The prior DEFEKT-3 focused trace-boundary packet at
`artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-trace-boundary-attribution/boundary-attribution.json`
consumes the headed combat120 trace-only capture at
`artifacts/perf/2026-05-07T14-38-32-797Z`, the max-frame trace probe, and the
trace-overhead isolation sidecar. The capture is status-ok, validation-WARN,
and measurement-trusted, with avg `15.52ms`, peak p99 `47.60ms`, max-frame
`100.00ms`, `81` runtime samples, and `5825` final frames.
`perf:compare -- --scenario combat120` now selects this status-ok trace packet and fails with
`5 pass, 1 warn, 2 fail`: avg `15.52ms` WARN, p99 `47.60ms` FAIL, and
max-frame `100.00ms` FAIL. The trace probe classifies
`focused_trace_only_measurement_trusted`: `121935286` Chrome trace bytes,
`564184` trace events, `12336.68ms` trace span, first >50ms runtime frame `5`
at `63ms`, max runtime frame `494` at `100ms`, longest trace event `RunTask`
`31.53ms`, GPU-like max `4.09ms`, render/commit-like max `0.58ms`, and
GC-like max `10.72ms`. The isolation sidecar compares against the non-trace
control `artifacts/perf/2026-05-07T14-29-53-738Z`, records probe avg/p95
deltas `0.86ms/2.00ms`, and classifies
`trace_collection_overhead_not_detected`. Boundary attribution remains
`trace_boundary_owner_unresolved`: no >=50ms renderer-main RAF/FunctionCall
slice, no >=40ms GPU command-buffer slice, and no exact clock identity between
runtime frame events and Chrome trace relative times. Baseline refresh remains
blocked.

The prior DEFEKT-3 bundle-callsite resolution packet at
`artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
consumes the same trace-boundary packet and resolves the source-bearing
renderer-main `FunctionCall`. It parses
`index-BLeRv-jb.js:1736:12289`, matches
`dist-perf/build-assets/index-BLeRv-jb.js` (`1011535` bytes), records Vite
`sourcemap: false`, no `sourceMappingURL`, no adjacent `.map` file, and
`8/11` readable minified-loop markers. Static anchor scoring maps the bundle
window to `src/core/GameEngineLoop.ts` with `11/11` source anchors and
classifies `bundle_callsite_resolved_to_game_engine_loop_render_boundary` with
medium confidence. This packet resolves the traced renderer-main boundary to
`GameEngineLoop` / `RenderMain`; it does not assign the remaining runtime
Combat timing to a Combat AI TypeScript callsite, prove a runtime fix, or
authorize baseline refresh.

The current DEFEKT-3 render-boundary timing packet at
`artifacts/perf/2026-05-07T14-53-44-437Z/projekt-143-render-boundary-timing/render-boundary-timing.json`
consumes the standard headed combat120 capture at
`artifacts/perf/2026-05-07T14-53-44-437Z` plus the prior callsite packet. The
capture is status-ok, validation-WARN, and measurement-trusted with `88`
runtime samples, avg `16.82ms`, peak p99 `34.50ms`, max-frame `100.00ms`, heap
end-growth `10.99MB`, and heap recovery `62.5%`. `perf:compare -- --scenario
combat120` selects this capture and fails with `6 pass, 1 warn, 1 fail`: avg
WARN and max-frame FAIL. The peak sample records runtime frame `37` at `100ms`,
long task `120ms`, long-animation-frame `121.20ms`, blocking `71.12ms`, WebGL
upload max `0.10ms`, and peak-sample `GameEngineLoop.RenderMain.renderer.render`
max `116.10ms`. Cumulative `renderer.render` timing records count `5391`,
total `53128.10ms`, mean `9.855ms`, and max `308.90ms`. The packet classifies
`render_main_renderer_render_user_timing_contains_peak_longtask` with high
confidence. It advances the active owner to the render call boundary; it does
not prove a runtime fix or authorize baseline refresh.

The current DEFEKT-3 avg-frame attribution sidecar at
`artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-avg-frame-attribution/avg-frame-attribution.json`
uses the same rebuilt trusted standard capture and classifies the residual avg
warning as `late_combat_phase_cpu_pressure_not_renderer_or_terrain_stream_growth`.
Average frame time rises `13.15ms -> 18.44ms` from early to late capture windows
while draw calls fall `212.83 -> 191.63`, Combat total rises `4.60ms -> 5.94ms`,
AI rises `3.42ms -> 4.51ms`, shots rise `0 -> 435`, and terrain stream max
stays `0.04ms`. The next DEFEKT-3 work should target late engagement-phase
Combat CPU pressure before visual caps or baseline refresh.

The current DEFEKT-3 combat-phase attribution sidecar at
`artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-combat-phase-attribution/combat-phase-attribution.json`
uses the same trusted capture and narrows the residual avg-frame owner to
`late_close_engagement_pressure_not_renderer_or_movement_volume`. Average frame
time rises `13.15ms -> 18.44ms`, current target distance falls
`15.49m -> 8.20m`, nearest OPFOR distance falls `14.96m -> 8.18m`, shots
delta rises `0 -> 259`, damage-taken delta rises `317.62 -> 1941.51`, draw
calls fall `212.83 -> 191.63`, and NPC movement sample delta falls
`218826 -> 170988`. The next DEFEKT-3 source action should instrument or target
`AIStateEngage`, `AITargeting` LOS miss paths, and close-contact target
distribution before further visual caps.

The latest DEFEKT-3 close-engagement source audit at
`artifacts/perf/2026-05-07T07-56-12-331Z/projekt-143-close-engagement-source-audit/source-audit.json`
consumes the combat-phase packet and binds the remaining owner path to current
source files. It ranks `AIStateEngage.ts` first for the close-range engage
ladder, `AILineOfSight.ts` second for LOS miss pressure, and
`AITargetAcquisition.ts` plus `ClusterManager.ts` third for close-contact target
distribution. The audit confirms existing tests cover close full-auto behavior,
nearby-enemy burst behavior, suppression transition, LOS heightfield prefilter,
and target distribution primitives, but they do not prove combat120 perf
ownership. The next accepted action is narrow runtime counters for close-range
full-auto activations, nearby-enemy burst triggers, suppression transitions,
target-distance buckets, and LOS miss/full-raycast/cache outcomes.

The prior DEFEKT-3 close-engagement counter-bearing combat120 packet at
`artifacts/perf/2026-05-07T08-18-45-389Z/projekt-143-close-engagement-counter-packet/counter-packet.json`
supersedes the source-only counter packet. The first capture after the counter
plumbing was rejected for this purpose because stale `dist-perf` omitted
`combatBreakdown.closeEngagement`. After `npm run build:perf`, the trusted
capture recorded 88/88 runtime samples with close-engagement counters,
validation WARN, measurement trust PASS, avg `16.38ms`, peak p99 `34.20ms`,
heap end-growth `33.25MB` WARN, heap recovery `30.3%` WARN, and
`perf:compare -- --scenario combat120` FAIL (`5 pass, 2 warn, 1 fail`) on
`maxFrameMs` `100.00ms`. The sidecar records early/middle/late deltas for
close-range full-auto, nearby-enemy burst, suppression, target-distance, LOS
full-evaluation/raycast, target-acquisition, and target-distribution churn.

The current DEFEKT-3 close-engagement owner-attribution packet at
`artifacts/perf/2026-05-07T08-29-10-043Z/projekt-143-close-engagement-owner-attribution/owner-attribution.json`
consumes that counter-bearing capture and ranks late-phase pressure under
`AILineOfSight.ts` first and `ClusterManager.ts` second. Early/middle/late avg
frame is `13.72/16.17/19.15ms`; LOS markers rise `6855 -> 11044`;
target-distribution markers rise `3012 -> 7131`; target-acquisition markers
fall `7710 -> 6408`; engage markers fall `2546 -> 2081`. The classification is
`target_acquisition_distribution_fanout_with_los_execution_cost`. This is owner
evidence only; it does not prove a fix or authorize a baseline refresh.

The current DEFEKT-3 LOS/distribution separation packet at
`artifacts/perf/2026-05-07T08-39-12-950Z/projekt-143-los-distribution-separation/separation.json`
consumes the owner-attribution sidecar and classifies the path as
`coupled_distribution_scheduling_with_separate_los_execution`.
`AITargetAcquisition.ts` and `ClusterManager.ts` have no direct LOS reference;
LOS execution is anchored in `AILineOfSight.ts` and the state-handler
`canSeeTarget` calls. Early/middle/late distribution scheduling deltas are
`3012/4658/7131`; LOS execution deltas are `6855/7889/11044`; late LOS full
evaluations per distribution call are `1.174`; LOS/distribution delta
correlation is `0.871`. This keeps the next action on LOS cadence or a bounded
distribution-stability A/B diagnostic, not baseline refresh.

The DEFEKT-3 target-distribution stability-bound packet at
`artifacts/perf/2026-05-07T09-43-39-502Z/projekt-143-target-distribution-stability-bound/target-distribution-stability-bound.json`
binds the `ClusterManager.ts` source change, targeted ClusterManager/patrol/AI
tests, the follow-up callsite packet, and the post-change status-ok combat120
capture at `artifacts/perf/2026-05-07T09-41-19-775Z`. The source change holds a
still-valid distributed target for `500ms`, preventing per-frame target churn
from invalidating the patrol LOS cadence. Late-window assignment churn moves
`4016 -> 425`, `patrolDetection` calls move `3947 -> 674`, LOS full evaluations
move `5202 -> 1655`, and late-window avg frame moves `19.92ms -> 17.22ms`. The
post-change capture records avg `15.47ms`, peak p99 `34.30ms`, max-frame
`100.00ms`, heap end-growth `-2.30MB`, heap recovery `106.4%`, validation WARN,
and measurement trust PASS. `perf:compare -- --scenario combat120` still reports
`6 pass, 1 warn, 1 fail`: `avgFrameMs` is WARN and `maxFrameMs` remains FAIL.
Baseline refresh remains blocked; the next bounded source target is the residual
engage-suppression callsite or the max-frame path if the Politburo keeps
DEFEKT-3 as driver.

The prior DEFEKT-3 post-distribution max-frame attribution packet at
`artifacts/perf/2026-05-07T09-41-19-775Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
consumes that same status-ok capture and records first peak sample index `5`,
runtime frame-event frame `392` at `100ms`, long task `127ms`,
long-animation-frame `126.7ms`, blocking `76.73ms`, WebGL texture-upload max
`17.9ms` from the NVA `traverse_run` animated albedo atlas, and top user timing
`SystemUpdater.Combat` at `7.8ms`. Classification is
`mixed_or_insufficient_attribution` with low confidence. The next bounded
source target is a focused CDP trace/render-present/GC probe around this
max-frame boundary, not a baseline refresh.

The prior DEFEKT-3 focused max-frame trace probe at
`artifacts/perf/2026-05-07T10-02-39-414Z/projekt-143-max-frame-trace-probe/trace-probe.json`
confirms that the lower-level trace path can now write a focused
`chrome-trace.json`, but it also proves that the present deep-CDP configuration
invalidates regression measurement. Treat the next bounded packet as
measurement-harness refinement: isolate trace collection from full CPU/heap
profiling, or otherwise reduce probe overhead, before making runtime tuning
claims from this trace.

The prior DEFEKT-3 trace-overhead isolation packet at
`artifacts/perf/2026-05-07T10-18-11-490Z/projekt-143-trace-overhead-isolation/isolation.json`
adds `perf-capture.ts` switches `--cdp-profiler <true|false>` and
`--cdp-heap-sampling <true|false>`, then compares a trace-only focused capture
against an identical no-CDP control. The trace-only artifact
`artifacts/perf/2026-05-07T10-18-11-490Z` writes `chrome-trace.json` while
suppressing CPU profile and heap sampling, but validation and measurement trust
still FAIL: probe avg `1704.13ms`, p95 `1829.00ms`, samples `15`, avg frame
`100.00ms`. The no-CDP control
`artifacts/perf/2026-05-07T10-22-24-265Z` also FAILS measurement trust in the
same short/headless seed-42 shape: probe avg `1639.11ms`, p95 `1779.00ms`,
samples `18`, avg frame `100.00ms`. Classification is
`control_capture_shape_untrusted_before_trace` with high confidence. The next
trace packet must align to the production-shaped combat120 command before CDP
trace data can be used as owner proof.

The prior DEFEKT-3 production-shaped trace-overhead isolation packet at
`artifacts/perf/2026-05-07T10-32-39-527Z/projekt-143-trace-overhead-isolation/isolation.json`
uses the headed combat120 command shape, seed `2718`, trace window
`0-12000ms`, and Chrome trace only. The trace capture writes `chrome-trace.json`
(`149320928` bytes, `704069` events, `12323.96ms` span) with CPU profile and
heap sampling suppressed. Measurement trust PASSES with probe avg `19.39ms`,
p95 `29.00ms`, and missed samples `0.0%`; runtime validation FAILS on
`9.25s` frame-progression stall and `60.00ms` peak p99. The sidecar records
the first `100ms` max frame event at frame `22`, page time `24141.6ms`, and
classifies the trace as `focused_trace_only_measurement_trusted` with medium confidence:
longest trace event `RunTask` `163.26ms`, GPU-like max `52.85ms`,
render/commit-like max `1.01ms`, GC-like count `4315`, and GC-like max
`9.39ms`. The isolation sidecar compares the trace packet to the trusted
non-trace control `artifacts/perf/2026-05-07T09-41-19-775Z`, records probe
deltas avg `+1.46ms` and p95 `+2.00ms`, and classifies
`trace_collection_overhead_not_detected` with medium confidence. This packet is
owner-review evidence only; it does not prove a runtime fix, does not refresh
baselines, and leaves `maxFrameMs` as the active STABILIZAT-1 blocker.

## Stable-Ground Snapshot On 2026-05-02

- Latest pushed repo state before the 24-hour handoff report:
  `master` and `origin/master` are aligned at
  `356bc2e418af2f2f9aa8109dcf29a5ad7e291924`, and GitHub CI run
  `25353544629` passed on that SHA. Live Pages remains behind by design:
  `/asset-manifest.json` reports
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`. No production parity is claimed
  for the latest repo state until the manual deploy path and live header/smoke
  checks are run.
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
  proof path; the committed-sha LOD-edge artifact passes with `0/40` flags.
  The current local KB-OPTIK packet is owner-accepted with caution at
  `artifacts/perf/2026-05-05T23-13-35-420Z/projekt-143-optik-human-review/review-summary.json`;
  future downward-facing or brightness polish needs a fresh proof-gated pass
  rather than retuning the accepted state opportunistically.
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
  A local 2026-05-06 foundation follow-up expands circular terrain
  stamps to cover their authored surface radius, adds a graded helipad
  shoulder, routes generated airfield structures through the footprint solver,
  and widens large static-prop flat-search. The rebuilt review packet
  `artifacts/perf/2026-05-06T12-50-19-106Z/projekt-143-terrain-visual-review/visual-review.json`
  is PASS for `14` Open Frontier/A Shau screenshots including airfield,
  parking, and support-foundation views. The matching placement audit was
  tightened after visual review to warn on large native relief under otherwise
  flat stamped pads. Open Frontier `supply_depot_main` / `zone_depot` was moved
  from `(-800,-200)` to `(-820,-160)`, clearing Open Frontier's
  foundation-native-relief warning. A later follow-up moved the remaining TDM
  and Zone Control seed-variant pads away from high native relief. A later audit
  fix found generated airfield placements were sampled with `world.z` from a
  `THREE.Vector2`, so large building/vehicle/aircraft placements were
  effectively reporting zero native relief. The latest placement artifact
  `artifacts/perf/2026-05-06T17-11-14-436Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  is WARN with `fail=0` / `warn=2`: Open Frontier `airfield_main` has `9`
  generated placements over the native-relief review threshold, worst
  `parking_0` A-1 at `32.03m` source span, and A Shau `tabat_airstrip` still
  flags the A-1 parking placement at `8.54m` source span. This is not final
  KB-TERRAIN acceptance: generated airfield foundations remain a visual blocker,
  matched perf and owner art review are still open, Pixel Forge upgraded
  building/vehicle GLBs have not been imported, and future vehicle-driving
  surfaces are not certified. The
  refreshed terrain asset inventory at
  `artifacts/perf/2026-05-06T13-16-02-955Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
  adds GLB metadata for the Pixel Forge replacement path: `12` building
  candidates total `5,704` triangles, runtime structure/foundation models total
  `7,528` triangles, and `30` static entries need medium/high optimization
  review mostly for mesh/material/primitive fragmentation. It also catalogs the
  sibling Pixel Forge gallery as `19` building GLBs totaling `18,338` triangles
  and `5` ground-vehicle GLBs totaling `5,272` triangles for future
  side-by-side replacement and driving-surface review. The structure review at
  `artifacts/perf/2026-05-06T16-45-59-860Z/projekt-143-pixel-forge-structure-review/structure-review.json`
  adds a source-gallery contact sheet and now finds `19/19` building review
  grids plus `5/5` current ground-vehicle review grids. The vehicle grids are
  TIJ-generated artifacts from current Pixel Forge GLBs and did not mutate
  Pixel Forge `war-assets`; vehicle-driving candidates still need
  wheel/contact/pivot, collision-proxy, and terrain-surface checks before any
  runtime import.
  The 2026-05-05 owner vegetation target changes the palm direction: remove
  the short Quaternius palm from runtime and shipped assets, preserve the
  taller palm-like trees, and spend that freed visual/perf budget on grass or
  other ground-cover assets.
  The visually confirmed short palm is the misleadingly named `giantPalm` /
  `palm-quaternius-2` package, not the taller `fanPalm` or `coconut`
  palm-like trees. Local runtime config now removes `giantPalm`, removes its
  public shipped assets, preserves `fanPalm` and `coconut`, and reallocates the
  biome slot toward `fern` and `elephantEar` ground cover. Earlier local
  vegetation work enlarged/lifted `fern` and made `bambooGrove` use a
  large-scale cluster mask. Its latest static distribution artifact before the
  removal is
  `artifacts/perf/2026-05-04T02-41-29-573Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  post-removal validation records `6` runtime vegetation species, `1` retired
  species, `6` blocked species, and `0` missing assets at
  `artifacts/perf/2026-05-05T03-23-29-111Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`.
  `npm run validate:fast` and `npm run build` pass after the removal, and the
  latest Projekt evidence suite passes at
  `artifacts/perf/2026-05-05T03-24-06-823Z/projekt-143-evidence-suite/suite-summary.json`.
  The latest elevated screenshot proof is
  `artifacts/perf/2026-05-04T02-41-37-056Z/projekt-143-terrain-horizon-baseline/summary.json`.
  Open Frontier after evidence at
  `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json` is measurement-trusted
  but still WARN. A Shau is explicitly blocked: after evidence at
  `artifacts/perf/2026-05-04T02-48-58-787Z/summary.json` failed validation,
  and rerun `artifacts/perf/2026-05-04T02-53-54-886Z/summary.json` also
  failed. Both runs still expose the steep `tabat_airstrip` footprint warning,
  so A Shau foundation/route/preset quality remains part of the current
  terrain problem.
  Follow-up placement work moved the Ta Bat preset onto flatter terrain, and
  follow-up route work changed A Shau `terrainFlow` from map-only overlays to
  full stamped `jungle_trail` corridors. The route audit at
  `artifacts/perf/2026-05-04T12-58-03-421Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
  passes with `12` A Shau routes, `52,504m` of route length, `1,321` capsule
  stamps, and `14` surface patches. The paired A Shau capture
  `artifacts/perf/2026-05-04T13-03-02-238Z/summary.json` is measurement-trusted
  and improves active-player coverage (`170` shots, `59` hits, `57` movement
  transitions), but it fails validation on heap end-growth/recovery and still
  logs terrain-stall warnings. This is route-policy progress, not A Shau
  runtime acceptance.
  A current-worktree rerun at
  `artifacts/perf/2026-05-05T02-41-21-751Z/summary.json` clears the hard heap
  failure (`heap_growth_mb=-61.58`, peak growth `16.64MB`, recovery PASS) and
  keeps movement/hit guardrails green, but it still logs NPC terrain-stall
  backtracking and remains WARN on peak p99. A later endpoint inset follow-up
  moves non-home objective routes inside capture footprints and passes route
  audit at
  `artifacts/perf/2026-05-06T17-00-32-294Z/projekt-143-terrain-route-audit/terrain-route-audit.json`;
  the paired A Shau capture
  `artifacts/perf/2026-05-05T23-32-48-770Z/summary.json` improves waypoint
  replans `81 -> 40` and waypoints followed `249 -> 317` versus the previous
  current-worktree run, but still warns on p99/heap growth and logs `42`
  terrain-stall warnings. This is stronger A Shau evidence, not final route/nav
  acceptance.
  Current local follow-up keeps rock as a reduced moss-tinted cliff accent
  rather than a broad grey elevation cap, and it fixes a player-camera terrain
  clipping failure mode where the grounded rise clamp could leave the camera
  inside a sudden hillside lip. `PlayerMovement` now rejects true multi-meter
  cliff jumps while allowing smaller stamped/noisy terrain lips that previously
  produced false movement stalls. Commit `e92523a` partially closes the
  navigation invalidation gap:
  registered pre-baked variants now have `public/data/navmesh/bake-manifest.json`
  signatures, `scripts/prebake-navmesh.ts` regenerates when those signatures
  are stale, runtime solo-navmesh cache keys include terrain/feature
  fingerprints, and bake/runtime obstacle generation now uses collidable
  runtime placements rather than trafficable feature envelopes. This is not
  A Shau navigation acceptance. Open Frontier non-default seeds remain
  withheld until per-seed feature presets exist. The current working tree
  clears the Zone Control seed `137` placement-audit warnings at
  `artifacts/perf/2026-05-05T02-39-51-929Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
  A Shau still needs route/nav quality plus terrain-stall proof.
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
  `a7b71f1e9af61e2f89bb0adefae5121891896f62`; `npm ci`, its `check` script,
  and its `smoke:browser` script passed on 2026-05-02.
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
  distribution if green appears mostly on hillsides, remove the short
  Quaternius palm (`giantPalm` / `palm-quaternius-2`) from runtime and shipped
  assets, preserve the taller `fanPalm` and `coconut` palm-like species,
  redirect that budget to grass or other ground cover, add more big palms and
  ground vegetation, and make bamboo scattered dense clusters instead of the
  dominant forest layer. It now also carries an explicit non-uniform landscape
  distribution target: A Shau should not read as evenly spaced everything
  everywhere, so future acceptance needs researched bamboo grove pockets,
  denser palm stands, water/lowland-edge vegetation from hydrology proxies,
  disturbed trail edges, deterministic cluster audits, A Shau before/after
  screenshots, and perf captures.
  A first local A Shau distribution implementation now uses DEM-derived
  hydrology proxies in `A_SHAU_VALLEY_CONFIG`: low flats become wet `swamp`,
  lowland shoulders become `riverbank` palm/understory habitat, and flatter
  low benches can become limited `bambooGrove` pockets. The current static
  distribution audit
  `artifacts/perf/2026-05-05T23-49-30-281Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  passes with A Shau CPU biome coverage `77.8%` denseJungle, `15.7%`
  riverbank, `4.04%` bambooGrove, and `2.46%` swamp. The fresh elevated
  screenshot baseline
  `artifacts/perf/2026-05-05T23-49-56-989Z/projekt-143-terrain-horizon-baseline/summary.json`
  captures 4/4 nonblank Open Frontier/A Shau shots and links trusted
  perf-before summaries. This is still a proxy/candidate slice, not final
  KB-TERRAIN acceptance, because water-edge placement needs a real stream or
  hydrology input plus matched after perf and human visual review.
  A reusable hydrology branch is documented in
  `docs/PROJEKT_OBJEKT_143_HYDROLOGY.md` and backed by
  `src/systems/terrain/hydrology/HydrologyBake.ts`, a deterministic D8-style
  flow-direction/accumulation bake for sampled height grids with an optional
  epsilon-fill depression pass. The latest static/runtime hydrology audit
  `artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
  is PASS for the runtime classification contract: A Shau DEM wet candidates
  cover `6.24%` of sampled cells and Open Frontier procedural wet candidates
  cover `2.47%`, with runtime hydrology classification covering `100%` of wet
  candidates and leaving `0%` dense-jungle wet candidates in both maps. Broad
  dry-cell `riverbank`/`swamp` elevation proxies have been removed from A Shau
  and Open Frontier. A dry lowland `tallGrass` ground-cover band now clears the
  A Shau uniform-biome flag without widening hydrology corridors.
  The latest distribution audit is
  `artifacts/perf/2026-05-06T17-00-32-427Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  The hydrology audit JSON includes bounded world-space `channelPolylines` for
  the top channel paths, but those remain branch-start river-corridor
  candidates, not accepted rivers. It also writes schema-v1 hydrology cache
  artifacts with sparse wet/channel cell lists and channel polylines for A Shau
  and Open Frontier, and `scripts/prebake-hydrology.ts` makes the accepted
  cache shape durable under `public/data/hydrology` with
  `npm run hydrology:generate` and `npm run check:hydrology-bakes`.
  `HydrologyBakeManifest.ts` provides the typed manifest/cache loader,
  `HydrologyBiomeClassifier.ts` provides the default large-map vegetation
  classifier, and `HydrologyCorridor.ts` provides a pure world-space
  channel/bank/wetland/upland sampler over cached `channelPolylines`.
  The latest artifact writes review masks at
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-mask.png`
  and
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-mask.png`.
  Cache artifacts are
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-cache.json`
  and
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-cache.json`.
  Durable tracked cache paths are `public/data/hydrology/bake-manifest.json`,
  `public/data/hydrology/a_shau_valley-hydrology.json`, and
  `public/data/hydrology/open_frontier-42-hydrology.json`.
  The 2026-05-07 VODA-1 refresh found stale hydrology bake-manifest signatures
  with `npm run check:hydrology-bakes`, regenerated them with
  `npm run hydrology:generate`, and restored the cache check to PASS. The source
  artifacts did not change; `public/data/hydrology/bake-manifest.json` now
  matches the durable A Shau and Open Frontier cache files. A follow-up static
  water-system contract audit at
  `artifacts/perf/2026-05-07T21-57-51-480Z/projekt-143-water-system-audit/water-system-audit.json`
  records the current renderer truth: `WaterSystem` still owns the global
  Open Frontier water fallback, hydrology river-strip meshes are wired from
  startup, A Shau suppresses the global plane, the hydrology river material
  profile remains `natural_channel_gradient`, and public
  `getWaterSurfaceY` / `getWaterDepth` queries exist with focused regression
  coverage. The runtime proof gate then started the perf Vite server and passed
  at
  `artifacts/perf/2026-05-07T21-55-25-154Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
  with screenshot artifacts, zero browser errors, and live hydrology query
  probes: Open Frontier has `12` hydrology channels / `592` segments with
  global water enabled, and A Shau has `12` channels / `552` segments with the
  global water plane disabled. The VODA-1 atmosphere evidence refresh at
  `artifacts/perf/2026-05-07T22-13-21-685Z/projekt-143-voda-atmosphere-evidence/summary.json`
  rebuilt `dist-perf` and captured `15` screenshots across A Shau, Open
  Frontier, TDM, Zone Control, and combat120 with zero browser errors; the
  packet records cloud-follow PASS in every scenario, A Shau nav ready and
  connected, Open Frontier nav ready and connected, and hydrology river visuals
  present in both large maps. It also records `106` browser warnings, so it is
  evidence, not final acceptance.
  Current elevated terrain horizon proof at
  `artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`
  is PASS for four Open Frontier/A Shau screenshots with renderer, terrain,
  vegetation, browser-error, and linked trusted perf-before checks. This is
  runtime evidence only; final far-horizon appearance still needs human visual
  acceptance and matched after captures for any future branch.
  Current terrain visual-review packet at
  `artifacts/perf/2026-05-07T22-17-52-232Z/projekt-143-terrain-visual-review/visual-review.json`
  is WARN for `14` Open Frontier/A Shau screenshots with zero browser/page
  errors and a contact sheet at
  `artifacts/perf/2026-05-07T22-17-52-232Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`.
  It passes expected screenshots, browser-error clearance, nonblank visual
  content, hydrology review shots, and foundation review shots, but
  `terrain_water_exposure_review` warns on Open Frontier airfield and river
  shots: luma means `229.37` to `236.60`, overexposed ratios `0.6786` to
  `0.8286`, and green ratios `0.0082` to `0.0393`. A Shau river review passes
  in the same packet. This is review packet evidence only; it does not accept
  terrain art, hydrology river visuals, perf, production parity, or VODA-1
  completion. A follow-up source-only exposure audit at
  `artifacts/perf/2026-05-08T01-15-33-373Z/projekt-143-voda-exposure-source-audit/summary.json`
  records WARN classification
  `voda_exposure_warning_review_composition_before_water_material_tuning`
  without launching a browser or perf capture on the resource-contended
  machine. It classifies `4` Open Frontier exposure-risk shots, `0` risk shots
  with global water visible, and `4` risk shots with hydrology river surfaces
  visible. It also binds `natural_channel_gradient` to opacity `0.55`, dark
  hydrology source luma values `50.81`, `68.08`, and `36.13`, and middle/bottom
  neutral-overexposure ratios from `0.8681` to `0.9454` in the warned
  sightlines. Do not tune the Three.js global water shader or hydrology material
  as the first answer to this warning; inspect Open Frontier camera review
  angles, sky exposure, pale airfield/foundation materials, and terrain-water
  sightline composition first. VODA-1 remains blocked on final stream art, Open
  Frontier exposure correction, matched quiet-machine perf, consumer adoption
  of water queries, and human visual acceptance.
  The attempted matched Open Frontier perf leg at
  `artifacts/perf/2026-05-06T11-30-35-349Z/summary.json` is rejected as
  KB-TERRAIN acceptance evidence: measurement trust, shots/hits, average frame,
  and end heap growth passed, but validation failed on `137.50 MB` peak heap
  growth and warned on `49.80ms` peak p99. A Shau paired perf was not run from
  that slot because the first leg of the pair was already invalid.
  Heap diagnostic
  `artifacts/perf/2026-05-06T11-42-10-167Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
  classifies the rejected run as a `transient_gc_wave` likely tied to
  vegetation cell streaming or other short-lived traversal allocations near the
  player. This is diagnostic negative evidence only, not a fix or acceptance.
  The attempted Open Frontier after capture at
  `artifacts/perf/2026-05-06T00-00-32-485Z/summary.json` is rejected as
  acceptance evidence: it failed validation on peak p99, hitch percentage, and
  harness shots/hits, and the owner reported concurrent web game tests on the
  same device. The terrain baseline and Cycle 3 selector scripts now skip perf
  summaries with failed validation even when measurement trust passes. The
  yellow-fruit `bananaPlant` albedo atlas also has a local color cleanup so the
  lower stem reads green instead of cyan-blue, with a new
  `src/config/vegetationTypes.test.ts` regression check for zero strong
  cyan-blue opaque pixels. The final 2026-05-06 `npm run validate:fast` rerun
  passes after an initial noisy `SpatialOctree.test.ts` timing failure and
  isolated pass; that is local static validation only, not perf, visual, or
  production acceptance. `npm run build` and `npm run build:perf` also pass
  after the atlas/selector changes, with only the existing Vite chunk-size
  warning. The vegetation-normal A/B proof was refreshed after the atlas
  cleanup at
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/summary.json`
  with contact sheet
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/contact-sheet.png`;
  it remains WARN because the no-normal candidate exceeds the visual review
  band. Default normal maps stay unchanged, and the no-normal candidate is
  rejected for current runtime or Pixel Forge bake policy unless a future PASS
  or owner-accepted contact sheet replaces this evidence.
  Local follow-up now includes a second bamboo clustering fix because the first
  grove mask still looked scattered: clustered mid-level vegetation gets its
  own Poisson grid instead of sharing palm spacing. The latest distribution
  audit is
  `artifacts/perf/2026-05-06T17-00-32-427Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  it now includes runtime hydrology classification, clears the A Shau
  uniform-biome flag, and remains WARN only for the AI Sandbox random-seed
  audit fallback note.
  Latest completion audit remains `NOT_COMPLETE` at
  `artifacts/perf/2026-05-06T18-36-51-770Z/projekt-143-completion-audit/completion-audit.json`.
  Open blockers are still KB-LOAD, KB-TERRAIN, KB-CULL, and validation/release.
  Earlier placement/foundation audits passed after moving/reorienting the first
  Open Frontier and Ta Bat airfield/support presets, but the latest generated
  airfield placement audit reopens foundation visual risk at
  `artifacts/perf/2026-05-06T17-11-14-436Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
  A Shau after-placement evidence at
  `artifacts/perf/2026-05-04T04-14-35-401Z/summary.json` no longer logs the
  old Ta Bat steep-footprint warning, but A Shau remains WARN with
  terrain-stall/route symptoms and a current `tabat_airstrip` generated A-1
  parking placement relief warning, so this is not A Shau acceptance.
- A low-resource KB-TERRAIN asset inventory now exists at
  `artifacts/perf/2026-05-06T13-16-02-955Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`.
  It found `12` terrain WebP textures (`5` green-ground variants and `4`
  trail/cleared/disturbed variants), `5` Pixel Forge ground-cover prop
  candidates, `12` building candidates, `7` runtime Pixel Forge vegetation
  species, and `6` blocked vegetation species, with no missing assets. The GLB
  metadata pass records `5,704` candidate-building triangles, `7,528` runtime
  structure/foundation triangles, and `30` medium/high optimization risks
  mostly from many small meshes/materials/primitives. It also records `19`
  sibling Pixel Forge building-gallery candidates and `5` sibling Pixel Forge
  ground-vehicle candidates. This is shortlist evidence only; no custom grass,
  ground-cover, trail, building, or vehicle import is accepted from static file
  presence.
- The active-player perf harness has a current local shorter-NPC aim fix. The
  bot/driver now aim at the Pixel Forge visual chest proxy below the actor
  eye-level anchor and can use rendered target anchors. The fresh post-fix
  Open Frontier capture
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json` records `120` player
  shots, `43` hits, and `9` kills, so the earlier zero-hit failure is no
  longer the current hit-contract state. Do not use that capture as clean
  frame-time acceptance or baseline evidence: the owner reported another
  browser game was running on and off during it, so metrics are potentially
  skewed. A later 2026-05-06 local close-pressure patch makes the driver
  hold-and-shoot inside each mode close-contact distance and puts utility-AI
  fire-and-fade re-entry behind the existing cover-seek cooldown; the latest
  local slice also keeps objective travel unless a visible target is inside the
  mode acquisition band, reduces player-anchored frontline compression, and
  suppresses close-range utility cover hops. This is not final skilled-player
  acceptance. Trusted reruns after the first patch are filed: Open Frontier
  `artifacts/perf/2026-05-06T13-45-41-194Z/summary.json` is OK with measurement
  trust PASS, validation WARN on p99 only, `150` shots / `17` hits, max stuck
  `4.3s`, and diagnostic PASS with `4` route-progress resets while ending on a
  far current-target chase around `450m`; A Shau
  `artifacts/perf/2026-05-06T13-49-19-901Z/summary.json` is OK with measurement
  trust PASS, validation WARN on heap growth/recovery only, `49` shots / `6`
  hits, max stuck `1.5s`, and diagnostic PASS ending in zone PATROL after
  closing objective distance by `500.45m`. Treat this as improved liveness and
  route-progress evidence. The latest Open Frontier selector/movement-clamp
  rerun at
  `artifacts/perf/2026-05-06T14-44-44-702Z/summary.json` has measurement trust
  PASS, validation WARN on p99/heap peak only, diagnostic PASS, `102` shots /
  `17` hits, `37` movement transitions, max stuck `0.3s`, `0` route
  no-progress resets, `blockReason=none`, and `465.97m` player travel. It still
  needs owner visual review for remaining dense close-contact twitch/cover
  behavior and only closes `17.9m` of final objective distance while fighting a
  nearby OPFOR.
  A subsequent objective-aware target-lock pass fixes the far-target
  reacquire/pacing failure in the perf driver, with Open Frontier
  `artifacts/perf/2026-05-06T15-09-39-654Z/summary.json` and A Shau
  `artifacts/perf/2026-05-06T15-11-14-529Z/summary.json` both OK with
  measurement trust PASS and validation WARN. A Shau still showed repeated
  terrain-stall warnings, so a narrow strategy/follower follow-up now keeps
  strategic spawns and final formation slots inside objective shoulders and
  makes close followers own/hold their leader destination instead of falling
  through to enemy-base fallback motion. Accepted A Shau proof at
  `artifacts/perf/2026-05-06T15-32-02-870Z/summary.json` remains WARN but
  records `223` shots / `44` hits / `10` kills, max stuck `1.2s`, `1` route
  no-progress reset, and `21` terrain-stall/backtracking warnings with no
  combatant repeating more than `3` times. This improves the prior
  scatter-only artifact at
  `artifacts/perf/2026-05-06T15-27-27-070Z/summary.json`, which logged `44`
  warnings with one combatant repeating `19` times. The broad terrain-flow /
  trail-shoulder experiment at
  `artifacts/perf/2026-05-06T15-36-41-357Z/summary.json` stayed at `22`
  warnings and was reverted. A Shau route/nav quality is improved but still
  unsigned.
  A later close-pressure suppression/player-driver follow-up fixes another
  observed twitch path: near-miss suppression no longer enters orphan
  `SEEKING_COVER` without a cover anchor/destination, the injected perf driver
  faces route movement while moving and combat aim while firing, and occluded
  close targets keep repositioning until a `6m` point-blank hold. Diagnostic
  artifacts
  `artifacts/perf/2026-05-06T16-21-27-610Z`,
  `artifacts/perf/2026-05-06T16-25-07-821Z`, and
  `artifacts/perf/2026-05-06T16-27-52-490Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  show the movement bug and fix sequence; the latest 60-NPC diagnostic records
  `63` shots / `7` hits / `3` kills, max stuck `0.2s`, `125.99m` travel, and
  movement block reason `none`, but the capture still failed perf/heap
  validation. Owner visual review after that still observed dense close-pressure
  cover-like pacing/yaw twitch. The current local target-lock patch keeps active
  close targets through brief LOS/nearest-enemy churn, but the fresh compressed
  Open Frontier browser probe at
  `artifacts/perf/2026-05-06T17-25-29-462Z/summary.json` still fails validation:
  measurement trust passes, max stuck is `0.3s`, movement transitions are `40`,
  but the run records only `1` hit, `10` route target resets, `6` route
  no-progress resets, and negative final objective closure. Treat it as
  behavior diagnostic evidence only, not skilled-player, culling, distribution,
  or perf acceptance.
  A subsequent pure-pursuit/world-movement/tactical-hold follow-up fixes missed
  route-waypoint backward pulls, keeps the injected CJS driver on world-space
  movement intent, and adds a movement-artifact heading-flip diagnostic. The
  latest headed compressed Open Frontier artifact
  `artifacts/perf/2026-05-06T18-24-22-092Z/summary.json` is OK with
  measurement trust PASS and validation WARN: `82` shots / `16` hits / `4`
  kills, max stuck `0.5s`, `64` movement transitions, `148` waypoints followed,
  `2` route no-progress resets, average frame `9.31ms`, p99 `35.80ms`, and
  heap peak growth `39.38MB`. The paired diagnostic at
  `artifacts/perf/2026-05-06T18-24-22-092Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  is still WARN because final objective closure is only `15.2m` and the player
  movement track records `22` heading reversals over `120` degrees, all
  short-hop pacing reversals. This is materially better than the rejected
  90-plus-flip close-range experiments, but it is still not skilled-player,
  distribution, culling, or perf acceptance. Owner-observed NPC speed spikes
  remain an open telemetry-audit item: the largest spot-checked spikes are
  often initial harness relocation/compression samples, but some non-initial
  terrain backtracking/recovery segments still exceed plausible run limits and
  need a formal speed sanity gate before infantry locomotion can be accepted.
- Fixed-wing browser validation is incomplete for the local terrain-placement
  move. `npm run probe:fixed-wing` first hit sandbox `spawn EPERM`; the
  approved rerun produced partial A-1 success in
  `artifacts/fixed-wing-runtime-probe/summary.json` and then timed out before
  F-4/AC-47 completion. Do not claim fixed-wing probe acceptance for this local
  state until the full probe completes.
- No WebGPU migration has shipped or been started. KB-STRATEGIE recommends
  staying on WebGL during stabilization, with a contained WebGPU/TSL spike only
  after the measured blockers are under control.
- Phase 3 now has a refreshed Cycle 3 kickoff/readiness matrix in
  `docs/PROJEKT_OBJEKT_143.md` and
  `artifacts/perf/2026-05-06T03-26-51-656Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Cycle 0 evidence, Cycle 1 baseline/policy work, and Cycle 2 proof surfaces
  are shipped. The latest local kickoff marks KB-OPTIK NPC scale/crop/luma as
  `evidence_complete` after runtime LOD-edge proof passes and owner accepts the
  runtime-equivalent same-scene review packet with caution.
  KB-LOAD texture upload/residency remains `ready_for_branch`; the selected
  next proof branch is
  `vegetation-atlas-regeneration-retain-normals` from
  `artifacts/perf/2026-05-06T02-56-15-735Z/projekt-143-load-branch-selector/load-branch-selector.json`,
  with Pixel Forge readiness at
  `artifacts/perf/2026-05-06T03-24-43-522Z/projekt-143-pixel-forge-vegetation-readiness/vegetation-readiness.json`.
  That readiness artifact records source variants and normal-lit pairs present
  for the four selected active vegetation atlases, and `branchExecutionState`
  is now `ready_for_candidate_generation` because the local Pixel Forge TIJ
  runner exposes a review-only `kb-load-vegetation-256` profile, separate
  `tij-candidates` output root, and selected-species validator. Generated
  candidate atlases and selected-species validation have now run in Pixel
  Forge. The static candidate proof at
  `artifacts/perf/2026-05-06T04-17-12-580Z/projekt-143-vegetation-candidate-proof/summary.json`
  is PASS with `4/4` selected color/normal/meta pairs complete, and the TIJ
  import-plan dry run at
  `artifacts/perf/2026-05-06T11-03-21-671Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`
  is PASS with `importState=dry_run_ready` and `4/4` replacements mapped to
  runtime paths. Accepted visual proof, actual import, and quiet-machine
  startup claims are still open. The old giantPalm/fanPalm warmup path stays
  retired partial evidence.
  A refreshed KB-FORGE audit at
  `artifacts/perf/2026-05-06T03-37-10-850Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`
  now records `manifestPolicyAligned=true`: `giantPalm` is retired in the local
  Pixel Forge review manifest, the six blocked species remain blocked, and the
  six current runtime species remain candidates.
  KB-EFFECTS grenade first-use is `evidence_complete` for the trusted low-load probe, KB-TERRAIN is now
  `ready_for_branch` after the fresh-build elevated horizon baseline at
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`,
  and KB-CULL has a partial static-feature batching reduction after the clean
  owner-path baseline at
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
  and refreshed after packet at
  `artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`.
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
  and the accepted packet at
  `artifacts/perf/2026-05-05T23-13-35-420Z/projekt-143-optik-human-review/review-summary.json`
  records runtime-equivalent owner acceptance. It continues to reject aircraft
  resizing or NPC retuning as the next response without separate proof.
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
- Local KB-CULL follow-up now has partial static-feature batching evidence.
  `WorldFeatureSystem` builds static placements under one
  `WorldStaticFeatureBatchRoot` and batches compatible static meshes across
  placement boundaries after collision/LOS registration. The refreshed owner
  baseline at
  `artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`
  passes with owner draw-call-like `261` Open Frontier / `307` A Shau. Open
  Frontier static attribution improved from the previous local capture
  (`world_static_features` `328` to `222` draw-call-like), but the total
  renderer max is mixed because the after capture has visible close NPC and
  weapon meshes. A Shau improved materially against the previous route
  artifact (`world_static_features` `666` to `268`; max renderer draw calls
  `1061` to `376`) and no longer heap-fails in the fresh run, but the capture
  remains WARN on peak p99 and terrain-stall warnings still appear. This is
  static-feature draw-call reduction only, not broad culling/HLOD, frame-time,
  A Shau terrain/nav, or production acceptance.
- A local KB-CULL follow-up now has scoped before/after proof for world static
  feature and visible-helicopter ownership. `WorldFeatureSystem` uses
  frustum-aware static feature sector visibility on top of distance/hysteresis
  culling, and the refreshed owner baseline at
  `artifacts/perf/2026-05-06T16-53-41-964Z/projekt-143-culling-owner-baseline/summary.json`
  feeds Cycle 3
  `artifacts/perf/2026-05-06T16-54-35-084Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  That kickoff records the static-feature/visible-helicopter owner slice as
  `evidence_complete`: Open Frontier visible owner draw-call-like delta `-223`
  and total draw calls delta `-281`; A Shau visible owner draw-call-like delta
  `-661` and total draw calls delta `-392`. Broad HLOD, vehicle interaction,
  static-cluster, and vegetation-distance policy remain open. Vegetation hidden
  behind hills should be handled with coarse terrain/cluster/Hi-Z-style
  occlusion, not per-instance raycasts.
- A later KB-CULL vehicle-interaction safety slice fixed
  `HelicopterInteraction` so helicopter entry prompts/entry attempts are
  suppressed while the player is already in fixed-wing flight. Targeted
  vehicle tests also prove render-culled helicopters and parked fixed-wing
  aircraft remain enterable when the player is on foot. This is unit-level
  safety evidence only; broad HLOD/culling, future ground-vehicle driving,
  parked-aircraft playtest coverage, matched perf, and production parity remain
  open.
- KB-LOAD has retired its first local runtime remediation with the short-palm
  removal, not a closeout. The old code warmed only the `giantPalm`
  color/normal texture pair before renderer reveal through
  `AssetLoader.warmGpuTextures()`; the current warmup list is empty because the
  short Quaternius palm no longer ships and the taller palm-like species need
  separate paired proof before any warmup. Historical paired retail startup
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
- Starter-kits validation passed in the sibling workspace: `npm ci`, its
  `check` script, and its `smoke:browser` script. The smoke gate starts seven visual workspaces and
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
- Approved runtime vegetation is limited to six Pixel Forge impostor species:
  `bambooGrove`, `fern`, `bananaPlant`, `fanPalm`, `elephantEar`, and
  `coconut`. The short Quaternius palm previously named `giantPalm` /
  `palm-quaternius-2` is owner-retired and removed from shipped public assets;
  the taller `fanPalm` and `coconut` palm-like trees remain runtime species.
  Blocked species remain out of production until regenerated or approved:
  `rubberTree`, `ricePaddyPlants`, `elephantGrass`, `areca`, `mangrove`, and
  `banyan`.
- Vegetation still uses the GPU billboard path, now with manifest-backed color
  and normal atlases, close alpha hardening, a brighter minimum lighting floor,
  shader-side wind, species grounding sinks for low-angle atlas padding, and
  per-species atlas guards for reviewed problem packages. `coconut` is locked
  to a clean column and capped away from its bad low-elevation row. There is
  still no close 3D vegetation LOD in this pass.
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
7. Continue combat120 remediation before claiming perf sign-off or refreshing
   baselines. DEFEKT-3 now has a standard repeatability artifact at
   `artifacts/perf/2026-05-07T05-10-12-139Z/projekt-143-repeatability-check/summary.json`
   with measurement trust PASS, validation FAIL, avg `19.27ms`, p99 `36.70ms`,
   heap end-growth `40.45MB`, and heap recovery `14.8%`. The follow-up
   diagnostic at
   `artifacts/perf/2026-05-07T05-19-21-519Z/projekt-143-heap-close-model-isolation/summary.json`
   clears the numeric thresholds only by disabling close models, so the next
   accepted production artifact is
   `artifacts/perf/2026-05-07T05-26-55-636Z/projekt-143-close-model-pool-bound/summary.json`.
   It fixes heap end-growth/recovery and p99 under the codex thresholds while
   keeping close GLB actors enabled, but avg frame remains `17.50ms` and the
   lower close-actor cap still needs visual acceptance. The latest
   repeatability artifact,
   `artifacts/perf/2026-05-07T05-38-56-942Z/projekt-143-pool-bound-repeatability/summary.json`,
   keeps measurement trust PASS and records avg `17.36ms`, p99 `34.50ms`,
   heap end-growth `13.94MB`, and heap recovery `70.6%`. Baseline refresh
   remains blocked on avg-frame and heap-end-growth gates. The residual heap
   diagnostic at
   `artifacts/perf/2026-05-07T05-47-22-079Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
   points the next investigation away from retained renderer resources and
   toward short-lived combat runtime allocations, with terrain-stall
   backtracking as the largest captured console signal. The warning-bound
   packet at
   `artifacts/perf/2026-05-07T05-54-31-155Z/projekt-143-stuck-warning-bound/summary.json`
   reduces terrain-stall console churn from `343` lines to `21`, but the
   standard capture still fails validation with avg `17.85ms`, p99 `78.10ms`,
   and heap end-growth `16.26MB`. The dev-shape deep-CDP attribution packet at
   `artifacts/perf/2026-05-07T06-18-22-151Z/projekt-143-heap-sampling-attribution/summary.json`
   identifies allocation churn ownership led by three.js math/skinning, then
   native churn, `CombatantRenderer.ts`, terrain height sampling,
   `CombatantMovement.ts`, and `InfluenceMapComputations.ts`. The close-model
   material-state bound artifact `artifacts/perf/2026-05-07T06-24-48-025Z`
   reaches validation PASS with avg `16.99ms`, p99 `34.30ms`, and recovery
   `63.2%`, but heap end-growth remains `16.26MB`; the sidecar
   `artifacts/perf/2026-05-07T06-27-39-705Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
   classifies the remaining heap as `retained_or_unrecovered_peak`; and
   `perf:compare -- --scenario combat120` still fails on `maxFrameMs`
   `100.00ms`. The close-model overflow-bound packet at
   `artifacts/perf/2026-05-07T07-00-28-388Z/projekt-143-close-model-overflow-bound/summary.json`
   improves heap cleanliness with heap end-growth `-5.08MB` and heap recovery
   `117.0%` while preserving visible close GLB actors, but compare still fails
   on avg `17.14ms` and max-frame `100.00ms`. The RuntimeMetrics frame-event
   ring packet at
   `artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
   records the first peak boundary in `runtime-samples.json`: frame event `540`
   at `100ms`, long-animation-frame `175.8ms`, WebGL upload max `0.1ms`, and
   top SystemUpdater timing `9.4ms`. The current max-frame owner is browser
   LoAF work outside instrumented SystemUpdater and WebGL-upload attribution.
   The avg-frame attribution sidecar at
   `artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-avg-frame-attribution/avg-frame-attribution.json`
   classifies the avg warning as late engagement-phase Combat CPU pressure:
   avg frame `13.15ms -> 18.44ms`, Combat total `4.60ms -> 5.94ms`, AI
   `3.42ms -> 4.51ms`, shots `0 -> 435`, draw calls `212.83 -> 191.63`, and
   terrain stream max `0.04ms`.
   The combat-phase sidecar at
   `artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-combat-phase-attribution/combat-phase-attribution.json`
   narrows the next owner to close-contact engagement pressure, not renderer or
   NPC movement volume: shots-delta correlation `0.761`, damage-taken
   correlation `0.574`, current-target distance correlation `-0.637`, and NPC
   movement delta correlation `-0.863`.
   The close-engagement source audit at
   `artifacts/perf/2026-05-07T07-56-12-331Z/projekt-143-close-engagement-source-audit/source-audit.json`
   ranks `AIStateEngage.ts`, `AILineOfSight.ts`, and `AITargetAcquisition.ts`
   plus `ClusterManager.ts` as the current source-owner chain and requires
   runtime counters before tuning or baseline refresh.
   The counter-bearing combat120 packet at
   `artifacts/perf/2026-05-07T08-18-45-389Z/projekt-143-close-engagement-counter-packet/counter-packet.json`
   proves `combatBreakdown.closeEngagement` samples and phase deltas under load,
   but remains WARN because validation still reports heap end-growth/recovery
   warnings and `perf:compare` still fails `maxFrameMs`. Baseline refresh
   remains blocked.
   The owner-attribution packet at
   `artifacts/perf/2026-05-07T08-29-10-043Z/projekt-143-close-engagement-owner-attribution/owner-attribution.json`
   ranks the remaining owner path as LOS full-evaluation/raycast pressure first
   and target-distribution churn second. Next action belongs to
   target-acquisition/distribution scheduling and LOS pressure separation, not
   baseline refresh.
   The LOS/distribution separation packet at
   `artifacts/perf/2026-05-07T08-39-12-950Z/projekt-143-los-distribution-separation/separation.json`
   proves the scheduling/execution split: distribution chooses targets without
   direct LOS calls; LOS cost executes in state-handler visibility checks after
   selection.
   The target-distribution stability-bound packet at
   `artifacts/perf/2026-05-07T09-43-39-502Z/projekt-143-target-distribution-stability-bound/target-distribution-stability-bound.json`
   proves the `500ms` distributed-target stickiness bound: assignment churn
   moves `4016 -> 425`, `patrolDetection` moves `3947 -> 674`, and LOS full
   evaluations move `5202 -> 1655`; baseline refresh remains blocked by
   `perf:compare` max-frame failure.
   The post-distribution max-frame attribution packet at
   `artifacts/perf/2026-05-07T09-41-19-775Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
   records the remaining blocker: first peak sample index `5`, runtime
   frame-event frame `392` at `100ms`, long task `127ms`,
   long-animation-frame `126.7ms`, blocking `76.73ms`, WebGL upload max
   `17.9ms`, and low-confidence `mixed_or_insufficient_attribution`.
   The focused trace packet at
   `artifacts/perf/2026-05-07T10-02-39-414Z/projekt-143-max-frame-trace-probe/trace-probe.json`
   writes `chrome-trace.json`, CPU profile, and heap sampling, then classifies
   the packet as low-confidence
   `trace_captured_under_untrusted_deep_cdp_gpu_commit_stalls`. Measurement
   trust fails under deep-CDP overhead, so the next action is trace-harness
   refinement before using CDP trace data as owner proof. The short/headless
   trace-overhead isolation packet at
   `artifacts/perf/2026-05-07T10-18-11-490Z/projekt-143-trace-overhead-isolation/isolation.json`
   shows the same short/headless seed-42 shape fails measurement trust even
   without CDP; classification is `control_capture_shape_untrusted_before_trace`.
   The production-shaped trace-overhead isolation packet at
   `artifacts/perf/2026-05-07T10-32-39-527Z/projekt-143-trace-overhead-isolation/isolation.json`
   now uses headed combat120 seed `2718`, writes `149320928` trace bytes across
   `704069` events, keeps measurement trust PASS, and classifies
   `trace_collection_overhead_not_detected`; `maxFrameMs` remains the blocker.
   The follow-up AI method-attribution packet at
   `artifacts/perf/2026-05-07T11-09-31-428Z/projekt-143-ai-method-attribution/ai-method-attribution.json`
   records method timing in standard combat120 runtime samples, but the `100ms`
   max-frame boundary does not align with a slow AI method and no console
   `[AI spike]` reproduces. The browser-boundary attribution packet at
   `artifacts/perf/2026-05-07T11-09-31-428Z/projekt-143-browser-boundary-attribution/browser-boundary-attribution.json`
   then classifies the same boundary as a browser long-task/long-animation-frame
   event without an instrumented SystemUpdater, AI method, or WebGL-upload owner:
   long task `177ms`, long-animation-frame `177.4ms`, blocking `127.28ms`,
   `SystemUpdater.Combat:7.2ms`, WebGL upload `0.1ms`, AI method leaders
   `0.1ms`, and no console `[AI spike]`. The corrected trace-category packet at
   `artifacts/perf/2026-05-07T11-32-00-011Z/projekt-143-max-frame-trace-probe/trace-probe.json`
   proves focused trace-only capture no longer records the earlier
   `CpuProfiler::StartProfiling` trace-start event when CPU profiling is
   disabled. That packet remains validation-failed but measurement-trusted:
   avg `17.03ms`, p99 `65.50ms`, heap end-growth `2.67MB`, heap recovery
   `92.6%`, longest trace event `RunTask:29.8ms`, GPU-like max `3.02ms`, and
   no long trace-start instrumentation event. The paired trace-boundary packet
   still classifies `trace_boundary_owner_unresolved`. Current
   `perf:compare -- --scenario combat120` selects the latest status-ok capture
   at `artifacts/perf/2026-05-07T11-28-18-728Z` and fails with `5 pass, 1 warn,
   2 fail`. The bundle-callsite resolution packet at
   `artifacts/perf/2026-05-07T11-45-11-238Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
   resolves the source-bearing renderer-main `FunctionCall` to
   `src/core/GameEngineLoop.ts` / `RenderMain` with `11/11` loop anchors and
   no sourcemap present. The repeatability/max-frame packet at
   `artifacts/perf/2026-05-07T14-29-53-738Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
   consumes the current status-ok, validation-WARN, measurement-trusted
   combat120 repeatability capture. It proves the score gate repeats
   (`404` score-gate skips, `100` raycasts, raycasts per uncached search
   `7.51 -> 1.961`), but `perf:compare -- --scenario combat120` fails again
   with `6 pass, 1 warn, 1 fail` because `maxFrameMs` returns to `100.00ms`.
   The max-frame sidecar classifies the first peak as
   `browser_native_gc_or_uninstrumented_render_present` with high confidence.
   The focused trace-boundary packet at
   `artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-trace-boundary-attribution/boundary-attribution.json`
   superseded it as the trace owner-review packet. The bundle-callsite
   resolution packet at
   `artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
   resolved the source-bearing renderer-main `FunctionCall` to
   `src/core/GameEngineLoop.ts` / `RenderMain` with `11/11` source anchors and
   no sourcemap present. The render-boundary timing packet at
   `artifacts/perf/2026-05-07T14-53-44-437Z/projekt-143-render-boundary-timing/render-boundary-timing.json`
   proved the first trusted `100ms` max-frame event sits inside
   `GameEngineLoop.RenderMain.renderer.render`. The prior render-present
   subdivision packet at
   `artifacts/perf/2026-05-07T15-12-59-293Z/projekt-143-render-present-subdivision/render-present-subdivision.json`
   consumes a fresh standard headed combat120 capture: avg `15.87ms`, p99
   `34.00ms`, max-frame `100.00ms`, heap end-growth `2.60MB`, heap recovery
   `91.1%`, measurement trust PASS. `perf:compare -- --scenario combat120`
   fails with `6 pass, 1 warn, 1 fail`; the remaining hard blocker is
   max-frame. Peak sample frame `1062` records `100ms`, long task `194ms`, LoAF
   `193.80ms`, WebGL upload `0.10ms`, and `GameEngineLoop.RenderMain.renderer.render`
   `185.40ms`. The peak LoAF carries script detail: `193.00ms` script work,
   script share `0.9959`, forced style/layout `0ms`, and post-script render tail
   `0.80ms`. The RAF callback source-resolution packet at
   `artifacts/perf/2026-05-07T15-12-59-293Z/projekt-143-raf-callback-source-resolution/raf-callback-source-resolution.json`
   resolves the minified `FrameRequestCallback` at `build-assets/index-CLD_euaE.js`
   char `993470` to bundle line `1736`, column `12524`, enclosing scheduler
   `Nk`, target frame function `Pk`, and `src/core/GameEngineLoop.ts` with
   `13/13` source anchors and `18/18` loop markers. Classification is
   `raf_callback_resolved_to_game_engine_loop_animate_render_main` with high
   confidence. The accepted runtime render-category packet at
   `artifacts/perf/2026-05-07T15-50-09-399Z/projekt-143-render-runtime-category-attribution/render-runtime-category-attribution.json`
   consumes a fresh headed combat120 capture plus the static scene-category
   sidecar and classifies
   `runtime_renderer_category_candidates_diverge_and_counters_remain_partial`
   with high confidence. The source capture is status `ok`, validation `warn`,
   measurement trust PASS, avg `16.36ms`, p99 `45.00ms`, max-frame `100.00ms`,
   heap end-growth `13.37MB`, and heap recovery `62.1%`; `perf:compare -- --scenario combat120`
   fails with `5 pass, 1 warn, 2 fail`. The packet
   records peak sample `26`, frame `2029` at `100ms`, renderer draw calls
   `275`, renderer triangles `290782`, `renderer.render` max `65.80ms`, long
   task `143ms`, LoAF `142.70ms`, and WebGL upload `17.30ms`. Same-sample
   runtime scene attribution records `115` visible draw-call-like entries,
   `125398` visible triangles, and `6868` visible instances, reconciling only
   `0.4182` of sampled renderer draw calls and `0.4312` of sampled renderer
   triangles. Terrain leads visible triangles at `0.588` share;
   `npc_close_glb` leads visible draw-call-like entries at `0.487` share;
   `vegetation_imposters` leads visible instances at `0.9525` share; the
   unattributed visible draw share is `0.2261`. The accepted follow-up
   render-submission packet at
   `artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`
   captures the exact peak frame `1123` with high-confidence classification
   `render_submission_category_candidates_diverge_at_peak_frame`: `132` draw
   submissions, `181270` triangles, `13586` instances, draw reconciliation
   `0.5156`, triangle reconciliation `0.7379`, `unattributed` draw share
   `0.3106`, `npc_close_glb` draw share `0.2727`, `npc_imposters` draw share
   `0.2424`, terrain triangle share `0.6101`, and vegetation-imposter instance
   share `0.9591`. The follow-up source-shape packet at
   `artifacts/perf/2026-05-07T16-32-55-557Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`
   is corroborating only because measurement trust is WARN; it captures exact
   peak frame `1158` with `unattributed` draw share `0.2991`, terrain triangle
   share `0.6910`, and exact-frame `unattributed` examples as unnamed
   `MeshBasicMaterial` meshes with no `modelPath`. The source audit at
   `artifacts/perf/2026-05-07T16-32-55-557Z/projekt-143-unattributed-render-source-audit/unattributed-render-source-audit.json`
   classifies `combatant_ground_marker_attribution_gap` with WARN status and
   medium confidence. The four exact-frame examples are `32` triangles per
   instance, matching the `CombatantMeshFactory.ts:418` NPC ground marker
   `RingGeometry(1.8, 3.0, 16)` / `MeshBasicMaterial` / `InstancedMesh`
   constructor; the marker block has no `perfCategory` tag and no stable
   `name`, and `CombatantRenderer.ts` writes marker matrices/counts at lines
   `1360` and `1392`. The follow-up source edit tags that marker with stable
   name `PixelForgeNpcGroundMarker.${key}` and `userData.perfCategory =
   'npc_ground_markers'`. After `npm run build:perf`, the rebuilt-bundle
   combat120 capture `artifacts/perf/2026-05-07T16-53-56-704Z` first records
   status `ok`, validation `warn`, measurement trust WARN, avg `14.95ms`, p99
   `34.10ms`, max-frame `100.00ms`, heap end-growth `14.33MB`, and heap
   recovery `78.3%`. The proof packet
   `artifacts/perf/2026-05-07T16-53-56-704Z/projekt-143-ground-marker-tagging-proof/ground-marker-tagging-proof.json`
   records `unattributed` draw-share movement `0.2991 -> 0.0242`, new
   `npc_ground_markers` draw share `0.2581`, `32` ground-marker draw
   submissions, `214` instances, and `7360` triangles. The follow-up
   lower-overhead capture `artifacts/perf/2026-05-07T17-03-50-248Z` remains
   status `ok`, validation `warn`, and measurement trust WARN (`probeAvg=30ms`),
   but corroborates the tag movement with exact peak frame `591`,
   `unattributed` draw-share movement `0.2991 -> 0.0873`, `npc_ground_markers`
   draw share `0.2540`, `32` ground-marker draw submissions, `184` instances,
   and `6400` triangles. The subsequent low-drain measurement rerun
   `artifacts/perf/2026-05-07T17-11-26-382Z` also remains status `ok`,
   validation `warn`, and measurement trust WARN (`probeAvg=31.73ms`); its
   ground-marker proof sidecar fails with `ground_marker_tagging_not_proven`
   despite `unattributed` draw-share movement `0.2991 -> 0.0609`,
   `npc_ground_markers` draw share `0.1624`, `32` draw submissions, `222`
   instances, and `7552` triangles. `perf:compare -- --scenario combat120` now
   selects `2026-05-07T17-11-26-382Z` and fails with `6 pass, 0 warn, 2 fail`:
   avg `18.28ms` FAIL and max-frame `100.00ms` FAIL. The DEFEKT-3
   measurement-path packet at
   `artifacts/perf/2026-05-07T17-19-54-240Z/projekt-143-measurement-path-inspection/measurement-path-inspection.json`
   persists raw `probeRoundTripSamplesMs` and classifies
   `per_sample_render_submission_probe_overhead_captured` with high confidence:
   `78/78` raw probes exceed `75ms`, p95 is `218ms`, and the per-sample
   render-submission drain writes `59000325` bytes. The follow-up sparse packet
   `artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-ground-marker-tagging-proof/ground-marker-tagging-proof.json`
   avoids that overhead class and records exact peak-frame `npc_ground_markers`
   draw share `0.3232`, `unattributed` draw share `0.0202`, and raw probe p95
   `30ms`, but formal measurement trust remains WARN because probe avg is
   `28.93ms` and three raw probes exceed `75ms`. The sparse-owner acceptance
   audit at
   `artifacts/perf/2026-05-07T22-29-58-460Z/projekt-143-sparse-owner-acceptance-audit/sparse-owner-acceptance-audit.json`
   records PASS, `8/8` criteria passing, classification
   `sparse_owner_review_accepted`, acceptance `owner_review_only`, raw probe
   over-75 rate `0.0345`, over-150 rate `0.0345`, avg-without-max delta
   `3.37ms` versus the accepted reference, and `3505993` render-submission
   bytes. The current DEFEKT-3 action is the remaining owner split across
   `npc_close_glb` draw submissions, `npc_ground_markers` draw submissions, and
   terrain triangle dominance; it is not further probe-drain reduction,
   suppression raycast cost, GPU present, or baseline refresh.
8. Keep the manual deploy/header spot-check in `docs/DEPLOY_WORKFLOW.md` as a
   release gate. The 2026-04-24 release bridged local-vs-prod evidence; repeat
   the check after every push intended for player testing, then replace the
   temporary `r2.dev` endpoint with a custom R2 asset domain.
9. Treat local perf-preview screenshots as non-deployed truth until the live
   Pages URL serves the same `asset-manifest.json`, R2 DEM, service worker,
   WASM, and content-hashed build assets.
