# KONVEYER Full Autonomous WebGPU Migration

Last verified: 2026-05-10

This memo defines the autonomous experimental-branch objective for the
KONVEYER renderer campaign: migrate Terror in the Jungle from the current
`WebGLRenderer` runtime toward production-ready `WebGPURenderer` + TSL, with
WebGL retained as a fallback until human review approves the default-on flip.

This is agent work now. The owner reviews the branch at the end. The agent
should keep progressing through the campaign map, committing and pushing
incrementally, without asking for permission unless a hard stop below is hit.

If this memo is older than 30 days, refresh all WebGPU, TSL, browser, and
Three.js assumptions before using it.

## Directive

Run the full KONVEYER WebGPU migration campaign on
`exp/konveyer-webgpu-migration`: begin with KONVEYER-0 recon, then continue
through staged WebGPURenderer + TSL migration work toward default-on WebGPU
with WebGL fallback. Research current upstream Three.js/WebGPU guidance, audit
and port repo rendering surfaces incrementally, build measured
vegetation/combatant/compute slices, document the KONVEYER-0 through
KONVEYER-9 path, commit and push often for human review, and stop only for
fenced-interface changes, perf-baseline updates, master merges, or production
deploys.

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
9. `scripts/webgpu-strategy-audit.ts`
10. `scripts/check-platform-capabilities.ts`

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

### KONVEYER-1 - Dual Renderer Boot Path

Deliver:

- opt-in WebGPU renderer creation path behind an explicit runtime flag or dev
  query parameter
- WebGL default unchanged
- renderer capability object that records backend, adapter limits, and missing
  features
- smoke test or browser probe proving WebGL default still starts

Rules:

- No production default flip.
- No fenced-interface change.
- If a shared interface is needed, add an internal adapter outside the fence.

### KONVEYER-2 - TSL Material Foundation

Deliver:

- first reusable TSL/node material helpers
- one low-risk material port with WebGL parity retained
- tests or visual probe showing the old and new material paths can coexist

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
- WebGL fallback path
- local evidence comparing the same scene path before and after

This is the preferred first high-value implementation slice because it is less
entangled with animation determinism than combatants.

### KONVEYER-4 - Combatant Render Slice

Deliver:

- isolated combatant bucket or impostor path on the WebGPU/TSL route
- no change to combat simulation truth
- WebGL fallback retained
- perf and visual evidence at low count before scaling

Only scale after a small path is proven.

### KONVEYER-5 - Particle, Projectile, And Effects Compute Slice

Deliver:

- one compute-backed effect or projectile broadphase prototype
- fallback CPU/WebGL path
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

### KONVEYER-8 - Cross-Backend Validation And Fallback Policy

Deliver:

- WebGPU/WebGL capability matrix
- fallback policy
- browser/platform support notes
- validation commands and expected artifacts
- documented user-visible risk list

The WebGL path remains present until human review approves its deprecation.

### KONVEYER-9 - Default-On Readiness Packet

Deliver:

- final branch review packet
- default-on readiness checklist
- remaining blocker list
- rollback plan
- owner-review instructions

Do not flip production default on `master`. The branch may include a proposed
default-on patch if it is clearly isolated and reviewable.

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
- Preserve WebGL fallback until owner review.
- Treat CI perf as advisory. A green CI perf job does not close STABILIZAT-1.
- Do not refresh baselines.
- Do not ask for permission to continue after ordinary implementation
  blockers; document and route around them.

## Fallback Ladder

- If upstream docs are unavailable: record failed URLs/commands, use installed
  package types/examples, mark upstream rows stale, and continue.
- If WebGPU is unavailable in the current browser: complete compile-time and
  WebGL-fallback work, document the browser block, and continue.
- If Three.js WebGPU APIs changed: pin findings to installed version, add a
  "latest differs" row, and keep implementation scoped.
- If a slice fails twice for the same root cause: stop that slice, preserve the
  evidence, mark it blocked, and continue to the next KONVEYER slice.
- If a production path would require WebGPU-only behavior: keep it behind the
  experimental branch flag and document the fallback gap.
- If GitHub auth blocks branch push: keep committing locally, write the exact
  push command and blocker, and continue local work.

## Hard Stops

Stop implementation and write a handoff note if any of these are required:

- edit `src/types/SystemInterfaces.ts`
- update `perf-baselines.json`
- merge to `master`
- deploy experimental renderer code
- remove WebGL fallback
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

