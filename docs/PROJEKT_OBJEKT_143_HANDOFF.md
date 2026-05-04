# Projekt Objekt-143 Handoff

Last updated: 2026-05-04

Use this as the first-read handoff for a fresh agent session continuing
Projekt Objekt-143. `docs/PROJEKT_OBJEKT_143.md` remains the authoritative
ledger; this file is the short operational prompt.

## Current Local State

- Repo: `C:\Users\Mattm\X\games-3d\terror-in-the-jungle`
- Branch: `master`
- Local branch is intentionally ahead of `origin/master`; do not push/deploy
  unless the owner explicitly asks for that release step.
- No production parity is claimed for the latest local work. Live production
  truth still comes from `/asset-manifest.json` and live Pages/R2/WASM/service
  worker checks.
- Keep WebGL stabilization as the active strategy. Do not start WebGPU
  migration unless the project owner explicitly approves that point of no
  return after evidence.

## Latest Evidence Anchors

- Cycle 3 kickoff/readiness:
  `artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
- Static Projekt suite:
  `artifacts/perf/2026-05-04T00-18-26-810Z/projekt-143-evidence-suite/suite-summary.json`
- KB-OPTIK decision packet:
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`
- KB-TERRAIN before baseline:
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`
- KB-CULL owner baseline:
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
- Rejected KB-CULL static-helicopter candidate:
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json`
- KB-EFFECTS trusted low-load closeout:
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`

## Current Bureau State

- KB-LOAD `pixel-forge-texture-upload-residency`: `ready_for_branch`.
  GiantPalm warmup reduced WebGL upload totals but did not improve startup
  latency. Do not broaden warmup from the rejected fanPalm evidence without a
  paired proof.
- KB-TERRAIN `large-mode-vegetation-horizon`: `ready_for_branch`.
  The first far-horizon branch must use the terrain baseline before/after
  screenshot path and matched Open Frontier/A Shau perf captures.
  The goal now also includes ground and vegetation art-direction correction:
  most traversable ground should read jungle green rather than gravel while
  preserving texture variety; verify whether slope/biome material distribution
  is inverted if green is mostly on hillsides; scale and ground tiny palms and
  ferns; increase big palms and ground vegetation; and make bamboo scattered
  dense clusters rather than the dominant forest layer.
- KB-CULL `static-feature-and-vehicle-culling-hlod`: `ready_for_branch`.
  The selected owner path is
  `large-mode-world-static-and-visible-helicopters`. Close-NPC/weapon pool
  residency remains diagnostic-only until combat stress measurement trust
  passes.
  A static helicopter distance-cull prototype was rejected because the trusted
  Open Frontier after capture failed validation and owner draw-call-like stayed
  `388`; do not repeat it as a claimed fix without new evidence.
- KB-EFFECTS `grenade-first-use-stall`: `evidence_complete` for the low-load
  unlit pooled explosion path. Do not infer combat120/stress closeout or
  future visual-polish safety from the low-load probe.
- KB-OPTIK `npc-imposter-scale-luma-contract`: `needs_decision`.
  Runtime LOD-edge proof passes; the remaining issue is the 8.5m near-stress
  silhouette exception/human-review decision. Do not resize aircraft as the
  first response without a separate vehicle-scale proof.

## Suggested Fresh Agent Prompt

```text
You are taking over Projekt Objekt-143 for Terror in the Jungle.

Repo: C:\Users\Mattm\X\games-3d\terror-in-the-jungle
Branch: master
Strategy: stabilize WebGL first. Do not start WebGPU migration unless the
project owner explicitly approves that point of no return.

Read first:
- AGENTS.md
- docs/PROJEKT_OBJEKT_143.md
- docs/PROJEKT_OBJEKT_143_HANDOFF.md
- docs/STATE_OF_REPO.md
- docs/PERFORMANCE.md
- docs/ASSET_ACCEPTANCE_STANDARD.md
- progress.md tail

Initial commands:
1. git status --short --branch
2. npm run doctor
3. npm run check:projekt-143-cycle3-kickoff
4. npm run check:projekt-143

Current evidence anchors:
- Cycle 3 kickoff:
  artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json
- KB-TERRAIN before baseline:
  artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json
- KB-CULL owner baseline:
  artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json
- KB-EFFECTS low-load closeout:
  artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json
- KB-OPTIK decision packet:
  artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json

Current bureau state:
- KB-LOAD: ready_for_branch, but no startup-latency win yet.
- KB-TERRAIN: ready_for_branch, before baseline exists; no far-canopy fix yet.
  Include the owner visual target: majority green/jungle floor, possible
  inverted material distribution, bigger/grounded palms and ferns, more big
  palms and ground cover, and bamboo as scattered dense clusters.
- KB-CULL: ready_for_branch, selected owner path is large-mode world static
  features plus visible helicopters; close-NPC/weapon residency remains
  diagnostic-only. Rejected static-helicopter distance-cull after artifact:
  artifacts/perf/2026-05-04T00-55-00-501Z/summary.json.
- KB-EFFECTS: evidence_complete only for low-load grenade first-use stall.
- KB-OPTIK: needs_decision for near-stress silhouette exception/human review.

Goal: continue toward completing Projekt Objekt-143 without making unsupported
claims. Pick the next remediation only after refreshing the kickoff matrix and
checking that the selected bureau has before evidence. Prefer a narrow,
bisectable branch:
- KB-CULL first path: large-mode world_static_features + visible helicopters,
  using the owner baseline guardrails.
- KB-TERRAIN first path: far-horizon representation/distance policy, using the
  elevated screenshot baseline and Open Frontier/A Shau perf guardrails.
- KB-LOAD first path: texture/upload residency with paired Open Frontier and
  Zone Control startup artifacts; do not revive the rejected fanPalm warmup
  without new paired evidence.

Hard constraints:
- KB-METRIK first: measurement trust gates every claim.
- Do not certify culling from static inventory or proof screenshots alone.
- Do not accept imposter fixes without matched GLB/imposter visual evidence.
- Do not reopen low-load KB-EFFECTS unless visuals change; stress/combat120
  grenade claims need fresh trusted stress evidence.
- No production parity claim without push/deploy/live Pages verification.

After each pass, update docs/progress, run the relevant Projekt checks plus
validate:fast, commit locally, and leave the repo clean.
```
