# KONVEYER Full Autonomous WebGPU Migration

Last verified: 2026-05-11

This memo defines the autonomous experimental-branch objective for the
KONVEYER renderer campaign: migrate Terror in the Jungle from the current
`WebGLRenderer` production runtime toward production-ready strict
`WebGPURenderer` + TSL. KONVEYER-0 through KONVEYER-9 now have branch-review
evidence on `exp/konveyer-webgpu-migration`; the next cycle is KONVEYER-10,
rest-of-scene parity and frame-budget attribution. WebGL is diagnostic only
for this campaign and must not be counted as fallback success, completion
success, or demo-readiness proof.

This is agent work now. The owner reviews the branch at the end. The agent
should keep progressing through the campaign map, committing and pushing
incrementally, without asking for permission unless a hard stop below is hit.

If this memo is older than 30 days, refresh all WebGPU, TSL, browser, and
Three.js assumptions before using it.

## Directive

Continue the KONVEYER WebGPU migration campaign on
`exp/konveyer-webgpu-migration` from the completed KONVEYER-0 through
KONVEYER-9 branch-review packet into KONVEYER-10. Preserve strict
WebGPURenderer + TSL proof with no WebGL fallback in the acceptance path. Focus
the next cycle on rest-of-scene visual parity and frame-budget attribution:
vegetation and NPC washout, atmosphere/sky/cloud behavior, world-budget
decomposition, skyward triangle attribution, finite-map terrain-edge
presentation, cross-browser/mobile proof, and A Shau perf acceptance. Commit
and push often for human review, and stop only for fenced-interface changes,
perf-baseline updates, master merges, production deploys, or a renderer/visual
regression that makes the game unfit for playtest.

## Branch Policy

- Branch: `exp/konveyer-webgpu-migration`
- Create it from current `origin/master` if absent; otherwise continue it.
- Commit after coherent milestones.
- Push the branch frequently.
- Do not merge to `master`.
- Do not deploy experimental renderer code.
- Do not update `perf-baselines.json`.
- Do not edit `src/types/SystemInterfaces.ts`.
- Do not wait for owner review between KONVEYER slices unless a hard stop is
  reached.

## Required Reading

Read these first, in order:

1. `AGENTS.md`
2. `docs/ENGINEERING_CULTURE.md`
3. `docs/INTERFACE_FENCE.md`
4. `docs/TESTING.md`
5. `docs/state/CURRENT.md`
6. `docs/state/perf-trust.md`
7. `docs/rearch/KONVEYER_AUTONOMOUS_RUN_2026-05-10.md`
8. `docs/tasks/konveyer-full-autonomous-migration.md`
9. `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
10. `docs/rearch/KONVEYER_TERRAIN_LIGHTING_ANALYSIS_2026-05-11.md`
11. `scripts/webgpu-strategy-audit.ts`
12. `scripts/check-platform-capabilities.ts`

Then refresh external facts from current official sources:

- Three.js WebGPURenderer docs and examples.
- Three.js TSL / nodes docs and examples.
- Three.js release notes for installed and current latest versions.
- MDN/WebGPU and browser implementation notes relevant to Chrome, WebView2,
  Safari/WKWebView, and Android WebView.

Use archived repo docs as history only. Do not carry old WebGPU claims forward
without refreshing them.

## Campaign Map

### KONVEYER-0 - Recon, Parity, And Campaign Bootstrap

Deliver:

- `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
- current upstream research summary
- repo shader/renderer parity matrix
- initial `npm run check:webgpu-strategy` artifact
- a concrete KONVEYER-1 through KONVEYER-9 execution plan

Scope:

- Inventory `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`,
  `WebGLRenderTarget`, direct WebGL context access, post-processing, terrain,
  water, combatants, vegetation, UI map/minimap, and telemetry paths.
- Classify every row as `ready`, `needs-port`, `blocked`, or `unknown`.
- Choose the first production-adjacent slice based on evidence, not preference.

### KONVEYER-1 - Strict Renderer Boot Path

Deliver:

- strict WebGPU renderer creation path behind an explicit runtime flag or dev
  query parameter
- WebGL retained only as a named diagnostic outside the proof path
- renderer capability object that records backend, adapter limits, and missing
  features
- smoke test or browser probe proving strict WebGPU either starts or fails
  loudly

Rules:

- No fallback success in migration proof.
- No fenced-interface change.
- If a shared interface is needed, add an internal adapter outside the fence.

### KONVEYER-2 - TSL Material Foundation

Deliver:

- first reusable TSL/node material helpers
- one low-risk material port under strict WebGPU
- tests or visual probe showing the material path fails loudly when WebGPU
  backend proof is unavailable

Preferred first ports:

- billboard shader fixture
- simple water/debug material
- isolated combatant material fixture

Avoid first:

- terrain material
- full post-processing stack
- all combatant animation materials at once

### KONVEYER-3 - Vegetation GPU-Driven Slice

Deliver:

- vegetation visibility/culling or draw-submission prototype using WebGPU where
  available
- strict WebGPU evidence
- local diagnostics comparing before/after on the same strict WebGPU scene path

This is the preferred first high-value implementation slice because it is less
entangled with animation determinism than combatants.

### KONVEYER-4 - Combatant Render Slice

Deliver:

- isolated combatant bucket or impostor path on the WebGPU/TSL route
- no change to combat simulation truth
- strict WebGPU perf and visual evidence at low count before scaling

Only scale after a small path is proven.

### KONVEYER-5 - Particle, Projectile, And Effects Compute Slice

Deliver:

- one compute-backed effect or projectile broadphase prototype
- CPU determinism path retained; no WebGL renderer fallback in proof
- deterministic ownership boundaries documented

Candidate paths:

- particles/explosions
- tracer/projectile broadphase
- grenade/effect integration

### KONVEYER-6 - Cover And AI Sensor Compute Slice

Deliver:

- GPU-ready data layout or compute prototype for cover/sensor sampling
- CPU fallback retained
- clear relationship to DEFEKT-3 and `CoverQueryService`

Do not move AI authority to the GPU. The GPU path is a carrier for query data,
not the owner of tactical decisions.

### KONVEYER-7 - Terrain, Water, And Post-Processing Parity

Deliver:

- terrain material parity plan and first safe port if feasible
- water material/query parity review
- post-processing compatibility decision

This is tail work. Do not start here unless earlier slices prove impossible.

### KONVEYER-8 - Strict WebGPU Validation Policy

Deliver:

- strict WebGPU capability matrix
- diagnostic-only WebGL comparison policy
- browser/platform support notes
- validation commands and expected artifacts
- documented user-visible risk list

Any renderer result that resolves to WebGL is non-proof for this campaign.

### KONVEYER-9 - Default-On Readiness Packet

Deliver:

- final branch review packet
- default-on readiness checklist
- remaining blocker list
- rollback plan
- owner-review instructions

Do not flip production default on `master`. The branch may include a proposed
default-on patch if it is clearly isolated and reviewable.

### KONVEYER-10 - Scene Parity And Frame-Budget Attribution

Deliver:

- decomposed `World` timing for atmosphere sky texture, atmosphere light/fog,
  weather, water, and zone/ticket work
- strict-WebGPU material/debug evidence for vegetation and NPC impostors:
  raw atlas/crop, material lighting, fog contribution, and final output
- a fix or documented decision for `todCycle.startHour` drift
- skyward renderer-counter capture with scene/pass attribution
- a sky/cloud anchoring decision that keeps flight views from reading as if
  clouds or the dome travel with the player. The first implementation slice is
  camera-followed dome plus world/altitude-projected cloud-deck sampling,
  proved at
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`;
  cloud art direction, shadows/occlusion, weather layering, and possible
  authored/Pixel Forge cloud assets remain follow-up work.
- a finite-map terrain-edge strategy for Zone Control and other small maps
- strict-WebGPU Open Frontier, Zone Control, Team Deathmatch, combat120, and
  A Shau short captures
- current branch checkpoint `ca587625` on
  `origin/exp/konveyer-webgpu-migration`; latest close-NPC materialization and
  startup compile proof is
  `artifacts/perf/2026-05-12T01-03-47-834Z/konveyer-asset-crop-probe/asset-crop-probe.json`

Rules:

- Treat terrain color as generally accepted for now unless new evidence
  reopens it; source texture outliers that visibly fight the Vietnam palette
  should be corrected at the asset level.
- Do not refresh perf baselines from this branch.
- Do not convert explicit WebGL diagnostics into product fallback proof.
- Do not claim production rollout readiness until cross-browser/mobile and
  A Shau perf acceptance are linked.

## Current Repo Rails

The active production runtime is WebGL2. `npm run check:webgpu-strategy` is
the existing strategy audit. It should evolve from "defer" toward a tracked
KONVEYER decision only when the branch has evidence.

Initial 2026-05-10 inventory:

- Custom material/shader surface exists in `CombatantShaders`,
  `CombatantRenderer`, `MuzzleFlashSystem`, `PostProcessingManager`,
  atmosphere backends, `WaterSystem`, `TerrainMaterial`, and billboard
  buffer code.
- Renderer and WebGL-specific references are spread through core runtime,
  telemetry, effects, terrain, world rendering, UI maps, and audit scripts.
- `src/types/SystemInterfaces.ts` is fenced.
- `perf-baselines.json` is owner-gated.
- `dist/`, `dist-perf/`, `artifacts/`, and generated browser profiles are not
  source.

## Autonomy Rules

- Keep moving through the campaign map if a slice blocks.
- Record blockers in the parity matrix and continue to the next viable slice.
- Prefer adapters and contained modules over fence changes.
- Prefer small runtime flags and explicit dev query parameters over broad
  abstractions.
- Prefer compile/browser probes before large production integration.
- Preserve strict WebGPU truth over fallback comfort.
- Treat CI perf as advisory. A green CI perf job does not close STABILIZAT-1.
- Do not refresh baselines.
- Do not ask for permission to continue after ordinary implementation
  blockers; document and route around them.

## Fallback Ladder

- If upstream docs are unavailable: record failed URLs/commands, use installed
  package types/examples, mark upstream rows stale, and continue.
- If WebGPU is unavailable in the current browser: complete compile-time work,
  document the browser block, and continue only on tasks that do not claim
  renderer proof.
- If Three.js WebGPU APIs changed: pin findings to installed version, add a
  "latest differs" row, and keep implementation scoped.
- If a slice fails twice for the same root cause: stop that slice, preserve the
  evidence, mark it blocked, and continue to the next KONVEYER slice.
- If a production path would require WebGPU-only behavior: keep it on the
  experimental branch and document the platform support gap.
- If GitHub auth blocks branch push: keep committing locally, write the exact
  push command and blocker, and continue local work.

## Hard Stops

Stop implementation and write a handoff note if any of these are required:

- edit `src/types/SystemInterfaces.ts`
- update `perf-baselines.json`
- merge to `master`
- deploy experimental renderer code
- require WebGL fallback for migration proof
- hide a known renderer regression

## Validation Standard

Before final branch handoff:

- `npm run lint`
- `npm run test:run`
- `npm run build`
- `npm run check:webgpu-strategy`
- targeted tests/probes for every shipped KONVEYER slice

For docs-only changes, add:

- `npm run lint:docs`

For browser-facing work, include a screenshot or JSON artifact proving the
code path ran.

## Final Review Packet

Use this shape:

```
=== KONVEYER autonomous migration summary ===

Branch: exp/konveyer-webgpu-migration
Head: <sha>

Campaign progress:
  - KONVEYER-0: <done/partial/blocked>
  - KONVEYER-1: <done/partial/blocked>
  - ...
  - KONVEYER-9: <done/partial/blocked>
  - KONVEYER-10: <done/partial/blocked>

Upstream facts refreshed:
  - <source/date/one-line finding>

Repo parity:
  - <system>: <ready | needs-port | blocked | unknown> - <reason>

Implemented slices:
  - <slice>: <files/evidence/result>

Validation:
  - npm run lint: <pass/fail>
  - npm run test:run: <pass/fail>
  - npm run build: <pass/fail>
  - npm run check:webgpu-strategy: <pass/fail>

Human review needed:
  - <decision>
```
