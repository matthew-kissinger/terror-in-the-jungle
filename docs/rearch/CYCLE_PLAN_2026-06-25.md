================================================================================
 TERROR IN THE JUNGLE — CYCLE DISPATCH BOARD            generated 2026-06-25
 Asset-redo-first -> r185 upgrade -> render levers, plus standing in-flight work
================================================================================

LEGEND
  [ ] todo   [~] in progress   [x] done   [!] blocked/owner-gated
  (O) owner-driven   (E) executor   (R) reviewer gate   (P) perf-analyst
  dep: <cycle/task it waits on>

RECOMMENDED DISPATCH ORDER
  1. C1 r185-upgrade-land        -> ship now, unblocks measurement on a current engine
  2. C2 war-asset-import-refine  -> GEN DONE; refine loop + import. Cut over FIRST.
  3. C3 dead-asset-purge         -> parallel with C2 (independent cleanup)
  4. C4 vegetation-foundation    -> BUILD parallel w/ C2; cut over SECOND (see DAG)
  5. C5 render-batching-levers   -> AFTER assets are final (measure on real art)
  S.  STANDING TRACKS            -> dropped-frame finish, playtest backlog, hygiene

NORTH STAR
  Redo the asset pack FIRST so perf readings reflect final art, not over-budget
  placeholders. Then bump the engine, then chase the batching/lighting wins on
  cohesive, low-material assets. Kiln consolidates materials at authoring time ->
  BatchedMesh batches at render time -> EXT_mesh_gpu_instancing is the handshake.


================================================================================
 CYCLE 1 — cycle-2026-06-25-r185-upgrade-land     *** DONE 2026-06-25 ***   SIZE: S
================================================================================
OBJECTIVE  Land Three.js r184->r185 to production, green and verified.
RESULT     SHIPPED. PR #408 squash-merged -> master d094801a; deployed; live
           gitSha == origin/master == d094801a; live browser smoke 0 errors.

  [x] T1  Bump three 0.184->0.185, hold @types/three at ^0.184.1            (E)
  [x] T2  Gate set: lint/fence/budget/docs/doc-drift/knip + 6645 tests +
            tod-coherence PASS + scene-parity PASS                         (P/E)
  [x] T3  PR #408 opened, CI green, squash-merged to master                 (E)
  [x] T4  Deploy dispatched + succeeded; live==HEAD verified                (E)
  [x] T5  game-field-kits peer range widened to ^0.184||^0.185 (f24c662)    (E)
            *** WAS A HARD BLOCKER, not optional: CI npm ci is strict-peer;
            three-effect-pool + three-model-optimizer ERESOLVEd vs 0.185.
            Also synced the game lockfile's file-dep peer entries. ***
  [ ] T6  Re-pin @types/three to ^0.185 when DefinitelyTyped publishes it    (E, later)

EXIT  MET. live == HEAD, all CI + pre-deploy gates green, no visual/perf regression.
LESSON  Local `npm install` is lenient on peer deps; CI `npm ci` is strict. A
        three minor bump requires bumping every sibling @game-field-kits peer
        range AND syncing the consumer lockfile's file-dep peer records.


================================================================================
 CYCLE 2 — cycle-2026-06-25-war-asset-import-refine   SIZE: L   dep: none (parallel C1)
            *** GENERATION PHASE DONE 2026-06-25 — now import & refine ***
================================================================================
OBJECTIVE  Take the 99 Kiln-generated palette-snapped war assets through a
           refine/re-roll loop, import through the acceptance standard, cut the
           consumers over, re-baseline perf on final art.
BRIEF      docs/rearch/WAR_ASSET_IMPORT_REFINE_CYCLE_2026-06-25.md (full plan,
           phases, consumer cutover, sequencing vs vegetation in §6).
STATE      99 generated (0 errors), grades 15A/11B/73C, MIGRATED to prod mkvision
           (private gallery). Refine loop LIVE via kiln-studio/scripts/
           rerun-failed-refines.ts (re-runs transient-failed refines as admin).
INPUT      99 reusable sourcePrompts in docs/asset-provenance/repaint-2026-06/.
           Recipe + palette: docs/rearch/ASSET_REGEN_AND_R185_SCAFFOLD_2026-06-25.md

  OWNER + REFINE TRACK (Kiln Studio — done generating; now reviewing)
  [x] T1  "Vietnam War" palette locked; 99 assets generated (0 errors)         (O)
  [x] T2  Migrated to prod mkvision gallery (private) for review               (E)
  [~] T2b Refine loop: rerun failed refines (transient 503s) + owner re-rolls  (O/E)
            tool: kiln-studio/scripts/rerun-failed-refines.ts --since <date> --apply
            owner deliverable: docs/REROLL_REQUESTS.md (over-budget weapons,
            bad wildlife, any hero C-grade worth lifting)

  ENGINEERING TRACK
  [ ] T3  Verify/harden assets:import-war-catalog for the new batch            (E)
            - axis normalize +X->+Z (90) / +X->-Z ground vehicles (9)
            - graft rotor/prop/turret/wheel joints; preserve magazine/muzzle nodes
            - budget triage (PASS/EXCEPTION/REJECT) + regenerate warAssetCatalog.ts
  [ ] T4  Per-class consumer re-verification after import                  (R: combat
            weapons/heli/fixed-wing/ground/world cutovers still resolve)   + terrain-nav)
  [ ] T5  Re-measure combat120 steady-state p99 vs R0 on final art         (P)
  [ ] T6  /gallery visual walk; log rerolls in REROLL_REQUESTS.md          (O)

EXIT  108 assets imported through acceptance standard, grades lifted (C/D/F -> A/B
      via palette snap), gallery + owner visual accept, combat120 re-baselined.
GATES check:fence (no interface change), lint:budget ratchet, the asset-acceptance
      standard (ASSET_ACCEPTANCE_STANDARD), combat-reviewer per weapon consumer.


================================================================================
 CYCLE 3 — cycle-2026-06-25-dead-asset-purge       SIZE: S   dep: none (parallel)
================================================================================
OBJECTIVE  Delete the 80 dead pixel-forge props + PixelForgePropCatalog to clean
           the perf baseline and dead-code surface.

  [ ] T1  Confirm zero live spawn path (grep + knip; catalog has no importer)   (E)
  [ ] T2  Delete public/models/props/pixel-forge/*.glb (80) + PropCatalog.ts +
            its tests + any dead modelPaths entries                            (E)
  [ ] T3  knip:ci + lint:budget + build; record dist-size delta               (E)

EXIT  green gates, dist smaller, no broken refs (check:doc-drift gated set clean).
RISK  LOW. Verify T1 truly dead before deleting (project memory flags it dead).


================================================================================
 CYCLE 4 — cycle-2026-06-25-vegetation-foundation  SIZE: L   dep: spike can start now;
                                                            integration after C2 import
================================================================================
OBJECTIVE  Replace the single-palm flora with a Vietnam jungle set that looks
           right AND instances cheaply (trees + efficient ground cover).
SPEC       src/config/VietnamVegetationSpecies.ts (banyan hero, teak, rubber rows,
           bamboo, banana, palms, elephant grass, fern, mangrove, rice, vines).
PLAN       *** STRATEGY A CHOSEN (2026-06-25, $0, cohesion-first) ***
           docs/rearch/STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md (master plan,
             6 phases, species->source->engine-path map, files touched)
           docs/rearch/strategy-a-source-manifest.md (download + attribution checklist)
           docs/rearch/vegetation-asset-report.html (166-candidate interactive matrix)
           Spine: M02P pack (CC-BY) + EZ-Tree (MIT) + ambientCG CC0 cards + hybrid heroes.
           Re-bake 6 accepted species from M02P = biggest cohesion win. Banyan = only
           hard asset (no free game-ready true banyan; decimate CC0 + author roots).

  SOURCING (CC0 = repo-safe)
  [ ] T1  Acquire Quaternius Ultimate Stylized Nature + ambientCG leaf atlases  (O)
  [ ] T2  EZ-Tree (MIT, dgreenheck) -> generate buttress hardwoods + rubber rows (O/E)
  [ ] T3  CC0 Sketchfab spot models: banana, bamboo thicket, rice (verify each) (O)
  [ ] T4  License manifest (CC0 vs CC-BY attribution; NO CC-BY-NC; Synty=ship-in-build only)

  R&D SPIKE (start immediately — engine-independent)
  [ ] T5  octahedral-impostor + InstancedMesh2 (agargaro, MIT) runtime bake     (E)
            match existing palm imposter; hemi-octahedral; 3-tier LOD
  [ ] T6  Wire species into VegetationScatterer + ForestAggregateLodPlan        (E)
  [ ] T7  Ground cover: alpha-TEST cards (never blend), alphaToCoverage, fog LOD-fade (E)

  GATES
  [ ] T8  Perf: mobile overdraw/fill-rate budget; instanced draw-call count     (P)
  [ ] T9  Visual: A Shau + Open Frontier readability (routes/bases not hidden)   (R: terrain-nav + O)

EXIT  >= core species live with LOD + imposter, perf within budget on mobile,
      owner visual accept. Hard species (dipterocarp/rubber/elephant-grass) faked
      by silhouette via EZ-Tree, not chased botanically.


================================================================================
 CYCLE 5 — cycle-2026-XX-render-batching-levers    SIZE: L   dep: C1 (r185) + C2 (final art)
================================================================================
OBJECTIVE  Adopt the r185 batching + lighting APIs for measured perf wins on the
           now-cohesive, low-material asset set.

  [ ] T1  BatchedMesh-LOD-BVH spike vs current InstancedMesh                    (E/P)
            vegetation first, then combatants (toward the 3,000 vision)
            deps: @three.ez/batched-mesh-extensions + simplify-geometry, three-mesh-bvh
  [ ] T2  ClusteredLighting addon for muzzle/tracer/explosion dynamic lights    (E)
  [ ] T3  CSM (webgpu_shadowmap_csm) for 21km A Shau terrain shadows            (E)
  [ ] T4  EXT_mesh_gpu_instancing post-export step (Kiln won't emit it)         (E)
  [ ] T5  Inspector addon (three/addons/inspector) wired into debug HUD          (E)

EXIT  measured frame-time wins, no regression on combat120 / dropped-frame gates,
      reviewer + perf-analyst sign-off per lever.
NOTE  Each T is independently shippable; dispatch as sub-briefs, not one mega-PR.


================================================================================
 STANDING TRACKS — do not drop while running the cycles above
================================================================================
  [~] S1  STABILIZAT-4 dropped-frame finish line                              (P)
            - rebase task/dropped-frame-paired-evidence (2 commits) onto #407, merge
            - quiet-machine / post-REBOOT Open Frontier + A Shau EARS captures
            - the only open big engineering item; needs real combat-pressure pass
  [!] S2  Owner playtest backlog (~50 rows in PLAYTEST_PENDING.md)            (O)
            SOL-1 lighting accept, KATALOG-1 visual, SVYAZ-3/4 feel, VEKHIKL walks,
            DIZAYN-4 UI, world-systems-runtime walk — engineering done, owner-gated
  [ ] S3  Repo hygiene                                                        (E)
            - local master is 78 behind origin/master -> fast-forward
            - prune ~50 task/* [gone] branches + ~80 worktree-agent-* branches
  [ ] S4  DEFEKT-2 doc-drift backlog (176 broken refs) + lighting-rig flag removal
            (kill-switch removal is several cycles overdue)


================================================================================
 DEPENDENCY GRAPH (text)
================================================================================
  C1 r185 ---------------------------------------+--> C5 render levers
                                                 |
  C2 war-asset (import/refine) --(final art)-----+
        |                                        |
        +--> C4 vegetation (integration) --------+ (authoritative perf here)
  C3 dead-purge  (independent, anytime)
  S1 dropped-frame (independent; rebase first) ; S2 owner (independent)

  C2 (WAR-ASSET) vs C4 (VEGETATION) — SEQUENCING DECISION (2026-06-25):
    SOFT-SEQUENCE: parallel build, sequenced cutover, ONE final perf.
    - BUILD in parallel now (different files, both owner-gated):
        C2 = refine/re-roll loop (Kiln) ; C4 = source M02P + EZ-Tree + bake atlases.
    - CUTOVER war-assets FIRST (most mature: gen done, only import+cutover left)
        -> intermediate perf baseline.
    - CUTOVER vegetation SECOND, on top of finalized war art.
    - ONE authoritative combat120 + A Shau perf capture AFTER veg (the last art).
    SHARED SURFACES to coordinate (additive, low-conflict):
        scripts/import-war-catalog.ts (war GLBs + EZ-Tree tree GLBs)
        src/config/staticImpostorArchetypes.ts (war vehicles/props + veg hero trees)
        the perf baseline (don't double-capture; veg capture is the truth)
    Detail: WAR_ASSET_IMPORT_REFINE_CYCLE_2026-06-25.md §6.

  Critical path to "stable + upgraded + measured on real art":
     C1  ->  C2 build|cutover  ->  C4 build(||)|cutover  ->  perf  ->  C5
  Parallelizable now: C2-refine, C4-sourcing, C4-spike, C3, S1-rebase, S3.
================================================================================
