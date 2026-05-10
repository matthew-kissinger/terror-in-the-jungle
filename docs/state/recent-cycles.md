# Recent Cycle Outcomes

Last verified: 2026-05-10

Last 3 cycles, summarized. Companion docs:

- [docs/state/CURRENT.md](CURRENT.md) — current truth
- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — active carry-over registry
- `docs/cycles/<cycle-id>/RESULT.md` — full retrospectives per cycle

For older cycle outcomes, browse `docs/cycles/` or
`docs/tasks/archive/<cycle-id>/`.

---

## release-stewardship-2026-05-10 (in release validation)

Continuation pass after Phase 2 and Phase 2.4 were merged. This is not a
normal cycle record, but it is the current release truth until the next formal
cycle closes.

**Shipped locally before final push/deploy:**

- CDLOD two-sided skirt-wall hardening for the white terrain crack report.
- M151 world-feature placements register as `ground` vehicles with seats.
- SVYAZ-3 radio shell first slice is on `master`.
- PostCSS resolves to 8.5.14; `_headers`, `robots.txt`, meta description,
  and preload cleanup are ready for deploy.
- Cover-query TTL cache first slice is behavior-green but combat120 still
  fails `perf:compare`; DEFEKT-3/STABILIZAT-1 stay open.

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
