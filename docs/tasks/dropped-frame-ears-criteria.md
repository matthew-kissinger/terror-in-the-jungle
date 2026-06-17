# Dropped-Frame EARS Criteria

Draft scaffold for STABILIZAT-4. Use this to keep future agent loops pointed at
the same finish line. These criteria are intentionally quantitative where the
repo already has a sensor, and explicitly marked as owner-alignment where the
threshold still needs human judgement.

EARS key:
- Ubiquitous: always true.
- Event-driven: when a trigger happens, the system must respond.
- State-driven: while a state is active, the system must hold an invariant.
- Unwanted behavior: if a bad condition occurs, the system must handle it.
- Complex: combines trigger and state.

## Completion Lane

Unless the owner explicitly changes this, a completion candidate means all of:

- Scenario set: Open Frontier and A Shau.
- Capture shape: headed, WebGPU, quiet-machine attested, seeded, default
  representative content, active combat.
- No content-reduction flags: no disabled wildlife, no disabled terrain
  shadows, no disabled terrain skirts, no reduced vegetation density, no
  reduced draw distance, no weakened combat, no shortened terrain, no
  frontline compression, and no diagnostic-only bypasses.
- Required artifacts: `summary.json`, `validation.json`,
  `presentation-epochs.json`, browser stall entries when present,
  render-submission samples when present, final frame, and driver final state.
- Release proof after local pass: `npm run validate:fast`, relevant perf/full
  evidence, merge/shepherd to `master`, exact-head CI, deploy, live release
  verification, and owner playtest for visual/game-feel acceptance.

Executable scaffold:

- Run `npm run check:dropped-frame-ears -- --dir artifacts/perf/<a-shau-capture> --dir artifacts/perf/<open-frontier-capture> --strict`
  before calling a dropped-frame candidate complete.
- Preferred local capture commands for the completion lane are
  `npm run perf:capture:ashau:ears` and
  `npm run perf:capture:openfrontier:ears`. They force headed strict WebGPU,
  render-submission attribution, and `--compress-frontline false`.
- Without `--dir`, the checker evaluates the latest `artifacts/perf/*`
  capture only. That is useful for triage but cannot pass the completion lane
  unless the required Open Frontier + A Shau artifact pair is supplied.
- The checker intentionally rejects content-reduction flags and classifies
  failed trust, WebGPU fallback, missing real combat, missing required files,
  failed rAF gates, and harness-equivalence warnings as diagnostic rather than
  completion evidence.
- A passing checker result is still local artifact proof only. Owner playtest,
  terrain/camera visual acceptance, exact-head CI, deploy, and
  `check:live-release` remain required before production completion.

## EARS Requirements

| id | kind | EARS statement | Quantitative pass signal | Evidence |
|---|---|---|---|---|
| ST4-PERF-001 | Ubiquitous | The game shall reduce player-visible dropped-frame time without making Open Frontier or A Shau smaller, emptier, less alive, less visible, or less stressful. | Both required scenarios pass the rAF and dropped-frame gates with default representative content. | `summary.json`, `validation.json`, final frame, owner playtest |
| ST4-PERF-002 | Complex | When running a completion-lane capture while the machine is quiet, the harness shall accept the run only if measurement trust passes. | `measurementTrust.status == "pass"` and quiet-machine attestation is recorded. | `summary.json`, measurement trust section |
| ST4-PERF-003 | Complex | When running a completion-lane capture while WebGPU is expected, the harness shall reject silent fallback as completion evidence. | Renderer backend resolves to the accepted WebGPU path; fallback captures are diagnostic unless explicitly scoped. | `summary.json`, `perfRuntime`, validation warnings |
| ST4-PERF-004 | Complex | When running a completion-lane capture while active combat is required, the driver shall produce real fire, hits, and enemy-state progression. | Mode-scaled shot/hit thresholds pass; zero-shot or no-contact runs are diagnostic only. | `summary.json`, driver final state, validation |
| ST4-PERF-005 | Ubiquitous | The harness shall fail completion if the capture uses a content-reduction or visual-degradation flag. | No forbidden flag is present in `perfRuntime` or URL params. | `summary.json`, `perfRuntime`, capture command |
| ST4-PERF-006 | Ubiquitous | The rAF gate shall be treated as the primary player-visible frame-pacing contract. | `rAF >25ms <0.5%`, `rAF >33ms <0.25%`, estimated dropped 60 Hz frames `<0.1/s`, dropped-frame time `<1ms/s`. | `validation.json`, `summary.json` |
| ST4-PERF-007 | Unwanted behavior | If a capture fails measurement trust, the agent shall classify all perf deltas from that run as diagnostic only. | Reports use "diagnostic" language and do not mark a candidate as a proven win. | handoff docs, `progress.md` |
| ST4-PERF-008 | Unwanted behavior | If metrics improve while same-experience invariants regress, the agent shall reject the change as a goal failure. | No accepted candidate reduces combat pressure, map size, terrain/vegetation readability, wildlife where enabled, weather, war assets, draw distance, or normal player flow. | diff review, final frame/samples, owner playtest |
| ST4-PERF-009 | State-driven | While A Shau is being used as the worst-case scenario, terrain/CDLOD/camera glitch evidence shall remain in scope until resolved or disproven. | No sky-ribbon, backface, underside, white-gap, or camera-clipping symptom in normal play or captured evidence. | final frame, sampled screenshots, owner playtest |
| ST4-PERF-010 | Event-driven | When a terrain/CDLOD optimization changes geometry, skirts, culling, shadow bounds, morph cadence, or submission cadence, the agent shall record what exact visual and gameplay invariants are preserved. | Candidate note names preserved map scale, LOD range, seam coverage, height sampling, shadows, vegetation, weather, combat, and player flow. | handoff docs, PR/commit message |
| ST4-PERF-011 | Event-driven | When render tails remain dominated by `RenderMain.renderer.render`, the next loop shall prioritize render-side attribution before simulation micro-optimization. | Tail report includes terrain, vegetation, world-static, NPC, wildlife, shadow, and overlay categories where available. | tail attribution, render-submission samples |
| ST4-PERF-012 | Event-driven | When the harness reports route snaps, world-space movement, large unresolved view turns, shot-presentation anomalies, or frontline compression, the agent shall treat the capture as suspect unless those warnings are explicitly explained. | No material equivalence warnings in completion-lane captures, or a written owner-approved exception. | `validation.json`, driver final state |
| ST4-PERF-013 | Unwanted behavior | If a proposed fix is a diagnostic bypass, the repo shall keep it opt-in and prevent it from being reported as shipped gameplay. | Flags such as legacy full skirts, disabled skirts, disabled shadows, or forced upload modes are documented as diagnostic unless promoted with structural proof and owner acceptance. | code flags, docs |
| ST4-PERF-014 | Complex | When a local candidate passes static validation while runtime proof is missing, the agent shall call it source-stable but unproven. | `validate:fast` and relevant focused checks pass, but STABILIZAT-4 remains open. | command output, `docs/DIRECTIVES.md` |
| ST4-PERF-015 | Complex | When both required scenarios pass locally while default content is preserved, the agent shall run release proof before claiming production completion. | Exact-head CI, deploy, `check:live-release`, and owner playtest pass. | CI/deploy URLs, release proof JSON |
| ST4-PERF-016 | Event-driven | When an agent evaluates saved dropped-frame artifacts, the repo shall provide an executable artifact classifier instead of relying on hand-scanned summaries. | `npm run check:dropped-frame-ears -- --dir <ashau> --dir <openfrontier> --strict` exits 0 only when both scenarios pass the EARS completion artifact gate. | `scripts/check-dropped-frame-ears.ts`, CLI output |

## Candidate Classification

- Proven win: completion-lane A Shau and Open Frontier captures pass trust,
  pass rAF/dropped-frame gates, preserve same-experience invariants, and ship
  through release proof.
- Source-stable candidate: focused tests, typecheck/lint/build, and
  `validate:fast` pass, but trusted completion-lane captures are missing.
- Diagnostic signal: a run or probe explains direction but fails trust, lacks
  combat, uses a diagnostic flag, falls back renderer, or has material harness
  equivalence warnings.
- Rejected path: the change fails same-experience invariants, does not move
  trusted dropped-frame evidence, or relies on a harness bypass.

## Next Quantitative Gaps

These are not blockers for keeping the current scaffold, but they are the next
places where future loops should replace judgement with numbers:

- Same-experience content counters for vegetation, wildlife, static world
  features, terrain draw distance, and combatant representation per scenario.
- A WebGPU CPU/GPU/presentation split around failing rAF epochs.
- Pixel Forge texture residency/upload timing that works for WebGPU, not only
  WebGL-style upload observers.
- A screenshot or pixel-stability regression lane for the terrain/camera
  glitch class.
- A typed/replayable driver path that reduces CJS active-driver drift from the
  real player controller.
