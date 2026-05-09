# Backlog

Last verified: 2026-05-09

This file is the compact Strategic Reserve index. **Active carry-overs and
unresolved items live in [docs/CARRY_OVERS.md](CARRY_OVERS.md)** (Phase 0
realignment, 2026-05-09). Active directives live in
[docs/DIRECTIVES.md](DIRECTIVES.md). Current verified state lives in
`docs/STATE_OF_REPO.md` (also targeted for Phase 1 split into `docs/state/`).
Historical cycle records live under `docs/cycles/<cycle-id>/RESULT.md`.

Keep this file at or below 200 measured lines. Do not place long cycle
retrospectives, PR logs, or active directive status here.

## Current Release Routing

1. Stabilization closeout remains the release posture.
2. Runtime claims require an entry in `docs/DIRECTIVES.md` plus artifact paths.
3. Live release claims require STABILIZAT-3 evidence.
4. Performance baseline refresh remains blocked until STABILIZAT-1 passes from
   a trusted combat120 chain.
5. Human playtest remains required for flight, driving, combat rhythm, and UI
   responsiveness.

## Active Directive Routing

Use [docs/DIRECTIVES.md](DIRECTIVES.md) instead of duplicating active work here.

| Work area | Directive |
|---|---|
| Water surface, hydrology placement, water query API | VODA-1 |
| Ground vehicles and stationary weapons | VEKHIKL-1 / VEKHIKL-2 |
| Helicopter parity, aircraft weapons, maneuvers, Cobra import | AVIATSIYA-3 through AVIATSIYA-7 |
| Squad commands, pings, air-support radio | SVYAZ-1 through SVYAZ-4 |
| Respawn, map spawn, loadout, deploy flow | UX-1 through UX-4 |
| Combat120 baseline and live release | STABILIZAT-1 through STABILIZAT-3 |
| Baseline drift, doc/code drift, combat p99 (`DEFEKT-3`), route quality | DEFEKT-1 through DEFEKT-4 |

## Recently Completed (cycle-2026-05-10-zone-manager-decoupling)

Phase 2 of the realignment campaign. ZoneManager fan-in 52 → 17 read / 5
concrete via `IZoneQuery` interface. **Stabilization checkpoint after this
cycle**; campaign auto-advance paused.

- [#173](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/173) `zone-manager-design-memo` — `docs/rearch/zone-manager-decoupling.md` (303 LOC), 6-method `IZoneQuery` shape proposal, batch plan
- [#174](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/174) `izone-query-fence` — `[interface-change]` PR; `IZoneQuery` added to fence; ZoneManager implements; +3 trivial accessors (`getZoneAt`/`getZoneById`/`getCapturableZones`); terrain-nav-reviewer APPROVE
- [#175](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/175) `zone-decoupling-batch-a-readonly` — HUD/Compass/Minimap/FullMap migrated to `IZoneQuery`
- [#176](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/176) `zone-decoupling-batch-b-state-driven` — Combat/Tickets/WarSim migrated; ZoneManager.update() now publishes `zone_captured`/`zone_lost` events; combat-reviewer APPROVE-WITH-NOTES
- [#177](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/177) `zone-decoupling-batch-c-owners` — PlayerRespawn + CommandInputManager migrated; adapter shims dropped; ZoneManager removed from lint-source-budget grandfather list; `docs/ARCHITECTURE.md` heatmap updated; combat-reviewer APPROVE-WITH-NOTES

Carry-over delta: −0 closed, +3 opened (`cloudflare-stabilization-followups`,
`weapons-cluster-zonemanager-migration`, `perf-doc-script-paths-drift`).
Active 9 → 12 (at the `≤12 active` rule limit). The +3 are deferred work
formally registered as part of the **stabilization checkpoint**; the cycle
ships its user-observable feature (fan-in reduction) and would be COMPLETE
under the "ship a feature" half of the rule but registers INCOMPLETE under
the strict-decrease half — flagged for the next cycle's plan to close ≥2
of the 12 active before Phase 3 dispatches.

Comprehensive context: [docs/STABILIZATION_CHECKPOINT_2026-05-09.md](STABILIZATION_CHECKPOINT_2026-05-09.md).
Live audit findings: `artifacts/live-audit-2026-05-09/FINDINGS.md`.

## Recently Completed (cycle-2026-05-09-doc-decomposition-and-wiring)

Phase 1 of the 12-week realignment campaign. Doc surface decomposed and
WorldBuilder god-mode flags wired into engine consumers.

- [#167](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/167) `state-doc-split` — `docs/STATE_OF_REPO.md` (2,708 LOC) → `docs/state/` (3 files ≤140 LOC each)
- [#168](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/168) `codex-decomposition` — `docs/PROJEKT_OBJEKT_143*.md` archived; `docs/DIRECTIVES.md` (199 LOC) replaces Article III
- [#169](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/169) `perf-doc-split` — `docs/PERFORMANCE.md` (2,332 LOC) → `docs/perf/` (4 files ≤200 LOC each)
- [#170](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/170) `script-triage` — 89 `check:projekt-143-*` → 12 plain-named retained; 80 archived under `scripts/audit-archive/`
- [#171](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/171) `artifact-gc` — weekly `artifact-prune.yml` workflow; ~7.4 GB local prune
- [#172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172) `worldbuilder-wiring` — 6 god-mode flags wired into PlayerHealthSystem, AmmoManager, PlayerMovement, PostProcessingManager, AtmosphereSystem, AudioManager (all DEV-gated, Vite DCE confirmed)

Carry-over delta: −6 worldbuilder-wiring closed, +2 opened (artifact-prune
baseline-pin fix; `oneShotKills` 7th flag wiring). Net −4. Active count
13 → 9. Cycle COMPLETE.

Follow-ups for next cycles (combat-reviewer notes from PR #172):
- Update stale "703 LOC" reason text in `scripts/lint-source-budget.ts:54` (file is now 718 LOC).
- `oneShotKills` flag wiring (carry-over filed).
- `artifact-prune.ts` baseline-pin regex fix (carry-over filed).

## Strategic Reserve

Items below are acknowledged but not active directives unless the project
owner opens or reassigns them.

### KB-LOAD

- Accepted Pixel Forge vegetation candidate import and runtime proof.
- Dense vegetation ecology, bamboo and palm clustering, grass, ground cover,
  and disturbed trail edges.
- Pixel Forge building and vehicle replacement with foundation, collision, and
  pivot checks.
- GLB migration into the content-addressed asset manifest after terrain
  delivery is stable.

### KB-TERRAIN

- Far-canopy and distance-policy after evidence for Open Frontier and A Shau.
- A Shau route and NPC movement quality beyond representative-base connectivity.
- Terrain texture improvements.
- Road network generation with splines, intersections, and pathfinding.
- Additional DEM modes such as Ia Drang and Khe Sanh.

### KB-CULL

- Broad HLOD.
- Static-cluster policy.
- Vegetation culling.
- Parked-aircraft playtest coverage.
- Building and prop residency decisions after renderer-category evidence.

### KB-OPTIK / KB-EFFECTS

- Human-signed atmosphere and cloud readability.
- Vegetation normal-map and material parity follow-ups.
- Music, soundtrack, weapon sound variants, and impact/body/headshot sounds.
- Stress-scene grenade and explosion validation after combat120 trust returns.

### KB-STRATEGIE

- WebGPU, OffscreenCanvas worker render, WASM-SIMD, SharedArrayBuffer, and
  cross-origin isolation branches. Reopen only with project-owner direction.
- Multiplayer and networking.
- Destructible structures.
- Survival / roguelite mode.
- Campaign system.
- Theater-scale tiled DEM maps.

### Phase F Candidates

- E1: ECS evaluation remains deferred; bitECS measured about parity with the
  current Vector3-shaped runtime in the old spike.
- E2: GPU-driven rendering and WebGPU migration stay deferred for the rendering
  question; fix concrete instancing-capacity cliffs in place.
- E3: Utility-AI combat layer expansion remains a design candidate; do not
  block present faction tuning on it.
- E4: Agent/player API unification needs a minimal movement/observation
  prototype before any full active-driver rewrite.
- E5: Deterministic sim and seeded replay need a `SimClock` / `SimRng` pilot
  before any broad pass.
- E6: Vehicle physics rebuild needs a flagged Skyraider `Airframe` prototype
  and human playtest before any full migration.

## Known Deferred Risks

1. Fixed-wing and helicopter feel are not human-signed-off.
2. Pointer-lock fallback is implemented but not usability-signed.
3. Airfield height authority is partially repaired, not fully unified.
4. NPC route-follow quality is not signed off.
5. Production freshness must be rechecked after every player-testing push.
6. Main production/perf chunks remain heavy.
7. `frontier30m` baseline remains stale until a quiet-machine soak.
8. Mixed UI paradigms remain architecture debt.
9. SystemManager and composer ceremony remain architecture debt.
10. Variable-delta physics remains architecture debt outside fixed-step vehicle
    systems.

## Historical Cycle Index

| Cycle | Record |
|---|---|
| cycle-2026-05-10-zone-manager-decoupling | `docs/tasks/archive/cycle-2026-05-10-zone-manager-decoupling/cycle-2026-05-10-zone-manager-decoupling.md` |
| cycle-2026-05-09-doc-decomposition-and-wiring | `docs/tasks/archive/cycle-2026-05-09-doc-decomposition-and-wiring/cycle-2026-05-09-doc-decomposition-and-wiring.md` |
| cycle-2026-05-09-phase-0-foundation | `docs/tasks/archive/cycle-2026-05-09-phase-0-foundation/cycle-2026-05-09-phase-0-foundation.md` |
| cycle-2026-05-08-stabilizat-2-closeout | `docs/cycles/cycle-2026-05-08-stabilizat-2-closeout/RESULT.md` |
| cycle-2026-04-23-debug-cleanup | `docs/cycles/cycle-2026-04-23-debug-cleanup/RESULT.md` |
| cycle-2026-04-23-debug-and-test-modes | `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md` |
| cycle-2026-04-22-heap-and-polish | `docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md` |
| cycle-2026-04-22-flight-rebuild-overnight | `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md` |
| cycle-2026-04-21-stabilization-reset | `docs/cycles/cycle-2026-04-21-stabilization-reset/RESULT.md` |
| cycle-2026-04-21-atmosphere-polish-and-fixes | `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/RESULT.md` |
| cycle-2026-04-20-atmosphere-foundation | `docs/cycles/cycle-2026-04-20-atmosphere-foundation/RESULT.md` |
| cycle-2026-04-18-harness-flight-combat | `docs/cycles/cycle-2026-04-18-harness-flight-combat/RESULT.md` |
| cycle-2026-04-18-rebuild-foundation | `docs/cycles/cycle-2026-04-18-rebuild-foundation/RESULT.md` |
| cycle-2026-04-17-drift-correction-run | `docs/cycles/cycle-2026-04-17-drift-correction-run/RESULT.md` |
| cycle-2026-04-06-vehicle-stack-foundation | `docs/cycles/cycle-2026-04-06-vehicle-stack-foundation/RESULT.md` |

## Research References

- `examples/prose-main/` remains a gitignored external-repo reference target for
  declarative runtime config and orchestration patterns.
- Write generalized findings to `docs/rearch/prose-research.md` before using
  them as implementation guidance.
