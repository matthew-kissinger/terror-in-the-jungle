# KONVEYER-11 — Strict proof chain and terrain budget

Status: done
Owning subsystem: renderer / terrain / perf-harness / combat
Opened: cycle-2026-05-11-konveyer-k11-proof-terrain-budget

## Latest evidence

`artifacts/perf/2026-05-11T18-56-10-018Z/measurement-trust.json` passes measurement trust with strict WebGPU, render-submission summary attribution, and every-fourth-sample attribution cadence. `artifacts/perf/2026-05-11T18-52-12-160Z/measurement-trust.json` shows full every-sample attribution is too heavy and fails measurement trust. CDLOD node/ring strict proofs are `artifacts/perf/2026-05-11T19-27-26-995Z/konveyer-scene-parity/scene-parity.json` for Open Frontier + A Shau and `artifacts/perf/2026-05-11T19-29-34-958Z/konveyer-scene-parity/scene-parity.json` for Zone Control + combat120; later K12 probe repair found that the earlier `team_deathmatch` probe label was not starting runtime enum `tdm`, so use `artifacts/perf/2026-05-11T20-21-57-694Z/konveyer-scene-parity/scene-parity.json` for actual Team Deathmatch terrain attribution. Player terrain-fire fallback test evidence is `artifacts/perf/2026-05-11T19-05-00-000Z/konveyer-terrain-fire-authority/vitest-combatant-combat.json`; strict WebGPU browser proof is `artifacts/perf/2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority/terrain-fire-authority.json`. Cycle brief: `docs/tasks/cycle-2026-05-11-konveyer-k11-proof-terrain-budget.md`.

## Success criteria

- Strict WebGPU `perf-capture` attribution has a trusted command shape that preserves scene/category/pass ownership without full-dump sample overhead.
- Terrain/CDLOD runtime cost is attributed by main pass and shadow pass before terrain LOD, shadow, or culling policy changes.
- Active CDLOD node/ring evidence exists for ground, elevated, and skyward cameras.
- Fire-through-terrain reports are audited as a combat/terrain/nav/materialization contract risk, not as an isolated weapon tuning issue.
