# A Shau Valley Implementation Plan

Last updated: 2026-02-21
Status: Active
Owner: Codex + Matt

## Mission

Stabilize A Shau Valley as a playable, testable large-scale combat mode with:
- Reliable spawn/grounding behavior
- Coherent tactical contact visibility
- Fast time-to-contact gameplay flow
- Single authoritative combat population model

## Working Rules

- This document is a live plan and log.
- Each implementation step must update this file.
- Do not mark a step complete without a validation note.

## Phase 0: Baseline and Repro

- [ ] Capture current A Shau behavior in a reproducible checklist
- [ ] Record exact repro for:
  - [ ] airborne spawn / falling through terrain
  - [ ] enemies visible on HUD/map but not in world
  - [ ] random player firing behavior
  - [ ] long no-contact wandering
- [x] Save baseline run artifacts and references

Acceptance:
- Repro steps are deterministic and written in this file.
- Baseline artifacts are linked in Iteration Log.

## Phase 1: Authoritative Population Model

- [x] Define and document A Shau authority contract:
  - [x] WarSimulator owns strategic population
  - [x] CombatantSpawnManager behavior for A Shau explicitly constrained or disabled
- [x] Remove dual-spawn conflicts in A Shau runtime path
- [ ] Validate materialization/dematerialization counts and ownership transitions

Acceptance:
- No duplicate force generation paths active in A Shau.
- Stable materialized population under cap with no ownership ambiguity.

## Phase 2: Spawn and Grounding Reliability

- [x] Audit player spawn Y source and chunk readiness gates
- [x] Enforce safe ground spawn contract (no air spawn/fall-through on mode start/respawn)
- [ ] Audit helipad/helicopter collision contributions to effective ground height
- [x] Separate standable vs non-standable collision effects for grounding where needed

Acceptance:
- 10/10 mode starts and 10/10 respawns ground correctly in A Shau.
- No multi-meter snap/drop artifacts immediately after spawn.

## Phase 3: Tactical Contact Fidelity

- [ ] Define tactical vs strategic contact policy
- [x] Ensure minimap/HUD default to tactical-confirmed contacts for combat navigation
- [ ] Keep strategic intel available as clearly different layer/style
- [ ] Verify player can navigate to shown tactical contacts and find visible enemies

Acceptance:
- Tactical contacts are physically present/engageable when shown.
- Strategic contacts are clearly marked as non-immediate intel.

## Phase 4: Gameplay Flow and Time-to-Contact

- [ ] Add A Shau phase structure for testing and play:
  - [ ] insertion
  - [ ] first skirmish
  - [ ] objective assault
  - [ ] hold/counterattack
- [ ] Implement or tune spawn/objective biasing to force early contact
- [ ] Target first engagement within 60-120 seconds consistently

Acceptance:
- Player reaches meaningful skirmish in target window across repeated starts.
- Mode can be tested without long dead travel loops.

## Phase 5: Harness and Damage Realism Controls

- [ ] Confirm harness scripts are isolated from normal gameplay sessions
- [ ] Make invulnerability/auto-heal/auto-respawn controls explicit and documented
- [ ] Validate realistic damage/death behavior when realism flags are enabled

Acceptance:
- No harness synthetic behavior leaks into normal play.
- Damage realism is configurable and reproducible.

## Validation Matrix

- [x] Build passes (`npm run build`)
- [x] Targeted tests pass for modified systems
- [ ] A Shau manual test pass:
  - [ ] start spawn
  - [ ] respawn
  - [ ] map/HUD contact fidelity
  - [ ] first-contact timing
  - [ ] sustained combat loop

## Iteration Log

### Iteration 001 - Plan initialization (2026-02-21)

Changes:
- Added `docs/ASHAU_VALLEY_IMPLEMENTATION_PLAN.md`.
- Established phased implementation sequence and acceptance criteria.

Validation:
- Document created and ready for continuous updates.

Next:
- Begin Phase 0 baseline/repro capture and write exact deterministic repro steps.

### Iteration 002 - Core runtime fixes (2026-02-21)

Changes:
- Population authority:
  - Added autonomous spawn gating in `CombatantSpawnManager` and `CombatantSystem`.
  - `GameModeManager` now disables autonomous spawning and clears legacy materialized state when `warSimulator.enabled`.
- Strategic/materialized coherence:
  - Added combatant liveness query in `CombatantSystem`.
  - `MaterializationPipeline` now reconciles missing/dead materialized combatants back into strategic state.
- Grounding stability:
  - Player baseline ground height now uses terrain-only height in `PlayerMovement` (sandbag standing remains additive).
- Contact fidelity:
  - Full map strategic-agent rendering now default-off unless `globalThis.__FULLMAP_SHOW_STRATEGIC_AGENTS__ === true`.
- A Shau engagement flow:
  - Added A Shau insertion-oriented spawn resolver in `GameEngineInit` and reused it for pre-generation + startup spawn.
  - A Shau respawn now prefers closest US-controlled forward zone to enemy/contested zones before falling back to base.

Validation:
- Pending compile/test validation (next step in this cycle).

Next:
- Build + targeted tests.
- Phase 0 repro checklist capture.
- Verify time-to-contact and tactical contact fidelity manually in A Shau.

### Iteration 003 - Compatibility + test validation (2026-02-21)

Changes:
- `PlayerRespawnManager`:
  - Added `getCurrentGameMode()` compatibility helper that supports both:
    - `gameModeManager.getCurrentMode()`
    - `gameModeManager.currentMode` property fallback
  - Updated `respawnAtBase()` A Shau branch to use compatibility helper.
- Preserved terrain grounding compatibility in `PlayerMovement` by resolving terrain height via:
  - `getTerrainHeightAt` -> `getHeightAt` -> `getEffectiveHeightAt` (first available)

Validation:
- Targeted tests passed:
  - `npx vitest run src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerRespawnManager.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `3` files passed, `192` tests passed.
- Build status from prior cycle remains green (`npm run build`).

Notes:
- Test stderr still includes legacy warnings from mock setup paths (e.g. spatial grid init warning, fallback spawn logs), but no assertion failures.

Next:
- Phase 0 baseline/repro artifact capture for A Shau manual path.
- Phase 3 tactical-vs-strategic contact policy definition and UI legend treatment.
- Phase 4 first-contact flow validation and tuning toward 60-120s engagement window.

### Iteration 004 - Build validation refresh (2026-02-21)

Changes:
- Re-ran production build after compatibility patches.

Validation:
- `npm run build` passed (`tsc` + `vite build` successful).
- Existing known warning: large JS chunks (`>500kB`) still present; this is optimization backlog, not a functional failure.

Next:
- Execute A Shau manual validation checklist and capture reproducible artifacts in Phase 0.

### Iteration 005 - Materialization grounding reliability (2026-02-21)

Changes:
- `CombatantSystem.materializeAgent(...)` now terrain-snaps external (WarSimulator) agents at spawn time:
  - Resolver order: `getTerrainHeightAt` -> `getHeightAt` -> `getEffectiveHeightAt`
  - Cache fallback: `getHeightQueryCache().getHeightAt(...)`
  - Materialized combatant Y set to `terrain + 3` for consistency with squad spawning.
- `WarSimulator.updateSimulatedMovement(...)` now keeps non-materialized agent Y synchronized with terrain during movement, reducing stale altitude carryover before later materialization.
- `PlayerMovement` terrain-height resolver expanded for compatibility:
  - `getTerrainHeightAt` -> `getHeightAt` -> `getHeightAtWorldPosition` -> `getEffectiveHeightAt`

Validation:
- Targeted tests passed:
  - `npx vitest run src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerRespawnManager.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `3` files passed, `192` tests passed.
- Build passed:
  - `npm run build` successful (`tsc` + `vite build`).

Hypothesis impact:
- Addresses high-probability cause of "HUD/map enemy present but no visible enemy on arrival" where materialized agents could appear at stale elevations after long-distance strategic movement.

Next:
- Manual A Shau verification pass focused on:
  - tactical contact physical visibility at marker location
  - spawn/respawn ground stability over repeated cycles
  - early skirmish reachability without long dead travel loops

### Iteration 006 - Frontline seeding for time-to-contact (2026-02-21)

Changes:
- `WarSimulator.spawnStrategicForces(...)` now includes contested/neutral frontline seeding:
  - Detects frontline objective zones (`owner === null` or `state === contested`)
  - Allocates an explicit frontline squad share per faction at start (when zones exist)
  - Rebalances initial distribution to reduce HQ over-concentration:
    - HQ reserve + owned-zone deployment + frontline objective deployment
  - Adds fallback to HQ deployment when owned non-HQ zones are unavailable.
- `GameModeManager` now passes `state` and `ticketBleedRate` into WarSimulator zone spawn input so frontline selection can prioritize higher-value objectives.

Validation:
- Targeted tests passed:
  - `npx vitest run src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerRespawnManager.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `3` files passed, `192` tests passed.
- Build passed:
  - `npm run build` successful (`tsc` + `vite build`).

Hypothesis impact:
- Reduces "all troops start at base" openings and shortens path to first skirmish in large A Shau sessions.

Next:
- Run manual A Shau pass to verify:
  - first engagement consistently within target window
  - reduced dead-travel loops around Hill 937
  - visible enemy presence at tactical markers

### Iteration 007 - Frontline spawn regression tests (2026-02-21)

Changes:
- Added `src/systems/strategy/WarSimulator.test.ts` with focused A Shau flow coverage:
  - Verifies both factions seed forces into contested/neutral frontline zones.
  - Verifies high `ticketBleedRate` frontline objective is prioritized when only one frontline squad allocation is available.

Validation:
- Targeted tests passed:
  - `npx vitest run src/systems/strategy/WarSimulator.test.ts src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerRespawnManager.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `4` files passed, `194` tests passed.
- Build passed:
  - `npm run build` successful (`tsc` + `vite build`).

Impact:
- Locks in the intended A Shau opening pattern so future refactors do not regress back to HQ-only clustering.

Next:
- Add runtime observability counters for A Shau:
  - spawn distribution by zone/faction
  - materialized-vs-strategic contact reconciliation near player
- Execute manual validation pass using those counters.

### Iteration 008 - Runtime diagnostics hook (2026-02-21)

Changes:
- Added runtime console diagnostic entrypoint in `src/core/bootstrap.ts`:
  - `window.__ashauDiagnostics()`
- Diagnostic payload includes:
  - current mode/mode name/world size
  - WarSimulator state (`totalAgents`, `aliveAgents`, `materializedAgents`)
  - live tactical combatant counts by faction
  - nearby player contact counts by radius (`250`, `500`, `800`) for:
    - tactical OPFOR combatants
    - non-materialized strategic agents
  - top zone occupancy snapshot (US/OPFOR counts per nearest zone)

Validation:
- Targeted tests passed:
  - `npx vitest run src/systems/strategy/WarSimulator.test.ts src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerRespawnManager.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `4` files passed, `194` tests passed.
- Build passed:
  - `npm run build` successful (`tsc` + `vite build`).

Manual validation instructions:
- In A Shau runtime console, run `window.__ashauDiagnostics()`.
- Capture snapshots at:
  - immediate mode start
  - first visual contact
  - post-respawn
  - after 5 minutes sustained combat

Next:
- Use diagnostics snapshots to close Phase 0 repro checklist with concrete before/after evidence.

### Iteration 009 - Minimap tactical contact filtering (2026-02-21)

Changes:
- Updated `src/ui/minimap/MinimapRenderer.ts` combatant rendering policy:
  - Added tactical-range filter for combatant dots to reduce non-actionable distant contacts in large worlds.
  - Default tactical range:
    - `900m` when `worldSize >= 10000` (A Shau scale)
    - unlimited for smaller worlds
  - Added override for controlled debugging/tuning:
    - `globalThis.__MINIMAP_TACTICAL_RANGE__ = <meters>`
- Added focused tests in `src/ui/minimap/MinimapRenderer.test.ts`:
  - Verifies distant combatants are filtered by default on A Shau-scale worlds.
  - Verifies explicit global override expands visible tactical range.

Validation:
- Targeted tests passed:
  - `npx vitest run src/ui/minimap/MinimapRenderer.test.ts src/systems/strategy/WarSimulator.test.ts src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerRespawnManager.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `5` files passed, `196` tests passed.
- Build passed:
  - `npm run build` successful (`tsc` + `vite build`).

Impact:
- Reduces “map says enemies are here but none visible” false-navigation loops by limiting minimap tactical markers to likely-engageable distances in huge maps.

Next:
- Use `window.__ashauDiagnostics()` snapshots to quantify:
  - nearby tactical OPFOR counts vs player-reported visual contacts
  - whether first-contact timing converges toward target window

### Iteration 010 - Strategic reseed idempotence (2026-02-21)

Changes:
- Hardened `WarSimulator.spawnStrategicForces(...)` against duplicate accumulation:
  - Added `resetStrategicForces()` call at spawn start to clear previous strategic state and reset ID counters.
- Added regression test in `src/systems/strategy/WarSimulator.test.ts`:
  - Repeated spawn calls no longer increase total agent count beyond configured target.

Validation:
- Targeted tests passed:
  - `npx vitest run src/systems/strategy/WarSimulator.test.ts src/ui/minimap/MinimapRenderer.test.ts src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerRespawnManager.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `5` files passed, `197` tests passed.
- Build passed:
  - `npm run build` successful (`tsc` + `vite build`).

Impact:
- Prevents silent strategic overpopulation when mode configuration is reapplied, reducing long-session perf degradation risk and preserving expected tactical/materialized behavior.

Next:
- Execute live A Shau diagnostics snapshots and convert findings into final Phase 0 closure + Phase 3/4 tuning actions.

### Iteration 011 - Session telemetry in diagnostics (2026-02-21)

Changes:
- Added session counters in `PlayerRespawnManager`:
  - `deathCount`
  - `respawnCount`
  - exposed via `getSessionRespawnStats()`
- Extended `window.__ashauDiagnostics()` output in `src/core/bootstrap.ts` with:
  - `sessionTelemetry.elapsedMs`
  - `sessionTelemetry.firstTacticalContactMs` (first time nearby tactical OPFOR <= 250m was observed)
  - `sessionTelemetry.diagnosticsCalls`
  - `sessionTelemetry.lastNearbyTactical250`
  - `sessionTelemetry.peakNearbyTactical250`
  - `sessionTelemetry.respawn` (deaths/respawns from `PlayerRespawnManager`)
- Session telemetry resets automatically when engine bootstrap completes.

Validation:
- Targeted tests passed:
  - `npx vitest run src/systems/player/PlayerRespawnManager.test.ts src/systems/strategy/WarSimulator.test.ts src/ui/minimap/MinimapRenderer.test.ts src/systems/player/PlayerMovement.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `5` files passed, `197` tests passed.
- Build passed:
  - `npm run build` successful (`tsc` + `vite build`).

Impact:
- Provides concrete, session-level measurements for contact flow and death/respawn behavior, enabling deterministic Phase 0 closure criteria instead of subjective play-feel only.

Next:
- Capture A Shau manual run snapshots and append results to this document:
  - mode start
  - first contact
  - post-respawn
  - 5-minute sustained-combat mark

### Iteration 012 - Automated diagnostics capture (2026-02-21)

Changes:
- Added automation script:
  - `scripts/ashau-diagnostics-capture.ts`
  - Starts dev server, launches Playwright, runs A Shau mode, captures required checkpoints.
- Added robust dev-server shutdown handling in the script (`SIGTERM` + `SIGKILL` fallback).
- Executed automated run and captured all required checkpoints.

Artifacts:
- `artifacts/ashau-diagnostics/2026-02-21T19-08-16-193Z/capture.json`
- `artifacts/ashau-diagnostics/2026-02-21T19-08-16-193Z/summary.md`

Captured checkpoints:
- `mode_start`:
  - `elapsedMs=47402`
  - `nearby tactical OPFOR r250=0 r500=0 r800=2`
  - `materializedAgents=48`
- `first_contact`:
  - `elapsedMs=63539`
  - `firstTacticalContactMs=63539`
  - `nearby tactical OPFOR r250=1 r500=3 r800=14`
  - `materializedAgents=60`
- `post_respawn`:
  - `elapsedMs=66987`
  - `respawn stats deaths=1 respawns=1`
  - `nearby tactical OPFOR r250=0 r500=0 r800=0`
  - `materializedAgents=60`
- `sustained_5m`:
  - `elapsedMs=347561`
  - `firstTacticalContactMs=63539`
  - `nearby tactical OPFOR r250=0 r500=0 r800=0`
  - `respawn stats deaths=1 respawns=1`
  - `materializedAgents=60`

Findings:
- First contact occurred within target window (`~63.5s`), meeting Phase 4 timing intent for this run.
- Post-respawn and sustained snapshots show zero nearby tactical contacts in this unattended run, indicating player reinsertion pressure is still insufficient without active movement objective steering.

Validation:
- Automation run completed with all four checkpoints persisted in artifacts.

Next:
- Implement respawn follow-on pressure insertion policy for A Shau to avoid immediate no-contact states after respawn.
- Re-run `scripts/ashau-diagnostics-capture.ts` and compare `post_respawn` + `sustained_5m` nearby contact deltas.

### Iteration 013 - Respawn pressure insertion + validation rerun (2026-02-21)

Changes:
- A Shau respawn insertion logic upgraded in `src/systems/player/PlayerRespawnManager.ts`:
  - Added WarSimulator-aware enemy hotspot selection (`getEnemyHotspotNear(...)`).
  - Pressure insertion now anchors on real OPFOR hotspot near objective when available, then offsets toward nearest US forward zone.
  - Added `setWarSimulator(...)` wiring and connected it in `src/core/SystemConnector.ts`.
- Added targeted test coverage:
  - `src/systems/player/PlayerRespawnManager.test.ts` includes A Shau pressure-spawn branch assertion.
- Improved capture robustness:
  - `scripts/ashau-diagnostics-capture.ts` now supports broad first-contact detection (`r500/r800`) and deterministic process exit.

Validation:
- Tests/build:
  - `npx vitest run src/systems/player/PlayerRespawnManager.test.ts src/systems/strategy/WarSimulator.test.ts src/ui/minimap/MinimapRenderer.test.ts src/systems/player/PlayerMovement.test.ts src/systems/combat/CombatantSpawnManager.test.ts`
  - Result: `5` files passed, `198` tests passed.
  - `npm run build` passed.
- Automated capture rerun:
  - `artifacts/ashau-diagnostics/2026-02-21T19-45-01-739Z/capture.json`
  - `artifacts/ashau-diagnostics/2026-02-21T19-45-01-739Z/summary.md`

Comparative outcome vs prior run:
- Prior run (`2026-02-21T19-08-16-193Z`):
  - `post_respawn` nearby OPFOR: `r250=0 r500=0 r800=0`
  - `sustained_5m` nearby OPFOR: `r250=0 r500=0 r800=0`
- New run (`2026-02-21T19-45-01-739Z`):
  - `post_respawn` nearby OPFOR: `r250=0 r500=0 r800=14`
  - `sustained_5m` nearby OPFOR: `r250=0 r500=0 r800=14`
  - `firstTacticalContactMs=72719` by session telemetry

Interpretation:
- Respawn pressure insertion materially improved post-respawn and sustained nearby-contact availability (within `800m`) in unattended runs.
- Close-contact (`<=250m`) still not consistently immediate, so next tuning should focus on narrowing insertion distance and/or increasing objective-side tactical concentration.

Next:
- Tune A Shau respawn insertion offset down for higher probability of `r250` contacts while preserving safety.
- Re-run diagnostics capture and target:
  - `post_respawn tacticalOpfor.r250 > 0`
  - `sustained_5m tacticalOpfor.r250 > 0` in automated baseline runs.

### Iteration 014 - Hotspot centroid tightening (2026-02-21)

Changes:
- Refined A Shau respawn pressure placement in `src/systems/player/PlayerRespawnManager.ts`:
  - Enemy hotspot now computed as centroid of the nearest OPFOR agent cluster (up to 10 nearest) instead of a single nearest agent sample.
  - Respawn insertion offset tightened when hotspot is available:
    - from roughly `80-160m` to `55-110m` (scaled by US/objective distance).
  - Fallback non-hotspot offset remains more conservative.

Validation:
- Targeted tests passed:
  - `npx vitest run src/systems/player/PlayerRespawnManager.test.ts src/systems/strategy/WarSimulator.test.ts src/ui/minimap/MinimapRenderer.test.ts`
  - Result: `3` files passed, `90` tests passed.
- Build passed:
  - `npm run build` successful (`tsc` + `vite build`).

Expected impact:
- Increase probability of close-proximity (`r250`) post-respawn contacts while keeping insertion directionality and safety bias.

Next:
- Re-run `scripts/ashau-diagnostics-capture.ts` to verify whether `post_respawn/sustained_5m` now cross `r250 > 0`.

### Iteration 015 - Post-push diagnostics verification (2026-02-21)

Artifacts:
- `artifacts/ashau-diagnostics/2026-02-21T20-16-51-768Z/capture.json`
- `artifacts/ashau-diagnostics/2026-02-21T20-16-51-768Z/summary.md`

Captured checkpoints:
- `mode_start`:
  - `elapsedMs=47745`
  - `nearby tactical OPFOR r250=0 r500=0 r800=0`
  - `materializedAgents=48`
- `first_contact_broad`:
  - `elapsedMs=48447`
  - `nearby tactical OPFOR r250=0 r500=0 r800=1`
  - `materializedAgents=52`
- `post_respawn`:
  - `elapsedMs=52646`
  - `nearby tactical OPFOR r250=0 r500=0 r800=9`
  - `respawn stats deaths=1 respawns=1`
  - `materializedAgents=60`
- `sustained_5m`:
  - `elapsedMs=348997`
  - `firstTacticalContactMs=71878`
  - `nearby tactical OPFOR r250=0 r500=0 r800=9`
  - `materializedAgents=60`

Outcome:
- Close-contact (`r250`) target still not reached in unattended runs.
- Mid-range pressure remains improved relative to pre-fix baseline (`r800` non-zero after respawn and at sustained checkpoint).
- First-contact timing remains within target envelope in this run (`~71.9s`).

Next:
- Introduce an optional “contact guarantee” respawn micro-offset policy for A Shau:
  - sample 8-12 candidate insertion points around hotspot
  - choose nearest point with highest nearby OPFOR tactical density estimate
  - reject points lacking loaded terrain ring
- Re-run diagnostics and target:
  - `post_respawn r250 > 0`
  - `sustained_5m r250 > 0`

### Iteration 016 - Contact-guarantee respawn sampling (2026-02-21)

Changes:
- Implemented contact-guarantee candidate sampling in `src/systems/player/PlayerRespawnManager.ts`:
  - Builds 11 candidate insertion points around hotspot anchor.
  - Scores candidates by nearby OPFOR density (`r250`, `r400`) with penalties for over-friendly clustering and excessive objective standoff.
  - Adds terrain-ready gating per candidate using chunk residency ring when chunk manager data is available.
  - Added chunk manager dependency setter and wiring in `src/core/SystemConnector.ts`.
- Kept hotspot centroid approach and integrated it into sampling anchor selection.

Validation:
- Tests/build:
  - `npx vitest run src/systems/player/PlayerRespawnManager.test.ts src/systems/strategy/WarSimulator.test.ts src/ui/minimap/MinimapRenderer.test.ts`
  - Result: `3` files passed, `90` tests passed.
  - `npm run build` passed.
- Diagnostics rerun:
  - `artifacts/ashau-diagnostics/2026-02-21T20-37-32-584Z/capture.json`
  - `artifacts/ashau-diagnostics/2026-02-21T20-37-32-584Z/summary.md`

Results:
- `post_respawn`: `r250=3`, `r500=3`, `r800=5` (target achieved for immediate close-contact after respawn).
- `sustained_5m`: `r250=0`, `r500=0`, `r800=4` (close-contact not sustained yet).
- `firstTacticalContactMs=45263` (~45.3s), comfortably inside target window.

Interpretation:
- Respawn insertion quality materially improved and now can deliver immediate skirmish conditions.
- Sustained close-contact still drifts outward; next tuning should focus on periodic player pressure nudges/objective retargeting during long unattended windows.

Next:
- Add lightweight sustained-contact assist policy:
  - if no tactical OPFOR within `250m` for >90s, bias next respawn/objective anchor inward by one tier.
- Re-run diagnostics aiming for `sustained_5m r250 > 0`.

### Iteration 017 - Sustained-contact assist pass + rerun (2026-02-21)

Changes:
- Added A Shau sustained-contact assist in `src/core/SystemUpdater.ts`:
  - Tracks nearby OPFOR contact window (`250m`).
  - If no close contact for >90s (with 120s cooldown), triggers pressure reinsertion via:
    - `playerRespawnManager.getAShauPressureInsertionSuggestion()`
    - `playerController.setPosition(..., 'ashau.contact_assist')`
    - short spawn protection (`2s`).
- Exposed pressure insertion suggestion method in `src/systems/player/PlayerRespawnManager.ts`.
- Enhanced respawn candidate quality:
  - Added multi-candidate scoring and terrain-ready filtering in `PlayerRespawnManager`.
  - Added chunk manager dependency wiring in `src/core/SystemConnector.ts`.

Validation:
- Tests/build:
  - `npx vitest run src/systems/player/PlayerRespawnManager.test.ts src/systems/strategy/WarSimulator.test.ts src/ui/minimap/MinimapRenderer.test.ts`
  - Result: `3` files passed, `90` tests passed.
  - `npm run build` passed.
- Diagnostics reruns:
  - `artifacts/ashau-diagnostics/2026-02-21T20-37-32-584Z/summary.md`
    - `post_respawn r250=3` (improved)
    - `sustained_5m r250=0`
  - `artifacts/ashau-diagnostics/2026-02-21T20-48-08-292Z/summary.md`
    - `post_respawn r250=1` (still improved vs baseline)
    - `sustained_5m r250=0`

Interpretation:
- Immediate post-respawn close-contact objective is now repeatedly achievable in unattended runs.
- Sustained 5-minute close-contact objective still not stable; player remains within broader contact envelope (`r800=9`) but not consistently in `r250`.

Next:
- Phase 4 sustained skirmish tuning:
  - reduce no-contact assist delay from `90s` to `60s` in A Shau
  - require reinsertion toward objective-side candidates with minimum OPFOR density threshold
  - optionally add low-amplitude periodic objective micro-shift toward active contested zone center
