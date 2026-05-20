# Project Notes (Claude Code)

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

## Current state

See [docs/DIRECTIVES.md](docs/DIRECTIVES.md).

## Durable references

- [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md) — active carry-over registry.
- [docs/BACKLOG.md](docs/BACKLOG.md) — strategic-reserve index + historical cycle ledger.
- [docs/AGENT_ORCHESTRATION.md](docs/AGENT_ORCHESTRATION.md) — dispatch/merge protocol + cycle lifecycle.
- [docs/ENGINEERING_CULTURE.md](docs/ENGINEERING_CULTURE.md) — multi-agent R&D culture.
- [docs/dev/worldbuilder.md](docs/dev/worldbuilder.md) — worldbuilder console.
- Cycle briefs at `docs/tasks/<slug>.md`; closed briefs archive at `docs/tasks/archive/<cycle-id>/`.

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle IDs. Banned-keyword stoplist enforced by `npx tsx scripts/cycle-validate.ts <slug>`.
