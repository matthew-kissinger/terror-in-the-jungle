# Recent Cycle Outcomes

Last verified: 2026-05-09

Last 3 cycles, summarized. Companion docs:

- [docs/state/CURRENT.md](CURRENT.md) — current truth
- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — active carry-over registry
- `docs/cycles/<cycle-id>/RESULT.md` — full retrospectives per cycle

For older cycle outcomes, browse `docs/cycles/` or
`docs/tasks/archive/<cycle-id>/`.

---

## cycle-2026-05-09-phase-0-foundation (in review)

Foundation cycle of the 12-week realignment plan
(`C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md`).
Deliberately no game-code changes; engine-side wiring of WorldBuilder
god-mode flags is filed for Phase 1.

**Shipped:**

- Durable rules layer: max-LOC + max-method lint with grandfather list,
  doc date-header lint, fenced-interface pre-flight, banned cycle-name
  keywords, reviewer-pre-merge gate, scenario smoke screenshot gate,
  artifact-prune retention.
- WorldBuilder dev console (`Shift+G`) as an isolation/validation tool.

**Spawned carry-overs (6, all Phase 1 wiring tasks):**

- worldbuilder-invulnerable-wiring
- worldbuilder-infinite-ammo-wiring
- worldbuilder-noclip-wiring
- worldbuilder-postprocess-wiring
- worldbuilder-tod-wiring
- worldbuilder-ambient-audio-wiring

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

## cycle-2026-05-08-stabilizat-2-closeout (closed 2026-05-08)

Six themed PRs (helicopter rotor axis, water audits, terrain+effects, UX
respawn, combat AI/squad/core mega-cluster with documented GOST-TIJ-001
exception, docs + audit script catalog) shepherded the codex agent's
143-file working tree to `master`.

**Live release verified** at SHA
`babae19a76e5ff622976a632e10f7055315d2698` on
`https://terror-in-the-jungle.pages.dev` (live-release-proof 7/7 PASS).
Codex revision 1.3 — 2026-05-08, Politburo seal applied for STABILIZAT-2/3,
SVYAZ-1, SVYAZ-2, UX-1.

**Carry-over outcomes:**

- STABILIZAT-1 deferred to Strategic Reserve under Politburo direction
  (still active in [docs/CARRY_OVERS.md](../CARRY_OVERS.md)).
- AVIATSIYA-1 / DEFEKT-5 source evidence complete; human visual review
  remains pending.
- DEFEKT-2 14-day live drift watch active from T+0 = 2026-05-08.
- KB-LOAD residual (Pixel Forge vegetation candidate import) opened as
  Strategic Reserve.

Cycle retrospective:
`docs/cycles/cycle-2026-05-08-stabilizat-2-closeout/RESULT.md`.

---

## Reading the cycle history

The release path through this period was: local validation → commit to
`master` → push to `origin/master` → GitHub CI → manual Cloudflare Pages
deploy via `deploy.yml` → live Pages/R2/browser verification via
`check:projekt-143-live-release-proof`. Exact production SHA is the live
`/asset-manifest.json` source of truth.

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. Cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>`
cycle IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.
