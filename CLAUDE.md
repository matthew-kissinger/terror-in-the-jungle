# Project Notes (Claude Code)

Last verified: 2026-05-17 (post `cycle-voda-2-buoyancy-swimming-wading` close; VODA-2 code-complete; campaign pointer advanced to cycle #8 `cycle-vekhikl-3-tank-chassis`)

Terror in the Jungle is a browser-based 3D combat game (Three.js 0.184, TypeScript 6.0, Vite 8). **Engine architected for 3,000 combatants via materialization tiers; live-fire combat verified at 120 NPCs while the ECS hot path is built out (Phase F).** Real-terrain scenarios (A Shau Valley 21km DEM). Deployed on Cloudflare Pages. Canonical phase status lives in [docs/ROADMAP.md](docs/ROADMAP.md).

## Read First

See [AGENTS.md](AGENTS.md) for the authoritative, agent-agnostic operating guide: commands, conventions, documentation map, hard rules, game-feel playtest rule, and known gotchas. That file applies to every agent (Claude Code, Codex, Cursor, Gemini) and humans alike.

## Claude Code specifics

On top of what's in `AGENTS.md`, this repo ships Claude-Code-specific harness pieces:

- **Slash commands** in `.claude/commands/`: `/validate`, `/perf-capture`, `/playtest`, `/orchestrate`.
- **Subagent types** in `.claude/agents/`: `executor`, `combat-reviewer`, `terrain-nav-reviewer`, `perf-analyst`, plus an `orchestrator` role kicked off via the `/orchestrate` slash command against `docs/AGENT_ORCHESTRATION.md`.
- **Skills** in `.claude/skills/`: `webgpu-threejs-tsl` — third-party WebGPU + TSL reference (Three.js node materials, compute shaders, TSL syntax, device-loss handling, WGSL integration). Vendored from https://github.com/dgreenheck/webgpu-claude-skill on 2026-05-15. Mirrored for Cursor at `.cursor/rules/*.mdc` via `@file` references — no duplication.
- **Orchestration runbook entry point**: [docs/AGENT_ORCHESTRATION.md](docs/AGENT_ORCHESTRATION.md). Individual task briefs live in `docs/tasks/*.md`.
- **Local Claude settings** live in `.claude/settings.local.json`, which is intentionally untracked and may differ per machine.
- **Statusline** at `~/.claude/statusline.ps1` (user-level global).
- **Global StopFailure hook** plays `mission-failed.mp3` on tool failure (user-level global, set up in `~/.claude/settings.json`).

## Current focus

**Master is now the WebGPU + TSL branch.** The
`exp/konveyer-webgpu-migration` branch merged to `master` on 2026-05-13 via
[PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
(merge commit `1df141ca`), folding in KONVEYER-0 through KONVEYER-10, Phase F
materialization rearch R1, and the doc-vision-alignment pass. Default
renderer mode is `'webgpu'` with automatic WebGL2 fallback for browsers
without WebGPU support — the fallback gate is `strictWebGPU`-only as of
commit `4aec731e`. **Carry-over KONVEYER-10 closes with this merge** (it
explicitly named the master-merge as its close condition).

**Phase F materialization rearch R1 landed.** Combat sub-attribution
(`Combat.{Influence,AI,Billboards,Effects}` telemetry children), the lane
rename (`Combatant.lodLevel` → `simLane` + `renderLane`), and sky-refresh
idempotency at the 2 s cadence are now on master. R2-R4
(cover-spatial-grid, render-silhouette/cluster lanes, squad-aggregated
strategic sim, budget arbiter v2) are queued as follow-up cycles on master.

**Five new rearch memos landed** alongside the merge:
`docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md`,
`docs/rearch/TANK_SYSTEMS_2026-05-13.md`,
`docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md`, the
`docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md` 2026-05-13 addendum, plus the
KONVEYER review packet bundle.

**Active cycle (2026-05-17):** `cycle-vekhikl-3-tank-chassis`
is position #8 in a **13-cycle autonomous-chain campaign** (expanded
from 12 on 2026-05-17 via insertion of `cycle-sun-and-atmosphere-overhaul`
at position #12). Owner originally launched the campaign on 2026-05-16
with `auto-advance: yes` in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md);
fresh agent invocations of `/orchestrate` chain through all 13 cycles
without intervention until a hard-stop fires. The chain covers all
VODA, VEKHIKL, and DEFEKT directives plus the two post-WebGPU
investigation fix cycles (mobile + sky) plus the sun-and-atmosphere
overhaul (new TSL fragment-shader sky + AGX tonemap + night-red fix).

The queue (cycles #1-#7 closed; #8 active):
1. `cycle-sky-visual-restore` → KB-SKY-BLAND fix. **DONE** (`fd646aeb`).
2. `cycle-mobile-webgl2-fallback-fix` → KB-MOBILE-WEBGPU fix (real-device validation = merge gate). **DONE** (`7931d179`).
3. `cycle-konveyer-11-spatial-grid-compute` → DEFEKT-3 (cover spatial grid). **DONE** (`b86cf027`).
4. `cycle-vekhikl-1-jeep-drivable` → M151 end-to-end. **DONE** (`73e777cb`).
5. `cycle-voda-1-water-shader-and-acceptance` → water shader + acceptance + WaterSystem split. **DONE** (`f14400d2`).
6. `cycle-vekhikl-2-stationary-weapons` → M2HB emplacements. **DONE** (`78c9c55a`).
7. `cycle-voda-2-buoyancy-swimming-wading` → physics + player swim. **DONE** (cycle close-commit; 7 PRs #239-#245; VODA-2 code-complete, owner playtest deferred).
8. `cycle-vekhikl-3-tank-chassis` → M48 skid-steer chassis. **ACTIVE**.
9. `cycle-vekhikl-4-tank-turret-and-cannon` → turret + cannon + Rust→WASM ballistic-solver pilot.
10. `cycle-voda-3-watercraft` → Sampan + PBR.
11. `cycle-defekt-4-npc-route-quality` → slope-stuck + crowd + solver fixes.
12. `cycle-sun-and-atmosphere-overhaul` → TSL fragment-shader Preetham + AGX tonemap + night-red fix + sun-disc tuning (NEW 2026-05-17 per `docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md`; closes HosekWilkieSkyBackend half of `konveyer-large-file-splits`).
13. `cycle-stabilizat-1-baselines-refresh` → perf baseline refresh (now runs last so it captures cycle #12's +0.3-1.0ms p99 sky cost as the new normal).

Every cycle has a pre-authored brief at `docs/tasks/<slug>.md`. The
orchestrator chains via the protocol in
[.claude/agents/orchestrator.md](.claude/agents/orchestrator.md) §"Campaign
auto-advance" — at every cycle close, advance the manifest pointer + the
"Current cycle" section in `docs/AGENT_ORCHESTRATION.md` and re-enter
dispatch without prompting.

Hard-stops (fence change, >2 CI red, perf regression >5% p99, carry-over
growth, worktree failure, twice-rejected reviewer) flip `auto-advance:
yes` → `PAUSED` and surface to owner.

**Active spike branch:** `task/mode-startup-terrain-spike` addresses the
post-click mode-startup stall. The investigation found the Recast
WASM/build/navmesh cache path healthy; the blocker was synchronous terrain
surface baking after mode select. The branch moves surface baking into the
terrain worker pool with transferable height/normal grids and records merge
criteria in
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).

**Engineering culture** for unattended overnight agents (Codex / Claude /
Cursor multi-stream R&D runs covering stabilization + code-golf +
optimization + perf + features) lives in
[docs/ENGINEERING_CULTURE.md](docs/ENGINEERING_CULTURE.md) — single-read
synthesis covering five work modes, diff/file budgets, comment
discipline, parallel R&D protocol, and reporting standard.

Phases 0/1/2/2.4/2.5 done. Phases 3–9 queued (refactor campaign,
deprioritized behind the WebGPU + ground-vehicle vision directions).
**Auto-advance is now `yes`** as of the 2026-05-16 12-cycle campaign
launch. To pause chaining mid-campaign: flip `Auto-advance: yes` to
`Auto-advance: PAUSED` in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md).
The orchestrator finishes the in-flight cycle and stops.

For full context (audit findings, Phases 0–2 outcomes, Phase 3+ scope):
[docs/archive/STABILIZATION_CHECKPOINT_2026-05-09.md](docs/archive/STABILIZATION_CHECKPOINT_2026-05-09.md).
Cloudflare account-level audit:
`artifacts/live-audit-2026-05-09/CLOUDFLARE_ACCOUNT_AUDIT.md` (gitignored).

Single source of truth for unresolved items:
[docs/CARRY_OVERS.md](docs/CARRY_OVERS.md). Active count is **8** after
the 2026-05-17 cycle #7 close (cycles #1-#3 closed DEFEKT-3 +
KB-MOBILE-WEBGPU + KB-SKY-BLAND; net cycle delta from #4-#7 was 0
because VEKHIKL-1, VODA-1, VEKHIKL-2, and VODA-2 live in DIRECTIVES.md
not CARRY_OVERS Active). Active items: DEFEKT-4 (closes at cycle #11),
STABILIZAT-1 (closes at cycle #13 — renumbered after sun-and-atmosphere
insertion), AVIATSIYA-1 / DEFEKT-5 (visual review pending), KB-LOAD
residual, KB-STARTUP-1 (held; cycle #2 mobile work absorbed parts),
cloudflare-stabilization followups, weapons-cluster-zonemanager-migration,
konveyer-large-file-splits (WaterSystem half closed at cycle #5;
HosekWilkieSkyBackend half closes at cycle #12 `cycle-sun-and-atmosphere-overhaul`).

4 cycle-retro nits from cycle 2.4 captured in BACKLOG retro (NOT new
carry-overs to respect ≤12 limit; bundle into next cycle that touches
relevant area): A Shau test claim softening; perf ceiling 1.0→2.0ms if
flaky; tileKey() guard comment; mobile-ui CI timeout 25→30 min headroom.

Campaign manifest:
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md)
(13-cycle autonomous chain; `auto-advance: yes`; expanded from 12 on
2026-05-17 via insertion of `cycle-sun-and-atmosphere-overhaul` at
position #12 per
[docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)).

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle
IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.

See [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md) for the active carry-over
registry, [docs/BACKLOG.md](docs/BACKLOG.md) for the strategic-reserve index, and
[docs/dev/worldbuilder.md](docs/dev/worldbuilder.md) for the new console.
