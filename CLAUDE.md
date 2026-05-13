# Project Notes (Claude Code)

Last verified: 2026-05-10

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

**Two parallel first-class directions** (owner confirmation, 2026-05-12):

- **Vision A — Experimental WebGPU tech.** Compute shaders, indirect
  drawing, TSL ComputeNode, storage textures, GPU timestamps. Lives on
  the `exp/konveyer-webgpu-migration` branch. KONVEYER-10 remains the
  rollout-gating carry-over.
- **Vision B — Driveable land vehicles.** M151 jeep MVP first, then
  tanks (skid-steer + turret + cannon + damage states). Successor IDs
  open as VEKHIKL-3+ when those cycles launch.

Both directions are first-class; neither is subordinated to the
stabilization-refactor campaign. The campaign queue in
[docs/CAMPAIGN_2026-05-09.md](docs/CAMPAIGN_2026-05-09.md) still reflects
the original 9-cycle plan and gets revised when Option 1 from
[docs/STRATEGIC_ALIGNMENT_2026-05-10.md](docs/STRATEGIC_ALIGNMENT_2026-05-10.md)
formally lands. Option 1 (insert VODA-1 / VEKHIKL-1 / DEFEKT-3 first
slices ahead of cycle 3) is the active feature-pivot recommendation.

**Phase F materialization rearch is PAUSED at R1-merged.** Three R1 PRs
landed on `exp/konveyer-webgpu-migration`:
combat sub-attribution, materialization lane rename
(`lodLevel` → `simLane` + `renderLane`), and sky-refresh idempotency at
the 2 s cadence. R2-R4 (cover-spatial-grid, render-silhouette-lane,
squad-aggregated-strategic-sim, budget-arbiter-v2, render-cluster-lane,
strict-WebGPU multi-mode proof, docs review packet) are not yet started.
Pickup point: the experimental branch head, resumable via `/orchestrate`
against `cycle-2026-05-13-konveyer-materialization-rearch`.

**Doc-vision-alignment ad-hoc pass (in flight 2026-05-12).** This branch
ships the alignment edits: amend CLAUDE.md "Current focus" to reflect
the 2026-05-12 vision confirmation and park two non-vision-critical
AVIATSIYA carry-overs (see CARRY_OVERS.md edits below). It does not
touch engine or test code.

**Engineering culture** for unattended overnight agents (Codex / Claude /
Cursor multi-stream R&D runs covering stabilization + code-golf +
optimization + perf + features) lives in
[docs/ENGINEERING_CULTURE.md](docs/ENGINEERING_CULTURE.md) — single-read
synthesis covering five work modes, diff/file budgets, comment
discipline, parallel R&D protocol, and reporting standard.

Phases 0/1/2/2.4/2.5 done. Phases 3–9 queued (refactor campaign,
deprioritized behind the two vision directions). Auto-advance PAUSED per
the campaign manifest. To re-enable chaining: flip
`Auto-advance: PAUSED` to `Auto-advance: yes` in the campaign manifest
before re-running `/orchestrate`.

For full context (audit findings, Phases 0–2 outcomes, Phase 3+ scope):
[docs/STABILIZATION_CHECKPOINT_2026-05-09.md](docs/STABILIZATION_CHECKPOINT_2026-05-09.md).
Cloudflare account-level audit:
`artifacts/live-audit-2026-05-09/CLOUDFLARE_ACCOUNT_AUDIT.md` (gitignored).

Single source of truth for unresolved items:
[docs/CARRY_OVERS.md](docs/CARRY_OVERS.md). Active count on the
experimental branch is **8** after the 2026-05-12 vision-pivot park
(AVIATSIYA-2 and AVIATSIYA-3 moved Active → Parked; see the Parked
sub-list in CARRY_OVERS.md). Active items:
DEFEKT-3 (combat AI p99), DEFEKT-4 (NPC route quality), STABILIZAT-1
(combat120 baseline refresh), AVIATSIYA-1 / DEFEKT-5 (visual review
pending), KB-LOAD residual, cloudflare-stabilization-followups,
weapons-cluster-zonemanager-migration, KONVEYER-10 (WebGPU
rollout-gating). New IDs (KONVEYER-11 spatial-grid, VEKHIKL-3
jeep-drivable, etc.) open with their respective cycle launches.

4 cycle-retro nits from cycle 2.4 captured in BACKLOG retro (NOT new
carry-overs to respect ≤12 limit; bundle into next cycle that touches
relevant area): A Shau test claim softening; perf ceiling 1.0→2.0ms if
flaky; tileKey() guard comment; mobile-ui CI timeout 25→30 min headroom.

Campaign manifest: [docs/CAMPAIGN_2026-05-09.md](docs/CAMPAIGN_2026-05-09.md)
(9 cycles; auto-advance currently PAUSED).

Phase-letter task IDs (A/B/C/D/E/F) were retired 2026-04-18. New cycles use
descriptive slugs under `task/<slug>` with `cycle-YYYY-MM-DD-<slug>` cycle
IDs. Banned-keyword stoplist enforced by
`npx tsx scripts/cycle-validate.ts <slug>`.

See [docs/CARRY_OVERS.md](docs/CARRY_OVERS.md) for the active carry-over
registry, [docs/BACKLOG.md](docs/BACKLOG.md) for the strategic-reserve index, and
[docs/dev/worldbuilder.md](docs/dev/worldbuilder.md) for the new console.
