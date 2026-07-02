# Campaign: greenlight-followthrough (2026-07-02)

Owner gave a blanket green light on 2026-07-01 (voice, verbatim intent: "green light for all
your recommendations and fixes... vehicle scope... gate direction and hill walk and
retuning... go with whatever you recommend for all tier one and all tier two, orchestrate
all of it, use /workflows") against the 2026-07-01 research-and-alignment plan (46-agent
read-only pass; findings recorded in the orchestrating session and summarized below).
The orchestrator resolved every fork per its stated recommendations. This manifest is the
decision record; task briefs land with each PR under `docs/tasks/`.

Posture: autonomous-loop (merge on CI green + reviewer APPROVE; owner feel-walks deferred
to PLAYTEST_PENDING). Deploy at campaign end via `gh workflow run deploy.yml --ref master`
+ `npm run check:live-release`.

## Resolved owner forks (one line each)

| Fork | Decision |
|---|---|
| V1 vehicle scope | C-lite: yaw heading-hold fix + slope-gate unit conversion + conform smoothing + expose tank taus |
| V2 slope-gate direction | Convert deficit→radians at the two vehicle consumption sites, RETUNED ceilings (jeep ~50°, M35 ~40°, APC ~42°, tanks ~55°) to preserve accepted climb authority while restoring real cliff rejection; hill-walk row added |
| V3 air-vehicle heaviness | Park until ground yaw fix lands and the complaint is retested |
| Suspension tau | Yes, slerp pitch/roll conform, tau 0.2 s, configurable, 0 = legacy hard snap |
| A0 ballistics | Incremental consolidation: extend GrenadeSystem projectile primitive (impact-detonation flag + per-projectile blast + IFF); bombs + existing rockets route through it; mortar/smoke sims untouched |
| A1 bomb scope | (b) true dropped bombs + CCIP pipper on A-1 + F-4, RMB release |
| A2 AC-47 | Stays pure broadside gunship, no bombs |
| A3 rocket impact-detonation | Ship now (foundation of the bombs task); documented intent, playtest row noted |
| A4 bomb IFF | Spare friendlies (ownerFaction passed) |
| A5 rearm | One load per sortie; no runway rearm this campaign |
| F1 player explosion damage | Full symmetry: enemy ordnance 1.0x, own ordnance 0.75x scale, spawn protection respected, player_killed emitted |
| F2 grenade cooking | Wire it (cook input while grenade aimed; explode-in-hand routes through PlayerHealthSystem) |
| F3 healing | Go: instant-heal bandage MVP, KeyH on foot (heli altitude-lock is heli-mode-gated, no collision) |
| F4 looting | L1 resupply drops on npc_killed (capped, expiring); delete obsolete WeaponPickupSystem |
| F5 NPC M2HB | Full activation: CombatantAI forwarding + mounted fire/dismount route + faction-correct attribution + death seat-release |
| R1 in-vehicle smoke | Cancel only where infantry actions are suppressed (ground vehicles); heli toss preserved |
| R2 radio-smoke closure | Hardening PR (cancel funnel, visible begin-rejection feedback, MARKER OUT state, dead AirSupportRadioMenu deleted) |
| R3 marking selector | Delete Smoke/WP/Grid tri-marking IA; dial stays hardcoded 'smoke'; overlay panel copy fixed; rejected target-method ring stays dead |
| P1 perf next step | Deep-attribution capture (MAIN worktree) then quiet-machine certification attempt at campaign end |
| P2 threshold authority | p99 finish line = quiet-box pass <=38.5 ms band (documented +/-6 ms noise); STABILIZAT-1 criterion text updated |
| P3 GPU blind spot | Build WebGPU timestamp-query frame timing (opt-in, capture-surfaced) |
| ECS | DEFER stands (no question was open) |
| H1 hints shape | A then B: surgical fixes now; declarative per-vehicle table follow-on carries bomb/heal/loot cues |
| H2 touch how-to | Kill keyboard-bind hint now; per-vehicle touch-verb strings in the table task |
| H3 boats identity | Defer (watercraft dormant) |
| H4 touch seat swap | Add SEAT button to VehicleActionBar (tank driver<->gunner, gunship pilot<->door gun) |
| H5 gamepad hints | Skip |
| U1 UI next swing | Styling consolidation (2D-map redesign waits for the pending owner walk) |
| U2 styling bleed | Consolidate + lint rule banning new injectStyles |
| U3 guardrail | Yes: default-ON flips of experiential surfaces require explicit owner sign-off (AGENTS.md) |
| U4 orbital | Full prune (code + wiring + unfetchable sidecars + doc sweep); git history is the resurrection path |
| W1 hydrology | Stay dry; watercraft stays dormant; keep a-shau-rivers.json |
| F6 audio | Write cycle-2026-07-audio-cue-redesign brief now; NO paid generation until an owner audition session |
| F7 registry coherence | Demote CURRENT.md directive-status to links-only + close-ritual checklist note; no parsing gate |
| F8 export surface | Knip-count ratchet gate; 119-file sweep deferred; brief annotated |
| Q17 playtest debt | Consolidate: newest-first priority walk (rows 22/23/25); pre-2026-06-13 rows marked bulk-accept candidates pending owner confirmation |
| Q19 STABILIZAT-1 | Quiet capture attempted at campaign end; honestly recorded either way |
| Q20 KB-STARTUP-1 | Verify the 2026-06-10 StampSpatialIndex fix superseded the spike branch; close the carry-over if so. Cloudflare Web Analytics toggle left as a one-click owner note |

## Wave 1 (parallel)

| slug | scope | reviewer |
|---|---|---|
| task/vehicle-heading-hold-and-slope-truth | weathervane fix, slope-gate radians conversion + retune, conform tau, tau exposure, real-contract test mocks | — |
| task/radio-smoke-hardening | cancel funnel, begin-rejection feedback, ground-only vehicle cancel, MARKER OUT, dead-surface + tri-marking deletion, death cancel, TOO FAR hint | combat-reviewer |
| task/vehicle-hint-truth | turret legend, secondSeat gate, plane RMB note, door-gun seat re-push, touch EXIT wire, kill tank hint on touch, SEAT button | — |
| task/registry-truth-sweep | CURRENT.md demote + drift fixes, AVIATSIYA-2 unpark, DEFEKT-6 banner/row, PLAYTEST ledger + row 30, stale comments, AGENTS.md guardrail, KB-STARTUP-1 verify/close | — |
| task/small-truth-fixes | tail-attribution fallback, spawnProjectile log, dead CombatantDamage field, dead zoneCaptured entry, ossuary ogg prune | combat-reviewer |
| task/player-explosion-damage | explosion->player coupling, self-scale 0.75, player_killed event | combat-reviewer |
| task/orbital-map-prune | delete src/ui/map/orbital + wiring + bake script + sidecars + THIRD-PARTY sweep | — |
| task/audio-brief-and-export-ratchet | audio-cue-redesign brief, knip ratchet gate, export-surface brief annotation | — |
| task/styling-consolidation | migrate ~24 injection sites to CSS Modules, collapse fj-*/ScreenPrimitives duplication, injectStyles lint rule | — |

## Wave 2 (after wave-1 merges)

| slug | scope | reviewer |
|---|---|---|
| task/fixed-wing-bombs | grenade-primitive impact detonation (+ rocket fix), A-1/F-4 bomb stores, CCIP, HUD/hints, IFF | combat-reviewer |
| task/npc-m2hb-gunners | forwarding setters, mounted fire/dismount route, attribution fix, death seat-release | combat-reviewer |
| task/grenade-cook-wire | cook input, explode-in-hand self-damage | combat-reviewer |
| task/healing-mvp | heal(), bandages, KeyH, HUD/hints | — |
| task/loot-resupply-drops | L1 drops + WeaponPickupSystem deletion | combat-reviewer |
| task/hint-table-and-touch-strings | vehicleClass discriminator, declarative table, touch strings, new-feature cues | — |
| task/webgpu-gpu-timing | timestamp-query GPU frame timing into captures | — |

## Wave 3 (orchestrator, MAIN worktree)

Deep-attribution combat120 capture; quiet-machine multi-capture attempt + baseline decision
(P2); STABILIZAT-1/4 doc updates; batched PLAYTEST_PENDING row appends; full validate;
deploy; `check:live-release`; campaign close ritual.

## Hard rules for this campaign

- Zero fence changes (`src/types/SystemInterfaces.ts` untouched).
- Executors do NOT edit DIRECTIVES.md / CARRY_OVERS.md / PLAYTEST_PENDING.md / state/CURRENT.md
  (registry-truth-sweep alone owns registries; playtest rows are batch-appended by the
  orchestrator at close from PR-proposed row text).
- Perf captures only from the MAIN worktree (Windows MAX_PATH).
- combat120 is blind to vehicles/tripods/ordnance/radio (AI_SANDBOX) — it certifies none of
  this campaign's runtime additions; Open Frontier evidence or focused L3 tests instead.
