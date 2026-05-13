# Cycle: KONVEYER-11 Strict Proof Chain And Terrain Budget

Last verified: 2026-05-11

## Objective

Move the WebGPU branch from "strict WebGPU can render" toward a trustworthy
proof chain for renderer architecture decisions. This cycle owns the first
post-K10 slice: repair strict `perf-capture` attribution overhead, attribute
terrain/CDLOD main-vs-shadow cost from runtime captures, and treat
fire-through-terrain reports as a possible architecture contract failure
between combat, terrain, navigation, materialization, and perf shortcuts.

This is not a WebGL parity cycle. WebGL remains diagnostic evidence only.

## Branch And Hard Stops

- Continue `exp/konveyer-webgpu-migration`.
- Do not merge to `master`.
- Do not deploy experimental renderer code.
- Do not update perf baselines.
- Do not accept WebGL fallback as proof.
- Do not edit fenced interfaces without explicit owner approval.

## Scope

### strict-proof-chain-repair

- Keep full render-submission attribution available for forensic captures.
- Add and prove a lighter render-submission summary mode for trusted runtime
  captures.
- Preserve scene/category/pass ownership: terrain, terrain shadow,
  vegetation, NPC impostors, world static features, atmosphere, water, and
  overlays.
- Treat measurement-trust PASS/WARN/FAIL separately from gameplay perf PASS.

### terrain-budget-attribution

- Attribute elevated/skyward terrain cost by CDLOD terrain main pass and shadow
  pass before changing LOD policy.
- Add active node/ring evidence in the next implementation slice.
- Use strict WebGPU captures, not WebGL fallback, as the proof path.

### terrain-fire-authority-risk

- Record the player report that enemies can still be shot through terrain.
- Treat this as possible architecture debt, not a one-off weapon tuning bug.
- Audit the contract between combat LOS/fire authority, render terrain,
  collision/effective terrain height, navmesh, cover, materialization state,
  and cached perf shortcuts before optimizing any one path.
- First implementation slice owns only player fire/preview fallback behavior.
  It must not be used to claim NPC fire, AI LOS, active-driver validation, or
  cover authority are architecturally unified.

## Current Evidence

- Historical strict `perf-capture` blocker:
  `artifacts/perf/2026-05-11T18-37-33-773Z/summary.json` closed the browser
  target before runtime samples.
- Strict WebGPU capture without render-submission attribution:
  `artifacts/perf/2026-05-11T18-51-34-766Z/measurement-trust.json` passed
  measurement trust; the short validation failed only on heap recovery.
- Full render-submission attribution:
  `artifacts/perf/2026-05-11T18-52-12-160Z/measurement-trust.json` failed
  measurement trust because every-sample full frame export made probe round
  trips too expensive.
- Summary render-submission attribution, every sample:
  `artifacts/perf/2026-05-11T18-54-34-189Z/measurement-trust.json` was usable
  with caution and reduced render-submission sample output to about 366KB.
- Summary render-submission attribution, every fourth sample:
  `artifacts/perf/2026-05-11T18-56-10-018Z/measurement-trust.json` passed
  measurement trust. Overall validation still failed because peak p99 frame
  time hit 100ms, which is a runtime perf finding rather than a harness trust
  failure.
- The same trusted-attribution run recorded terrain-dominated peak summary
  frames, including a 1,505,280 terrain-triangle frame with pass split
  `{"main":2,"shadow":1}`.
- Active CDLOD node/ring evidence is now present in strict scene probes. The
  probe captures ground, elevated, skyward, and finite-edge poses, and records
  active tile counts by LOD plus distance rings. Current strict proof:
  `artifacts/perf/2026-05-11T19-27-26-995Z/konveyer-scene-parity/scene-parity.json`
  for Open Frontier + A Shau and
  `artifacts/perf/2026-05-11T19-29-34-958Z/konveyer-scene-parity/scene-parity.json`
  for Zone Control + combat120. Later K12 probe repair found the
  human-readable `team_deathmatch` label was not starting runtime enum `tdm`,
  so use
  `artifacts/perf/2026-05-11T20-21-57-694Z/konveyer-scene-parity/scene-parity.json`
  for actual Team Deathmatch terrain attribution. In the skyward pose, active
  tile counts reconcile to terrain triangles as `tiles * 2,560 triangles *
  three terrain submissions`:
  Open Frontier 357 -> 2,741,760; A Shau 200 -> 1,536,000; Zone Control 112
  -> 860,160; combat120 28 -> 215,040. Actual Team Deathmatch after the
  probe-alias repair records 40 skyward tiles and 307,200 terrain triangles
  across two main terrain submissions plus one shadow submission. The three
  terrain submissions are still split as two main-pass submissions plus one
  shadow-pass submission.
- Terrain/fire authority code audit found a real player-shot gap: under 200m,
  `CombatantCombat` trusted `raycastTerrain` but bypassed the CPU height-profile
  fallback entirely. If the near-field BVH missed or was stale, a close target
  behind a strong ridge could still take damage. `src/systems/combat/CombatantCombat.ts`
  now keeps long-range behavior and adds a close-range strong-ridge fallback
  requiring consecutive height samples before blocking. Targeted evidence:
  `artifacts/perf/2026-05-11T19-05-00-000Z/konveyer-terrain-fire-authority/vitest-combatant-combat.json`
  (`src/systems/combat/CombatantCombat.test.ts` covers actual player fire and
  preview fire when BVH reports no hit but effective terrain height blocks).
- Strict WebGPU browser proof:
  `artifacts/perf/2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority/terrain-fire-authority.json`
  passed with `resolvedBackend=webgpu`. The probe found a real Open Frontier
  181.7m player-shot line where `terrain.raycastTerrain` returned no hit,
  raw combat proxy raycast would hit the materialized OPFOR target, and CPU
  effective-height samples blocked the shot at 56m. Player preview and actual
  shot both returned no hit, and target health stayed 100 -> 100. This proves
  the BVH/height-profile authority split was a real gameplay risk.

## Initial Command Shape

```bash
npx tsx scripts/perf-capture.ts --headed --renderer webgpu-strict \
  --mode open_frontier --npcs 40 --duration 15 --warmup 2 \
  --sample-interval-ms 1000 --detail-every-samples 1 \
  --runtime-scene-attribution true --runtime-scene-attribution-every-samples 4 \
  --runtime-render-submission-attribution true \
  --runtime-render-submission-every-samples 4 \
  --runtime-render-submission-mode summary --runtime-preflight false
```

## Exit Criteria

- Trusted strict WebGPU runtime capture path exists for attribution runs. Met
  by the summary render-submission attribution cadence.
- Terrain main-vs-shadow ownership is preserved in artifacts. Met: terrain
  peak frames retain two main submissions plus one shadow submission.
- CDLOD node/ring evidence exists for ground, elevated, and skyward cameras.
  Met in the 19:27 and 19:29 strict scene-probe artifacts, with actual
  Team Deathmatch covered by the corrected 20:21 strict scene-probe artifact.
- Fire-through-terrain is either reproduced with evidence or converted into an
  exact blocker with the missing proof named.
- Docs record whether the next action belongs in terrain, combat LOS, navmesh,
  cover/materialization, caching, or renderer pass policy. Met for the first
  player-fire gap; DEFEKT-6 remains open for shared authority review.

## K11 Decision

K11 proof-chain work is sufficient to move to the finite-edge strategy slice.
Do not change CDLOD ranges or terrain shadow policy yet. The current evidence
shows the skyward terrain spike is not vegetation or NPC-driven; it is active
CDLOD terrain being submitted three times. The next renderer-facing terrain
work should decide the finite-map edge model first, because far-ring/horizon
strategy may change which terrain nodes should exist at all.

Correction from K12: the earlier probe accepted the human-readable
`team_deathmatch` label but the runtime enum is `tdm`, so that row fell through
to the default mode before the probe was patched. Treat the 19:29 artifact as
valid for Zone Control and combat120 only; use the 20:21 artifact for actual
Team Deathmatch proof.

## Remaining Terrain-Fire Work

- Extend browser evidence beyond the first Open Frontier synthetic target:
  capture the reported in-scene terrain shot when it reappears, plus Zone
  Control, TDM, combat120, and A Shau variants.
- Treat any continued shoot-through-terrain report after the first player-fire
  slice as a shared authority problem until disproven, spanning combat LOS,
  terrain height/BVH queries, nav placement, cover queries, materialization,
  active-driver validation, and cache invalidation.
- Compare the five current authority paths: player fire, player preview, NPC
  fire, AI LOS, and active-driver shot validation.
- Decide whether a shared terrain occlusion service is needed before changing
  raycast cadence, cache TTLs, materialization tiers, or nav/cover placement.
