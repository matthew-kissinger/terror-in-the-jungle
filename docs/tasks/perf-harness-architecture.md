# Task D1: Perf-harness architecture — scenarios, policies, validators

**Phase:** D (next cycle — follows A/B/C rebuild foundation)
**Depends on:** A4 merged (AgentController primitive), C2 merged (SeededRandom + ReplayRecorder)
**Blocks:** reliable perf captures; repeatable agent-driven playtests; eventual NPC pilot integration
**Playtest required:** yes (the harness *is* a playtest surface)
**Estimated risk:** medium — new module; replaces an imperative 1755-LOC driver with a declarative scenario system
**Files touched:** new `src/dev/harness/` module (runner, policies, scenarios, validators), rewritten `scripts/perf-active-driver.js` as thin scenario launcher, gate on `window.__agent` exposure in `src/core/bootstrap.ts`, tests.

## Why this task exists

A4 (2026-04-18) rewrote the perf-active-driver from 1755 LOC to 359 LOC atop the new AgentController — and introduced a direction-inversion bug in the `move-to` action that made the harness drive the player *backward* during combat120 captures. The bug got past CI because:

1. The scenario ran (frames accumulated, perf data landed in `artifacts/`).
2. The validator that *would* have caught it (`player_hits_recorded > 0`) was treated as advisory, so the capture was marked "failed" but the perf numbers got consumed as if the scenario had exercised combat.
3. There was no explicit contract tying "combat120 scenario" to "the driver must actually engage combat."

A revert of `scripts/perf-active-driver.js` restored working captures. This task replaces the ad-hoc imperative driver with a scenario/policy/validator architecture so the A4-class regression cannot reoccur silently.

## Required reading first

- `docs/tasks/archive/A4-agent-player-api.md` — AgentController primitive design (shipped as `src/systems/agent/`).
- C2's `src/core/SeededRandom.ts`, `ReplayRecorder.ts`, `ReplayPlayer.ts` — deterministic input replay, used here for reproducible captures.
- `docs/TESTING.md` — behavior contracts.
- `docs/INTERFACE_FENCE.md`.
- **`examples/prose/` (if present)** — clone `prose.md` repo and peer prose-format orchestration repos into `examples/` (gitignored) **before** starting. Reference their scenario/policy/pipeline conventions when shaping this architecture. Goal: learn from how they structure declarative runtime configs + pluggable policies without reinventing.
- `scripts/perf-capture.ts` — how captures wrap the driver today; know this before redesigning.
- `scripts/perf-active-driver.js` — current (reverted) driver. Understand what it actually does before replacing it.

## Architecture (the target state)

### Directory shape

```
src/dev/harness/
  runner.ts              # generic scenario runner — single entry point
  types.ts               # ScenarioConfig, PolicyConfig, ValidatorConfig
  policies/
    engage-nearest-hostile.ts
    hold-position.ts
    patrol-waypoints.ts
    do-nothing.ts
    index.ts             # registry map: policy id → constructor
  scenarios/
    combat120.ts
    openfrontier-short.ts
    ashau-short.ts
    frontier30m.ts
    index.ts             # scenario registry
  spawn-policies.ts      # atSpawnPoint | withinEngagementRange | coords
  validators.ts          # minShots(N), minEngagements(N), minDistanceTraversed(m), maxStuckSeconds(s)
  __tests__/
    runner.test.ts
    policies/engage-nearest-hostile.test.ts
    validators.test.ts
```

### Scenario config (declarative, typed)

```ts
export const combat120: ScenarioConfig = {
  id: 'combat120',
  map: 'ai_sandbox',
  npcCount: 120,
  durationSec: 90,
  warmupSec: 15,
  player: {
    spawn: { kind: 'within-engagement-range', targetFaction: 'opfor', minDistM: 30, maxDistM: 60 },
    policy: { kind: 'engage-nearest-hostile', fireMode: 'full-auto', reengageCooldownMs: 400 },
    seed: 'combat120-default',   // fed to SeededRandom
  },
  observe: {
    frameTimes: true,
    aiBudgetOverruns: true,
    shotsFired: true,
    engagements: true,
  },
  validators: [
    { kind: 'min-shots', count: 50 },
    { kind: 'min-engagements', count: 3 },
    { kind: 'max-stuck-seconds', seconds: 5 },
  ],
};
```

### Runner responsibilities

1. Read `?scenario=<id>` URL param (or perf-capture CLI flag).
2. Look up scenario from registry.
3. Configure SeededRandom with the scenario seed.
4. Initialize spawn policy → place player.
5. Instantiate action policy → run per-tick `tick(observation) → action` loop through AgentController.
6. Record with ReplayRecorder.
7. Run validators at end-of-scenario.
8. Write typed artifact:
   - `summary.json` (frame distribution + declared observations)
   - `validation.json` (validators pass/fail — overall pass iff all pass)
   - `replay.json` (seed + input frames for replay)

### Steps

1. **Fetch prose.md examples first.** `git clone <prose.md repo url> examples/prose-main` and peer projects. Read their scenario DSL + policy pattern conventions. Reference in design notes, don't copy-paste.
2. Scaffold `src/dev/harness/` per the shape above.
3. Port combat120 first as the reference scenario. Action policy: `engage-nearest-hostile`. Spawn policy: `within-engagement-range` with explicit distance bounds (no more hacky teleportation — it's a declared spawn choice).
4. Port openfrontier-short, ashau-short, frontier30m as scenario configs. Each names its own policy + validators.
5. Rewrite `scripts/perf-active-driver.js` as ≤80-LOC scenario-runner launcher. It reads the scenario id, boots the runner, monitors completion, writes artifacts.
6. Wire SeededRandom + ReplayRecorder into the runner. A failing scenario's replay.json should be replayable deterministically for bisection.
7. Gate `window.__agent` exposure in `bootstrap.ts` on `import.meta.env.VITE_PERF_HARNESS === '1'`. Removes harness surface from prod bundles.
8. Validators fail loud: if a validator fails, the capture is FAILED (not "validation warn, perf data OK"). perf-compare must treat failed captures as non-comparable.
9. Behavior tests for runner + each policy + each validator. Policies test against scripted observation sequences, not live engine.

## Exit criteria

- `src/dev/harness/` lands with runner, 4 policies, 4 scenario configs, validators.
- `scripts/perf-active-driver.js` is ≤100 LOC thin launcher.
- `npm run perf:capture:combat120` runs the new runner and produces typed artifact (summary + validation + replay).
- Injecting a sign-flipped move-to in the AgentController adapter makes combat120 FAIL at the `min-engagements` validator with a clear failure message. Demonstrates the A4-class regression is now detectable automatically.
- ReplayPlayer can deterministically replay a captured combat120 session and reach the same final state within tolerance.
- `window.__agent` is not exposed in prod builds; harness asserts its presence at runtime.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- No NPC pilot integration — harness for human-style player automation only.
- No network/RPC — local in-process.
- No new policies beyond the 4 listed — add more as the scenarios need them.
- No change to SeededRandom or ReplayRecorder internals — C2 shipped those; we consume.
- No new perf metrics — we capture what's in `summary.json` today, just organize the artifact shape.

## Hard stops

- Fence change to IPlayerController or AgentController types → STOP. The harness rides on existing surfaces.
- Diff exceeds ~800 lines net → STOP, propose tighter brief.
- prose.md repo clone is blocked / unavailable → proceed without it, note in PR description.
- The A4-regression detection test (sign-flip + validator) doesn't actually fail → STOP and fix the validator before shipping.

## Prose.md / examples research reference

Unrelated to D1's immediate scope but worth capturing once the executor is already reading prose projects: write findings to `docs/rearch/D1-prose-research.md` covering:
- How they structure declarative scenarios.
- Their policy/plugin registration patterns.
- Whether their orchestration patterns apply to future multi-agent cycles in this repo.

Non-binding reference note — the executor can skip if the prose repos don't load cleanly or the patterns don't generalize.
