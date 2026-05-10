# Current State

Last verified: 2026-05-10

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

## Current focus (2026-05-10)

`master` is in release-stewardship mode after the overnight multi-stream pass.
Merged work now includes:

- stabilization sweep `a9ebfbe` (artifact-prune pin fix, `oneShotKills`
  wiring, perf-doc path drift, CDLOD retro nits);
- CDLOD skirt hardening `5e3436c` for the white-crack terrain seam report;
- code-golf split of `PlayerMovement` (`2ac4438`);
- optimization memos for pool sizing and BVH rebuild threshold (`d50649b`);
- SVYAZ-3 radio shell first slice (`665b0c5`);
- mobile UI CI timeout headroom (`6892a36`);
- release-stewardship changes in the production deploy: M151 world-feature placements register
  as ground vehicles, cover-query cache TTL first slice, PostCSS/header/SEO
  deployment hygiene, and doc alignment.

Phase 2 (`cycle-2026-05-10-zone-manager-decoupling`) is merged. Phase 2.5's
code-side Cloudflare/SEO tasks were folded into this release pass, but
Web Analytics still requires the Pages dashboard toggle and live beacon
verification because Cloudflare API access returned authentication error
10000 in this session.

The next proposed autonomous branch is KONVEYER-0, documented in
`docs/rearch/KONVEYER_AUTONOMOUS_RUN_2026-05-10.md` and
`docs/tasks/konveyer-0-autonomous-renderer-recon.md`. Treat it as
experimental WebGPU/TSL recon only: no production renderer flip, no
`master` merge, no perf-baseline update, and no campaign-manifest rewrite
until the review packet exists.

## What is real today

- Repo builds, lints, smoke-tests, and runs the mobile UI gate. CI perf
  capture/compare is advisory; baseline refresh remains blocked per
  [docs/state/perf-trust.md](perf-trust.md).
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
drop) survive the hotfix unchanged. The later `5e3436c` hardening makes skirt
walls emit both triangle windings so backface culling cannot expose bright
terrain cracks when the camera is above or far from LOD borders.

## Live deploy verification

Live release is gated on blocking CI (lint + test + build + smoke +
mobile-ui), review of the advisory perf artifact, and manual Cloudflare Pages
deploy via `deploy.yml`. Production deploy SHA is the live
`/asset-manifest.json` source of truth — do not freeze it into this doc.

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
