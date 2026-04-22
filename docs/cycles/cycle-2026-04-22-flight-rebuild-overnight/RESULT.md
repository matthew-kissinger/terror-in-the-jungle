# cycle-2026-04-22-flight-rebuild-overnight — RESULT

```
Cycle: cycle-2026-04-22-flight-rebuild-overnight
Dates: 2026-04-22 (single overnight session)

Round 0: baseline captured (probe + perf:capture:combat120) | committed master c556e34
Round 1: 5/5 merged
Round 2: 3/3 merged
Round 3: 4/4 merged | navmesh + heightmap regen committed master 614dc76
Round 4: 1/1 merged

PR URLs:
  aircraft-building-collision:           https://github.com/matthew-kissinger/terror-in-the-jungle/pull/122
  airframe-directional-fallback:         https://github.com/matthew-kissinger/terror-in-the-jungle/pull/123
  player-controller-interpolated-pose:   https://github.com/matthew-kissinger/terror-in-the-jungle/pull/124
  airframe-ground-rolling-model:         https://github.com/matthew-kissinger/terror-in-the-jungle/pull/125
  airframe-altitude-hold-unification:    https://github.com/matthew-kissinger/terror-in-the-jungle/pull/126
  airframe-authority-scale-floor:        https://github.com/matthew-kissinger/terror-in-the-jungle/pull/127
  airframe-climb-rate-pitch-damper:      https://github.com/matthew-kissinger/terror-in-the-jungle/pull/128
  airframe-soft-alpha-protection:        https://github.com/matthew-kissinger/terror-in-the-jungle/pull/129
  airfield-prop-footprint-sampling:      https://github.com/matthew-kissinger/terror-in-the-jungle/pull/130
  airfield-perimeter-inside-envelope:    https://github.com/matthew-kissinger/terror-in-the-jungle/pull/131
  airfield-envelope-ramp-softening:      https://github.com/matthew-kissinger/terror-in-the-jungle/pull/132
  airfield-taxiway-widening:             https://github.com/matthew-kissinger/terror-in-the-jungle/pull/133
  continuous-contact-contract-memo:      https://github.com/matthew-kissinger/terror-in-the-jungle/pull/134

Cycle-specific acceptance results:
  Probe (A-1, F-4, AC-47 takeoffs from main_airbase): all three "success: yes" before AND after the cycle. liftoff/climb/finalAlt within expected envelopes per `baseline/probe-before.json`. Behaviour deltas:
    - PR #124 pose-continuity at 144Hz render: 141 zero-delta frames -> 0 zero-delta frames; relStddev 1.19 -> 0.03 over 240 samples.
    - PR #128 climb vs RMS oscillation: -60% peak-to-peak (full-throttle hands-off climb).
    - PR #129 alpha-protection oscillation: -60%+ peak-to-peak (full aft stick at stall).
    - PR #130 perimeter-structure foundation clearance: < 0.3m at all corners.
    - PR #131 perimeter placement: every perimeter struct now lands inside `innerLateral` clamp (us_airbase 240m radius vs innerLateral 289m; forward_strip 160m -> clamped at 132m vs innerLateral 140m).

Perf deltas (combat120 vs baseline):
  combat120:
    avg:   13.91ms -> 14.21ms (+2.2%)
    p99:   33.60ms -> 34.50ms (+2.7%)   *** within 5% budget ***
    max:   46.80ms -> 52.10ms (+11.3%)  one-frame outlier; hitch_50ms = 0.03% (2/6460 frames)
    over_budget: 0.07% -> 0.11%
    heap_growth_mb:       9.49 -> 53.25  ⚠️
    heap_peak_growth_mb: 78.56 -> 60.61  (lower peak, but worse end-state)
    heap_recovery_ratio: 0.879 -> 0.122  ⚠️ validation `overall: fail` driven by this check

  Note: validation.json `overall: fail` is from `heap_recovery_ratio`, NOT from p99 frame time. Cycle perf policy explicitly only gates on p99 frame time within 5% — that gate is GREEN. Heap regression is flagged for morning review.

Playtest recommended:
  - airframe-directional-fallback (PR #123): executor noted the synthetic L3 ramp is the tightest headless equivalent; a manual A-1 / F-4 / AC-47 takeoff over rising terrain at main_airbase would close the loop.
  - airframe-altitude-hold-unification (PR #126): A-1 Skyraider recapture-after-pitch-release regresses 175m -> 463m at cruise throttle; baseline was already failing on Skyraider, so this is a net win for F-4 / AC-47 but worth a manual cruise check.
  - airframe-soft-alpha-protection (PR #129): tanh roll-off was probe-validated; manual full-aft-stick climb confirms the change felt, not just measured.
  - airframe-ground-rolling-model (PR #125): structural change to the most-tuned subsystem; manual takeoff feel evaluation strongly recommended before relying in a longer playtest.

Blocked / failed tasks: NONE.

Manual orchestrator interventions:
  - PR #129 (`airframe-soft-alpha-protection`): executor stopped one tool-call short of `git push`. Worktree state was complete; orchestrator ran lint/test/build (PASS), committed, pushed, opened PR. No content changes.
  - PR #131 (`airfield-perimeter-inside-envelope`): rebase conflict in `AirfieldLayoutGenerator.test.ts` after PR #130 merged (both added new `it()` blocks to the same `describe`). Orchestrator kept both tests in the rebase resolution, re-ran lint/test/build (3638 PASS), force-pushed.

Direct-to-master commits (orchestrator-prep + chores):
  - c556e34 chore(cycle-2026-04-22): capture Round 0 baselines (probe + perf JSON) — explicit cycle Round 0 instruction.
  - 614dc76 chore(assets): regenerate OF heightmaps + navmesh after airfield envelope changes — flagged by terrain-nav-reviewer post-PR-132. ZC and TDM bakes regenerated identically (no diff).

Reviewers spawned:
  - combat-reviewer on PR #122 (LOSAccelerator additive registration): merge.
  - terrain-nav-reviewer on PRs #131 + #132 (TerrainFeatureCompiler envelope changes): merge both, regen flagged for OF heightmaps + navmesh, ZC/TDM unaffected.

Follow-ups for next cycle (priority-ordered):
  1. ⚠️ Investigate combat120 heap regression: end-growth 9MB -> 53MB and recovery 88% -> 12%. Suspects: NPC stalls + AI budget starvation events (4.07/sample, was 0). Could be Round 1-3 changes or the regenerated navmesh.
  2. HelicopterModel.ts:549 has the same raw-vs-interpolated `PlayerController` feed that PR #124 fixed for fixed-wing. Mechanical port.
  3. A-1 Skyraider altitude-hold recapture regression at cruise throttle (PR #126 trade-off). Brief explicitly forbade gain retuning; future task should expand the ±0.15 elevator clamp for the Skyraider (or per-aircraft).
  4. Implementation cycle for `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md` (PR #134). Author estimates ~6 tasks, most parallelizable, gated on the BVH registry being introduced first. Awaits human review.
  5. AC-47 low-pitch takeoff still single-bounces (carried over from cycle-2026-04-21).

Next cycle recommendation:
  Open a small triage cycle for the heap-recovery regression first. The flight-feel changes are now in master and worth a single human playtest pass before stacking another change cycle on top. The contact-contract memo is the right anchor for the cycle after that.
```
