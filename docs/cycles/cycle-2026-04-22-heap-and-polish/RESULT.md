# cycle-2026-04-22-heap-and-polish — RESULT

```
Cycle: cycle-2026-04-22-heap-and-polish
Dates: 2026-04-22 (single autonomous session)

Round 1: 1/1 merged
Round 2: 3/3 merged

PR URLs:
  heap-recovery-combat120-triage:    https://github.com/matthew-kissinger/terror-in-the-jungle/pull/135
  helicopter-interpolated-pose:      https://github.com/matthew-kissinger/terror-in-the-jungle/pull/136
  a1-altitude-hold-elevator-clamp:   https://github.com/matthew-kissinger/terror-in-the-jungle/pull/137
  cloud-audit-and-polish:            https://github.com/matthew-kissinger/terror-in-the-jungle/pull/138

Cycle-specific acceptance results:
  - PR #135 (triage memo): Four independent combat120 captures (2 on post-prior-cycle HEAD a69cd1f, 1 on pre-cycle seed 88e3d35, 1 on this-cycle HEAD 7130564) all land inside baseline envelope. heap_growth_mb range: -1.86 to +19.39. heap_recovery_ratio range: 0.620 to 1.039. ai_budget_starvation range: 0.36 to 3.07/sample. The 53.25 MB / 0.122 / 4.07 Round-3-close numbers are the outlier; root cause attributed to orchestrator-session host pressure (executor's Hypothesis 5). No code fix landed.
  - PR #136 (helicopter pose): 144Hz pose-continuity probe reproduced the fixed-wing precedent's 141 -> 0 zero-delta frames. Three migrated call sites (playerController / weaponSystem / doorGunner). state.isGrounded correctly stayed raw.
  - PR #137 (A-1 elevator clamp): Probe sweep contradicted the brief's suggested 0.30-0.40 range — 0.30+ induced dive-and-not-recover divergence, not saturation. Stable band was 0.20-0.24; landed 0.22. Root-cause diagnosis in the brief ("clamp saturation") was wrong; the observed behavior is gain instability at the wider clamp. Per-aircraft field solves it regardless: F-4/AC-47 stay at 0.15; A-1 tightens to 0.22 and recaptures within 100m.
  - PR #138 (cloud audit): Before-screenshots confirmed the coverage-threshold diagnosis qualitatively. Shader bumped to 5-octave fbm with widened threshold, soft large-scale modulator (floor at 0.5 + 0.5*smoothstep to prevent clear-hole regression seen in first iteration), animated drift. Per-scenario coverage rebalanced; all five modes show visible cumulus in after-screenshots. `perf:capture:combat120` did not boot in the executor's worktree (stuck `menu_ready`); post-merge perf-analyst capture at master HEAD booted fine and showed no measurable frame cost.

Perf deltas (combat120 at HEAD 7130564 vs inherited baseline
docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/perf-after-round3.json):
  combat120:
    avg:                       14.21ms -> 14.04ms (-1.20%)
    p99 (peak per-sample):     34.50ms -> 33.80ms (-2.03%)  *** within 5% budget ***
    p95 (peak per-sample):     32.90ms -> 32.50ms (-1.22%)
    max frame:                 52.10ms -> 46.50ms (-10.75%)
    heap_growth_mb:            +53.25  -> -1.86   (net shrink)
    heap_peak_growth_mb:        60.61  -> 47.41  (-13.20 MB)
    heap_recovery_ratio:        0.122  -> 1.039  *** clears >=0.5 gate ***
    ai_budget_starvation:      4.07/sample -> 3.07/sample (-24.59%)
    over_budget_pct:            0.11% ->  0.10%
    hitch_50ms_pct:             0.031% -> 0.000%

  Gate result: both thresholds GREEN (p99 inside 5% envelope; heap_recovery_ratio well above 0.5).
  All metrics either improved or held flat. The heap regression did not re-materialize post-merge;
  with four independent healthy samples, the Round-3-close capture stands as a tooling artifact,
  not a persistent code issue.

Playtest recommended:
  - helicopter-interpolated-pose (PR #136): 144Hz probe probe-validated, but manual helicopter
    cruise / pedal-turn / fast-weave at high monitor refresh rate would close the loop against the
    tick-back-and-forth the fix targets.
  - a1-altitude-hold-elevator-clamp (PR #137): 0.22 clamp is probe-validated for
    recapture-after-pitch-release but narrower than the brief anticipated; a manual A-1 cruise +
    pitch-pulse + hands-off trace would confirm the feel in production scenarios.
  - cloud-audit-and-polish (PR #138): after-screenshots captured via standalone harness;
    a manual in-game pass across openfrontier / combat120 / zc / tdm (ashau is the known-good
    baseline) at default spawn framing would confirm the shader change reads the same in-gameplay
    as it does in harness renders.

Blocked / failed tasks: NONE.

Manual orchestrator interventions: NONE. Four executors, four clean branches, four clean merges.

Direct-to-master commits: NONE.

Reviewers spawned: NONE.
  Rationale: the four merged tasks touched src/systems/helicopter/**,
  src/systems/vehicle/airframe/** + src/systems/vehicle/FixedWingConfigs, and
  src/systems/environment/**. No file under src/systems/combat/**, src/integration/**combat*,
  src/systems/terrain/**, or src/systems/navigation/** was modified, so combat-reviewer and
  terrain-nav-reviewer did not trigger (cycle-specific rule, documented in README).

Follow-ups for next cycle (priority-ordered):
  1. Baseline calibration: the inherited "after-round3" baseline is itself an outlier. When the
     next cycle opens, run a fresh combat120 capture and treat that as the real reference; the
     current perf-baselines.json thresholds were tuned against a healthy baseline and the gap
     between inherited-baseline and fresh-capture should close naturally.
  2. Shader cost verification on a sky-dominated scenario: combat120 is ai_sandbox-framed and may
     under-sample the cloud plane's pixel budget. An openfrontier:short or ashau:short capture
     would give a sharper read on the 5-octave fbm + large-scale modulator's fragment cost.
  3. A-1 altitude-hold root-cause: the per-aircraft clamp closes the recapture symptom, but the
     underlying behavior (0.30+ elevator authority destabilizing the A-1's altitude PD rather
     than saturating) says the PD gains themselves are the long-term problem, not the clamp
     ceiling. When `CONTINUOUS_CONTACT_CONTRACT` or another flight cycle opens, a Skyraider-
     specific gain pass is the right follow-up.
  4. AC-47 low-pitch takeoff still single-bounces (carried over from cycle-2026-04-21 and cycle-2026-04-22-flight-rebuild-overnight).
  5. Helicopter parity for HelicopterVehicleAdapter / HelicopterPlayerAdapter: the brief flagged
     these as out-of-scope audit targets; the helicopter executor did not report finding a
     raw-feed bug, but a dedicated pass alongside the rotor/audio systems remains open.
  6. CloudLayer perf on a sky-dominated scenario is TBD (see point 2). If fragment cost
     materializes there, the adaptive lever is `cloudScaleMetersPerFeature` (bigger features =
     fewer texture taps per fragment).

Next cycle recommendation:
  No urgent code follow-ups; this was a clean polish cycle. Open questions are calibration
  (baseline refresh) and a manual playtest pass to confirm the three feel-adjacent changes
  (helicopter pose, A-1 clamp, cloud look) read correctly in-gameplay. Good moment for a human
  playtest session before stacking more change cycles.
```
