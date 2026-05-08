# Project Notes (Claude Code)

Last updated: 2026-05-08

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

`cycle-2026-05-08-perception-and-stuck` closed 2026-05-08 (single integration PR [#165](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/165)). Four parallel task branches landed via executor subagents and shipped behind config flags exposed in the existing Tweakpane (`\` toggle): `npc-unfreeze-and-stuck` (visual-only velocity integration on the LOD over-budget path; rejoin-timeout + squad-leader-stale watchdog; StuckDetector `'hold'` now forces destination/target clear and patrol re-entry; `CULLED_DISTANT_SIM_INTERVAL_MS` 45000 → 8000), `npc-imposter-distance-priority` (close-model distance 64 → 120 m via config; on-screen-aware priority score replaces closest-N; velocity-keyed billboard cadence without shader change), `zone-validate-nudge-ashau` (post-placement `validateAndNudge` lifts capturable zones out of ditches; A Shau pilot), `terrain-cdlod-seam` (AABB-distance morph metric + downward skirt geometry kill chunk-edge seams; new `Shift+\` → `Y` seam diagnostic overlay). Live deploy at SHA `e34cc6d` (or later docs-only commit) verified.

Prior cycle: `cycle-2026-04-23-debug-cleanup` (closed 2026-04-22) shipped the diagnostic surface this cycle's overlay extends: backtick HUD registry, `\`-toggled Tweakpane live-tuning, `Shift+\` six-overlay debugger, V/B free-fly + entity inspector, TimeScale pause/step/slow/fast, F9 playtest capture, `?mode=terrain-sandbox` URL-gated dev mode.

Active carry-overs after this cycle: (1) combat AI p99 ~34 ms anchored on synchronous cover search in `AIStateEngage.initiateSquadSuppression()` (DEFEKT-3, untouched this cycle); (2) NPC slope-stuck / navmesh crowd disabled / terrain-aware solver stall loops (Issue A's watchdogs treat the symptoms not the cause); (3) AC-47 low-pitch takeoff single-bounce; (4) helicopter parity audit (`HelicopterVehicleAdapter` / `HelicopterPlayerAdapter`); (5) reviewer follow-ups from this cycle: position-Y drift on slopes during visual-only integration (call `syncTerrainHeight` or document drift bound), `RespawnManager` should use the new `beginRejoiningSquad` helper, `findSuitableZonePosition` spiral-search determinism (`Math.random`), Stage D3 (DEM edge padding) gated on visual review of D1+D2.

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle IDs.

See [docs/BACKLOG.md](docs/BACKLOG.md) for open items and recently completed work.
