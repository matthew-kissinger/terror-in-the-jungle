# Task: phase-f-helicopter-and-ac47

Last verified: 2026-05-09

Cycle: `cycle-2026-05-16-phase-f-ecs-and-cover-rearch` (F5)

## Goal

Close two long-running aviation carry-overs:
- **AVIATSIYA-3** — helicopter parity audit recommendations land
- **AVIATSIYA-2** — AC-47 single-bounce on low-pitch takeoff fixed

Both have been open ≥3 cycles. The audit memo exists; this task executes
its recommendations. Airframe.ts now has test coverage (Phase 3 R4), so
the takeoff fix has regression safety.

## Required reading first

- `docs/rearch/helicopter-parity-audit.md` — the existing audit memo
- `src/systems/helicopter/HelicopterPlayerAdapter.ts`
- `src/systems/vehicle/HelicopterVehicleAdapter.ts` (or wherever it lives)
- `src/systems/vehicle/airframe/Airframe.ts` (post-Phase-3-R4 — fully tested) — focus on ground-rolling section
- `src/systems/vehicle/airframe/Airframe.test.ts` (the new tests — extend with bounce regression tests)
- `docs/CARRY_OVERS.md` — AVIATSIYA-2 and AVIATSIYA-3 entries

## Files touched

### Modified

- Whatever consolidation the parity audit memo recommends (likely: unifying state authority between adapters; merging duplicate enter/exit/eject logic). Memo is the source of truth.
- `src/systems/vehicle/airframe/Airframe.ts` — fix the AC-47 ground-rolling bounce. The exact fix follows from a debug session in the playtest; common candidates:
  - Velocity damping at low airspeed
  - Vertical-velocity zero-clamp on ground contact
  - Stamp-resolution mismatch between airfield surface and airframe sample point
- `src/systems/vehicle/airframe/Airframe.test.ts` — add ≥1 regression test for the AC-47 bounce: simulate low-pitch takeoff init at config airspeed, assert no -y velocity transient

### Created (if needed)

- New consolidation file per audit recommendation (e.g. `HelicopterStateAuthority.ts`)

### Modified

- `docs/CARRY_OVERS.md` — move AVIATSIYA-2 and AVIATSIYA-3 to Closed table

## Steps

1. `npm ci --prefer-offline`.
2. Read the helicopter parity audit memo. Note its recommended consolidations.
3. Apply the consolidations. Run lint, typecheck, test:run.
4. **For AC-47:** in dev preview, fly the AC-47 with low-pitch takeoff repeatedly. Identify the bounce trigger.
5. Form a hypothesis (likely: stamp-resolution mismatch or vertical velocity not zeroed on ground contact).
6. Add a regression test in Airframe.test.ts that exposes the bounce given current Airframe behavior.
7. Fix the bounce. Re-run the test — it now passes. Re-run all Airframe tests — they all pass.
8. Run `npm run probe:fixed-wing` — AC-47 now passes takeoff cleanly.
9. Run a 10-min playtest:
   - Fly each helicopter (Huey, UH-1C, Cobra) from spawn to landing
   - Take off the AC-47 from a low-pitch grass strip 10 times — 10/10 without bounce
10. Update CARRY_OVERS.md.

## Verification

- AC-47 takeoff: 10/10 no bounce in playtest
- Helicopter parity audit recommendations applied (each item from memo addressed)
- AVIATSIYA-2 + AVIATSIYA-3 in Closed table
- `npm run probe:fixed-wing` clean
- All existing Airframe tests + 1 new bounce regression test pass

## Non-goals

- Do NOT redesign helicopter adapters from scratch. Only the audit's recommendations.
- Do NOT change AC-47 flight feel beyond the bounce fix.

## Branch + PR

- Branch: `task/phase-f-helicopter-and-ac47`
- Commit: `fix(vehicle): close AVIATSIYA-2 (AC-47 bounce) and AVIATSIYA-3 (helicopter parity) (phase-f-helicopter-and-ac47)`

## Reviewer: combat-reviewer pre-merge (vehicle adapters border combat)
## Playtest required: yes (10-min)
