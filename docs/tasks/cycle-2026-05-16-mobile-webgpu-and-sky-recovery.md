# Cycle: Mobile WebGPU + Sky Recovery Investigation

Last verified: 2026-05-16

## Status

R1 dispatched 2026-05-16. All 5 executor PRs open on origin, awaiting
CI green + orchestrator merge on next `/orchestrate` pass. No fence
changes, no combat/terrain/nav touches, no hard-stops triggered.

| Slug | PR | Headline |
|------|----|----|
| `mobile-renderer-mode-truth` | [#203](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/203) | Mobile lands on WebGL2 fallback of `WebGPURenderer` (`resolvedBackend === "webgpu-webgl-fallback"`). `navigator.gpu` present but `requestAdapter()` returns null on emulated Pixel 5 / iPhone 12. Strict-WebGPU mode correctly rejects (per `4aec731e`). Regression surface = hypothesis (c): WebGL2 fallback heavier than pre-migration WebGL. Probe shipped at `scripts/mobile-renderer-probe.ts`. |
| `webgl-fallback-pipeline-diff` | [#207](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/207) | Top-3 WebGL2 cost contributors: (1) terrain `MeshStandardNodeMaterial` (`src/systems/terrain/TerrainMaterial.ts:639`), (2) renderer-construction overhead (`src/core/GameRenderer.ts:99,247,250,272-278`), (3) CPU-baked sky DataTexture refresh (`HosekWilkieSkyBackend.ts:436-525`). |
| `tsl-shader-cost-audit` | [#204](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/204) | Lead finding: TerrainMaterial.ts:275-286 unrolled `mix(...)` biome sampler chain forces 8 texture samples/fragment vs pre-merge if-branched 1 sample → ~8x sampler amplification (~146 effective samples/fragment worst case). NPC impostor + vegetation billboard are smaller 10-20% ALU regressions. HosekWilkieSky is NOT TSL — that's the sky-bland memo's territory. |
| `sky-visual-and-cost-regression` | [#205](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/205) | Sky-bland root cause: per-fragment Preetham `ShaderMaterial` → 128×64 CPU-baked `DataTexture` on `MeshBasicMaterial` at commit `8f3d560b`. ~3 orders of magnitude resolution drop; missing `toneMapped: false` routes dome through ACES; sun-disc normalised to peak 1.0 kills HDR pearl; `CloudLayer` retired at `09d0b562`. Top-3 fixes named in HosekWilkieSkyBackend.ts. Real paired pre/post screenshots committed. |
| `mobile-startup-and-frame-budget` | [#206](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/206) | Mobile-emulation steady-state averages 4.42 fps. Top-3 startup: asset+audio load ~31.9 s overlapping, NPC close-model prewarm 6.5 s, terrain bake ~2 s. Top-3 steady-state buckets: `Combat.AI` 46.86 ms avg / peak 954 ms (DEFEKT-3 manifesting on mobile), `World.Atmosphere.SkyTexture` 31.60 ms / peak 763 ms, `Combat.Billboards` 13.19 ms. Probe shipped at `scripts/perf-startup-mobile.ts`. |

### Known taint on R1 perf magnitudes (apply caveat in R2)

PRs #203 and #206 ran wall-clock perf captures (Playwright + emulated
mobile; CPU 4x throttle + 4G network throttle) on the host machine
while the other R1 worktrees were concurrent. The qualitative ordering
(Combat.AI > Sky > Billboards; renderer mode = WebGL2 fallback)
is robust; the magnitudes (Combat.AI 954 ms peak, 31.9 s asset load,
4.42 fps steady-state, the 5/30/60 s frame-time samples in #203) are
host-contended and must be marked "directionally indicative; fix cycle
re-captures on real device" in the R2 alignment memo. The structural
findings from #204, #205, #207 are not affected (static analysis +
visual capture).

### Next-pass `/orchestrate` steps

1. Confirm all 5 R1 PRs are CI-green via `gh pr view <n> --json statusCheckRollup`.
2. Merge in order: #207, #204, #205, #203, #206 (file-size ascending; #206 has ~5.5k LOC of committed JSON artifacts and the largest probe — merge last so any rebase pain falls on the largest diff). Each via `gh pr merge <n> --rebase`.
3. Author R2 alignment memo at `docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md` synthesizing the 5 R1 findings. Carry forward the perf-taint caveat above verbatim. Name ≥1 fix cycle slot and queue in `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`.
4. Close KB-MOBILE-WEBGPU + KB-SKY-BLAND in `docs/CARRY_OVERS.md` with "promoted to fix cycle `<slug>`" resolution. Carry-over count returns to 9.
5. Run the end-of-cycle ritual: archive briefs, append BACKLOG entry, reset "Current cycle" stub.

## Skip-confirm: no

Wait-for-go from the owner after the launch PR merges. Then `/orchestrate`
re-enters and dispatches R1. (R1 dispatched 2026-05-16; next pass picks
up at merge + R2 per the Status section above.)

## Concurrency cap: 5

## Objective

Capture evidence for two user-reported post-WebGPU-merge regressions and
produce an alignment memo that proposes one or more concrete fix cycles:

1. **Mobile is unplayable post-merge.** Pre-merge (WebGL renderer)
   was playable on phones; post-merge (WebGPU default + WebGL2 fallback
   gated by `strictWebGPU` only, per commit `4aec731e`) mobile frame
   time tanks. Source of regression unknown.
2. **Sky looks bland on master.** Owner-reported, post-merge. The
   Hosek-Wilkie TSL port (`HosekWilkieSkyBackend.ts`) is the most likely
   surface; not confirmed.

R1 ships 5 parallel investigation memos. R2 is orchestrator-driven (no
agents) and produces a single alignment memo with named fix-cycle
proposals.

## Branch

- Each task branches off `master` per `task/<slug>`.
- Memos land under
  `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/<slug>.md`.
- The R2 alignment memo lands at
  `docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md` via a
  final orchestrator-authored PR.
- The active `task/mode-startup-terrain-spike` branch stays parked —
  explicitly out of scope.

## Required Reading

1. [AGENTS.md](../../AGENTS.md) — especially "Game-feel requires human
   playtest" and "Known gotchas".
2. [docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md) — dispatch
   protocol + ground rules.
3. [docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](../rearch/POST_KONVEYER_MIGRATION_2026-05-13.md)
   — milestone memo capping the KONVEYER campaign.
4. [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)
   — current campaign manifest.
5. `.claude/skills/webgpu-threejs-tsl/SKILL.md` and the rest of that
   skill — newly vendored WebGPU + TSL reference. Use it.
6. The strict-WebGPU fallback gate at commit `4aec731e` (and the
   `1df141ca` merge commit that introduced the WebGPU default).
7. `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` —
   sky-cost target.
8. `src/systems/environment/AtmosphereSystem.ts` — sky orchestrator.
9. `src/core/GameRenderer.ts` — renderer init + mode-detection target.
10. [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — KB-MOBILE-WEBGPU and
    KB-SKY-BLAND open at cycle launch.

## Critical Process Notes

1. **Memo-only PRs.** No product-code changes ship in R1. Investigation
   findings live in the memos. If an investigator needs to instrument
   source for measurement, do so locally on their worktree only; drop
   the instrumentation before opening the PR.

2. **Exception:** a small read-only diagnostic helper (new perf probe
   script under `scripts/`, new telemetry surface behind a dev flag)
   MAY ship if it is reusable scaffolding for the follow-on fix cycle.
   It must be behind a dev/debug flag if it adds runtime cost, and the
   memo must document why it shipped.

3. **Mobile capture.** Real-device evidence is preferred. If infeasible
   from the executor environment, fall back to Chrome DevTools Mobile
   Emulation + 4x CPU throttle + 4G network throttle. Document the
   limitation explicitly in the memo. Emulation-only evidence is NOT a
   hard stop; an unclear renderer-mode answer IS.

4. **Pre-merge comparison.** When diffing against pre-merge state, use
   the SHA immediately before `1df141ca` (the KONVEYER merge). Do not
   compare against branches that no longer exist.

5. **Strict-WebGPU vs fallback.** When measuring "WebGPU" cost, do so
   strict-WebGPU (no fallback). When measuring "WebGL fallback" cost,
   force the fallback via the `strictWebGPU=false` path. Mixed evidence
   is not useful.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `mobile-renderer-mode-truth`, `webgl-fallback-pipeline-diff`, `tsl-shader-cost-audit`, `sky-visual-and-cost-regression`, `mobile-startup-and-frame-budget` | 5 | All independent. 5 parallel memo PRs. |
| 2 | `MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16` (orchestrator-only) | — | Synthesizes memos, names fix-cycle slot(s), closes KB-MOBILE-WEBGPU + KB-SKY-BLAND. |

## Task Scope

### mobile-renderer-mode-truth (R1)

Pin which renderer mobile actually runs in production.

**Hypotheses to discriminate between:**
- (a) WebGPU adapter denied on mobile Chrome/Safari → WebGL2 fallback
  via the `strictWebGPU=false` default (per `4aec731e`).
- (b) WebGPU adapter granted but stalls on shader compile, first-frame
  readback, or a feature negotiation.
- (c) WebGL2 fallback engaged but the fallback path itself is heavier
  than the pre-migration WebGL renderer.

**Method:**
- Capture from a real mobile device via Chrome remote-debug if
  available; otherwise Chrome DevTools Mobile Emulation + 4x CPU
  throttle + 4G network throttle.
- Log `navigator.gpu` presence, `navigator.gpu.requestAdapter()`
  outcome, the final renderer class constructed
  (`WebGPURenderer`/`WebGLRenderer`), and the adapter info.
- Run a representative scene (Open Frontier 60 NPCs — small enough to
  finish startup on a phone) for 60 s.
- Capture renderer type, adapter info, frame time @ 5 s / 30 s / 60 s,
  GPU memory if observable.

**Deliverable:**
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-renderer-mode-truth.md`.
Top-of-memo: one-paragraph answer to "what is mobile actually
running." Then evidence + screenshots/JSON captures + limitations.

**Acceptance:** Memo names the renderer mobile lands in, with
adapter-info evidence (real device or labeled emulation).

### webgl-fallback-pipeline-diff (R1)

Pre-vs-post-migration diff of the WebGL render pipeline.

**Method:**
- Use `git show <pre-merge-sha>:src/core/GameRenderer.ts` (and related
  systems) to inspect the pre-merge renderer surface without checking
  out the SHA.
- List every render pass, post-effect, render-target binding, and
  per-frame uniform/buffer upload in the post-merge WebGL2-fallback
  path.
- Flag everything new in the post-merge WebGL2-fallback path that
  wasn't in the pre-migration WebGL path.
- Rank suspected cost contributors.

**Deliverable:**
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md`.

**Acceptance:** Memo lists ≥5 new pipeline elements with `file:line`
citations from the post-merge code. Top-3 most likely WebGL2-cost
contributors flagged with rationale.

### tsl-shader-cost-audit (R1)

Inventory and cost-characterize all production TSL materials, with
particular attention to what they compile to on the WebGL2 fallback
path.

**Method:**
- Grep TSL imports (`from 'three/tsl'`, `MeshStandardNodeMaterial`,
  `MeshBasicNodeMaterial`, `MeshPhysicalNodeMaterial`,
  `NodeMaterial`, etc.) under `src/`.
- For each TSL material instantiated in production code, capture the
  compiled GLSL via `renderer.compileAsync(scene, camera)` followed by
  reading the program from `renderer.info` or via a sacrificial probe
  script (push the probe, run it, harvest data into the memo, drop
  the probe — do not ship it).
- Characterize: fragment instruction count proxy (line count + heavy
  ops), `highp` usage, branching count, sampler/texture count,
  uniform count.
- Compare to the pre-migration material it replaced if such a
  comparison exists.

**Deliverable:**
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md`.

**Acceptance:** Memo names every TSL material in production, ranked
by estimated WebGL2 fragment cost. Top-3 cost contributors named with
`file:line` citations. Pre-migration comparison included where the
material existed before.

### sky-visual-and-cost-regression (R1)

Two-part investigation on the sky-bland regression.

**Part (a) — visual:** what changed in the sky/cloud system that made
the sky look bland post-merge?

**Part (b) — cost:** what does the post-merge sky cost on WebGL2
fallback vs the pre-migration sky?

**Method:**
- Use `git show <pre-merge-sha>:...` to compare
  `HosekWilkieSkyBackend.ts`, `AtmosphereSystem.ts`, and the cloud
  system files against current master.
- Capture pre-merge and post-merge sky screenshots from the same
  scene at the same time-of-day. Reference scene: Open Frontier mode
  select → freeplay, time fixed at midday.
- For part (b), profile the post-merge sky pass on WebGL2 fallback
  specifically. The pre-merge sky cost can be approximated from the
  trusted pre-merge perf-baselines if a direct capture isn't
  feasible.

**Deliverable:**
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md`
with PNG screenshots committed or linked. Markdown image references
under `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/` are
fine.

**Acceptance:** Memo answers (a) and (b) with `file:line` citations
and at least one paired pre/post screenshot (or an explicit
"screenshots not feasible because X" note).

### mobile-startup-and-frame-budget (R1)

Mode-click → first frame cost on mobile, plus per-frame system
breakdown at the mobile frame budget.

**Method:**
- Capture mode-click → first frame timing on mobile (or 4x CPU
  throttle emulation labeled as such).
- Use `scripts/perf-startup-ui.ts` + `startup-marks.json` if it works
  on mobile/emulation; otherwise extend with mobile-aware capture.
- Capture 60 s of per-frame `systemBreakdown` via
  `performanceTelemetry` once playable.
- Identify the dominant cost contributor in two phases: startup
  (mode-click → first playable frame) and steady-state (first 60 s of
  play).

**Deliverable:**
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-startup-and-frame-budget.md`.

**Acceptance:** Memo names top-3 startup cost contributors and top-3
steady-state system contributors at the mobile (or labeled emulated
mobile) frame budget, with raw artifact paths cited.

### MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16 (R2, orchestrator-only)

After all 5 R1 memos merge, the orchestrator (main Claude Code
session) reads them, then writes
`docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md`. This memo:

- Synthesizes the 5 R1 findings into a single picture of the
  regression.
- Identifies 1-3 concrete fix candidates ranked by impact + effort.
- Proposes ≥1 named fix cycle to add to
  `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`.
- Closes KB-MOBILE-WEBGPU and KB-SKY-BLAND in
  `docs/CARRY_OVERS.md` with "investigation complete; fix work
  tracked under `<fix-cycle-slug>`" resolution.

This is a single PR authored by the orchestrator, not dispatched to
an executor.

## Hard Stops

Standard:
- Fenced-interface change (`src/types/SystemInterfaces.ts`) → halt,
  surface to owner.
- Worktree isolation failure → halt.
- Twice-rejected reviewer on a single task → halt. (Memo-only PRs
  unlikely to trigger this.)

Cycle-specific:
- ≥3 of 5 investigators return "can't measure" → the cycle premise is
  broken; halt and surface to the owner with the partial findings.
- Real-mobile-capture infeasible across the board → fall back to
  Chrome DevTools emulation + CPU 4x + 4G throttle (documented
  limitation). NOT a hard stop. An ambiguous renderer-mode answer
  from `mobile-renderer-mode-truth` IS a hard stop.

## Reviewer Policy

- No mandatory reviewer subagent for R1 task PRs. No touches to
  `src/systems/combat/**`, `src/systems/terrain/**`, or
  `src/systems/navigation/**` are expected. If an investigator finds
  they need to touch one of those paths, that's a scope-change signal
  → halt and surface.
- The orchestrator reviews each R1 memo PR for: memo-only diff (no
  product-code changes), file:line citations present, acceptance
  criteria met.

## Acceptance Criteria (cycle close)

- 5 R1 memo PRs merged to master.
- R2 alignment memo committed to master.
- ≥1 fix cycle named and queued in
  `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`.
- KB-MOBILE-WEBGPU and KB-SKY-BLAND closed in `docs/CARRY_OVERS.md`
  with promotion-to-fix-cycle resolution.

## Out of Scope

- Does not ship a fix for mobile or sky regression (the fix cycle
  that this cycle's alignment memo proposes will).
- Does not touch fenced interfaces.
- Does not touch `src/systems/combat/**`, `src/systems/terrain/**`,
  or `src/systems/navigation/**`.
- Does not refresh `perf-baselines.json`
  (`cycle-stabilizat-1-baselines-refresh` owns that).
- Does not absorb or repurpose the active
  `task/mode-startup-terrain-spike` branch — leave it parked.
- Does not deploy.

## Carry-over impact

| Action | When | Active count |
|--------|------|--------------:|
| Open `KB-MOBILE-WEBGPU` + `KB-SKY-BLAND` | Launch PR | 9 → 11 |
| Close both with "promoted to fix cycle" resolution | R2 alignment-memo PR | 11 → 9 |

Net cycle delta: 0. Cycle exits clean, no INCOMPLETE flag.
