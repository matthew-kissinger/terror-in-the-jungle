# Project Notes (Claude Code)

Last updated: 2026-04-22

Terror in the Jungle is a browser-based 3D combat game (Three.js 0.184, TypeScript 6.0, Vite 8). Up to 3,000 AI combatants, stable frame-time tails, real-terrain scenarios (A Shau Valley 21km DEM). Deployed on Cloudflare Pages.

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

`cycle-2026-04-23-debug-cleanup` closed on 2026-04-22 (two merged PRs: `preserve-drawing-buffer-dev-gate` (#147), `world-overlay-debugger` (#145, rebased + CI-fixed)). It was a cleanup pass on top of `cycle-2026-04-23-debug-and-test-modes` (closed 2026-04-22, seven merged PRs) which shipped the current diagnostic surface: backtick HUD registry, `\`-toggled Tweakpane live-tuning, `Shift+\` six-overlay debugger, V/B free-fly + entity inspector, TimeScale pause/step/slow/fast, F9 playtest capture, and a `?mode=terrain-sandbox` URL-gated dev mode.

Active carry-overs: (1) residual +8.36 MB `heap_end_growth` on combat120 (down 4.7 MB from the pre-cycle +13.08 MB but still above the +2 MB target — WorldOverlayRegistry boot-time footprint + single-run variance are the main suspects; variance read before chasing); (2) combat AI p99 ~34 ms, anchored on synchronous cover search in `AIStateEngage.initiateSquadSuppression()`; (3) NPC slope-stuck / navmesh crowd disabled / terrain-aware solver stall loops; (4) AC-47 low-pitch takeoff single-bounce; (5) helicopter parity audit (`HelicopterVehicleAdapter` / `HelicopterPlayerAdapter`).

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle IDs.

See [docs/BACKLOG.md](docs/BACKLOG.md) for open items and recently completed work.
