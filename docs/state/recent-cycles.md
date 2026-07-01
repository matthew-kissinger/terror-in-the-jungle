# Recent Cycle Outcomes

Last verified: 2026-07-01 (added the owner-playtest follow-up implementation
entry; prior refresh 2026-06-01 under `optimal-development arc`. For cycle
truth after 2026-05-13 see the closed campaign manifests under
[docs/archive/](../archive/), [docs/DIRECTIVES.md](../DIRECTIVES.md), and
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).)

Recent cycles, summarized. Companion docs:

- [docs/state/CURRENT.md](CURRENT.md) — current truth
- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — active carry-over registry
- `docs/cycles/<cycle-id>/RESULT.md` — full retrospectives per cycle

For older cycle outcomes, browse `docs/cycles/` or
`docs/tasks/archive/<cycle-id>/`.

---

## cycle-2026-07-01-owner-playtest-followups (production-review release)

Owner playtest notes from July 1 were mapped to code ownership and implemented
as a production-review batch:

- 3D deploy map marker labels + compact legend, so spawn/faction meaning is not
  color-only.
- Approved fal.ai objective/capture clips promoted as local variant pools;
  rejected sharp `capture-confirmation-alt-v2.ogg` from the 11:50 review folder
  excluded and replaced by the softer later candidate.
- Default ambient/static/music background disabled; radio stations remain
  opt-in and no static/noise-bed station ships by default.
- Objective completion audio plays locally near the objective source, not as a
  global radio/UI stinger.
- Radio IA rebuilt to Fire Support / Squad / Signals, with stations under
  Signals and smoke target choices as a Fire Support drilldown.
- Kiln field-radio viewmodel imported through the war-asset catalog append/merge
  path with dedicated 2026-07 provenance.
- First-person held equipment modes added for radio and smoke marker; the radio
  suppresses the firearm while raised.
- Throwable smoke marker added with hold-to-charge arc, visible canister,
  bounce/bobble/settle, smoke emission, and target-mark events.
- Helicopter player-airframe firing/effects ownership consolidated, and
  infantry shot-origin diagnostics/tracer convergence added.

Local gates passed before production deployment: `npm run validate:fast`,
`npm run build`, and `npm run check:asset-gallery -- --only
field-radio-viewmodel`. Human PROD review remains the acceptance gate; the
walk list is in [PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

---

## optimal-development arc (2026-06-01, autonomous-loop, workflow-orchestrated)

Eight workflow-driven phases shipped to `master` and deployed live (tip
`17adc18a`), each gated green (typecheck + lint + test:run + build) before merge:

- **Phase 0 — doc grounding:** 24 onboarding docs realigned to code reality
  (ECS framing corrected to "evaluated", status-home pointer, ~24 broken
  links/paths + stale facts).
- **Phase 1 — trust the instruments:** perf-baseline staleness guard in
  `perf-compare.ts`; `scripts/` brought under lint + a `tsconfig.scripts.json`
  typecheck; knip config fixed (unused-files 462 → 87).
- **Phase 2 — prove & protect:** per-frame allocation hardening (combat/
  terrain/billboard); +142 behavior tests for zero-coverage modules; broadened
  `check:doc-drift` from 3 → all 405 docs and wired it into CI.
- **Phase 3 — bug hunt:** adversarial refute-by-default sweep — 6 confirmed
  bugs fixed (each red→green), ~17 suspected refuted by empirical probe.
- **Phase 4 — scale:** god-file budget burndown (4 hard FAILs → 0 via
  facade-preserving splits); bitECS scoping spike benchmarked 1.0–1.09× vs OOP
  → **DEFER** ([docs/rearch/ECS_SPIKE_2026-05-31.md](../rearch/ECS_SPIKE_2026-05-31.md)).
- **Phase 5 — features:** aviation/UX scoped against current code (most already
  built); DIRECTIVES AVIATSIYA rows realigned; one bounded UX wiring landed;
  design-heavy gaps deferred with plans
  ([docs/rearch/PHASE5_FEATURE_SCOPE_2026-05-31.md](../rearch/PHASE5_FEATURE_SCOPE_2026-05-31.md)).

Suite 5249 green; `lint:budget` clean; `check:live-release` PASS (7/7). The CI
Playwright-browser jobs (smoke/mobile-ui/perf) were made advisory due to a
runner-side `playwright install` hang (infra, not code) — restore once fixed.
Feel-walks tracked in [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

---

## Active branch: task/mode-startup-terrain-spike (opened 2026-05-13)

Not a closed cycle yet. This branch addresses the user-reported mode-selection
stall. Baseline evidence showed Zone Control taking 27.8s from mode click to
deploy UI and Open Frontier timing out past 120s; cache/header checks showed
Recast WASM, build assets, and prebaked navmesh delivery were already correct.
The blocker was synchronous terrain surface baking after mode select.

Current branch evidence and acceptance criteria live in
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](../rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).
Carry-over: `KB-STARTUP-1`.

---

## cycle-2026-05-13-konveyer-materialization-rearch — R1 only (closed 2026-05-13)

R1 slices of the Phase F materialization rearch landed via three commits on
the experimental branch, then folded into `master` with the KONVEYER campaign
close via [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
(merge commit `1df141ca`) on 2026-05-13. PRs #183-#185 covered the
component commits; the master-merge PR #192 carried them in.

**Shipped (R1):**

- Combat sub-attribution: `World.Combat` now reports per-system child timings
  (`Combat.{Influence,AI,Billboards,Effects}`) through
  `performanceTelemetry.beginSystem` / `endSystem`. Turns the "Combat
  1.5-3.2 ms" bar into actionable lane-level inputs for the R2
  cover-spatial-grid slice.
- Materialization lane rename: `Combatant.lodLevel` → `Combatant.simLane`, and
  separate `Combatant.renderLane` field introduced. No behavior change; the
  rename is the surface that budget arbiter v2 writes to in R3-R4.
- Idempotent `setCloudCoverage` + sky-refresh gate: closes the 16x/sec
  sky-texture refresh that was firing despite the 2 s
  `SKY_TEXTURE_REFRESH_SECONDS` knob. A Shau worst-case SkyTexture EMA
  dropped 5.96 ms → 0.52 ms (~11x); all five modes hold total Atmosphere
  CPU under 1 ms per frame.

**Rescoped:** R2-R4 (cover-spatial-grid, render-silhouette/cluster lanes,
squad-aggregated strategic sim, budget arbiter v2, multi-mode strict-WebGPU
proof v2) queued on master as
[`cycle-phase-f-r2-r4-on-master`](../tasks/archive/cycle-phase-f-r2-r4-on-master-DEFERRED/cycle-phase-f-r2-r4-on-master.md).
Milestone memo:
[docs/rearch/POST_WEBGPU_MIGRATION_2026-05-13.md](../rearch/POST_WEBGPU_MIGRATION_2026-05-13.md).

---

## cycle-2026-05-12-doc-vision-alignment (closed 2026-05-13 via post-merge cleanup)

Ad-hoc dispatch landing PRs #186-#191 ahead of the master merge plus
post-merge cleanup PRs #193-#195. Doc-only across the run; no source code
touched.

**Pre-merge (PRs #186-#191, 2026-05-12):**

- Historical/status headers on superseded strategic docs (PR #186).
- `docs/ROADMAP.md` + `AGENTS.md` aligned to the 2026-05-12 two-vision split
  (experimental WebGPU + driveable land vehicles as parallel first-class
  directions) (PR #187, commit `9e3ea821`).
- `CLAUDE.md` "Current focus" amended; two non-vision AVIATSIYA carry-overs
  parked (PR #188).
- Three new rearch memos:
  `docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md`,
  `docs/rearch/TANK_SYSTEMS_2026-05-13.md`,
  `docs/archive/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md`, plus the
  `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md` 2026-05-13 addendum
  (PRs #189-#191).

**Post-merge (PRs #193-#195, 2026-05-13):**

- Strategic-doc alignment to post-master-merge WebGPU state (PR #193;
  bundle 1).
- New `docs/state/CURRENT.md` 2026-05-13 entry, milestone memo
  [POST_WEBGPU_MIGRATION_2026-05-13.md](../rearch/POST_WEBGPU_MIGRATION_2026-05-13.md),
  and active campaign manifest
  [CAMPAIGN_2026-05-13-POST-WEBGPU.md](../archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  (PR #194; bundle 2).
- Task-brief archive + R2-R4 rescope on master via
  [`cycle-phase-f-r2-r4-on-master`](../tasks/archive/cycle-phase-f-r2-r4-on-master-DEFERRED/cycle-phase-f-r2-r4-on-master.md)
  (PR #195; bundle 3).

---

## cycle-2026-05-11-konveyer-scene-parity (closed; archived)

Closed on the experimental branch and folded into the master merge via
PR #192. Shipped slices 9-15 of the KONVEYER campaign — atmosphere CPU
collapsed from 5-6 ms to <1 ms across all five modes via the LUT-driven
sky refresh (slice 12), `DataTexture` + 2 s refresh cadence (slice 13), the
phantom-EMA stale-bundle diagnostic (slice 14), and idempotent
`setCloudCoverage` (slice 15). Full retrospective archived at
[`docs/tasks/archive/cycle-2026-05-11-konveyer-scene-parity/`](../tasks/archive/cycle-2026-05-11-konveyer-scene-parity/).

---

## release-stewardship-2026-05-10 (deployed)

Continuation pass after Phase 2 and Phase 2.4 were merged. This is not a
normal cycle record, but it is the current release truth until the next formal
cycle closes.

**Shipped to production:**

- CDLOD two-sided skirt-wall hardening for the white terrain crack report.
- M151 world-feature placements register as `ground` vehicles with seats.
- SVYAZ-3 radio shell first slice is on `master`.
- PostCSS resolves to 8.5.14; `_headers`, `robots.txt`, meta description,
  and preload cleanup are ready for deploy.
- Cover-query TTL cache first slice is behavior-green but combat120 still
  fails `perf:compare`; DEFEKT-3/STABILIZAT-1 stay open.
- Redeploy validation found a CI perf artifact with `finalFrameCount: 0`
  despite the advisory perf job going green; CI now emits an explicit perf
  advisory summary/warning so that drift is visible.
- KONVEYER docs now define the next autonomous experimental branch as a full
  WebGPU/TSL migration pass from KONVEYER-0 through KONVEYER-9, with human
  review before any `master` merge or production deploy.

**Carry-over delta:** −3 known stale actives moved closed
(`artifact-prune-baseline-pin-fix`, `worldbuilder-oneshotkills-wiring`,
`perf-doc-script-paths-drift`). `cloudflare-stabilization-followups` remains
open only for the Web Analytics dashboard toggle and live beacon verification.

---

## cycle-2026-05-09-doc-decomposition-and-wiring (closed 2026-05-09)

Phase 1 of the realignment campaign. 6 PRs merged
([#167](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/167),
[#168](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/168),
[#169](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/169),
[#170](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/170),
[#171](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/171),
[#172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172)).

**Shipped:**

- `STATE_OF_REPO.md` (2,708 LOC) split into `docs/state/`; `PERFORMANCE.md`
  (2,332 LOC) split into `docs/perf/`; both originals archived.
- PROJEKT_OBJEKT_143 prose archived; `docs/DIRECTIVES.md` (199 LOC)
  replaces Article III as plain-English directive registry.
- 89 `check:projekt-143-*` scripts triaged → 12 retained with plain names
  (`check:live-release`, `check:cycle-close`, `check:culling-baseline`,
  etc.); 80 archived under `scripts/audit-archive/`.
- Weekly `artifact-prune.yml` GitHub Actions workflow + ~7.4 GB local
  retention prune.
- All 6 WorldBuilder god-mode flags wired into engine consumers behind
  `import.meta.env.DEV` (Vite DCE confirmed). Combat-reviewer
  APPROVE-WITH-NOTES on PR #172.

**Carry-over delta:** −6 worldbuilder-wiring closed; +2 opened
(`artifact-prune-baseline-pin-fix`, `worldbuilder-oneshotkills-wiring`).
Active count 13 → 9.

**CI:** all 6 PRs landed lint+test+build+perf+smoke+mobile-ui green.
perf-analyst: no regression (no source-tree change in 5 of 6 PRs;
worldbuilder-wiring is DEV-gated).

---

## cycle-2026-05-09-phase-0-foundation (closed 2026-05-09, PR [#166](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/166))

Foundation cycle of the 12-week realignment plan. Deliberately no
game-code changes; engine-side wiring of WorldBuilder god-mode flags
filed as 6 carry-overs for Phase 1 (all closed in Phase 1's PR #172).

**Shipped:**

- Durable rules layer: max-LOC + max-method lint with grandfather list,
  doc date-header lint, fenced-interface pre-flight, banned cycle-name
  keywords, reviewer-pre-merge gate, scenario smoke screenshot gate,
  artifact-prune retention.
- WorldBuilder dev console (`Shift+G`) as an isolation/validation tool.

See `docs/dev/worldbuilder.md` for the dev-console usage.

---

## cycle-2026-05-08-perception-and-stuck (closed 2026-05-08)

Single integration PR
[#165](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/165)
shepherded four parallel task branches to `master`:
`npc-unfreeze-and-stuck`, `npc-imposter-distance-priority`,
`zone-validate-nudge-ashau`, `terrain-cdlod-seam`. Behaviour changes
gated by config flags exposed in the existing Tweakpane (`\` toggle) so
the human can A/B at runtime.

**Shipped (each behind a config flag):**

- NPC visual unfreeze on LOD over-budget; squad-leader-stale +
  rejoin watchdogs; StuckDetector → state exit; culled-sim cadence
  45s → 8s.
- PixelForge close-model 64m → 120m; on-screen priority score;
  velocity-keyed billboard cadence.
- A Shau zone validate-and-nudge (lifts capturable zones out of
  ditches).
- CDLOD seam fix via AABB-distance morph metric + skirt geometry +
  `Shift+\` → `Y` diagnostic overlay.

**CI gate:** lint + test (4153 tests) + build + smoke + perf
(combat120 5m47s within baseline) + mobile-ui all green. Reviewers
(combat-reviewer, terrain-nav-reviewer) APPROVE-WITH-NOTES.

**Hotfix on top (2026-05-08):** Stage D2's `createTileGeometry` shipped
with an inverted Z coordinate that flipped triangle winding;
backface-culled terrain on every map. Fix at
`src/systems/terrain/CDLODRenderer.ts:25` plus regression test in
`CDLODRenderer.test.ts`. This Z-flip is the cautionary tale that
motivated the new scenario-smoke screenshot gate
([scripts/scenario-smoke.ts](../../scripts/scenario-smoke.ts)).

**Reviewer follow-ups deferred to next cycle:**

- Position-Y drift on slopes during visual-only velocity integration
  (call `syncTerrainHeight` or document bound).
- `RespawnManager` should use the new `beginRejoiningSquad` helper.
- `findSuitableZonePosition` spiral-search uses `Math.random`
  (non-deterministic).
- Stage D3 DEM edge padding gated on visual review of D1+D2 at A Shau
  north ridgeline.

Cycle retrospective:
`docs/cycles/cycle-2026-05-08-perception-and-stuck/RESULT.md`.

---

## Reading the cycle history

For older cycle outcomes (cycle-2026-05-08-stabilizat-2-closeout and
prior), browse `docs/cycles/<cycle-id>/RESULT.md` or
`docs/tasks/archive/<cycle-id>/`.

The release path is: local validation → commit to `master` → push to
`origin/master` → GitHub CI → manual Cloudflare Pages deploy via
`deploy.yml` → live Pages/R2/browser verification via `check:live-release`
(renamed from `check:projekt-143-live-release-proof` in Phase 1). Exact
production SHA is the live `/asset-manifest.json` source of truth.

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. Cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>`
cycle IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.
