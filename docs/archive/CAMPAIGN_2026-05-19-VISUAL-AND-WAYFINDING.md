# Campaign: 2026-05-19 Visual Polish & Wayfinding (parallel cycles)

Last verified: 2026-05-20 (CLOSED — all three cycles closed; 11 PRs merged at master commit `4dd2c054`; campaign close memo at [docs/BACKLOG.md](BACKLOG.md) `## Recently Completed (campaign-2026-05-19-visual-and-wayfinding)`)

Campaign manifest. Trigger: owner 2026-05-19 playtest of live build
(SHA `fc398f12` at `terror-in-the-jungle.pages.dev`). Three issues
captured in screenshots:
1. Open Frontier midday "random dark spots" + visible "skybox edge
   through terrain" on A Shau valley flights.
2. A Shau CDLOD: tall vertical fins at the DEM map edge; "trench /
   skinny-trail" cuts through terrain along nav lanes.
3. Drivable vehicles (M151 / M48 / Sampan / PBR / M2HB) have no
   in-world affordance to find or enter — no HUD prompt, no
   minimap marker, no map marker.

## Status

**CLOSED 2026-05-20.** All three cycles closed per their own
acceptance criteria. 11 PRs merged. Campaign close memo lives at
[docs/BACKLOG.md](BACKLOG.md) `## Recently Completed
(campaign-2026-05-19-visual-and-wayfinding)`.

Original posture: **Auto-advance: yes.** Posture: **autonomous-loop**.

Three cycles. **All three run in parallel** because they touch
disjoint subsystems:
- Cycle #1 → `src/systems/environment/atmosphere/**` (sky/LUT).
- Cycle #2 → `src/systems/terrain/**` + `src/config/AShauValleyConfig.ts`
  (CDLOD edge + route stamps + water flip).
- Cycle #3 → `src/ui/minimap/**`, `src/ui/map/**`,
  `src/ui/hud/InteractionPromptPanel.ts`, `src/systems/vehicle/**`
  (HUD prompt + map markers).

There is no DAG between them. The orchestrator dispatches all three
R1 rounds concurrently (across three worktrees), then their
respective R2 (playtest evidence) rounds.

The current cycle pointer in
[docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md) "Current cycle"
should reflect the **multi-cycle parallel dispatch** state — see the
orchestrator contract below for the explicit pattern.

## Orchestrator contract (read this if you're the orchestrator)

This manifest is the source of truth for which cycles run. Unlike
the post-WebGPU campaign (sequential), this campaign dispatches all
three cycles **in parallel** under a shared concurrency cap.

1. At `/orchestrate` invocation, read the "Queued cycles" table
   below. All cycles in `pending` status are launched in parallel.
2. Mirror the campaign's parallel state into the "Current cycle"
   section of [docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md):
   list all three cycles with their R1 task lists side-by-side.
3. Dispatch each cycle's R1 in its own worktree
   (`isolation: worktree`). Concurrency cap **9** for this campaign
   (cycle #1 R1 = 2 tasks, cycle #2 R1 = 3 tasks, cycle #3 R1 = 4
   tasks; 2+3+4 = 9 parallel executors).
4. Reviewer assignments (per-cycle):
   - Cycle #1: no mandatory reviewer; optional perf-analyst.
   - Cycle #2: `terrain-nav-reviewer` mandatory on all three R1 PRs.
   - Cycle #3: no mandatory reviewer.
5. Each cycle closes independently per its own brief's acceptance
   criteria. The campaign closes when all three cycles close.
6. On hard-stop in any cycle: mark that cycle's row `BLOCKED` with a
   one-line cause; the other cycles continue unless they share a
   blocker. Set `Auto-advance: yes` → `PAUSED` only if ≥ 2 cycles
   hard-stop simultaneously (campaign-level halt).
7. The "Current cycle" section gets reset to the empty stub only
   after **all three** cycles close.

The cycle briefs at `docs/tasks/<slug>.md` are pre-authored. They are
the authoritative scope for each cycle; this manifest only carries
ordering + a one-paragraph TL;DR per slot.

## Queued cycles

Three independent cycles. No DAG. Dispatch order does not matter.

| # | Slug | Status | Closes | Brief | Notes |
|---|------|--------|--------|-------|-------|
| 1 | `cycle-skylut-resolution-bump` | **done** | KB-SKY-LUT-BANDING (opens+closes in-cycle) | [brief](tasks/archive/campaign-2026-05-19-visual-and-wayfinding/cycle-skylut-resolution-bump.md) | Closed 2026-05-20. 2 PRs (#276, #284). |
| 2 | `cycle-ashau-edge-and-flow-tuning` | **done** | KB-DEM-EDGE-TAPER (opens+closes in-cycle) + Stage D3 of cycle-2026-05-09-cdlod-edge-morph | [brief](tasks/archive/campaign-2026-05-19-visual-and-wayfinding/cycle-ashau-edge-and-flow-tuning.md) | Closed 2026-05-20. 4 PRs (#275, #277, #282, #283). All three `terrain-nav-reviewer` APPROVE or APPROVE-WITH-NOTES (one CHANGES-REQUESTED on PR #275 first pass; re-dispatch APPROVE). |
| 3 | `cycle-vehicle-wayfinding-and-prompts` | **done** | VEKHIKL-UX-1 (opens+closes in-cycle) | [brief](tasks/archive/campaign-2026-05-19-visual-and-wayfinding/cycle-vehicle-wayfinding-and-prompts.md) | Closed 2026-05-20. 5 PRs (#278, #279, #280, #281, #285). Stretch compass markers landed (not dropped). Compass runtime wiring folded into PR #285 commit 1. |

## Hold list

Cycles that exist in the campaign concept but are intentionally NOT
launched yet. They wait for the named trigger.

| Slug | Trigger to promote | Reason held |
|------|-------------------|-------------|
| `cycle-vekhikl-5-fleet-expansion` | Owner signs off on `cycle-vehicle-wayfinding-and-prompts` playtest evidence | Adds **M113 APC** (US ground, squad transport, 6–11 seats, open-top M2HB gunner pod), **M35 "Deuce" truck** (US ground, logistics role), **T-54/55 tank** (OPFOR ground, faction parity with M48), and optionally **ZU-23-2 twin AA** (OPFOR emplacement) and **LCM-8 assault craft** (US watercraft). Plugs into the existing spawn-table contract (`src/systems/vehicle/M48TankSpawn.ts:77–157`, `src/systems/vehicle/SampanSpawn.ts:56–148`). Cycle #3 above must close first so the new fleet has wayfinding from day one. |
| `cycle-sky-screen-space-quad` | Cycle #1 ships but Open Frontier midday still shows visible artifacts OR cycle #2 ships but A Shau valley flight still shows visible "skybox edge through terrain" beyond what the LUT bump explains | Sky architecture rework — replace the 500-unit BackSide sphere dome with a screen-space sky quad (Hillaire-style) or move to per-fragment volumetric. Documented in `docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md` candidate Combo E (Hillaire prebaked cubemap) and Combo F (volumetric raymarch). Held because (a) the LUT bump in cycle #1 is expected to fully fix the symptoms and (b) screen-space sky is a larger rework that should not happen before confirming the simpler fix doesn't work. |
| `cycle-stabilizat-1-baselines-refresh` | Owner direction; was removed from the post-WebGPU campaign on 2026-05-18 (originally cycle #13 there) | STABILIZAT-1 carry-over stays active until this runs. Combat120 baselines remain at `measurement_trust=warn`. May be re-queued as a standalone cycle later. Not part of this campaign. |

## Dependencies (DAG between queued cycles)

**None.** The three queued cycles touch disjoint subsystems. The
campaign explicitly exists to run them in parallel.

Cross-cycle observations (informational only):
- Cycle #1 (sky LUT) and cycle #2 (A Shau terrain) both contribute
  to the user-reported "skybox edge through terrain" symptom — the
  LUT bump is the most likely fix (cycle #1 closes it); if any
  residual band remains after the LUT bump, the A Shau DEM edge
  taper (cycle #2 D3) may also factor. Cycle #1's playtest
  evidence captures should explicitly check the A Shau flyover
  shot for residual banding so the cycle #2 close memo can
  cross-reference.
- Cycle #3 (vehicle wayfinding) is fully orthogonal — no
  cross-cycle interaction.

## Hard-stops (campaign-level)

Per-cycle hard-stops live in each cycle's brief. The campaign-level
hard-stops below halt **all three cycles simultaneously**:

- ≥ 2 of the 3 cycles hit a hard-stop in the same dispatch round.
  Set `Auto-advance: yes` → `PAUSED`; surface to owner.
- Carry-over count grows across the campaign (sum of all three
  cycles' net carry-over deltas > 0). Each cycle is designed for net
  delta 0; if any cycle opens an additional active row, halt.
- A fence-change proposal lands in any executor report. Halt;
  surface to owner.
- Worktree isolation failure in any cycle. Halt that cycle; the
  other two continue.
- `combat120` p99 regresses > 5% from cycle #12 close baseline (the
  STABILIZAT-1 caveat applies — baselines are warn-stamped; treat
  as soft gate, not hard, but document any regression in the
  campaign close memo).

## Campaign close criteria

The campaign closes when **all three** cycles close per their own
acceptance criteria. At close:

1. Append a `## Recently Completed (campaign-2026-05-19-visual-and-wayfinding)`
   section to `docs/BACKLOG.md` with the PR list across all three
   cycles, plus the cycle close-commit SHAs.
2. Move each closed cycle's brief from `docs/tasks/<slug>.md` to
   `docs/tasks/archive/campaign-2026-05-19-visual-and-wayfinding/<slug>.md`
   (single shared subfolder for the campaign).
3. Update CLAUDE.md "Current focus" section.
4. Update `docs/CARRY_OVERS.md` with any closed/opened entries.
5. Promote `cycle-vekhikl-5-fleet-expansion` from this manifest's
   hold list to a new campaign or standalone cycle if owner
   approves it post-campaign.
6. If owner approves, re-queue `cycle-stabilizat-1-baselines-refresh`
   to refresh combat120 baselines.

## Posture

**`auto-advance: yes`** (parallel dispatch, no human gating between
R1 and R2 within each cycle).

**`posture: autonomous-loop`** — per-cycle playtest gates are
deferred to PLAYTEST_PENDING; merge is gated on CI green +
reviewer APPROVE (per cycle's reviewer policy) + Playwright smoke
captures. Owner walk-through happens after the campaign closes.

## Notes for the orchestrator

- Three parallel dispatch streams. Track each cycle's round status
  independently in your scratch state.
- Reviewer subagent assignment is per-cycle; the `terrain-nav-reviewer`
  mandatory on cycle #2's three R1 PRs is the only mandatory-reviewer
  obligation in this campaign.
- The fleet-expansion cycle in the hold list is **owner-gated**. Do
  not auto-promote when cycle #3 closes; the owner sign-off step
  must happen first.
- If cycle #1's LUT bump produces 0 visible improvement on Open
  Frontier (executor reports the playtest captures look identical
  pre/post), open `cycle-sky-screen-space-quad` from the hold list
  for an owner discussion before the campaign closes. This is the
  pre-stamped escalation path for the only cycle whose root cause
  is partially hypothesis-driven.
