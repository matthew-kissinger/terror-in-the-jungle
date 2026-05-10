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

**`cycle-2026-05-10-stabilization-fixes` (Phase 2.5, READY to dispatch).**
Restored as Current cycle after hot-fix 2.4 closed 2026-05-10 ([PR #178](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/178)
merged as `d71c3f4`). Bundles 4 Cloudflare-audit fixes:
`postcss-cve-bump`, `cloudflare-headers-file`, `seo-essentials-pass`,
`web-analytics-enable` (manual dashboard step). Skip-confirm: NO
(web-analytics-enable requires a human dashboard toggle before the
verification step). Cycle brief at
[docs/tasks/cycle-2026-05-10-stabilization-fixes.md](docs/tasks/cycle-2026-05-10-stabilization-fixes.md).

**Owner is considering a feature-trajectory pivot** before resuming
Phases 3–9 refactor — see
[docs/STRATEGIC_ALIGNMENT_2026-05-10.md](docs/STRATEGIC_ALIGNMENT_2026-05-10.md)
for the recommended Option 1 (insert VODA-1 / VEKHIKL-1 / DEFEKT-3 first
slices ahead of cycle 3). The campaign queue in
[docs/CAMPAIGN_2026-05-09.md](docs/CAMPAIGN_2026-05-09.md) reflects the
ORIGINAL plan and gets revised if Option 1 is approved.

**Engineering culture** for unattended overnight agents (Codex / Claude /
Cursor multi-stream R&D runs covering stabilization + code-golf +
optimization + perf + features) lives in
[docs/ENGINEERING_CULTURE.md](docs/ENGINEERING_CULTURE.md) — single-read
synthesis covering five work modes, diff/file budgets, comment
discipline, parallel R&D protocol, and reporting standard.

Phases 0/1/2/2.4 done. Phase 2.5 ready. Phases 3–9 queued (refactor
campaign). Auto-advance PAUSED per the campaign manifest.

Campaign-level **auto-advance is PAUSED** (per
[docs/CAMPAIGN_2026-05-09.md](docs/CAMPAIGN_2026-05-09.md)). To re-enable
chaining: flip `Auto-advance: PAUSED` to `Auto-advance: yes` in the
campaign manifest before re-running `/orchestrate`.

For full context (audit findings, Phases 0–2 outcomes, Phase 3+ scope):
[docs/STABILIZATION_CHECKPOINT_2026-05-09.md](docs/STABILIZATION_CHECKPOINT_2026-05-09.md).
Cloudflare account-level audit:
`artifacts/live-audit-2026-05-09/CLOUDFLARE_ACCOUNT_AUDIT.md` (gitignored).

Single source of truth for unresolved items:
[docs/CARRY_OVERS.md](docs/CARRY_OVERS.md). Active count holds at **12**
(at the ≤12 rule limit) after cycle 2.4 close (no opens, no closes):
DEFEKT-3 (combat AI p99), DEFEKT-4 (NPC route quality), STABILIZAT-1
(combat120 baseline refresh), AVIATSIYA-1 / DEFEKT-5 (visual review
pending), AVIATSIYA-2 (AC-47 takeoff bounce), AVIATSIYA-3 (helicopter
parity audit), KB-LOAD residual, artifact-prune-baseline-pin-fix,
worldbuilder-oneshotkills-wiring, cloudflare-stabilization-followups
(Phase 2.5 closes), weapons-cluster-zonemanager-migration,
perf-doc-script-paths-drift.

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
