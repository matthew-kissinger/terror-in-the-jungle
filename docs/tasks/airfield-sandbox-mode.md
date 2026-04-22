# airfield-sandbox-mode: full-engine flight sandbox — spawn at main_airbase, claim an aircraft, no combat pressure

**Slug:** `airfield-sandbox-mode`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 2
**Priority:** P1 — primary deliverable for flight-feel iteration in authentic environment.
**Playtest required:** RECOMMENDED post-merge (manual fly-around is the final acceptance; probe-verified up to spawn + claim).
**Estimated risk:** medium — touches director config + spawn logic; wrong knob suppresses combat in the wrong mode.
**Budget:** ≤400 LOC.
**Files touched:**

- Modify: `src/config/gameModeDefinitions.ts` (fill in `AIRFIELD_SANDBOX` definition stubbed by `test-mode-launcher`).
- Modify: `src/core/ModeStartupPreparer.ts` (spawn location + initial vehicle claim for `AIRFIELD_SANDBOX`).
- Possibly modify: scenario composer file(s) if suppressing the combat director requires a config flag — investigate via grep for `WarSimulator` initialization.
- Add: behavior test asserting: spawn pose is near main_airbase parking; no enemy faction is materialized at t=10s; an A-1 Skyraider is claimable within 10m.

## Required reading first

- `src/config/gameModeDefinitions.ts` — current mode definitions, especially `AI_SANDBOX` (closest existing analog) and the `A_SHAU_VALLEY` definition (for real-terrain reference).
- `src/config/gameModeTypes.ts` — `GameModeConfig` shape, `WarSimulatorConfig`, `RespawnRules`.
- `src/core/ModeStartupPreparer.ts:applyLaunchSelection` — spawn-point selection logic.
- `src/core/GameplayRuntimeComposer.ts` — how the gameplay-loop systems are composed per mode (check for a per-mode flag that toggles combat director).
- `src/core/OperationalRuntimeComposer.ts` — operational-system composition.
- `docs/blocks/*.md` — whichever block covers combat/director/faction materialization.

## Diagnosis

Flight-feel iteration today requires: launch the full game, wait through a menu, wait through loading, enter a scenario, find an aircraft, avoid combat. That's 60+ seconds of friction and a fighting environment that does not isolate the behavior under test. The existing `?mode=flight-test` (isolated scene) is TOO isolated — no real terrain, no airfield envelope, no atmosphere, no vegetation. This task fills the middle ground: the real engine stack with the real map, but with combat pressure OFF and spawn-to-claim flow compressed to <5 seconds.

**Composer-gate verification (against HEAD `40ddfac`)** — the brief's assumption that `warSimulator.enabled = false` suppresses enemy materialization is CONFIRMED by the code:
- `src/systems/strategy/WarSimulator.ts:35` — `private enabled = false` (default off).
- `src/systems/strategy/WarSimulator.ts:139` — `this.enabled = config.enabled;` (set from config at init).
- `src/systems/strategy/WarSimulator.ts:82` — `update()` early-returns if `!this.enabled`.
- `src/core/ModeStartupPreparer.ts:354` — `if (!config.warSimulator?.enabled || !engine.systemManager.warSimulator.isEnabled()) { return; }` guards `restorePersistentWarState`.
- `src/core/SystemUpdater.ts:175-178` — the per-tick WarSimulator update chain already calls `update()` which the instance's own `enabled` gate short-circuits.

So setting `warSimulator: { enabled: false, ... }` on `AIRFIELD_SANDBOX_CONFIG` IS the right lever — the WarSimulator is always constructed, but its init picks up `enabled: false` from the mode config and all its update paths become no-ops. `factionMix` is also read at `ModeStartupPreparer.ts:114`; listing BLUFOR-only is a safe defense-in-depth even though the war-sim gate alone suffices.

## Fix

### 1. Mode definition

`AIRFIELD_SANDBOX` in `gameModeDefinitions.ts`:

- `terrainSeed`: reuse `a_shau_valley` or a purpose-seeded real-map variant (pick one map that has a working `main_airbase`; A Shau is the canonical choice per MapSeedRegistry).
- `isTestMode: true`.
- `warSimulator`: `{ enabled: false, ... }` (set remaining fields to sensible defaults to pass type checks, but the disabled flag gates materialization).
- `factionMix`: BLUFOR-only; no OPFOR agents defined — prevents the director from having anything to spawn even if a stray init path runs.
- `respawnRules`: instant respawn at same airfield (in case the player dies from terrain or falls out of a plane).
- `zones`: just `main_airbase` as a single capturable zone owned by BLUFOR; no bleed, no timer. (Or define the objective timer as `Infinity` / disabled; pick whichever the mode config supports cleanly.)
- `scale`: default; the flight ceiling is what matters, not LOD ranges.
- `weather`: enabled, `initialState: CLEAR`, no transitions (flight feel is the focus; weather noise is avoided).

### 2. Spawn + vehicle claim

`ModeStartupPreparer.applyLaunchSelection()` adds a case for `AIRFIELD_SANDBOX`:
- Spawn position: next to a parked Skyraider at `main_airbase` parking (use the parking-spot registry; grep `parkingSpots` or similar in the airfield config).
- Facing: toward the aircraft so "press E to enter" is immediate.
- Optional: pre-claim the aircraft on spawn so pilot flow is one-step (launch → already in cockpit, engine off, on the parking spot). Simplest shape.

### 3. Combat director off

Confirm the runtime composer respects `warSimulator.enabled === false`. If not, add a conditional in the composer that skips combat-director wire-up when the mode is a test mode. Do NOT edit `src/systems/combat/**` for this — the gate is at composition, not inside combat.

### 4. Safety rails

- If any OPFOR agent somehow materializes at t=10s, the behavior test fails (catches composer bugs).
- If the spawn is > 20m from the nearest parked aircraft, fail (catches spawn logic regressions).

## Steps

1. Read "Required reading first."
2. Study `AI_SANDBOX` mode as the nearest analog — it already suppresses objectives; does it suppress director materialization? If so, mirror.
3. Fill in `AIRFIELD_SANDBOX` definition.
4. Wire spawn/claim.
5. Write behavior test that boots the mode (in a headless engine harness — look at existing scenario integration tests in `src/integration/scenarios/*.test.ts` for patterns).
6. `npm run lint`, `npm run test:run`, `npm run build`.
7. Manual smoke: `npm run dev`, visit `?mode=airfield-sandbox`, confirm spawn + aircraft claim + no enemy AI + real atmosphere.
8. Screenshot of the initial cockpit view and a cruise shot. Commit to `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/airfield-sandbox-mode/`.

## Exit criteria

- `?mode=airfield-sandbox` (or via the launcher menu) boots to a cockpit at `main_airbase` with an A-1 ready.
- No OPFOR agents materialize; behavior test asserts this at t=10s.
- Real terrain + atmosphere + weather render correctly.
- Flight works end-to-end: taxi → takeoff → cruise → land → exit.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Evidence: two screenshots committed.

## Non-goals

- Do not modify `src/systems/combat/**`. The gate is composition-level config, not a combat-system edit.
- Do not add new aircraft types or new airfields. Existing `main_airbase` is sufficient.
- Do not add tutorials, prompts, or UI copy beyond what the launcher already adds.
- Do not implement weather cycling or TOD cycling for this mode — static `CLEAR` / noon.
- Do not wire any recording/replay hooks (that's a separate workstream).

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- WarSimulator gate verification turns up a code path that ignores `isEnabled()` (e.g., a spawn path outside `WarSimulator.update()` that materializes agents regardless) → STOP, file a finding, reduce scope to "mode exists, combat may not be fully suppressed" and flag for a follow-up.
- Spawn-point registry doesn't expose main_airbase parking coordinates as a reachable API → acceptable to fall back to a hardcoded spawn near the known main_airbase center + TODO note in the PR body. This is NOT a STOP.

## Pairs with

- `test-mode-launcher` — provides the enum + URL routing. If it lands first, this task plugs into its stub.
- Can ship independently of `debug-hud-registry` and `playtest-capture-overlay` but strongly benefits from both during manual validation.
