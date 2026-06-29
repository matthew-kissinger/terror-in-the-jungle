# Playtest memo — cycle-2026-06-28-ashau-purpose-and-missions (Phase 6, Field Readiness)

> **Automated gates complete; owner feel-walk pending.** Closed under
> `posture: autonomous-loop` (CAMPAIGN_2026-06-28-field-readiness, Phase 6 — the
> FINAL phase). Merged on CI green; perf-gated (combat120 A/B PASS). Phase 6
> answers the owner's "what is A Shau for" ask: it surfaces the existing war/zone
> state as a readable situation readout and adds an opt-in tasking director, plus
> three design docs (premiere BR, healing/looting, the director spike) for future
> cycles. The mechanics are unit/behaviour-test-proven; the *feel* (is A Shau now
> legible + purposeful?) is the owner's call.

## What shipped (5 PRs, all merged to master, all `fence_change: no`)

| Task | PR | Merge | Change |
|---|---|---|---|
| tasking-director-spike | [#451](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/451) | `8c2d171c` | spike memo: opt-in tasking director design (archetypes from live zone/war state, opt-in UX, reward, perf budget) — recommends a capture+defend MVP grounded in `StrategicFeedback`/`IZoneQuery`/`TicketSystem` read paths |
| premiere-battle-royale-design | [#452](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/452) | `b72e9d25` | design/feasibility memo for the A Shau "premiere" BR (battalion + ~25 NPC teams + closing storm), mapped onto the real materialization-tier budget (3,000 target vs ~120 verified); biggest risk = endgame perf density at the storm collapse |
| healing-and-looting-scope | [#453](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/453) | `a855285f` | scope memo: active healing (atop passive regen) + activating the dormant `WeaponPickupSystem` (absent from all 6 registration sites its sibling `AmmoSupplySystem` occupies) — recommends building healing first |
| situation-readout-hud | [#454](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/454) | `de6d7990` | HUD situation readout (war posture + nearest contested objective + direction nudge), read-only off `IZoneQuery`/`TicketSystem`, mounted into the Phase-1 control-hint surface; updates on the existing 2Hz objective tick (no new per-frame work) |
| tasking-director-mvp | [#455](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/455) | `f19f025b` | opt-in `TaskingDirector` system (`src/systems/missions/`) + `HudTaskCard`: archetypes **A (capture) + B (defend)** derived from live zone/war state, explicit accept/decline, score-on-complete; throttled + event-driven (near-empty per-frame update). Destroy (C) deferred per the spike |

## Automated evidence

- **Behavior tests** (not implementation-mirror): situation readout renders the
  correct posture + nearest-objective from a war/zone snapshot; the tasking
  director derives a task from a zone/war snapshot and fires opt-in → active →
  complete + reward dispatch; `HudTaskCard` renders offer/active/complete/failed.
- **combat120 perf A/B PASS** (same-machine session, seed 2718):
  - **R1 gate** (`situation-readout-hud`): baseline `bdc57dab` steady-state p99
    ~33ms (33.70/32.50 across 2 captures) vs R1 `de6d7990` median **31.80ms**
    (captures 39.10/31.80/31.20) → **−5.6%**, under the +5% HALT line. The lone
    39.10 was a machine spike (R1 also measured 31.20, *below* baseline — a real
    added cost cannot dip below baseline). Mechanistically the readout is dormant
    in ai_sandbox (`AI_SANDBOX` sets `usesZones=false` → `setSituation(null)`
    no-op every tick).
  - **R2 gate** (`tasking-director-mvp`): R1 baseline `de6d7990` ~33ms vs R2
    `f19f025b` captures 34.10/32.50 → mean **33.30ms** = **+0.6%**, both within
    the 35.39ms HALT envelope. CI's own perf job also passed. The director's
    per-frame `update()` is throttled + event-driven and only ticks when the war
    is live (dormant in ai_sandbox where the war sim is idle).
- **CI green** on all 5 PRs (lint incl. `check:doc-drift`, lint:budget, test,
  build, smoke, mobile-ui; knip:ci for the new registered system).

## What the owner should walk (live feel — the actual gate)

1. **Situation readout (A Shau):** deploy on A Shau — the right-edge readout (next
   to the control-hint legend) should show the war posture (who's ahead /
   tickets), the nearest contested objective, and a "go here" direction nudge. Is
   A Shau now legible at a glance instead of a blank exploration?
2. **Tasking director (A Shau):** opt into a task (the **T/Y** binding) — a task
   card should offer a **capture** or **defend** objective derived from the live
   front; accept it, complete it, and confirm the score/impact reward fires.
   Decline should clear cleanly. Does the opt-in loop give A Shau a purpose?
3. **Confirm the readout + director stay quiet on the standard modes / TDM** (they
   key off live zones/war state, which the sandbox/TDM modes don't run).

## Design docs filed (no walk — future-cycle inputs)

- `docs/rearch/TASKING_DIRECTOR_SPIKE_2026-06-28.md` (the MVP's blueprint).
- `docs/rearch/PREMIERE_BATTLE_ROYALE_DESIGN_2026-06-28.md` (defer-the-build BR design).
- `docs/rearch/HEALING_AND_LOOTING_SCOPE_2026-06-28.md` (healing + looting scope).

## Notes

- No reviewer scope (HUD / strategy-reads / missions / player — no
  `src/systems/combat/**` or terrain/nav).
- **Tasking-director wiring:** the StrategicFeedback analog is
  `OperationalRuntimeComposer.wireStrategyRuntime` (not GameplayRuntimeComposer) —
  the strategy-runtime group already exposes warSimulator + zoneManager +
  hudSystem + ticketSystem, the four handles the director needs.
- **Budget-ratchet admissions (in-cycle, sanctioned by the brief — no CARRY_OVERS
  row):** `HUDSystem.ts` to 878 LOC/89 methods (situation readout + task card
  across the phase); `SystemManager.ts` to 63 methods.
- **Orchestrator gate-repair mid-phase:** master went doc-drift-RED after the
  Phase 5 brief archival (broke a `DEPLOY_MAP_3D_SPIKE` link) + the Phase 6 spike
  docs' forward-references — undetected because docs-only commits are
  CI-path-ignored. Fixed in `378a4313` (link repointed to the archive; spike
  paths aligned to the MVP's; forward-refs grandfathered via the gate's
  `--print-grandfather`). `check:doc-drift` failing=0 thereafter.
