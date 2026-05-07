# Projekt Objekt-143 Recovery Ledger

Last updated: 2026-05-07

This ledger tracks the recovery operation opened after field reports of
startup stalls, frame-time regressions, imposter visual mismatches, vegetation
horizon loss, grenade spikes, profiler distrust, and the WebGL/WebGPU/platform
utilization strategy question. It is the project control record for this
recovery program; broader
current-state truth remains in [STATE_OF_REPO.md](STATE_OF_REPO.md).

## Operating Rule

Evidence before opinion. Measurement before decision. No bureau is allowed to
claim a fix until the telemetry path can show what changed and whether the
measurement itself was trustworthy.

## Projekt Objekt-143 Stabilization Closeout

Owner direction changed on 2026-05-07. Projekt Objekt-143 is no longer trying
to force every experimental bureau branch to `evidence_complete` before
release. The revised closeout target is:

1. Preserve the fixes, probes, and evidence that improved the repo during the
   long experimental/orchestration cycle.
2. Fold unresolved KB-LOAD, KB-TERRAIN, KB-CULL, water, vegetation,
   active-driver, Pixel Forge, and platform findings into roadmap/backlog
   records with enough artifact paths for a future Projekt revamp.
3. Stabilize the current local stack instead of expanding scope: no new
   WebGPU migration, no new vehicle type, no unaccepted asset import, no broad
   water/terrain art rewrite before the release cutoff.
4. Run the stabilization validation gate, commit the local stack, push to
   `master`, deploy, and verify live Pages production parity.

Deferred work remains real work. It should not be erased or treated as solved:
water naturalism, A Shau route/nav quality, vegetation distribution and ground
cover, Pixel Forge candidate imports, broad HLOD/culling, future driving
surfaces, and skilled combined-arms feel become roadmap items for the next
Projekt pass after the repo is clean and deployed.

## Platform Utilization Track

The owner direction to get closer to the metal is in scope, but browser game
delivery cannot depend on app-owned native OS bindings. The practical path is
to harness native-backed browser capabilities more deliberately: WebGL2
extension coverage and GPU timer queries, worker/OffscreenCanvas feasibility,
WASM/SIMD/thread preconditions through cross-origin isolation, WebGPU adapter
and limits probes, and device-class policy that can choose the right rendering
and simulation budget per machine. Current strategy remains WebGL/Three.js
stabilization first; any WebGPU renderer, worker-render loop, or WASM rewrite is
a separate proof-gated branch that must improve Open Frontier and A Shau without
regressing startup, asset acceptance, or production deployability.

Reference platform facts for future KB-STRATEGIE work: MDN WebGPU
(`https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API`), MDN
SharedArrayBuffer/cross-origin isolation
(`https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer`),
web.dev OffscreenCanvas
(`https://web.dev/articles/offscreen-canvas`), and MDN/Khronos
`EXT_disjoint_timer_query` for non-stalling WebGL GPU timing.

## Phase Status

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1 - Inspectorate of Foundations | SIGNED 2026-05-02 | Read-only audit completed against code, docs, live Pages state, GitHub Actions, perf artifacts, and static asset inventory. |
| Phase 2 - Specialist Bureaus | ACTIVE | Cycle 1 baseline bundle is filed with WARN status. The initial docs/tooling release deployed at `806d5fa43d63854dd80496a67e8aaef4a741c627`; the follow-up agent-DX release deployed at `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e`; release-DX hardening deployed at `5f46713d101f6fea974da6d77f303c95df58000c`; Cycle 2 aircraft delivery deployed at `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`. Exact production SHA remains `/asset-manifest.json`. Cycle 2 visual/runtime proof is evidence-complete PASS through `artifacts/perf/2026-05-03T16-48-58-020Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`, with KB-CULL renderer/category proof at `artifacts/perf/2026-05-03T10-21-12-603Z/projekt-143-culling-proof/summary.json` and KB-OPTIK matched proof refreshed after the selected-lighting luma slice at `artifacts/perf/2026-05-03T16-48-28-452Z/projekt-143-optics-scale-proof/summary.json`. Commit `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9` drops the NPC runtime target to `2.95m` and adds generated per-tile imposter crop maps; commit `1395198da4db95611457ecde769b611e3d36354e` adds faction imposter material tuning. Matched visible-height ratios improved from the Cycle 2 before range `0.52-0.54x` to `0.861-0.895x`, and selected-lighting luma delta now ranges `-0.44%` to `0.36%`. No perf improvement, final visual parity, aircraft-scale acceptance, or production parity is claimed. KB-METRIK remains first and blocks optimization claims from other bureaus. |
| Phase 3 - Multi-Cycle Engineering Plan | REVISED TO STABILIZATION CLOSEOUT 2026-05-07 | Dependency-aware cycle plan exists below, but the closeout target is now stabilization and release, not exhaustive experimental branch completion. Latest Cycle 3 readiness is mechanically summarized by `artifacts/perf/2026-05-07T00-26-45-885Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`: KB-OPTIK and KB-EFFECTS have scoped evidence-complete decisions; KB-LOAD, KB-TERRAIN, and KB-CULL have valuable branch-ready evidence and clear unresolved work. Under the revised objective, those unresolved items must be folded into roadmap/backlog/handoff records rather than forced into new runtime scope before release. Production parity is still not claimed until the current local stack is validated, committed, pushed, deployed, and live-verified. |

Phase 3 note, 2026-05-07: the table row above is superseded for hydrology by
the current KB-TERRAIN evidence below. Latest hydrology classification audit is
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
PASS, latest distribution audit is
`artifacts/perf/2026-05-06T17-00-32-427Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
WARN only on the unrelated AI Sandbox random-seed audit fallback, latest water runtime proof is
`artifacts/perf/2026-05-06T10-26-04-620Z/projekt-143-water-runtime-proof/water-runtime-proof.json`,
latest terrain horizon proof is
`artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`
PASS for four Open Frontier/A Shau elevated screenshots with renderer,
terrain, vegetation, and browser-error checks. Latest terrain visual-review
packet is
`artifacts/perf/2026-05-07T01-03-50-825Z/projekt-143-terrain-visual-review/visual-review.json`
with contact sheet
`artifacts/perf/2026-05-07T01-03-50-825Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`.
It is WARN after capturing `14/14` refreshed Open Frontier/A Shau ground, route,
foundation, parking, support, and hydrology screenshots with zero browser
errors; the new `terrain_water_exposure_review` check flags the Open Frontier
river/parking screenshots as washed out (`0.7448`, `0.8115`, and `0.8309`
overexposed ratio), so water/terrain naturalism remains deferred follow-up
rather than stabilization-release acceptance. The revised completion audit
remains `NOT_COMPLETE` at
`artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json`
only because validation/release is still blocked by a dirty, unpushed,
undeployed working tree.
KB-LOAD candidate import is back to dry-run-ready after repairing the Pixel
Forge banana candidate. The refreshed candidate proof at
`artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/summary.json`
is PASS, and the import plan at
`artifacts/perf/2026-05-06T21-41-01-701Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`
is PASS with `importState=dry_run_ready`, `4/4` ready items, and `0` strong
cyan-blue opaque pixels in the banana candidate. This still copied no runtime
assets and does not claim owner visual acceptance, startup proof, or production
parity.
The latest placement/foundation audit is now
`artifacts/perf/2026-05-07T00-32-41-375Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
PASS across all audited mode/seed variants after scoping generated-placement
core/native-relief warnings to exact/no-flat-search aircraft and adding a
dedicated packed-earth pad for the forward-strip A-1 stand. Runtime visual
review passed, but human visual acceptance, matched perf, Pixel Forge
building/vehicle replacement, and future vehicle-driving surface acceptance
remain open before KB-TERRAIN can claim closure.
Latest matched Open Frontier/A Shau perf pair is
`artifacts/perf/2026-05-06T21-54-56-334Z/summary.json` and
`artifacts/perf/2026-05-06T21-58-44-146Z/summary.json`. Both captures have
measurement trust PASS. Open Frontier is validation WARN on peak p99 `34.00ms`
and heap peak growth `57.77MB`, with `159` shots / `15` hits / `4` kills,
`1576.68m` player travel, and NPC-speed diagnostic PASS with max non-initial
speed `6.11m/s`. A Shau is validation PASS with peak p99 `11.70ms`, peak max
frame `27.40ms`, `639` shots / `86` hits / `25` kills, `1167.65m` player
travel, and NPC-speed diagnostic PASS with max non-initial speed `4.5m/s`.
However, both paired active-driver diagnostics remain WARN on route
objective-progress resets and short-hop heading reversals (`61` Open Frontier,
`33` A Shau), so this is retained trusted liveness/perf evidence, not
skilled-player, objective-flow, terrain-route, or human visual acceptance.
Latest retained active-driver/speed proof is
`artifacts/perf/2026-05-06T20-14-36-990Z/summary.json`, with paired
active-driver and NPC-speed diagnostics under the same artifact root. It is OK
with measurement trust PASS and validation WARN on p99/heap only: `150` shots /
`18` hits / `6` kills, max stuck `0.3s`, `480.99m` player travel, final
objective kind `nearest_opfor`, objective closure `24.25m`, `1` route
no-progress reset, no diagnostic heading/pacing findings, and NPC speed
diagnostic PASS with max non-initial speed `6.1m/s`. This supersedes the
`18:57` route-micro-target proof as the current retained bot baseline, but does
not claim skilled-player acceptance because objective closure is still modest.
A Shau now has a matching headed retained-bot proof at
`artifacts/perf/2026-05-06T20-23-31-045Z/summary.json`: measurement trust PASS,
validation WARN only on heap peak growth, `389` shots / `98` hits / `23` kills,
max stuck `0.3s`, `454.31m` player travel, `0` route no-progress resets, no
diagnostic heading/pacing findings, and paired NPC speed diagnostic PASS with
max non-initial speed `4.5m/s`. The active-driver diagnostic is still WARN
because objective closure is `0.0m` by its current final-sample metric, so this
is retained liveness/pacing evidence, not objective-flow or human skilled-player
acceptance.
A later close-pressure combat movement follow-up is retained as NPC loop and
stale-velocity evidence, not as a replacement for the cleaner 20:14/20:23
active-driver baseline. Runtime proof is
`artifacts/perf/2026-05-06T20-55-52-422Z/summary.json`: measurement trust PASS,
capture OK, validation WARN on p99, `149` shots / `12` hits / `4` kills, max
stuck `0.3s`, `499.86m` player travel, and `2` route no-progress resets. The
paired diagnostics keep NPC speed PASS at max non-initial `6.08m/s`, but the
active-driver diagnostic remains WARN on objective distance and route recovery.
The accepted code narrows generic ENGAGING backpedal to point-blank collision
range and gives RETREATING a real fallback-destination movement branch. Compared
with the retained `20-14-36-990Z` artifact, the tracked-NPC worst path/net ratio
improves from `12.2x` to `2.2x`, worst reversals from `15` to `4`, backtrack
hotspots from `33` to `9`, and pinned events from `56` to `35`; contour
activations rise sharply, so route/objective flow and human skilled-player
acceptance remain open.
The latest active-driver route-overlay/direct-combat fallback slice is retained
only for the A Shau path-snap failure it improves. The retained code skips
route-overlay steering while the perf player is visibly firing and closing, and
converts close/current combat-target navmesh snap failure into explicit
`direct_combat_fallback` telemetry instead of repeated waypoint replan
failures. Open Frontier diagnostic evidence at
`artifacts/perf/2026-05-06T22-34-05-681Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
is still WARN with `9` route no-progress resets and `45` short-hop pacing
reversals, but improves the earlier `161` reversal signal. A later
closer-target-lock experiment at
`artifacts/perf/2026-05-06T22-39-50-930Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
was rejected and reverted because it worsened Open Frontier pacing to `125`
heading reversals and `11` route no-progress resets. A Shau proof at
`artifacts/perf/2026-05-06T22-44-28-979Z/summary.json` has measurement trust
PASS, validation PASS, `333` shots / `46` hits / `14` kills, `0` waypoint
replan failures, objective closure `295.15m`, and only `9` heading reversals;
the paired diagnostic remains WARN on `8` route no-progress resets. This is
path-snap/driver evidence, not final combined-arms objective-flow acceptance.
Owner visual/gameplay note, 2026-05-06: current water still does not look
natural, and the battlefield still has too much NPC muddling for a combined
arms game with objectives and events. KB-TERRAIN must treat water as a
human-accepted hydrology/river/lake art pass, not just a generated mesh
presence proof, and KB-TERRAIN/strategy/combat must add objective pressure,
role activity, and battlefield life so forces visibly move, fight, support, and
react instead of evenly milling around.

Water mitigation pass, 2026-05-06: a local mitigation reduced the most obvious
flat/neon/slab failure without claiming acceptance. `WaterSystem` now uses a
darker lower-distortion global water profile plus narrower darker RGBA
hydrology ribbons with bank-to-channel vertex alpha. `TerrainSurfaceRuntime`
and `TerrainMaterial` now feather the hydrology material mask, use linear
filtering, and blend hydrology terrain material proportionally at very low
strength so cached hydrology does not dominate as blocky terrain paint. Focused
tests and typecheck pass; `npm run build:perf` passes. Refreshed water-system
audit is WARN by design at
`artifacts/perf/2026-05-06T23-23-35-936Z/projekt-143-water-system-audit/water-system-audit.json`.
Refreshed runtime proof is PASS at
`artifacts/perf/2026-05-06T23-26-44-103Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
with service workers blocked and close channel-focused screenshots for Open
Frontier and A Shau. Human visual acceptance remains open; this is not final
stream/lake/river art.

Combined-arms liveness mitigation, 2026-05-06: `StrategicDirector` no longer
hardcodes only US/NVA for strategic orders. It now iterates active factions in
the current war state and evaluates defense, retreat, and forward
reinforcement zones by alliance ownership. This closes a concrete cause of
mixed ARVN/VC squads skipping allied objectives or retreating toward the nearest
enemy home base, which can contribute to the owner-observed muddling. Focused
strategy/combat tests and `build:perf` pass. This is not final battlefield-feel
acceptance; it still needs longer objective-flow proof and human playtest that
squads visibly pressure objectives and reduce local crowd churn.

Runtime liveness proof after the combined-arms mitigation, 2026-05-06: a
headed 20s Open Frontier active-driver capture at
`artifacts/perf/2026-05-06T23-55-53-018Z/summary.json` is OK with measurement
trust PASS and validation WARN only on peak p99/heap peak growth. The paired
active-driver diagnostic at
`artifacts/perf/2026-05-06T23-55-53-018Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
is PASS with `50` shots, `7` hits, `1` kill, max stuck `0.3s`, `17` movement
transitions, and final objective pressure against a nearest OPFOR. A preceding
headless diagnostic at `artifacts/perf/2026-05-06T23-49-58-230Z/summary.json`
failed measurement trust and startup stabilization despite `gameStarted=true`;
do not use that headless run for acceptance. The headed proof confirms the
player harness can fight and advance on the current build, but the same run
still logged NPC terrain-stall/backtracking warnings and movement artifacts
show a heavy `npc_contour` hotspot near `(-12, -1356)`, so broad
terrain-route/NPC battlefield-flow acceptance remains open.

NPC terrain-route mitigation after that proof: `CombatantMovement` now skips a
terrain-blocked intermediate navmesh waypoint when a later waypoint on the same
route is immediately walkable, preserving the existing planned route while
avoiding local lip/contour churn. Focused combat movement tests, adjacent
movement/strategy tests, typecheck, and `build:perf` pass. The post-patch headed
Open Frontier proof at
`artifacts/perf/2026-05-07T00-05-21-283Z/summary.json` has measurement trust
PASS and validation WARN only on peak p99. Its active-driver diagnostic at
`artifacts/perf/2026-05-07T00-05-21-283Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
is WARN only for `1` route objective-progress reset, with `34` shots, `6` hits,
`2` kills, max stuck `0.0s`, objective closure `34.51m`, `198.80m` player
movement, and no heading/pacing flips. NPC speed diagnostic PASSes at
`artifacts/perf/2026-05-07T00-05-21-283Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`.
Movement artifacts improved versus the prior headed proof: `npc_contour` total
fell from `5355` to `473`, `npc_backtrack` fell from `11` to `0`, pinned events
fell from `17` to `5`, and max pinned time fell from `13.35s` to `6.67s`. This
is a useful terrain-route mitigation, not a full combined-arms sign-off: the
final screenshot still shows steep hillside combat and cliff-edge structure
placement, so KB-TERRAIN placement/routing and battlefield-feel acceptance remain
open.

Current working-tree update through 2026-05-06: Zone Control seed `137`
placement warnings are locally cleared by
`artifacts/perf/2026-05-05T02-39-51-929Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`,
and fresh A Shau runtime evidence at
`artifacts/perf/2026-05-05T02-41-21-751Z/summary.json` clears the previous
hard heap failure while keeping measurement trust, movement, and hit guardrails
green. A Shau remains unsigned because NPC terrain-stall backtracking is still
visible. KB-TERRAIN now also includes the owner-directed objective to remove
the short Quaternius palm (`giantPalm` / `palm-quaternius-2`) from runtime and
shipped assets, preserve the taller `fanPalm` and `coconut` palm-like species,
and spend the freed vegetation budget on grass or other ground cover.
Follow-up validation removed the short palm from runtime and shipped public
assets, preserved `fanPalm` and `coconut`, refreshed build/perf bundles, and
records the current vegetation inventory at
`artifacts/perf/2026-05-05T03-23-29-111Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
with `6` runtime species, `1` retired species, `6` blocked species, and `0`
missing assets. `npm run validate:fast` passed after this change, and the
latest Projekt suite is
`artifacts/perf/2026-05-06T05-53-35-745Z/projekt-143-evidence-suite/suite-summary.json`.
Cycle 3 kickoff now records KB-OPTIK as `evidence_complete` at
`artifacts/perf/2026-05-07T00-26-45-885Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
after owner acceptance of the runtime-equivalent review packet. KB-LOAD,
KB-TERRAIN, and KB-CULL remain `ready_for_branch` at their broad target level,
and KB-FORGE remains PASS for local Pixel Forge liaison/catalog scope. The
latest explicit completion audit is
`artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json`.
It reports `NOT_COMPLETE` under the revised stabilization objective: all named
bureau/roadmap-capture items are PASS for current evidence or explicit deferral,
and the remaining blocker is `validation-and-release` because the repo is still
dirty, unpushed, and undeployed. KB-STRATEGIE now has a guarded browser-backed
capability artifact at
`artifacts/perf/2026-05-06T06-03-26-013Z/projekt-143-platform-capability-probe/summary.json`,
but it is WARN/headless inventory only: WebGL2 is available through SwiftShader,
`EXT_disjoint_timer_query_webgl2` is unavailable, `navigator.gpu` exists without
a WebGPU adapter, OffscreenCanvas WebGL2 and isolated SharedArrayBuffer pass,
and local/live COOP/COEP headers pass. Owner vegetation specifics are PASS for retiring the
short palm, preserving `fanPalm`/`coconut`, and keeping ground-cover budget
directed toward fern/elephantEar/trail candidates, but the repo remains dirty,
unpushed, and undeployed, so validation/release remains FAIL.
The latest active-driver runtime pair after objective-aware target locking is
Open Frontier
`artifacts/perf/2026-05-06T15-09-39-654Z/summary.json` and A Shau
`artifacts/perf/2026-05-06T15-11-14-529Z/summary.json`: both are OK with
measurement trust PASS and validation WARN only, with Open Frontier recording
`112` shots / `18` hits / `5` kills / `0` route no-progress resets and A Shau
recording `210` shots / `30` hits / `7` kills / `1` route no-progress reset.
This proves the perf driver no longer immediately reacquires a no-progress
far target, but it is not natural NPC distribution or human skilled-player
acceptance.
A follow-up A Shau route-stall pass narrows the remaining NPC
terrain-stall/backtracking pattern without claiming A Shau acceptance:
`WarSimulator` now keeps strategic spawns and final formation slots inside
objective shoulders, `StrategicDirector` uses bounded disc scatter for zone
assignments, and `CombatantMovementStates` makes followers own their leader
destination/hold point rather than falling through to enemy-base fallback
motion while close to the leader. Accepted A Shau proof at
`artifacts/perf/2026-05-06T15-32-02-870Z/summary.json` is OK with measurement
trust PASS and validation WARN, `223` shots / `44` hits / `10` kills, max
stuck `1.2s`, `1` route no-progress reset, and `21`
terrain-stall/backtracking warnings with no combatant repeating more than `3`
times. The scatter-only run before the follower fix,
`artifacts/perf/2026-05-06T15-27-27-070Z/summary.json`, logged `44` warnings
with one combatant repeating `19` times. A broad terrain-flow/trail-shoulder
experiment at `artifacts/perf/2026-05-06T15-36-41-357Z/summary.json` stayed at
`22` warnings and was reverted; the next A Shau route/nav branch should inspect
close-contact movement, route-following, and navmesh path availability rather
than carrying a broad trail-flattening tweak.
The latest close-pressure suppression/player-driver follow-up then fixes an
orphan cover-state source and a CJS/TS camera-relative movement mismatch:
`CombatantSuppression` no longer forces `SEEKING_COVER` from near misses unless
a cover anchor and destination already exist, the injected driver now faces the
movement target while moving/not firing and the aim target while firing, and
occluded close targets keep repositioning until a `6m` point-blank hold instead
of stopping at the mode `pushInDistance` band. Diagnostic captures at
`artifacts/perf/2026-05-06T16-21-27-610Z`,
`artifacts/perf/2026-05-06T16-25-07-821Z`, and
`artifacts/perf/2026-05-06T16-27-52-490Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
show the bug progression: first the bot parked near an occluded target with
requested speed `0`, then movement recovered but stuck telemetry was polluted by
intentional hold-and-fire, then the 60-NPC diagnostic kept max stuck to `0.2s`,
moved `125.99m`, fired `63` shots, hit `7`, killed `3`, and reported movement
block reason `none`. The last run failed perf/heap validation, so this is
behavior diagnostic evidence only, not player-skill, culling, or perf
acceptance.
The latest active-driver follow-up then switches the injected driver to a
pure-pursuit route projection plus world-space movement intent and a narrower
tactical combat hold band. Current headed Open Frontier evidence at
`artifacts/perf/2026-05-06T18-24-22-092Z/summary.json` is OK with measurement
trust PASS and validation WARN: `82` shots / `16` hits / `4` kills, max stuck
`0.5s`, `64` movement transitions, `148` waypoints followed, `2` route
no-progress resets, average frame `9.31ms`, p99 `35.80ms`, and heap peak growth
`39.38MB`. The paired diagnostic
`artifacts/perf/2026-05-06T18-24-22-092Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
now reads movement artifacts and remains WARN because final objective closure
is only `15.2m` and the player track still has `22` heading reversals over
`120` degrees, all short-hop pacing reversals. This is a substantial
improvement over the 90-plus-flip rejected route-endpoint experiments, but it
does not close the user-observed player-bot hesitation or skilled-player
acceptance. Owner-observed NPC speed spikes remain an open telemetry gate:
future diagnostics should exclude initial harness relocation/compression and
then flag non-initial terrain backtracking/recovery segments above the infantry
run envelope. A later handoff/near-route fallback experiment at
`artifacts/perf/2026-05-06T18-44-37-468Z/summary.json` is rejected and reverted:
it improved shots but failed validation and worsened the movement diagnostic to
`46` heading reversals over `120` degrees (`45` short-hop reversals).
The retained follow-up instrumented player movement artifacts with
requested-speed, actual-speed, movement-intent, and terrain-block buckets. The
annotated no-behavior-change baseline at
`artifacts/perf/2026-05-06T18-52-22-338Z/summary.json` proved the remaining
hesitation was driver-commanded route churn rather than terrain collision drift:
`79` heading reversals over `120` degrees, `77` short-hop pacing reversals,
`65` requested-move pacing flips, `12` actual-only flips, and `0`
terrain-blocked flips. The accepted code path now invalidates a stale
route-overlay micro-target when pure-pursuit returns a tiny local route point
while the real combat/objective anchor is still far away. Current headed Open
Frontier proof at `artifacts/perf/2026-05-06T18-57-51-385Z/summary.json` is OK
with measurement trust PASS and validation WARN: `126` shots / `18` hits / `4`
kills, max stuck `0.3s`, `719.70m` player travel, `98.68m` objective closure,
`1` route no-progress reset, `9` heading reversals, `8` short-hop pacing
reversals, `8` requested-move pacing flips, and no actual-only or
terrain-blocked pacing bucket. A longer headed 180s check at
`artifacts/perf/2026-05-06T19-02-39-418Z/summary.json` remains movement-healthy
but combat-light: measurement trust PASS, validation WARN, `36` shots / `6`
hits / `1` kill, max stuck `0.5s`, `1262.93m` player travel, `176.78m`
objective closure, `2` route no-progress resets, `20` heading reversals, `16`
short-hop pacing reversals, and `0` terrain-blocked flips. Its final frame was
visually inspected and shows the player upright on the Ridge route, not trapped.
This closes the specific route micro-target pacing mechanism, but it does not
claim skilled-player acceptance; the remaining combat-light stretch appears to
be target distribution/acquisition pressure after first contact.
A later retained active-driver/speed pass addresses the current owner-observed
start-cluster pacing and NPC overspeed report more directly. `CombatantLODManager`
now stamps `combatant.lastUpdateTime` during high-LOD movement paths so later
medium-LOD ticks cannot apply stale catch-up deltas; the bad speed reference
`artifacts/perf/2026-05-06T19-20-55-127Z` had max non-initial speed `21.94m/s`,
while the retained proof at `artifacts/perf/2026-05-06T20-14-36-990Z` passes the
speed diagnostic with max non-initial speed `6.1m/s`. The active-driver CJS
mirror and TypeScript harness now suppress ungated enemy reacquisition while the
objective is a zone, and the CJS driver routes aggressive large-map profiles
toward combat-front objectives and continues from route exhaustion through
remembered route direction or a direct anchor continuation instead of zeroing
movement. Rejected intermediate artifacts are `19-56-06-419Z` for the zone loop,
`20-05-44-589Z` for route-exhaustion zero movement, and `20-10-49-441Z` for a
movement-restored but heap-failed run with `49` heading/pacing reversals.
Retained proof `20-14-36-990Z` removes diagnostic heading/pacing findings and
records `150` shots / `18` hits / `6` kills, but remains WARN because objective
closure is only `24.25m`; use it as the current retained baseline, not
skilled-player or objective-flow acceptance.
The paired A Shau retained proof at
`artifacts/perf/2026-05-06T20-23-31-045Z/summary.json` is stronger for combat
volume and route/stuck behavior: measurement trust PASS, validation WARN only on
heap peak growth, `389` shots / `98` hits / `23` kills, max stuck `0.3s`,
`454.31m` player travel, `22` movement transitions, `0` route no-progress
resets, no heading/pacing diagnostic findings, and NPC speed diagnostic PASS
with max non-initial speed `4.5m/s`. The refreshed completion audit now records
Open Frontier and A Shau as trusted active-driver mode-pair proof, while keeping
KB-TERRAIN partial because objective-flow closure remains WARN and human visual
re-review has not accepted the player-bot as a skilled-player proxy.
The latest air-vehicle frustum render-cull slice refreshed KB-CULL owner
evidence at
`artifacts/perf/2026-05-06T22-22-09-798Z/projekt-143-culling-owner-baseline/summary.json`.
Cycle 3 records the selected static-feature/visible-helicopter owner slice as
scoped `evidence_complete`: Open Frontier owner visible draw-call-like is
`117`, A Shau owner visible draw-call-like is `52`, and visible-unattributed
triangles remain below `10%`. Open Frontier total renderer draw calls are still
not a broad closure signal (`506` in the latest after capture), and active
driver route diagnostics remain WARN, so broad HLOD, parked-aircraft playtest,
future vehicle driving, static-cluster, vegetation-distance policy, and whole
KB-CULL closeout remain open.
A scoped vehicle-interaction safety patch now prevents helicopter entry
prompts/entry attempts while already in fixed-wing flight and proves
render-culled helicopters and parked fixed-wing aircraft remain enterable when
the player is on foot. This is unit-level culling safety only; it does not
close broad HLOD, vehicle driving, parked-aircraft playtest, or matched perf.
The latest 2026-05-06 terrain horizon proof is
`artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`,
which supersedes the earlier resource-free horizon proof and is PASS for four
Open Frontier/A Shau elevated screenshots. The latest ground-level terrain
visual-review packet is
`artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/visual-review.json`,
with contact sheet
`artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`.
It is WARN for `14/14` refreshed Open Frontier/A Shau ground, route,
foundation, parking, support, river-oblique, and river-ground screenshots with
zero browser errors because `terrain_water_exposure_review` flags the Open
Frontier river-oblique and river-ground shots as washed out. Treat it as review
packet evidence only: human terrain/river art acceptance, matched perf, and
production parity are still open. The attempted matched Open Frontier perf leg
at
`artifacts/perf/2026-05-06T11-30-35-349Z/summary.json` is rejected as
KB-TERRAIN acceptance evidence: measurement trust, shots/hits, average frame,
and end heap growth passed, but validation failed on `137.50 MB` peak heap
growth and warned on `49.80ms` peak p99. A Shau paired perf was not run from
that acceptance slot because the first leg was already invalid. The same
run now has heap-diagnostic artifact
`artifacts/perf/2026-05-06T11-42-10-167Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`,
which classifies the shape as `transient_gc_wave` with likely source
`vegetation_cell_streaming_or_other_short_lived_runtime_allocations_near_player_traversal`;
it is diagnostic negative evidence, not a fix or acceptance. The same
resource-free proof pass
also added
a fresh culling proof at
`artifacts/perf/2026-05-06T22-12-58-306Z/projekt-143-culling-proof/summary.json`,
a fresh culling owner baseline at
`artifacts/perf/2026-05-06T22-22-09-798Z/projekt-143-culling-owner-baseline/summary.json`,
and initial resource-free runtime captures at
`artifacts/perf/2026-05-06T04-27-07-950Z/summary.json` and
`artifacts/perf/2026-05-06T04-30-51-979Z/summary.json`. Those artifacts are
useful current-runtime evidence, but they do not close Projekt: Open Frontier
and A Shau both have measurement trust PASS with validation WARN, and the logs
still show terrain-stall/backtracking noise.
A follow-up NPC navmesh recovery fix in `CombatantMovement` now rejects
zero-distance current-position backtrack snaps and prefers last-good navmesh
progress or a scored terrain recovery point. Focused movement/stuck tests pass.
After that change, A Shau
`artifacts/perf/2026-05-06T04-46-26-097Z/summary.json` clears the shot gate
with `240` player shots / `170` hits in validation and `118` harness-driver
shots / `44` kills, but remains WARN on p99 `45.70ms`, heap peak growth
`47.81MB`, and repeated terrain backtracking. Open Frontier
`artifacts/perf/2026-05-06T04-51-35-039Z/summary.json` remains WARN on p99
`49.30ms`, heap peak growth `71.33MB`, and low shots; its movement viewer
points at active-driver route/engagement behavior rather than just NPC
backtrack recovery. The attempted Open Frontier frontline compression harness
experiment at `artifacts/perf/2026-05-06T04-58-04-461Z/summary.json` is
rejected diagnostic evidence only: it failed validation with p99 `100ms` and
was reverted.
A local CPU-only active-driver follow-up now makes route overlays drive the
camera-relative movement contract: `movementTarget` is carried through
`src/dev/harness/playerBot/types.ts`,
`src/dev/harness/playerBot/PlayerBotController.ts`, and the injected
`scripts/perf-active-driver.cjs` mirror so the bot faces navmesh path corners
while moving and not firing instead of always facing the far enemy/objective.
Focused validation passes with
`npx vitest run src/dev/harness/playerBot/PlayerBotController.test.ts src/dev/harness/playerBot/states.test.ts src/dev/harness/PlayerBot.test.ts scripts/perf-harness/perf-active-driver.test.js`
and `npm run typecheck`. The first headless Open Frontier diagnostic after that
patch failed perf/engagement validation at
`artifacts/perf/2026-05-06T06-18-15-743Z/summary.json`, but it does show the
specific movement failure improved versus
`artifacts/perf/2026-05-06T06-04-57-681Z/summary.json`: `harness_max_stuck_seconds`
changed from FAIL `176.1s` to PASS `0s`, `blockedByTerrain` changed from `275`
to `0`, and `avgActualSpeed` recovered from `0` to `8.82m/s`. It still fired
`0` shots, remained PATROL-only, and failed `measurement_trust`
(`probeAvg=2368.50ms`, `probeP95=2847ms`), so this is movement diagnostic
evidence only. A follow-up harness-only objective routing patch now makes
aggressive large-mode patrol prefer the nearest live OPFOR objective before
capture-zone fallback, so the next proof run should test target acquisition
instead of wandering zone-to-zone. The driver/capture stream now records
`objectiveKind`, `objectiveDistance`, `nearestOpforDistance`,
`nearestPerceivedEnemyDistance`, `perceptionRange`, path target kind/distance,
and last path query status, so the next browser diagnostic can tell whether the
failure is objective selection, perception entry, pathing, or runtime trust.
Open Frontier and A Shau still need
quiet-machine reruns before the player-stops-moving report, shot gate, or
runtime perf can be closed.
After the stale Edge group was cleaned at `2026-05-06T03:37:49-04:00`, a
headed Open Frontier rerun at
`artifacts/perf/2026-05-06T07-38-14-932Z/summary.json` produced trustworthy
objective/path telemetry but still failed validation: measurement trust PASS,
`0` shots, `nearest_opfor` objective routing, a perceived target around `724m`,
and final path query `failed`. The paired diagnostic is
`artifacts/perf/2026-05-06T07-38-14-932Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
Bounded-segment and far-objective path-planning experiments produced only
rejected diagnostic evidence at
`artifacts/perf/2026-05-06T07-45-35-107Z/summary.json`,
`artifacts/perf/2026-05-06T07-51-32-551Z/summary.json`, and
`artifacts/perf/2026-05-06T07-54-19-080Z/summary.json`; those branches were not
kept as acceptance fixes.
A subsequent terrain/contact and combat-front follow-up fixes the retained
failure path instead of carrying the rejected path-planning experiments:
`perf-capture.ts` now injects runtime helper functions as raw page-init script
content so sampling no longer page-errors on browser-scope helpers,
`TerrainQueries.getEffectiveHeightAt()` treats only low/standable static
support surfaces and explicit helipads as effective ground while leaving tall
generic or dynamic collision bounds in collision checks only, and the large-map
active driver can place a capped player-anchored Open Frontier combat front
while syncing combatant logical positions, rendered anchors, and spatial-grid
entries. The latest headed 20s Open Frontier proof at
`artifacts/perf/2026-05-06T08-52-31-466Z/summary.json` is accepted as
active-driver liveness evidence only: measurement trust PASS, validation WARN,
active gates pass with `33` shots, `19` hits, `6` kills, max stuck `0.5s`, and
`19` movement transitions, and runtime liveness shows
`playerBlockedByTerrain=0`, `collisionHeightDeltaAtPlayer=0`, and movement
debug `blockReason=none`. The paired diagnostic
`artifacts/perf/2026-05-06T08-52-31-466Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
is PASS. This is not KB-TERRAIN acceptance: duration/coverage are short, p99
`53.50ms`, average frame `26.37ms`, hitch50 `0.94%`, and heap peak growth
`77.85MB` remain WARN, and A Shau route/nav acceptance is still open.
A follow-up KB-CULL slice then traced the full-duration Open Frontier failure
to close Pixel Forge NPC children disabling frustum culling. The before
artifact `artifacts/perf/2026-05-06T09-06-03-544Z/summary.json` has measurement
trust PASS but validation FAIL with average frame `31.08ms`, p99 `65.90ms`,
hitch50 `3.78%`, and scene attribution dominated by `weapons` and
`npc_close_glb` draw-call-like counts during the active fight. The retained fix
keeps close NPC body/weapon meshes frustum-cullable and computes missing
bounding spheres. Focused `CombatantRenderer` tests, `npm run typecheck`, and
`npm run build:perf` pass. The matched after pair is now trusted WARN instead
of failed: Open Frontier
`artifacts/perf/2026-05-06T09-09-45-715Z/summary.json` has measurement trust
PASS, validation WARN, average frame `14.81ms`, p99 `47.90ms`, hitch50
`0.04%`, heap peak growth `6.69MB`, `81` shots / `45` hits, max stuck `0.8s`,
and diagnostic PASS at
`artifacts/perf/2026-05-06T09-09-45-715Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
A Shau `artifacts/perf/2026-05-06T09-11-34-037Z/summary.json` has measurement
trust PASS, validation WARN, average frame `9.28ms`, p99 `26.70ms`, hitch50
`0%`, heap peak growth `27.81MB`, `171` shots / `95` hits, max stuck `0.7s`,
and diagnostic PASS at
`artifacts/perf/2026-05-06T09-11-34-037Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
This accepts only the active-driver liveness and close-model frustum-culling
slice. It does not close broad KB-CULL/HLOD, KB-TERRAIN hydrology/water,
ground-cover/trail visual acceptance, or the remaining NPC terrain
backtracking noise.
The owner reported another browser/game-dev agent and an SDS repo overnight
Claude shift may consume resources for several hours. Until that is quiet, do
not run or accept new headed/GPU-heavy perf captures. Future captures must first
check active browser/Node/Bun processes, confirm the game window is not spanning
monitors, and use the `perf-capture.ts` fixed `1920x1080` window position/size
and device-scale-factor clamp. If the same stale resource-consuming processes
remain after roughly three hours, they may be cleaned up before resuming
resource-heavy Projekt work.
KB-TERRAIN now also carries an owner art-direction requirement for
non-uniform vegetation distribution: A Shau should not read as an evenly spaced
mix of every species everywhere. Future vegetation acceptance needs clustered
plant communities, such as bamboo groves, denser palm pockets, hydrology-aware
water-edge palms/understory, and trail-edge/ground-cover transitions backed by
a researched placement model rather than pure scatter density.
The reusable hydrology track is now split into
[PROJEKT_OBJEKT_143_HYDROLOGY.md](PROJEKT_OBJEKT_143_HYDROLOGY.md). The current
static/runtime hydrology audit at
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
is PASS for the runtime classification contract: A Shau DEM wet candidates
cover `6.24%` of sampled cells and Open Frontier procedural wet candidates
cover `2.47%`, with runtime hydrology classification covering `100%` of wet
candidates and leaving `0%` dense-jungle wet candidates in both maps. A Shau
also has a narrow dry lowland `tallGrass` ground-cover band outside hydrology
corridors, which clears the static uniform-biome warning without widening
`riverbank`/`swamp`. That closes the stale broad lowland proxy path; the next
KB-TERRAIN ecology branch should improve clustered visual variety, banks,
trails, and final river visuals with screenshot/perf proof. The same audit
stores top channel paths as bounded
world-space `channelPolylines`, so future river, bank, and trail-crossing work
can start from map-space candidates instead of only raster cell paths.
The review masks for this artifact are
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-mask.png`
and
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-mask.png`.
The same audit writes cache artifacts at
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-cache.json`
and
`artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-cache.json`.
Durable generated caches now also live under
`public/data/hydrology/bake-manifest.json`,
`public/data/hydrology/a_shau_valley-hydrology.json`, and
`public/data/hydrology/open_frontier-42-hydrology.json`, validated by
`npm run check:hydrology-bakes`; `npm run build` copies them to
`dist/data/hydrology/*`. A typed loader exists at
`src/systems/terrain/hydrology/HydrologyBakeManifest.ts`; A Shau and Open
Frontier now default-enable hydrology cache preload plus hydrology-backed
vegetation-biome classification through `src/config/AShauValleyConfig.ts` and
`src/config/OpenFrontierConfig.ts`. Startup treats missing optional hydrology
caches as WARN/no-op instead of blocking terrain startup. The refreshed
completion audit at
`artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json`
records `terrainHydrologyBakeLoaderStatus=default_mode_preload` and
`terrainHydrologyBiomeClassifierStatus=default_mode_vegetation_classifier`.
`TerrainSurfaceRuntime.ts` now also materializes the same wet/channel cache as a
GPU mask for `TerrainMaterial.ts`, so ground texture and roughness selection can
follow hydrology-biome slots by default on large maps. `WaterSystem.ts` now has
a provisional hydrology river-strip mesh consumer wired from startup, while the
current global water plane remains the Open Frontier fallback and stays disabled
for A Shau. Headed runtime proof at
`artifacts/perf/2026-05-06T10-26-04-620Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
confirms Open Frontier has `12` hydrology channels / `592` segments with global
water enabled and A Shau has `12` channels / `552` segments with global water
disabled. This is still not water acceptance: final stream visuals, crossings,
flow, gameplay water queries, and human review remain open.
Short headed runtime proofs after the default-hydrology config change show the
new preload/classifier/material-mask path does not break large-map startup or active-driver
liveness: Open Frontier
`artifacts/perf/2026-05-06T09-51-26-258Z/summary.json` is validation WARN with
measurement trust PASS, no browser errors, p99 `39.40ms`, heap peak growth
PASS `24.92MB`, and `26` shots / `9` hits; A Shau
`artifacts/perf/2026-05-06T09-52-17-998Z/summary.json` is validation WARN with
measurement trust PASS, no browser errors, p99 `26.60ms`, heap peak growth
`72.73MB`, `73` shots / `40` hits, and diagnostic PASS
at
`artifacts/perf/2026-05-06T09-52-17-998Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
These are startup/liveness proofs only, not final terrain visual acceptance.
The latest local vegetation grounding follow-up identifies the owner-reported
light-green half-buried floor leaves as `bananaPlant`, not `fern` or
`elephantEar`. It raises the banana-plant runtime anchor, keeps that low
random imposter on an `18deg` slope cap, adds conservative slope caps to the
remaining random `fern`, `elephantEar`, and `fanPalm` placements, and broadens
the grounding unit/audit coverage so every active runtime vegetation species
has a visible-base near-terrain assertion plus an explicit slope guard where
needed. The refreshed all-runtime-species grounding audit at
`artifacts/perf/2026-05-06T04-09-22-289Z/vegetation-grounding-audit/summary.json`
passes with `6` runtime species and `0` flagged species. Runtime-sampled atlas
rows now show worst visible bases at bambooGrove `-0.074m`, fern `0.17m`,
bananaPlant `0.255m`, fanPalm `-0.094m`, elephantEar `-0.159m`, and coconut
`-0.229m`; no active species retains the severe half-buried profile.
A scale-anchor follow-up found one remaining generator-level risk: random
vegetation scale changed billboard height but not the terrain-center anchor,
so larger instances could sink and smaller instances could float. The terrain
generator now applies `terrainHeight + yOffset * instanceScale` on every
vegetation placement path, keeping those source-alpha base offsets stable
across the random scale band. Focused vegetation tests, the world-feature
regression test, `git diff --check`, the production build, and `validate:fast`
pass; no browser visual acceptance, perf acceptance, release, or production
parity is claimed for this local follow-up yet.
The vegetation source-generator follow-up is now split into
[PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md](PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md):
KB-FORGE owns the local Pixel Forge liaison path, with `EZ-Tree` only as an
optional offline GLB source feeding Pixel Forge rather than replacing it.
Grass, ground cover, and trail-edge variety should come from Pixel Forge
catalog/review work, a licensed asset-library review, or custom low-card bake
before any runtime import. The latest local audit at
`artifacts/perf/2026-05-06T04-11-40-074Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`
is PASS for the local liaison/catalog scope with the Pixel Forge sibling repo
present, all `6` current TIJ runtime vegetation species present, retired
`giantPalm` still visible only as review/provenance, all `6`
blocked/review-only vegetation species still visible as non-runtime records,
and the NPC review package counted as `4` factions, `8` clips, and `32`
impostor packages. Its relevance catalog now records `6` prop families,
`13` vegetation packages, and `5` review queues for ground-cover budget
replacement, trail/route surfaces, base/foundation kits, far-canopy/tree
variety, and NPC/weapon packaging. The local audit command is
`npm run check:projekt-143-pixel-forge`.
2026-05-06 human-observed Open Frontier active-driver reruns still showed
close-contact twitch/cover-like behavior under compressed-frontline stress.
The follow-up driver candidate stabilizes target locks, disables scripted
ENGAGE strafe, keeps close combat aim over route-facing, and preserves
route-progress reset telemetry through `perf-capture`. A later close-pressure
patch also makes the driver hold-and-shoot inside the mode close-contact
distance and fences utility-AI fire-and-fade re-entry behind the same cover
cooldown as the legacy cover finder. Trusted reruns after that patch are now
filed: Open Frontier
`artifacts/perf/2026-05-06T13-45-41-194Z/summary.json` is OK with measurement
trust PASS and validation WARN on p99 only, with diagnostic PASS at
`artifacts/perf/2026-05-06T13-45-41-194Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
(`150` shots, `17` hits, max stuck `4.3s`, `4` route-progress resets, final
far current-target chase around `450m`). A Shau
`artifacts/perf/2026-05-06T13-49-19-901Z/summary.json` is OK with measurement
trust PASS and validation WARN on heap growth/recovery only, with diagnostic
PASS at
`artifacts/perf/2026-05-06T13-49-19-901Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
(`49` shots, `6` hits, max stuck `1.5s`, final zone PATROL, and `500.45m`
objective-distance closure). A later local slice tightens this further: the
driver only interrupts objective travel for visible targets inside the
mode-specific acquisition band, reduces player-anchored frontline compression,
keeps close occluded targets as hold/fire instead of route-thrashing, and the
combat utility cover path now suppresses cover-hop decisions when the threat is
already inside close range. `PlayerMovement` also widens the single-step ground
rise allowance enough to avoid false stalls on stamped/noisy terrain lips while
still rejecting multi-meter cliff jumps. The fresh headed Open Frontier proof
at `artifacts/perf/2026-05-06T14-44-44-702Z/summary.json` is OK with measurement
trust PASS and validation WARN on p99/heap peak only, with diagnostic PASS at
`artifacts/perf/2026-05-06T14-44-44-702Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
It records `102` shots, `17` hits, `37` movement transitions, max stuck `0.3s`,
`0` route no-progress resets, `blockReason=none`, `465.97m` player travel, and
only shallow final objective closure (`17.9m`) while pursuing a nearby OPFOR
inside the acquisition band. Treat these as stronger close-pressure/runtime
liveness evidence, not final skilled-player proxy acceptance; owner visual
review on 2026-05-06 re-confirmed close-pressure cover-like pacing/yaw twitch
under dense nearby NPCs. A later local target-lock patch keeps active close
targets through brief LOS/nearest-enemy churn, but the fresh compressed Open
Frontier browser probe at
`artifacts/perf/2026-05-06T17-25-29-462Z/summary.json` still fails validation
as a skilled-player proxy: measurement trust passes, max stuck is `0.3s`, but
the run records only `1` hit, `10` route target resets, `6` route no-progress
resets, and negative final objective closure. The same review re-raised
airfield building and vehicle foundations hanging over cliff/hill edges; the
world-feature candidate now sends generated airfield structures through the
footprint solver, widens large-prop flat-search, and the terrain compiler now
keeps circular feature surfaces inside the guaranteed-flat stamp with a graded
helipad shoulder. The latest rebuilt visual packet is
`artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/visual-review.json`;
it adds airfield, parking, support-foundation, and hydrology views to the
earlier ground/route set and now WARNs on Open Frontier river overexposure
while remaining clear of browser/page errors. This is improved evidence, not
final acceptance: the contact sheet still shows artificial Open Frontier
water/pads and glare-heavy A Shau foundation review shots, so the pads still
need owner visual review, matched perf, and a Pixel Forge building/vehicle GLB
shortlist plus optimization review for future vehicle-driving surfaces. The
current asset inventory at
`artifacts/perf/2026-05-06T13-16-02-955Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
adds GLB metadata for that shortlist: `12` building candidates total `5,704`
triangles, runtime structures total `7,528` triangles, and `30` static
ground/building/structure entries are medium/high optimization risk mostly from
mesh/material/primitive fragmentation, not triangle weight. It also catalogs
the sibling Pixel Forge gallery as `19` building GLBs totaling `18,338`
triangles and `5` ground-vehicle GLBs totaling `5,272` triangles for future
side-by-side replacement and vehicle-driving review. A dedicated structure
review artifact at
`artifacts/perf/2026-05-06T16-45-59-860Z/projekt-143-pixel-forge-structure-review/structure-review.json`
plus contact sheet
`artifacts/perf/2026-05-06T16-45-59-860Z/projekt-143-pixel-forge-structure-review/structure-contact-sheet.png`
now shows `19/19` building candidates and `5/5` current ground-vehicle GLBs
have review grids. The vehicle grids are TIJ-generated artifacts rendered from
current Pixel Forge GLBs without mutating Pixel Forge `war-assets`; this closes
the source-gallery visual evidence gap, not wheel/contact/pivot checks,
collision proxies, driving surfaces, runtime replacement, or perf. The follow-up
terrain placement audit is now PASS at
`artifacts/perf/2026-05-06T14-51-23-773Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
after moving the remaining TDM and Zone Control seed-variant flat pads away
from high native relief. This clears the static foundation-relief audit only;
the visual packet still needs owner review, matched runtime perf, and the Pixel
Forge building/vehicle replacement branch before KB-TERRAIN can close.
The later large-foundation hardening pass measured the warehouse GLB's scaled
runtime footprint at about `17.5m` radius, removed the old small-prop runtime
cap (`10m` footprint / `9.5m` terrain-sample radius), and now lets large static
placements score/search against a `24m` placement envelope with terrain relief
sampling out to `18m`. The static audit also uses model-aware generated
airfield placement proxies for known large buildings and ground vehicles. A
follow-up audit fix found those generated placements were reading `world.z`
from a `THREE.Vector2`, so the prior pass underreported native relief for
airfield buildings, parked aircraft, and ground vehicles. Latest placement
audit:
`artifacts/perf/2026-05-07T00-32-41-375Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
is PASS with `57` audited features and `fail=0` / `warn=0` across all audited
modes and seed variants. This is still static placement evidence, not Pixel
Forge replacement, human visual foundation acceptance, matched perf, water art
acceptance, or future vehicle-driving-surface acceptance.
Latest KB-TERRAIN visual refresh, 2026-05-07T00Z: the static placement audit
now passes at
`artifacts/perf/2026-05-07T00-32-41-375Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
with `57` audited features and `0` warns/fails across all audited modes and
seed variants. The refreshed visual-review packet at
`artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/visual-review.json`
plus contact sheet
`artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`
captures all `14/14` expected Open Frontier/A Shau ground, route, foundation,
parking, support, and hydrology screenshots with zero browser/page errors, and
now WARNs on `terrain_water_exposure_review` for the two Open Frontier river
shots (`0.81` / `0.8259` overexposed ratio). Manual contact-sheet review still
rejects this as KB-TERRAIN closeout evidence: Open Frontier water and some
airfield/support pad compositions look too flat or artificial, A Shau
foundation shots are glare-heavy, and the river/hydrology shots demonstrate
presence rather than natural final water art. Treat this as a fresh
owner-review packet and routing aid, not final terrain, water, foundation,
matched-perf, or production acceptance.
Fresh sequential KB-LOAD startup baselines after the short-palm retirement and
upload-summary patch are filed at
`artifacts/perf/2026-05-05T04-24-07-730Z/startup-ui-open-frontier/summary.json`
and
`artifacts/perf/2026-05-05T04-25-31-931Z/startup-ui-zone-control/summary.json`;
the refreshed kickoff now carries non-null largest-upload tables. Open Frontier
averages `5198ms` mode-click-to-playable, `4466.333ms`
deploy-click-to-playable, `845.733ms` WebGL upload total, and `30.967ms`
average max upload. Zone Control averages `5417ms` mode-click-to-playable,
`4887ms` deploy-click-to-playable, `841.6ms` WebGL upload total, and
`39.067ms` average max upload. The short palm no longer appears as the
largest-upload failure; current top targets are Pixel Forge vegetation
imposters/normals and NPC animated albedo atlases. This is current
upload/residency attribution, not a startup-latency closeout.
A proof-only KB-LOAD candidate hook now exists for startup measurement:
`scripts/perf-startup-ui.ts --disable-vegetation-normals` injects a runtime
flag before app startup, skips vegetation normal-map binding, forces the
vegetation shader profile to `hemisphere`, records
`candidateFlags.disableVegetationNormals=true`, and writes candidate artifacts
under `startup-ui-<mode>-vegetation-normals-disabled/` so default kickoff
selection does not confuse them with baselines. Default runtime still loads
vegetation normal maps. The latest Open Frontier candidate at
`artifacts/perf/2026-05-05T05-31-24-775Z/startup-ui-open-frontier-vegetation-normals-disabled/summary.json`
averaged `4420ms` mode-click-to-playable and `3741.333ms`
deploy-click-to-playable, but its upload table is contaminated by a large
`(inline-or-unknown)` upload (`1736.4ms` max) and `1365.8ms` average upload
total. The cleaner Zone Control candidate at
`artifacts/perf/2026-05-05T05-28-07-843Z/startup-ui-zone-control-vegetation-normals-disabled/summary.json`
averaged `3203.667ms` mode-click-to-playable, `2631.667ms`
deploy-click-to-playable, `767.467ms` WebGL upload total, `41.267ms` average
max upload, and `492.667` upload calls. Treat this as candidate evidence only:
the default runtime still keeps vegetation normal maps, and the no-normal path
is rejected for default policy while the latest visual proof remains WARN. A
future no-normal branch would need a fresh PASS or owner-accepted
KB-OPTIK screenshot/luma/chroma review before it could become accepted runtime
or Pixel Forge bake policy. The latest visual A/B companion
was refreshed after the banana albedo cleanup at
`artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/summary.json`
with contact sheet
`artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/contact-sheet.png`.
It captured `8/8` screenshots, `4/4` default-versus-no-normal pairs, renderer
stats, vegetation counters, and `0` browser/page/request failures. It remains
WARN because the visual deltas now exceed the current review band, so human
visual review did not mechanically clear the candidate. Do not remove
vegetation normal maps from default runtime or Pixel Forge bake policy from
this evidence.
The current KB-LOAD local branch narrows NPC imposter startup residency:
`CombatantRenderer` now eagerly creates only `idle` and `patrol_walk` Pixel
Forge NPC imposter buckets, and lazily creates uncommon faction/clip buckets
when a visible far NPC first needs them. Accepted Open Frontier evidence at
`artifacts/perf/2026-05-05T16-36-44-588Z/startup-ui-open-frontier/summary.json`
averages `4526.7ms` mode-click-to-playable, `3867.7ms`
deploy-click-to-playable, `437.6ms` WebGL upload total, `35.87ms` average max
upload, and `459.33` upload calls. Accepted Zone Control evidence at
`artifacts/perf/2026-05-05T16-39-16-223Z/startup-ui-zone-control/summary.json`
averages `2994.3ms` mode-click-to-playable, `2458.7ms`
deploy-click-to-playable, `415ms` WebGL upload total, `39.5ms` average max
upload, and `321.33` upload calls. This is a scoped KB-LOAD startup/upload
improvement, not Projekt completion, production parity, or approval to remove
vegetation normals. The stricter no-eager NPC variant was rejected after
Open Frontier
`artifacts/perf/2026-05-05T16-33-44-776Z/startup-ui-open-frontier/summary.json`
and Zone Control
`artifacts/perf/2026-05-05T16-34-47-581Z/startup-ui-zone-control/summary.json`
because Zone deploy-click-to-playable regressed versus the idle/patrol-eager
candidate; a noisy Zone rerun at
`artifacts/perf/2026-05-05T16-37-49-634Z/startup-ui-zone-control/summary.json`
is retained as outlier evidence due to a single fanPalm normal upload spike.
The follow-up KB-LOAD startup branch defers Pixel Forge close-GLB NPC pools
until after live entry, keeps close NPCs visible as imposters while their GLB
pool is pending, moves live-entry deferred warmups until after the first
post-reveal frame/timeout, and fixes `perf-startup-ui` so DOM-playable polling
is not tied to `requestAnimationFrame`. Clean accepted startup evidence is
Open Frontier
`artifacts/perf/2026-05-05T18-49-03-248Z/startup-ui-open-frontier/summary.json`
at `4324.3ms` mode-click-to-playable, `3622ms` deploy-click-to-playable,
`417.367ms` WebGL upload total, `31.467ms` average max upload, and `149`
upload calls; and Zone Control
`artifacts/perf/2026-05-05T18-47-51-310Z/startup-ui-zone-control/summary.json`
at `2774.3ms` mode-click-to-playable, `2138.7ms`
deploy-click-to-playable, `415.1ms` WebGL upload total, `36.433ms` average max
upload, and `116` upload calls. The contaminated Open Frontier rerun at
`artifacts/perf/2026-05-05T18-47-02-323Z/startup-ui-open-frontier/summary.json`
is retained as diagnostic because one coconut normal upload spiked to
`1708ms`. This branch is a scoped startup/readiness improvement; it does not
close KB-LOAD texture policy, vegetation-normal visual review, production
parity, or Projekt completion.
The follow-up manifest-level vegetation-normal cleanup removes hemisphere-only
ground-cover normal maps from `PIXEL_FORGE_TEXTURE_ASSETS` and keeps the GPU
billboard path from fetching normal textures for `hemisphere` shader profiles.
Fresh post-build startup evidence after that cleanup is Open Frontier
`artifacts/perf/2026-05-05T22-06-32-013Z/startup-ui-open-frontier/summary.json`
at `3405.7ms` mode-click-to-playable, `2607ms`
deploy-click-to-playable, `526ms` WebGL upload total, `55.633ms` average max
upload, and `143` upload calls; and Zone Control
`artifacts/perf/2026-05-05T22-05-09-285Z/startup-ui-zone-control/summary.json`
at `1897ms` mode-click-to-playable, `1269.7ms`
deploy-click-to-playable, `439.067ms` WebGL upload total, `39.867ms` average
max upload, and `110` upload calls. Both captures have `0` page/request
errors. A noisy discarded Open Frontier run at
`artifacts/perf/2026-05-05T22-04-19-550Z/startup-ui-open-frontier/summary.json`
is retained as diagnostic because one fanPalm color upload spiked to
`3594.5ms`. This evidence supports no startup regression from the manifest
cleanup; it does not prove WebGL upload-count reduction or close KB-LOAD.
Latest KB-LOAD candidate startup proof, 2026-05-07T00Z: `perf-startup-ui`
now has a proof-only `--use-vegetation-candidates` mode that serves the Pixel
Forge 256px vegetation candidates from the dry-run import plan without copying
or accepting runtime assets. Fresh current-before startup tables are
`artifacts/perf/2026-05-07T00-17-33-822Z/startup-ui-open-frontier/summary.json`
and
`artifacts/perf/2026-05-07T00-18-29-720Z/startup-ui-zone-control/summary.json`.
Proof-only candidate tables are
`artifacts/perf/2026-05-07T00-21-34-591Z/startup-ui-open-frontier-vegetation-candidates/summary.json`
and
`artifacts/perf/2026-05-07T00-22-34-000Z/startup-ui-zone-control-vegetation-candidates/summary.json`.
The refreshed selector at
`artifacts/perf/2026-05-07T00-26-06-920Z/projekt-143-load-branch-selector/load-branch-selector.json`
is `candidate_startup_proof_ready`: Open Frontier mode-click-to-playable delta
is `-2337.333ms`, Zone Control mode-click-to-playable delta is `-2530.666ms`,
Open Frontier WebGL upload-total delta is `-153.067ms`, Zone Control
upload-total delta is `-141.5ms`, and `12` color/normal/meta runtime URL
substitutions were active. This is strong branch evidence, not import approval:
owner visual acceptance, accepted `--apply --owner-accepted` import, in-game
visual proof, production parity, and release validation remain open.
The current KB-CULL local branch tightens owner-baseline evidence selection so
failed validation artifacts cannot be promoted merely because measurement trust
passed, then groups nearby static features into `700m` render sectors that
batch compatible static placements once per sector. Deterministic proof passes
at
`artifacts/perf/2026-05-05T20-57-39-664Z/projekt-143-culling-proof/summary.json`,
and the current owner baseline passes at
`artifacts/perf/2026-05-05T21-19-08-037Z/projekt-143-culling-owner-baseline/summary.json`.
The sector candidate is not a KB-CULL closeout: owner draw-call-like improves
versus the latest clean baseline in both large modes, but Open Frontier total
renderer draw calls still regress (`811` after versus `587` clean-before), so
formal kickoff keeps KB-CULL at `ready_for_branch`. A `350m` sector variant was
tested and rejected because it erased the owner-path improvement while keeping
Open Frontier draw calls high.

## Shipped Cycle 0 State

Cycle 0 evidence payload shipped on `master` at
`475aa7792c51823184c454a0b63852e79da2285d` through manual Deploy workflow run
`25262818886`. Live Pages `/asset-manifest.json` returned that payload SHA,
`/`, `/sw.js`, `/asset-manifest.json`, the A Shau R2 DEM URL, hashed JS/CSS,
and Recast WASM assets returned `200`, and a live browser smoke reached the
Zone Control deploy UI with no console, page, request, or retry-panel failures.
Doc-only release-state commits may advance `master`; the live
`/asset-manifest.json` remains the current deployed SHA source of truth.

Shipped payload:

- Measurement trust and scene attribution in `scripts/perf-capture.ts`.
- Startup UI evidence expansion in `scripts/perf-startup-ui.ts` and
  `scripts/perf-browser-observers.js`: long tasks, long animation frames, CPU
  profiles, WebGL texture-upload attribution, source URLs, and summary upload
  totals.
- Stable retail startup labels in `src/core/SystemInitializer.ts`.
- Live-entry user-timing marks in `src/core/LiveEntryActivator.ts`; the bounded
  frame-yield guard did not fix the stall and must be treated as observability,
  not remediation.
- Pixel Forge texture acceptance audit in
  `scripts/pixel-forge-texture-audit.ts`, exposed through
  `npm run check:pixel-forge-textures`.
- Grenade-spike attribution in `src/systems/weapons/GrenadeEffects.ts` and
  `scripts/perf-grenade-spike.ts`, exposed through
  `npm run perf:grenade-spike`.
- Pixel Forge imposter optics audit in
  `scripts/pixel-forge-imposter-optics-audit.ts`, exposed through
  `npm run check:pixel-forge-optics`.
- Vegetation horizon audit in `scripts/vegetation-horizon-audit.ts`, exposed
  through `npm run check:vegetation-horizon`.
- WebGL/WebGPU strategy audit in `scripts/webgpu-strategy-audit.ts`, exposed
  through `npm run check:webgpu-strategy`.
- Cycle 0 static evidence suite in `scripts/projekt-143-evidence-suite.ts`,
  exposed through `npm run check:projekt-143`.
- Recovery ledger and current-state documentation updates.

Explicitly not ready to ship as a fix:

- Any downscale/regeneration of Pixel Forge textures.
- Any removal of vegetation normal maps.
- Any grenade-spike remediation claim.
- Any imposter brightness, size, or atlas-regeneration remediation claim.
- Any distant-canopy or barren-horizon remediation claim.
- Any Open Frontier startup performance claim.
- Any WebGPU migration implementation.
- Any Phase 3 remediation execution.

## Phase 1 State Of The Project

### Source And Deployment Truth

- Current source truth at Phase 1 sign-off: `master` and `origin/master` at
  `5fd4ba34e28c4840b0f72e1a0475881d050122a1`.
- Latest live Pages manifest checked on 2026-05-02 reported the same SHA:
  `https://terror-in-the-jungle.pages.dev/asset-manifest.json`.
- Latest manual Deploy workflow checked on 2026-05-02: run `25247508549`,
  successful for `5fd4ba34e28c4840b0f72e1a0475881d050122a1`.
- Local `dist/` and `dist-perf/` were stale during the Phase 1 audit and
  pointed at `f99181a0bf8a6b2a8684fc1ae3796022c16aad22`. They were refreshed
  during the 2026-05-02 KB-METRIK/KB-LOAD continuation and now write manifests
  for `5fd4ba34e28c4840b0f72e1a0475881d050122a1`. They remain local evidence,
  not production truth.

### Runtime Architecture As Found

- Renderer: WebGL-only runtime through `THREE.WebGLRenderer` in
  `src/core/GameRenderer.ts`; ACES tone mapping and sRGB output are active.
  No deployable WebGPU renderer path was found.
- Render loop: `src/core/GameEngineLoop.ts` updates systems, renders the main
  scene, then renders weapon and grenade overlays. There is no centralized
  render graph or scene-owner inventory.
- Terrain: CDLOD instanced terrain with CPU quadtree selection and shader
  displacement. This path has real tile culling, but `CDLODQuadtree.selectTiles`
  still returns a copied array in the hot path.
- Vegetation: Pixel Forge vegetation is imposter-only. Runtime culling is
  terrain-cell residency plus shader distance fade, not Three object frustum
  culling. There is no outer canopy layer for elevated cameras.
- NPC rendering: close Pixel Forge GLBs inside 64m with a global 128 close
  cap; mid/far animated imposters out to a hard 400m render cutoff. Close GLB
  meshes and imposter buckets disable Three object frustum culling.
- Static world features: buildings and structures load through
  `WorldFeatureSystem`, are optimized per placement, snapped to terrain, and
  stay resident for the mode. No explicit distance, sector, or HLOD culling was
  found for static feature objects.
- Effects: combat effects are mostly pooled. Fresh KB-EFFECTS instrumentation
  reproduces a first-use grenade detonation stall, but attributes the
  measured grenade JS work to about 1ms rather than particle, damage, audio, or
  scene-add/remove cost.

### Tooling Trust Assessment

- Existing tools include `perf-capture.ts`, `perf-compare.ts`,
  `perf-startup-ui.ts`, `mode-load-profiler.ts`, `asset-load-analyzer.ts`,
  `memory-growth-tracker.ts`, browser long-task observers, renderer stats,
  frame/system timing telemetry, and opt-in GPU timer queries.
- The latest local `combat120` artifact,
  `artifacts/perf/2026-05-02T07-29-13-476Z`, failed hard with avg/p99 frame
  time at 100ms and Combat over budget in every sample.
- That same artifact reported harness probe round-trip average `123.96ms`,
  making the measurement path itself suspect. Until KB-METRIK certifies
  measurement trust, perf numbers from this artifact carry an asterisk.
- GitHub Actions perf remains advisory because the perf capture and compare
  steps continue on error under Xvfb.

### Suspect Asset Inventory

Static GLB/PNG parse only; no per-class runtime draw-call attribution exists
yet.

| Asset Class | Count | Static Size | Static Cost | Culling Status |
| --- | ---: | ---: | ---: | --- |
| Helicopters | 3 GLBs | 440 KB | 224 primitives / 3,384 tris | Distance/fog render visibility; no per-part LOD beyond batching/static optimization. |
| Buildings | 12 GLBs | 721 KB | 400 primitives / 5,704 tris | No explicit distance/HLOD culling found. |
| Structures | 34 GLBs | 1.59 MB | 824 primitives / 14,620 tris | Same static feature path as buildings. |
| Close NPC GLBs | 4 GLBs | 2.98 MB | 27 primitives / 2,662 tris / 8 animations each | Close pool inside 64m, global cap 128. |
| NPC imposters | 32 PNG atlases + 32 JSON | 19.6 MB PNG | all atlases `2688x1344` | Instanced buckets, `frustumCulled=false`, 400m render cutoff. |
| Vegetation imposters | 7 species, 14 PNGs + 7 JSON | 6.96 MB PNG | up to `4096x2048` | Cell residency plus shader fade; no distant canopy replacement. |

### Phase 1 Signed Finding

The project is not beyond recovery, but it has crossed into a state where
optimization without attribution would be self-deception. The immediate blocker
is measurement credibility. The current artifacts can show that a frame is bad;
they cannot reliably assign cost to helicopters, buildings, vegetation
imposters, NPC imposters, combat effects, startup work, shader compilation, or
harness overhead.

## Phase 2 / Cycle 1 Baseline Certification

Cycle 1 local source and build truth:

- Source HEAD: `cef45fcc906ebe4357009109e2186c83c2a38426`.
- Local `dist/asset-manifest.json` and `dist-perf/asset-manifest.json` both
  report `cef45fcc906ebe4357009109e2186c83c2a38426`.
- `npm run doctor` passed on Node `24.14.1`, Playwright `1.59.1`.
- `npm run check:projekt-143` passed and wrote
  `artifacts/perf/2026-05-02T22-05-00-955Z/projekt-143-evidence-suite/suite-summary.json`.
- Cycle 1 bundle certification wrote
  `artifacts/perf/2026-05-02T22-24-03-223Z/projekt-143-cycle1-benchmark-bundle/bundle-summary.json`
  plus `projekt-143-cycle1-metadata.json` sidecars into each source artifact.

Baseline bundle status: WARN. The Cycle 1 docs/tooling release was initially deployed at
`806d5fa43d63854dd80496a67e8aaef4a741c627` after CI run `25263686228` and
manual Deploy workflow run `25264091996` passed. At that release, live Pages
`/asset-manifest.json` reported that SHA; Pages shell, service worker, manifest,
representative public assets, Open Frontier navmesh/heightmap assets, the A Shau
R2 DEM URL, and Recast WASM/build assets returned `200` with the expected
cache/content headers; a live Zone Control smoke reached the deploy UI without
console, page, request, or retry failures. This verifies the docs/tooling
release only; it is not a remediation or optimization claim. Later doc-only
release-state commits may advance `master`; live `/asset-manifest.json` remains
the exact current deployed SHA source of truth.

Agent-DX follow-up: `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e` added
repo-native workflow dispatch wrappers plus stable mobile UI gate state hooks.
Manual CI run `25265347136` passed lint, build, test, perf, smoke, and mobile UI;
manual Deploy workflow run `25265623981` passed; live `/asset-manifest.json`
reported `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e`; live header checks and a
Zone Control browser smoke passed. This is release workflow and mobile gate
hardening only, not a rendering, asset, grenade, culling, or WebGPU remediation.
Release-DX hardening `5f46713d101f6fea974da6d77f303c95df58000c` opted the
deploy workflow's JavaScript actions into Node 24 and aligned the docs after
manual CI run `25265757159`, Deploy run `25266081872`, live manifest/header
checks, and a Zone Control browser smoke passed.

| Probe | Artifact | Trust | Result |
| --- | --- | --- | --- |
| Open Frontier startup | `artifacts/perf/2026-05-02T22-07-48-283Z/startup-ui-open-frontier` | Diagnostic startup evidence, not perf-capture trust | Three headed retail runs averaged `6180.7ms` mode-click-to-playable and `5165.0ms` deploy-click-to-playable. WebGL upload attribution and three CPU profiles are present. Largest uploads again include Pixel Forge vegetation/NPC atlases; max upload was `2780.5ms`. |
| Zone Control startup | `artifacts/perf/2026-05-02T22-08-46-576Z/startup-ui-zone-control` | Diagnostic startup evidence, not perf-capture trust | Three headed retail runs averaged `6467.7ms` mode-click-to-playable and `5312.7ms` deploy-click-to-playable. WebGL upload attribution and three CPU profiles are present. The largest upload was giantPalm albedo at `2608.2ms`. |
| combat120 | `artifacts/perf/2026-05-02T22-09-13-541Z` | FAIL (`probeAvg=149.14ms`, `probeP95=258ms`) | Frame numbers are not trusted for regression decisions. The artifact still records renderer stats, browser long tasks/LoAF entries, and scene attribution; validation failed with avg/p95/p99/max frame all clamped at `100ms`. |
| Open Frontier short | `artifacts/perf/2026-05-02T22-11-29-560Z` | PASS (`probeAvg=15.72ms`, `probeP95=26ms`, missed `0%`) | Trusted as a WARN capture: avg `23.70ms`, p95 `29.20ms`, p99 `32.70ms`, max `100ms`, 4 hitches above `50ms`, renderer stats and scene attribution present with visible-unattributed triangles at `0%`. |
| A Shau short | `artifacts/perf/2026-05-02T22-15-19-678Z` | PASS (`probeAvg=10.52ms`, `probeP95=18ms`, missed `0%`) | Trusted as a WARN capture: avg `12.04ms`, p95 `18.30ms`, p99 `31.50ms`, max `48.50ms`, no `>50ms` hitches, renderer stats and scene attribution present with visible-unattributed triangles at `0%`. |
| Low-load grenade spike | `artifacts/perf/2026-05-02T22-19-40-381Z/grenade-spike-ai-sandbox` | Diagnostic effect-attribution evidence | Two-grenade probe with `npcs=2` reproduced the first-use stall: baseline p95/p99/max `21.8/22.6/23.2ms`, detonation p95/p99/max `23.7/32.5/100ms`, one `387ms` long task and two LoAF entries. Grenade JS timing stayed small (`kb-effects.grenade.frag.total=2.5ms` total); CPU profile is present. |

Measurement-trust assessment:

- Harness overhead is acceptable for Open Frontier short and A Shau short only.
- Browser long-task and long-animation-frame observers are present in all
  browser artifacts.
- CPU profiles are present for startup UI and grenade-spike artifacts, but not
  for the steady-state perf captures because those were not run with deep CDP.
- WebGL upload attribution is present only for startup UI artifacts; it is
  intentionally disabled for steady-state and grenade runtime probes.
- Renderer stats and scene attribution are present for steady-state perf
  captures. KB-CULL can use Open Frontier and A Shau scene attribution, but not
  combat120, because combat120 measurement trust failed.

The Asset Acceptance Standard is now documented in
[ASSET_ACCEPTANCE_STANDARD.md](ASSET_ACCEPTANCE_STANDARD.md). It formalizes the
texture, mipmapped-memory, atlas-density, normal-map, triangle/draw-call,
LOD/culling, screenshot, and perf-evidence gates for Pixel Forge and other
runtime assets.

## Phase 2 Bureau Tracker

### KB-METRIK - Telemetry And Instrumentation

Status: ACTIVE.

Progress:

- 2026-05-02: `scripts/perf-capture.ts` now computes a measurement-trust
  report from harness probe round-trip time, missed runtime samples, and sample
  presence. Each capture writes `measurement-trust.json`, embeds the same report
  in `summary.json`, and adds a `measurement_trust` check to `validation.json`.
  This makes an untrusted capture visibly untrusted before its frame-time
  numbers are used for regression decisions.
- 2026-05-02: Perf capture now uses the same loopback address for server bind
  and browser navigation (`127.0.0.1`). This removes Windows `localhost`/IPv6
  ambiguity from startup evidence.
- 2026-05-02: Scene attribution is now captured as a separate
  `scene-attribution.json` artifact after the runtime sample window. It is
  intentionally outside the sample loop so asset census work cannot pollute
  frame timing or harness probe measurements. The artifact includes per-bucket
  examples and treats zero-live-instance instanced meshes as zero live
  triangles.
- 2026-05-02 evidence split:
  `artifacts/perf/2026-05-02T16-16-25-740Z` showed headless Chromium was not a
  trusted measurement environment in this session: engine frames advanced
  slowly and measurement trust failed. `artifacts/perf/2026-05-02T16-37-21-875Z`
  was a headed perf-build control with measurement trust PASS
  (`probeAvg=14.00ms`, `probeP95=17.00ms`, missed samples `0%`), avg frame
  `14.23ms`, no browser errors, heap recovery PASS, and validation WARN only
  for peak p99 `31.70ms`.
- 2026-05-02 attribution finding:
  `artifacts/perf/2026-05-02T16-37-21-875Z/scene-attribution.json` now
  classifies terrain, water, atmosphere, vegetation imposters, NPC imposters,
  close NPC GLBs, weapons, world static features, debug overlays, and remaining
  unattributed objects using actual runtime model-path prefixes and effective
  parent visibility. Visible unattributed triangles are now 244, below 1% of
  the main-scene visible triangle census in this control capture.
- 2026-05-02: Startup system-init marks now use stable `SystemRegistry` keys
  instead of constructor names. Retail minification had reduced system labels
  to names such as `Qp` and `Zh`, which made production-shaped startup
  evidence hard to interpret. The first validation capture after the patch is
  `artifacts/perf/2026-05-02T18-35-49-488Z/startup-ui-open-frontier`.
- 2026-05-02 initialization-risk finding:
  the same scene census shows that `npcs=0` still builds resident but hidden
  close-NPC pools: `npc_close_glb` has 1,360 meshes / 132,840 resident triangles
  and `weapons` has 8,480 meshes / 133,440 resident triangles, both with
  `visibleTriangles=0`. This is not a steady-state render cost in the control
  scene, but it is credible startup, memory, shader/material, and first-use
  work for KB-LOAD and KB-CULL to investigate.

Deliverables:

- Measurement-trust certification in perf artifacts.
- Reproducible benchmark scenes for `ai_sandbox`/`combat120`,
  `open_frontier`, `team_deathmatch`, `zone_control`, and `a_shau_valley`.
- CPU frame timing, system timing, browser stall, renderer stats, GPU timing,
  load-stage timing, and asset-class attribution captured in the same artifact
  family.
- Clear pass/warn/fail criteria for whether a capture is usable as evidence.

Acceptance:

- Every perf capture writes a measurement-trust artifact.
- A capture with high harness probe overhead or missed samples is marked
  untrusted before its frame-time numbers are used for regression decisions.
- At least one short non-combat control capture and one combat capture can be
  compared without relying on stale `dist` or a failed newest artifact.
- Scene attribution identifies the remaining unattributed draw/triangle cost to
  below 10% of visible scene triangles before KB-CULL uses it as certification
  evidence.

### KB-LOAD - Initialization And Cold Start

Status: UPLOAD ATTRIBUTION ACTIVE; VEGETATION-NORMAL PROOF HOOK LOCAL; CLOSEOUT BLOCKED ON VISUAL REVIEW AND FOLLOW-UP RESIDENCY EVIDENCE.

Progress:

- 2026-05-02: A fresh retail build passed before startup measurement. The
  generated `dist/asset-manifest.json` reports
  `5fd4ba34e28c4840b0f72e1a0475881d050122a1`.
- 2026-05-02: Retail headed startup benchmark, three runs each:
  `artifacts/perf/2026-05-02T18-30-01-826Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-02T18-30-45-200Z/startup-ui-zone-control`.
  Open Frontier averaged `5457.3ms` from mode click to playable; Zone Control
  averaged `5288.3ms`. This supports a real post-selection delay, but the
  Open Frontier delta over Zone Control was only `169.0ms` in this sample and
  is not yet enough to certify it as the uniquely worst mode.
- 2026-05-02: The startup split points to live-entry work after deploy click,
  not only pre-deploy mode preparation. Open Frontier averaged `1156.6ms` in
  `engine-init.start-game.*` marks and `3893.2ms` from
  `engine-init.startup-flow.begin` to `interactive-ready`; Zone Control
  averaged `1177.1ms` and `3633.5ms` respectively.
- 2026-05-02: In the measured Open Frontier startup marks, the largest named
  pre-deploy stage was deploy-select setup at `453.8ms` average. Height-source,
  terrain-feature compilation, terrain config, navmesh, feature application,
  and `setGameMode` were all individually below `100ms` average. This narrows
  KB-LOAD's first investigation to live-entry spawn warming, hidden pool
  construction, shader/material first-use, and deploy selection work.
- 2026-05-02: After stable startup labels landed, a one-run Open Frontier
  retail validation at
  `artifacts/perf/2026-05-02T18-35-49-488Z/startup-ui-open-frontier` showed
  `systems.init.combatantSystem` consumed `576.9ms` during initial engine boot,
  while `systems.init.firstPersonWeapon` consumed `62.0ms` and
  `systems.init.terrainSystem` consumed `49.0ms`. This ties the hidden
  close-NPC/weapon pool evidence to the combat renderer initialization path,
  but it explains initial boot cost more directly than the post-deploy
  live-entry stall.
- 2026-05-02: Live-entry startup marks were added around hide-loading,
  player positioning, terrain chunk flush, renderer reveal, player/HUD enable,
  audio start, combat enable, background task scheduling, and `enterLive()`.
  A three-run Open Frontier startup validation at
  `artifacts/perf/2026-05-02T19-01-27-585Z/startup-ui-open-frontier` still
  averaged `5298.0ms` from mode click to playable. The live-entry span averaged
  about `3757ms`, and essentially all of it was inside
  `flush-chunk-update` after the synchronous terrain update had finished.
- 2026-05-02: The bounded frame-yield guard did not reduce the local stall.
  In the same validation, the yield still resolved through `requestAnimationFrame`
  rather than the `100ms` timeout. A follow-up one-run startup artifact with
  browser-stall capture,
  `artifacts/perf/2026-05-02T19-03-09-195Z/startup-ui-open-frontier`, recorded
  `startup-flow-total=3804.3ms`, `frame-yield-wait=3802.1ms`, and a single
  `3813ms` long task starting at `4571.2ms`. Startup marks put
  `engine-init.startup-flow.flush-chunk-update.terrain-update-end` at
  `4513.4ms` and the yield return at `8315.5ms`, so the current lead is a
  main-thread long task/page-task starvation during the yield window, not the
  terrain update call itself.
- 2026-05-02: Long-task attribution was extended with browser attribution
  arrays and per-iteration Chrome CPU profiles. The follow-up artifact
  `artifacts/perf/2026-05-02T19-11-07-930Z/startup-ui-open-frontier` measured
  `modeClickToPlayable=5535ms`, `deployClickToPlayable=4688ms`,
  `startup-flow-total=3841.7ms`, `frame-yield-wait=3838.6ms`, and a `3850ms`
  long task after terrain update. Browser long-task attribution still reported
  `unknown/window`, but the CPU profile's dominant self-time was
  `je` in `build-assets/three-DgNwuF1l.js` at `3233.9ms`. Inspecting the
  generated bundle maps that function to Three's WebGLState wrapper around
  `texSubImage2D`. Current KB-LOAD lead: live-entry is blocked by first-present
  WebGL texture upload/update work, not by synchronous terrain chunk update.
- 2026-05-02: A diagnostic WebGL texture-upload observer now wraps texture
  upload calls during startup UI captures. This is intentionally intrusive and
  must be treated as attribution evidence, not as a clean frame-time baseline.
  The first asset-named artifact,
  `artifacts/perf/2026-05-02T19-19-47-099Z/startup-ui-open-frontier`, recorded
  `webglTextureUploadCount=324`, `webglTextureUploadTotalDurationMs=3157.8ms`,
  and `webglTextureUploadMaxDurationMs=2342.3ms`. All material upload time was
  in `texSubImage2D`. The largest single upload was
  `assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png`
  (`4096x2048`, `2342.3ms`), followed by its normal map (`48.8ms`), Pixel Forge
  vegetation imposter maps at `2048x2048`, and Pixel Forge NPC animated albedo
  atlases at `2688x1344`.
- 2026-05-02: The startup summary path now surfaces WebGL upload counts and
  durations directly in `summary.json`. Validation artifact
  `artifacts/perf/2026-05-02T19-21-53-436Z/startup-ui-open-frontier` recorded
  `webglTextureUploadCount=345`, `webglTextureUploadTotalDurationMs=2757.2ms`,
  and `webglTextureUploadMaxDurationMs=1958.0ms`; the largest upload was again
  the giantPalm imposter albedo texture.
- 2026-05-02: Static texture acceptance measurement started with
  `npm run check:pixel-forge-textures`. Artifact
  `artifacts/perf/2026-05-02T19-33-14-632Z/pixel-forge-texture-audit/texture-audit.json`
  inventories all `42` registered Pixel Forge textures from
  `src/config/pixelForgeAssets.ts`: no missing files, `38` flagged textures,
  `26,180,240` source bytes, and an estimated `781.17MiB` of uncompressed RGBA
  plus full mip chains if all registered atlases are resident. Vegetation color
  and normal atlases each account for `133.33MiB`; NPC albedo atlases account
  for `514.5MiB`. The two hard failures are giantPalm color and normal
  (`4096x2048`, `42.67MiB` each). All `28` NPC albedo atlases warn at
  `18.38MiB` each and carry non-power-of-two dimensions (`2688x1344`).
  The extended audit also records vegetation pixels per runtime meter:
  giantPalm is `81.5px/m` and bananaPlant is `108.02px/m`, while fern and
  elephantEar are compact at `2.67MiB` per atlas.
- 2026-05-02: The texture audit now emits remediation candidates, still as
  planning evidence rather than approved art changes. Applying the candidate
  targets to every flagged texture would reduce estimated mipmapped RGBA
  residency from `781.17MiB` to `373.42MiB`, a projected `407.75MiB` reduction.
  Candidate vegetation regeneration lowers `4096x2048` giantPalm atlases to
  `2048x1024` (`10.67MiB` each) and `2048x2048` mid-level atlases to
  `1024x1024` (`5.33MiB` each). Candidate NPC regeneration lowers each
  `2688x1344` animated albedo atlas to a padded `2048x1024` target
  (`10.67MiB` each) using `64px` frames.
- 2026-05-02: Scenario estimates landed in
  `artifacts/perf/2026-05-02T19-34-49-412Z/pixel-forge-texture-audit/texture-audit.json`.
  Dropping vegetation normal atlases alone estimates `647.97MiB`; regenerating
  vegetation only estimates `589.3MiB`; regenerating vegetation and dropping
  vegetation normals estimates `551.97MiB`; regenerating NPC atlases only
  estimates `565.42MiB`; applying all candidates estimates `373.42MiB`.
  These are package-level planning estimates for KB-CULL/KB-OPTIK, not a
  replacement for visual QA.
- 2026-05-03 first KB-LOAD remediation: `src/systems/assets/AssetLoader.ts`
  now exposes `warmGpuTextures()`, and `src/core/LiveEntryActivator.ts`
  uploads the current hard-fail giantPalm color/normal atlas pair behind the
  spawn loading overlay before renderer reveal. Startup telemetry now records
  `engine-init.startup-flow.texture-upload-warmup.*` marks and browser user
  timings named `kb-load.texture-upload-warmup.*`.
- 2026-05-03 paired giantPalm warmup evidence: Open Frontier before
  `artifacts/perf/2026-05-03T21-45-13-207Z/startup-ui-open-frontier` averaged
  `4685.7ms` deploy-click-to-playable and `5340.7ms` mode-click-to-playable;
  after
  `artifacts/perf/2026-05-03T22-01-10-796Z/startup-ui-open-frontier` averaged
  `4749.0ms` and `5443.3ms`. Its average WebGL upload total moved from
  `3341.0ms` to `1157.2ms`, and average max upload moved from `2390.5ms` to
  `275.4ms`. Zone Control before
  `artifacts/perf/2026-05-03T21-46-34-676Z/startup-ui-zone-control` averaged
  `4909.0ms` / `5491.0ms`; after
  `artifacts/perf/2026-05-03T22-02-28-966Z/startup-ui-zone-control` averaged
  `4939.0ms` / `5469.0ms`; average WebGL upload total moved from `3340.6ms`
  to `1229.6ms`, and average max upload moved from `2379.4ms` to `360.1ms`.
  Trust flags are present in all four artifacts: long tasks, LoAF entries,
  WebGL upload attribution, user timings, and three Chrome CPU profiles per
  artifact. This is a narrow upload-stall mitigation and attribution
  improvement, not a certified startup-latency closeout.
- 2026-05-03 negative evidence: expanding the same warmup to fanPalm was tested
  and rejected. Open Frontier
  `artifacts/perf/2026-05-03T21-54-02-583Z/startup-ui-open-frontier` regressed
  to `4904.3ms` deploy-click-to-playable, and Zone Control
  `artifacts/perf/2026-05-03T21-55-18-768Z/startup-ui-zone-control` regressed
  to `5100.7ms`. Do not broaden startup texture warmup by asset name without a
  paired before/after artifact.
- 2026-05-05 fresh sequential KB-LOAD baseline after the short-palm removal:
  `npm run build` passed and retail startup captures wrote
  `artifacts/perf/2026-05-05T04-13-00-783Z/startup-ui-open-frontier/summary.json`
  and
  `artifacts/perf/2026-05-05T04-14-18-778Z/startup-ui-zone-control/summary.json`.
  Open Frontier averaged `5209.3ms` mode-click-to-playable,
  `4516.7ms` deploy-click-to-playable, `844.5ms` WebGL upload total, and
  `33.1ms` max upload. Zone Control averaged `5440.3ms`
  mode-click-to-playable, `4835.7ms` deploy-click-to-playable, `864.567ms`
  WebGL upload total, and `42ms` max upload.
- 2026-05-05 KB-LOAD upload-attribution summary patch: startup `summary.json`
  now includes `summary.webglTextureUpload*` median/p95 aggregates and
  `webglUploadSummary.largestUploads`, using relative asset paths so the Cycle
  3 kickoff can name remaining upload targets. Fresh sequential artifacts
  `artifacts/perf/2026-05-05T04-24-07-730Z/startup-ui-open-frontier/summary.json`
  and
  `artifacts/perf/2026-05-05T04-25-31-931Z/startup-ui-zone-control/summary.json`
  refreshed the kickoff at
  `artifacts/perf/2026-05-05T04-26-07-523Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Open Frontier averaged `5198ms` mode-click-to-playable, `4466.333ms`
  deploy-click-to-playable, `845.733ms` WebGL upload total, `30.967ms` average
  max upload, and `541.333` upload calls. Its current top uploads are
  `assets/pixel-forge/npcs/usArmy/idle/animated-albedo-packed.png`
  (`33.8ms` max), `assets/pixel-forge/vegetation/bambooGrove/bamboo-google-2/imposter.png`
  (`32.5ms` max), and
  `assets/pixel-forge/vegetation/fanPalm/lady-palm-google-1/imposter.png`
  (`31.7ms` max). Zone Control averaged `5417ms` mode-click-to-playable,
  `4887ms` deploy-click-to-playable, `841.6ms` WebGL upload total, `39.067ms`
  average max upload, and `590` upload calls. Its current top uploads are
  `assets/pixel-forge/vegetation/bananaPlant/banana-tree-sean-tarrant/imposter.png`
  (`42.3ms` max), `assets/pixel-forge/vegetation/bambooGrove/bamboo-google-2/imposter.png`
  (`39.5ms` max), and
  `assets/pixel-forge/vegetation/fanPalm/lady-palm-google-1/imposter.png`
  (`33.7ms` max). This records that the retired short palm removed the prior
  multi-second largest-upload failure from the current startup path, but long
  tasks and multi-second playable latency remain. Do not call this a
  startup-latency win or closeout.
- 2026-05-05 KB-LOAD vegetation-normal proof mode: `scripts/perf-startup-ui.ts`
  now accepts `--disable-vegetation-normals`, injects
  `window.__KB_LOAD_DISABLE_VEGETATION_NORMALS__ = true` before app startup,
  records `candidateFlags.disableVegetationNormals=true`, and writes candidate
  artifacts under `startup-ui-<mode>-vegetation-normals-disabled/`. The runtime
  proof hook leaves the default app path unchanged. `GPUBillboardSystem` only
  skips normal textures and forces `hemisphere` vegetation shading when that
  explicit proof flag is present. Open Frontier candidate evidence at
  `artifacts/perf/2026-05-05T05-31-24-775Z/startup-ui-open-frontier-vegetation-normals-disabled/summary.json`
  averaged `4420ms` mode-click-to-playable and `3741.333ms`
  deploy-click-to-playable, but its upload table is noisy because a large
  `(inline-or-unknown)` upload reached `1736.4ms`, leaving upload total at
  `1365.8ms`. Zone Control candidate evidence at
  `artifacts/perf/2026-05-05T05-28-07-843Z/startup-ui-zone-control-vegetation-normals-disabled/summary.json`
  is cleaner: `3203.667ms` mode-click-to-playable, `2631.667ms`
  deploy-click-to-playable, `767.467ms` WebGL upload total, `41.267ms` average
  max upload, and `492.667` upload calls. No vegetation normal-map removal is
  accepted by this proof; default policy remains normal maps. The no-normal
  path is rejected for default runtime or Pixel Forge bake policy until a
  future PASS or owner-accepted side-by-side visual review clears it.
- 2026-05-05 vegetation-normal visual A/B proof:
  `npm run check:projekt-143-vegetation-normal-proof` force-built the perf
  target and wrote
  `artifacts/perf/2026-05-05T12-15-23-150Z/projekt-143-vegetation-normal-proof/summary.json`
  plus contact sheet
  `artifacts/perf/2026-05-05T12-15-23-150Z/projekt-143-vegetation-normal-proof/contact-sheet.png`.
  The proof captures default normal-lit vegetation and the no-normal candidate
  at fixed Open Frontier seed `42` and Zone Control seed `137` camera anchors.
  It records `8/8` screenshots, `4/4` A/B pairs, renderer stats, positive
  vegetation counters, and `0` browser/page/request failures. Mechanical deltas
  are inside the current review band (`15.595` max mean absolute RGB delta;
  `8.284%` max absolute mean luma delta), so the candidate has usable visual
  evidence. It still reports WARN because human visual review must accept the
  contact sheet before vegetation normal-map removal becomes runtime or Pixel
  Forge bake policy. This older inside-band artifact is superseded by the
  2026-05-06 refresh below, which rejects the no-normal path for current
  default policy.
- 2026-05-06 vegetation-normal visual A/B refresh:
  `npm run check:projekt-143-vegetation-normal-proof -- --no-build` wrote
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/summary.json`
  plus contact sheet
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/contact-sheet.png`
  after the banana albedo cleanup. It captured the same `8/8` screenshots and
  `4/4` A/B pairs with no browser/page/request failures. This refresh remains
  WARN because visual deltas exceed the review band, so it rejects vegetation
  normal-map removal for current default runtime and Pixel Forge bake policy.
- 2026-05-06 KB-LOAD branch selector:
  `npm run check:projekt-143-load-branch` wrote
  `artifacts/perf/2026-05-06T02-56-15-735Z/projekt-143-load-branch-selector/load-branch-selector.json`.
  It selects `vegetation-atlas-regeneration-retain-normals` as the next
  quiet-machine proof branch: regenerate active Pixel Forge vegetation
  color/normal atlas pairs to the texture-audit candidate dimensions, preserve
  normal maps, avoid reopening NPC atlas regeneration while KB-OPTIK is in a
  good owner-accepted state, and require visual proof plus matched Open
  Frontier/Zone Control startup tables before acceptance. Static estimate:
  `127.87MiB` mipmapped RGBA savings from vegetation candidates only. Current
  top vegetation upload species are `bambooGrove`, `bananaPlant`, `coconut`,
  and `fanPalm`. This selector chooses the branch; it does not generate or
  import any atlas and does not close KB-LOAD.
- 2026-05-06 Pixel Forge vegetation readiness:
  `npm run check:projekt-143-pixel-forge-vegetation-readiness` wrote
  `artifacts/perf/2026-05-06T04-17-34-839Z/projekt-143-pixel-forge-vegetation-readiness/vegetation-readiness.json`.
  Status is PASS with
  `branchExecutionState=ready_for_candidate_generation`: Pixel Forge has the
  selected source variants, normal-lit color/normal pairs, and a review-only
  `kb-load-vegetation-256` candidate profile plus selected-species validator for
  `bambooGrove/bamboo-google-2`, `bananaPlant/banana-tree-sean-tarrant`,
  `coconut/coconut-palm-google`, and `fanPalm/lady-palm-google-1`, and the
  texture-audit target is `1024x1024` / `256px` tiles with normals retained.
  The profile writes under
  `packages/server/output/tij-candidates/kb-load-vegetation-256` instead of the
  accepted production gallery. Candidate generation and selected-species
  validation have now run in Pixel Forge; the readiness selector still records
  the profile as generation-ready because it is checking production output, not
  accepting candidate proof.
- 2026-05-06 Pixel Forge vegetation candidate proof harness:
  `npm run check:projekt-143-vegetation-candidate-proof` wrote
  `artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/summary.json`
  and contact sheet
  `artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/candidate-contact-sheet.png`.
  Status is PASS with `4/4` selected candidate pairs complete for
  `bambooGrove/bamboo-google-2`, `bananaPlant/banana-tree-sean-tarrant`,
  `coconut/coconut-palm-google`, and `fanPalm/lady-palm-google-1`; each
  candidate has color, normal, metadata, `256px` tile size, `1024x1024` atlas
  size, `normalSpace=capture-view`, and `albedo,normal` aux-layer checks
  passing. The aggregate max opaque luma delta is `1.53%` and max opaque-ratio
  delta is `0.00714`. This is static side-by-side proof only: it imports
  nothing, does not replace owner visual acceptance, and does not prove startup
  performance or production parity.
- 2026-05-06 Pixel Forge vegetation candidate import plan:
  `npm run check:projekt-143-vegetation-candidate-import-plan` wrote
  `artifacts/perf/2026-05-06T21-41-01-701Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`.
  Status is PASS with `importState=dry_run_ready`: `4/4` selected
  color/normal/meta replacements map cleanly from the Pixel Forge candidate
  output to the current TIJ runtime asset paths, dimensions are `1024x1024`,
  tile size is `256px`, `normalSpace=capture-view`, `albedo,normal`
  aux-layer checks pass, and the banana candidate cyan-blue stem guard is
  clear with `0` strong cyan-blue opaque pixels. This dry run copied nothing
  and does not claim owner visual acceptance, in-game lighting proof, startup
  performance, or production parity.
- 2026-05-05 lazy NPC imposter bucket remediation: `CombatantMeshFactory` now
  exposes explicit Pixel Forge faction/clip bucket creation, and
  `CombatantRenderer` initializes only the common `idle` and `patrol_walk`
  imposter buckets at startup. Uncommon runtime clips such as
  `walk_fight_forward`, `advance_fire`, `traverse_run`, and death clips are
  created the first time a visible far NPC needs them. Focused combat tests
  verify startup bucket filtering and lazy creation. The accepted Open Frontier
  artifact
  `artifacts/perf/2026-05-05T16-36-44-588Z/startup-ui-open-frontier/summary.json`
  averaged `4526.7ms` mode-click-to-playable, `3867.7ms`
  deploy-click-to-playable, `437.6ms` WebGL upload total, `35.87ms` average
  max upload, and `459.33` upload calls versus the same-day baseline
  `5198ms`, `4466.333ms`, `845.733ms`, `30.967ms`, and `541.333` upload
  calls. The accepted Zone Control rerun
  `artifacts/perf/2026-05-05T16-39-16-223Z/startup-ui-zone-control/summary.json`
  averaged `2994.3ms` mode-click-to-playable, `2458.7ms`
  deploy-click-to-playable, `415ms` WebGL upload total, `39.5ms` average max
  upload, and `321.33` upload calls versus baseline `5417ms`, `4887ms`,
  `841.6ms`, `39.067ms`, and `590` upload calls. A stricter no-eager variant
  was tested and rejected:
  `artifacts/perf/2026-05-05T16-33-44-776Z/startup-ui-open-frontier/summary.json`
  and
  `artifacts/perf/2026-05-05T16-34-47-581Z/startup-ui-zone-control/summary.json`
  showed that fully deferring all NPC buckets made Zone deploy-click-to-playable
  worse than the idle/patrol-eager candidate. Zone artifact
  `artifacts/perf/2026-05-05T16-37-49-634Z/startup-ui-zone-control/summary.json`
  is documented as noisy outlier evidence because a single fanPalm normal map
  upload contaminated the averages. This is accepted as a narrow startup/upload
  branch only; long tasks, progressive readiness, visual review, and production
  parity remain open.

Open questions:

- Which Open Frontier startup stage dominates mode-entry latency?
- How much work happens after visual readiness during the first 5-10 seconds?
- Which shaders, GLBs, terrain assets, or scene-assembly tasks should move
  behind progressive readiness?
- Can the selected `vegetation-atlas-regeneration-retain-normals` branch run
  the Pixel Forge 256px-tile candidate generation/validation path, then matched
  quiet-machine startup tables and side-by-side visual proof, without
  destabilizing accepted vegetation/NPC visuals?
- What is the final texture policy for Pixel Forge imposters after the selected
  branch: max dimensions, compression format, mip policy, and preload vs.
  deferred upload?
- Which uploads are required before truthful gameplay readiness, and which can
  move behind progressive readiness without visual popping or combat unfairness?

### KB-OPTIK - Rendering And Optics

Status: SCALE/CROP/LUMA PROOF BANDS PASS LOCALLY; HUMAN VISUAL DECISION AND PERF IMPACT REMAIN OPEN.

Progress:

- 2026-05-02: `scripts/pixel-forge-imposter-optics-audit.ts` now audits the
  registered Pixel Forge vegetation and NPC imposter atlases against runtime
  scale contracts, metadata JSON, alpha occupancy, luma/chroma statistics, and
  shader-path notes. It writes
  `artifacts/perf/<timestamp>/pixel-forge-imposter-optics-audit/optics-audit.json`
  and is exposed as `npm run check:pixel-forge-optics`.
- 2026-05-02 evidence:
  `artifacts/perf/2026-05-02T20-54-56-960Z/pixel-forge-imposter-optics-audit/optics-audit.json`
  flagged all `28/28` runtime NPC clip atlases and `2/7` vegetation atlases.
  NPC median visible tile height is `65px` inside a `96px` tile; across clips
  it ranges `55px` to `72px`. At that point runtime impostor height was
  `4.425m`, while source metadata bbox heights produced a median
  runtime/source height ratio of `2.63x` (`2.23x` min, `2.98x` max). Runtime
  NPC impostor resolution was therefore only `21.69px/m` before the first
  target/crop remediation.
- 2026-05-02 NPC scale/resolution finding: the field report that NPC
  imposters look wrong is supported, but the first static evidence does not
  prove the runtime plane is half-sized. Instead, the runtime plane stretches
  relatively small 96px bakes more than `2x` against source bbox height, while
  the visible silhouette usually occupies less than `80%` of the tile. The
  credible failure is a bake/runtime scale contract mismatch plus low effective
  pixels per meter.
- 2026-05-02 shader-contract finding: NPC imposters, vegetation imposters, and
  close GLBs do not share one material pipeline. NPC imposters render through a
  `CombatantMeshFactory` `ShaderMaterial`, use straight alpha, apply independent
  readability/exposure/min-light constants, and do not consume the atmosphere
  lighting snapshot. Vegetation imposters render through
  `GPUBillboardVegetation` `RawShaderMaterial`, use atmosphere lighting
  uniforms, sample normal atlases for `normal-lit` profiles, and output
  premultiplied alpha through custom blending. Close GLBs use the normal Three
  material path. This is a credible explanation for brightness parity drift
  across LOD tiers even before screenshot comparison.
- 2026-05-02 vegetation optics finding: the optics audit repeats the texture
  audit's scale concern for vegetation: `bananaPlant` is oversampled at
  `108.02px/m`, and `giantPalm` is both runtime-scaled `1.75x` over declared
  source size and oversampled at `81.5px/m`. Other vegetation runtime
  pixels-per-meter values range from `18.91` to `68.45`.
- 2026-05-03 matched scale proof: `npm run
  check:projekt-143-optics-scale-proof -- --port=0` passed at
  `artifacts/perf/2026-05-03T10-39-21-420Z/projekt-143-optics-scale-proof/summary.json`.
  The proof renders the close Pixel Forge GLB and the matching NPC imposter
  shader crop in the same orthographic camera/light setup, then records visible
  silhouette height and luma/chroma deltas. In this before artifact all four
  factions shared the same `4.425m` geometry target, but the imposter visible
  silhouette was only
  `0.52-0.54x` the close-GLB visible height. The imposter crop is also darker
  by `26.59-59.06` luma. The six aircraft GLBs load at imported native scale;
  their longest-axis/current-NPC-height ratios are `2.07x-5.52x`. This proves
  the user's scale concern is real enough to route into remediation planning,
  but it does not accept any NPC, imposter, shader, atlas, or aircraft-scale
  change.
- 2026-05-03 first KB-OPTIK remediation: commit
  `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9` drops the shared Pixel Forge NPC
  runtime target from `4.425m` to the approved `2.95m` base target, derives the
  billboard grounding offset from `NPC_Y_OFFSET`, and adds generated per-tile
  crop maps for upright NPC imposter atlases. The crop maps are regenerated by
  `npm run assets:generate-npc-crops` and verified by
  `npm run check:pixel-forge-npc-crops`, now part of `validate:fast`.
- 2026-05-03 post-remediation proof: `npm run
  check:projekt-143-optics-scale-proof -- --port=0` passed at
  `artifacts/perf/2026-05-03T16-13-34-596Z/projekt-143-optics-scale-proof/summary.json`
  with `sourceGitSha`
  `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9`. Matched visible-height ratios
  are now `0.895` (US), `0.895` (ARVN), `0.863` (NVA), and `0.861` (VC),
  inside the first-remediation `+/-15%` proof band. The same proof keeps luma
  flags open: imposter crops remain `-26.94` to `-59.29` darker than close GLB
  crops. This is scale/crop remediation evidence only; it is not shader/luma,
  performance, aircraft-scale, human-scale, or production parity acceptance.
- 2026-05-03 selected-lighting luma slice: commit
  `1395198da4db95611457ecde769b611e3d36354e` adds per-faction imposter
  material tuning and updates the matched proof/decision tools to record luma
  deltas as a percentage of the matched close-GLB crop. The committed proof at
  `artifacts/perf/2026-05-03T16-48-28-452Z/projekt-143-optics-scale-proof/summary.json`
  has `sourceGitSha` `1395198da4db95611457ecde769b611e3d36354e`, visible-height
  ratios `0.895` (US), `0.895` (ARVN), `0.863` (NVA), and `0.861` (VC), and
  selected-lighting luma deltas `-0.13%` (US), `-0.44%` (ARVN), `0.36%`
  (NVA), and `-0.08%` (VC). This closes the single-lighting luma branch only;
  it is not final NPC visual parity, gameplay-camera acceptance, performance
  acceptance, aircraft-scale acceptance, human playtest signoff, or production
  parity.
- 2026-05-03 expanded KB-OPTIK proof: commit
  `57d873e7f305fb528e7570232a291950e89c6ade` adds
  `npm run check:projekt-143-optik-expanded`, which captures matched close-GLB
  and imposter crops across five lighting profiles (`midday-selected`,
  `dawn-warm-low`, `dusk-cool-low`, `haze-overcast`, `storm-low-contrast`) and
  two camera profiles (`matched-orthographic`, `gameplay-front-perspective`).
  The trusted artifact at
  `artifacts/perf/2026-05-03T17-26-45-106Z/projekt-143-optik-expanded-proof/summary.json`
  has measurement-trust PASS with `0` browser, page, request, and load errors.
  It captures `40` samples and returns WARN: visible-height ratio range is
  `0.844-0.895`, luma delta range is `-53.57%` to `104.58%`, and `34/40`
  samples are flagged. The selected midday orthographic profile remains clean,
  so this does not invalidate the selected-lighting remediation; it proves the
  remaining problem is the lighting/material contract outside that profile.
- 2026-05-03 expanded-luma remediation: commit
  `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad` forwards the scene lighting/fog
  snapshot into NPC imposter shader uniforms and updates the expanded proof to
  exercise that runtime contract. The committed-sha artifact at
  `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`
  has measurement-trust PASS with `0` browser, page, request, and load errors.
  It captures `40` samples and returns WARN: expanded luma delta now ranges
  `-11.31%` to `9.03%`, inside the `+/-12%` band, but `10/40` samples still
  flag because gameplay-perspective visible-height ratios remain below the
  `0.85` floor for NVA/VC and for some perspective framings. This is luma
  remediation evidence only; it is not final gameplay-camera visual parity,
  performance improvement, human-playtest signoff, or production parity.
- 2026-05-03 runtime LOD-edge proof routing: commit
  `5b053711cece65b5915ea786acc56e4a8ea22736` adds a
  `--camera-profile-set=runtime-lod-edge` option to the expanded proof and
  updates the KB-OPTIK decision/kickoff scripts so the newest LOD-edge artifact
  cannot hide the earlier near-stress WARN. The committed-sha artifact at
  `artifacts/perf/2026-05-03T19-02-38-432Z/projekt-143-optik-expanded-proof/summary.json`
  has measurement-trust PASS and status PASS: `40` samples, `0` flags,
  visible-height ratio `0.855-0.895`, and luma delta `-6.94%` to `9.77%`.
  This proves the current runtime LOD-edge camera set is inside mechanical
  bands; it does not close human visual review or the 8.5m near-stress
  exception.
- 2026-05-05 owner review rejection: the initial KB-OPTIK human-review HTML at
  `artifacts/perf/2026-05-05T20-31-49-687Z/projekt-143-optik-human-review/index.html`
  is rejected as a final review basis. It places separate transparent crops
  side-by-side, and the proof crop path renders the close GLB in a T-pose,
  unanimated, and without the runtime weapon while the imposter image is a
  posed atlas/runtime frame with weapon visibility. The invalidation artifact at
  `artifacts/perf/2026-05-05T22-00-33-358Z/projekt-143-optik-human-review/review-summary.json`
  records `status: invalid_runtime_comparison` and
  `comparisonBasis: separate_transparent_crops`; the refreshed kickoff at
  `artifacts/perf/2026-05-05T22-01-25-069Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  keeps KB-OPTIK at `needs_decision`.
  Runtime probing after post-reveal lazy close-model load (`npx tsx
  scripts/probe-pixel-forge-npcs.ts --url
  "http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1" --wait-ms 12000
  --wait-for-close`) produced `artifacts/pixel-forge-npc-probe/summary.json`
  with `20` active close GLBs, active clips, weapons present, and no failures.
  Treat the rejected packet as a review-harness presentation/pose failure, not a
  confirmed in-game anchor bug.
- 2026-05-05 runtime-equivalent owner-review packet: generated a replacement
  KB-OPTIK review packet at
  `artifacts/perf/2026-05-05T22-19-43-527Z/projekt-143-optik-human-review/review-summary.json`
  with contact sheet
  `artifacts/perf/2026-05-05T22-19-43-527Z/projekt-143-optik-human-review/runtime-equivalent-contact-sheet.png`.
  It records `status: needs_human_decision` and
  `comparisonBasis: runtime_equivalent_same_scene`. The harness uses the same
  faction, `walk_fight_forward` clip, pose progress `0.35`, frame `2`,
  target height, crop map, camera, lighting, and runtime weapon socketing basis
  for both sides. The close GLB side is animated and weaponed; the imposter side
  uses the runtime shader/crop contract. Fresh kickoff
  `artifacts/perf/2026-05-05T22-20-39-336Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  and completion audit
  `artifacts/perf/2026-05-05T22-20-53-273Z/projekt-143-completion-audit/completion-audit.json`
  keep KB-OPTIK blocked only on owner visual decision or explicit exception.
- 2026-05-05 runtime-equivalent owner-review rejection follow-up: owner review
  rejected the 22:19 packet because the close GLB faced the camera with a
  weapon while the imposter selected the top-of-head/back-facing atlas view.
  Root cause was a runtime selector mismatch: TIJ consumed Pixel Forge
  `animated-octahedral-imposter` atlases as yaw-only columns and hard-selected
  the center elevation row. The local follow-up adds per-instance octahedral
  column/row selection in `CombatantRenderer`/`CombatantMeshFactory` and
  refreshes the OPTIK proof harnesses to use the same view-row contract. The
  fixed replacement packet is
  `artifacts/perf/2026-05-05T22-48-34-788Z/projekt-143-optik-human-review/review-summary.json`
  with contact sheet
  `artifacts/perf/2026-05-05T22-48-34-788Z/projekt-143-optik-human-review/runtime-equivalent-contact-sheet.png`.
  Refreshed kickoff
  `artifacts/perf/2026-05-05T22-50-14-559Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  keeps KB-OPTIK at `needs_decision`, and completion audit
  `artifacts/perf/2026-05-05T22-50-24-059Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`. Do not treat KB-OPTIK as accepted until the owner
  confirms this fixed packet or records a deliberate visual exception.
- 2026-05-05 silhouette/coverage audit: owner noted the replacement packet was
  close but faction pairs still looked slightly differently aligned. The review
  harness now writes code-measured close-GLB/imposter alpha-mask comparisons and
  red/cyan/white overlays. The refreshed artifact
  `artifacts/perf/2026-05-05T22-55-48-974Z/projekt-143-optik-human-review/review-summary.json`
  uses the canonical front octahedral tile `3,0` for all four faction pairs and
  reports height alignment inside `0.9639-0.98`, but width/coverage mismatch is
  still visible: mask IoU is only `0.5084-0.5366`, imposter opaque area is about
  `1.83-1.86x` the close GLB, and visible width is about `1.68-1.77x` the close
  GLB. The strongest residual alignment offsets are VC centroid `19.38px` and
  NVA bbox-center `13.24px` in the `512px` audit crop. This points to
  crop/coverage/pose-width parity, not height scale, as the current KB-OPTIK
  blocker. Refreshed kickoff
  `artifacts/perf/2026-05-05T22-56-45-502Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  remains WARN and completion audit
  `artifacts/perf/2026-05-05T22-56-43-629Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`.
- 2026-05-05 horizontal crop remediation: the code-measured blocker above was
  the runtime shader stretching Pixel Forge's tight horizontal alpha crop across
  the full billboard plane. The local follow-up keeps the vertical crop but
  expands the horizontal sampling window by the measured `1.7x` factor in the
  runtime NPC imposter shader and OPTIK proof harnesses. The refreshed review
  packet
  `artifacts/perf/2026-05-05T23-01-30-992Z/projekt-143-optik-human-review/review-summary.json`
  now reports visible width ratio `0.9886-1.0444`, opaque area ratio
  `1.0717-1.0945`, height ratio `0.9639-0.98`, and mask IoU `0.6143-0.8633`
  across the four faction pairs, all on front octahedral tile `3,0`. The
  strongest remaining alignment offset is VC centroid `14.09px` in the `512px`
  audit crop. Scale proof passes at
  `artifacts/perf/2026-05-05T23-02-25-884Z/projekt-143-optics-scale-proof/summary.json`.
  Runtime LOD-edge expanded proof still WARNs on luma at
  `artifacts/perf/2026-05-05T23-02-25-910Z/projekt-143-optik-expanded-proof/summary.json`.
  Refreshed kickoff
  `artifacts/perf/2026-05-05T23-02-48-164Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  keeps KB-OPTIK at `needs_decision` for shader/luma parity or an explicit
  visual exception, and completion audit
  `artifacts/perf/2026-05-05T23-02-46-377Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`.
- 2026-05-05 VC luma closeout pass: the post-crop luma blocker was isolated to
  the VC package; US/ARVN/NVA were already inside the proof band. A scoped VC
  imposter material tune moves selected-lighting scale proof to PASS at
  `artifacts/perf/2026-05-05T23-05-39-582Z/projekt-143-optics-scale-proof/summary.json`
  with luma delta range `-5.06%` to `-0.81%`, and runtime LOD-edge expanded
  proof to PASS at
  `artifacts/perf/2026-05-05T23-05-39-578Z/projekt-143-optik-expanded-proof/summary.json`
  with luma delta range `-9.44%` to `10.5%` and `0` flagged samples. The final
  runtime-equivalent review packet is
  `artifacts/perf/2026-05-05T23-05-52-555Z/projekt-143-optik-human-review/review-summary.json`;
  it keeps the improved silhouette metrics from the horizontal crop fix. Fresh
  kickoff
  `artifacts/perf/2026-05-05T23-06-21-567Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  still marks KB-OPTIK `needs_decision`: scale/crop/luma proof bands pass, but
  human visual review or an explicit near-stress exception is still required.
  Completion audit
  `artifacts/perf/2026-05-05T23-06-19-305Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`.
- 2026-05-05 owner acceptance with caution: the owner accepted the refreshed
  runtime-equivalent same-scene review packet at
  `artifacts/perf/2026-05-05T23-13-35-420Z/projekt-143-optik-human-review/review-summary.json`
  after inspecting the in-browser contact sheet. The packet records
  `status: accepted_exception`, `comparisonBasis: runtime_equivalent_same_scene`,
  matching close/imposter `2.95m` runtime height, runtime weapon sockets, and
  front-tile silhouette metrics with visible-height ratio `0.9639-0.98`,
  visible-width ratio `0.9886-1.0444`, opaque area ratio `1.0717-1.0945`, and
  mask IoU `0.6143-0.8633`. Treat this as current KB-OPTIK acceptance only for
  the present crop maps, target height, luma tuning, runtime LOD-edge proof, and
  owner visual review. The owner note is that the game state looks good and
  should not be botched; slight downward-facing bias or remaining imposter
  darkness belongs to a future careful crop/view/rebake or lighting-parity pass
  with the same proof gates, not to an opportunistic retune.

Root-cause hypotheses:

1. The before state stretched `96px` NPC imposter tiles to a `4.425m` runtime
   plane while the alpha silhouette often occupied only `55-72px`. The first
   remediation now uses the `2.95m` target plus per-tile upright crop maps.
   Source atlases are still `96px`; selected and expanded luma are aligned
   after the imposter atmosphere pass. Runtime LOD-edge perspective now passes,
   and the owner accepted the current runtime-equivalent packet with an 8.5m
   near-stress exception. Future crop/geometry work should only happen if a
   new proof-gated pass targets the slight downward-facing or brightness polish
   without destabilizing the accepted in-game result.
2. NPC brightness parity could not be fixed by one exposure number; the first
   luma remediation forwards atmosphere lighting/fog into the NPC imposter
   shader, and the final local VC-specific tune brings selected-lighting and
   runtime LOD-edge expanded luma inside the `+/-12%` proof band. Remaining
   KB-OPTIK work is human/explicit-exception review of the runtime-equivalent
   packet.
3. Vegetation brightness parity is entangled with normal-lit versus hemisphere
   profiles, premultiplied-alpha output, and current runtime scale exceptions.

Ranked remediations:

1. Define a unified imposter material contract before tuning constants:
   explicit color space, tone mapping/output transform expectation, alpha mode,
   atmosphere inputs, minimum light floor, exposure, and normal-map semantics.
2. Treat the generated per-tile crop map as the first runtime fix. If a later
   branch regenerates NPC imposters, preserve at least `80px` visible actor
   height per tile after crop and record effective pixels-per-meter.
3. Use and extend the runtime visual comparison harness that places close GLB
   and imposter versions of the same faction/clip/pose under the same camera
   and light setup, with runtime animation/weapon sockets applied for the close
   GLB path, then measures projected bounds and sampled luma deltas.
4. Treat vegetation normal-map removal/downscale as blocked until KB-OPTIK
   screenshot evidence proves hemisphere-only or lower-resolution atlases meet
   brightness and silhouette acceptance.

Acceptance:

- First scale/crop/luma remediation status: matched visible-height ratios now
  land within the `+/-15%` first-remediation proof band, but not all factions
  are within a stricter `+/-10%` final-polish band. Selected-lighting and
  runtime LOD-edge expanded luma are inside the `+/-12%` proof band in the
  latest local artifact after the VC-specific tune. Runtime LOD-edge expanded
  proof is inside both visible-height and luma bands after commit
  `5b053711cece65b5915ea786acc56e4a8ea22736`; the 8.5m near-stress WARN is a
  documented owner-accepted exception for the current packet, not a measured
  LOD-edge failure.
- NPC close GLB versus imposter screenshot rig reports projected actor-height
  delta within `+/-15%` for the first remediation, and within `+/-10%` before
  final visual sign-off unless a documented visual exception exists.
- Mean opaque luma delta between matched close GLB and imposter crops stays
  within `+/-12%` under midday, dawn/dusk, haze, and storm snapshots.
- Runtime NPC imposter package reaches at least `32px/m` effective visible
  resolution or documents a visual exception accepted by human review.
- Vegetation candidate atlases retain silhouette readability and brightness
  parity in elevated and ground cameras before KB-CULL accepts lower texture
  budgets as ship-ready.

### KB-TERRAIN - Distant Terrain And Vegetation

Status: MATERIAL/VEGETATION PASS STARTED; FAR-HORIZON AND A SHAU PERF REMAIN BLOCKED.

Progress:

- 2026-05-02: `scripts/vegetation-horizon-audit.ts` now compares actual mode
  camera far planes, terrain visual extents, CDLOD range inputs, vegetation
  cell residency, registered vegetation shader fade/max distances, and per-mode
  biome palettes. It writes
  `artifacts/perf/<timestamp>/vegetation-horizon-audit/horizon-audit.json` and
  is exposed as `npm run check:vegetation-horizon`.
- 2026-05-02 evidence:
  `artifacts/perf/2026-05-02T21-29-15-593Z/vegetation-horizon-audit/horizon-audit.json`
  reports a global vegetation registry max draw distance of `600m` and max
  fade start of `500m`. The vegetation scatterer residency square reaches
  `832m` on-axis and `1176.63m` to the corner, so large-mode horizon loss is
  currently shader-distance limited before it is cell-residency limited.
- 2026-05-02 mode findings: Open Frontier has an estimated exposed terrain
  band of `396.79m` beyond visible vegetation under the audit samples; A Shau
  Valley has an estimated `3399.2m` band because its camera far plane is
  `4000m` while vegetation still disappears at `600m`. Zone Control's visual
  extent can exceed vegetation by `160m`; AI Sandbox and TDM are terrain-extent
  limited and do not expose a large in-map barren band in this static model.
- 2026-05-04 owner visual target: the terrain and vegetation remediation goal
  now explicitly includes ground material balance and close vegetation scale,
  not only far-horizon canopy. Most traversable ground should read as jungle
  green rather than gravel; if green appears mainly on hill or mountain sides,
  inspect terrain material distribution for an inverted slope/biome mask or
  weighting issue while preserving the existing texture variety. Tiny palm
  placements should be scaled up, ferns should sit higher and larger instead
  of being sunk into the ground, big palms such as `giantPalm`/`fanPalm` should
  be more numerous, ground vegetation density should increase, and bamboo
  should shift from a dominant continuous forest to scattered dense clusters.
  This is target definition only; no texture, scale, or vegetation distribution
  remediation is accepted without before/after screenshots and perf evidence.
- 2026-05-04 ground-material distribution pass:
  `scripts/projekt-143-terrain-distribution-audit.ts` is exposed as
  `npm run check:projekt-143-terrain-distribution` and records CPU biome,
  shader-primary material, flat/steep ground material, estimated vegetation
  density, and cliff-rock accent eligibility for all shipped modes. The final
  static artifact for this pass is
  `artifacts/perf/2026-05-04T02-02-26-811Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  It reports all modes at `100%` flat jungle-like primary ground, Open
  Frontier at `99.99%` overall jungle-like primary ground, A Shau at `100%`,
  and steep-side rock-accent eligibility above the audit floor in every mode.
  The remaining WARN is expected evidence hygiene: AI Sandbox has
  `terrainSeed: random` and is sampled with fixed fallback seed `42`.
- 2026-05-04 implementation note: the broad procedural `highland` elevation
  cap, Open Frontier generic `cleared` cap, and A Shau generic
  highland/cleared/bamboo elevation belts are no longer primary terrain
  classification rules. `highland` remains available to the terrain material as
  a cliff/hillside accent layer through `cliffRockBiomeSlot`, with the shader
  using slope-gated rock blending instead of grey/brown mountaintop caps. The
  fresh perf-build screenshot proof after the pass is
  `artifacts/perf/2026-05-04T02-06-49-928Z/projekt-143-terrain-horizon-baseline/summary.json`
  and passed with `4/4` screenshots, renderer/terrain/vegetation telemetry,
  and `0` browser/page/scenario errors. Human visual review is still required:
  A Shau distant ridges remain muted under current atmosphere/fog, so this is a
  material-distribution correction, not final A Shau art direction acceptance.
- 2026-05-04 vegetation scale and bamboo-distribution pass: `fern` and
  `giantPalm` runtime scale/grounding were adjusted, `fanPalm`, `coconut`, and
  `giantPalm` densities were raised, and `bambooGrove` now has a large-scale
  cluster mask so bamboo can form dense pockets without filling every
  mid-level Poisson candidate. The latest static distribution artifact is
  `artifacts/perf/2026-05-04T02-41-29-573Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  bamboo estimated share falls to about `1.45-1.52%` across shipped modes while
  all flat-ground jungle-like material checks remain at `100%` and Open
  Frontier remains `99.99%` jungle-like overall. The fresh perf-build elevated
  screenshot proof after this pass is
  `artifacts/perf/2026-05-04T02-41-37-056Z/projekt-143-terrain-horizon-baseline/summary.json`
  and passes with `4/4` screenshots and `0` browser/page/scenario errors.
  Open Frontier after capture
  `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json` is measurement-trusted
  but still validation WARN (`avg=24.26ms`, `peakP99=49.90ms`,
  `hitch50=0.13%`, vegetation active instances `46,247`). A Shau is not
  accepted: `artifacts/perf/2026-05-04T02-48-58-787Z/summary.json` failed
  validation despite measurement trust PASS (`peakP99=93.90ms`,
  `hitch50=2.49%`, movement transitions `2`), and rerun
  `artifacts/perf/2026-05-04T02-53-54-886Z/summary.json` failed with
  measurement trust WARN. Both A Shau runs still log the `tabat_airstrip`
  steep-footprint warning (`112.1m` vertical span across a `320m` runway
  footprint), which opened the placement/foundation/route preset problem as a
  live blocker rather than a cosmetic follow-up.
- 2026-05-04 bamboo-clustering follow-up: the first cluster mask still left
  bamboo visually scattered because clustered mid-level species were sharing
  the same Poisson spacing/grid as palms. `ChunkVegetationGenerator` now splits
  clustered mid-level Poisson species into a per-type pass, so `bambooGrove`
  can use tighter local spacing inside noise-selected grove pockets without
  being thinned by the palm grid. The latest static distribution artifact is
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  it keeps flat jungle-like primary ground at `100%` in every mode and lowers
  bamboo estimated share to about `1.0-1.05%` across shipped modes. This still
  needs screenshot/human review for visual grove readability and for whether
  ferns are now too large or too bright at ground level.
- 2026-05-04 terrain placement/foundation audit:
  `scripts/projekt-143-terrain-placement-audit.ts` is exposed as
  `npm run check:projekt-143-terrain-placement` and measures native source
  slope span plus stamped core span for flattened airfield, firebase, and
  support features. The initial artifact
  `artifacts/perf/2026-05-04T04-04-19-128Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  failed `airfield_main` (`43.3m` source span) and `tabat_airstrip`
  (`112.11m` source span). After relocating/reorienting Open Frontier and Ta
  Bat features onto flatter terrain, the latest passing audit is
  `artifacts/perf/2026-05-04T10-53-17-143Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`:
  `airfield_main` is `5.24m`, `tabat_airstrip` is `9.18m`, and the support
  footprints are below the fail threshold. A Shau after-placement perf evidence
  at `artifacts/perf/2026-05-04T04-14-35-401Z/summary.json` is
  measurement-trusted/WARN and no longer logs the Ta Bat steep-footprint
  warning, but it is not A Shau acceptance because terrain-stall/recovery and
  movement-transition warnings still need a route/nav/gameplay pass.
- 2026-05-04 active-player harness blocker: the perf "killbot" was still
  shooting at an old target-height contract after the Pixel Forge NPCs were
  shortened to `2.95m`. The TypeScript bot and CJS perf driver now aim at the
  visual chest proxy below the eye-level actor anchor and prefer rendered
  target anchors when the live driver supplies them. Unit evidence covers the
  height contract, and the fresh post-fix Open Frontier capture
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json` records `120` player
  shots, `43` hits, and `9` kills, replacing the earlier zero-hit failure at
  `artifacts/perf/2026-05-04T10-36-41-205Z/summary.json`. Treat the new
  artifact as active-player hit-contract evidence only: the owner reported
  another browser game was running on and off during the capture, so the
  frame-time and heap numbers are potentially skewed and must not be used for
  perf acceptance or baseline refresh.
- 2026-05-04 owner world-placement target: the later KB-TERRAIN/KB-CULL scope
  also includes terrain-aligned static placement. Buildings, HQs, vehicles,
  and airfield/support presets should not hang foundations off hill edges or
  rely on poorly sampled random placement. The likely path is to audit and
  align terrain stamps, airfield templates, firebase/HQ presets, vehicle
  parking, and generated feature footprints before swapping assets. Pixel Forge
  has multiple building iterations that should be shortlisted for visual fit,
  triangle/draw-call cost, collision/foundation footprint, and LOD/HLOD
  readiness before any runtime replacement.
- 2026-05-06 local foundation follow-up: generated airfield structures now run
  through the runtime footprint solver, large static props search a wider flat
  candidate radius, and circular feature terrain stamps now expand to cover
  their authored surface outer radius before blending to native terrain. The
  latest rebuilt visual packet
  `artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/visual-review.json`
  captures refreshed Open Frontier/A Shau frames including
  airfield-foundation, airfield-parking, support-foundation, and hydrology views
  with zero browser/page errors and an explicit Open Frontier river
  overexposure WARN.
  The placement audit was then tightened to warn on large native relief under
  otherwise flat stamped pads, because that is the static signature of
  mesa-like or cliff-edge foundation visuals. Open Frontier `supply_depot_main`
  and `zone_depot` then moved from `(-800,-200)` to nearby flatter terrain at
  `(-820,-160)`, dropping the sampled core native span below the review
  threshold. A follow-up moved the remaining TDM and Zone Control seed-variant
  pads away from high native relief, then a large-footprint pass removed the
  old small-prop runtime cap (`10m` footprint / `9.5m` sample radius) so
  warehouse-class static placements are scored against their scaled footprint
  class. A subsequent audit fix found that generated airfield placement relief
  sampling was reading `world.z` from a `THREE.Vector2`, so those large
  placements had effectively reported zero native relief. The latest placement
  audit
  `artifacts/perf/2026-05-07T00-32-41-375Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  is PASS with `57` audited features and `fail=0` / `warn=0`. Foundation/
  airfield visual acceptance still remains open: manual contact-sheet review
  keeps Open Frontier water/pads and A Shau glare in the unresolved visual-art
  bucket, Pixel Forge upgraded building/vehicle GLBs are not imported, no
  matched terrain perf or owner art acceptance has closed, and future
  vehicle-driving surfaces are not certified.
- 2026-05-04 owner texture/route target: later KB-TERRAIN work should also
  inventory existing TIJ and Pixel Forge ground, grass, path, trail, foliage,
  and cover texture/asset candidates before inventing new content. The goal is
  richer ground variety, custom grass/ground foliage and cover where useful,
  and route/trail surfaces that read worn-in, smoother, and more vehicle-usable
  for future driving instead of arbitrary grey gravel or decorative paths.
- 2026-05-05 owner vegetation target: remove the small palm tree species from
  the runtime vegetation set completely. Visual review confirmed this is the
  misleadingly named `giantPalm` / `palm-quaternius-2` short Quaternius palm,
  not the taller `fanPalm` or `coconut` palm-like trees, which should stay. The
  small palm's visual/perf budget should move to grass, low foliage, or other
  ground-cover assets. Do not spend another remediation pass trying to scale
  the small palm into a tree; treat it as a removal and replacement objective
  under KB-TERRAIN vegetation acceptance.
- 2026-05-05 owner source-asset pipeline target: investigate EZ Tree or a
  similar procedural/tree-source workflow for generating browser-appropriate
  GLBs that can be baked into TIJ impostors/LODs for missing Vietnam tree
  families, understory variety, ground cover, grass, trail-edge cover, and
  route-surface detail. This is a source-pipeline investigation, not runtime
  acceptance: verify exact tool identity, licensing, polygon/texture budgets,
  Pixel Forge bake compatibility, and visual fit before any generated GLB or
  baked atlas enters shipped assets.
- 2026-05-05 owner landscape-distribution target: A Shau vegetation should not
  look like an even random sampler that sprinkles every active species across
  the whole map. Fold a vegetation ecology/hydrology pass into KB-TERRAIN:
  bamboo should be able to form readable grove/forest pockets, palms should
  have denser local stands and water/lowland-edge rules where appropriate,
  broad jungle should transition through understory and ground cover, and
  trails should carry disturbed edges rather than the same vegetation mix as
  untouched slopes. This needs research and an implementation plan before
  runtime acceptance: identify the relevant Vietnam plant-community patterns,
  map available DEM/terrain signals into hydrology and slope/aspect proxies,
  then add deterministic clustered distribution audits plus before/after A
  Shau screenshots and perf captures. This is not closed by the current
  `100%` jungle-like material distribution audit or by raw vegetation density.
- 2026-05-05 A Shau hydrology-biome proxy implementation: A Shau now has a
  first deterministic landscape-distribution pass in `A_SHAU_VALLEY_CONFIG`.
  Because the mode does not yet expose a real stream/water-edge layer, the
  classifier uses DEM-derived low, flatter valley-floor bands as hydrology
  proxies: `swamp` for the wettest low flats, `riverbank` for lowland shoulders,
  and limited `bambooGrove` pockets on flatter low benches. Riverbank and swamp
  palettes now bias toward `fanPalm`, `coconut`, `elephantEar`, and low
  understory so A Shau does not scatter the same dense-jungle palette
  everywhere. The static audit
  `artifacts/perf/2026-05-06T04-13-18-235Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  passes for A Shau with CPU biome coverage `77.8%` denseJungle, `15.7%`
  riverbank, `4.04%` bambooGrove, and `2.46%` swamp, plus no A Shau
  distribution flags. The fresh elevated screenshot baseline
  `artifacts/perf/2026-05-05T23-49-56-989Z/projekt-143-terrain-horizon-baseline/summary.json`
  captures 4/4 nonblank Open Frontier/A Shau horizon shots and links trusted
  Open Frontier/A Shau perf-before summaries. This is a candidate ecology
  slice, not KB-TERRAIN closeout: it still needs matched after perf captures,
  ground-level/human visual review, and eventually a real hydrology/stream
  input before water-edge placement can be accepted as more than a terrain
  proxy.
- 2026-05-06 reusable hydrology track: `src/systems/terrain/hydrology/HydrologyBake.ts`
  adds a pure deterministic D8 flow-direction/accumulation bake over sampled
  height grids, with an optional epsilon-fill depression pass and focused
  behavior tests in
  `src/systems/terrain/hydrology/HydrologyBake.test.ts`. The static audit
  `npm run check:projekt-143-terrain-hydrology` samples the A Shau DEM and
  Open Frontier procedural height provider, and
  writes
  `artifacts/perf/2026-05-06T02-48-23-154Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`.
  That first audit was WARN by design and exposed the stale broad lowland
  hydrology-proxy problem. It is superseded by the later runtime-classification
  cleanup audit recorded below, which removes those dry-cell proxies from
  default large-map classification. The same bake interface is the proposed
  route for Open Frontier
  rivers: sample the seeded procedural height provider, fill/breach pits,
  route channels, simplify river polylines, carve beds/banks, and feed
  wetness/channel masks into vegetation/material placement. The latest audit
  JSON includes bounded world-space `channelPolylines` for the top paths to
  make that next branch concrete. The hydrology module now also has a schema-v1
  cache-artifact contract for sparse wet/channel masks and channel polylines;
  the current audit writes A Shau and Open Frontier cache JSON next to the
  review masks. A durable prebake/check command also writes tracked cache files
  under `public/data/hydrology` for A Shau and approved Open Frontier seed `42`,
  and a typed manifest/cache loader exists for default large-map runtime preload
  work. The same cache now feeds vegetation classification and terrain material
  masks; river meshes and water gameplay remain separate open work.
  The design and research trail are in
  [PROJEKT_OBJEKT_143_HYDROLOGY.md](PROJEKT_OBJEKT_143_HYDROLOGY.md).
  Non-claim: this does not add water rendering, does not close KB-TERRAIN, and
  has no final visual or perf acceptance.
- 2026-05-06 hydrology runtime proxy cleanup: the broad A Shau `swamp` /
  `riverbank` and Open Frontier base `riverbank` elevation rules were removed.
  Wet/channel vegetation classification is now owned by
  `HydrologyBiomeClassifier` over the baked mask, and the hydrology and terrain
  distribution audits measure that runtime classification path. Latest
  hydrology audit:
  `artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
  PASS, with `100%` wet-candidate coverage and `0%` dense-jungle wet candidates
  for both A Shau and Open Frontier at audit resolution. Latest terrain
  distribution audit:
  `artifacts/perf/2026-05-06T17-00-32-427Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  WARN only on the unrelated AI Sandbox random-seed audit fallback after A Shau
  gained a dry lowland `tallGrass` ground-cover band. Validation:
  focused terrain/hydrology/vegetation config tests PASS (`22` tests),
  `npm run typecheck` PASS, `npm run build:perf` PASS, and completion audit
  `artifacts/perf/2026-05-06T11-03-38-131Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`.
- 2026-05-06 noisy Open Frontier perf rejection and banana-plant albedo cleanup:
  `artifacts/perf/2026-05-06T00-00-32-485Z/summary.json` is not usable as
  KB-TERRAIN acceptance evidence. It failed validation on peak p99, hitch
  percentage, and harness shot/hit minimums, and the owner reported another web
  game test load was running on the same device during the capture. The terrain
  baseline and Cycle 3 kickoff selectors now require certification-grade perf
  summaries (`measurementTrust=pass`, no failed validation, and no
  `status=failed`) before promoting a latest Open Frontier/A Shau artifact.
  The owner also identified the yellow-fruit plant as visually wrong because
  the lower stem was blue/cyan. That was the `bananaPlant` albedo atlas, and
  `public/assets/pixel-forge/vegetation/bananaPlant/banana-tree-sean-tarrant/imposter.png`
  has been recolored so the lower stem reads green. `src/config/vegetationTypes.test.ts`
  now includes an atlas regression check that the banana plant albedo contains
  `0` strong cyan-blue opaque stem pixels; focused validation
  `npx vitest run src/config/vegetationTypes.test.ts` passes with `15` tests.
  `npm run validate:fast` was then rerun after one noisy timing failure in
  `SpatialOctree.test.ts`; the focused octree rerun passed, and the final
  `validate:fast` pass completed Pixel Forge cutover, NPC crop check,
  typecheck, lint, and `254` Vitest files / `3899` tests. This supports local
  static coherence only; it does not close matched perf, visual acceptance,
  commit/push, CI, deploy, or live production parity. `npm run build` and
  `npm run build:perf` also pass after the atlas/selector work; the normal Vite
  chunk-size warning remains advisory and unchanged.
  `npm run check:projekt-143-vegetation-normal-proof -- --no-build` was then
  refreshed at
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/summary.json`;
  it remains WARN because the no-normal candidate visibly diverges from the
  default path. Default normal maps stay unchanged, and the no-normal candidate
  is rejected for current runtime or Pixel Forge bake policy. The latest
  completion audit at
  `artifacts/perf/2026-05-06T06-41-21-019Z/projekt-143-completion-audit/completion-audit.json`
  remains `NOT_COMPLETE`.
- 2026-05-04 low-resource terrain asset inventory:
  `scripts/projekt-143-terrain-asset-inventory.ts` is exposed as
  `npm run check:projekt-143-terrain-assets` and writes
  `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`.
  It records `12` terrain WebP textures, including `5` green-ground variants
  and `4` trail/cleared/disturbed variants, plus `5` Pixel Forge
  ground-cover/trail prop candidates, `12` existing building candidates, `7`
  runtime Pixel Forge vegetation species before the short-palm retirement, and
  `6` blocked Pixel Forge vegetation species. The post-removal runtime target
  is `6` species plus `1` retired short palm entry. This closes the
  "look into existing texture/assets"
  inventory step without browser/perf work. It does not accept any new runtime
  asset; visual, footprint, collision, draw-call, texture residency, and
  LOD/HLOD review are still required before import or placement changes.
- 2026-05-04 A Shau route/trail stamping pass:
  `scripts/projekt-143-terrain-route-audit.ts` is exposed as
  `npm run check:projekt-143-terrain-routes` and writes
  `artifacts/perf/2026-05-05T22-34-25-178Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
  in the latest refresh.
  A Shau `terrainFlow` now uses full `jungle_trail` route stamping instead of
  map-only routes, with conservative average-height smoothing. The audit
  reports `12` A Shau route paths, `52,504m` of route length, `1,321` route
  capsule stamps, and `14` surface patches with no route-policy flags. This is
  route-surface/stamp acceptance only, not final vehicle-navigation or visual
  acceptance. The paired A Shau runtime capture
  `artifacts/perf/2026-05-04T13-03-02-238Z/summary.json` has measurement trust
  PASS and stronger active-player movement/hit coverage (`170` shots,
  `59` hits, `57` movement transitions, max stuck `1.3s`), but it failed
  validation on heap end-growth/recovery and still logged terrain-stall
  warnings. A fresh current-worktree rerun at
  `artifacts/perf/2026-05-05T02-41-21-751Z/summary.json` clears the hard heap
  blocker (`heap_growth_mb=-61.58`, peak growth `16.64MB`, recovery PASS) and
  keeps measurement trust PASS, `150` shots, `86` hits, and `27` movement
  transitions. It is still WARN on peak p99 (`34.80ms`) and still logs NPC
  terrain-stall backtracking, so A Shau is improved but not fully signed off;
  the next terrain branch should connect route stamps to nav/war-simulator path
  quality before claiming acceptance.
- 2026-05-05 A Shau route endpoint inset follow-up: runtime stall hotspots
  around Hill 937 showed some objective-route endpoints stopping outside the
  capture area, so NPCs still left the smoothed trail stamp before reaching the
  objective. `TerrainFlowCompiler` now keeps home-base exits conservative but
  lets non-home objective routes end at `0.88 * zone.radius`, putting route
  trails inside the objective footprint without stamping through the center.
  Focused route/placement evidence passes:
  `artifacts/perf/2026-05-06T17-00-32-294Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
  and
  `artifacts/perf/2026-05-05T23-32-34-928Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
  The paired A Shau capture
  `artifacts/perf/2026-05-05T23-32-48-770Z/summary.json` is still WARN, with
  p99 `32.50ms`, heap end-growth `27.10MB`, heap peak-growth `59.05MB`, and
  `42` terrain-stall warnings, but it improves the active-player route signal
  versus the previous current-worktree run: waypoint replans drop `81 -> 40`
  and waypoints followed rise `249 -> 317`. This is a narrow route-quality
  improvement, not A Shau route/nav acceptance. The resource-free follow-up
  capture at `artifacts/perf/2026-05-06T04-30-51-979Z/summary.json` keeps
  measurement trust PASS but remains validation WARN with p99 `33.40ms`, heap
  peak-growth `87.77MB`, shots below harness minimum, long startup, and visible
  terrain-stall/backtracking noise; it is current evidence, not route/nav
  signoff.
- 2026-05-04 local terrain/camera follow-up: the grey mountaintop problem has
  a second, more conservative shader pass in progress. `highland`/rock remains
  available, but only as a reduced moss-tinted cliff/steep-side accent instead
  of an ugly broad elevation cap on hilltops. The current static audit
  `artifacts/perf/2026-05-04T21-42-10-596Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  keeps jungle-like flat ground at `100%` in every shipped mode and records
  steep cliff-rock accent eligibility without turning high ground into blanket
  gravel. This is still material-distribution evidence, not final art
  acceptance.
- 2026-05-04 local player/terrain clipping finding: the existing grounded
  rise clamp prevented one-frame camera launches, but it could still carry the
  player's X/Z onto a sudden terrain lip while limiting Y rise to `0.5m`. That
  can leave the first-person camera inside a hillside, producing the reported
  water/behind-hill terrain clipping when walking up into a slope. The local
  `PlayerMovement` fix rejects that horizontal step and marks it as terrain
  blocked when the next terrain eye height exceeds the allowed rise. Focused
  evidence: `npx vitest run src\systems\player\PlayerMovement.test.ts` PASS.
- 2026-05-04 local vegetation residency finding: under frame pressure,
  `TerrainSystem.computeVegetationFrameBudget` could return
  `maxAddsPerFrame=0`, leaving nearby pending vegetation cells starved until
  the budget recovered. `VegetationScatterer` now grants one critical-radius
  add when the nearest pending cell is adjacent to the player even if far-ring
  additions are throttled. This fixes brief near-field vegetation absence, but
  the fresh Open Frontier diagnostic capture shows many more active vegetation
  instances once residency drains; the next KB-TERRAIN/KB-CULL sweep should
  pair this with coarse vegetation occlusion/distance policy instead of
  simply raising draw distance.
- 2026-05-05 Recast/navmesh terrain-change follow-up: commit `e92523a` adds
  `public/data/navmesh/bake-manifest.json`, deterministic
  `NavmeshBakeSignature` hashing, and runtime solo-navmesh cache fingerprints
  that include the prepared terrain source plus terrain-affecting features.
  `scripts/prebake-navmesh.ts` now skips only when registered pre-baked assets
  match the manifest signatures; stale or missing assets trigger regeneration
  without requiring `--force`. The bake and runtime generation paths also share
  `NavmeshFeatureObstacles`, which stops treating trafficable feature
  footprints such as airfield envelopes as giant blockers and instead bakes
  runtime static placements that opt into collision. This partially closes the
  stale-navmesh risk for registered procedural variants. Remaining limits:
  Open Frontier seeds `137`, `2718`, `31415`, and `65537` are intentionally
  withheld until they have per-seed feature presets. The current working tree
  clears the two Zone Control seed `137` flattened-core warnings with
  `nva_bunkers` and `trail_opfor_egress` below the placement threshold in
  `artifacts/perf/2026-05-05T02-39-51-929Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
  A Shau still needs route/nav quality and terrain-stall acceptance before it
  can be signed.

Root-cause hypotheses:

1. The field report is credible for Open Frontier and especially A Shau: CDLOD
   terrain and camera far planes can show terrain well past the current
   vegetation imposter tier.
2. Increasing the scatterer cell radius alone will not solve the large-mode
   horizon because the active shader fades vegetation to zero by `600m`.
3. Raising existing Pixel Forge billboard max distances would increase overdraw
   and texture reliance without solving the need for a cheap far-canopy
   representation.

Ranked remediations:

1. Add a low-cost outer canopy representation for large/elevated-camera modes:
   sparse GPU-instanced canopy cards beyond the current `600m` vegetation tier,
   blended with terrain albedo/roughness tint so the far band reads as jungle
   mass rather than individual plants.
2. Keep current Pixel Forge imposters as the near/mid vegetation layer and
   avoid increasing their max distance until draw-call, overdraw, and texture
   upload budgets are measured.
3. Use terrain-texture vegetation tinting as the fallback minimum for the
   farthest band if card density cannot meet frame-time budgets.
4. Audit and shortlist existing TIJ/Pixel Forge ground textures, grass/foliage
   assets, cover props, and path/trail materials before making custom assets;
   route stamps should become smoother, worn-in surfaces with vehicle usability
   in mind.
5. Defer virtual texturing or full low-poly cluster forests until WebGL/WebGPU
   strategy and memory budgets are decided.

Acceptance:

- Elevated-camera screenshots for Open Frontier and A Shau show no barren
  terrain band between the `600m` near/mid vegetation tier and the visible
  terrain horizon.
- Ground-level and elevated screenshots show the majority jungle floor reading
  green/vegetated, with gravel/rock retained only where intentionally exposed.
  Evidence must cover Open Frontier and A Shau and must preserve the existing
  terrain texture variety instead of replacing it with a flat tint.
- Vegetation review confirms the short Quaternius palm has been removed from
  runtime and shipped public assets, the taller `fanPalm` and `coconut`
  palm-like species remain,
  the freed visual/perf budget has moved into grass or other ground cover,
  large palms and ground cover are visibly more present, and bamboo appears as
  scattered dense pockets rather than the dominant forest layer.
- A Shau vegetation distribution no longer reads as an evenly spaced mix of
  every active species everywhere. Acceptance requires deterministic clustered
  plant-community evidence: bamboo grove/forest pockets, denser palm stands,
  water/lowland-edge palms or understory where terrain/hydrology proxies justify
  them, disturbed trail-edge vegetation, and richer ground-cover transitions.
  This must be backed by researched Vietnam placement rules, static cluster
  audits, before/after A Shau screenshots, and perf captures.
- Source-pipeline review identifies whether EZ Tree or a similar procedural
  tree workflow can produce licensed, browser-budget GLBs for missing Vietnam
  tree families, understory, ground cover/grass, and trail-edge assets, and
  proves those GLBs bake into Pixel Forge-compatible impostors/LODs before any
  generated asset ships.
- Static feature review confirms airfields, HQs, buildings, support compounds,
  and parked vehicles sit on shaped terrain pads with no hanging foundations or
  hill-edge overhangs. Pixel Forge building candidates must pass the Asset
  Acceptance Standard and a placement/foundation screenshot review before they
  replace shipped structures.
- Trail/route review confirms paths use intentional worn-in dirt, mud, grass,
  or packed-earth materials from existing/project-approved assets where
  possible, and that their terrain stamps are smooth enough to support future
  vehicle movement without fighting route shoulders or building pads.
- Open Frontier and A Shau perf captures show the outer-canopy layer adds no
  more than `1.5ms` to p95 frame time and no more than `10%` renderer draw-call
  growth against matched post-warmup captures.
- Far-canopy luma in dawn, midday, and haze snapshots stays within `+/-15%` of
  near vegetation after fog/atmosphere mixing.
- The new layer is toggleable per mode and can be reverted independently from
  Pixel Forge atlas regeneration.

Open questions:

- What is the cheapest acceptable high-altitude canopy representation:
  extended imposter rings, low-poly clusters, instanced cards, terrain tinting,
  or a hybrid?
- What memory and draw-call budget is available for the outer vegetation layer?
- What A Shau camera profiles should be treated as authoritative: player
  infantry, helicopter, fixed-wing, free-fly debug, or strategy overview?
- Which existing TIJ or Pixel Forge ground/path/foliage/cover textures are
  production-worthy, and where do we need custom grass, ground-cover, or trail
  assets instead?
- Which ground-cover, grass, or trail-edge package takes over the retired
  `giantPalm` / `palm-quaternius-2` density/texture/upload budget?
- Is EZ Tree the right source generator for the missing Vietnam trees/cover, or
  should the pipeline use another licensed procedural/tree source before Pixel
  Forge baking?
- Which route surfaces should become future vehicle paths, and what slope,
  width, shoulder, and smoothing constraints should those trail stamps obey?
- What is the next nav-quality gate after the bake-manifest work: route-to-nav
  path probes, A Shau movement/stall regression, per-seed feature presets for
  withheld Open Frontier variants, or placement screenshot review for the
  Zone Control seed `137` warnings?

### KB-CULL - Culling And Asset Discipline

Status: ASSET ACCEPTANCE STANDARD LANDED; CATEGORY/DRAW-CALL PROOF PASS;
SCOPED SLICES FILED; BROAD CULLING/HLOD STILL OPEN.

Progress:

- 2026-05-02: `scripts/pixel-forge-texture-audit.ts` and
  `npm run check:pixel-forge-textures` establish the first mechanical Pixel
  Forge texture acceptance gate. The current draft thresholds flag any
  mipmapped RGBA estimate at or above `16MiB` and fail any single texture at or
  above `32MiB`. These thresholds are seeded by the measured Open Frontier
  `texSubImage2D` startup stall and are not a final art rule. They are intended
  to prevent future asset drops from silently adding multi-second first-present
  uploads.
- 2026-05-02 Cycle 1: the Asset Acceptance Standard is landed in
  [ASSET_ACCEPTANCE_STANDARD.md](ASSET_ACCEPTANCE_STANDARD.md). It keeps the
  current texture thresholds as mechanical gates, adds atlas density,
  normal-map, triangle/draw-call, LOD/culling, screenshot, and perf-evidence
  requirements, and documents `npm run check:projekt-143-cycle1-bundle` as the
  benchmark sidecar/bundle certifier.
- 2026-05-03 Cycle 2: `npm run check:projekt-143-culling-proof` now provides a
  deterministic headed WebGL proof for renderer category attribution. The PASS
  artifact at
  `artifacts/perf/2026-05-03T09-35-13-554Z/projekt-143-culling-proof/summary.json`
  records nonzero renderer counters, CPU profile capture, browser
  long-task/LoAF capture, and required category coverage for static features,
  aircraft, vegetation imposters, NPC imposters, and close Pixel Forge NPC GLBs.
  This certifies the attribution path for KB-CULL; it is not an optimization or
  visual parity claim.
- 2026-05-04 Cycle 3: `npm run check:projekt-143-culling-baseline` writes a
  KB-CULL owner-path before packet. The clean-HEAD PASS artifact at
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
  selects `large-mode-world-static-and-visible-helicopters` because trusted
  Open Frontier and A Shau captures both contain nonzero draw-call/triangle
  telemetry for `world_static_features` and visible `helicopters`. It records
  Open Frontier owner draw-call-like `388`, A Shau owner draw-call-like `719`,
  visible unattributed percentages `4.729%` and `5.943%`, and total draw-call
  ceilings `1037` / `785`. Close-NPC and weapon pool residency remains a
  diagnostic-only candidate until combat stress measurement trust passes.
- 2026-05-04 rejected candidate: a static helicopter distance-cull prototype
  against `WorldFeatureSystem` was not accepted. The targeted Vitest slice
  passed before rejection, but the trusted Open Frontier after capture at
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json` failed validation
  with `peak_p99_frame_ms=64.70ms`, and the selected owner draw-call-like path
  did not improve: `world_static_features` stayed `349`, visible `helicopters`
  stayed `39`, and combined owner draw-call-like remained `388`. A Shau after
  capture was skipped because the first required guardrail already failed. No
  culling/HLOD remediation or perf win is accepted from this attempt.
- 2026-05-04 partial static-feature batching candidate: `WorldFeatureSystem`
  now builds static placements under a shared `WorldStaticFeatureBatchRoot`
  and batches compatible meshes across placement boundaries after collision
  and LOS registration. The culling proof refreshed at
  `artifacts/perf/2026-05-04T14-08-33-257Z/projekt-143-culling-proof/summary.json`.
  Fresh-build trusted Open Frontier after evidence at
  `artifacts/perf/2026-05-04T14-13-30-766Z/summary.json` is WARN only on
  `peak_p99_frame_ms=50.90ms`; `world_static_features` moved from the previous
  local Open Frontier capture's `328` draw-call-like / `261` materials / `328`
  meshes to `222` / `155` / `222`. This is not a clean Open Frontier total
  renderer win because the capture also had visible close NPCs and weapons,
  and max renderer draw calls rose to `1019`. Fresh A Shau after evidence at
  `artifacts/perf/2026-05-04T14-17-44-361Z/summary.json` is measurement-trusted
  and WARN only on `peak_p99_frame_ms=40.70ms`; compared with the previous
  local A Shau route artifact, `world_static_features` moved from `666`
  draw-call-like / `599` materials / `666` meshes to `268` / `201` / `268`,
  max renderer draw calls moved `1061` to `376`, max frame moved `79.7ms` to
  `46.5ms`, and heap validation no longer fails in this run. The refreshed
  owner baseline at
  `artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`
  passes and records owner draw-call-like `261` Open Frontier / `307` A Shau.
  Accepted scope: static-feature layer draw-call reduction only. Still not
  claimed: helicopter remediation, close-NPC/weapon residency, far canopy,
  A Shau terrain/nav acceptance, production parity, or broad frame-time win.
- 2026-05-04 local static-feature visibility follow-up: the owner reported
  distant bases/houses rendering no matter how far away the player was. The
  first shared static-feature batching pass reduced draw-call-like counts, but
  it also made the static-feature root global. The local follow-up restores
  per-feature render groups and applies camera-distance visibility with
  hysteresis (`900m` on, `980m` off) before per-feature batching. Diagnostic
  Open Frontier capture
  `artifacts/perf/2026-05-04T21-24-46-901Z/summary.json` failed harness combat
  behavior (`7` shots, `0` hits) and is additionally noisy because local asset
  baking was running, so it is not perf acceptance. Its scene attribution is
  still useful: `world_static_features` visible triangles dropped to `6,448`,
  while draw-call-like rose to `337` because culling granularity increased.
  The follow-up culling proof passed at
  `artifacts/perf/2026-05-04T21-42-38-633Z/projekt-143-culling-proof/summary.json`,
  and the owner-path baseline passed at
  `artifacts/perf/2026-05-04T21-42-16-288Z/projekt-143-culling-owner-baseline/summary.json`.
  Accepted claim is still narrow: static-feature distance visibility is
  improving, but next work should combine this with HLOD/cluster batching
  rather than treating per-feature visibility as the final renderer design.
- 2026-05-04 terrain-occlusion culling note: AAA engines generally cull
  vegetation and props hidden by terrain at coarse cluster/cell/sector or
  Hi-Z/occlusion-query granularity, not by per-leaf raycasts. For TIJ the
  right follow-up is a principled terrain-horizon or cell/cluster occlusion
  policy for vegetation/world features, paired with residency prioritization
  and measured overdraw/draw-call effects. This belongs in KB-CULL/KB-TERRAIN
  after the current local visibility fix, not as a one-off patch.
- 2026-05-05 sector-batching attempt: `WorldFeatureSystem` now groups nearby
  static features into `700m` render sectors, batches compatible static
  placements once per sector, and culls sectors from feature-footprint bounds
  instead of individual feature anchors. The culling owner-baseline selector was
  also tightened so failed-validation perf summaries cannot certify a current
  owner path just because measurement trust passed. Deterministic proof passed
  at
  `artifacts/perf/2026-05-05T20-57-39-664Z/projekt-143-culling-proof/summary.json`,
  and the current owner baseline passed at
  `artifacts/perf/2026-05-05T21-19-08-037Z/projekt-143-culling-owner-baseline/summary.json`.
  The branch remains partial: owner draw-call-like improved against the latest
  clean baseline in both large modes, but Open Frontier total renderer draw
  calls still regressed from `587` clean-before to `811` after, so the formal
  kickoff keeps KB-CULL `ready_for_branch` rather than `evidence_complete`.
  A smaller `350m` sector variant passed deterministic proof but was rejected
  because Open Frontier stayed at `812` draw calls and world static
  draw-call-like regressed back to `337`.
- 2026-05-05 close-pool residency evidence correction: Cycle 3 kickoff now
  compares close-NPC/weapon residency against the clean owner-baseline Open
  Frontier before packet instead of the latest unrelated heap-failure capture.
  The refreshed kickoff at
  `artifacts/perf/2026-05-05T22-32-15-489Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  marks the scoped close-pool residency slice `evidence_complete`: hidden
  close-NPC draw-call-like drops from `1360` to `168` in Open Frontier and
  `104` in A Shau; hidden weapon draw-call-like drops from `8480` to `1032`
  in Open Frontier and `664` in A Shau. This is accepted only for close
  NPC/weapon pool residency. It does not close broad static-feature,
  vehicle, HLOD, or vegetation culling because the static-feature/visible
  helicopter owner path remains `diagnostic_only`.
- 2026-05-06 vehicle interaction safety slice: `HelicopterInteraction` now
  suppresses helicopter entry prompts and entry attempts while the player is
  already in fixed-wing flight, matching the existing fixed-wing interaction
  guard for "already in any vehicle." Targeted tests also assert that
  render-culled/invisible helicopters and parked fixed-wing aircraft remain
  proximity-detectable and enterable when the player is on foot, so culling
  visibility does not become gameplay interaction state. Validation:
  `npx vitest run src/systems/helicopter/HelicopterInteraction.test.ts
  src/systems/vehicle/FixedWingInteraction.test.ts
  src/systems/vehicle/AirVehicleVisibility.test.ts --reporter=dot` PASS
  (`16` tests) and `npx tsc --noEmit --pretty false` PASS. This is a scoped
  safety proof only; broad HLOD/culling, vehicle-driving readiness,
  parked-aircraft playtest coverage, and matched perf remain open.

Open questions:

- Which asset classes are actually submitted and drawn by distance after a
  proposed culling/HLOD change?
- What static asset acceptance standard prevents future unmeasured regressions?
- Which Pixel Forge atlases can be compressed, downscaled, split by faction or
  readiness tier, or deferred without breaking imposter quality?
- What coarse terrain-occlusion representation should drive vegetation and
  static-feature visibility: CPU terrain-horizon cells, renderer Hi-Z depth,
  baked sector visibility, or a hybrid matched to CDLOD tiles?

### KB-EFFECTS - Combat Effects

Status: LOW-LOAD FIRST-USE STALL REMOVED; TRUSTED CLOSEOUT EVIDENCE FILED; STRESS ADVISORY REMAINS.

Progress:

- 2026-05-02: `src/systems/weapons/GrenadeEffects.ts` now emits dev/perf-build
  user timings for frag detonation total time and step costs:
  explosion-pool spawn, impact-pool spawn, audio, damage, camera shake, and
  event dispatch. The marks are diagnostic only and do not change grenade
  behavior.
- 2026-05-02: `scripts/perf-grenade-spike.ts` now launches a perf-build AI
  Sandbox probe, waits through warmup, records a baseline frame window,
  triggers live grenade projectiles through `grenadeSystem.spawnProjectile`,
  records the detonation window, and writes `summary.json`,
  `baseline-snapshot.json`, `detonation-snapshot.json`, `console.json`, and a
  Chrome CPU profile. It is exposed as `npm run perf:grenade-spike`.
- 2026-05-02: The grenade probe disables the diagnostic WebGL texture-upload
  observer through `window.__perfHarnessDisableWebglTextureUploadObserver`.
  That observer remains appropriate for startup attribution, but wrapping every
  WebGL texture call contaminates sustained runtime captures.
- 2026-05-02 low-load reproduction:
  `artifacts/perf/2026-05-02T20-21-05-603Z/grenade-spike-ai-sandbox` ran
  headed with `npcs=2`, two grenades, a 120-frame baseline window, and a
  273-frame detonation window. Baseline p95/p99/max were
  `22.6ms / 23.6ms / 25.0ms`; detonation p95/p99/max were
  `25.7ms / 30.6ms / 100.0ms`, with two `>50ms` hitches. The first trigger
  landed at `17619.1ms` and coincided with a `379ms` long task plus a
  `380.5ms` long animation frame. The second trigger at `19129.9ms` did not
  produce a matching long task. This supports a first-use stall, not a
  per-detonation steady cost.
- 2026-05-02 step attribution from the same artifact: two grenade detonations
  measured `kb-effects.grenade.frag.total` at `1.4ms` total with `1.0ms` max.
  `spawnProjectile` measured `0.6ms` total / `0.4ms` max. Explosion-pool,
  impact-pool, audio, damage, camera-shake, and event-dispatch timings were all
  sub-millisecond. The measured JS detonation path is not large enough to
  explain the browser stall.
- 2026-05-02 CPU-profile lead from the same artifact: top aggregate self-time
  buckets were Three/WebGL render and first-use program work, including
  `updateMatrixWorld` at about `2500ms`, minified Three function `h` at
  `772.8ms`, `(program)` at `497.5ms`, `multiplyMatrices` at `444.3ms`,
  `getProgramInfoLog` at `334.6ms`, and `renderBufferDirect` at `116.8ms`.
  The current lead is first visible explosion render/program/material work,
  not combat damage, audio decode, physics broadphase, or effect object
  allocation.
- 2026-05-02 120-NPC load check:
  `artifacts/perf/2026-05-02T20-19-04-818Z/grenade-spike-ai-sandbox` shows the
  stress scene is already saturated before grenade detonation: the 120-frame
  baseline took `29.5s`, every sampled frame was clamped at `100ms`, and
  Combat EMA was about `40ms`. The grenade JS path still measured only
  `1.2ms`, but this scene is not a valid grenade-isolation benchmark until
  baseline combat/render frame time recovers.
- 2026-05-03 current-HEAD low-load refresh:
  `artifacts/perf/2026-05-03T22-09-54-365Z/grenade-spike-ai-sandbox` reran the
  headed two-grenade probe with `npcs=2`, `baselineFrames=120`,
  `postFrames=240`, `warmupMs=10000`, and CPU profile capture present. It
  reproduced the first-use stall: baseline p95/max `22.6ms / 24.2ms`,
  detonation p95/max `22.5ms / 100.0ms`, max-frame delta `75.8ms`, one
  `379ms` long task, and two long-animation-frame entries. Grenade JS remained
  small: `kb-effects.grenade.frag.total=1.4ms` total / `0.9ms` max and
  `spawnProjectile=0.6ms` total / `0.4ms` max.
- 2026-05-03 rejected warmup attempts: explosion-only visible render warmup
  `artifacts/perf/2026-05-03T22-12-40-344Z/grenade-spike-ai-sandbox` still hit
  detonation max `100.0ms`, max-frame delta `73.7ms`, one `397ms` long task,
  and two long-animation-frame entries. Full frag render-path warmup
  `artifacts/perf/2026-05-03T22-16-26-287Z/grenade-spike-ai-sandbox` still hit
  detonation max `100.0ms`, max-frame delta `72.5ms`, one `387ms` long task,
  and two long-animation-frame entries. Culling-forced full frag warmup
  `artifacts/perf/2026-05-03T22-18-02-801Z/grenade-spike-ai-sandbox` still hit
  detonation max `100.0ms`, max-frame delta `75.3ms`, one `373ms` long task,
  and two long-animation-frame entries. The runtime warmup code was reverted
  and no grenade remediation was landed.
- 2026-05-03 render attribution before remediation:
  `artifacts/perf/2026-05-03T22-36-46-874Z/grenade-spike-ai-sandbox`
  wrapped main scene, weapon, grenade overlay, and update phases around the
  low-load two-grenade probe. It confirmed the first trigger hit a
  trigger-adjacent `webgl.render.main-scene` call at `380ms`, plus a nested
  `178.2ms` main-scene render call. The first-use scene child count was
  `1379`, one above the `1378` baseline, and the CPU profile again pointed at
  Three/WebGL program and render work including `(program)`,
  `updateMatrixWorld`, and `getProgramInfoLog`. This made the dynamic
  explosion light/program-state path the first actionable culprit.
- 2026-05-03 first-principles remediation:
  `ExplosionEffectsPool` no longer creates, pools, adds, positions, fades, or
  disposes `THREE.PointLight` instances for grenade explosions. Grenade
  explosions are now unlit pooled visuals: flash sprite, smoke/fire/debris
  `Points`, and shockwave ring. `ExplosionEffectsPool.test.ts` asserts that
  pool construction/spawn adds no `THREE.PointLight` and still makes a flash
  sprite visible.
- 2026-05-03 post-remediation evidence:
  `artifacts/perf/2026-05-03T23-04-07-778Z/grenade-spike-ai-sandbox` reran the
  perf-build low-load two-grenade probe after the unlit explosion change,
  rAF-scheduled trigger, and compact measurement-trust summary patch. Baseline
  p95/max were `36.1ms / 48.1ms`; detonation p95/max were
  `31.0ms / 100.0ms`. This run is noisier than the preceding post-remediation
  check at `artifacts/perf/2026-05-03T22-57-28-665Z/grenade-spike-ai-sandbox`,
  but it preserves the actionable signal: browser long tasks stayed at `0`,
  trigger-adjacent render attribution showed no main-scene render call above
  `29.5ms`, and grenade frag JS stayed small at
  `kb-effects.grenade.frag.total=2.0ms` total / `1.4ms` max. Measurement trust
  is `warn`: CPU profile, long-task observer, LoAF observer, disabled upload
  observer, and render attribution are present, but one long animation frame
  starts before the first trigger while the detonation window still reports a
  `100.0ms` max frame. That blocks full KB-EFFECTS closeout as a frame-metric
  classification gap rather than rejecting the unlit explosion architecture.
- 2026-05-03 measurement-trust closeout:
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox` moves the
  final observer and frame-metric reset into the same `requestAnimationFrame`
  callback that spawns the first live grenade. Measurement trust is PASS:
  CPU profile, long-task observer, LoAF observer, disabled upload observer, and
  render attribution are present. The run records `0` browser long tasks,
  `0` trigger/post-trigger LoAFs, one classified pre-trigger LoAF,
  detonation p95/max `24.3ms / 30.2ms`, max-frame delta `2.6ms`, no
  `>50ms` hitch delta, near-trigger main-scene render max `23.6ms`, and
  `kb-effects.grenade.frag.total=1.5ms` total / `0.9ms` max. This closes the
  low-load grenade first-use stall for the unlit pooled explosion path. It
  does not close saturated combat120 or future visual-polish changes.

Root-cause hypotheses:

1. The trigger-adjacent long task was caused by first-use render/program-state
   churn from the dynamic explosion `PointLight` path, not grenade damage,
   audio, physics broadphase, or particle JS.
2. The prior `100.0ms` detonation max frame was inherited from pre-trigger
   frame scheduling; in-frame arming/reset now classifies pre-trigger LoAF
   delivery separately and removes that metric from grenade-trigger evidence.
3. The current 120-NPC AI Sandbox is over budget before the grenade and cannot
   isolate detonation cost until KB-METRIK/KB-CULL/KB-LOAD reduce baseline
   saturation.

Ranked remediations:

1. Preserve the unlit pooled explosion architecture. Do not reintroduce dynamic
   explosion lights or other per-detonation scene-light state transitions.
2. If explosion visual polish is needed, add it through shader-stable unlit
   sprites, particles, rings, or texture-atlas work with matched before/after
   render attribution.
3. Keep the 120-NPC grenade check advisory until the baseline window reaches
   at least p95 `<33ms`; otherwise the grenade signal remains hidden inside the
   already-failed combat frame budget.

Acceptance:

- Low-load two-grenade probe: no long task above `50ms` within `+/-250ms` of
  either trigger after warmup, and first/second detonation p95 delta below
  `3ms` over matched frame windows.
- Render attribution: no trigger-adjacent main-scene render call above `50ms`.
- Measurement trust: any remaining LoAF or `100ms` frame max is classified as
  trigger-caused or pre-trigger harness/browser contamination.
- Stress grenade probe: only considered valid after its pre-detonation
  baseline p95 is below `33ms` and measurement trust passes.

Low-load verdict: PASS for the unlit pooled explosion path at
`artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`.

### KB-STRATEGIE - WebGL Versus WebGPU

Status: BRIEF FILED; NEAR-METAL PLATFORM PROBE TRACK ACTIVE; RECOMMENDATION IS
REINFORCE WEBGL, DEFER WEBGPU MIGRATION.

Progress:

- 2026-05-02: `scripts/webgpu-strategy-audit.ts` now records active renderer
  usage, active WebGPU source matches, WebGL-specific type/context
  dependencies, migration-blocker patterns, current combatant bucket capacity,
  and retained E2 spike evidence. It writes
  `artifacts/perf/<timestamp>/webgpu-strategy-audit/strategy-audit.json` and is
  exposed as `npm run check:webgpu-strategy`.
- 2026-05-02 evidence:
  `artifacts/perf/2026-05-02T21-37-39-757Z/webgpu-strategy-audit/strategy-audit.json`
  reports `three=^0.184.0`, `activeWebgpuSourceMatches=0`,
  `webglRendererEntrypoints=5`, and `migrationBlockerMatches=94`. The active
  game renderer remains `src/core/GameRenderer.ts` with
  `THREE.WebGLRenderer`; the other renderer constructors are dev/viewer tools.
- 2026-05-06 near-metal platform-track evidence:
  `artifacts/perf/2026-05-06T05-53-35-718Z/webgpu-strategy-audit/strategy-audit.json`
  reports `three=^0.184.0`, `activeWebgpuSourceMatches=0`,
  `webglRendererEntrypoints=12`, `migrationBlockerMatches=113`, and
  `nearMetalBrowserProbeStatus=deferred_resource_contention`. The audit now
  inventories source hooks for WebGL GPU timing, device-class policy,
  OffscreenCanvas, SharedArrayBuffer, cross-origin isolation, and worker
  rendering, and lists the browser-backed fields that the next quiet-machine
  probe should capture: WebGPU adapter/features/limits, WebGL2 extension set
  including `EXT_disjoint_timer_query_webgl2`, OffscreenCanvas support,
  `crossOriginIsolated`/SharedArrayBuffer/Atomics, hardware concurrency,
  device memory, renderer/vendor, and the runtime device tier.
  The `05:53` refresh excludes platform-probe and completion-audit tooling
  self-references so active WebGPU matches remain a runtime-source signal.
  `scripts/projekt-143-platform-capability-probe.ts` now implements that
  guarded browser probe. Its default no-browser run wrote
  `artifacts/perf/2026-05-06T05-36-03-801Z/projekt-143-platform-capability-probe/summary.json`
  with status `deferred`, `headerContract=pass`, and live Pages COOP/COEP
  headers present. A later headless browser-backed run wrote
  `artifacts/perf/2026-05-06T06-03-26-013Z/projekt-143-platform-capability-probe/summary.json`
  with status `warn`: WebGL2 is available through SwiftShader, GPU timer query
  support is missing, `navigator.gpu` has no WebGPU adapter, OffscreenCanvas
  WebGL2 works, isolated SharedArrayBuffer works, and local/live COOP/COEP
  headers pass. This does not approve WebGPU, worker rendering, or a
  WASM-thread rewrite; a headed hardware-backed quiet-machine rerun is still
  better input before any architecture decision.
- The retained E2 branch `origin/spike/E2-rendering-at-scale` is available at
  `311aded91995cddcbf9668f32681bdb16765aa15`. Its throwaway benchmark measured
  the keyed instanced NPC-shaped path at about `2.02ms` avg for `3000`
  instances and the ideal single-instanced path at `0.5ms` avg for `3000`
  instances on the reference workstation. Its recommendation was to defer
  GPU-driven rendering work and not start a WebGPU migration.
- The E2 cliff called out a `120` instance bucket cap. The current active code
  has already moved that default cap to `512` and surfaces overflow through
  `reportBucketOverflow`, so that specific E2 scale bug is no longer silent.
- External status checked 2026-05-02: the official Three.js WebGPU manual says
  `WebGPURenderer` can fall back to WebGL 2, but `ShaderMaterial`,
  `RawShaderMaterial`, `onBeforeCompile`, and old `EffectComposer` passes must
  be ported to node materials/TSL; it also still describes
  `WebGPURenderer` as experimental and `WebGLRenderer` as maintained and
  recommended for pure WebGL 2 applications:
  https://threejs.org/manual/en/webgpurenderer. Chrome's WebGPU overview
  confirms WebGPU's value for lower JS workload and advanced compute/culling
  capabilities, while MDN still marks WebGPU as not Baseline because some
  widely used browsers lack support:
  https://developer.chrome.com/docs/web-platform/webgpu/overview and
  https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API.

Assessment:

- The current WebGL foundation can carry the stabilization cycle if measured
  blockers are fixed in place. The active regressions are texture upload,
  asset budgets, imposter visual contracts, first-use effects, culling
  certification, and distant canopy representation. WebGPU does not remove
  those asset and pipeline obligations.
- A production WebGPU replacement is estimated at `6-10` calendar weeks and
  `240-400` engineer-hours. A credible dual-backend prototype is estimated at
  `3-5` calendar weeks and `120-220` engineer-hours. This estimate comes from
  the active source dependency count plus Three.js migration requirements; it
  is not a completed port measurement.
- WebGPU would unlock compute-driven terrain and vegetation culling,
  storage-buffer or compute-updated transforms, indirect draw submission, and a
  modern MRT/post-processing stack through Three WebGPU/TSL. Those are real
  long-term capabilities, not current stabilization blockers.

Recommendation:

1. Do not commit to WebGPU migration in the recovery/stabilization cycle.
2. Reinforce WebGL first: texture upload policy, asset acceptance, imposter
   parity, effect warmup, culling certification, and far-canopy representation.
3. After stabilization, run a contained WebGPU/TSL spike for one isolated
   renderer path before any point-of-no-return migration decision.

Open questions:

- Which isolated renderer path is the right post-stabilization WebGPU spike:
  far-canopy cards, terrain tile selection, or NPC imposters?
- What browser-support policy would be acceptable if a WebGPU path materially
  outperforms WebGL but still needs fallback?
- What measured WebGL failure would justify reopening the point-of-no-return
  decision before the post-stabilization spike?

## Phase 3 Multi-Cycle Engineering Plan

This plan sequences recovery so trust is restored before optimization and so
each remediation remains landable, revertable, and measurable.

### Cycle 0 - Ship The Evidence Slice

Scope:

- Land KB-METRIK measurement trust, scene attribution, startup UI attribution,
  Pixel Forge texture/optics audits, grenade-spike probe, vegetation horizon
  audit, WebGPU strategy audit, and the recovery docs.
- Do not include asset regeneration, shader tuning, far-canopy rendering, or
  WebGPU migration.
- Use `npm run check:projekt-143` as the non-browser Cycle 0 audit bundle. It
  runs KB-CULL texture audit, KB-OPTIK imposter optics audit, KB-TERRAIN
  vegetation horizon audit, and KB-STRATEGIE WebGPU strategy audit, then writes
  a suite summary artifact. Latest validation:
  `artifacts/perf/2026-05-02T22-05-00-955Z/projekt-143-evidence-suite/suite-summary.json`.

Dependencies:

- None beyond local validation. This is the foundation for all later cycles.

Acceptance:

- `npm run typecheck` passes.
- `npm run check:projekt-143` passes and writes a suite summary listing every
  static bureau audit artifact.
- `npm run check:pixel-forge-textures`, `npm run check:pixel-forge-optics`,
  `npm run check:vegetation-horizon`, and `npm run check:webgpu-strategy`
  write artifacts without errors.
- `npm run perf:grenade-spike` can reproduce or explicitly fail to reproduce a
  low-load grenade event with baseline/detonation windows.
- No doc claims describe performance or visual fixes that are not present in
  code.

Reversibility:

- Foundational, but low-risk. The slice is additive instrumentation and docs.

### Cycle 1 - Certified Baselines And Asset Policy

Scope:

- Re-run Open Frontier startup, `combat120`, Open Frontier short, A Shau short,
  and a low-load grenade probe on a quiet machine with measurement trust
  passing where applicable.
- Convert the Pixel Forge texture audit thresholds into an explicit Asset
  Acceptance Standard.
- Decide preload, deferred upload, compression, atlas-size, and normal-map
  policies from measured upload and visual evidence.

Dependencies:

- Cycle 0 tooling must be landed.
- KB-LOAD, KB-CULL, KB-OPTIK, and KB-EFFECTS all depend on KB-METRIK trust.

Acceptance:

- Open Frontier startup has at least three retail-build runs with WebGL upload
  attribution and a named largest-upload table.
- A trusted `combat120` or documented untrusted capture explains harness
  overhead before frame-time conclusions are used.
- Asset Acceptance Standard blocks single textures above the chosen MiB limit
  unless an explicit exception carries upload and visual evidence.
- Candidate texture policy estimates are paired with visual-risk notes, not
  accepted as art changes by themselves.

Reversibility:

- Foundational policy; individual thresholds remain adjustable by PR.

### Cycle 2 - Visual Runtime Proofs

Scope:

- Build matched screenshot rigs for NPC close GLB versus imposter bounds/luma.
- Add elevated Open Frontier and A Shau vegetation-horizon screenshot captures.
- Add culling/draw-call certification views for helicopters, buildings,
  static features, vegetation, close NPC GLBs, and NPC imposters.

Dependencies:

- Cycle 1 baselines and asset policy.
- KB-OPTIK cannot accept shader or atlas changes without matched screenshots.
- KB-TERRAIN cannot accept outer canopy without elevated screenshots and perf
  captures.
- KB-CULL cannot certify culling without draw-call/triangle attribution.

Acceptance:

- NPC close/imposter projected height delta is within `+/-10%` at the selected
  LOD switch distances or the exception is visually signed off.
- Mean opaque luma delta between close and imposter crops stays within
  `+/-12%` under at least midday, dawn/dusk, and haze snapshots.
- Open Frontier and A Shau elevated screenshots show the current vegetation
  horizon defect before any remediation lands.
- Draw-call and triangle attribution identify static-feature, aircraft,
  vegetation, NPC imposter, and close NPC costs to below `10%` unattributed
  visible triangles in representative captures, with a dedicated headed proof
  allowed to cover categories not visible in the representative camera windows.

Reversibility:

- Foundational validation surfaces. Screenshots and probes are additive.

Current Cycle 2 status:

- 2026-05-03: `npm run evidence:atmosphere -- --out-dir
  artifacts/perf/2026-05-03T01-00-12-099Z/projekt-143-cycle2-runtime-proof`
  refreshed all-mode runtime screenshots on source
  `5f46713d101f6fea974da6d77f303c95df58000c`. Open Frontier and A Shau each
  have ground-readability, sky-coverage, and aircraft-clouds screenshots plus
  renderer/terrain samples. This is current-condition proof, not remediation.
- 2026-05-03: `npm run check:projekt-143-cycle2-proof` was refreshed after
  the aircraft import and wrote
  `artifacts/perf/2026-05-03T09-17-01-580Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  Overall status is WARN. Runtime horizon screenshots and static horizon audit
  checks passed. Scene attribution is under the `10%` unattributed visible
  triangle budget (`4.00%` Open Frontier, `6.03%` A Shau), but some required
  categories have zero visible triangles in these captures and need dedicated
  close-NPC/NPC-imposter views. Static optics evidence exists, but matched
  close-GLB/imposter screenshots are not certified yet.
- 2026-05-03: `npm run check:projekt-143-culling-proof` added the dedicated
  KB-CULL renderer/category proof that the AI Sandbox diagnostics could not
  certify. The trusted headed artifact is
  `artifacts/perf/2026-05-03T09-35-13-554Z/projekt-143-culling-proof/summary.json`.
  It records commit SHA, headed browser metadata, a fixture screenshot,
  CPU profile, browser long-task/LoAF capture, renderer stats (`133` draw
  calls, `4,887` triangles), and scene attribution for static features,
  fixed-wing aircraft, helicopters, vegetation imposters, NPC imposters, and
  close Pixel Forge NPC GLBs. Measurement trust is PASS with browser/page/
  request errors at `0` and probeP95 `1.96ms`. A headless exploratory run
  produced a lost WebGL context and zero renderer counters, so the npm script
  is headed by default. The proof screenshot is not relative scale evidence:
  fixture GLBs are scaled by longest bounding-box axis to keep all required
  categories visible in one camera. KB-OPTIK matched close-GLB/imposter
  screenshots remain the scale/parity authority.
- 2026-05-03: `npm run check:projekt-143-cycle2-proof` was refreshed again
  after the dedicated culling proof and wrote
  `artifacts/perf/2026-05-03T09-35-33-689Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  Overall status remained WARN at that point because KB-OPTIK still lacked
  matched close-GLB/imposter screenshot crops. KB-CULL scene attribution is PASS:
  Open Frontier and A Shau representative captures remain below the `10%`
  unattributed visible-triangle budget, and the dedicated proof covers required
  renderer categories with trusted measurement.
- 2026-05-03: `npm run check:projekt-143-optics-scale-proof -- --port=0`
  added the matched KB-OPTIK evidence and passed at
  `artifacts/perf/2026-05-03T10-39-21-420Z/projekt-143-optics-scale-proof/summary.json`.
  It records four close-GLB/imposter crop pairs, projected geometry height,
  rendered visible silhouette height, luma/chroma deltas, same-scale aircraft
  native bounds, headed browser metadata, and measurement-trust flags. The
  evidence proved Cycle 2 had the required visual proof surface, while also
  flagging that the pre-remediation imposters rendered at only `0.52-0.54x`
  close-GLB visible height and substantially darker luma.
- 2026-05-03: `npm run check:projekt-143-cycle2-proof` now consumes the
  KB-OPTIK scale proof and passed at
  `artifacts/perf/2026-05-03T11-19-13-862Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  PASS means the Cycle 2 evidence bundle is complete for review; it is not a
  shader, atlas, NPC-scale, vehicle-scale, culling, or performance remediation
  claim.
- 2026-05-03: user approved moving the aircraft GLB replacement into Cycle 2.
  Six Pixel Forge aircraft GLBs were imported through
  `scripts/import-pixel-forge-aircraft.ts` rather than copied directly. The
  importer records source/provenance metadata and wraps the `+X`-forward source
  scene under `TIJ_AxisNormalize_XForward_To_ZForward` so the public runtime
  GLBs keep TIJ's `+Z`-forward storage contract. Provenance sidecars are tracked
  under `docs/asset-provenance/pixel-forge-aircraft-2026-05-02/`. Local import
  evidence:
  `artifacts/perf/2026-05-03T01-55-00-000Z/pixel-forge-aircraft-import/summary.json`.
  Standalone visual viewer evidence:
  `artifacts/perf/2026-05-03T01-58-00-000Z/pixel-forge-aircraft-viewer/summary.json`.
  `npm run probe:fixed-wing -- --boot-attempts=2` passed at
  `artifacts/fixed-wing-runtime-probe/summary.json`, covering A-1, F-4, and
  AC-47 takeoff/climb/approach/bailout/handoff. The first Open Frontier
  renderer capture exposed GLTFLoader interleaved-attribute merge errors; the
  TIJ `ModelDrawCallOptimizer` wrapper now deinterleaves geometry attributes
  before static batching, and the rerun at
  `artifacts/perf/2026-05-03T03-07-26-873Z` has measurement-trust PASS and `0`
  browser errors. A Shau renderer evidence at
  `artifacts/perf/2026-05-03T03-11-40-162Z` also has measurement-trust PASS and
  `0` browser errors. Both large-mode validations are WARN on peak p99, and
  strict `perf:compare` fails against older baselines, so there is no
  optimization claim. Local code gates for this aircraft patch now pass:
  `npm run validate:fast`, `npm run build`, and `npm run check:projekt-143`
  with the latest static evidence summary at
  `artifacts/perf/2026-05-03T11-18-46-108Z/projekt-143-evidence-suite/suite-summary.json`.
  Manual CI run `25274278013` and Deploy run `25274649157` passed. Live Pages
  `/asset-manifest.json` reported
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`; Pages shell, service worker,
  manifest, representative aircraft GLBs, Open Frontier navmesh/heightmap,
  hashed build assets, Recast WASM, and the A Shau R2 DEM URL returned `200`;
  a live Zone Control browser smoke reached the deploy UI with no console,
  page, request, or retry-panel failures. Remaining open gate: human
  aircraft-feel playtest.
- 2026-05-03 KB-CULL follow-up: focused AI Sandbox captures were attempted to
  expose close-NPC and NPC-imposter renderer categories:
  `artifacts/perf/2026-05-03T09-10-57-791Z` (`npcs=120`) and
  `artifacts/perf/2026-05-03T09-13-00-811Z` (`npcs=60`). Both failed validation
  and `measurement_trust`; the lower-load capture still had probeAvg `96.62ms`
  and probeP95 `211ms`. It did expose `npc_close_glb` (`39601` visible
  triangles) and `npc_imposters` (`2` visible triangles), but the artifact is
  diagnostic only. This failed path is retained as an agent-DX warning: do not
  repeat combat-heavy AI Sandbox captures for KB-CULL certification when the
  deterministic headed proof exists.
- No shader, atlas, culling, far-canopy, grenade, texture, or WebGPU remediation
  may be accepted from Cycle 2 until the relevant proof check is PASS or a
  documented exception exists.

### Cycle 3 - Measured WebGL Remediation

Scope:

- Apply the smallest reversible fixes: texture regeneration/compression or
  deferred upload, first-use explosion warmup/simplification, culling/HLOD
  fixes for static assets, and a far-canopy layer if screenshots and budgets
  justify it.

Dependencies:

- Cycle 2 visual/runtime proof must exist for the affected subsystem.
- KB-STRATEGIE keeps WebGPU migration out of this cycle.

Acceptance:

- Open Frontier mode-click-to-playable median and p95 improve against Cycle 1
  startup baselines, with upload totals and largest-upload deltas reported.
- Open Frontier and A Shau 95th-percentile frame time stay below the chosen
  scenario budget over a post-warmup capture window; no remediation may pass
  solely on mean frame time.
- Low-load grenade probe has no long task above `50ms` within `+/-250ms` of
  either warmed trigger, and first/second detonation p95 delta stays below
  `3ms`.
- Outer canopy, if landed, adds no more than `1.5ms` to p95 frame time and no
  more than `10%` renderer draw-call growth in matched large-mode captures.

Reversibility:

- Reversible remediation. Each fix must land in its own PR or bisectable commit.

Current Cycle 3 status:

- Fresh-agent handoff: `docs/PROJEKT_OBJEKT_143_HANDOFF.md` contains the
  short continuation prompt, current local repo constraints, and latest
  evidence anchors for agents taking over from a clean session.
- 2026-05-05/06: after owner visual acceptance of the runtime-equivalent NPC
  packet, `npm run check:projekt-143-cycle3-kickoff` wrote
  `artifacts/perf/2026-05-07T00-26-45-885Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-OPTIK `npc-imposter-scale-luma-contract` is now `evidence_complete`: the
  first `2.95m` target/crop remediation plus selected/expanded luma tuning has
  matched evidence inside the `+/-15%` height band and `+/-12%` luma band, the
  runtime LOD-edge proof passes with `0/40` flags, and owner review accepts the
  remaining 8.5m near-stress exception for the current packet with a caution
  not to destabilize the good-looking in-game result.
  KB-LOAD `pixel-forge-texture-upload-residency` remains
  `ready_for_branch`, now with proof-only Pixel Forge 256px vegetation candidate
  startup tables showing a large startup/upload win, but still blocked on owner
  visual acceptance, accepted import, in-game visual proof, and real runtime
  validation. KB-EFFECTS `grenade-first-use-stall` is
  `evidence_complete` for the low-load first-use stall after dynamic explosion
  `PointLight` removal and in-frame metric arming eliminated the
  trigger-adjacent `300ms+` main-scene render stall, browser long task, and
  inherited `100ms` frame metric. KB-TERRAIN
  `large-mode-vegetation-horizon` is now `ready_for_branch` after
  `npm run check:projekt-143-terrain-baseline` wrote
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`
  from a clean-HEAD fresh perf build. It captured `4/4` elevated Open Frontier and
  A Shau screenshots with renderer stats, terrain metrics, vegetation active
  counters, and nonblank terrain image checks, then linked trusted Open
  Frontier and A Shau perf-before baselines. Future after captures must stay
  within the recorded ceilings: Open Frontier p95 `<=43.5ms` and draw calls
  `<=1141`, A Shau p95 `<=40.9ms` and draw calls `<=864`.
  The latest terrain proof at
  `artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`
  is PASS, and the latest Open Frontier/A Shau runtime captures at
  `artifacts/perf/2026-05-06T04-27-07-950Z/summary.json` and
  `artifacts/perf/2026-05-06T04-30-51-979Z/summary.json` have measurement
  trust PASS with validation WARN, so they refresh current evidence without
  signing A Shau route/nav quality.
  The branch goal now also includes jungle-floor material correction and
  vegetation distribution: preserve texture variety but make most ground read
  green/jungle, investigate possible inverted material distribution if green is
  appearing mainly on hillsides, scale and ground palms/ferns properly, add
  more big palms and ground vegetation, and reduce bamboo dominance into
  scattered dense clusters.
  The current local branch adds a second bamboo clustering fix that gives
  clustered mid-level vegetation its own Poisson spacing instead of sharing the
  palm grid, plus a terrain placement audit and first Open Frontier/A Shau
  airfield relocation. Later generated-placement relief sampling reopened
  airfield/foundation visual risk, and A Shau route overlays now stamp
  `jungle_trail` terrain corridors, but A Shau remains blocked because the
  paired route capture failed heap validation and terrain-stall symptoms still
  appear. The active-player harness also has a
  shorter-NPC visual-chest
  aim fix in unit tests and a fresh Open Frontier capture with `120` shots and
  `43` hits. Because another browser game was running on and off during that
  capture, use it to close the zero-hit hit-contract question only; do not use
  its frame-time metrics as perf acceptance.
  KB-CULL `static-feature-and-vehicle-culling-hlod` is now
  partially exercised after the shared static-feature batching pass. The
  before packet at
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
  selected `large-mode-world-static-and-visible-helicopters`; the refreshed
  after packet at
  `artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`
  records owner draw-call-like `261` Open Frontier / `307` A Shau after the
  shared static-feature root. Treat the pass as accepted static-feature
  draw-call reduction, not as a complete culling/HLOD branch closeout.
  The selected owner path is
  still `large-mode-world-static-and-visible-helicopters`; the next after
  branch must improve the remaining owner draw-call/triangle telemetry in
  matched Open Frontier and A Shau captures without regressing total renderer
  draw calls or visible unattributed percentage. Close-NPC pool residency is
  now accepted only as a scoped residency slice; it does not close broad
  static-feature, vehicle, vegetation, or HLOD culling.
  A static helicopter distance-cull candidate was rejected after
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json` because Open Frontier
  validation failed and the owner path stayed at `388`; do not repeat that
  exact approach as a claimed KB-CULL fix without new before/after evidence.
  A follow-up grounded/parked helicopter visibility branch is now accepted only
  as a narrow visible-helicopter category reduction: it applies the existing
  air-vehicle render-distance rule before stopped grounded helicopters skip the
  physics update. Targeted helicopter/air-vehicle visibility tests passed.
  Open Frontier rerun evidence at
  `artifacts/perf/2026-05-04T17-41-57-455Z/summary.json` is measurement-trusted
  with validation WARN only on peak p99; `helicopters` attribution drops to
  `0` visible objects / `0` visible triangles. A Shau rerun evidence at
  `artifacts/perf/2026-05-04T17-51-52-562Z/summary.json` is measurement-trusted
  with validation WARN only on peak p99; against the static-feature after
  point it reduces helicopters from `56` visible objects / `4,796` visible
  triangles to `37` / `2,696`. A prior A Shau run at
  `artifacts/perf/2026-05-04T17-46-23-113Z/summary.json` reduced helicopters
  further but failed heap recovery, so it remains diagnostic only. The
  refreshed culling proof is
  `artifacts/perf/2026-05-04T17-56-35-772Z/projekt-143-culling-proof/summary.json`,
  and the refreshed owner baseline is
  `artifacts/perf/2026-05-04T17-56-41-253Z/projekt-143-culling-owner-baseline/summary.json`.
  The latest resource-free refresh is
  `artifacts/perf/2026-05-06T22-12-58-306Z/projekt-143-culling-proof/summary.json`
  plus
  `artifacts/perf/2026-05-06T22-22-09-798Z/projekt-143-culling-owner-baseline/summary.json`.
  Do not promote this to broad vehicle culling/HLOD, frame-time, or A Shau
  terrain/nav acceptance.
- 2026-05-04 final KB-CULL grounded/parked helicopter gates:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T17-58-34-753Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T17-58-50-965Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3863` tests).
- 2026-05-04 local follow-up validation: focused vegetation/terrain/harness
  unit tests passed, `npm run check:projekt-143-terrain-placement` PASS wrote
  `artifacts/perf/2026-05-04T12-59-25-892Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`,
  `npm run check:projekt-143-terrain-distribution` WARN wrote
  `artifacts/perf/2026-05-04T12-59-32-610Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  with only the expected AI Sandbox fixed-fallback seed flag, and
  `npm run check:projekt-143-terrain-baseline` PASS wrote
  `artifacts/perf/2026-05-04T12-59-44-452Z/projekt-143-terrain-horizon-baseline/summary.json`.
  The new route audit passed at
  `artifacts/perf/2026-05-04T12-58-03-421Z/projekt-143-terrain-route-audit/terrain-route-audit.json`.
  A Shau after-route perf evidence at
  `artifacts/perf/2026-05-04T13-03-02-238Z/summary.json` is measurement-trusted
  but failed validation on heap growth/recovery, so it is regression evidence
  for the route pass and active-player hit coverage, not A Shau acceptance.
  A low-resource terrain asset inventory pass wrote
  `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
  and is WARN by design because it is shortlist evidence, not asset
  acceptance.
- 2026-05-04 final KB-CULL static-feature batching gates: `npm run
  check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T14-29-34-142Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T14-29-43-744Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3860` tests).
  Earlier route-pass broad gates passed or warned as expected:
  `npm run check:projekt-143-cycle3-kickoff` WARN at
  `artifacts/perf/2026-05-04T13-11-32-562Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T13-11-45-723Z/projekt-143-evidence-suite/suite-summary.json`,
  and `npm run validate:fast` PASS (`251` files, `3860` tests). Fixed-wing
  browser probe validation is incomplete: `npm run probe:fixed-wing` first hit
  sandbox `spawn EPERM`, then the approved rerun produced only partial A-1
  success in `artifacts/fixed-wing-runtime-probe/summary.json` before timing
  out; no full fixed-wing pass is claimed.
- 2026-05-04 local terrain/culling/camera follow-up gates:
  focused Vitest passed (`5` files, `142` tests) for terrain material,
  vegetation scatterer, player movement, player respawn, and world feature
  visibility; `npm run build:perf` PASS; `npm run
  check:projekt-143-terrain-distribution` WARN only for the expected AI
  Sandbox fixed fallback seed at
  `artifacts/perf/2026-05-04T21-42-10-596Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  `npm run check:projekt-143-culling-proof` PASS at
  `artifacts/perf/2026-05-04T21-42-38-633Z/projekt-143-culling-proof/summary.json`;
  `npm run check:projekt-143-culling-baseline` PASS at
  `artifacts/perf/2026-05-04T21-42-16-288Z/projekt-143-culling-owner-baseline/summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T21-42-43-709Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T21-42-43-062Z/projekt-143-evidence-suite/suite-summary.json`;
  and `npm run validate:fast` PASS (`251` files, `3866` tests). The Open
  Frontier diagnostic capture for this pass remains non-acceptance because it
  failed harness combat behavior and local asset baking could skew perf.
- 2026-05-05/06 vegetation/culling local follow-up: the fresh grounding audit
  passed at
  `artifacts/perf/2026-05-06T04-09-22-289Z/vegetation-grounding-audit/summary.json`
  with all six active runtime vegetation species covered and `0` flagged
  species, confirming no other active species retains the severe half-buried
  banana-plant profile. KB-CULL sector batching is now filed as useful partial
  evidence, not closeout: `npm run check:projekt-143-culling-baseline` passed
  at
  `artifacts/perf/2026-05-05T21-19-08-037Z/projekt-143-culling-owner-baseline/summary.json`,
  `npm run check:projekt-143-cycle3-kickoff` WARNs at
  `artifacts/perf/2026-05-05T21-19-35-304Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and `npm run check:projekt-143-completion-audit` reports `NOT_COMPLETE` at
  `artifacts/perf/2026-05-05T21-19-33-370Z/projekt-143-completion-audit/completion-audit.json`.
  Remaining broad blockers after the later KB-OPTIK owner acceptance are:
  KB-LOAD texture policy, KB-TERRAIN A Shau/ground-cover/far-horizon
  acceptance, KB-CULL broad HLOD/culling, and release parity.
- 2026-05-03: `npm run check:projekt-143-optik-decision` refreshed the
  decision packet at
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`.
  It now records current NPC target `2.95m`, imposter visible-height ratio
  average `0.879`, imposter luma delta percent average `-0.073`, and aircraft
  longest-axis/current-NPC average `4.52x`. It records near-stress expanded
  proof WARN with `10` flagged samples and runtime LOD-edge proof PASS with
  `0` flagged samples. The first absolute-target, crop, and selected/expanded
  luma decisions are complete for this remediation; the recommended next
  branch is
  `document-near-stress-silhouette-exception-or-switch-bureau`.
  Aircraft resizing remains rejected as the next response unless a separate
  vehicle-scale proof and playtest scope are opened.

### Cycle 4 - Strategic Spike Only

Scope:

- If WebGL remains the blocker after Cycles 1-3, run one contained WebGPU/TSL
  spike against a single isolated renderer path.
- Candidate paths: far-canopy cards, terrain tile selection, or NPC imposters.

Dependencies:

- WebGL remediations must be measured first.
- A browser-support and fallback policy must be written before migration work.

Acceptance:

- Spike compares WebGL and WebGPU versions of the same isolated path with
  frame-time, GPU-time where available, memory, visual, and browser-support
  evidence.
- No production migration starts unless the spike shows a material benefit
  that survives fallback and porting cost.

Point Of No Return:

- Full WebGPU migration is a point of no return. It requires explicit approval
  after a contained spike, not during stabilization.

## Minimum Viable Stabilization Subset

Current draft after initial bureau briefs:

1. Make perf captures self-certify measurement trust.
2. Add or formalize short benchmark captures that isolate harness overhead,
   mode startup, combat load, and renderer-only load.
3. Attribute renderer/runtime cost by subsystem and asset class.
4. Re-run `combat120` and Open Frontier startup on a fresh build with certified
   telemetry, using the 2026-05-02 retail startup split as the first KB-LOAD
   comparison point rather than a root-cause conclusion.
5. Rerun the elevated Open Frontier and A Shau vegetation-horizon baseline
   before any far-canopy after comparison; the first fresh-build baseline is
   filed at
   `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`.
6. Keep WebGPU migration out of the minimum stabilization subset; strategy
   evidence recommends reinforcing WebGL until the measured blockers are fixed.
7. Only then start remediation in KB-LOAD, KB-CULL, KB-OPTIK, and
   KB-TERRAIN. KB-EFFECTS low-load is evidence-complete; reopen it only for
   combat120/stress evidence or visual changes.
