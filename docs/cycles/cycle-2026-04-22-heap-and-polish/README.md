# cycle-2026-04-22-heap-and-polish — Plan

**Cycle ID:** `cycle-2026-04-22-heap-and-polish`
**Opened:** 2026-04-22 (intended for a morning-after autonomous session following the close of `cycle-2026-04-22-flight-rebuild-overnight`).
**Shape:** small polish cycle — 4 tasks across two sequential rounds. Autonomous-safe.

## Why this cycle exists

The prior cycle (`cycle-2026-04-22-flight-rebuild-overnight`, closed in commit `c7866bf`) landed the fixed-wing + airfield fixes but surfaced three follow-ups. Plus one user-reported visual issue escalated during cycle setup:

1. **Heap-recovery regression in combat120.** The post-Round-3 perf capture went from `heap_growth_mb` 9.5 → 53.2 MB and `heap_recovery_ratio` 0.88 → 0.12 vs the Round-0 baseline. The p99 frame-time gate (≤5%) is GREEN (+2.7%), so the cycle correctly did not block on this — but it is the single most important unknown left in the tree, and it showed up *after* thirteen simultaneous merges landed, so there is no bisect data. Root cause is a direct investigation.
2. **Helicopter PlayerController pose feed.** PR #124 fixed `FixedWingModel.ts:365` to feed interpolated pose to `PlayerController`. `HelicopterModel.ts:549` has the exact same raw-vs-interpolated bug against `state.position` and was flagged out-of-scope by the executor. The interpolated source (`helicopter.position`) is already in scope at line 534 of the same function.
3. **A-1 Skyraider altitude-hold recapture regression.** PR #126 (altitude-hold unification) engages the Airframe PD in normal flight, but its `±0.15` elevator clamp at `Airframe.ts:347-348` saturates for the Skyraider's high thrust-to-weight at cruise throttle. Recapture-after-pitch-release regressed 175m → 463m for A-1; F-4/AC-47 improved. Brief forbade gain retuning so the regression landed as a trade; now is the right time to fix the clamp per-aircraft.
4. **Clouds only visible in A Shau mode and look like "one tile above."** User-reported playtest observation (2026-04-22). Clouds ARE wired for every mode (`CloudLayer` instantiated unconditionally; `AtmosphereSystem.updateCloudLayer` runs every frame; every scenario preset sets a nonzero `cloudCoverageDefault`), but the fragment shader's threshold is punishing at low coverage (`lowerEdge = mix(1.0, -0.2, coverage)` → at coverage=0.1 almost nothing passes) and the 3-octave fbm at noise scale 1/900 produces a low-frequency cloud field. Openfrontier (0.1) and combat120 (0.2) read as empty sky; A Shau (0.4) is the only mode where clouds break past the threshold broadly enough to be legible. Three.js upgrade to 0.184 has landed (commit `7b74b3a`), so cloud shader work is no longer consult-only.

## Tasks in this cycle

Each has a brief at `docs/tasks/<slug>.md`.

- **Round 1 (solo, P0):** `heap-recovery-combat120-triage`
- **Round 2 (3 parallel, P1):**
  - `helicopter-interpolated-pose`
  - `a1-altitude-hold-elevator-clamp`
  - `cloud-audit-and-polish`

## Round schedule

```
Round 0 (orchestrator prep)
  -> Round 1 (1 task solo)
      -> Round 2 (3 tasks parallel)
```

No inter-task blocking within Round 2 (they touch disjoint subsystems: helicopter, airframe/configs, atmosphere/cloud).

## Round 0 (orchestrator prep)

1. `git fetch origin && git status` (must be clean; behind → fast-forward pull).
2. Reuse the Round-3 perf capture from the prior cycle as the heap baseline — it is the "as-merged" state. File: `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/perf-after-round3.json` (+ `perf-after-round3-validation.json`). No fresh capture required at Round 0.
3. Confirm baseline rehashed numbers for reference (for the RESULT summary): avg=14.21ms, p99=34.50ms, heap_growth=53.25MB, heap_recovery_ratio=0.12.
4. Create this cycle's `evidence/` dir (already present; leave empty).

## Concurrency cap

3 (only Round 2 has parallelism).

## Dependencies

```
Round 0
  -> heap-recovery-combat120-triage (solo)
      -> helicopter-interpolated-pose          ┐
      -> a1-altitude-hold-elevator-clamp       ├─ parallel (disjoint subsystems)
      -> cloud-audit-and-polish                ┘
```

Round 2 does NOT block on Round 1's fix landing; a diagnostic memo from Round 1 is sufficient to unblock Round 2.

## Playtest policy

DEFERRED. No playtest gate BLOCKS merge. Playtest-recommended PRs are flagged in RESULT.md.

## Perf policy

- **Baseline:** `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/perf-after-round3.json` (the as-merged state at cycle close).
- **Gate:** post-Round-2 `npm run perf:capture:combat120`. Two thresholds:
  - p99 frame time within 5% of baseline (same as prior cycle).
  - `heap_recovery_ratio` ≥ 0.5 (tighter than the default; this cycle's explicit purpose includes heap). If the triage task lands a fix, expect recovery back toward the pre-cycle baseline of 0.88. If it's memo-only, this gate may still fail — that is acceptable; record in RESULT.md.

## Failure handling (autonomous-safe)

Same as the prior cycle:
- CI red on a task → mark `blocked`, record, continue.
- Fence-change proposal (`fence_change: yes`) → mark `blocked`, record, DO NOT merge.
- Probe-assertion fail post-merge → revert if possible; otherwise `rolled-back-pending` in RESULT.md.

## Visual checkpoints (orchestrator-gated)

NONE. Autonomous run.

## skip-confirm

YES. Orchestrator does NOT pause between rounds.

## Cycle-specific notes

- `heap-recovery-combat120-triage` is an investigative P0: the executor may deliver EITHER a targeted code fix OR a diagnostic memo at `docs/rearch/HEAP_RECOVERY_COMBAT120_TRIAGE.md`. Pick the higher-confidence option. A memo is not a failure; it unblocks a future targeted fix with the bisect data in hand.
- `helicopter-interpolated-pose` mirrors PR #124. Executor should keep the diff tight (≤100 LOC) and copy the `FixedWingModel.test.ts` behavior-test pattern (L2 + L3) for the helicopter side.
- `a1-altitude-hold-elevator-clamp` should add a per-aircraft `altitudeHoldElevatorClamp` to `FixedWingConfigs.ts` (default 0.15, A-1 at 0.30-0.35 based on probe). Widen the clamp at `Airframe.ts:347-348` to read from config instead of the literal.
- `cloud-audit-and-polish` is both investigation AND tuning. Executor takes before/after screenshots of the sky across all five modes, diagnoses the preliminary hypothesis (low coverage defaults + punishing threshold make clouds invisible outside A Shau), lands shader + preset tuning. Escape hatch: if screenshots reveal the bug is architectural (e.g., `CloudLayer` not in scene for some modes), memo-only and STOP. Three.js upgrade to 0.184 has landed, so shader work is no longer blocked on a parallel upgrade.
- 2026-04-24 recovery caveat: this cycle brief is historical. Current evidence in `docs/ATMOSPHERE.md` / `docs/STATE_OF_REPO.md` says the cloud system is validated in all five modes through sky-dome clouds after preview builds began emitting `asset-manifest.json`. The old `CloudLayer` plane is hidden. A Shau no longer uses the removed TileCache fallback path; static-tiled route/NPC quality still needs a real nav gate.
- Helicopter must not regress (scope touches HelicopterModel.ts). Reviewer rules per `docs/AGENT_ORCHESTRATION.md` do not trigger for any of these tasks — no file under `src/systems/combat/**`, `src/systems/terrain/**`, or `src/systems/navigation/**` is modified (the cloud task touches `src/systems/environment/**`).

## Post-cycle ritual

Standard (per `docs/AGENT_ORCHESTRATION.md` "Cycle lifecycle"):
1. `git mv docs/tasks/<slug>.md docs/tasks/archive/cycle-2026-04-22-heap-and-polish/<slug>.md` for each merged brief.
2. Append `## Recently Completed (cycle-2026-04-22-heap-and-polish, <date>)` to `docs/BACKLOG.md`.
3. Reset "Current cycle" in `docs/AGENT_ORCHESTRATION.md` to the empty stub.
4. Write `docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md`.
5. Commit as `docs: close cycle-2026-04-22-heap-and-polish`.
