# Carry-Overs Registry

Last verified: 2026-05-13

Single source of truth for "what's still hanging." Every cycle must close at
least one carry-over OR ship a user-observable feature; the carry-over count
strictly decreases or holds. If a cycle ends with a higher count than it
started, the cycle is `INCOMPLETE` per the rule in
[docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md).

## Rules

1. **Append-only when opening.** Every carry-over gets an entry the cycle it
   first appears.
2. **Move to "Closed" when closed.** Do not delete. The closed list is the
   shrinking-progress audit trail.
3. **No more than 12 active.** If active count hits 12, no new cycle can open
   without closing one first.
4. **Cycles-open count auto-increments at cycle close.** A carry-over open
   ≥3 cycles is a yellow flag; ≥5 is a red flag and must surface in the next
   cycle's plan.

## Active

| ID | Title | Opened | Cycles open | Owning subsystem | Blocking? | Notes |
|----|-------|--------|------------:|------------------|-----------|-------|
| DEFEKT-3 | Combat AI p99 — synchronous cover search in `AIStateEngage.initiateSquadSuppression` | cycle-2026-04-17-drift-correction-run | 8 | combat | yes (gates Phase F) | Phase 4 F2 (CoverQueryService → precomputed field + worker fallback). First surgical pass in Phase 3 R2. |
| DEFEKT-4 | NPC route-follow quality not signed off (slope-stuck, navmesh crowd disabled, terrain solver stalls) | cycle-2026-04-17-drift-correction-run | 8 | navigation | no | Phase 3 R5 (NavmeshSystem split) creates the seam; runtime acceptance after that. |
| STABILIZAT-1 | combat120 baseline refresh blocked (measurement trust WARN) | cycle-2026-04-21-stabilization-reset | 7 | perf-harness | yes (blocks all baseline updates) | Refresh on a quiet machine after Phase 0 lint installs; pair with the artifact-prune CI. |
| AVIATSIYA-1 / DEFEKT-5 | Helicopter rotor + close-NPC + explosion human visual review pending | cycle-2026-04-23-debug-cleanup | 6 | aviation / combat | no | Resolves via human playtest gate (Phase 0 rule 20). |
| KB-LOAD residual | Pixel Forge candidate import (vegetation) deferred behind owner visual acceptance | cycle-2026-05-08-stabilizat-2-closeout | 4 | assets | no | Strategic Reserve. Reopen only with explicit "go". |
| cloudflare-stabilization-followups | Web Analytics token provisioned but not verified live | cycle-2026-05-10-zone-manager-decoupling | 2 | release / cloudflare | no | Code-side subfindings are fixed and deployed in the 2026-05-10 release-stewardship pass: PostCSS resolves to 8.5.14, `_headers` has HSTS/CSP/Permissions-Policy, `robots.txt` + meta description exist, and unused preload hints are removed. Remaining action is the Pages dashboard Web Analytics toggle + live beacon verification; Cloudflare API access in this session returned authentication error 10000. |
| weapons-cluster-zonemanager-migration | Finish the IZoneQuery migration for the 5 remaining concrete `ZoneManager` imports in the weapons cluster: `FirstPersonWeapon`, `WeaponAmmo`, `AmmoManager`, `AmmoSupplySystem`, `PlayerHealthSystem` | cycle-2026-05-10-zone-manager-decoupling | 2 | weapons | no | Out-of-scope for Phase 2 R2 batches A/B/C; aspirational ≤5 ZoneManager-import target missed. Phase 3+ can finish; cycle-2026-05-10's ≤20 success criterion was met (achieved 17 read / 5 concrete). |
| konveyer-large-file-splits | Two KONVEYER-grown files added to `lint-source-budget.ts` grandfather list at the 2026-05-12 master-merge gate: `HosekWilkieSkyBackend.ts` (807 LOC, slated for the TSL fragment-shader sky port) and `WaterSystem.ts` (733 LOC, slated for VODA-1 water-shader work) | exp→master merge prep 2026-05-12 | 0 | environment | no | Split-debt tracking. Both files grew during the KONVEYER campaign (sky through slices 13-15 + sky-refresh fix; water during the scene-parity standard-material port). Each is grandfathered with a named follow-up round in `scripts/lint-source-budget.ts`. Closes when the named follow-up cycles ship and the files drop below 700 LOC. |

## Parked

Items intentionally de-prioritized but not closed. They remain owed work;
they just do not count against the ≤12 active rule while parked. To reactivate,
move the row back into the Active table and reset its `Cycles open` counter to
the cycle that re-opens it.

| ID | Title | Parked | Origin | Reason | Reactivate when |
|----|-------|--------|--------|--------|-----------------|
| AVIATSIYA-2 | AC-47 low-pitch takeoff single-bounce | 2026-05-12 vision-pivot park | cycle-2026-04-21-stabilization-reset (7 cycles open at park) | Helicopter / fixed-wing polish. Not vision-critical under the 2026-05-12 directions (WebGPU experimental + driveable land vehicles). Anchor at `Airframe` ground rolling. | Phase 4 F5 close-out resumes, or a fixed-wing-feature cycle opens. |
| AVIATSIYA-3 | Helicopter parity audit: HelicopterVehicleAdapter vs HelicopterPlayerAdapter | 2026-05-12 vision-pivot park | cycle-2026-04-22-heap-and-polish (7 cycles open at park) | Audit memo exists at `docs/rearch/helicopter-parity-audit.md`; work is documented, not actioned. Not vision-critical under the 2026-05-12 directions. | Phase 4 F5 close-out resumes, or the helicopter-adapter cluster is touched again. |

History log:

- 2026-05-12 — vision-pivot park: AVIATSIYA-2 and AVIATSIYA-3 moved Active → Parked
  to free slots in the active-list budget for the WebGPU (KONVEYER-11 successor
  IDs) and driveable-land-vehicle (VEKHIKL-3 successor IDs) directions confirmed
  by the owner on 2026-05-12. No status change for the two items themselves.
- 2026-05-12 — master-merge close: KONVEYER-10 moved Active → Closed via
  [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
  (commit `1df141ca`), which folded the `exp/konveyer-webgpu-migration` branch
  into `master`. Active count: 9 → 8.

## Closed

(Entries get appended here as carry-overs close. Format: `<ID> | <title> | closed in <cycle-id> | resolution one-liner`.)

- worldbuilder-invulnerable-wiring | `PlayerHealthSystem.takeDamage` early-return when WorldBuilder `invulnerable` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | wired in `src/systems/player/PlayerHealthSystem.ts` behind `import.meta.env.DEV`; behavior test in `PlayerHealthSystem.test.ts`.
- worldbuilder-infinite-ammo-wiring | `AmmoManager` / `WeaponShotExecutor` skip decrement when `infiniteAmmo` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AmmoManager.consumeRound()` returns true without decrement when flag active; new `AmmoManager.test.ts` covers the no-op.
- worldbuilder-noclip-wiring | `PlayerMovement` skip terrain collision + gravity when `noClip` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | gated gravity / sandbag / terrain-block / ground-snap / world-boundary in `PlayerMovement.simulateMovementStep`; behavior tests in `PlayerMovement.test.ts`.
- worldbuilder-postprocess-wiring | `PostProcessingManager.setEnabled` consumed by WorldBuilder `postProcessEnabled` flag | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `PostProcessingManager.beginFrame/endFrame` consult `getWorldBuilderState()`; tests recordingrenderer assertions.
- worldbuilder-tod-wiring | AtmosphereSystem honors WorldBuilder `forceTimeOfDay` (-1 = follow live) | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AtmosphereSystem.update` snaps `simulationTimeSeconds` to `forceTimeOfDay * dayLengthSeconds` when in [0,1] and the active preset has a `todCycle`.
- worldbuilder-ambient-audio-wiring | AudioManager consumes WorldBuilder `ambientAudioEnabled` flag | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AudioManager.update` calls `ambientManager.setVolume(0)` on flag-flip-down and `setVolume(1)` on flip-up; idempotent across steady ticks.
- artifact-prune-baseline-pin-fix | `artifact-prune` baseline-pin matching accepts both bare perf-baseline directory names and `artifacts/perf/` paths | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` with source update in `scripts/artifact-prune.ts`.
- worldbuilder-oneshotkills-wiring | `oneShotKills` WorldBuilder flag wired into NPC/projectile combat damage | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` in `CombatantCombat` and `CombatantSystemDamage`, with behavior tests.
- perf-doc-script-paths-drift | perf docs and asset acceptance references updated from retired `scripts/projekt-143-*` paths to retained commands/archive paths | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` across `docs/perf/*` and `docs/ASSET_ACCEPTANCE_STANDARD.md`.
- KONVEYER-10 | Rest-of-scene WebGPU parity and frame-budget attribution after K0-K9 branch-review completion | closed in 2026-05-12 master-merge (PR #192) | `exp/konveyer-webgpu-migration` merged into `master` via [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192) (commit `1df141ca`); WebGPU + TSL becomes the default production renderer with WebGL2 fallback. R2-R4 follow-on materialization work queued as separate cycles on master.

## Reading the table

- **Cycles open** = number of cycles this item has appeared in the active list,
  including the cycle it was opened.
- **Blocking?** = does this gate the canonical 3,000-NPC vision sentence
  becoming truthful, or block a release? `yes` items must be addressed before
  a cycle can claim "stabilized."
- **Owning subsystem** = the subsystem dir in `src/systems/` that owns the fix.

## Update protocol

- The orchestrator updates `Cycles open` at end-of-cycle ritual (see
  `docs/AGENT_ORCHESTRATION.md`). Programmatic helper:
  `npx tsx scripts/cycle-validate.ts --increment-carryovers`.
- A PR that closes a carry-over must reference its ID in the PR description
  and move the row to the Closed table in the same PR.
- Do not edit this file's `Last verified` line manually; the
  `cycle-validate.ts` increment step refreshes it.
