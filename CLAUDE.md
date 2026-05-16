# Project Notes (Claude Code)

Last verified: 2026-05-16 (post 12-cycle autonomous campaign launch)

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

**Active cycle (2026-05-16):** `cycle-sky-visual-restore` is position #1
in a **12-cycle autonomous-chain campaign**. Owner reset the campaign on
2026-05-16 with `auto-advance: yes` in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md);
fresh agent invocations of `/orchestrate` chain through all 12 cycles
without intervention until a hard-stop fires. The chain covers all
VODA, VEKHIKL, and DEFEKT directives plus the two post-WebGPU
investigation fix cycles (mobile + sky).

The queue:
1. `cycle-sky-visual-restore` → KB-SKY-BLAND fix.
2. `cycle-mobile-webgl2-fallback-fix` → KB-MOBILE-WEBGPU fix (real-device validation = merge gate).
3. `cycle-konveyer-11-spatial-grid-compute` → DEFEKT-3 (cover spatial grid).
4. `cycle-vekhikl-1-jeep-drivable` → M151 end-to-end.
5. `cycle-voda-1-water-shader-and-acceptance` → water shader + acceptance + WaterSystem split.
6. `cycle-vekhikl-2-stationary-weapons` → M2HB emplacements.
7. `cycle-voda-2-buoyancy-swimming-wading` → physics + player swim.
8. `cycle-vekhikl-3-tank-chassis` → M48 skid-steer chassis.
9. `cycle-vekhikl-4-tank-turret-and-cannon` → turret + cannon + Rust→WASM ballistic-solver pilot.
10. `cycle-voda-3-watercraft` → Sampan + PBR.
11. `cycle-defekt-4-npc-route-quality` → slope-stuck + crowd + solver fixes.
12. `cycle-stabilizat-1-baselines-refresh` → perf baseline refresh.

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
[docs/CARRY_OVERS.md](docs/CARRY_OVERS.md). Active count is **9** after
the 2026-05-16 investigation cycle close (KB-MOBILE-WEBGPU + KB-SKY-BLAND
opened then closed with promotion-to-fix-cycle resolution; both fixes are
queue positions #1 and #2 of the active campaign). Active items: DEFEKT-3
(closes at cycle #3), DEFEKT-4 (closes at cycle #11), STABILIZAT-1
(closes at cycle #12), AVIATSIYA-1 / DEFEKT-5 (visual review pending),
KB-LOAD residual, KB-STARTUP-1 (held; may be absorbed into cycle #2),
cloudflare-stabilization followups, weapons-cluster-zonemanager-migration,
konveyer-large-file-splits (WaterSystem half closes at cycle #5).

4 cycle-retro nits from cycle 2.4 captured in BACKLOG retro (NOT new
carry-overs to respect ≤12 limit; bundle into next cycle that touches
relevant area): A Shau test claim softening; perf ceiling 1.0→2.0ms if
flaky; tileKey() guard comment; mobile-ui CI timeout 25→30 min headroom.

Campaign manifest:
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md)
(12-cycle autonomous chain; `auto-advance: yes`).

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle
IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.

See [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md) for the active carry-over
registry, [docs/BACKLOG.md](docs/BACKLOG.md) for the strategic-reserve index, and
[docs/dev/worldbuilder.md](docs/dev/worldbuilder.md) for the new console.
