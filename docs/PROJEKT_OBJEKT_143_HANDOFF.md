# Projekt Objekt-143 Handoff

Last updated: 2026-05-07

Use this as the first-read handoff for a fresh agent session continuing
Projekt Objekt-143. `docs/PROJEKT_OBJEKT_143.md` remains the authoritative
ledger; this file is the short operational prompt.

## Current Local State

- Repo: `C:\Users\Mattm\X\games-3d\terror-in-the-jungle`
- Branch: `master`
- Stabilization Closeout Target: owner direction changed on 2026-05-07. Do not
  continue trying to force every KB-LOAD, KB-TERRAIN, and KB-CULL branch to
  final `evidence_complete` before release. The target is to stabilize the
  current local stack, preserve the useful fixes and evidence, fold unresolved
  findings into roadmap/backlog/handoff docs, then commit, push to `master`,
  deploy, and verify live production parity. A later Projekt revamp can reopen
  water naturalism, vegetation ecology, Pixel Forge candidate imports, broad
  HLOD/culling, future driving surfaces, and combined-arms feel from the
  captured evidence.
- Current release state: the stabilization stack is intended to be clean on
  local `master`, pushed to `origin/master`, GitHub-CI verified, manually
  deployed to Cloudflare Pages, and live-verified through
  `npm run check:projekt-143-live-release-proof`. Treat live
  `/asset-manifest.json` as the exact deployed SHA source of truth.
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
  `artifacts/perf/2026-05-07T00-26-45-885Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
- Completion audit:
  `artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json`
- Static Projekt suite:
  `artifacts/perf/2026-05-06T05-53-35-745Z/projekt-143-evidence-suite/suite-summary.json`
- KB-STRATEGIE near-metal platform audit:
  `artifacts/perf/2026-05-06T05-53-35-718Z/webgpu-strategy-audit/strategy-audit.json`
- KB-STRATEGIE guarded platform capability probe:
  `artifacts/perf/2026-05-06T06-03-26-013Z/projekt-143-platform-capability-probe/summary.json`
  (WARN/headless inventory: SwiftShader WebGL2, no WebGL2 disjoint timer query,
  no WebGPU adapter, isolated SharedArrayBuffer and OffscreenCanvas WebGL2 pass,
  live/local COOP/COEP headers pass; not migration approval)
- KB-LOAD fresh sequential startup baselines:
  `artifacts/perf/2026-05-05T04-24-07-730Z/startup-ui-open-frontier/summary.json`
  and
  `artifacts/perf/2026-05-05T04-25-31-931Z/startup-ui-zone-control/summary.json`
- KB-LOAD vegetation-normal candidate proof:
  `artifacts/perf/2026-05-05T05-31-24-775Z/startup-ui-open-frontier-vegetation-normals-disabled/summary.json`
  and
  `artifacts/perf/2026-05-05T05-28-07-843Z/startup-ui-zone-control-vegetation-normals-disabled/summary.json`
- KB-LOAD/OPTIK vegetation-normal visual proof:
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/summary.json`
  and
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/contact-sheet.png`
- KB-LOAD selected next branch:
  `artifacts/perf/2026-05-07T00-26-06-920Z/projekt-143-load-branch-selector/load-branch-selector.json`
- KB-LOAD Pixel Forge vegetation readiness:
  `artifacts/perf/2026-05-06T04-17-34-839Z/projekt-143-pixel-forge-vegetation-readiness/vegetation-readiness.json`
- KB-LOAD Pixel Forge vegetation candidate proof:
  `artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/summary.json`
  and
  `artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/candidate-contact-sheet.png`
- KB-LOAD Pixel Forge vegetation candidate import plan:
  `artifacts/perf/2026-05-06T21-41-01-701Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`
  (PASS, `dry_run_ready`, `4/4` selected replacements ready; the banana
  cyan-stem guard is clear with `0` strong cyan-blue opaque pixels)
- KB-LOAD proof-only vegetation candidate startup pair:
  `artifacts/perf/2026-05-07T00-21-34-591Z/startup-ui-open-frontier-vegetation-candidates/summary.json`
  and
  `artifacts/perf/2026-05-07T00-22-34-000Z/startup-ui-zone-control-vegetation-candidates/summary.json`
  (served `12` candidate color/normal/meta substitutions without importing;
  Open Frontier mode-click delta `-2337.333ms`, Zone Control mode-click delta
  `-2530.666ms`)
- KB-LOAD lazy NPC imposter bucket branch:
  `artifacts/perf/2026-05-05T16-36-44-588Z/startup-ui-open-frontier/summary.json`
  and
  `artifacts/perf/2026-05-05T16-39-16-223Z/startup-ui-zone-control/summary.json`
- KB-OPTIK decision packet:
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`
- KB-OPTIK accepted runtime-equivalent human review:
  `artifacts/perf/2026-05-05T23-13-35-420Z/projekt-143-optik-human-review/review-summary.json`
- KB-TERRAIN before baseline:
  `artifacts/perf/2026-05-04T11-26-11-588Z/projekt-143-terrain-horizon-baseline/summary.json`
- KB-TERRAIN material distribution audit:
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
- KB-TERRAIN runtime hydrology distribution:
  `artifacts/perf/2026-05-06T17-00-32-427Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  (runtime hydrology classifier applied; A Shau uniformity cleared by the dry
  lowland `tallGrass` band; audit WARN is only the AI Sandbox random-seed
  fallback note)
- KB-TERRAIN reusable hydrology track:
  `docs/PROJEKT_OBJEKT_143_HYDROLOGY.md`
  and
  `artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
  with `src/systems/terrain/hydrology/HydrologyCorridor.ts` recorded as a pure
  world-space corridor sampler for future bank/trail/water-mesh branches
  with review masks
  `artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-mask.png`
  and
  `artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-mask.png`
- KB-TERRAIN water-system static contract audit:
  `artifacts/perf/2026-05-06T23-23-35-936Z/projekt-143-water-system-audit/water-system-audit.json`
  (WARN by design; the audit now sees the provisional hydrology river-strip
  consumer, feathered low-strength terrain material mask, and global
  water-plane fallback, but stream visuals still need human acceptance)
- KB-TERRAIN water runtime proof:
  `artifacts/perf/2026-05-06T23-26-44-103Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
  with screenshots
  `artifacts/perf/2026-05-06T23-26-44-103Z/projekt-143-water-runtime-proof/open_frontier-river-proof.png`
  and
  `artifacts/perf/2026-05-06T23-26-44-103Z/projekt-143-water-runtime-proof/a_shau_valley-river-proof.png`
  (PASS for runtime mesh presence: Open Frontier `12` channels / `592`
  segments with global water enabled; A Shau `12` channels / `552` segments
  with global water disabled. The proof now blocks service workers and focuses
  the camera on a channel centerline instead of the full 21km drainage bbox.
  Still not final stream art acceptance.)
- KB-TERRAIN current elevated horizon baseline:
  `artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`
  (PASS for four Open Frontier/A Shau elevated screenshots with renderer,
  terrain, vegetation, and browser-error checks; runtime proof only, not human
  final far-horizon acceptance)
- KB-TERRAIN terrain visual-review packet:
  `artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/visual-review.json`
  and
  `artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`
  (WARN after capturing `14/14` refreshed Open Frontier/A Shau player-ground,
  route/trail, airfield-foundation, airfield-parking, support-foundation,
  river-oblique, and river-ground screenshots with zero browser/page errors.
  The new `terrain_water_exposure_review` check flags the two Open Frontier
  river shots as washed out with `0.81` / `0.8259` overexposed ratio, so
  KB-TERRAIN water naturalism remains an explicit blocker.)
- KB-TERRAIN placement/foundation audit:
  `artifacts/perf/2026-05-07T00-32-41-375Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  (PASS with `57` audited features and `fail=0` / `warn=0` across all audited
  modes/seeds; owner visual acceptance, matched perf, Pixel Forge replacement
  import, and future vehicle-driving acceptance remain open)
- KB-TERRAIN terrain asset inventory:
  `artifacts/perf/2026-05-06T13-16-02-955Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
- KB-TERRAIN / KB-FORGE Pixel Forge structure review:
  `artifacts/perf/2026-05-06T16-45-59-860Z/projekt-143-pixel-forge-structure-review/structure-review.json`
  plus contact sheet
  `artifacts/perf/2026-05-06T16-45-59-860Z/projekt-143-pixel-forge-structure-review/structure-contact-sheet.png`
  (PASS, `19/19` building review grids and `5/5` current ground-vehicle review
  grids; vehicle grids are TIJ-generated artifact grids, not Pixel Forge
  `war-assets` mutations or driving acceptance)
- KB-TERRAIN vegetation source pipeline review:
  `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md`
- KB-FORGE local Pixel Forge bureau audit:
  `artifacts/perf/2026-05-06T04-11-40-074Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json`
- KB-TERRAIN route/trail policy audit:
  `artifacts/perf/2026-05-06T17-00-32-294Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
- KB-TERRAIN Open Frontier after vegetation pass:
  `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json`
- KB-TERRAIN/Open Frontier current resource-free runtime rerun:
  `artifacts/perf/2026-05-06T04-27-07-950Z/summary.json`
  (measurement trust PASS; validation WARN on `45.40ms` p99,
  `66.23MB` heap peak growth, and shots below harness minimum; terrain-stall
  and backtracking warnings still visible)
- KB-TERRAIN/Open Frontier after NPC recovery follow-up:
  `artifacts/perf/2026-05-06T04-51-35-039Z/summary.json`
  (measurement trust PASS; validation WARN on `49.30ms` p99,
  `71.33MB` heap peak growth, and low shots; NPC recovery telemetry improved
  versus the earlier resource-free run, but active-driver route/engagement
  behavior still leaves the player in long low-combat PATROL stretches)
- KB-TERRAIN active-driver route-overlay follow-up:
  `artifacts/perf/2026-05-06T06-18-15-743Z/summary.json`
  (headless diagnostic only; validation FAIL and measurement trust FAIL, but
  it improves the specific movement failure versus
  `artifacts/perf/2026-05-06T06-04-57-681Z/summary.json`: max stuck goes from
  `176.1s` to `0s`, `blockedByTerrain` from `275` to `0`, and avg actual speed
  from `0` to `8.82m/s`; combat still fires `0` shots, so no acceptance)
- KB-TERRAIN/Open Frontier active-driver terrain/contact and combat-front proof:
  `artifacts/perf/2026-05-06T08-52-31-466Z/summary.json`
  and
  `artifacts/perf/2026-05-06T08-52-31-466Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  (headed 20s proof only; measurement trust PASS; validation WARN; active
  gates PASS with `33` shots, `19` hits, max stuck `0.5s`, and `19` movement
  transitions; `playerBlockedByTerrain=0`, `collisionHeightDeltaAtPlayer=0`,
  and `blockReason=none`; not full terrain acceptance because p99/average
  frame/hitch/heap peak remain WARN, duration is short, and A Shau is still
  open)
- KB-TERRAIN close-pressure active-driver reruns after the hold-and-shoot /
  cover-cooldown patch:
  `artifacts/perf/2026-05-06T13-45-41-194Z/summary.json`
  and
  `artifacts/perf/2026-05-06T13-45-41-194Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  (Open Frontier, OK, measurement trust PASS, validation WARN on p99 only,
  `150` shots / `17` hits, max stuck `4.3s`, `4` route-progress resets, final
  far current-target chase around `450m`) plus
  `artifacts/perf/2026-05-06T13-49-19-901Z/summary.json`
  and
  `artifacts/perf/2026-05-06T13-49-19-901Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  (A Shau, OK, measurement trust PASS, validation WARN on heap only, `49`
  shots / `6` hits, max stuck `1.5s`, final zone PATROL, `500.45m` objective
  closure). Improved liveness proof only; not final skilled-player acceptance.
- KB-TERRAIN/Open Frontier close-pressure selector and movement-clamp rerun:
  `artifacts/perf/2026-05-06T14-44-44-702Z/summary.json`
  and
  `artifacts/perf/2026-05-06T14-44-44-702Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  (Open Frontier, OK, measurement trust PASS, validation WARN on p99/heap peak
  only; `102` shots / `17` hits, `37` movement transitions, max stuck `0.3s`,
  `0` route no-progress resets, `blockReason=none`, `465.97m` player travel,
  and diagnostic PASS with only `17.9m` final objective closure while pursuing a
  nearby OPFOR inside the mode acquisition band. Stronger liveness evidence
  only; owner visual review still needs to confirm remaining close-contact
  twitch/cover behavior.)
- KB-TERRAIN/driver objective-aware target-lock rerun:
  `artifacts/perf/2026-05-06T15-09-39-654Z/summary.json` (Open Frontier,
  OK, measurement trust PASS, validation WARN only; `112` shots / `18` hits,
  `5` kills, max stuck `1.8s`, `0` route no-progress resets) and
  `artifacts/perf/2026-05-06T15-11-14-529Z/summary.json` (A Shau, OK,
  measurement trust PASS, validation WARN only; `210` shots / `30` hits,
  `7` kills, max stuck `3.3s`, `1` route no-progress reset). This covers the
  owner-observed far-target reacquire/pacing failure in the perf driver, not
  final natural NPC distribution or human skilled-player acceptance.
- KB-TERRAIN A Shau route-stall strategy/follower follow-up:
  `artifacts/perf/2026-05-06T15-32-02-870Z/summary.json` (A Shau, OK,
  measurement trust PASS, validation WARN, `223` shots / `44` hits / `10`
  kills, max stuck `1.2s`, `1` route no-progress reset, and `21`
  terrain-stall/backtracking warnings; no combatant repeats more than `3`
  warnings after the follower destination/hold fix). The scatter-only run at
  `artifacts/perf/2026-05-06T15-27-27-070Z/summary.json` is rejected as
  insufficient because it logged `44` warnings with one combatant repeating
  `19` times. The broad terrain-flow/trail-shoulder experiment at
  `artifacts/perf/2026-05-06T15-36-41-357Z/summary.json` is also rejected and
  reverted because it stayed at `22` warnings. This is improved A Shau route
  evidence, not route/nav acceptance.
- KB-TERRAIN close-pressure suppression/player-driver diagnostics:
  `artifacts/perf/2026-05-06T16-21-27-610Z`,
  `artifacts/perf/2026-05-06T16-25-07-821Z`, and
  `artifacts/perf/2026-05-06T16-27-52-490Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  The first capture reproduced the close occluded-target stop (`ADVANCE`,
  requested speed `0`, max stuck `6.2s`); the second showed movement recovery
  but misleading stuck telemetry during intentional firing holds; the final
  60-NPC diagnostic has behavior gates healthy (`63` shots / `7` hits / `3`
  kills, max stuck `0.2s`, `125.99m` player travel, movement block reason
  `none`) but failed perf/heap validation. Use these as behavior diagnostics
  only. They do not prove natural NPC distribution, broad cover quality,
  close-pool/HLOD acceptance, or perf acceptance.
- KB-TERRAIN active-driver pure-pursuit/world-intent follow-up:
  `artifacts/perf/2026-05-06T18-24-22-092Z/summary.json` and
  `artifacts/perf/2026-05-06T18-24-22-092Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  The retained code projects the player onto the current route before choosing
  a lookahead point, applies world-space movement intent in the injected driver,
  and tightens the combat hold band to keep closing without driving into the
  noisy point-blank cluster. The run is OK with measurement trust PASS and
  validation WARN: `82` shots / `16` hits / `4` kills, max stuck `0.5s`, `64`
  movement transitions, `148` waypoints followed, `2` route no-progress resets,
  average frame `9.31ms`, p99 `35.80ms`, and heap peak growth `39.38MB`. The
  diagnostic is WARN because objective closure is only `15.2m` and the movement
  track still records `22` heading reversals over `120` degrees, all short-hop
  pacing reversals. This is the current best local balance, not
  skilled-player acceptance. Do not revive the rejected blunt route-endpoint
  snap/deadband experiment without a more precise visible-target exception.
  Owner-observed NPC speed spikes still need a formal telemetry sanity gate:
  ignore initial harness relocation/compression samples, then flag non-initial
  terrain backtracking/recovery segments that exceed the accepted infantry run
  envelope.
- Rejected active-driver handoff/near-route fallback experiment:
  `artifacts/perf/2026-05-06T18-44-37-468Z/summary.json` and
  `artifacts/perf/2026-05-06T18-44-37-468Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Keeping movement through the ENGAGE-to-ADVANCE handoff and falling back from
  exhausted near route points to the far aim anchor improved shots but worsened
  the pacing metric to `46` heading reversals over `120` degrees (`45`
  short-hop reversals) and failed validation. That code was reverted; do not
  reapply this broad fallback without a narrower close-target/route-ownership
  proof.
- Retained active-driver route micro-target fix:
  `artifacts/perf/2026-05-06T18-57-51-385Z/summary.json`,
  `artifacts/perf/2026-05-06T18-57-51-385Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`,
  `artifacts/perf/2026-05-06T19-02-39-418Z/summary.json`, and
  `artifacts/perf/2026-05-06T19-02-39-418Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  New movement-artifact buckets showed the no-behavior-change baseline at
  `artifacts/perf/2026-05-06T18-52-22-338Z/summary.json` was driver-commanded
  route churn (`65` requested-move pacing flips, `0` terrain-blocked flips).
  The retained code invalidates a stale route when pure-pursuit returns a tiny
  overlay point while the real anchor is still far away. The 90s proof improves
  to `126` shots / `18` hits / `4` kills, `98.68m` objective closure, and only
  `8` short-hop pacing reversals. The 180s proof keeps movement healthy with
  `1262.93m` player travel, `176.78m` objective closure, and `0`
  terrain-blocked flips, but is combat-light (`36` shots / `6` hits / `1`
  kill) while routing toward zones after first contact. Treat this as a fixed
  route micro-target pacing mechanism, not skilled-player acceptance.
- Retained active-driver zone-gate/anchor-continuation and NPC speed-clock fix:
  `artifacts/perf/2026-05-06T20-14-36-990Z/summary.json`,
  `artifacts/perf/2026-05-06T20-14-36-990Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`,
  and paired NPC speed diagnostic under the same artifact root. The retained
  code prevents zone objectives from reacquiring ungated far enemies in
  ALERT/ADVANCE, lets aggressive large-map profiles route toward combat fronts,
  continues after route exhaustion through remembered route direction or direct
  anchor movement, and stamps high-LOD combatant movement clocks so medium-LOD
  catch-up cannot manufacture overspeed spikes. Current proof is OK with
  measurement trust PASS and validation WARN only on p99/heap: `150` shots /
  `18` hits / `6` kills, max stuck `0.3s`, `480.99m` player travel, final
  objective distance `129.89m`, objective closure `24.25m`, `1` route
  no-progress reset, no diagnostic heading/pacing findings, and NPC speed
  diagnostic PASS with max non-initial speed `6.1m/s`. Rejected intermediate
  diagnostics are `19-56-06-419Z` (zone loop, `96` heading reversals),
  `20-05-44-589Z` (route-exhaustion zero movement), and `20-10-49-441Z`
  (movement restored but validation failed and `49` heading/pacing reversals).
  Treat this as the current retained active-driver/speed baseline, not
  skilled-player acceptance; objective closure and route/objective quality still
  need longer proof.
- A Shau retained-bot/speed proof after the same fix:
  `artifacts/perf/2026-05-06T20-23-31-045Z/summary.json`,
  `artifacts/perf/2026-05-06T20-23-31-045Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`,
  and
  `artifacts/perf/2026-05-06T20-23-31-045Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`.
  Measurement trust PASS, validation WARN only on heap peak growth, `389`
  shots / `98` hits / `23` kills, max stuck `0.3s`, `454.31m` player travel,
  `22` movement transitions, `0` route no-progress resets, no diagnostic
  heading/pacing findings, and NPC speed PASS with max non-initial speed
  `4.5m/s`. The active-driver diagnostic remains WARN because objective
  closure is `0.0m` by the final-sample metric; treat this as trusted A Shau
  liveness/pacing evidence, not human skilled-player or objective-flow
  acceptance.
- Revised stabilization closeout audit:
  `artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json`.
  It still reports `NOT_COMPLETE`, but under the revised owner objective all
  bureau/roadmap-capture items pass as current evidence or explicit deferral.
  The remaining blocker is `validation-and-release`: the working tree is still
  dirty, unpushed, undeployed, and not live-verified.
- Close-pressure combat movement follow-up after the owner-observed hesitant
  start-cluster fighting:
  `artifacts/perf/2026-05-06T20-55-52-422Z/summary.json`,
  `artifacts/perf/2026-05-06T20-55-52-422Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`,
  and
  `artifacts/perf/2026-05-06T20-55-52-422Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`.
  The retained code limits generic ENGAGING backpedal to point-blank
  near-collision range and adds a real RETREATING movement branch toward the
  fallback destination instead of preserving stale combat velocity. Runtime
  proof has measurement trust PASS, capture OK, validation WARN on p99, `149`
  shots / `12` hits / `4` kills, max stuck `0.3s`, `499.86m` player travel,
  and NPC speed PASS with max non-initial `6.08m/s`. Manual movement-artifact
  comparison against `20-14-36-990Z` improves tracked-NPC worst path/net ratio
  `12.2x -> 2.2x`, worst reversals `15 -> 4`, backtrack hotspots `33 -> 9`,
  and pinned events `56 -> 35`, but contour activations increase and the
  active-driver diagnostic remains WARN on final objective progress and route
  recovery. Treat this as retained NPC loop/close-pressure evidence, not as
  final objective-flow, route quality, or skilled-player acceptance.
- Latest matched Open Frontier/A Shau perf pair after the KB-LOAD candidate and
  KB-CULL evidence refresh:
  `artifacts/perf/2026-05-06T21-54-56-334Z/summary.json`,
  `artifacts/perf/2026-05-06T21-54-56-334Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`,
  `artifacts/perf/2026-05-06T21-54-56-334Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`,
  `artifacts/perf/2026-05-06T21-58-44-146Z/summary.json`,
  `artifacts/perf/2026-05-06T21-58-44-146Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`,
  and
  `artifacts/perf/2026-05-06T21-58-44-146Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`.
  Both captures have measurement trust PASS. Open Frontier is validation WARN
  on peak p99 `34.00ms` and heap peak growth `57.77MB`, with `159` shots /
  `15` hits / `4` kills and NPC-speed PASS with max non-initial `6.11m/s`.
  A Shau is validation PASS with peak p99 `11.70ms`, peak max frame `27.40ms`,
  `639` shots / `86` hits / `25` kills, and NPC-speed PASS with max
  non-initial `4.5m/s`. Both active-driver diagnostics remain WARN on route
  objective-progress resets and short-hop heading reversals (`61` Open
  Frontier, `33` A Shau), so this is trusted liveness/perf evidence, not final
  terrain-route, skilled-player, objective-flow, or human visual acceptance.
- KB-TERRAIN active-driver route-overlay/direct-combat fallback slice:
  `artifacts/perf/2026-05-06T22-34-05-681Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  and
  `artifacts/perf/2026-05-06T22-44-28-979Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`.
  Retained code skips route-overlay steering while the perf player is visibly
  firing and closing, and turns current combat-target navmesh snap failure into
  `direct_combat_fallback` telemetry. Open Frontier still WARNs on `9` route
  no-progress resets and `45` short-hop pacing reversals, but this improves the
  prior `161` reversal signal. A Shau is validation PASS / measurement trust
  PASS with `333` shots / `46` hits / `14` kills, `0` waypoint replan failures,
  objective closure `295.15m`, and `9` heading reversals, but remains WARN on
  `8` route no-progress resets. Rejected artifact
  `artifacts/perf/2026-05-06T22-39-50-930Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  proves the closer-target-lock override should stay reverted because it
  worsened Open Frontier pacing to `125` heading reversals and `11` route
  resets.
- Owner water/combined-arms note:
  current water is not human-accepted because it does not look natural, even
  though hydrology/river runtime mesh proof exists. Treat this as a KB-TERRAIN
  hydrology/river/lake art blocker. Also treat NPC muddling as a combined-arms
  objective-flow blocker: forces need visible objectives, support activity,
  movement pressure, and battlefield life instead of local crowd churn.
- Local water naturalism mitigation:
  `src/systems/environment/WaterSystem.ts` now uses lower-distortion/darker
  global water, narrower darker RGBA hydrology ribbons, and bank-to-channel
  vertex alpha instead of a flat emissive teal strip. `src/systems/terrain/*`
  now feathers the hydrology material mask, uses linear filtering, and makes
  hydrology terrain material contribution proportional and very low-strength so
  it does not dominate as blocky terrain paint. This is a mitigation, not
  acceptance: the latest close A Shau proof still needs human review before
  KB-TERRAIN water can close.
- Local combined-arms liveness mitigation:
  `src/systems/strategy/StrategicDirector.ts` now issues orders to the active
  factions actually present in the war state instead of hardcoding only US/NVA,
  and it evaluates defend/retreat/reinforcement zones by alliance ownership.
  This prevents ARVN/VC squads from skipping allied objectives or retreating
  toward the nearest enemy home base. Focused strategy/combat tests pass, but
  battlefield-life acceptance still needs a browser proof/playtest with visible
  objective pressure, support movement, and reduced local crowd churn.
- Latest local Open Frontier liveness proof after that mitigation:
  `artifacts/perf/2026-05-06T23-55-53-018Z/summary.json` is a headed 20s
  capture with measurement trust PASS and validation WARN only on peak p99/heap
  peak growth. The paired active-driver diagnostic at
  `artifacts/perf/2026-05-06T23-55-53-018Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  is PASS with `50` shots, `7` hits, `1` kill, max stuck `0.3s`, and `17`
  movement transitions. This confirms the active player harness can fight on
  the current build, but the same capture still logs NPC terrain-stall/
  backtracking warnings and shows a heavy `npc_contour` hotspot near
  `(-12, -1356)`, so NPC terrain-route/battlefield-flow acceptance remains
  open.
- Local NPC terrain-route mitigation after that proof:
  `src/systems/combat/CombatantMovement.ts` now skips a terrain-blocked
  intermediate navmesh waypoint when a later waypoint on the same planned route
  is immediately walkable. The post-patch headed Open Frontier proof at
  `artifacts/perf/2026-05-07T00-05-21-283Z/summary.json` has measurement trust
  PASS and validation WARN only on peak p99. Its active-driver diagnostic at
  `artifacts/perf/2026-05-07T00-05-21-283Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  is WARN only for `1` route objective-progress reset, with `34` shots, `6`
  hits, `2` kills, max stuck `0.0s`, objective closure `34.51m`, `198.80m`
  player travel, and no heading/pacing flips. NPC speed diagnostic PASSes at
  `artifacts/perf/2026-05-07T00-05-21-283Z/projekt-143-npc-speed-diagnostic/npc-speed-diagnostic.json`.
  Movement artifacts improved versus `23-55-53-018Z`: `npc_contour` total
  `5355 -> 473`, `npc_backtrack` `11 -> 0`, pinned events `17 -> 5`, and max
  pinned time `13.35s -> 6.67s`. Do not treat this as final combined-arms feel
  acceptance: the final screenshot still shows steep hillside combat and a
  cliff-edge structure placement issue, so broad terrain placement/routing and
  battlefield-life acceptance remain open.
- KB-TERRAIN default hydrology-backed vegetation/material-mask startup/liveness proofs:
  `artifacts/perf/2026-05-06T09-51-26-258Z/summary.json`
  (Open Frontier, headed 20s, validation WARN, measurement trust PASS, no
  browser errors, p99 `39.40ms`, heap peak growth PASS `24.92MB`, `26` shots /
  `9` hits) and
  `artifacts/perf/2026-05-06T09-52-17-998Z/summary.json`
  (A Shau, headed 20s, validation WARN, measurement trust PASS, no browser
  errors, p99 `26.60ms`, heap peak growth `72.73MB`, `73` shots / `40`
  hits, diagnostic PASS at
  `artifacts/perf/2026-05-06T09-52-17-998Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`).
  These prove startup/liveness for the default hydrology classifier/material
  mask path only. A later local slice wires provisional hydrology river strips,
  but water rendering acceptance and human visual acceptance remain open until
  matched browser proof exists.
- Rejected Open Frontier frontline-compression experiment:
  `artifacts/perf/2026-05-06T04-58-04-461Z/summary.json`
  (measurement trust PASS but validation FAIL with p99 `100ms`, `2.00%` frames
  over `50ms`, and only `12` shots; code was reverted, keep as diagnostic only)
- KB-TERRAIN A Shau after placement pass:
  `artifacts/perf/2026-05-04T04-14-35-401Z/summary.json`
- KB-TERRAIN A Shau after route-stamping pass:
  `artifacts/perf/2026-05-04T13-03-02-238Z/summary.json`
  (measurement trust PASS; validation FAIL on heap end-growth/recovery)
- KB-TERRAIN A Shau current rerun:
  `artifacts/perf/2026-05-06T04-30-51-979Z/summary.json`
  (measurement trust PASS; validation WARN on `33.40ms` p99,
  `87.77MB` heap peak growth, and shots below harness minimum; A Shau startup
  is still long and NPC terrain-stall backtracking is still visible)
- KB-TERRAIN A Shau after NPC recovery follow-up:
  `artifacts/perf/2026-05-06T04-46-26-097Z/summary.json`
  (measurement trust PASS; validation WARN on `45.70ms` p99 and `47.81MB` heap
  peak growth; shot gate is now healthy at `240` validation player shots /
  `170` hits and `118` harness-driver shots / `44` kills, but repeated terrain
  backtracking remains)
- KB-TERRAIN local mossy cliff/material follow-up:
  `artifacts/perf/2026-05-06T04-13-18-235Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
- Local Open Frontier visibility/vegetation diagnostic:
  `artifacts/perf/2026-05-04T21-24-46-901Z/summary.json`
  (measurement trust PASS but validation FAIL on harness combat behavior; also
  noisy because local asset baking was running)
- Active-player hit-contract evidence after shorter-NPC aim investigation:
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json`
  (`120` shots / `43` hits; frame-time metrics are not clean acceptance
  because another browser game was running on and off during the capture)
- KB-CULL owner baseline:
  `artifacts/perf/2026-05-06T22-22-09-798Z/projekt-143-culling-owner-baseline/summary.json`
- KB-CULL fresh deterministic culling proof:
  `artifacts/perf/2026-05-06T22-12-58-306Z/projekt-143-culling-proof/summary.json`
- KB-CULL static-feature batching evidence:
  `artifacts/perf/2026-05-04T14-08-33-257Z/projekt-143-culling-proof/summary.json`,
  `artifacts/perf/2026-05-04T14-13-30-766Z/summary.json`, and
  `artifacts/perf/2026-05-04T14-17-44-361Z/summary.json`
  (static-feature draw-call reduction only; no broad Open Frontier perf win or
  A Shau acceptance)
- KB-CULL air-vehicle frustum render-cull / visible-owner after slice:
  `artifacts/perf/2026-05-06T22-13-31-657Z/summary.json`,
  `artifacts/perf/2026-05-06T22-17-13-350Z/summary.json`,
  `artifacts/perf/2026-05-06T22-22-09-798Z/projekt-143-culling-owner-baseline/summary.json`,
  and kickoff
  `artifacts/perf/2026-05-07T00-26-45-885Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  (selected world-static/visible-helicopter owner path is scoped
  `evidence_complete`: Open Frontier owner visible draw-call-like is `117`,
  A Shau owner visible draw-call-like is `52`, visible-unattributed triangles
  stay below `10%`, and deterministic proof remains PASS. This is still not
  broad HLOD, parked-aircraft playtest, future vehicle-driving, static-cluster,
  or vegetation-distance acceptance.)
- KB-CULL vehicle interaction safety slice:
  `src/systems/helicopter/HelicopterInteraction.ts`,
  `src/systems/helicopter/HelicopterInteraction.test.ts`,
  `src/systems/vehicle/FixedWingInteraction.test.ts`, and
  `src/systems/vehicle/AirVehicleVisibility.test.ts`
  (`16` targeted tests pass; helicopter entry is suppressed while already in
  fixed-wing flight, and render-culled helicopters/fixed-wing aircraft remain
  enterable on foot. This is unit-level safety evidence only, not broad HLOD,
  parked-aircraft playtest, matched perf, or future ground-vehicle driving
  acceptance.)
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
  paired proof. Fresh sequential startup baselines after the short-palm
  retirement and upload-summary patch record Open Frontier `5198ms`
  mode-click-to-playable, `4466.333ms` deploy-click-to-playable, `845.733ms`
  WebGL upload total, `30.967ms` average max upload, and `541.333` upload
  calls; Zone Control records `5417ms` mode-click-to-playable, `4887ms`
  deploy-click-to-playable, `841.6ms` WebGL upload total, `39.067ms` average
  max upload, and `590` upload calls. The kickoff now carries non-null
  `largestUploads`: Open Frontier is led by
  `npcs/usArmy/idle/animated-albedo-packed.png`, `bambooGrove` imposter, and
  `fanPalm` imposter; Zone Control is led by `bananaPlant`, `bambooGrove`, and
  `fanPalm` imposters. The selected next KB-LOAD proof branch is now
  `vegetation-atlas-regeneration-retain-normals` from
  `artifacts/perf/2026-05-07T00-26-06-920Z/projekt-143-load-branch-selector/load-branch-selector.json`:
  regenerate active Pixel Forge vegetation color/normal atlas pairs to the
  texture-audit candidate dimensions, preserve normal maps, and avoid reopening
  NPC atlas regeneration while KB-OPTIK is owner-accepted. The Pixel Forge
  readiness audit at
  `artifacts/perf/2026-05-06T04-17-34-839Z/projekt-143-pixel-forge-vegetation-readiness/vegetation-readiness.json`
  records `ready_for_candidate_generation`: the selected source variants and
  normal-lit pairs are present, the target is `1024x1024` / `256px` tiles,
  normal pairs remain retained, and Pixel Forge exposes a review-only
  `kb-load-vegetation-256` profile plus selected-species validator that writes
  under `packages/server/output/tij-candidates/kb-load-vegetation-256`.
  Candidate generation and selected-species validation have now run in Pixel
  Forge, and the TIJ static candidate proof at
  `artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/summary.json`
  passes with `4/4` selected color/normal/meta pairs complete, max opaque luma
  delta `1.53%`, and contact sheet
  `artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/candidate-contact-sheet.png`.
  The refreshed TIJ import-plan guard at
  `artifacts/perf/2026-05-06T21-41-01-701Z/projekt-143-vegetation-candidate-import-plan/import-plan.json`
  passes with `importState=dry_run_ready`: `4/4` selected replacement sets map
  to runtime paths, and the generated
  `bananaPlant/banana-tree-sean-tarrant` candidate now contains `0` strong
  cyan-blue opaque stem pixels. It copied nothing and still requires owner
  acceptance plus runtime startup/visual proof before import.
  A newer proof-only candidate substitution path now exists in
  `scripts/perf-startup-ui.ts`: `--use-vegetation-candidates` serves the
  Pixel Forge 256px candidate color/normal/meta files for runtime vegetation
  URLs without copying assets. Current-before startup tables are
  `artifacts/perf/2026-05-07T00-17-33-822Z/startup-ui-open-frontier/summary.json`
  and
  `artifacts/perf/2026-05-07T00-18-29-720Z/startup-ui-zone-control/summary.json`;
  proof-only after tables are
  `artifacts/perf/2026-05-07T00-21-34-591Z/startup-ui-open-frontier-vegetation-candidates/summary.json`
  and
  `artifacts/perf/2026-05-07T00-22-34-000Z/startup-ui-zone-control-vegetation-candidates/summary.json`.
  The refreshed selector is
  `artifacts/perf/2026-05-07T00-26-06-920Z/projekt-143-load-branch-selector/load-branch-selector.json`
  with status `candidate_startup_proof_ready`: Open Frontier mode-click delta
  `-2337.333ms`, Zone Control mode-click delta `-2530.666ms`, Open Frontier
  upload-total delta `-153.067ms`, and Zone upload-total delta `-141.5ms`.
  This advances KB-LOAD evidence but still does not import assets or replace
  owner visual acceptance and in-game proof.
  This is not runtime import approval; owner visual acceptance, long tasks, and
  multi-second playable latency remain open. A proof-only startup option
  now exists through
  `npx tsx scripts/perf-startup-ui.ts --mode <mode> --disable-vegetation-normals`.
  It injects `window.__KB_LOAD_DISABLE_VEGETATION_NORMALS__ = true`, writes
  `candidateFlags.disableVegetationNormals=true`, skips vegetation normal-map
  binding, and stores artifacts under
  `startup-ui-<mode>-vegetation-normals-disabled/` so default baselines and
  kickoff selection stay separate. Current candidate evidence: Open Frontier
  `artifacts/perf/2026-05-05T05-31-24-775Z/startup-ui-open-frontier-vegetation-normals-disabled/summary.json`
  averaged `4420ms` mode-click-to-playable and `3741.333ms`
  deploy-click-to-playable, but upload attribution is noisy due to a large
  `(inline-or-unknown)` upload (`1736.4ms` max). Zone Control
  `artifacts/perf/2026-05-05T05-28-07-843Z/startup-ui-zone-control-vegetation-normals-disabled/summary.json`
  is cleaner at `3203.667ms` mode-click-to-playable, `2631.667ms`
  deploy-click-to-playable, `767.467ms` WebGL upload total, and `492.667`
  upload calls. This is not approval to remove vegetation normal maps from the
  default runtime or Pixel Forge bake. Default policy remains normal maps, and
  the no-normal candidate is rejected for current default policy while the
  latest visual proof remains WARN.
  The visual companion command
  `npm run check:projekt-143-vegetation-normal-proof` is now available. Latest
  artifact
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/summary.json`
  captured `8/8` screenshots, `4/4` A/B pairs, renderer stats, vegetation
  counters, and no browser/page/request failures. Contact sheet:
  `artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/contact-sheet.png`.
  The refreshed visual deltas exceed the review band, so status remains WARN;
  do not remove vegetation normal maps from runtime or Pixel Forge bake policy
  unless a future PASS or owner-accepted contact sheet replaces this evidence.
  The current local branch also adds lazy Pixel Forge NPC imposter buckets:
  startup now eagerly creates only `idle` and `patrol_walk` buckets, with other
  faction/clip buckets created on first visible far-NPC use. Accepted evidence:
  Open Frontier
  `artifacts/perf/2026-05-05T16-36-44-588Z/startup-ui-open-frontier/summary.json`
  averaged `4526.7ms` mode-click-to-playable, `3867.7ms`
  deploy-click-to-playable, `437.6ms` WebGL upload total, and `459.33` upload
  calls; Zone Control
  `artifacts/perf/2026-05-05T16-39-16-223Z/startup-ui-zone-control/summary.json`
  averaged `2994.3ms` mode-click-to-playable, `2458.7ms`
  deploy-click-to-playable, `415ms` WebGL upload total, and `321.33` upload
  calls. The no-eager NPC variant was rejected from
  `artifacts/perf/2026-05-05T16-33-44-776Z/startup-ui-open-frontier/summary.json`
  and
  `artifacts/perf/2026-05-05T16-34-47-581Z/startup-ui-zone-control/summary.json`
  because Zone deploy-click-to-playable regressed versus the idle/patrol-eager
  branch. Treat this as a narrow KB-LOAD startup/upload win only; it does not
  close progressive readiness, visual review, release, or Projekt completion.
  The follow-up KB-LOAD branch also defers Pixel Forge close-GLB NPC pools
  until after live entry, leaves close NPCs visible as imposters while the
  close pool is pending, moves deferred warmups until after the first
  post-reveal frame/timeout, and changes `perf-startup-ui` playable polling so
  DOM readiness is not gated by `requestAnimationFrame`. Clean accepted
  evidence: Open Frontier
  `artifacts/perf/2026-05-05T18-49-03-248Z/startup-ui-open-frontier/summary.json`
  averaged `4324.3ms` mode-click-to-playable, `3622ms`
  deploy-click-to-playable, `417.367ms` WebGL upload total, and `149` upload
  calls; Zone Control
  `artifacts/perf/2026-05-05T18-47-51-310Z/startup-ui-zone-control/summary.json`
  averaged `2774.3ms` mode-click-to-playable, `2138.7ms`
  deploy-click-to-playable, `415.1ms` WebGL upload total, and `116` upload
  calls. Treat this as another scoped KB-LOAD readiness/upload improvement,
  not full texture policy, visual review, production parity, or Projekt
  completion.
- KB-FORGE `local-pixel-forge-asset-pipeline`: local liaison bureau.
  Pixel Forge is our sibling repo at
  `C:\Users\Mattm\X\games-3d\pixel-forge`, not a third-party asset source.
  Use `npm run check:projekt-143-pixel-forge` from TIJ to catalog its TIJ
  pipeline commands, review gallery, output manifest, NPC package surface, and
  vegetation package state. Latest audit is PASS for the liaison/catalog scope
  with Pixel Forge present,
  `109` manifest entries, `13` vegetation entries, all `6` current TIJ runtime
  vegetation species present, retired `giantPalm` still present in the Pixel
  Forge gallery manifest, all `6` blocked/review-only species still present,
  and the NPC review package counted as `4` factions, `8` clips, and `32`
  impostor packages. Its relevance catalog records `6` prop families, `13`
  vegetation packages, and `5` review queues: ground-cover budget replacement,
  route/trail surfaces, base/foundation kits, far-canopy/tree variety, and
  NPC/weapon packaging. Retired and blocked species are review/provenance
  records in Pixel Forge, not TIJ runtime targets. KB-FORGE should analyze
  relevance and package readiness before KB-TERRAIN or KB-OPTIK imports
  anything into runtime.
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
  clusters rather than the dominant forest layer. The current owner target also
  requires a non-uniform vegetation ecology pass: A Shau should not read as an
  evenly spaced mix of every species everywhere, so future acceptance needs
  bamboo grove/forest pockets, denser palm stands, water/lowland-edge palms or
  understory where hydrology proxies justify them, disturbed trail edges, and
  richer ground-cover transitions backed by research, deterministic cluster
  audits, screenshots, and perf captures. Also add a source-pipeline
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
  terrain-flow corridors instead of map-only route overlays. A later route
  endpoint follow-up keeps home-base exits conservative but moves non-home
  objective endpoints inside objective footprints at `0.88 * zone.radius`, so
  Hill 937 pushes stay on route stamps longer. The latest route audit passes
  with `12` A Shau routes, `52,726.6m` of route length, `1,323` route capsule
  stamps, and `14` surface patches. The earlier paired A Shau capture records
  `170` shots, `59` hits, and `57` movement transitions with measurement trust
  PASS, but validation fails on heap growth/recovery and terrain-stall warnings
  still appear. The current rerun at
  `artifacts/perf/2026-05-05T23-32-48-770Z/summary.json` improves waypoint
  replans `81 -> 40` and waypoints followed `249 -> 317` versus the previous
  current-worktree run, but remains WARN on p99/heap growth and still logs `42`
  terrain-stall warnings, so A Shau is improved but not accepted. The
  resource-free rerun at
  `artifacts/perf/2026-05-06T04-30-51-979Z/summary.json` keeps measurement
  trust PASS but remains validation WARN and still shows terrain-stall and
  backtracking noise, so it refreshes current evidence without changing the
  acceptance state. The latest accepted local route-stall follow-up tightens
  strategic spawn scatter, final objective formation offsets, and follower
  destination ownership/hold behavior. A Shau
  `artifacts/perf/2026-05-06T15-32-02-870Z/summary.json` keeps measurement
  trust PASS with validation WARN, `223` shots / `44` hits / `10` kills, max
  stuck `1.2s`, and reduces the repeated-stall shape from a scatter-only
  `44` warnings with one combatant repeating `19` times to `21` warnings with
  no combatant repeating more than `3` times. A broad terrain-flow/trail
  shoulder tweak was measured at
  `artifacts/perf/2026-05-06T15-36-41-357Z/summary.json`, did not improve the
  warning count, and was reverted. Later
  terrain/world-placement
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
- KB-OPTIK `npc-imposter-scale-luma-contract`: `evidence_complete` for the
  current packet. Runtime LOD-edge proof passes and owner accepted the
  runtime-equivalent same-scene review at
  `artifacts/perf/2026-05-05T23-13-35-420Z/projekt-143-optik-human-review/review-summary.json`
  with caution. Do not resize aircraft or retune NPC crop/brightness as a first
  response; any downward-facing or darkness polish needs a fresh proof-gated
  crop/view/rebake or lighting pass.
- KB-STRATEGIE `engine-platform-utilization`: active research direction, not a
  migration approval. Browser delivery cannot rely on app-owned native OS
  bindings, so "closer to the metal" means WebGL2 extension/GPU timer coverage,
  WebGPU adapter/limits probes, worker/OffscreenCanvas feasibility,
  WASM/SIMD/thread preconditions behind cross-origin isolation, and device-class
  runtime policy. Keep WebGL stabilization first unless the owner explicitly
  approves a WebGPU or worker-renderer branch after evidence.

## Suggested Fresh Agent Prompt

```text
You are taking over Projekt Objekt-143 for Terror in the Jungle.

Repo: C:\Users\Mattm\X\games-3d\terror-in-the-jungle
Branch: master
Strategy: stabilize WebGL first. Do not start WebGPU migration unless the
project owner explicitly approves that point of no return.
Resource note: the owner may have overnight agents active in other repos,
including browser/game work and SDS. Before any headed/GPU-heavy Projekt run,
check active browser/Node/Bun processes and do not accept perf evidence if the
machine is busy or the capture window spans monitors. If the same stale
resource-consuming processes remain after roughly three hours, clean them up
before resuming heavier captures.

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
4. npm run check:projekt-143-terrain-hydrology
5. npm run check:projekt-143
6. npm run check:projekt-143-pixel-forge
7. npm run check:projekt-143-pixel-forge-vegetation-readiness
8. npm run check:projekt-143-vegetation-candidate-proof
9. npm run check:projekt-143-completion-audit

Current evidence anchors:
- Cycle 3 kickoff:
  artifacts/perf/2026-05-07T00-26-45-885Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json
- Completion audit:
  artifacts/perf/2026-05-07T01-14-59-420Z/projekt-143-completion-audit/completion-audit.json
- KB-STRATEGIE guarded platform capability probe:
  artifacts/perf/2026-05-06T06-03-26-013Z/projekt-143-platform-capability-probe/summary.json
  (WARN/headless capability inventory only: SwiftShader WebGL2, no timer query,
  no WebGPU adapter, isolated SharedArrayBuffer and OffscreenCanvas WebGL2 pass,
  local/live COOP/COEP headers pass)
- Static Projekt suite:
  artifacts/perf/2026-05-06T05-53-35-745Z/projekt-143-evidence-suite/suite-summary.json
- KB-LOAD startup baselines:
  artifacts/perf/2026-05-05T04-24-07-730Z/startup-ui-open-frontier/summary.json
  artifacts/perf/2026-05-05T04-25-31-931Z/startup-ui-zone-control/summary.json
- KB-LOAD vegetation-normal candidate proof:
  artifacts/perf/2026-05-05T05-31-24-775Z/startup-ui-open-frontier-vegetation-normals-disabled/summary.json
  artifacts/perf/2026-05-05T05-28-07-843Z/startup-ui-zone-control-vegetation-normals-disabled/summary.json
- KB-LOAD/OPTIK vegetation-normal visual proof:
  artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/summary.json
  artifacts/perf/2026-05-06T00-28-10-228Z/projekt-143-vegetation-normal-proof/contact-sheet.png
- KB-LOAD branch selector:
  artifacts/perf/2026-05-06T02-56-15-735Z/projekt-143-load-branch-selector/load-branch-selector.json
- KB-LOAD Pixel Forge vegetation readiness:
  artifacts/perf/2026-05-06T04-17-34-839Z/projekt-143-pixel-forge-vegetation-readiness/vegetation-readiness.json
- KB-LOAD Pixel Forge vegetation candidate proof:
  artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/summary.json
  artifacts/perf/2026-05-06T21-40-40-049Z/projekt-143-vegetation-candidate-proof/candidate-contact-sheet.png
- KB-LOAD Pixel Forge vegetation candidate import plan:
  artifacts/perf/2026-05-06T21-41-01-701Z/projekt-143-vegetation-candidate-import-plan/import-plan.json
- KB-FORGE local Pixel Forge bureau:
  artifacts/perf/2026-05-06T04-11-40-074Z/projekt-143-pixel-forge-bureau/pixel-forge-bureau.json
- KB-TERRAIN before baseline:
  artifacts/perf/2026-05-04T12-59-44-452Z/projekt-143-terrain-horizon-baseline/summary.json
- KB-TERRAIN material distribution:
  artifacts/perf/2026-05-06T04-13-18-235Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json
- KB-TERRAIN runtime hydrology distribution:
  artifacts/perf/2026-05-06T04-13-18-235Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json
- KB-TERRAIN reusable hydrology track:
  docs/PROJEKT_OBJEKT_143_HYDROLOGY.md
  artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json
  artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-mask.png
  artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-mask.png
  artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/a_shau_valley-hydrology-cache.json
  artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/open_frontier-hydrology-cache.json
  public/data/hydrology/bake-manifest.json
  public/data/hydrology/a_shau_valley-hydrology.json
  public/data/hydrology/open_frontier-42-hydrology.json
  The JSON includes bounded world-space `channelPolylines` for the top channel
  paths; treat them as river-corridor candidates for the next branch.
- KB-TERRAIN current elevated horizon baseline:
  artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json
- KB-TERRAIN placement/foundation audit:
  artifacts/perf/2026-05-07T00-32-41-375Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json
- KB-TERRAIN terrain asset inventory:
  artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json
- KB-TERRAIN route/trail policy audit:
  artifacts/perf/2026-05-06T17-00-32-294Z/projekt-143-terrain-route-audit/terrain-route-audit.json
- KB-TERRAIN Open Frontier after vegetation pass:
  artifacts/perf/2026-05-04T02-45-03-756Z/summary.json
- KB-TERRAIN/Open Frontier current resource-free runtime rerun:
  artifacts/perf/2026-05-06T04-27-07-950Z/summary.json
  (measurement trust PASS; validation WARN on p99, heap peak growth, and shots
  below harness minimum; terrain-stall/backtracking warnings remain visible)
- KB-TERRAIN/Open Frontier after NPC recovery follow-up:
  artifacts/perf/2026-05-06T04-51-35-039Z/summary.json
  (measurement trust PASS; validation WARN; active-driver route/engagement
  remains suspect)
- KB-TERRAIN/Open Frontier active-driver route-overlay diagnostic:
  artifacts/perf/2026-05-06T06-18-15-743Z/summary.json
  (headless diagnostic only; validation FAIL and measurement trust FAIL, but
  movement telemetry improves versus
  artifacts/perf/2026-05-06T06-04-57-681Z/summary.json: max stuck `176.1s -> 0s`,
  `blockedByTerrain 275 -> 0`, `avgActualSpeed 0 -> 8.82m/s`; combat remains
  `0` shots)
- KB-TERRAIN active-driver combat-front routing:
  local CPU validation only. Aggressive large-map patrol now prefers the nearest
  live OPFOR objective before capture-zone fallback so the next proof tests
  target acquisition instead of zone-only wandering. The runtime sample stream
  now includes objective kind/distance, nearest OPFOR distance, perceived enemy
  distance, perception range, path target kind/distance, and last path query
  status. Runtime proof is still pending.
- KB-TERRAIN active-driver diagnostic reader:
  artifacts/perf/2026-05-06T06-44-42-668Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json
  (FAIL on the old Open Frontier diagnostic because objective/path telemetry was
  absent before the current patch; rerun with current code before diagnosing.
  Stable entry point: `npm run check:projekt-143-active-driver-diagnostic`.)
- KB-TERRAIN/Open Frontier resource-clean telemetry rerun:
  artifacts/perf/2026-05-06T07-38-14-932Z/summary.json
  and
  artifacts/perf/2026-05-06T07-38-14-932Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json
  (measurement trust PASS, validation FAIL; objective/path telemetry is present,
  path query remains failed, perceived target stays hundreds of meters away, and
  shots remain `0`)
- KB-TERRAIN/Open Frontier active-driver terrain/contact and combat-front proof:
  artifacts/perf/2026-05-06T08-52-31-466Z/summary.json
  and
  artifacts/perf/2026-05-06T08-52-31-466Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json
  (headed 20s proof only; measurement trust PASS; validation WARN; active gates
  PASS with `33` shots, `19` hits, `6` kills, max stuck `0.5s`, and `19`
  movement transitions; runtime liveness shows no terrain block or collision
  height lift; p99/average frame/hitch50/heap peak remain WARN and A Shau is
  still open)
- KB-CULL/KB-TERRAIN full-duration active-driver pair after close-model culling:
  before Open Frontier fail:
  artifacts/perf/2026-05-06T09-06-03-544Z/summary.json
  (measurement trust PASS; validation FAIL on p99 `65.90ms`, hitch50 `3.78%`,
  and average frame `31.08ms`; scene attribution points at close weapons and
  close NPC GLBs during the active fight). Retained code keeps close
  Pixel Forge NPC body/weapon meshes frustum-cullable instead of disabling
  child culling for every pooled close model. After evidence:
  artifacts/perf/2026-05-06T09-09-45-715Z/summary.json and
  artifacts/perf/2026-05-06T09-09-45-715Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json
  (Open Frontier, measurement trust PASS, validation WARN, diagnostic PASS,
  `81` shots / `45` hits, max stuck `0.8s`, p99 `47.90ms`, hitch50 `0.04%`,
  heap peak growth `6.69MB`) plus
  artifacts/perf/2026-05-06T09-11-34-037Z/summary.json and
  artifacts/perf/2026-05-06T09-11-34-037Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json
  (A Shau, measurement trust PASS, validation WARN, diagnostic PASS,
  `171` shots / `95` hits, max stuck `0.7s`, p99 `26.70ms`, hitch50 `0%`,
  heap peak growth `27.81MB`). This is scoped active-driver/close-model
  frustum-culling evidence only, not broad KB-CULL or KB-TERRAIN closeout.
- Rejected active-driver path-planning experiments:
  artifacts/perf/2026-05-06T07-45-35-107Z/summary.json,
  artifacts/perf/2026-05-06T07-51-32-551Z/summary.json, and
  artifacts/perf/2026-05-06T07-54-19-080Z/summary.json
  (diagnostic only; the latter two fail measurement trust with zero runtime
  samples)
- Rejected active-driver handoff/near-route fallback experiment:
  artifacts/perf/2026-05-06T18-44-37-468Z/summary.json and
  artifacts/perf/2026-05-06T18-44-37-468Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json
  (validation FAIL; heading reversals worsened to `46`; code reverted)
- Rejected Open Frontier frontline-compression experiment:
  artifacts/perf/2026-05-06T04-58-04-461Z/summary.json
  (validation FAIL; code reverted; diagnostic only)
- KB-TERRAIN A Shau after placement pass:
  artifacts/perf/2026-05-04T04-14-35-401Z/summary.json
- KB-TERRAIN A Shau after route-stamping pass:
  artifacts/perf/2026-05-04T13-03-02-238Z/summary.json
- KB-TERRAIN A Shau current rerun:
  artifacts/perf/2026-05-06T04-30-51-979Z/summary.json
  (measurement trust PASS; validation WARN on p99, heap peak growth, and shots
  below harness minimum; startup and terrain-stall/backtracking remain open)
- KB-TERRAIN A Shau after NPC recovery follow-up:
  artifacts/perf/2026-05-06T04-46-26-097Z/summary.json
  (measurement trust PASS; shot gate healthy; still WARN on p99/heap and terrain
  backtracking)
- KB-TERRAIN local mossy cliff/material follow-up:
  artifacts/perf/2026-05-06T04-13-18-235Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json
- Local Open Frontier visibility/vegetation diagnostic:
  artifacts/perf/2026-05-04T21-24-46-901Z/summary.json
  (measurement trust PASS but validation FAIL on harness combat behavior; also
  noisy because local asset baking was running)
- Active-player hit-contract evidence:
  artifacts/perf/2026-05-04T11-35-07-274Z/summary.json
- KB-CULL owner baseline:
  artifacts/perf/2026-05-06T22-22-09-798Z/projekt-143-culling-owner-baseline/summary.json
- KB-CULL fresh deterministic proof:
  artifacts/perf/2026-05-06T22-12-58-306Z/projekt-143-culling-proof/summary.json
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
- KB-OPTIK accepted runtime-equivalent human review:
  artifacts/perf/2026-05-05T23-13-35-420Z/projekt-143-optik-human-review/review-summary.json

Current bureau state:
- KB-LOAD: ready_for_branch, now with proof-only startup-latency win evidence.
  The selected next proof branch is `vegetation-atlas-regeneration-retain-normals`;
  Pixel Forge candidate generation/validation, TIJ static candidate proof, dry-run
  import plan, and proof-only Open Frontier/Zone Control startup tables pass for
  the review-only 256px-tile profile. Owner visual acceptance, runtime import,
  in-game visual proof, and production parity remain open.
  The
  `--disable-vegetation-normals` startup option is proof-only and rejected for
  default policy while the latest visual proof remains WARN.
- KB-TERRAIN: ready_for_branch. Far-canopy tint, short-palm retirement,
  grounding, distribution, hydrology-cache, default hydrology-backed vegetation
  classification, and fresh horizon proof evidence exist, but A Shau route/nav
  quality, hydrology-driven water/river rendering, ground-cover imports, and final
  visual acceptance remain open.
  Include the owner visual target: majority green/jungle floor, possible
  inverted material distribution, remove the short Quaternius palm
  (`giantPalm` / `palm-quaternius-2`) from runtime and shipped assets, preserve
  the taller `fanPalm` and `coconut` palm-like species, redirect that budget
  toward grass or ground cover, add more big palms and ground cover, bamboo as
  scattered dense clusters, non-uniform A Shau vegetation ecology instead of an
  evenly spaced mix everywhere, hydrology/lowland-aware palms and understory,
  disturbed trail edges, terrain-shaped building/HQ/airfield/vehicle
  foundations with no hill-edge overhangs, and a performance-aware Pixel Forge
  building shortlist before replacement. Include an asset audit for
  ground/path/grass/foliage/cover variety and future vehicle-usable trail
  surfaces, plus an EZ Tree or similar source-pipeline investigation for
  licensed browser-budget GLBs that can become Pixel Forge-compatible
  impostors/LODs. Current local terrain work has Open Frontier
  WARN/trusted evidence, clustered-bamboo static distribution evidence, a
  passing placement/foundation audit, a static terrain asset inventory, and a
  passing route/trail policy audit. A Shau now stamps full `jungle_trail`
  corridors instead of map-only route overlays, and the latest endpoint inset
  follow-up moves non-home objective routes inside objective footprints. The
  latest current rerun improves waypoint replans and waypoints followed but is
  still WARN on p99/heap growth and logs terrain-stall warnings. The local NPC
  navmesh recovery follow-up then makes `activateBacktrack` prefer last-good
  navmesh progress and reject current-position no-op snaps. Focused movement and
  stuck-detector tests pass, and A Shau shot/hit evidence is much healthier in
  `artifacts/perf/2026-05-06T04-46-26-097Z/summary.json`, but p99/heap WARNs
  and terrain backtracking remain, so do not claim A Shau acceptance. Open
  Frontier remains low-combat in
  `artifacts/perf/2026-05-06T04-51-35-039Z/summary.json`, but the later retained
  active-driver terrain/contact follow-up now has a 20s headed Open Frontier
  liveness proof at `artifacts/perf/2026-05-06T08-52-31-466Z/summary.json`.
  2026-05-06 human-observed active-driver reruns still showed close-contact
  aim/route twitch and cover-like strafe behavior when `compressFrontline`
  moved `28` OPFOR toward the player/HQ; treat compressed Open Frontier runs
  as stress evidence, not natural spawn distribution proof. The local driver
  follow-up stabilizes target locks, disables scripted ENGAGE strafe, preserves
  route-progress/reset telemetry through `perf-capture`, and keeps combat aim
  over route-facing inside close current-target distance. A later local
  close-pressure patch also makes the driver hold-and-shoot inside the mode
  close-contact distance and fences utility fire-and-fade re-entry behind the
  legacy cover-seek cooldown. The latest selector/movement-clamp follow-up
  further keeps objective travel unless a visible target is inside the
  mode-specific acquisition band, reduces player-anchored compression, suppresses
  close-range utility cover hops, and clears the false `ground_rise_clamp`
  terminal block. Fresh Open Frontier evidence at
  `artifacts/perf/2026-05-06T14-44-44-702Z/summary.json` has measurement trust
  PASS, diagnostic PASS, `102` shots / `17` hits, `37` movement transitions,
  max stuck `0.3s`, and `0` route no-progress resets, but still needs owner
  visual review before the harness is accepted as a skilled-player proxy. A
  later owner check still saw dense close-pressure cover-like pacing/yaw twitch;
  the local target-lock patch now keeps active close targets through brief
  LOS/nearest-enemy churn, but the fresh compressed Open Frontier browser probe
  at `artifacts/perf/2026-05-06T17-25-29-462Z/summary.json` still fails as a
  skilled-player proxy: measurement trust passes and max stuck is `0.3s`, but
  hits stay at `1`, route target resets are `10`, route no-progress resets are
  `6`, and final objective closure is negative. The pure-pursuit/world-intent
  follow-up at `artifacts/perf/2026-05-06T18-24-22-092Z/summary.json` improved
  the route driver but still left `22` short-hop heading reversals over `120`
  degrees. The retained route micro-target fix then uses annotated
  requested-vs-actual movement buckets to invalidate stale tiny overlay points
  when the real route anchor is still far away. The 90s proof at
  `artifacts/perf/2026-05-06T18-57-51-385Z/summary.json` improves to `126`
  shots / `18` hits / `4` kills, `98.68m` objective closure, and `8`
  short-hop pacing reversals; the 180s proof at
  `artifacts/perf/2026-05-06T19-02-39-418Z/summary.json` keeps movement healthy
  with `1262.93m` player travel, `176.78m` objective closure, and `0`
  terrain-blocked flips, but remains combat-light after first contact. Treat
  the route micro-target pacing mechanism as fixed enough to keep, while
  skilled-player combat acceptance remains open. Separately, keep
  the owner-observed NPC speed concern open until telemetry distinguishes
  initial harness relocation/compression from non-initial terrain
  backtracking/recovery spikes above the infantry run envelope.
  Human visual review also re-raised airfield/building/vehicle foundations
  hanging off cliff or hill edges. The local world-feature follow-up routes
  generated airfield structures through the footprint solver, widens large
  static-prop flat-search, and expands circular terrain stamps to cover their
  authored surface radius before blending/shouldering into native terrain. The
  rebuilt foundation visual packet at
  `artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/visual-review.json`
  now includes airfield, parking, support-foundation, and hydrology shots with
  contact sheet
  `artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`;
  treat it as fresh review evidence only until owner acceptance, matched perf,
  and the Pixel Forge building shortlist/optimization pass confirm upgraded
  GLBs and future vehicle-driving surfaces are acceptable. The packet now
  explicitly WARNs on Open Frontier river overexposure, matching the owner water
  complaint instead of passing a washed-out water shot.
  A later hardening pass measured the warehouse-class runtime footprint at
  about `17.5m` scaled radius, removes the old small-prop placement cap, and
  has the placement audit use model-aware generated-placement proxies for known
  large buildings, aircraft, and ground vehicles. The next audit fix found that
  generated airfield placement relief sampling had been reading `world.z` from
  a `THREE.Vector2`, so those large placements had effectively reported zero
  native relief. Latest placement audit:
  `artifacts/perf/2026-05-07T00-32-41-375Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  is PASS with `57` audited features and `fail=0` / `warn=0` across all
  audited modes/seeds. It still does not import Pixel Forge replacements, prove
  matched perf, certify future vehicle-driving surfaces, or override the open
  visual water/foundation review.
  The terrain asset inventory now includes lightweight GLB metadata for that
  shortlist: `12` building candidates total `5,704` triangles, runtime
  structure/foundation models total `7,528` triangles, and `30` reviewed static
  models are medium/high optimization risk mostly from mesh/material/primitive
  fragmentation rather than triangle count. The same artifact catalogs the
  sibling Pixel Forge gallery as `19` building GLBs totaling `18,338` triangles
  and `5` ground-vehicle GLBs totaling `5,272` triangles. No upgraded
  building/vehicle GLB is imported or accepted yet. The follow-up structure
  review at
  `artifacts/perf/2026-05-06T16-45-59-860Z/projekt-143-pixel-forge-structure-review/structure-review.json`
  confirms `19/19` building candidates and `5/5` current ground-vehicle GLBs
  have review grids, with `5` TIJ-generated vehicle grids rendered from current
  Pixel Forge GLBs and `4` orphaned older Pixel Forge ground-vehicle grids.
  Building and vehicle candidates can now be source-gallery-reviewed from the
  contact sheet; future driving vehicles still need contact/pivot/wheel probes
  before import.
  The browser sampling helper injection is hardened, `TerrainQueries` no longer
  treats tall generic or dynamic collision bounds as effective player ground,
  and capped player-anchored combat-front compression syncs logical combatant
  positions with rendered anchors and the spatial grid. The proof has
  measurement trust PASS and active gates PASS, with `33` shots, `19` hits,
  max stuck `0.5s`, `19` movement transitions, and no final terrain/collision
  height block. It is still only liveness evidence: validation is WARN on p99,
  average frame, hitch50, and heap peak, the run is short, and A Shau route/nav
  quality remains unsigned. A later close-model frustum-culling slice keeps
  close Pixel Forge NPC body/weapon meshes eligible for renderer frustum
  culling and turns the full-duration Open Frontier active-driver proof from a
  validation FAIL at
  `artifacts/perf/2026-05-06T09-06-03-544Z/summary.json` into WARN evidence at
  `artifacts/perf/2026-05-06T09-09-45-715Z/summary.json`; the matched rebuilt
  A Shau proof is
  `artifacts/perf/2026-05-06T09-11-34-037Z/summary.json`. Both paired
  diagnostics PASS, player movement/combat gates are healthy, and heap/hitch
  gates pass. Remaining WARNs plus NPC terrain backtracking, hydrology/water,
  ground-cover/trail visuals, and broad HLOD/culling keep KB-TERRAIN and
  KB-CULL open.
  A first A Shau ecology/hydrology proxy has also landed:
  Broad DEM/procedural low-flat `swamp` and `riverbank` proxy rules have now
  been removed from A Shau and Open Frontier. Wet/channel vegetation
  classification is owned by the baked hydrology masks through
  `HydrologyBiomeClassifier`, and the latest hydrology audit
  `artifacts/perf/2026-05-06T17-01-02-257Z/projekt-143-terrain-hydrology-audit/hydrology-audit.json`
  is PASS: both A Shau and Open Frontier cover `100%` of wet candidates and
  leave `0%` dense-jungle wet candidates at audit resolution. The latest
  terrain distribution audit
  `artifacts/perf/2026-05-06T17-00-32-427Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  clears A Shau's uniform-biome flag after the dry lowland `tallGrass`
  ground-cover band; it remains WARN overall only because AI Sandbox samples a
  random seed mode with the fixed audit fallback. The next KB-TERRAIN branch
  should therefore add clustered palm/understory pockets, bamboo/trail
  permissioning, and visual proof instead of widening dry-cell hydrology
  corridors. The latest hydrology JSON includes
  bounded world-space `channelPolylines` for the top paths plus schema-v1 cache
  artifacts for sparse wet/channel masks, and records `HydrologyCorridor.ts` as
  a pure helper for future channel/bank/wetland/upland distance sampling.
  Default A Shau and Open Frontier vegetation classification and terrain
  material masks consume the baked hydrology masks through their mode configs,
  and startup warns/no-ops instead of failing if the optional cache is missing.
  A provisional runtime river-strip water mesh has landed, but final stream art,
  crossings, flow, gameplay water queries, and human review remain open.
  Current elevated terrain horizon proof is
  `artifacts/perf/2026-05-06T10-51-52-518Z/projekt-143-terrain-horizon-baseline/summary.json`,
  PASS for four Open Frontier/A Shau screenshots with renderer, terrain,
  vegetation, and browser-error checks. Treat it as runtime evidence, not
  final human far-horizon acceptance.
  Current ground-level/foundation terrain visual-review packet is
  `artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/visual-review.json`
  with contact sheet
  `artifacts/perf/2026-05-07T00-48-25-635Z/projekt-143-terrain-visual-review/terrain-visual-contact-sheet.png`.
  It is WARN for refreshed Open Frontier/A Shau screenshots covering player
  ground, route/trail, airfield-foundation, airfield-parking,
  support-foundation, river-oblique, and river-ground views with zero
  browser/page errors because the two Open Frontier river shots are now flagged
  as washed out by `terrain_water_exposure_review`. Treat it as review packet
  evidence only; human visual acceptance, matched perf, stream art/crossing
  polish, Pixel Forge building/vehicle replacement, and production parity
  remain open.
  The attempted matched Open Frontier perf leg at
  `artifacts/perf/2026-05-06T11-30-35-349Z/summary.json` is rejected as
  KB-TERRAIN acceptance evidence: measurement trust, shots/hits, average frame,
  and end heap growth passed, but validation failed on `137.50 MB` peak heap
  growth and warned on `49.80ms` peak p99. A Shau paired perf was not run from
  that acceptance slot because the first leg was already invalid.
  Heap diagnostic
  `artifacts/perf/2026-05-06T11-42-10-167Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
  classifies this as `transient_gc_wave` with likely source
  `vegetation_cell_streaming_or_other_short_lived_runtime_allocations_near_player_traversal`;
  treat it as negative diagnostic evidence only, not a fix or acceptance.
  Durable
  `public/data/hydrology` caches now exist, pass `npm run
  check:hydrology-bakes`, and are copied to `dist/data/hydrology/*` by
  `npm run build`. `HydrologyBakeManifest.ts` provides the typed loader, and
  `HydrologyBiomeClassifier.ts` provides the default large-map vegetation
  classifier path now recorded in the completion audit as
  `default_mode_vegetation_classifier`.
  Do not use
  `artifacts/perf/2026-05-06T00-00-32-485Z/summary.json` for acceptance: that
  Open Frontier run failed validation, and the owner reported concurrent web
  game tests on the same device during the capture. The Cycle 3 and terrain
  baseline selectors now skip failed-validation perf summaries even if
  measurement trust passed. The yellow-fruit `bananaPlant` albedo atlas also
  has a local color cleanup so the lower stem reads green instead of cyan-blue;
  `npx vitest run src/config/vegetationTypes.test.ts` passes with the new atlas
  regression. A final `npm run validate:fast` rerun passes after an initial
  noisy `SpatialOctree.test.ts` timing failure and isolated pass; treat the
  final static gate as green, but do not treat it as perf or production
  acceptance. `npm run build` and `npm run build:perf` also pass after the
  atlas/selector work, with only the usual Vite chunk-size warning. Current
  local follow-up keeps
  rock as a reduced
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
  Current local follow-up changes world static features to frustum-aware
  per-sector distance/hysteresis visibility because distant bases/houses were
  staying visible at any distance, and then adds air-vehicle frustum render
  gating for non-near unpiloted aircraft. The selected
  world-static/visible-helicopter owner path now has scoped before/after proof
  at
  `artifacts/perf/2026-05-06T22-22-09-798Z/projekt-143-culling-owner-baseline/summary.json`,
  and Cycle 3 records that slice as `evidence_complete`; broad HLOD,
  parked-aircraft playtest, future vehicle driving, static-cluster, and
  vegetation-distance policy remain open.
  Vegetation hidden behind hills should be handled with coarse
  terrain/cluster/Hi-Z-style occlusion, not per-instance raycasts.
  Close-NPC/weapon residency is accepted only as a scoped residency slice, and
  close-model frustum culling is now accepted as a scoped full-duration
  Open Frontier/A Shau WARN slice, not as broad culling/HLOD closeout. Rejected
  static-helicopter distance-cull after artifact:
  artifacts/perf/2026-05-04T00-55-00-501Z/summary.json.
- KB-EFFECTS: evidence_complete only for low-load grenade first-use stall.
- KB-OPTIK: evidence_complete for the current owner-accepted runtime-equivalent
  packet. Preserve it; future downward-bias or brightness polish needs a fresh
  proof-gated crop/view/rebake or lighting pass.
- KB-STRATEGIE: active platform-utilization research track only. Inventory
  native-backed browser capabilities before architecture changes. Latest static
  evidence is
  `artifacts/perf/2026-05-06T05-53-35-718Z/webgpu-strategy-audit/strategy-audit.json`;
  it keeps `activeWebgpuSourceMatches=0`, records `12` WebGL renderer
  entrypoints and `113` migration-blocker matches, and excludes platform-probe
  and completion-audit tooling self-references. The guarded browser-backed
  probe at
  `artifacts/perf/2026-05-06T06-03-26-013Z/projekt-143-platform-capability-probe/summary.json`
  is WARN/headless inventory: WebGL2 is available through SwiftShader,
  `EXT_disjoint_timer_query_webgl2` is unavailable, `navigator.gpu` has no
  adapter, OffscreenCanvas WebGL2 and isolated SharedArrayBuffer pass, and local
  plus live Pages COOP/COEP headers pass. Do not treat WebGPU, OffscreenCanvas,
  or WASM threads as approved migration work; use a headed hardware-backed
  quiet-machine rerun before any architecture decision.

Goal: continue toward completing Projekt Objekt-143 without making unsupported
claims. Pick the next remediation only after refreshing the kickoff matrix and
checking that the selected bureau has before evidence. Prefer a narrow,
bisectable branch:
- KB-CULL next path: continue beyond the accepted scoped static-feature,
  visible-helicopter, close-NPC/weapon residency, and close-model frustum
  culling slices. Broad HLOD, vehicle, static-cluster, and vegetation culling
  are not closed.
- KB-TERRAIN first path: owner review of the current terrain visual packet,
  runtime hydrology water/river art polish, ground-cover/trail acceptance, and
  remaining NPC terrain-stall/backtracking quality, using the elevated
  screenshot baseline, visual-review packet, and Open Frontier/A Shau perf
  guardrails.
- KB-LOAD first path: texture/upload residency with paired Open Frontier and
  Zone Control startup artifacts; do not revive the rejected fanPalm warmup
  without new paired evidence.
- KB-STRATEGIE first path: treat the headless capability probe as initial
  inventory, then rerun headed on a quiet machine before architecture work.
  Inventory WebGL2 extensions/GPU timer support, WebGPU adapter/limits,
  OffscreenCanvas support, cross-origin isolation and SharedArrayBuffer
  availability, and device memory/GPU class. Do not implement a renderer
  migration from the probe alone.

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
