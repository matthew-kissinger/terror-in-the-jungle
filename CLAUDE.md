# Project Notes (Claude Code)

Last verified: 2026-05-13

Terror in the Jungle is a browser-based 3D combat game (Three.js 0.184, TypeScript 6.0, Vite 8). **Engine architected for 3,000 combatants via materialization tiers; live-fire combat verified at 120 NPCs while the ECS hot path is built out (Phase F).** Real-terrain scenarios (A Shau Valley 21km DEM). Deployed on Cloudflare Pages. Canonical phase status lives in [docs/ROADMAP.md](docs/ROADMAP.md).

## Read First

See [AGENTS.md](AGENTS.md) for the authoritative, agent-agnostic operating guide: commands, conventions, documentation map, hard rules, game-feel playtest rule, and known gotchas. That file applies to every agent (Claude Code, Codex, Cursor, Gemini) and humans alike.

## Claude Code specifics

On top of what's in `AGENTS.md`, this repo ships Claude-Code-specific harness pieces:

- **Slash commands** in `.claude/commands/`: `/validate`, `/perf-capture`, `/playtest`, `/orchestrate`.
- **Subagent types** in `.claude/agents/`: `executor`, `combat-reviewer`, `terrain-nav-reviewer`, `perf-analyst`, plus an `orchestrator` role kicked off via the `/orchestrate` slash command against `docs/AGENT_ORCHESTRATION.md`.
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

The active-cycle pointer in
[docs/AGENT_ORCHESTRATION.md](docs/AGENT_ORCHESTRATION.md) is reset; next
cycle selection waits for owner direction. Option 1 from
[docs/STRATEGIC_ALIGNMENT_2026-05-10.md](docs/STRATEGIC_ALIGNMENT_2026-05-10.md)
(insert VODA-1 / VEKHIKL-1 / DEFEKT-3 first slices ahead of cycle 3) remains
the active feature-pivot recommendation.

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
Auto-advance PAUSED per the campaign manifest. To re-enable chaining: flip
`Auto-advance: PAUSED` to `Auto-advance: yes` in the campaign manifest
before re-running `/orchestrate`.

For full context (audit findings, Phases 0–2 outcomes, Phase 3+ scope):
[docs/archive/STABILIZATION_CHECKPOINT_2026-05-09.md](docs/archive/STABILIZATION_CHECKPOINT_2026-05-09.md).
Cloudflare account-level audit:
`artifacts/live-audit-2026-05-09/CLOUDFLARE_ACCOUNT_AUDIT.md` (gitignored).

Single source of truth for unresolved items:
[docs/CARRY_OVERS.md](docs/CARRY_OVERS.md). Active count was **8** after
KONVEYER-10 closed with PR #192 and is now **9** after KB-STARTUP-1 opened for
the mode-startup terrain-bake hardening branch (still under the ≤12 rule).
Active items: DEFEKT-3 (combat AI p99), DEFEKT-4 (NPC route quality),
STABILIZAT-1 (combat120 baseline refresh), AVIATSIYA-1 / DEFEKT-5 (visual
review pending), KB-LOAD residual, KB-STARTUP-1, cloudflare-stabilization
followups, weapons-cluster-zonemanager-migration, konveyer-large-file-splits.
New IDs (KONVEYER-11 spatial-grid, VEKHIKL-3 jeep-drivable, etc.) open with
their respective cycle launches.

4 cycle-retro nits from cycle 2.4 captured in BACKLOG retro (NOT new
carry-overs to respect ≤12 limit; bundle into next cycle that touches
relevant area): A Shau test claim softening; perf ceiling 1.0→2.0ms if
flaky; tileKey() guard comment; mobile-ui CI timeout 25→30 min headroom.

Campaign manifest:
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md)
(post-WebGPU queue; auto-advance currently PAUSED).

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle
IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.

See [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md) for the active carry-over
registry, [docs/BACKLOG.md](docs/BACKLOG.md) for the strategic-reserve index, and
[docs/dev/worldbuilder.md](docs/dev/worldbuilder.md) for the new console.
