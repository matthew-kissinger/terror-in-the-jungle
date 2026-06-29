# Playtest memo — cycle-2026-06-28-combat-vehicle-feel (Phase 2, Field Readiness)

> **Automated gates complete; owner feel-walk pending.** Closed under
> `posture: autonomous-loop` (CAMPAIGN_2026-06-28-field-readiness, Phase 2).
> Merged on CI green; perf A/B PASS. Phase 2 is vehicle/weapon FEEL tuning + one
> real bug — the mechanics are unit-test-proven; the *feel* is the owner's call.

## What shipped (5 PRs, all merged to master, all `fence_change: no`)

| Task | PR | Merge | Change |
|---|---|---|---|
| tank-exit-and-seatswap | [#433](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/433) | `047b3873` | `E` exits a tank (universal vehicle exit); `F` stays driver↔gunner seat-swap |
| tank-turret-traverse | [#429](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/429) | `2f9275b9` | yaw 30→75°/s, barrel pitch 8→25°/s (rate cap kept) |
| tank-hill-authority | [#432](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/432) | `92abaf14` | maxClimbSlope 0.6→0.78, slopeDriveFloor→0.62, slopeGravityScale→0.20 (M48 + T-54) |
| ground-vehicle-speed-and-camera | [#431](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/431) | `884884c1` | jeep velocityDamping 0.88→0.95, torque 420→520; follow-cam distance now chassis-aware |
| weapon-ads-per-weapon-offset | [#430](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/430) | `8b689ac5` | per-weapon ADS offset; M60 (lmg) drops/pulls back to clear the sight |

## Automated evidence

- **The real bug (tank exit) is repro-first L3-proven** (`src/integration/vehicle/tank-exit-and-seatswap.test.ts`): F-only never dismounts (the bug) → `E` dismounts with side-ejection from both seats → `F` still swaps. The exit cue routes through the Phase-1 `HudControlHints` vehicle context.
- **Tuning is behavior-tested** (not implementation-mirror): turret slew floors (>45°/s yaw, >15°/s pitch) with the rate cap intact; tracked-vehicle forward-crest on a previously-stalling grade + bounded slide-back + near-vertical wall still rejected; jeep higher cruise + M35 follow-cam farther than the jeep's; M60 ADS offset resolves distinct-and-lower vs the M16 default with fallback.
- **combat120 perf A/B PASS** (same-machine, seed 2718): pre-Phase-2 `e65a5ab4` steady-state p99 **37.10ms** → post-Phase-2 `047b3873` **37.70ms** = **Δ +0.60ms (+1.6%)**, well under the +5% HALT line; p95 improved −4.6%. The Vehicles system is dormant in ai_sandbox (~0.05ms both runs) — Phase 2's code never executes there, so the tiny delta is render run-to-run noise on a non-quiet machine, not a Phase-2 cost. (Absolute ~37ms is not baseline-grade — `quietMachineAttested:false`; the A/B delta is the trustworthy signal.)

## What the owner should walk (live feel — the actual gate)

1. **Tank exit** — board an M48, press **`E`**: dismount cleanly to the side of the hull; press **`F`** (two-seat tank): driver↔gunner swap still works; HUD shows the exit/swap cues.
2. **Turret feel** — as tank gunner, slew yaw + elevate the barrel: responsive but deliberate (not twitchy, not arcade-instant); the barrel pitch should no longer crawl.
3. **Hill climb** — drive the M48 and T-54 up steep jungle grades that used to stall: "slower but stronger," climbs without bogging, minimal slide-back; doesn't climb cliffs.
4. **Jeep speed + truck camera** — the M151 should feel noticeably faster (not floaty/icy); the M35 truck follow-cam should frame from BEHIND the bed, not inside it.
5. **M60 ADS** — equip the M60, aim down sights: the receiver should no longer occlude the sight line; confirm M16/AK/SMG/pistol ADS are unchanged.

## Notes
- No fence changes (tank-exit used the existing controller/adapter exit route, fence verified clean).
- Phase 2 touched only `src/systems/vehicle/**`, `src/systems/player/**`, `src/systems/player/weapon/**`, `src/config/vehicles/**` — no reviewer scope (combat/terrain/nav), no render/AI-hot-path code.
- One doc-drift hiccup during the cycle: an orchestrator typo put the tank-exit brief's PlayerInput path under `ui/` instead of `systems/player/`; it tripped the lint gate on all 5 branches, fixed on master + rebased. Not part of the walk.
