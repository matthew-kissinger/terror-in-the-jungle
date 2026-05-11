# KONVEYER Full Autonomous WebGPU Migration

Last verified: 2026-05-11

## Goal

Run the full KONVEYER WebGPU migration campaign on an experimental branch,
starting with recon and continuing through staged implementation toward a
production-ready strict `WebGPURenderer` + TSL path. WebGL is diagnostic only
and must not be treated as a migration fallback, acceptance path, or demo proof.

Pasteable directive:

> Run the full KONVEYER WebGPU migration campaign on
> `exp/konveyer-webgpu-migration`: begin with KONVEYER-0 recon, then
> autonomously progress through staged WebGPURenderer + TSL migration work
> toward strict default-on WebGPU with no WebGL fallback in the proof path.
> Research current upstream Three.js/WebGPU guidance, audit and port repo
> rendering surfaces incrementally, build measured
> vegetation/combatant/compute slices, document the KONVEYER-0 through
> KONVEYER-9 path, commit and push often for human review, and stop only for
> fenced-interface changes, perf-baseline updates, master merges, production
> deploys, or a renderer/visual regression that would make the game unfit for
> playtest.

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
8. `docs/rearch/KONVEYER_TERRAIN_LIGHTING_ANALYSIS_2026-05-11.md`
9. `scripts/webgpu-strategy-audit.ts`
10. `scripts/check-platform-capabilities.ts`

## Campaign Slices

### KONVEYER-0 - Recon And Bootstrap

- Refresh upstream WebGPU/TSL facts.
- Run `npm run check:webgpu-strategy`.
- Write `docs/rearch/KONVEYER_PARITY_2026-05-10.md`.
- Map all renderer/material/post/terrain/water/combatant/vegetation blockers.
- Confirm the order of KONVEYER-1 through KONVEYER-9 in repo-specific terms.

### KONVEYER-1 - Dual Renderer Boot Path

- Add a strict WebGPU renderer path behind an explicit experimental flag.
- Do not preserve WebGL as the experiment proof path.
- Record backend capability data.
- Add startup smoke evidence for strict WebGPU where available.

### KONVEYER-2 - TSL Material Foundation

- Add reusable TSL/node material helpers.
- Port one low-risk material fixture.
- Keep old material path only as named diagnostic evidence outside the proof
  path.

### KONVEYER-3 - Vegetation GPU-Driven Slice

- Implement a contained vegetation visibility/culling or draw-submission path.
- Prove it under strict WebGPU.
- Capture local evidence.

### KONVEYER-4 - Combatant Render Slice

- Port an isolated combatant render bucket or impostor material path.
- Do not change combat simulation authority.
- Validate at low count under strict WebGPU before scaling.

### KONVEYER-5 - Particles, Projectiles, And Effects Compute

- Prototype one compute-backed effect or projectile broadphase path.
- Keep CPU determinism authority until proven; do not use WebGL as a renderer
  fallback for the proof path.
- Document determinism boundaries.

### KONVEYER-6 - Cover And AI Sensor Compute Carrier

- Prototype or prepare GPU-ready cover/sensor query data.
- Keep tactical decision ownership on CPU.
- Tie the result back to DEFEKT-3 and `CoverQueryService`.

### KONVEYER-7 - Terrain, Water, And Post Parity

- Decide terrain material, water material, and post-processing parity path.
- Port only the smallest safe tail item needed to prove the route.

### KONVEYER-8 - Strict WebGPU Validation Policy

- Build a strict WebGPU support matrix.
- Document any diagnostic WebGL comparisons as non-proof.
- Fail any migration packet that succeeds only through WebGL.

### KONVEYER-9 - Default-On Readiness Packet

- Produce the final branch review packet.
- Include proposed default-on patch only if isolated and reversible.
- Include rollback plan, remaining blockers, and human-review decisions.

## Autonomy Rules

- Continue to the next viable KONVEYER slice when blocked.
- Memo blocked slices with exact file/API reasons.
- Add adapters instead of changing fenced interfaces.
- Keep strict WebGPU proof alive and visible.
- Use explicit experimental flags or dev query params.
- Commit and push branch progress frequently.
- Do not wait for owner input unless a hard stop is hit.

## Hard Stops

Stop implementation and write a handoff note if any of these are required:

- edit `src/types/SystemInterfaces.ts`
- update `perf-baselines.json`
- merge to `master`
- deploy experimental renderer code
- require WebGL fallback for migration proof
- conceal a known renderer regression

## Validation

Run before final branch handoff:

```
npm run lint
npm run test:run
npm run build
npm run check:webgpu-strategy
```

Also run targeted tests/probes for each implemented KONVEYER slice.

## Human Review Packet

The final branch must include:

- `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
- implementation notes for KONVEYER slices attempted
- evidence artifact paths
- validation results
- final recommendation for default-on readiness or remaining blockers
