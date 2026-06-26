<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- War-asset import & refine cycle brief. Authored 2026-06-25. Sibling of the vegetation cycle (STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md). -->

# War-Asset Import & Refine — Cycle Brief

**Cycle id:** `cycle-2026-06-25-war-asset-import-refine` (the engineering + refine half of the old C2 asset-pack-regen; the *generation* half is DONE).

**Goal:** take the 99 Kiln-generated, palette-snapped war assets — already reviewed in the prod gallery — through a refine/re-roll loop, then import them into the game through the acceptance standard and cut the per-class consumers over, so the engine runs on the final cohesive art.

**Sibling cycle:** vegetation/ground-cover (`STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md`). Sequencing between the two is in §6 + the board.

---

## 1. Current state (what's already done)

- **99 assets generated** in Kiln under the locked "Vietnam War" palette (5 packs: 15 weapons, 24 structures, 20 buildings, 28 vehicles, 12 wildlife/props). 0 generation errors.
- **Grades: 15×A / 11×B / 73×C.** C dominates because multi-material rigs legitimately use 4–6 palette slots; the win is the *shared* palette, not the letter. A handful of weapons are over the 1,500-tri budget.
- **Migrated to prod** under mkvision (`742854f8-…`), private, viewable in your gallery (undo manifest `kiln-studio/tmp/migration-*.json`).
- **Refine loop is live:** owner reviewing in-gallery; failed refines (transient Gemini 503s) re-run via `kiln-studio/scripts/rerun-failed-refines.ts` (auths as admin → `POST /api/refine` with original parent+instruction → 503 retry/backoff → polls to ok/failed; results owned by mkvision automatically).

So the remaining work is **refine → re-roll → import → cutover → perf**, not generation.

---

## 2. The refine / re-roll loop (Kiln side, owner-driven + tooled)

Two mechanisms, both landing in the prod gallery owned by mkvision:

1. **Targeted refine** (an existing asset has a specific defect) — owner writes an instruction in-gallery (e.g. *"guns should point sideways out the doors"*). If it dies on a transient provider error, re-run with:
   ```bash
   cd kiln-studio && set -a && . ~/.config/mk-agent/env && set +a \
     && AWS_PROFILE=mkclouds bun run scripts/rerun-failed-refines.ts --since <YYYY-MM-DD> --apply
   ```
   (Discovers failed `kind:refine` records for mkvision and re-issues each.)

2. **Re-roll** (the whole asset is wrong / over budget) — regenerate from the source prompt. Re-roll candidates:
   - **Over-budget weapons** (a couple >1,500 tris) — re-roll with the low-poly nudge.
   - **C-grade outliers** worth lifting — optional; C is acceptable, only re-roll if a hero asset reads poorly.
   - **Wildlife** (organic — Kiln's weakest class) — review hardest; consider sourcing instead if any read badly.

**Owner deliverable:** a re-roll list (which asset slugs to regenerate/refine). Log it in `docs/REROLL_REQUESTS.md`. Everything else passes as-is.

---

## 3. Import into the game (engineering)

The importer already exists: `npm run assets:import-war-catalog` (`scripts/import-war-catalog.ts`). It owns ALL normalization:
- **Axis normalize** — +X→+Z (90°) for most; +X→−Z for ground vehicles.
- **Joint grafting** — rotor/prop/turret/wheel pivots; preserve magazine/muzzle/attach nodes.
- **Vertex-storage canonicalization** — uniform indexing + tightly-packed attributes (required for `mergeGeometries` in r184/r185).
- **Budget triage** — PASS / EXCEPTION / REJECT per `ASSET_ACCEPTANCE_STANDARD.md`; regenerates `src/config/generated/warAssetCatalog.ts`.

Steps:
1. **Export the accepted/refined GLBs** from the prod gallery (per-asset `downloadUrl`) into the importer's input dir, replacing the prior batch.
2. **Run the importer**; resolve any new REJECT/EXCEPTION (re-roll or accept with an acceptance note).
3. **Regenerate `warAssetCatalog.ts`** + provenance under `docs/asset-provenance/`.

---

## 4. Consumer cutover + verification

The catalog feeds five consumer families. After import, re-verify each resolves and renders:
- **weapons** (viewmodel + NPC) — `combat-reviewer` gate; magazine/muzzle nodes intact, ≤1,500 tris.
- **helicopters / fixed-wing** — rotor/prop joints animate; static-impostor archetypes for distant.
- **ground vehicles** — turret/wheel joints; −Z forward; `staticImpostorArchetypes.ts` bounds.
- **structures / buildings** — placement footprint, ≤2,500 tris, ≤4 draw buckets; static-impostor for the registered ones.
- **wildlife / props** — spawn paths, `WorldFeatureSystem`.

Gate: `check:fence` (no interface change), `check:asset-material`, `check:asset-gallery`, `check:static-impostors`, `lint:budget` ratchet, combat-reviewer per weapon consumer, terrain-nav reviewer on placement.

---

## 5. Perf re-baseline

Re-measure **combat120 steady-state p99** vs the pre-cycle baseline on the final art (run-wide peak p99 is warmup-pinnable — gate on steady-state). The asset cohesion (one palette, lower material counts) should hold or improve draw-bucket counts. This is the **intermediate** baseline; the authoritative "final art" capture happens after vegetation lands (see §6).

---

## 6. Sequencing vs the vegetation cycle — RECOMMENDATION

**Soft-sequence: parallel build, sequenced cutover, one final perf.**

Why not fully parallel: the two cycles converge on three shared surfaces —
- `scripts/import-war-catalog.ts` (war GLBs *and* EZ-Tree tree GLBs both flow through it),
- `src/config/staticImpostorArchetypes.ts` (war vehicles/props *and* veg hero trees both register here),
- the **perf baseline** (two final-art captures collide; the second invalidates the first).

Why not fully sequential: the *build* phases don't contend at all and are both owner-gated, so blocking one on the other wastes calendar time.

**The plan:**
| Phase | War-asset cycle | Vegetation cycle | Run |
|---|---|---|---|
| Build | refine/re-roll loop (owner + Kiln) | source M02P, run EZ-Tree, bake atlases, author banyan | **parallel** — different files, both owner-gated |
| Cutover | import → consumer cutover → intermediate perf | (waits) | **war first** — it's nearly done (gen complete) |
| Cutover | (done) | atlas/GLB register → scatter → flip sourceStatus | **veg second** — lands on finalized war art |
| Perf | (intermediate) | **authoritative** combat120 + A Shau capture | **once, after veg** (the last art) |

Rationale: the war-asset cycle is the most mature (assets generated + migrated; only refine+import remain), so it lands first and gives a clean intermediate baseline. Vegetation is bigger and riskier (banyan authoring, M02P atlas-merge) — it benefits from landing on top of finalized war art, and its perf capture becomes the single "final art" truth per the board's North Star ("redo assets FIRST so perf reflects final art").

**Shared-surface guard:** war owns vehicle/prop/structure slugs in `staticImpostorArchetypes.ts`; veg owns tree slugs. Additive, low conflict — coordinate the two PRs that touch it, don't let them diverge.

---

## 7. Phased tasks

**Phase 0 — Refine/re-roll (owner + tooled, parallel with veg build)**
- Owner review pass in gallery; produce `docs/REROLL_REQUESTS.md`.
- Re-run failed refines (`rerun-failed-refines.ts`); re-roll over-budget weapons + any bad wildlife.
- Gate: owner accept; all targeted assets `status:ok` in prod.

**Phase 1 — Export + import**
- Export accepted GLBs; run `assets:import-war-catalog`; resolve REJECT/EXCEPTION; regenerate `warAssetCatalog.ts`.
- Gate: importer green, `check:asset-material`, `check:asset-gallery`.

**Phase 2 — Consumer cutover**
- Re-verify all five consumer families; update `staticImpostorArchetypes.ts` bounds for changed vehicles/props; re-bake static impostors for changed slugs.
- Gate: `check:fence`, `check:static-impostors`, `lint:budget`, combat-reviewer + terrain-nav reviewer.

**Phase 3 — Intermediate perf**
- combat120 steady-state p99 vs pre-cycle baseline; scene-attribution draw-bucket delta.
- Gate: within budget; perf-analyst sign-off. (Authoritative capture deferred to post-vegetation.)

---

## 8. Definition of done

- All 99 (minus any sourced-instead) imported through the acceptance standard, refines/re-rolls accepted by owner.
- Five consumer families resolve + render; joints/nodes intact; budgets met.
- Static-impostor archetypes current for all changed vehicles/props.
- combat120 steady-state re-baselined; no regression.
- `warAssetCatalog.ts` + provenance regenerated; gallery + owner visual accept.
- Coordinated cleanly with the vegetation cycle on the three shared surfaces.
