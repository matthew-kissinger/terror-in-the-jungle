# Current State

Last verified: 2026-05-09

Top-level current-truth snapshot for the repo. Companion docs:

- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — active carry-over registry (single source of truth for unresolved items)
- [docs/state/perf-trust.md](perf-trust.md) — measurement-chain status (combat120 baseline trust)
- [docs/state/recent-cycles.md](recent-cycles.md) — last 3 cycle outcomes
- [docs/ROADMAP.md](../ROADMAP.md) — aspirational vision; canonical vision sentence
- [docs/BACKLOG.md](../BACKLOG.md) — strategic-reserve index

Historical full-fat snapshot (pre-Phase-1) lives at
`docs/archive/STATE_OF_REPO.md`. Future audit summaries link to artifact
paths; do not paraphrase audit JSON into this doc.

## Vision

> Engine architected for 3,000 combatants via materialization tiers; live-fire
> combat verified at 120 NPCs while the ECS hot path is built out (Phase F,
> ~weeks 7–12 of the 2026-05-09 realignment plan).

That qualifier is mandatory in any public-facing claim about scale until
Phase F lands. See [docs/ROADMAP.md](../ROADMAP.md) for the canonical sentence
and phase summary.

## Current focus (2026-05-09)

`cycle-2026-05-10-zone-manager-decoupling` is **Phase 2** of the 9-cycle
realignment campaign at
[docs/CAMPAIGN_2026-05-09.md](../CAMPAIGN_2026-05-09.md). Drops `ZoneManager`
fan-in 52 → ≤20 before Phase 3 god-module splits start. Adds read-only
`IZoneQuery` to the fence (PR #174 in flight), then migrates HUD/Compass/
Minimap/FullMap (Batch A), Combat/Tickets/WarSim (Batch B), and
PlayerRespawn + cleanup (Batch C).

Phase 0 (`cycle-2026-05-09-phase-0-foundation`) closed 2026-05-09 with the
durable rules layer + WorldBuilder dev console (substrate only, no game
code).

Phase 1 (`cycle-2026-05-09-doc-decomposition-and-wiring`) closed 2026-05-09
with 6 PRs ([#167](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/167)–[#172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172)): split STATE_OF_REPO/PERFORMANCE
docs, archived PROJEKT_OBJEKT_143 prose, extracted DIRECTIVES.md, triaged
89 audit scripts to 12 retained, applied artifact prune + weekly CI job,
wired all 6 WorldBuilder god-mode flags into engine consumers (DEV-gated,
Vite DCE-confirmed). Carry-over delta −4 (active 13 → 9). See
[docs/BACKLOG.md](../BACKLOG.md) "Recently Completed" for PR list.

## What is real today

- Repo builds, lints, smoke-tests, runs the mobile UI gate, and compares
  perf against refreshed baselines.
- Playable combined-arms browser game, not just an engine shell.
- Helicopters and three flyable fixed-wing aircraft (A-1, F-4, AC-47) are
  live in runtime with HUD/control law.
- Atmosphere v1 live: analytic sky, sky-tinted fog, day/night presets, ACES
  tone mapping before quantize, vegetation lighting parity, procedural
  cloud coverage. Legacy static skybox path is gone.
- A Shau Valley is a 3,000-unit strategic simulation with selective
  materialization, not 3,000 simultaneous live combatants. DEM delivery is
  manifest-backed locally.
- Pixel Forge NPC/vegetation runtime art is the production truth; old
  sprites/source-soldier PNGs are guarded by
  `npm run check:pixel-forge-cutover`.
- Performance governance is functional after the 2026-04-20 baseline
  refresh; runtime/toolchain target is Node 24.

## Hotfix cautionary tale (2026-05-08)

`cycle-2026-05-08-perception-and-stuck` shipped Stage D2 terrain CDLOD work,
but `createTileGeometry` in `src/systems/terrain/CDLODRenderer.ts` shipped
with an inverted Z coordinate (`z = 0.5 - j/(N-1)` vs the rotated
PlaneGeometry's `z = j/(N-1) - 0.5`). That flipped triangle winding so every
interior face had a -Y normal; default `MeshStandardMaterial(FrontSide)`
backface-culled the terrain from above on every map.

The fix removes the extra negation in `src/systems/terrain/CDLODRenderer.ts`
and adds a face-normal regression test in `CDLODRenderer.test.ts`.

This is the cautionary tale that motivated the new scenario-smoke
screenshot gate ([scripts/scenario-smoke.ts](../../scripts/scenario-smoke.ts)).
Stage D1 (AABB-distance morph) and Stage D2 (skirt ring + per-LOD vertex
drop) survive the hotfix unchanged.

## Live deploy verification

Live release is gated on CI (lint + test + build + smoke + perf + mobile-ui)
plus manual Cloudflare Pages deploy via `deploy.yml`. Production deploy SHA
is the live `/asset-manifest.json` source of truth — do not freeze it into
this doc.

To verify the current production state, fetch
`https://terror-in-the-jungle.pages.dev/asset-manifest.json` and read
`gitSha`. The release-proof check is `check:live-release` (renamed from
`check:projekt-143-live-release-proof` in Phase 1's `script-triage`).

## Drift watch

Per the realignment plan, the doc-discipline lint
(`scripts/lint-docs.ts`) is the gate that keeps this file honest:

- Date header (`Last verified: YYYY-MM-DD`) required in first 10 lines
- Soft cap: 800 LOC; hard cap: 1500 LOC
- Top-level docs claiming an NPC count must include the canonical
  qualifier or link to ROADMAP

If this doc starts growing past ~250 LOC, that is the signal to file
another split task — do not let it return to the audit-JSON-as-prose
shape that motivated the original split.
