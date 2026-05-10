# Carry-Overs Registry

Last verified: 2026-05-09

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
| DEFEKT-3 | Combat AI p99 — synchronous cover search in `AIStateEngage.initiateSquadSuppression` | cycle-2026-04-17-drift-correction-run | 7 | combat | yes (gates Phase F) | Phase 4 F2 (CoverQueryService → precomputed field + worker fallback). First surgical pass in Phase 3 R2. |
| DEFEKT-4 | NPC route-follow quality not signed off (slope-stuck, navmesh crowd disabled, terrain solver stalls) | cycle-2026-04-17-drift-correction-run | 7 | navigation | no | Phase 3 R5 (NavmeshSystem split) creates the seam; runtime acceptance after that. |
| STABILIZAT-1 | combat120 baseline refresh blocked (measurement trust WARN) | cycle-2026-04-21-stabilization-reset | 6 | perf-harness | yes (blocks all baseline updates) | Refresh on a quiet machine after Phase 0 lint installs; pair with the artifact-prune CI. |
| AVIATSIYA-1 / DEFEKT-5 | Helicopter rotor + close-NPC + explosion human visual review pending | cycle-2026-04-23-debug-cleanup | 5 | aviation / combat | no | Resolves via human playtest gate (Phase 0 rule 20). |
| AVIATSIYA-3 | Helicopter parity audit: HelicopterVehicleAdapter vs HelicopterPlayerAdapter | cycle-2026-04-22-heap-and-polish | 6 | aviation | no | Phase 4 F5 close-out. Audit memo exists at `docs/rearch/helicopter-parity-audit.md`. |
| AVIATSIYA-2 | AC-47 low-pitch takeoff single-bounce | cycle-2026-04-21-stabilization-reset | 6 | aviation | no | Anchor at `Airframe` ground rolling. Phase 3 R4 adds Airframe tests; Phase 4 F5 fixes. |
| KB-LOAD residual | Pixel Forge candidate import (vegetation) deferred behind owner visual acceptance | cycle-2026-05-08-stabilizat-2-closeout | 3 | assets | no | Strategic Reserve. Reopen only with explicit "go". |
| artifact-prune-baseline-pin-fix | `scripts/artifact-prune.ts` baseline-pin regex requires `artifacts/perf/` prefix but `perf-baselines.json` stores bare dir names — pinned dirs reported as 0, can be deleted by `--apply` | cycle-2026-05-09-doc-decomposition-and-wiring | 2 | perf-harness | no | Trivial fix; flagged by perf-analyst + artifact-gc executor. Bake into a future tooling sweep. |
| worldbuilder-oneshotkills-wiring | 7th god-mode flag `oneShotKills` is published in `WorldBuilderState` / dev console but unwired to any combat consumer | cycle-2026-05-09-doc-decomposition-and-wiring | 2 | weapons / combat | no | Out-of-scope for Phase 1 brief (which named 6 flags). Wire to projectile damage path or `PlayerHealthSystem.takeDamage` from-NPC branch. |
| cloudflare-stabilization-followups | Bundle of audit findings: PostCSS CVE 8.5.8→8.5.10 (Dependabot #26), missing `_headers` file (HSTS+CSP+Permissions-Policy), missing `robots.txt` + `<meta name="description">`, 2 unused preload hints in `index.html`, Cloudflare Web Analytics token provisioned but unattached | cycle-2026-05-10-zone-manager-decoupling | 1 | release / cloudflare | no | **Phase 2.5 cycle authored** — `cycle-2026-05-10-stabilization-fixes` ([brief](tasks/cycle-2026-05-10-stabilization-fixes.md)) bundles 4 task briefs (`postcss-cve-bump`, `cloudflare-headers-file`, `seo-essentials-pass`, `web-analytics-enable`) that close all 5 sub-findings. Awaits human resume of campaign. |
| weapons-cluster-zonemanager-migration | Finish the IZoneQuery migration for the 5 remaining concrete `ZoneManager` imports in the weapons cluster: `FirstPersonWeapon`, `WeaponAmmo`, `AmmoManager`, `AmmoSupplySystem`, `PlayerHealthSystem` | cycle-2026-05-10-zone-manager-decoupling | 1 | weapons | no | Out-of-scope for Phase 2 R2 batches A/B/C; aspirational ≤5 ZoneManager-import target missed. Phase 3+ can finish; cycle-2026-05-10's ≤20 success criterion was met (achieved 17 read / 5 concrete). |
| perf-doc-script-paths-drift | `docs/perf/playbook.md`, `docs/perf/scenarios.md`, `docs/perf/baselines.md`, and `docs/ASSET_ACCEPTANCE_STANDARD.md` reference ~12 `scripts/projekt-143-*.ts` paths that moved to `scripts/audit-archive/` in Phase 1 script-triage | cycle-2026-05-10-zone-manager-decoupling | 1 | docs | no | Deferred from Phase 1 drift correction (`3282ac1`). Investigation tooling references are stale. Trivial sweep; ~30 min. |

## Closed

(Entries get appended here as carry-overs close. Format: `<ID> | <title> | closed in <cycle-id> | resolution one-liner`.)

- worldbuilder-invulnerable-wiring | `PlayerHealthSystem.takeDamage` early-return when WorldBuilder `invulnerable` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | wired in `src/systems/player/PlayerHealthSystem.ts` behind `import.meta.env.DEV`; behavior test in `PlayerHealthSystem.test.ts`.
- worldbuilder-infinite-ammo-wiring | `AmmoManager` / `WeaponShotExecutor` skip decrement when `infiniteAmmo` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AmmoManager.consumeRound()` returns true without decrement when flag active; new `AmmoManager.test.ts` covers the no-op.
- worldbuilder-noclip-wiring | `PlayerMovement` skip terrain collision + gravity when `noClip` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | gated gravity / sandbag / terrain-block / ground-snap / world-boundary in `PlayerMovement.simulateMovementStep`; behavior tests in `PlayerMovement.test.ts`.
- worldbuilder-postprocess-wiring | `PostProcessingManager.setEnabled` consumed by WorldBuilder `postProcessEnabled` flag | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `PostProcessingManager.beginFrame/endFrame` consult `getWorldBuilderState()`; tests recordingrenderer assertions.
- worldbuilder-tod-wiring | AtmosphereSystem honors WorldBuilder `forceTimeOfDay` (-1 = follow live) | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AtmosphereSystem.update` snaps `simulationTimeSeconds` to `forceTimeOfDay * dayLengthSeconds` when in [0,1] and the active preset has a `todCycle`.
- worldbuilder-ambient-audio-wiring | AudioManager consumes WorldBuilder `ambientAudioEnabled` flag | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AudioManager.update` calls `ambientManager.setVolume(0)` on flag-flip-down and `setVolume(1)` on flip-up; idempotent across steady ticks.

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
