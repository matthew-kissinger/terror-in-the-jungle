# Campaign: Lighting Rig

> **Date:** 2026-06-09 (scaffolded; not yet started)
> **Shape:** large (5 sequenced cycles: 1 spike + 4 implementation)
> **Auto-advance:** NO past Phase 0 (hard owner GO/NO-GO on the spike); phases
> 1-4 auto-advance with an owner capture review at each barrier
> **Posture:** attended at phase boundaries — lighting quality is partly
> subjective; SOL-1 proved automated channel gates can pass while the result
> looks wrong. The orchestrator engineers; the owner judges captures at every
> exit gate.
> **Concurrency cap:** 5
> **Status:** ALL PHASES COMPLETE 2026-06-10 — campaign engineering CLOSED;
> owner prod acceptance walk pending (row in PLAYTEST_PENDING). Phase 4
> `cycle-2026-06-09-lighting-acceptance` COMPLETE: R1 `tod-coherence-gate`
> #380 (standing `check:tod-coherence` gate — committed tolerances, NPC
> impostor fixture anchored on real pixels 8/8 TODs, deterministic
> median-of-9 anchor) and R2 `legacy-path-deletion` #381 (rig DEFAULT ON,
> legacy paths deleted −405 LOC: shapeDirectLightForRenderer + whole
> AtmosphereLightingColor.ts, terrain night-fill emissive + stabilizer,
> billboard [0.40,0.78] clamp band, NPC scene scan; one-release runtime
> kill-switch `window.__lightingRig.enabled=false` documented). Post-flip
> evidence: gate GREEN (foliage corr 0.953, npc 0.997, dawn 0.050, midnight
> dark); combat120 p99 IMPROVED 38.80→33.60ms (−13.4%, same-machine A/B);
> combat-reviewer APPROVE; terrain-nav REQUEST-CHANGES resolved (vacuous
> emissive assertion → asserts deletion). Phase 3
> `cycle-2026-06-09-exposure-atmosphere-unify` **COMPLETE 2026-06-10** (#379:
> rig fog authority, exposure policy ratified in-shader/once, presets as
> bounded trims; p3-on bands hold — foliage corr 0.989, rangeRatio 0.945; two
> instrument findings handed to Phase 4, see BACKLOG entry). Phases 1-2
> complete earlier (#371 #376 #378 — foliage band met on the fixed
> instrument). Phase 0 `cycle-2026-06-09-lighting-rig-spike` **COMPLETE 2026-06-09**
> (3/3: memo #363, harness #365, prototype #368 terrain-nav
> APPROVE-WITH-NOTES). A/B verdict: clamp bypass CONFIRMED (foliage range
> ratio 0.290→1.564 in-band; midnight foliage finally dark) but foliage corr
> 0.533 vs the ≥0.92 band — structural (terrain still stacks legacy scene
> lights on rig terms; that is Phase 1's scope). **Orchestrator recorded GO
> under the owner's 2026-06-09 `/goal` (complete both campaigns); owner
> review row in PLAYTEST_PENDING — a NO-GO there halts before further
> migration.** Phase 1 re-scoped: `scene-light-unification` is a hard
> co-requisite of `terrain-rig-migration` (same PR set), and the night
> ambient floor needs raising (21h terrain unmeasurable on the rig path).

Source: 2026-06-09 owner playtest verdict on deployed prod (post-SOL-1,
SHA `c2663e9e` line): day/night cycle works, but foliage holds near-constant
lighting while terrain and atmosphere change; terrain at dawn reflects
near-white; overall material lighting "architected with the wrong principles."
A 2026-06-09 architecture exploration confirmed the mechanism.

## The architectural finding (why a rework, not a tune)

There is **no unified lighting rig**. One canonical per-frame state exists
(`AtmosphereLightingSnapshot` built in
`src/systems/environment/AtmosphereSystem.ts`) but it is consumed through four
divergent lighting models:

| Family | Material | Lighting model |
|---|---|---|
| Terrain | `MeshStandardNodeMaterial` (PBR) | Scene lights + night-fill **emissive hack** + terrain-only horizon occlusion (`src/systems/terrain/TerrainMaterial.ts`) |
| Foliage/billboards | `MeshBasicNodeMaterial` (unlit) | Custom hemisphere blend **clamped to [0.40, 0.78]** (`src/systems/world/billboard/BillboardNodeMaterial.ts`) |
| NPC impostors | `MeshBasicNodeMaterial` (unlit) | Own uniforms, sourced by **re-scanning `scene.children`** for light objects — a second authority (`src/systems/combat/CombatantShaders.ts`) |
| GLBs (vehicles, props, close NPCs) | Standard PBR | Scene lights |

- **"Foliage maintains the same lighting"** = the [0.40, 0.78] clamp band:
  midnight foliage cannot get darker than 40%, dawn cannot push past 78%,
  while PBR terrain swings the full range. Divergence at the TOD extremes is
  guaranteed by construction.
- **"Dawn reflects almost white"** = `shapeDirectLightForRenderer`
  (formerly in `AtmosphereLightingColor.ts`, deleted in Phase 4
  `legacy-path-deletion`) compressed the Hosek-Wilkie low-sun color to ~0.78 in
  all channels — converting warm dim dawn light into bright neutral white before
  it hit terrain PBR.
- The pipeline is a stack of per-material compensations (clamps, compression,
  cool tints, emissive night fill) each tuned in isolation by past cycles.
  SOL-1's gates measured sun disc / sky parity / night-red channels — never
  cross-material coherence.

## Target principles (to be ratified by the Phase 0 memo)

1. **One lighting rig, one binding.** A single canonical lighting state (sun
   direction + radiance, sky/ground irradiance, ambient, fog) in consistent
   physically-plausible units, consumed by every material family through one
   shared TSL uniform block. Delete the scene-graph scanning and per-consumer
   color shaping.
2. **Same diffuse model everywhere.** Foliage and NPC impostors move to a
   wrapped-Lambert against the *same* sun/sky terms terrain uses. Clamps
   become artistic trims, not the primary mechanism.
3. **Energy handled once, at exposure.** Low-sun intensity falls off in the
   rig; AGX + one global (possibly TOD-aware) exposure handles brightness. No
   mid-pipeline compression toward neutral.
4. **A coherence gate that would have caught this:** a TOD-sweep capture
   harness asserting the material families' relative luminance tracks
   together across the day. It becomes the acceptance instrument for every
   phase and a scripted gate at campaign close.

## Campaign hard-stops (halt + surface to owner)

- Any `fence_change: yes` in an executor report.
- >2 CI-red tasks in one round.
- `combat120` p99 regression >5% after any round (terrain/billboard shaders
  are render hot path).
- Worktree-isolation failure.
- Phase 0 NO-GO from the owner (by design — the whole point of the spike).
- A phase's TOD-coherence capture regresses a previously-passing family.

## Phase 0 — `cycle-2026-06-09-lighting-rig-spike`

**Why first:** the owner asked to "analyze and consider heavily changing or
completely reworking" — analysis and an A/B before commitment. The spike is
cheap, high-information, and produces the measurement instrument the rest of
the campaign is judged with.

**Task DAG:**

```
tod-capture-harness   (root) ──► rig-prototype (A/B uses the harness output)
lighting-audit-memo   (root)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| tod-capture-harness | Scripted time-of-day sweep: fixed camera framing terrain + foliage + NPC impostor + a GLB prop together; capture at ~8 TODs (midnight/pre-dawn/dawn/morning/noon/dusk/night); compute per-family relative-luminance curves; write captures + a curves JSON to artifacts/. Reuses the diagnostic time-control surface. | new script under `scripts/`, `src/systems/environment/AtmosphereSystem.ts` (TOD set hook, read-only if possible) | — | M |
| lighting-audit-memo | Design memo under `docs/rearch/`: full inventory of `AtmosphereLightingSnapshot` consumers + every clamp/compression/emissive hack with file refs; ratify the target principles above into a concrete rig spec (state fields, units, TSL binding API, exposure policy); migration order; deletion list. | docs only | — | M |
| rig-prototype | Behind a runtime flag (default OFF): prototype the unified binding on terrain + one billboard family — uncompressed sun/sky radiance from the Hosek model, wrapped-Lambert on the billboard, single exposure. A/B toggle key in the diagnostic surface; run the TOD sweep both ways. | `src/systems/environment/AtmosphereSystem.ts`, `src/systems/terrain/TerrainMaterial.ts`, `src/systems/world/billboard/BillboardNodeMaterial.ts` (flag-gated branches) | — | L |

**Exit gate (HARD OWNER GATE — campaign halts here unconditionally):** owner
reads the memo and views the A/B TOD-sweep captures, then issues GO / NO-GO /
GO-with-changes. No Phase 1 dispatch without an explicit GO.

## Phase 1 — `cycle-2026-06-09-lighting-rig-core`

**Why second:** the rig must exist before any family migrates. Terrain
migrates first because it is the reference family the others are judged
against, and it owns the worst single defect (dawn white-out).

**Task DAG:**

```
lighting-rig-state ──► terrain-rig-migration
                  └──► scene-light-unification
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| lighting-rig-state | Implement the canonical rig per the ratified memo: derived once per frame in AtmosphereSystem from the Hosek model (sun direction + radiance, sky/ground irradiance, ambient, fog), exposed as one shared TSL uniform block. Retire `shapeDirectLightForRenderer` compression (kept callable until Phase 4 deletion; rig path does not use it). | `src/systems/environment/AtmosphereSystem.ts`, `AtmosphereLightingColor.ts` (since deleted in Phase 4 `legacy-path-deletion`), new rig module under `src/systems/environment/` | — | L |
| terrain-rig-migration | TerrainMaterial consumes the rig block; replace the night-fill emissive hack with the rig's ambient/moon term; horizon occlusion re-driven from rig sun elevation (keep the effect, kill the bespoke inputs). | `src/systems/terrain/TerrainMaterial.ts`, `src/core/SystemUpdater.ts` (wiring) | terrain-nav (TerrainMaterial is terrain path) | M |
| scene-light-unification | The scene lights AtmosphereSystem maintains in applyToRenderer (directional/ambient/hemisphere feeding GLB PBR materials) are driven from the same rig values — GLBs and terrain track the same curve. | `src/systems/environment/AtmosphereSystem.ts` | — | S |

**Exit gate:** TOD sweep shows terrain + GLB families on the same
luminance-vs-sun-elevation curve; the dawn capture has no white-out; combat120
p99 flat (±5%); owner capture review.

## Phase 2 — `cycle-2026-06-09-foliage-npc-lighting`

**Why third:** the owner's headline symptom. Migrating foliage/NPCs onto the
rig only makes sense once terrain (the reference) is rig-lit.

**Task DAG:** all roots; billboard and NPC tasks touch disjoint shader files.

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| billboard-rig-migration | BillboardNodeMaterial drops the fixed hemisphere blend + [0.40, 0.78] clamps as the lighting mechanism; wrapped-Lambert against the rig's sun/sky terms; clamps/exposure constants demoted to artistic trims with documented defaults. | `src/systems/world/billboard/BillboardNodeMaterial.ts`, `src/core/SystemUpdater.ts` (wiring) | — | L |
| npc-impostor-rig-migration | CombatantShaders consume the rig block directly; delete `resolveNpcAtmosphereSnapshot` scene-children scanning (the second authority). NPC impostors must match billboard foliage response. | `src/systems/combat/CombatantShaders.ts` | combat | M |
| effects-prop-pass | Sweep remaining lit surfaces (tracers/impact/explosion ambient response, water-era leftovers, any UI-world meshes) for rig consumption or explicit unlit declaration — no orphan consumers of the old snapshot fields. | grep-driven sweep across `src/systems/` | — | S |

**Exit gate:** TOD sweep shows foliage + NPC curves tracking terrain within
the memo's coherence band; midnight foliage is actually dark; dawn foliage
warms with terrain; combat120 p99 flat; owner capture review.

## Phase 3 — `cycle-2026-06-09-exposure-atmosphere-unify`

**Why fourth:** exposure and fog policy can only be set once all families are
on the rig — tuning exposure against a half-migrated scene re-introduces
per-family compensation.

**Task DAG:**

```
tod-exposure ──► preset-retune
fog-sky-coherence (root)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| tod-exposure | One global TOD-aware exposure policy (AGX retained); remove remaining per-material brightness compensation; night floor handled here, not via emissive or clamp floors. | `src/systems/environment/AtmosphereSystem.ts`, renderer exposure wiring | — | M |
| fog-sky-coherence | Fog color/density derived from the rig; horizon fog matches the Hosek sky at all TODs (no fog-line seam at dawn/dusk). | `src/systems/environment/AtmosphereSystem.ts`, fog consumers | — | M |
| preset-retune | ScenarioAtmospherePresets re-expressed as trims over the physical baseline (not absolute color stacks); every preset re-captured across the TOD sweep. | `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` | — | M |

**Exit gate:** full-day flythrough capture per scenario preset reviewed by
owner; no preset shows a family breaking coherence.

## Phase 4 — `cycle-2026-06-09-lighting-acceptance`

**Why last:** lock the win. The harness becomes a standing gate; the legacy
path dies; prod ships.

**Task DAG:** all roots.

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| tod-coherence-gate | The capture harness becomes a scripted check (npm script, wired into CI or the pre-deploy checklist — decide explicitly, mirroring the Phase-1-2026-06-09 gate-consolidation pattern) asserting cross-family luminance coherence at key TODs against committed tolerances. | harness script, `.github/workflows/ci.yml` or deploy checklist | — | M |
| legacy-path-deletion | Flag flips default-ON; delete the old paths: `shapeDirectLightForRenderer` compression, billboard fixed-blend clamps-as-mechanism, NPC scene scanning, terrain night-fill emissive. Knip + grep prove no stragglers. | files named in earlier phases | — | M (deletion) |
| lighting-ship | Deploy + `check:live-release`; owner acceptance sweep on prod (the original complaint, re-walked: dawn terrain, midnight foliage, full cycle watch). | deploy workflow | — | S |

**Exit gate:** coherence gate green; deploy verified; **owner accepts on prod**
— this campaign closes on the owner's eyes, not on metrics.

## When a phase opens (per `AGENT_ORCHESTRATION.md`)

Phase 1-4 briefs are authored at each phase's open, NOT up front — Phase 0's
memo is expected to reshape them (task splits, the rig module's real name and
location, coherence-band numbers). At each open: write briefs in
`docs/tasks/`, populate the DAG in `AGENT_ORCHESTRATION.md` "Current cycle",
re-run `npx tsx scripts/cycle-validate.ts <slug>`. All five cycle IDs
pre-validated 2026-06-09 against the stoplist.

## Fence watch

None of the named files exports through `src/types/SystemInterfaces.ts`, but
renderer exposure wiring (Phase 3 `tod-exposure`) may brush `IGameRenderer`.
If any task needs a fenced-interface change, that is an `[interface-change]`
PR + the fence hard-stop fires by design.

## Non-goals

- Water/hydrology rework (still deferred per the 2026-06-09 scorch; the rig
  must not grow water-specific terms speculatively).
- New weather types or sky phenomena.
- WebGPU→WebGL fallback work beyond keeping the current support level.
- Per-craft HUD/reticle work — that is the separate
  [CAMPAIGN_2026-06-09-craft-specialization.md](CAMPAIGN_2026-06-09-craft-specialization.md).
