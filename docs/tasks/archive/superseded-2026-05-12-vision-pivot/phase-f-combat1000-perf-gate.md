# Task: phase-f-combat1000-perf-gate

Last verified: 2026-05-09

Cycle: `cycle-2026-05-16-phase-f-ecs-and-cover-rearch` (F3)

## Goal

Create the `combat1000` perf scenario — 1,000 fully-materialized NPCs in
A Shau, 60s capture. Establish a baseline. **This is the scenario that
proves (or disproves) the materialization-tier story.**

## Why

The vision sentence promises "engine architected for 3,000 combatants via
materialization tiers." Today, 120 NPC is the verified frontier. After
F1 (bitECS) and F2 (cover field) land, we should be able to hold ≥1,000
NPCs at PASS frame budget. F3 establishes the gate; F-future closes the
3,000 number.

## Required reading first

- `scripts/perf-capture.ts` — existing capture harness
- `package.json` — perf:capture:* entries
- `docs/perf/scenarios.md` (after Phase 1 split) — scenario definitions
- `perf-baselines.json` — current baseline shapes

## Files touched

### Created

- `scripts/perf-capture-combat1000.ts` — wraps existing perf-capture with combat1000 args (1,000 NPCs, A Shau or AI Sandbox at A Shau scale, 60s, sample interval 1500ms, etc.) (≤200 LOC)

### Modified

- `package.json` — add `perf:capture:combat1000` and `perf:compare:combat1000` script entries
- `perf-baselines.json` — add baseline entry for combat1000 after the first successful capture
- `docs/perf/scenarios.md` (after Phase 1 split lands) — add combat1000 scenario definition
- `docs/perf/baselines.md` (after Phase 1 split lands) — add combat1000 baseline + targets

## Steps

1. `npm ci --prefer-offline`.
2. Author the capture wrapper. Target args: A Shau Valley mode, 1,000 NPCs, 60s duration, 15s warmup. (If A Shau spawning at 1,000 isn't supported by the existing scenario harness, may need to extend MapSeedRegistry — note in PR description.)
3. Run a fresh capture:
   ```
   npm run build:perf
   npm run perf:capture:combat1000
   ```
4. Review the capture. Targets:
   - avg <16ms
   - p99 <33ms
   - p999 <50ms
   - heap end-growth <50MB
5. **If targets met:** record as baseline (`npm run perf:update-baseline`). Update vision sentence (README/AGENTS/ROADMAP) to "live ECS combat verified at 1,000 NPCs."
6. **If targets missed:** record the result, do NOT update baseline. Update vision sentence to "verified at 200+; 1,000 in active development." Hand DEFEKT-3-style follow-up to the next cycle.

## Verification

- `npm run perf:capture:combat1000` produces a capture
- `perf-baselines.json` contains combat1000 entry
- Vision sentence reflects the actual outcome (1,000 verified or 200+ documented)

## Non-goals

- Do NOT add new scenarios beyond combat1000. (3000-NPC scenario is post-Phase-4.)
- Do NOT optimize for combat1000 — F1 + F2 already happened. F3 is measurement, not optimization.

## Branch + PR

- Branch: `task/phase-f-combat1000-perf-gate`
- Commit: `feat(perf): combat1000 scenario + baseline (phase-f-combat1000-perf-gate)`

## Reviewer: combat-reviewer pre-merge
## Playtest required: yes (manual session at 1,000 NPCs in dev preview — confirm visually plays correctly, not just numerically)
