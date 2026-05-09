# Cycle: cycle-2026-05-16-phase-f-ecs-and-cover-rearch

Last verified: 2026-05-09

Status: queued (Phase 4 / Phase F; cycle 8 of 9)

**The rearch that closes DEFEKT-3 and validates the 3,000-NPC vision
sentence.** Five sub-phases (F1–F5) per the realignment plan. Each is its
own task with its own success criteria and decision rule.

## Skip-confirm: yes

## Concurrency cap: 2 (most sub-phases are sequential by data dependency; F5 can run in parallel with F4)

## Round schedule

| Round | Slug | Reviewer | Playtest? | Notes |
|-------|------|----------|-----------|-------|
| R1 | `phase-f-bitecs-prototype` | combat-reviewer | no | Port `Combatant` to bitECS storage. **Decision rule:** ≥3x speedup at 1,000+ entities AND port bounded → adopt. Otherwise abandon. Either outcome closes the task. |
| R2 (sequential) | `phase-f-async-cover-search` | combat-reviewer | yes | Replace synchronous `CoverQueryService` with precomputed cover field + async fallback. Closes DEFEKT-3. |
| R3 (sequential) | `phase-f-combat1000-perf-gate` | combat-reviewer | yes | New `combat1000` scenario; new `perf:capture:combat1000`; baseline; gate. |
| R4 (sequential) | `phase-f-determinism-pilot` | none | no | `SimClock` + `SimRng`. Record/replay 30s combat scenario byte-identical. |
| R5 (parallel with R4) | `phase-f-helicopter-and-ac47` | combat-reviewer | yes | Close AVIATSIYA-3 helicopter parity audit + AVIATSIYA-2 AC-47 takeoff bounce |

## Tasks in this cycle

- [phase-f-bitecs-prototype](phase-f-bitecs-prototype.md)
- [phase-f-async-cover-search](phase-f-async-cover-search.md)
- [phase-f-combat1000-perf-gate](phase-f-combat1000-perf-gate.md)
- [phase-f-determinism-pilot](phase-f-determinism-pilot.md)
- [phase-f-helicopter-and-ac47](phase-f-helicopter-and-ac47.md)

## Cycle-level success criteria

1. **F1 decision recorded** in `docs/rearch/E1-ecs-evaluation.md` with measured numbers. Either ECS adopted (port lands) or rejected (memo updated to "OOP committed permanently").
2. **DEFEKT-3 closed** in `docs/CARRY_OVERS.md`. p99 cover-search contribution measured <2ms in the new combat120 capture.
3. **`combat1000` baseline established.** p99 <33ms, avg <16ms, p999 <50ms. If failed, vision sentence retracts to "verified at 1,000+; live ECS combat in progress".
4. **Determinism pilot:** record + replay one 30-second combat scenario byte-identical (combatant positions + zone state hash).
5. **AVIATSIYA-2** (AC-47 single-bounce) closed: 10/10 takeoffs without bounce in playtest.
6. **AVIATSIYA-3** (helicopter parity) closed: audit memo's recommended consolidation landed.
7. **Vision sentence updated** in README + AGENTS + ROADMAP: "engine architected for 3,000 combatants via materialization tiers; live ECS combat verified at 1,000 NPCs".

## Hard-stops specific to this cycle

- F1 ECS port exceeds 2 weeks of session time → abandon, commit to OOP, advance.
- combat1000 scenario crashes (memory, GPU) → halt cycle, surface to human.
- Determinism pilot reveals deep non-determinism in physics (cross-frame rounding) → mark F4 as "incomplete; future cycle"; advance to F5.

## End-of-cycle ritual + auto-advance

Auto-advance: yes → [cycle-2026-05-17-phase-5-new-normal](cycle-2026-05-17-phase-5-new-normal.md).
