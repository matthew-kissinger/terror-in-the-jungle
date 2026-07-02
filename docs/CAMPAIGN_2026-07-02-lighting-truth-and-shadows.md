# Campaign: lighting-truth-and-shadows (2026-07-02)

Owner decision (2026-07-02, voice): after a 13-agent read-only lighting recon (6 threads +
adversarial verification + completeness critic; findings summarized below), the owner
approved the recommended plan with the **middle-path shadow fork (C)**: "Let's take the
middle path with your recommendation, and then we can reassess the CSM."

Scope boundary ratified by the recon: the TOD/lighting-rig CORE (single TOD authority →
Hosek-Wilkie backend → LightingRig linear-radiance bindings, unified 2026-06-10) is sound
and is NOT rebuilt. The owner symptoms trace to four bounded subsystems; each gets a
workstream. CSM (full cascaded shadow maps) is explicitly DEFERRED — reassess after the
owner walks the middle-path result.

Posture: autonomous-loop (merge on CI green + reviewer APPROVE; owner feel-walks deferred
to PLAYTEST_PENDING). Every experiential change ships rig-style: config kill-switch +
proposed feel-walk row. Deploy at close via `gh workflow run deploy.yml --ref master`
+ `npm run check:live-release`.

## Verified root causes (recon, all adversarially confirmed)

| Symptom | Root cause |
|---|---|
| Sun disc poor quality | SunDiscMesh sprite: no limb darkening, no atmospheric extinction, hard feather edge; no terrain occlusion beyond depth-test (disc shows through ridgelines) |
| Light through terrain | (1) sun radiance never elevation-gated (exposure baked in color; backend getSun emitted sub-horizon); (2) terrainLowSunOcclusionMask 5-tap horizon march only darkens terrain COLOR ~28%, never gates the light; (3) MIN_SUN_Y=20m clamp degenerates the shadow frustum at grazing angles |
| Shadows barely visible | GPU billboard vegetation + ground cards + NPCs/weapons + static impostors all cast ZERO shadows; terrain casters bounded 640m; single map ±70/100m footprint; no CSM |
| Impostors never match TOD | Material tuning uniforms (colorTint/saturation/exposure/bounds) set once at construction, never TOD-driven; static-impostor plain Lambert vs billboard wrapped-Lambert (LOD pop); check:tod-coherence fixture samples bare terrain (instrument cannot measure foliage; artifacts contradict: 0.977 PASS 2026-06-25 vs 0.810 FAIL 2026-06-29) |

## Resolved forks

| Fork | Decision |
|---|---|
| Burn-down scope | Targeted: scorch sun disc only; keep rig/TOD core; four workstreams |
| Shadow architecture | (C) middle path: fix existing single-map (frustum/bias/caster set/degenerate-frustum handling), near-field billboard shadow proxies only; CSM reassessed after owner walk |
| Instrument | tod-coherence fixture fix lands FIRST; no re-tuning trusted until the gate measures real foliage |
| TOD→impostor mapping | Approved: per-family TOD-keyed curve config consumed per-frame from rig state; defaults reproduce current midday look; unify wrapped-Lambert across impostor paths |
| Light gating | Approved: elevation-gated sun radiance (dies below horizon), horizon march feeds the light term |
| Defaults | New behavior default-ON with kill-switch flags (owner sign-off = this manifest, per AGENTS.md U3); orchestrator flips default OFF at close if MAIN-worktree perf proof regresses combat120 p99 band |

## Waves

| wave | slug | scope | reviewer |
|---|---|---|---|
| L1 | task/tod-coherence-fixture-truth | fixture frames real foliage; fail-loud anchor fallback; reconcile 0.977-vs-0.810 artifact contradiction | — |
| L1 | task/sun-disc-scorch-rebuild | scorch SunDiscMesh internals: limb darkening, elevation-keyed extinction, soft scatter edge, terrain-horizon occlusion fade; TSL+GLSL parity | — |
| L2 | task/sun-elevation-light-gating | elevation gate on sun radiance/exposure; horizon march → direct-light term; family-coherent low-sun response; cloud/bloom interaction checks | terrain-nav-reviewer |
| L2 | task/shadow-single-map-truth | shadow camera/bias/precision fixes; MIN_SUN_Y degenerate-frustum handling; near-field billboard shadow proxies; caster-set truth | terrain-nav-reviewer |
| L3 | task/tod-impostor-dynamic-mapping | TOD-keyed per-family shading curves (billboard/static-impostor/NPC-sprite); Lambert unification; live-tune dev surface | combat-reviewer |
| L4 | orchestrator | tod-coherence sweep proof, MAIN-worktree combat120 capture, registry/playtest rows, validate, deploy, close |

## Hard rules

- Zero fence changes (`src/types/SystemInterfaces.ts` untouched).
- Executors do NOT edit DIRECTIVES.md / CARRY_OVERS.md / PLAYTEST_PENDING.md / state/CURRENT.md
  (orchestrator batch-appends rows at close from PR-proposed text).
- Perf captures only from the MAIN worktree (Windows MAX_PATH).
- WebGPU AND WebGL2 fallback paths must both be handled wherever a shader changes.
- The tod-coherence gate stays advisory (Tier 2.5 pre-deploy step), not a blocking CI job.
