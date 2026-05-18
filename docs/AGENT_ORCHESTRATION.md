# Agent Orchestration — Runbook

Last verified: 2026-05-18 (autonomous chain advanced past cycle #11; cycles #1-#11 closed at fd646aeb / 7931d179 / b86cf027 / 73e777cb / f14400d2 / 78c9c55a / cycle #7 close-commit / cycle #8 close-commit / cycle #9 close-commit / cycle #10 close-commit / cycle #11 close-commit; current cycle = cycle-sun-and-atmosphere-overhaul)

This file is the master runbook for multi-agent cycles in this repo. It has
three parts:

1. **Operating model + dispatch / merge patterns.** Durable across cycles.
2. **Cycle lifecycle.** Conventions for task IDs, cycle IDs, and the
   end-of-cycle ritual. Durable across cycles.
3. **Current cycle.** Reset every cycle. Past cycles live in
   `docs/BACKLOG.md` "Recently Completed" and their briefs under
   `docs/tasks/archive/<cycle-id>/`.

If you are the orchestrator, read this file top to bottom. If you are an
executor, read only the task brief the orchestrator hands you plus the required
reading inside it.

## Operating model

- **The main Claude Code session plays the orchestrator role.** Subagents
  cannot reliably spawn further subagents in this harness (they do not receive
  an `Agent` tool regardless of what frontmatter claims). The 2026-04-17
  drift-correction run worked because the main session WAS the orchestrator.
  Do not try to spawn an "orchestrator" subagent — the run will deadlock at
  dispatch.
- **Executors are subagents.** Each is spawned with
  `subagent_type="executor"`, `isolation="worktree"`, and the full task-brief
  contents as the prompt.
- **Reviewers are subagents.** `combat-reviewer` on PRs touching
  `src/systems/combat/**`, `terrain-nav-reviewer` on PRs touching terrain or
  nav paths.
- **Perf analyst is a subagent.** Run after each round to diff perf vs
  baseline.
- **Concurrency cap:** default 5 parallel executors. The current cycle can
  override.

## Cycle lifecycle

The project runs multi-task cycles through this runbook. The cycle-specific
section (below) is reset at the start of every cycle; the rest of this file
is durable across cycles.

**Task IDs are descriptive slugs, not phase letters.** Use
`plane-test-harness`, not `A1`. Phase letters were retired on 2026-04-18
after two consecutive cycles claimed fresh A/B/C prefixes and queued a
`D1` for the next one — linear, and the alphabet doesn't scale. A cycle
can have as many tasks as its DAG requires without running out of letters.

**Cycle IDs are dated slugs.** Format: `cycle-YYYY-MM-DD-<slug>`, e.g.
`cycle-2026-04-18-rebuild-foundation`. The cycle ID is the archive
subfolder name and the section header in `docs/BACKLOG.md` when the cycle
closes.

**Branches follow the slug.** `task/<slug>`, no letter prefix. Commit
first-line format: `<type>(<scope>): <summary> (<slug>)`.

**Dependencies** are declared via `addBlockedBy` on task slugs inside the
current cycle's DAG (see the "Dependencies" subsection of "Current cycle").

### Cycle-name stoplist (Phase 0 rule, enforced by `scripts/cycle-validate.ts`)

New cycle slugs **cannot** contain any of these substrings: `polish`,
`cleanup`, `drift-correction`, `stabilization-reset`, `debug-cleanup`,
`housekeeping`, `tidy`, `chore-only`. Each cycle must close one
user-observable gap or feature; doctor-doc work happens inside a feature
cycle, not as its own. Run `npx tsx scripts/cycle-validate.ts <slug>` before
seeding a new cycle to verify.

### Carry-over discipline

`docs/CARRY_OVERS.md` is the single source of truth for unresolved items.
At cycle close, the orchestrator measures active count vs. cycle-start. If
the count grew, the cycle is **INCOMPLETE**; the cycle ID is reused with a
`-2` suffix until the count holds or shrinks. Carry-overs open ≥5 cycles are
red-flagged and must be named in the next cycle's plan.

### Campaign auto-advance (Phase 0 + realignment plan, 2026-05-09)

A **campaign** is an ordered sequence of cycles queued in
[docs/archive/CAMPAIGN_2026-05-09.md](archive/CAMPAIGN_2026-05-09.md). When the active
campaign declares `auto-advance: yes`, the orchestrator chains cycles
without human input:

1. Run the current cycle's dispatch loop normally.
2. At end-of-cycle, run the ritual (move briefs, append BACKLOG, refresh
   `docs/CARRY_OVERS.md` via `npm run check:cycle -- <slug> --close`).
3. Read the campaign manifest. If a `next-cycle` is queued and not
   gated by a hard-stop, update this file's "Current cycle" section to
   point at the next cycle's brief and **continue without prompting**.
4. Hard-stops still surface and halt the campaign:
   - Fence-change proposal in any executor report
   - >2 CI red or blocked tasks in a single round
   - Perf regression >5% p99 on `combat120` after any round
   - Carry-over count grew during a cycle (cycle becomes INCOMPLETE; campaign halts)
   - Any executor reports `isolation=worktree` failure
5. Hard-stops surface as: print the failure summary, set "Current cycle"
   in this file to the **failed** cycle (with status `INCOMPLETE` /
   `BLOCKED`), and halt. The human resumes the campaign manually.

Without `auto-advance: yes`, the orchestrator stops after each cycle close
and waits for the next `/orchestrate` invocation. That's the legacy
single-cycle pattern.

### Autonomous-loop posture (2026-05-16, `/goal`-aligned runs)

When the campaign manifest declares **both** `auto-advance: yes` **and**
`posture: autonomous-loop`, the orchestrator runs as an unattended
all-night loop. Per-cycle playtest-required gates become deferred
(not blocking) so the owner can walk through them after the campaign
completes.

Overrides under `posture: autonomous-loop`:

1. **Owner-playtest tasks become Playwright smoke + screenshot capture.**
   The executor runs the feature's golden-path smoke, commits
   screenshots to `artifacts/cycle-<slug>/playtest-evidence/`, and
   writes a `docs/playtests/<slug>.md` memo flagged "automated smoke;
   owner walk-through pending."
2. **"Owner playtest rejects twice → halt" hard-stops are removed.**
   Replaced by "Playwright smoke errors twice → halt" (true
   automation signal only).
3. **"Real-device validation infeasible → halt" becomes a documented
   limitation, NOT a hard stop.** Merge proceeds on CI green +
   reviewer APPROVE. The cycle's close memo and
   [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) get the deferral
   note.
4. **The orchestrator appends to
   [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md)** at every cycle
   close that had a playtest task, listing what the owner should
   walk through post-campaign.
5. **Cycle-close commits append `(playtest-deferred)`** to the subject
   line when the cycle had playtest gates, so `git log` makes
   deferred items easy to grep.

The true hard-stops (fence change, >2 CI red, perf regression > 5%
p99, carry-over growth, worktree failure, twice-rejected reviewer)
still halt the autonomous loop and surface to the human.

To exit `posture: autonomous-loop` mid-campaign: edit the campaign
manifest and remove the `posture: autonomous-loop` line (or flip
`auto-advance: yes` → `PAUSED`). The orchestrator finishes the
in-flight cycle and stops.

**End-of-cycle ritual** (run as the last orchestrator action, or as a
standalone bookkeeping pass):

1. Move each merged brief from `docs/tasks/<slug>.md` →
   `docs/tasks/archive/<cycle-id>/<slug>.md`.
2. Append a `## Recently Completed (<cycle-id>)` section to
   `docs/BACKLOG.md` with PR list, one-line summaries, and follow-ups.
3. Reset the "Current cycle" section below to the empty stub.
4. Commit with message `docs: close <cycle-id>`.

The stub template under "Current cycle" is what the next cycle fills in.

## Current cycle: cycle-sun-and-atmosphere-overhaul

**Cycle ID:** `cycle-sun-and-atmosphere-overhaul`
**Brief:** [docs/tasks/cycle-sun-and-atmosphere-overhaul.md](tasks/cycle-sun-and-atmosphere-overhaul.md)
**Skip-confirm:** no (owner playtest required across 5 scenarios × 4 TOD; deferred under autonomous-loop posture)
**Concurrency cap:** 4

User-observable gap closed: KB-SKY-DEEP (new visual-quality follow-up
to cycle #1's KB-SKY-BLAND) + HosekWilkieSkyBackend half of
`konveyer-large-file-splits`. Port
`HosekWilkieSkyBackend.evaluateAnalytic` (CPU JS Preetham math
sampled per-fragment from a 256×128 LUT) into a **TSL fragment
node** wired to the dome via `MeshBasicNodeMaterial.colorNode`;
restore the per-fragment Preetham gradient + in-shader HDR sun-disc
the pre-merge GLSL had; retire the 256×128 visual LUT and keep only
a 32×8 CPU LUT for fog / hemisphere readers; swap renderer tonemap
from `THREE.ACESFilmicToneMapping` to `THREE.AgXToneMapping`
(`THREE.NeutralToneMapping` fallback on r184 if AGX unavailable);
fix the night-red bug via an elevation-keyed sun↔moon color blend at
the one-line cause in `HosekWilkieSkyBackend.bakeLUT()`;
recalibrate per-scenario `preset.exposure` for the AGX rolloff. No
new `WebGLRenderTarget` (preserves the cycle-voda-1 mobile no-RT
win). Source authority:
[docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md).

### Round schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `night-red-fix`, `agx-tonemap-swap`, `tsl-preetham-fragment-port` | 3 | Three independent landings. Night-red is ~10 LOC + tests; AGX is a ~5 LOC renderer change + dev-flag wiring; TSL port is the large one (~400-600 LOC TSL + parity test against CPU `evaluateAnalytic`). |
| 2 | `sun-disc-and-aureole-tuning`, `per-scenario-exposure-recalibration`, `sun-and-atmosphere-playtest-evidence` | 3 | Disc tuning composes with the in-shader HDR pin-point from R1; exposure tuning depends on AGX landing; playtest captures use the WorldBuilder force-TOD flow (5 scenarios × 4 TOD = 20 shots + WebGPU/WebGL2 parity + night-red regression). |

### Dependencies

- R1: `night-red-fix` (elevation-keyed `Color.lerpColors(sunColor, MOON_COLOR, smoothstep(−2°, −8°))` replaces peak-normalisation + luma-floor in `HosekWilkieSkyBackend.bakeLUT()`; isolated to lines 711-729),
  `agx-tonemap-swap` (`THREE.AgXToneMapping` at `GameRenderer.ts:145-146` with `THREE.NeutralToneMapping` r184 fallback; ACES remains runtime-toggleable via WorldBuilder for A/B),
  `tsl-preetham-fragment-port` (port `evaluateAnalytic` 761-874 to TSL `Fn` node graph; new `HosekWilkieTslNode.ts`; dome swaps to `MeshBasicNodeMaterial(colorNode: tslPreethamNode, toneMapped: false)`; CPU LUT shrinks to 32×8 for fog readers only; dev-flag back-out via `WorldBuilder.skyBackendMode = 'tsl' | 'lut-bake'`; TSL/CPU parity test < 0.05 per-channel delta at 64 sampled directions).
- R2: `sun-disc-and-aureole-tuning` (in-shader HDR pin-point defaults: 3-5° apparent diameter at noon, 6-10° aureole stretching to 15-30° mie band at low sun; additive `SunDiscMesh` sprite gated behind `WorldBuilder.useAdditiveSunSprite` flag default `false`),
  `per-scenario-exposure-recalibration` (sweep `forceTimeOfDay` across `[0.0, 0.25, 0.5, 0.75]` on each of the five scenarios; tune per-scenario `preset.exposure` to land within spike Section 4 HSL targets; bump `SKY_LIGHT_MAX_COMPONENT` / `SKY_FOG_MAX_COMPONENT` only if AGX range clips visibly),
  `sun-and-atmosphere-playtest-evidence` (5 scenarios × 4 TOD = 20 captures + WebGPU/WebGL2 parity pair + 5 night-red regression assertions on `moonLight.color` at midnight; `scripts/capture-sun-and-atmosphere-shots.ts` extends existing hosek-wilkie capture script; deferral row in PLAYTEST_PENDING).

### Reviewer policy

- **No mandatory `combat-reviewer`** — no `src/systems/combat/**` touches expected.
- **No mandatory `terrain-nav-reviewer`** — no `src/systems/terrain/**` or `src/systems/navigation/**` touches expected.
- Orchestrator reviews all PRs for: surface integrity (no fence leak), perf budget compliance, WebGPU/WebGL2 visual parity merge gate, mobile-ui CI matrix green.
- **Optional `perf-analyst` pre-merge gate** for `tsl-preetham-fragment-port` — given the per-fragment cost claim, compare `combat120` + `openfrontier:short` against baseline post-port before merge.

### Hard stops (cycle-specific)

- Any new `WebGLRenderTarget` introduced anywhere in the diff → halt (cycle-voda-1 mobile no-RT win is load-bearing).
- TSL → WebGL2 translation produces a fragment shader > 2× the hand-port op count → ship back-out path A (parallel `ShaderMaterial` GLSL gated on `!renderer.isWebGPURenderer`); do NOT halt unless the back-out also overshoots budget.
- Per-fragment dome adds > 1.0 ms p99 on `combat120` after R1 → halt; reassess with mobile-gated dev-flag fallback to the bake-and-stretch path.
- Visual parity WebGPU vs WebGL2 fails (> 5% per-channel delta at sampled key points: zenith, horizon-mid, sun-disc-center, anti-sun-horizon) at merge time → halt; iterate parallel GLSL until parity holds.
- Mobile-emulation perf probes (Pixel 5 23.68 avgFps, iPhone 12 28.30 avgFps from cycle #2) regress > 10% → halt; mobile-gate per-fragment dome behind `skyBackendMode='lut-bake'` default.
- Owner playtest rejects R2 twice → halt (deferred under autonomous-loop; orchestrator proceeds, owner sweeps later).
- Standard: fence change, worktree isolation failure, twice-rejected reviewer, carry-over count growth.

### Success criteria

See [docs/tasks/cycle-sun-and-atmosphere-overhaul.md](tasks/cycle-sun-and-atmosphere-overhaul.md)
"Acceptance Criteria (cycle close)":
- All R1 + R2 task PRs merged.
- `renderer.toneMapping === THREE.AgXToneMapping` (or `THREE.NeutralToneMapping` fallback) by default; ACES via WorldBuilder.
- Visual targets per time-of-day across all five scenarios hit spike Section 4 HSL ranges (noon cobalt zenith, golden-hour warm-cool stratification, dusk vermillion horizon, twilight "keeper red" vibe band with cool combat lighting, deep navy night with no red bleed, dawn mirror of dusk cooler-shifted).
- Night-red regression: `r < 0.5 * max(g, b)` on `moonLight.color` at midnight, all 5 scenarios.
- TSL/CPU parity test: < 0.05 per-channel delta at 64 sampled directions.
- WebGPU/WebGL2 parity: < 5% per-channel delta at sampled key points.
- `combat120` p99 ≤ 34.4 ms (current 33.4 ms + 1.0 ms budget).
- `openfrontier:short` p99 ≤ 33.7 ms (current 32.7 ms + 1.0 ms budget).
- 0 MB net new memory (32×8 LUT replaces 256×128 LUT).
- Mobile sky-refresh cadence unchanged at 8 s.
- No fence change. No new `WebGLRenderTarget`.
- `KB-SKY-DEEP` opens and closes within this cycle (zero-cycle visual-quality follow-up to KB-SKY-BLAND; history-log entry only).
- `konveyer-large-file-splits` HosekWilkieSkyBackend half moves Active → Closed (TSL port retires the 807-LOC grandfather entry; new modules each stay ≤ 700 LOC per Phase 0 file-size rule).

### Out of scope

Behind-cloud sun occlusion (cloud-fidelity carries to a later cycle). ADS-toward-sun glare gameplay feature (queue as follow-up). Sun-aware rim light / specular pass cross-cutting every material (queue as cycle #14 or later). Bruneton precomputed atmospheric scattering (rejected per cycle hard-stop on no-RT). HDR cubemap rotation (rejected per ~120 MB asset budget). Cloud representation / cloud-deck art direction (separate cycle). Touching `src/systems/combat/**`, `src/systems/terrain/**`, `src/systems/navigation/**`. Fenced-interface touches. Refactoring `HosekWilkieSkyBackend.ts` beyond what the TSL port + 32×8 LUT shrink necessitates (out-of-scope cleanup is a drift-correction signal).

### Campaign auto-advance protocol

This cycle is **position #12** in the 13-cycle queue at
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md).
`Auto-advance: yes` + `posture: autonomous-loop` are set there. When
this cycle closes:

1. Mark cycle #12 row `done` in the campaign queue table with close-commit SHA.
2. Read the next not-done row (`cycle-stabilizat-1-baselines-refresh`).
3. Mirror that cycle's brief content into this "Current cycle" section.
4. Commit with `docs(campaign): advance to cycle-stabilizat-1-baselines-refresh`.
5. Re-enter dispatch loop. Do NOT prompt the human.

Hard-stops flip `Auto-advance: yes` → `PAUSED` in the campaign manifest,
mark the failing cycle's row `BLOCKED`, and halt.

### Last closed cycle

`cycle-defekt-4-npc-route-quality` closed on 2026-05-18 at the cycle
close-commit. **3 PRs across R1/R2**; all three received
`terrain-nav-reviewer` APPROVE pre-merge. R1:
[#265](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/265)
`df84a870` npc-slope-stuck-recovery (new
`src/systems/navigation/SlopeStuckDetector.ts` +
`evaluateSlopeStuckRecovery` helper in `CombatantMovement.ts`;
`SLOPE_STALL_TIME_MS=1500` triggers a recovery state that yields to
gravity slide downhill via `SLOPE_SLIDE_STRENGTH=8.0` until on
walkable slope, then re-acquires pathing target; behavior tests
cover steep-slope transition within budget),
[#266](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/266)
`aac0e519` navmesh-crowd-reenable (Recast crowd surface re-enabled
as layered direction-only consumer via
`applyAgentSteeredDirection`; `MAX_CROWD_AGENTS=64`; high-LOD gated;
the prior disable was a structural unregister-every-tick at commit
`7487b693`, not a flag; scenario test catches regression if disable
is re-applied; perf inside the ≤2 ms additional per nav step
budget). R2:
[#267](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/267)
`4f505661` terrain-solver-stall-fix (wall-clock accumulator on
`(contourActivated && lowProgress)` crossing
`NPC_CONTOUR_STALL_REROUTE_MS=1200`; high-LOD only;
backtrack-suppressed via `movementBacktrackPoint` (not intent);
drops cached navmesh path so next tick re-queries; helper
`evaluateTerrainStallReroute` in `CombatantMovement.ts`; new
optional `Combatant.movementContourStallMs` field; behavior test
verifies A Shau valley traversal without stop-and-go). DEFEKT-4 in
`docs/CARRY_OVERS.md` moved Active → Closed. Carry-over count: 8 →
7. No fence change. No perf regression > 5% p99 on `combat120`.

Concurrent branch on the side: `task/mode-startup-terrain-spike`
remains parked at 1 commit (no PR). The cycle #2 mode-startup work
absorbed some of the synchronous-bake path concerns via the
asset-audio-defer + mobile-skip-npc-prewarm tasks; the spike's
terrain-bake-in-worker hardening criteria still live in
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).

## Dispatch protocol

For each round, in a single orchestrator turn:

1. Select the next batch per the round schedule (≤ concurrency cap).
2. Send one message with N parallel `Agent` calls:
   ```
   Agent(
     subagent_type="executor",
     isolation="worktree",
     description="<slug>",
     prompt="<full task-brief contents + slug + ground rules>"
   )
   ```
3. Mark each task `in_progress` with `TaskUpdate`.
4. When an executor returns:
   - Read the structured report.
   - If `fence_change: yes` → stop; surface to human.
   - If PR URL present but CI state unknown → poll
     `gh pr view <url> --json statusCheckRollup,mergeable` or stream via
     `Monitor` on `gh pr checks <url> --watch`.
5. On CI green:
   - **Reviewer runs BEFORE merge for combat / terrain-nav PRs (Phase 0
     change, 2026-05-09).** Spawn `combat-reviewer` if the diff touches
     `src/systems/combat/**`; spawn `terrain-nav-reviewer` if the diff
     touches `src/systems/terrain/**` or `src/systems/navigation/**`. CI
     green is necessary, not sufficient; the reviewer report must read
     APPROVE or APPROVE-WITH-NOTES before the merge step.
   - If reviewer returns CHANGES-REQUESTED: `TaskUpdate` to `in_progress`,
     re-dispatch the executor with the reviewer notes, do not merge.
   - On reviewer APPROVE / APPROVE-WITH-NOTES: merge via
     `gh pr merge <url> --rebase` (fast-forward preferred; fall back to
     `--merge` only if branch protection blocks rebase).
   - `TaskUpdate` to `completed` with the PR URL.
   - Advance any dependent tasks that just unblocked.
6. On CI red: `TaskUpdate` to `blocked`; do not retry.

## Merge protocol

- **Preferred:** rebase-merge via `gh pr merge --rebase`.
- **Fallback:** `--merge` if branch protection requires it.
- **Never:** force-push to master. Never squash without explicit instruction.
- **Branch cleanup:** `gh pr merge --rebase` auto-deletes the branch if
  configured; otherwise leave the branch, it's cheap.

## Reviewer invocation rules

- Combat PRs: touch any file under `src/systems/combat/**` or any test under
  `src/integration/**combat*` → `combat-reviewer`.
- Terrain / nav PRs: touch any file under `src/systems/terrain/**` or
  `src/systems/navigation/**` → `terrain-nav-reviewer`.
- The reviewer reads the diff, reports findings to the orchestrator. As of
  Phase 0 (2026-05-09), the reviewer **runs before merge and gates merge**
  for combat / terrain-nav PRs. Outcomes:
  - `APPROVE` → orchestrator merges.
  - `APPROVE-WITH-NOTES` → orchestrator merges; notes captured in cycle
    retro for follow-up.
  - `CHANGES-REQUESTED` → orchestrator re-dispatches the executor with the
    notes, does not merge.

## Ground rules for dispatched agents

Every task brief ends up in an executor prompt along with these:

1. Read `docs/TESTING.md` before writing tests. Behavior tests only.
2. Read `docs/INTERFACE_FENCE.md` before touching
   `src/types/SystemInterfaces.ts`. Any proposed fence change → stop and
   surface.
3. Small diffs. If you pass ~500 lines net and you are not deleting retired
   code (B1 is the one task that can go larger), stop and reassess.
4. Do not modify files outside the task's `Files touched` scope.
5. Verify locally before pushing: `npm run lint`, `npm run test:run`,
   `npm run build`. New rules as of Phase 0 (2026-05-09):
   - Files ≤700 LOC and ≤50 public methods (grandfathered exceptions
     listed in `eslint.config.js`).
   - New `src/systems/**/*.ts` requires a sibling `*.test.ts`.
   - PR description names a closed carry-over by ID (from
     `docs/CARRY_OVERS.md`) OR the user-observable gap shipped.
   - Touch to `src/types/SystemInterfaces.ts` requires `[interface-change]`
     in PR title and commit message; pre-flight via
     `npx tsx scripts/check-fence.ts`.
6. Branch: `task/<slug>`. Commit first line:
   `<type>(<scope>): <summary> (<slug>)`.
7. Never push to master directly.
8. Report back in the structured format from `.claude/agents/executor.md`.

## End-of-run summary format

Print this verbatim at cycle end, substituting the current cycle's values:

```
Cycle: <cycle-id>
Dates: <start> → <end>

Round 1: X/N merged | blocked | failed
Round 2: X/M merged
...

PR URLs:
  <slug>: <url>
  <slug>: <url>
  ...

Cycle-specific acceptance results (if any — e.g. integration-test before/after):
  <test name>: <before> → <after>

Perf deltas:
  combat120:
    p95: <ms> (Δ ±<%>)
    p99: <ms> (Δ ±<%>)
  <other-scenario>:
    p95: <ms> (Δ ±<%>)
    p99: <ms> (Δ ±<%>)

Playtest recommended: <slug>, <slug>, ...

Blocked / failed tasks:
  <slug>: <one-line cause>

Next cycle recommendation:
  <one-line>
```

## References

- Executor role spec: `.claude/agents/executor.md`
- Orchestrator playbook: `.claude/agents/orchestrator.md`
- Interface fence rules: `docs/INTERFACE_FENCE.md`
- Test contract: `docs/TESTING.md`
- Playtest checklist: `docs/PLAYTEST_CHECKLIST.md`
- Current backlog: `docs/BACKLOG.md`
- Past-cycle briefs: `docs/tasks/archive/<cycle-id>/`
- E-track spike memos (still referenced by Phase F candidates in the
  backlog): `origin/spike/E2-rendering-at-scale`,
  `spike/E3-combat-ai-paradigm`, `spike/E4-agent-player-api`,
  `spike/E5-deterministic-sim`, `spike/E6-vehicle-physics-rebuild`
