# KONVEYER-0 Autonomous Renderer Recon

Last verified: 2026-05-10

## Goal

Create and push a reviewable experimental branch for KONVEYER-0: current
WebGPU/TSL research, repo renderer parity audit, one contained spike, local
evidence, and a go/no-go recommendation for a staged WebGPURenderer migration.

Pasteable directive:

> Run KONVEYER-0 as a 20-hour autonomous experimental branch. Refresh current
> Three.js WebGPURenderer and TSL guidance from upstream docs/examples, audit
> TIJ's WebGL renderer and custom shader surfaces, then build one contained
> vegetation or combatant WebGPU/TSL spike with local evidence. Commit and
> push `exp/konveyer-webgpu-migration` for human review; do not merge to
> master, do not change fenced interfaces, do not update perf baselines, and
> do not deploy experimental renderer code.

## Branch

- `exp/konveyer-webgpu-migration`

If the branch exists, continue it. If it does not exist, create it from the
current `origin/master`.

## Required Reading

1. `AGENTS.md`
2. `docs/ENGINEERING_CULTURE.md`
3. `docs/INTERFACE_FENCE.md`
4. `docs/TESTING.md`
5. `docs/state/CURRENT.md`
6. `docs/state/perf-trust.md`
7. `docs/rearch/KONVEYER_AUTONOMOUS_RUN_2026-05-10.md`
8. `scripts/webgpu-strategy-audit.ts`
9. `scripts/check-platform-capabilities.ts`

## Work Items

### 1. External Research Refresh

Use current official sources before coding:

- Three.js WebGPURenderer docs/examples
- Three.js TSL/nodes docs/examples
- Three.js release notes for installed and latest versions
- MDN/WebGPU browser support and API guidance

Write findings into `docs/rearch/KONVEYER_PARITY_2026-05-10.md`. Keep quotes
short; summarize decisions in repo terms.

### 2. Repo Parity Audit

Run:

```
npm run check:webgpu-strategy
```

Then inspect these surfaces:

- `src/core/GameRenderer.ts`
- `src/systems/combat/CombatantRenderer.ts`
- `src/systems/combat/CombatantShaders.ts`
- `src/systems/world/billboard/`
- `src/systems/terrain/TerrainMaterial.ts`
- `src/systems/effects/PostProcessingManager.ts`
- `src/systems/environment/WaterSystem.ts`
- `src/systems/debug/GPUTimingTelemetry.ts`

Output a matrix:

- works
- works-with-tweaks
- blocked
- unknown

Each row must name the blocking source file or API.

### 3. Pick One Spike

Default target: vegetation visibility/cull prepass. Choose combatant renderer
only if vegetation is blocked by missing source payload or browser support.

Rules:

- Isolated path only.
- No production default WebGPU path.
- No full renderer abstraction.
- No fence change.
- No terrain/post-processing migration.

### 4. Implement And Measure

Add the smallest source/test/probe surface needed for the spike. Prefer pure
helpers and scripts over runtime integration.

Minimum validation:

```
npm run lint
npm run test:run
npm run build
npm run check:webgpu-strategy
```

If the spike has a browser path, capture one artifact proving it ran. If the
browser/device blocks WebGPU, document the block and leave the spike
compile-only.

### 5. Commit And Push

Commit after each coherent milestone:

- research/parity memo
- spike scaffold
- measurement/evidence
- final decision update

Push `exp/konveyer-webgpu-migration` at least every two hours and at final.

## Autonomy Rules

- Do not ask the owner whether to continue when a path blocks. Use the
  fallback ladder in `docs/rearch/KONVEYER_AUTONOMOUS_RUN_2026-05-10.md`.
- Do not wait on perfect perf evidence. Mark noisy or timed-out captures as
  advisory and continue.
- Do not escalate external doc drift unless it changes the go/no-go decision.
- Do not touch `docs/AGENT_ORCHESTRATION.md`, `docs/CAMPAIGN_*.md`,
  `docs/CARRY_OVERS.md`, `docs/TESTING.md`, or
  `src/types/SystemInterfaces.ts`.
- Do not update `perf-baselines.json`.

## Human Review Packet

The final branch must contain:

- `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
- one spike implementation or a documented compile/browser block
- evidence artifact paths
- final recommendation: continue KONVEYER-1, keep contained spikes, or archive
  WebGPU for 90 days

