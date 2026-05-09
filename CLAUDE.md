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

**STABILIZATION CHECKPOINT (campaign paused 2026-05-09).** Phases 0, 1, 2
of the 9-cycle realignment campaign are complete. Phase 2
(`cycle-2026-05-10-zone-manager-decoupling`) closed with 5 PRs merged
([#173](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/173)–[#177](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/177))
shipping the user-observable feature: `ZoneManager` fan-in dropped from 52
to 17 read / 5 concrete via the new fenced `IZoneQuery` read-only
interface, with consumers migrated across HUD/Compass/Minimap/FullMap +
Combat/Tickets/WarSim + PlayerRespawn + CommandInputManager.

The campaign is **paused at this checkpoint** for human review before the
more invasive Phase 3+ god-module surgery. See
[docs/STABILIZATION_CHECKPOINT_2026-05-09.md](docs/STABILIZATION_CHECKPOINT_2026-05-09.md)
for: full audit findings (Cloudflare live deploy: LCP 280ms / CLS 0.02 /
HTTP/3 / Vite DCE confirmed / PostCSS CVE flagged / `_headers` file gap
identified), Phases 0–2 cumulative outcomes, recommended Phase 2.5
"stabilization-fixes" cycle, Phase 3+ scope notes, resume instructions.

Single source of truth for unresolved items:
[docs/CARRY_OVERS.md](docs/CARRY_OVERS.md). Active count is 12 (at the
≤12 rule limit) after the +3 stabilization-checkpoint carry-overs:
`cloudflare-stabilization-followups` (PostCSS CVE + missing security
headers + missing robots.txt + missing meta-description + 2 unused preload
hints + Cloudflare Web Analytics), `weapons-cluster-zonemanager-migration`
(deferred 5 imports from Phase 2), `perf-doc-script-paths-drift` (deferred
from Phase 1). Legacy carry-overs still open: DEFEKT-3 (combat AI p99),
DEFEKT-4 (NPC route quality), STABILIZAT-1 (combat120 baseline refresh),
AVIATSIYA-1 / DEFEKT-5 (visual review pending), AVIATSIYA-2 (AC-47 takeoff
bounce), AVIATSIYA-3 (helicopter parity audit), KB-LOAD residual,
artifact-prune-baseline-pin-fix, worldbuilder-oneshotkills-wiring.

Campaign manifest: [docs/CAMPAIGN_2026-05-09.md](docs/CAMPAIGN_2026-05-09.md)
(9 cycles; auto-advance currently PAUSED at stabilization checkpoint).
Phases 3–9 are queued but not dispatched. To resume: edit the campaign
manifest, optionally insert a Phase 2.5 stabilization-fixes cycle, and
re-run `/orchestrate`.

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle
IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.

See [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md) for the active carry-over
registry, [docs/BACKLOG.md](docs/BACKLOG.md) for the strategic-reserve index, and
[docs/dev/worldbuilder.md](docs/dev/worldbuilder.md) for the new console.
