# Project Notes (Claude Code)

Last updated: 2026-04-19

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

`cycle-2026-04-18-harness-flight-combat` closed on 2026-04-19 (seven merged PRs: `b1-flight-cutover`, `utility-ai-doctrine-expansion`, `perf-harness-redesign`, `heap-regression-investigation`, `npc-fixed-wing-pilot-ai`, `perf-harness-verticality-and-sizing`, `perf-harness-player-bot-aim-fix`). Per-faction combat doctrine (`FactionCombatTuning`) and the post-cutover `Airframe` surface are the shipped foundations; the aim-fixed player-bot is the active perf-harness driver. The NPC hypersprint bug is root-caused in `CombatantLODManager` but shelved for a future render-side position-interpolation task.

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle IDs.

See [docs/BACKLOG.md](docs/BACKLOG.md) for open items and recently completed work.
