# cycle-2026-04-22-flight-rebuild-overnight

Opened: 2026-04-22
Mode: autonomous overnight (no human gates)

## Purpose

Single-session autonomous run that lands Tier 0-3 as code (correctness, takeoff feel, climb stability, airfield placement) and Tier 4 as a design memo. Orchestrator advances R1 -> R2 -> R3 -> R4 without human intervention.

Full plan: [docs/FLIGHT_REBUILD_ORCHESTRATION.md](../../FLIGHT_REBUILD_ORCHESTRATION.md).

## Rounds

- **Round 1 (Tier 0+1):** `aircraft-building-collision`, `airframe-directional-fallback`, `airframe-altitude-hold-unification`, `airframe-ground-rolling-model`, `player-controller-interpolated-pose`.
- **Round 2 (Tier 2 climb):** `airframe-soft-alpha-protection`, `airframe-climb-rate-pitch-damper`, `airframe-authority-scale-floor`.
- **Round 3 (Tier 3 airfield):** `airfield-perimeter-inside-envelope`, `airfield-prop-footprint-sampling`, `airfield-envelope-ramp-softening`, `airfield-taxiway-widening`.
- **Round 4 (Tier 4 memo):** `continuous-contact-contract-memo`.

## Task briefs

Under `docs/tasks/<slug>.md`. 13 briefs seeded before this cycle opened.

## Directories

- `baseline/` - Round 0 probe + perf captures (orchestrator writes).
- `evidence/<slug>/` - per-task probe before/after JSON (executor writes).
- `screenshots/` - optional morning-review evidence (user captures).

## Result

Orchestrator writes `RESULT.md` when the cycle closes. Contains PR list, probe-delta summary, perf deltas, blocked-task list, and the morning review pack checklist.
