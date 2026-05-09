# Project Notes (Claude Code)

Last verified: 2026-05-09

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

**`cycle-2026-05-09-phase-0-foundation` (in review).** Foundation cycle of the
12-week realignment plan at
`C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md`. Installs the
durable rules layer (max-LOC + max-method lint with grandfather list, doc
date-header lint, fenced-interface pre-flight, banned cycle-name keywords,
reviewer-pre-merge gate, scenario smoke screenshot gate, artifact-prune
retention) and ships the **WorldBuilder dev console** (`Shift+G`) as an
isolation/validation tool. Deliberately no game-code changes; engine-side
wiring of WorldBuilder god-mode flags is filed for Phase 1.

Single source of truth for unresolved items: [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md).
Current legacy carry-overs (each open ≥3 cycles, all targeted by the
realignment plan): DEFEKT-3 (combat AI p99 cover search), DEFEKT-4 (NPC
route quality), STABILIZAT-1 (combat120 baseline refresh), AVIATSIYA-1 /
DEFEKT-5 (visual review pending), AVIATSIYA-2 (AC-47 takeoff bounce),
AVIATSIYA-3 (helicopter parity audit). Phase 0 also spawns 6 new
`worldbuilder-wiring` carry-overs for Phase 1 engine wiring.

Prior cycle: `cycle-2026-05-08-perception-and-stuck` closed 2026-05-08
(single integration PR [#165](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/165), four
parallel task branches landed behind Tweakpane config flags). Hotfix on
top: `createTileGeometry` Z-coordinate sign flip backface-culled terrain
on every map; fix at `src/systems/terrain/CDLODRenderer.ts:25` and
regression test in `CDLODRenderer.test.ts`. The Z-flip is the cautionary
tale that motivated the new scenario-smoke screenshot gate
([scripts/scenario-smoke.ts](scripts/scenario-smoke.ts)).

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle
IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.

See [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md) for the active carry-over
registry, [docs/BACKLOG.md](docs/BACKLOG.md) for the strategic-reserve index, and
[docs/dev/worldbuilder.md](docs/dev/worldbuilder.md) for the new console.
