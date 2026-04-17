# Project Notes (Claude Code)

Last updated: 2026-04-17

Terror in the Jungle is a browser-based 3D combat game (Three.js 0.183, TypeScript 5.9, Vite 8). Up to 3,000 AI combatants, stable frame-time tails, real-terrain scenarios (A Shau Valley 21km DEM). Deployed on Cloudflare Pages.

## Read First

See [AGENTS.md](AGENTS.md) for the authoritative, agent-agnostic operating guide: commands, conventions, documentation map, hard rules, game-feel playtest rule, and known gotchas. That file applies to every agent (Claude Code, Codex, Cursor, Gemini) and humans alike.

## Claude Code specifics

On top of what's in `AGENTS.md`, this repo ships Claude-Code-specific harness pieces:

- **Slash commands** in `.claude/commands/`: `/validate`, `/perf-capture`, `/playtest`, `/orchestrate`.
- **Subagent types** in `.claude/agents/`: `executor`, `combat-reviewer`, `terrain-nav-reviewer`, `perf-analyst`, plus an `orchestrator` role kicked off via the `/orchestrate` slash command against `docs/AGENT_ORCHESTRATION.md`.
- **Orchestration runbook entry point**: [docs/AGENT_ORCHESTRATION.md](docs/AGENT_ORCHESTRATION.md). Individual task briefs live in `docs/tasks/*.md`.
- **Statusline** at `~/.claude/statusline.ps1` (user-level global).
- **Global StopFailure hook** plays `mission-failed.mp3` on tool failure (user-level global, set up in `~/.claude/settings.json`).

## Current focus

combat120 is PASS-leaning WARN after the 2026-04-17 drift-correction run: avg ~15ms (-10.7% vs pre-run), p99 ~34ms, max ~47ms, 0% hitch, 8.8MB heap growth. 5 game modes live, per-faction combat doctrine starter landed (D2 via `FactionCombatTuning`), and the NPC hypersprint bug has been root-caused in `CombatantLODManager` but shelved for Phase F render-side position interpolation work.

See [docs/BACKLOG.md](docs/BACKLOG.md) for open items and recently completed work.
