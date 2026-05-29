# Directives

Last verified: 2026-05-20 (slim refactor under `directives-slim-refactor`; full evidence prose now lives in per-id memo files under [`docs/directives/`](directives/)).

Active directive list. Each row is binary `open` / `code-complete` / `done` / `closed`, owning subsystem, latest evidence (one link or short pointer), and the most load-bearing success criterion. Verbose evidence has moved to per-id memo files; carry-over discipline remains [docs/CARRY_OVERS.md](CARRY_OVERS.md); historical ledger prose at [docs/archive/PROJEKT_OBJEKT_143/](archive/PROJEKT_OBJEKT_143/).

## Open

| id | title | status | owner | latest evidence | success criteria |
|---|---|---|---|---|---|
| KB-STARTUP-1 | Mode-start terrain surface bake | open (spike) | terrain / engine init | spike branch `task/mode-startup-terrain-spike` + memo `MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md` | Mode-click deploy UI appears quickly in startup probes without returning bake to main thread — see [memo](directives/kb-startup-1.md) |
| KONVEYER-12 | Finite map edge strategy | open | terrain / renderer / atmosphere | `2026-05-11T22-11-28-128Z/konveyer-scene-parity` (post cloud-deck + A Shau collar reject) | Pick one finite-edge model per map type and prove in strict WebGPU from all pose classes — see [memo](directives/konveyer-12.md) |
| VODA-1 | Visible water surface + query API | code-complete (playtest deferred) | environment / water | cycle-voda-1 5 PRs (#228-#232) | Water surface visible across OF + A Shau with foam + flow + sampler API — see [memo](directives/voda-1.md) |
| VODA-2 | Flow, buoyancy, swimming | code-complete (playtest deferred) | environment / water | cycle-voda-2 7 PRs (#239-#245) | Buoyancy + player swim/breath + NPC wade + foot-splash + river-current force — see [memo](directives/voda-2.md) |
| VEKHIKL-1 | M151 jeep ground vehicle | code-complete (playtest deferred) | vehicle (ground) | cycle-vekhikl-1 5 PRs (#223-#227) | M151 spawn + drive + per-wheel terrain conform in OF + A Shau — see [memo](directives/vekhikl-1.md) |
| VEKHIKL-2 | Stationary M2 .50 cal emplacements | code-complete (playtest deferred) | vehicle / weapons | cycle-vekhikl-2 6 PRs (#233-#238) | M2HB mount + fire + NPC gunner via orderBoard — see [memo](directives/vekhikl-2.md) |
| AVIATSIYA-2 | AC-47 low-pitch takeoff single-bounce | open | vehicle (fixed-wing) / airframe | (none) | AC-47 low-pitch takeoff no longer single-bounces on airfield |
| AVIATSIYA-4 | Helicopter combat surfaces | open | helicopter / weapons | (none) | Door-gunner + chin minigun + rocket-pod fire on Huey / UH-1C / Cobra with period loadout |
| AVIATSIYA-5 | Fixed-wing combat surfaces | open | vehicle (fixed-wing) / weapons | (none) | A-1 / F-4 / AC-47 each carry period weapons with lead/sway/station-keep |
| AVIATSIYA-6 | Combat maneuvers | open | vehicle / helicopter / AI | (none) | AC-47 pylon-turn / A-1 dive / F-4 strafe / Cobra rocket / Huey strafe routes callable by NPC + assist players |
| AVIATSIYA-7 | AH-1 Cobra import + integration | open | helicopter | `pixel-forge/war-assets/vehicles/aircraft/ah1-cobra.glb` | Cobra spawnable + flyable + weapon-armed alongside Huey and UH-1C |
| SVYAZ-3 | Air-support call-in radio | open | combat / UI / aviation | first slice `665b0c5` (radio shell + asset list) | Radio menu + target marking + asset selection + per-asset cooldown + NPC-pilot fulfillment |
| SVYAZ-4 | RTS-flavored command discipline | open | combat / UI | (none) | Squad + air-support commands compose so the sim reads as hybrid FPS/RTS |
| UX-2 | Map spawn / respawn flow | open | UI / player | (none) | Map shows spawn options; tap- and click-to-spawn; mobile touch targets sized correctly |
| UX-3 | Loadout selection | open | UI / player | (none) | Loadout categories + ammo loads + faction availability + PC/mobile parity |
| UX-4 | Deploy flow polish | open | UI / player | (none) | Menu-to-first-frame is fast + clear; immediate danger readable in first frame |
| STABILIZAT-1 | Refresh combat120 perf baseline | open | perf-harness | `2026-05-10T10-45-07-263Z` (3 fail) | `perf:capture:combat120` from quiet machine produces avg ≤17ms, p99 ≤35ms; refreshed baseline committed |
| DEFEKT-1 | Stale baseline audit | open | perf-harness | `2026-05-07T22-04-54-994Z/projekt-143-stale-baseline-audit` | `perf-baselines.json` current for all tracked scenarios; stale-baseline gate passes |
| DEFEKT-2 | Doc / code / artifact drift | open | doc-harness | `2026-05-08T01-26-06.909Z/projekt-143-doc-drift` | `check:doc-drift` passes + 14 consecutive days no drift after release |
| DEFEKT-3 | Combat AI p99 anchor | open (O(1) path wired; perf unproven) | combat | `cover-grid-wiring` (cycle-2026-05-28) wired O(1) `CoverSpatialGrid` into prod combat; combat120 p99 PASS still gated on STABILIZAT-1 baseline refresh — [perf-trust.md](state/perf-trust.md) | Sync cover search in `AIStateEngage.initiateSquadSuppression` no longer dominates p99; combat120 p99 ≤35ms PASS |
| DEFEKT-6 | Terrain occlusion and fire authority | open | combat / terrain / navigation / materialization | `2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority` | Reproduce/disprove fire-through-terrain with browser evidence and identify authoritative LOS query — see [memo](directives/defekt-6.md) |
| DIZAYN-3 | Liberty of proposal | open | design | (none) | Visual/feel proposals can land on any directive; engineering reject requires written rationale |

## Recently closed (last 10)

| id | title | status | owner | latest evidence | success criteria |
|---|---|---|---|---|---|
| DEFEKT-4 | NPC navmesh route quality | closed 2026-05-18 | navigation | 3 PRs #265-#267 (all `terrain-nav-reviewer` APPROVE) | A Shau + OF route-quality captures pass measurement trust — see [memo](directives/defekt-4.md) |
| VODA-3 | Watercraft and integration | closed 2026-05-18 | environment / water | cycle-voda-3 6 PRs (#259-#264) | Sampan + PBR rigged with enter/exit + M2HB twin mounts world-space-correct — see [memo](directives/voda-3.md) |
| VEKHIKL-3 | M48 Patton tank (chassis half) | closed 2026-05-17 | vehicle (ground / tracked) | cycle-vekhikl-3 5 PRs (#246-#250) | Skid-steer chassis + four-corner conform + tracks-blown — see [memo](directives/vekhikl-3.md) |
| VEKHIKL-4 | M48 turret + cannon + AI gunner + WASM solver pilot | closed 2026-05-17 | vehicle (ground / tracked) / combat | cycle-vekhikl-4 8 PRs (#251-#258) | Turret + cannon + HP bands + NPC gunner + Rust→WASM pilot recorded KEEP-INCONCLUSIVE — see [memo](directives/vekhikl-4.md) |
| KONVEYER-11 | Strict proof chain and terrain budget | done | renderer / terrain / perf-harness / combat | `2026-05-11T18-56-10-018Z/measurement-trust.json` | Trusted strict-WebGPU attribution + terrain main/shadow split + CDLOD node/ring evidence + fire-through-terrain audit — see [memo](directives/konveyer-11.md) |
| KONVEYER-10 | Scene parity and frame-budget attribution | closed 2026-05-13 | renderer / environment / world / perf-harness | master HEAD `1df141ca` + `docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md` | Strict WebGPU as proof path + sub-timing decomposition + sky/cloud/finite-edge decisions — see [memo](directives/konveyer-10.md) |
| STABILIZAT-3 | Live release verification | done | deploy | `npm run check:live-release` PASS after 2026-05-10 deploy | Production SHA remains live `/asset-manifest.json` truth |
| AVIATSIYA-1 | Helicopter rotor visual parity | done | helicopter | `2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit` | Huey + UH-1C + AH-1 Cobra rotor directionality + naming pass live review; regressions reopen DEFEKT-5 |
| DEFEKT-5 | Visual fallback and directionality audit | done | combat / helicopter / FX | `2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit` | Visual integrity audit clean |
| SVYAZ-2 | Squad pings: go, patrol, attack, fall back | done | combat / UI | `2026-05-07T21-41-01-140Z/projekt-143-svyaz-ping-command-browser-proof` | Ping commands land in browser proof |

## Older closes (memo only, not in tables)

These are still closed and still tracked; their original short evidence prose lives only in this commit's git history. Re-add a row to the closed table only if a regression reopens them.

- SVYAZ-1 — Squad command stand-down (done; `2026-05-07T18-59-28-353Z/projekt-143-svyaz-standdown-browser-proof`)
- UX-1 — Respawn screen redesign PC + mobile (done; `2026-05-07T20-35-21-453Z/projekt-143-ux-respawn-browser-proof`)
- STABILIZAT-2 — Land vehicle-visuals + airfield + helicopter rotor fix (done; master `babae19a76e5ff622976a632e10f7055315d2698`)
- AVIATSIYA-3 — Helicopter parity audit (done; `docs/rearch/helicopter-parity-audit.md`)
- DIZAYN-1 — Vision charter (done; charter at `docs/archive/dizayn/vision-charter.md`)
- DIZAYN-2 — Art-direction review gate (done; gate at `docs/archive/dizayn/art-direction-gate.md`)

## Per-directive memo files

Verbose evidence for directives with >2 lines of original prose lives here:

- [KB-STARTUP-1](directives/kb-startup-1.md)
- [KONVEYER-10](directives/konveyer-10.md)
- [KONVEYER-11](directives/konveyer-11.md)
- [KONVEYER-12](directives/konveyer-12.md)
- [VODA-1](directives/voda-1.md)
- [VODA-2](directives/voda-2.md)
- [VODA-3](directives/voda-3.md)
- [VEKHIKL-1](directives/vekhikl-1.md)
- [VEKHIKL-2](directives/vekhikl-2.md)
- [VEKHIKL-3](directives/vekhikl-3.md)
- [VEKHIKL-4](directives/vekhikl-4.md)
- [DEFEKT-4](directives/defekt-4.md)
- [DEFEKT-6](directives/defekt-6.md)
