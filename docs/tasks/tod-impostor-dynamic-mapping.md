# task/tod-impostor-dynamic-mapping (wave L3)

Campaign: `docs/CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md` (fork "TOD->impostor
mapping" — APPROVED: per-family TOD-keyed curve config consumed per-frame from rig
state; defaults reproduce current midday look; unify wrapped-Lambert across impostor
paths). Reviewer: combat-reviewer.

## Owner symptom

"Impostor hue/brightness never matches time-of-day." The three camera-facing card
families — foliage billboards, static-impostor hero cards, NPC sprites — carried
their artistic tuning (colorTint / saturation / exposure) as STATIC uniforms set
ONCE at material construction. Sun-elevation radiance gating (`sun-elevation-light-gating`,
#493) already makes the physical DIRECT term die below the horizon for every rig
consumer, but the per-family ARTISTIC response (how far a card warms at dusk /
desaturates at night) was frozen at the midday look. So a card kept its noon hue as
the terrain around it reddened and darkened.

## What landed

1. **`src/systems/environment/TodImpostorMapping.ts`** — new module. A small
   declarative per-family curve config (`TOD_IMPOSTOR_FAMILY_CURVES`: foliage /
   staticImpostor / npc) mapping sun elevation -> `{ exposureMul, saturationMul, tint }`
   through ONE shared evaluator (`evaluateTodImpostorGrade`), so the curves stay
   comparable. Evaluated per frame (`updateTodImpostorMapping`) and mirrored into
   shared `{ value }` uniform bindings (`todImpostorMappingBindings`) the three card
   materials read by reference — the same one-binding pattern the rig uses. No
   material rebuilds; in-place scalar/color writes only (no per-frame allocation).
   **Defaults are IDENTITY at high sun** (`exposureMul=1`, `saturationMul=1`,
   `tint=white`), so the midday look is byte-identical to before; the visible grade
   is at dawn/dusk/night. **Kill-switch** `TodImpostorMappingConfig.enabled`
   (default ON, mirrored to `window.__todImpostorMapping`) — OFF freezes every
   binding at identity, reproducing construction-time static-uniform behavior
   exactly.

2. **Three consumers wired** (multiply the per-family bindings over the
   construction-time tint / saturation / exposure — identity at noon):
   - `BillboardNodeMaterial.ts` (foliage) — folds `foliage` mapping into
     `colorTint` / `vegetationSaturation` / `vegetationExposure`.
   - `StaticImpostorMaterial.ts` (static impostors) — folds `staticImpostor` mapping
     into the foliage-card tint / saturation / exposure, AND **unifies the
     wrapped-Lambert response**: the foliage-card lighting now uses the SAME
     `RIG_WRAP` wrapped-Lambert direct term the billboard + NPC sprite use, so a
     hero tree and its impostor card shade alike across the LOD snap (previously
     plain clamped-Lambert on the impostor vs wrapped-Lambert on the billboard).
   - `CombatantMeshFactory.ts` (NPC sprite) — folds `npc` mapping tint + saturation
     into the color-managed albedo and the `npc` exposure into the rig exposure.

3. **The rig update seam** (`LightingRig.deriveLightingRigState`) calls
   `updateTodImpostorMapping(sunElevation)` once per frame — the single rig update
   point, so no new per-frame seam. `AtmosphereSystem` publishes the kill-switch.

4. **npc low-sun overshoot fix** — the `npc` curve dims + desaturates HARDER at
   dusk/night than foliage (`nightExposureMul 0.52` vs `0.82`). Measured defect
   (wave L1, PR #490): the npc family OVERSHOT terrain brightness at low sun
   (corr 0.717, rangeRatio 3.934) — the sprite's up-biased card normal over-catches
   the low warm sun, amplified by the readability lift + alert boost. Grading the
   npc albedo down at low sun pulls its luminance curve back onto terrain's.

5. **Foliage fixture population** (`scripts/capture-tod-coherence-sweep.ts`) —
   `teleportFoliageIntoFixture`, symmetric to `teleportNpcIntoFixture`. At the
   A Shau XZ-origin pose the sweep measured ZERO on-screen billboard cards
   (`foliage n=0`, wave L1) so the foliage row could only fall back to the fixed box
   (terrain-vs-terrain, UNMEASURED). In gate mode it now teleports a deterministic
   cluster of live billboard `instancePosition` entries onto a fixture point along
   the view ray (near the look-at ground distance, offset laterally from the NPC)
   so the cards project clear of the terrain foreground band. Capture-surface
   mutation of the instance buffer only.

## GLB heroes stay scene-lit (documented asymmetry — NOT rebuilt)

This mapping applies ONLY to the three IMPOSTOR / card families (foliage billboards,
static-impostor foliage cards, NPC sprites). Close GLB heroes — trees, vehicles,
combatants at close range — get REAL Three.js scene lighting (PBR against the rig's
directional/hemisphere/ambient lights via `rigSceneLightRadiance`). That is the
intended, load-bearing asymmetry: the impostors have no true geometry / normals, so
they need the artistic grade to TRACK the scene-lit heroes; the heroes are already
tracked because they are lit by the same rig terms through PBR. Rebuilding hero
lighting is an explicit NON-GOAL of this wave. The static-impostor <-> close-GLB
transition should not pop because (a) the wrapped-Lambert unification aligns the
impostor's terminator response with the billboard, and (b) the mapping is a modest
tint/exposure grade layered on top of the same rig terms the hero PBR reads.

## Validation

- `npm run typecheck` (src/): PASS, 0 errors.
- `npm run lint`: PASS (0 errors; 1 pre-existing warning in `ZoneManager.test.ts`).
- `npm run lint:budget`: PASS (0 failures; all touched files < 700 LOC).
- `npm run build`: PASS.
- `npm run test:run` (focused): new L1 `TodImpostorMapping.test.ts` (identity at high
  sun, monotonic dimming, bounded per-family divergence, npc dims harder, kill-switch
  freeze) + L2 `TodImpostorMappingWiring.test.ts` (material construction preserves
  construction-time tuning, shared bindings move with TOD, kill-switch freezes) — 17
  pass. Touched-file suites (LightingRig, AtmosphereSystem, CombatantMeshFactory,
  StaticImpostorSystem, tod-coherence-gate/anchor) — 132 pass.
- `npm run typecheck:scripts`: my `capture-tod-coherence-sweep.ts` additions are
  clean; the 93 remaining errors are PRE-EXISTING on master (other scripts:
  perf-baseline/perf-capture/probe-pixel-forge-npcs/perf-browser-observers) — not
  introduced here.

## Gate re-run (orchestrator, MAIN worktree)

Perf/browser captures cannot run from this Windows worktree (MAX_PATH). The
orchestrator must re-run `npm run check:tod-coherence` from MAIN. Expected effect:
- **npc** family should now come into coherence (corr >= 0.92, rangeRatio in
  [0.6, 1.6]) — the low-sun grade pulls the sprite luminance curve back onto
  terrain's, correcting the corr-0.717 / rangeRatio-3.934 overshoot.
- **foliage** should go from UNMEASURED (n=0) to a real sample count via the fixture
  teleport, and — with the shared card grade — track terrain. If measured foliage
  still fails coherence, report the honest number; do NOT loosen the gate thresholds.
