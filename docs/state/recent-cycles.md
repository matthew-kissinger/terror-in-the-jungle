# Recent Cycle Outcomes

Last verified: 2026-05-12

Last 3 cycles, summarized. Companion docs:

- [docs/state/CURRENT.md](CURRENT.md) — current truth
- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — active carry-over registry
- `docs/cycles/<cycle-id>/RESULT.md` — full retrospectives per cycle

For older cycle outcomes, browse `docs/cycles/` or
`docs/tasks/archive/<cycle-id>/`.

---

## konveyer-scene-parity-checkpoint-2026-05-12 (experimental, not deployed)

Checkpoint on `exp/konveyer-webgpu-migration`. Use the remote branch head as
branch truth for the next agent, not a frozen SHA in this doc. This is not a
production release and not a `master` merge approval.

**Current KONVEYER-10 progress:**

- Strict WebGPU scene/terrain/sky/water packet:
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`.
- Close-NPC materialization and startup compile packet:
  `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
- Multi-mode close-model reserve verification under strict WebGPU across
  Open Frontier, Zone Control, Team Deathmatch, combat120 (`ai_sandbox`),
  and A Shau Valley:
  `artifacts/perf/2026-05-12T01-50-01-495Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  and
  `artifacts/perf/2026-05-12T01-50-30-290Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
  Both runs resolve `webgpu` with zero console/page errors per mode; the
  parity ledger has the consolidated per-mode tables.
- Nearby NPC debug surface: dev/perf builds expose
  `window.npcMaterializationProfile(24)` for nearest NPC render mode, close-GLB
  weapon presence, and fallback reasons.
- Bounded spawn-residency reserve: Open Frontier strict WebGPU proof records
  11 nearby close GLBs, effective close cap 11, and zero fallback records for
  the nearest startup/review actors. Multi-mode evidence shows the +4 reserve
  activates per design when actors lie inside the 64m spawn-residency bubble
  (Zone Control +1, TDM +4, combat120 +4); combat120 still sees ~29-32
  candidates against the 12-slot cap, so cap policy is now a Phase F
  budget-arbiter decision rather than steady-state tuning.
- Phase F materialization-tier draft memo:
  `docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md`.
- Startup UI "Compiling features" is attributed to terrain feature work, mostly
  the 1024-grid stamped heightmap rebake, not WebGPU shader compilation.

**Still open:**

- Phase F materialization-tier policy and budget-arbiter slice: per-mode cap
  scaling, faction-balanced pool sizing, and silhouette/cluster render lanes
  for the 3,000-unit scale.
- A Shau finite-edge strategy using real outer source data, flight/camera
  boundary policy, or an explicit hybrid; A Shau also needs a directed
  player-warp or AI-convergence close-model probe so the front-line
  materialization path can be evidenced beyond the empty spawn pose.
- Cloud representation/art quality after the world/altitude anchoring slice.
- Water shader/intersections plus one interaction/buoyancy/swimming consumer.
- Principles-first renderer architecture review after hydrology/water and
  scoped migration/parity objectives are reviewed.

---

## konveyer-branch-review-2026-05-11 (experimental, not deployed)

Continuation on `exp/konveyer-webgpu-migration`. This is not production
release truth and does not authorize a `master` merge.

**Branch-review progress:**

- KONVEYER-0 through KONVEYER-9 are documented in
  `docs/rearch/KONVEYER_PARITY_2026-05-10.md`.
- Default and strict WebGPU resolve to real `webgpu` on headed hardware in
  `artifacts/perf/2026-05-11T00-40-14-309Z/konveyer-renderer-matrix/matrix.json`.
- The completion audit at
  `artifacts/perf/2026-05-11T02-10-59-661Z/konveyer-completion-audit/completion-audit.json`
  records active production render blockers at zero.
- The latest strict-WebGPU terrain visual packet accepts Open Frontier and
  A Shau terrain ground tone at
  `artifacts/perf/2026-05-11T02-00-18-828Z/projekt-143-terrain-visual-review/visual-review.json`.

**Follow-on cycle:** KONVEYER-10 - rest-of-scene parity and frame-budget
attribution. Terrain color is accepted for now; remaining work was
vegetation/NPC washout, atmosphere/sky/cloud behavior, `World` timing
decomposition, skyward triangle attribution, finite-map edge presentation,
cross-browser/mobile proof, and A Shau perf acceptance.

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
