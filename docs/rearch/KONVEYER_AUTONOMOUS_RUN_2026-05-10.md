# KONVEYER Autonomous Renderer Recon

Last verified: 2026-05-10

This memo defines the next long-running experimental branch objective for
the rendering pipeline. It is not a campaign manifest and it does not approve
a production WebGPU renderer flip. It is a rail set for a 20-hour unattended
agent run that should keep making progress without repeatedly pausing for
owner input.

If this memo is older than 30 days, distrust its WebGPU and Three.js details.
The first action in any KONVEYER run is to refresh upstream facts from current
official Three.js examples/docs and current browser WebGPU docs.

## Revised Directive

Run KONVEYER-0 as a local-first experimental migration pass: confirm current
Three.js WebGPURenderer and TSL practices from upstream docs/examples, audit
TIJ's WebGL custom shader and renderer hot paths, then build the smallest
reviewable WebGPU/TSL spike that proves or rejects GPU-driven vegetation or
combatant rendering for this codebase. The run ends with an experimental
branch pushed for human review, evidence artifacts, and a clear go/no-go
matrix for the full KONVEYER campaign.

## Branch Policy

- Branch: `exp/konveyer-webgpu-migration`
- Commit incrementally to the branch after each coherent artifact or spike.
- Push the branch at least every 2 hours and at the end of the run.
- Do not merge to `master` from this run.
- Do not deploy game-affecting KONVEYER code.
- If a docs-only alignment commit is requested on `master`, validate it,
  push it, and optionally run `npm run deploy:prod`; production proof can be
  deferred if the owner says not to wait.

## Required Reading

Read these first, in this order:

1. `AGENTS.md`
2. `docs/ENGINEERING_CULTURE.md`
3. `docs/INTERFACE_FENCE.md`
4. `docs/TESTING.md`
5. `docs/state/CURRENT.md`
6. `docs/state/perf-trust.md`
7. `docs/rearch/KONVEYER_AUTONOMOUS_RUN_2026-05-10.md`
8. `docs/tasks/konveyer-0-autonomous-renderer-recon.md`
9. `scripts/webgpu-strategy-audit.ts`
10. `scripts/check-platform-capabilities.ts`

Then refresh external facts from current official sources before coding:

- Three.js WebGPURenderer docs and examples.
- Three.js TSL / nodes docs and examples.
- Three.js release notes for the installed version and current latest.
- MDN/WebGPU and browser implementation notes relevant to Chrome, WebView2,
  Safari/WKWebView, and Android WebView.

Use archived repo docs only as history. Do not copy old WebGPU claims forward
without refreshing them.

## Current Repo Rails

The active runtime is still WebGL2. `npm run check:webgpu-strategy` is the
repo's existing strategy audit, and it currently treats WebGPU migration as a
contained spike, not approved production work.

Initial local inventory on 2026-05-10:

- Custom material/shader surface exists in `CombatantShaders`,
  `CombatantRenderer`, `MuzzleFlashSystem`, `PostProcessingManager`,
  atmosphere backends, `WaterSystem`, `TerrainMaterial`, and billboard
  buffer code.
- Renderer and WebGL-specific references are spread through core runtime,
  telemetry, effects, terrain, world rendering, UI maps, and audit scripts.
- `src/types/SystemInterfaces.ts` is fenced. Do not change it.
- `perf-baselines.json` is owner-gated. Do not refresh baselines.
- `dist/`, `dist-perf/`, `artifacts/`, and generated browser profiles are
  not source. Do not commit them unless the task explicitly creates a
  durable evidence artifact under an allowed docs or artifact path.

## 20-Hour Work Plan

Work in this order. If blocked, use the fallback ladder below and keep moving.

### Track A - Upstream And Local Recon

Deliver:

- `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
- Updated `npm run check:webgpu-strategy` artifact
- Optional small doc patch to `scripts/webgpu-strategy-audit.ts` output only
  if it improves decision clarity without committing to migration.

Minimum content:

- Current Three.js WebGPURenderer import/setup path.
- Current TSL custom-material path.
- What happens to ShaderMaterial, RawShaderMaterial, onBeforeCompile,
  WebGLRenderTarget, EffectComposer-style post, and direct context access.
- Per-system gap matrix: works, works-with-tweaks, blocked, unknown.
- Explicit "do not port first" list for terrain/post if they are still tail
  work rather than head work.

### Track B - Platform Capability Probe

Deliver:

- Fresh `npm run check:platform-capabilities` output when the machine is quiet.
- If a headed browser run is available, capture WebGPU adapter features/limits.
- If WebGPU is unavailable, write the reason and continue with the parity memo.

Do not let platform probing consume the whole run. One failed browser attempt
is enough before moving back to static recon.

### Track C - Spike Selection

Pick exactly one spike target:

1. Vegetation GPU frustum/visibility prepass against a representative
   `ChunkVegetationGenerator`-style payload.
2. Combatant renderer TSL/material parity for one isolated low-count bucket.

Default to vegetation if both look viable. Vegetation is less entangled with
animation, damage, LOD residency, and replay determinism.

Deliver:

- A contained source spike under a clearly named experimental module or script.
- No production default path changes.
- A simple runner or probe that can be executed locally.
- A memo section explaining what was proved and what was not proved.

### Track D - Measurements

Use the lowest-cost evidence first:

- `npm run check:webgpu-strategy`
- targeted Vitest tests for pure helpers
- `npm run build`
- a small local browser/probe capture for the spike

Only run combat120 if the spike is stable and the machine is quiet. CI perf is
advisory; a green CI run does not close STABILIZAT-1.

### Track E - Review Packet

End with:

- `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
- updated or appended KONVEYER decision matrix
- branch pushed
- final report with commands run, artifacts, blockers, and next exact task

The owner review question is: "Do we continue to KONVEYER-1, stay in
contained spikes, or archive WebGPU for 90 days?"

## Fallback Ladder

Use this ladder instead of stopping for permission.

- If upstream docs are unavailable: record the failed URLs/commands, use local
  installed package examples/types, and mark the upstream rows stale.
- If WebGPU is unavailable in the browser: complete the parity audit and build
  the spike as a compile-only or mock-device proof; do not block the run.
- If Three.js WebGPU APIs changed: pin findings to current installed version,
  add a "latest differs" row, and avoid package upgrades unless the branch is
  explicitly about upgrade testing.
- If tests fail after a spike edit: fix twice. After two consecutive failures
  on the same root cause, revert only your spike changes for that area, memo
  the failure, and continue another track.
- If a fence change appears necessary: do not edit the fence. Add an adapter
  or memo the required interface proposal.
- If a perf capture is noisy or times out: keep the artifact, mark it
  advisory, and continue with smaller probes.
- If GitHub auth blocks branch push: commit locally, write the exact push
  command and blocker in the final report, and continue local work.
- If the run is near 20 hours: stop new coding, run validations, push the
  branch, and write the review packet.

## Stop Conditions

Stop production-facing changes, but keep writing the memo, if any happen:

- Required change to `src/types/SystemInterfaces.ts`.
- Required change to `perf-baselines.json`.
- A production runtime path must default to WebGPU to make the spike work.
- A master regression is discovered.
- The same implementation attempt fails twice for the same reason.

## Validation Standard

Before final branch push:

- `npm run lint`
- `npm run test:run`
- `npm run build`
- `npm run check:webgpu-strategy`
- targeted spike command or documented reason it could not run

For docs-only changes, add:

- `npm run lint:docs`

For browser-facing spike work, add a screenshot or JSON artifact that proves
the code path ran.

## Non-Goals

- No production renderer default flip.
- No TSL port of every shader site.
- No terrain material rewrite unless the chosen spike needs a tiny isolated
  terrain fixture.
- No post-processing migration.
- No bitECS migration.
- No baseline update.
- No master merge.
- No Cloudflare production deploy of experimental renderer code.

## Final Report Shape

Use this concise shape:

```
=== KONVEYER-0 autonomous run summary ===

Branch: exp/konveyer-webgpu-migration
Head: <sha>

Upstream facts refreshed:
  - <source/date/one-line finding>

Repo parity:
  - <system>: <works | tweaks | blocked | unknown> - <reason>

Spike:
  - target: <vegetation | combatant>
  - result: <ran | compile-only | blocked>
  - evidence: <artifact paths>

Validation:
  - npm run lint: <pass/fail>
  - npm run test:run: <pass/fail>
  - npm run build: <pass/fail>
  - npm run check:webgpu-strategy: <pass/fail>

Decision:
  - <continue KONVEYER-1 | keep contained spikes | archive 90 days>

Next exact task:
  - <one sentence>
```

