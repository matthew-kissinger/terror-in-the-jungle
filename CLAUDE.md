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

**`cycle-2026-05-10-zone-manager-decoupling` (Phase 2, running).** Drops the
worst coupling junction in the repo: `ZoneManager` fan-in 52 → ≤20 before
Phase 3 god-module splits. Adds read-only `IZoneQuery` to
`src/types/SystemInterfaces.ts` (pre-authorized fence change), then migrates
HUD/Compass/Minimap/FullMap to the read interface, Combat/Tickets/WarSim to
events + read interface, and PlayerRespawn + ZoneManager-internal cleanup.
Dispatched via auto-advance after Phase 1 close.

Phase 1 (`cycle-2026-05-09-doc-decomposition-and-wiring`) closed 2026-05-09
with 6 PRs merged ([#167](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/167)–[#172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172)):
split `STATE_OF_REPO.md` and `PERFORMANCE.md` into focused subdirs, archived
PROJEKT_OBJEKT_143 prose, extracted `docs/DIRECTIVES.md`, triaged 89
`check:projekt-143-*` scripts to 12 retained, applied artifact prune +
weekly CI job, and wired all 6 WorldBuilder god-mode flags into engine
consumers behind `import.meta.env.DEV` (Vite DCE-confirmed). Carry-over
delta −4 (active 13 → 9). Combat-reviewer APPROVE-WITH-NOTES on
[#172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172).

Single source of truth for unresolved items: [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md).
Current legacy carry-overs: DEFEKT-3 (combat AI p99 — first surgical pass
in this Phase 2 cycle), DEFEKT-4 (NPC route quality), STABILIZAT-1
(combat120 baseline refresh), AVIATSIYA-1 / DEFEKT-5 (visual review
pending), AVIATSIYA-2 (AC-47 takeoff bounce), AVIATSIYA-3 (helicopter
parity audit), KB-LOAD residual. New tooling carry-overs from Phase 1:
`artifact-prune-baseline-pin-fix`, `worldbuilder-oneshotkills-wiring`.

Campaign manifest: [docs/CAMPAIGN_2026-05-09.md](docs/CAMPAIGN_2026-05-09.md)
(9 cycles, auto-advance: yes). Active campaign cycle queue is the source of
truth for what runs next.

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle
IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.

See [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md) for the active carry-over
registry, [docs/BACKLOG.md](docs/BACKLOG.md) for the strategic-reserve index, and
[docs/dev/worldbuilder.md](docs/dev/worldbuilder.md) for the new console.
