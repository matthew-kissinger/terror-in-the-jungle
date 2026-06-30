# Playtest memo — cycle-2026-06-28-deploy-armory-faction-select (Phase 5, Field Readiness)

> **Automated gates complete; owner feel-walk pending.** Closed under
> `posture: autonomous-loop` (CAMPAIGN_2026-06-28-field-readiness, Phase 5).
> Merged on CI green. Phase 5 rebuilds the deploy/armory/faction surfaces the
> owner called out: an A Shau side picker, a weapon-stats readout, a decluttered
> armory, a navigable respawn map, honest helipad labels, and a selectable
> crew-a-vehicle spawn. **Not perf-gated** (UI/deploy/spawn work, no combat hot
> path — every PR's `perf` job skipped or was non-gating). The wiring is
> unit/behaviour-test-proven; the *feel* (map navigation, armory legibility,
> faction flow) is the owner's call.

## What shipped (7 PRs, all merged to master, all `fence_change: no`)

| Task | PR | Merge | Change |
|---|---|---|---|
| deploy-map-3d-spike | [#445](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/445) | `82c35430` | feasibility doc for a "fast 3D map" — recommends a baked low-poly terrain proxy + markers (no build this campaign) |
| faction-side-picker | [#444](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/444) | `01ab95d9` | A Shau BLUFOR-vs-OPFOR side picker (`isFactionSelectable`/`FACTION_SELECTABLE_MODES`; `ModeSelectScreen` emits `{mode, alliance?}` into the existing `resolveLaunchSelection`) — A Shau + future premiere ONLY |
| weapon-stats-panel | [#446](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/446) | `15f785f3` | armory surfaces the existing `WeaponSpec` (rpm/damage/falloff/recoil/ADS) via `WEAPON_SPECS` + a static `getWeaponSpec` accessor + a DeployScreen stats block |
| deploy-map-navigation | [#447](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/447) | `22bbf356` | bounded pan + zoom/recenter + spawn-cycling on the respawn map (`OpenFrontierRespawnMapUtils`), larger hit targets — A Shau's 21km canvas usable |
| armory-layout-reflow | [#448](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/448) | `166d5ef7` | declutter the armory column to a single selection affordance (removed redundant PREV/NEXT + chip-strip duplication) |
| helipad-spawn-truth | [#449](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/449) | `aa9eb6a2` | helipad spawns relabel to "Forward Pad" when no boardable heli is provisioned (`BoardableHelicopterPresence` interface + `HelicopterModel.hasBoardableHelicopterForHelipad`, wired at `StartupPlayerRuntimeComposer`) — the label never lies |
| crew-vehicle-selectable | [#450](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/450) | `392de7d2` | CREW-A-VEHICLE is now a real spawn: selecting it adopts the vehicle position (Deploy enables), shows the vehicle marker + an "F to board" hint, and lands the player on foot at the vehicle via the shared `confirmRespawn→respawn` path |

## Automated evidence

- **Behavior tests** (not implementation-mirror) across the phase: faction-select
  resolves alliance into the launch path; weapon-stats reads the shared spec
  table; map pan clamps to bounds + spawn cycling advances/recenters; helipad
  label matches boardable-heli presence; **crew-vehicle now sets a valid
  deployable spawn at the vehicle position** (the old no-op-asserting test was
  replaced — the contract is explicitly inverted).
- **No perf gate** (manifest: Phase 5 is UI/deploy, not a combat hot path). Every
  PR's `perf` job was `skipping`/non-gating; `perf-changes` confirmed no hot-path
  diff. No combat120 A/B required.
- **CI green** on all 7 PRs (lint, lint:budget, test, build, smoke, mobile-ui).

## What the owner should walk (live feel — the actual gate)

1. **A Shau faction picker:** launch A Shau — the side/faction selector should
   appear; pick BLUFOR (US/ARVN) then OPFOR (NVA/VC) and confirm the deploy + HUD
   reflect the chosen side. Confirm it does NOT appear on the standard modes.
2. **Armory:** cycle weapons — the stats readout (rpm/damage/falloff/recoil/ADS)
   should update per weapon; the column should read as a single clean selection
   affordance (no redundant PREV/NEXT + chip duplication).
3. **Respawn map:** pan (should clamp at the edges, no dragging off into void),
   zoom in/out, recenter, and cycle spawns — A Shau's 21km map should be
   navigable and spawn points easy to hit.
4. **Helipad honesty:** a spawn labeled for a helicopter should have a boardable
   one on arrival; otherwise it should read "Forward Pad" (on-foot) — the label
   should never promise a heli that isn't there.
5. **Crew a vehicle:** select the CREW-A-VEHICLE option — Deploy should enable,
   the vehicle marker + "F to board" hint should show, and deploying should land
   you at the vehicle to board it (was a dead no-op before).

## Notes

- No reviewer scope (UI / deploy / player-spawn — no `src/systems/combat/**` or
  terrain/nav).
- **Shared-file serialization:** `DeployScreen.ts` was co-edited by 4 tasks and
  `PlayerRespawnManager.ts` by 2; merges were serialized per the DAG (weapon-stats
  → armory-reflow; deploy-map-nav → helipad-spawn-truth → crew-vehicle) with
  rebases, resolving the `lint-source-budget.ts` snapshot lines per merger.
- **Budget-ratchet admissions (in-cycle growth, sanctioned by the briefs — no new
  CARRY_OVERS row):** `DeployScreen.ts` net to 1142 LOC/76 methods across the
  phase; `PlayerRespawnManager.ts` 757→800 LOC/60 methods (crew-vehicle);
  `StartupPlayerRuntimeComposer`/`HelicopterModel` raised for helipad-spawn-truth.
  Per the one-way ratchet; the standing split target for these surfaces remains.
