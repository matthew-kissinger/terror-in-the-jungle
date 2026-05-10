# Strategic Alignment — 2026-05-10

Last verified: 2026-05-10

This memo aligns the campaign queue with the owner's stated feature
trajectory: **radio-in airstrikes (SVYAZ-3), proper hydrology (VODA-1/2/3),
ground vehicles (VEKHIKL-1/2)**. It is a one-shot decision aid for the next
`/orchestrate` invocation — not a durable doctrine doc.

If this memo is older than 30 days, distrust it; the cycle landscape moves.

## Where we are (post cycle-2026-05-09-cdlod-edge-morph close)

- Master at `d71c3f4` (cycle 2.4 hot-fix merged 2026-05-10T03:54:26Z).
- Phase 0/1/2 of the realignment campaign: **done**. ZoneManager fan-in
  52 → 17 read / 5 concrete. WorldBuilder god-mode flags wired.
- Phase 2.5 (`cycle-2026-05-10-stabilization-fixes`): **ready to dispatch.**
  4 small fixes (PostCSS CVE bump, `_headers`, SEO essentials, Web Analytics
  enable). Closes the `cloudflare-stabilization-followups` carry-over.
- Phases 3–9: **queued, undispatched**, all internal architecture refactor:
  combatant-renderer-split → movement/AI splits → player-controller split →
  fixed-wing/airframe tests → telemetry/warsim/navmesh → Phase F (bitECS
  go/no-go) → Phase 5 new-normal.
- Active carry-overs: **12** (at the ≤12 limit). DEFEKT-3 (combat AI p99) is
  the 7-cycle-open anchor and the campaign's load-bearing blocker.

## The mismatch the owner named

The 9-cycle realignment campaign's "What this campaign does NOT cover":

> Ground vehicles (M151 jeep / VEKHIKL-1) — held for post-Phase-5 cycle.
> SVYAZ squad/air-support work — own future cycles.
> Combat AI doctrine expansion — gated on Phase F ECS outcome.

The owner's stated trajectory is the inverse: **get to those features.**
Hydrology (VODA) isn't in the campaign at all. The campaign is internal
plumbing; the owner wants engine surface that ships in front of players.

## Dependency map

For each named feature, what genuinely gates it vs. what's just sequencing
preference.

### SVYAZ-3 (radio-in airstrikes)

Hardest to ship. Real blockers (must close first):

- **AVIATSIYA-4** — helicopter combat surfaces (door-gunner, chin minigun,
  rocket pods). Can't call in a Cobra rocket run if the Cobra has no rockets.
- **AVIATSIYA-5** — fixed-wing combat surfaces (A-1 napalm/rockets/cannon,
  F-4 sidewinders/bombs, AC-47 side-firing minigun). Same logic.
- **AVIATSIYA-6** — combat maneuvers (AC-47 left-circle pylon-turn, A-1
  dive-bomb, F-4 strafe, Cobra rocket run, Huey gunship strafe). Required
  for "NPC-piloted aircraft fulfill the call-in."
- **DEFEKT-3** — combat AI p99 ≤35ms, currently ~34ms with measurement
  WARN. Adding NPC pilots to the AI tick at scale needs this fixed first.

Soft sequencing preference:

- **Phase 6** (`fixed-wing-and-airframe-tests`) is the natural place to land
  AVIATSIYA-2/4/5/6 work; a focused weapon-surface cycle would slot
  cleanly after Phase 6.
- SVYAZ-1, SVYAZ-2 already done. UI shell pattern from squad commands can
  extend to the radio menu.

### VODA-1 (visible water + query API)

Very tractable. Real blockers:

- None hard. New system, no fanout into combat or AI.

Soft sequencing preference:

- A query API stub (`isUnderwater`, `getWaterDepth`, `getWaterSurfaceY`)
  can ship as a first-slice feature cycle of ~1–2 days even before the
  visible water surface lands. That unlocks downstream work
  (buoyancy, swimming, sampan, river crossings) to schedule against
  VODA-1's evidence path without serializing on the visible surface.
- Hydrology channels already drive vegetation placement
  (HydrologyMaskMaterialConfig). Wiring the same data into a `WaterSystem`
  is structurally low-risk.

VODA-2 (flow/buoyancy/swimming) and VODA-3 (sampan/PBR boat) chain off
VODA-1 but don't gate it.

### VEKHIKL-1 (M151 jeep)

Tractable. Real blockers:

- None hard. The M151 GLB is already imported at
  `public/models/vehicles/ground/m151-jeep.glb`. The
  `VehicleSessionController` pattern exists from helicopter / fixed-wing
  work. Player enter/exit is solved.

Soft sequencing preference:

- VEKHIKL-2 (M2 .50 cal emplacements) is a natural follow-on from
  VEKHIKL-1's vehicle-session pattern.
- Phase 7 (`telemetry-warsim-navmesh-split`) is unrelated; ground-vehicle
  work doesn't have to wait on it.

## Recommended sequencing

Three options, ranked by speed-to-feature.

### Option 1: Pivot to features after Phase 2.5 (RECOMMENDED)

Ship Phase 2.5 (Cloudflare stabilization), then insert three feature cycles
ahead of the queued refactor:

1. **2.5** — `cycle-2026-05-10-stabilization-fixes` (queued, ready)
2. **2.6 — VODA-1 first slice** — `WaterSystem` + 3-method query API
   stub + behavior tests. Asserts API exists and returns sensible
   placeholders. ~2 days. Unlocks VODA-2/3 to schedule.
3. **2.7 — VEKHIKL-1 first slice** — M151 spawn + driving + collision in
   Open Frontier. ~3 days. Unlocks VEKHIKL-2.
4. **2.8 — DEFEKT-3 first surgical pass** — extract `CoverQueryService`,
   precomputed cover field on map load + worker fallback. THE p99 anchor
   close. ~3 days. Unblocks Phase F downstream and SVYAZ-3 NPC pilots.
5. **3+** — resume refactor campaign (combatant-renderer-split,
   movement/AI splits, etc.) with DEFEKT-3 already closed.
6. **Later** — AVIATSIYA-4/5/6 weapon surfaces cycle (probably 2–3 cycles
   themselves), then SVYAZ-3 radio cycle.

**Rationale:** features land in front of the owner faster; the refactor
campaign's god-module surgery is structurally fine to defer because
DEFEKT-3 — the campaign's only load-bearing blocker — gets closed in 2.8
on its own track.

### Option 2: Hybrid — keep DEFEKT-3 + fixed-wing only

1. **2.5** — Cloudflare stabilization
2. **3** — `cycle-2026-05-11-combatant-renderer-split` (as queued)
3. **4** — `cycle-2026-05-12-combatant-movement-system-ai-split` (as
   queued; closes DEFEKT-3 via CoverQueryService extraction)
4. **6** — `cycle-2026-05-14-fixed-wing-and-airframe-tests` (as queued;
   closes AVIATSIYA-2 and lands airframe tests for AVIATSIYA-5/6)
5. **Insert here** — VODA-1 first slice, VEKHIKL-1 first slice (parallel)
6. **Insert here** — AVIATSIYA-4/5/6 weapon surfaces
7. **Insert here** — SVYAZ-3 radio
8. **5/7/8/9** — drop or defer (player-controller split, telemetry
   split, Phase F, Phase 5 new-normal). Re-evaluate after features land.

**Rationale:** preserves the load-bearing refactor work that gates SVYAZ-3
(AI p99, airframe tests) but drops the refactor work that doesn't
(player-controller, telemetry, Phase 5 new-normal). Slower than Option 1
but doctrinally tidier.

### Option 3: Stay the course

Run all 9 cycles as queued, then VODA / VEKHIKL / SVYAZ in fresh cycles
afterward. **Not recommended.** The campaign was authored for an internal-
quality audit; it's not optimized for owner feature priorities. Phase 5
and Phase 7 cycle work can defer indefinitely without affecting
shippable surface.

## Recommendation

**Option 1.** The owner's stated trajectory is "get to features"; the
refactor campaign's value beyond Phase 4 (DEFEKT-3 close) is mostly
internal hygiene that can defer. VODA-1 and VEKHIKL-1 are very tractable
new-feature slices with ~1 week combined. DEFEKT-3 closes the campaign's
only hard blocker on a side-track. Then the refactor cycles resume with
a cleaner narrative ("we shipped features and now we're cleaning up")
instead of the current ("we're refactoring; features later").

## Concrete next-cycle proposal

If Option 1 is approved, the orchestrator authors these three new cycle
briefs (in addition to the already-ready `cycle-2026-05-10-stabilization-fixes`):

1. `docs/tasks/cycle-2026-05-11-voda-1-query-api.md` — VODA-1 first slice
2. `docs/tasks/cycle-2026-05-12-vekhikl-1-jeep-spawn-drive.md` — VEKHIKL-1
   first slice
3. `docs/tasks/cycle-2026-05-13-cover-query-service.md` — DEFEKT-3 first
   surgical pass

Each is a single-task or small-DAG cycle with the user-observable gap rule
honored (closes one directive's first slice, or one carry-over).

The campaign manifest (`docs/CAMPAIGN_2026-05-09.md`) gets revised to
inject these three cycles ahead of cycle 3 (combatant-renderer-split),
which becomes cycle 6 in the new ordering.

## What this memo does NOT change

- `docs/AGENT_ORCHESTRATION.md` "Current cycle" still points at Phase 2.5
  per the standard cycle-close ritual. This memo is a recommendation; the
  campaign manifest revision is a separate decision-and-commit by the
  owner.
- `docs/CARRY_OVERS.md` is unchanged.
- The 9-cycle queue in `docs/CAMPAIGN_2026-05-09.md` is unchanged. If
  Option 1 is approved, the next `/orchestrate` invocation pauses on
  `cycle-2026-05-10-stabilization-fixes` and the owner edits the campaign
  manifest before resuming.

## Honest risks of Option 1

- VODA-1 and VEKHIKL-1 first slices may surface unforeseen integration
  issues. First slice = "API + smoke", not the full directive; the
  follow-on slices may take 2–3x the time the campaign would predict.
- DEFEKT-3 CoverQueryService extraction is the single highest-risk piece
  of code in the campaign. Pulling it out of Phase 4's combat-split
  context means the surgical pass has less surrounding context to
  re-shape. Mitigation: dispatch with explicit "extract only, no
  refactoring of caller paths" scope.
- Deferring Phase 5/7/8/9 refactor doesn't make the underlying problems
  go away. They re-surface as architectural friction during feature work.
  Acceptable trade-off if the feature work demonstrably ships in front of
  players faster.
