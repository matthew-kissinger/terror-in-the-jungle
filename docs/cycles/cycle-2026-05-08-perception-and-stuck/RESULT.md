# RESULT — cycle-2026-05-08-perception-and-stuck

Closed 2026-05-08. Four-task parallel cycle addressing four user-reported gameplay regressions: distant NPC clusters appearing frozen, the PixelForge imposter switch landing too close, the A Shau Zone Control zone closest to NVA HQ landing in a ditch, and white CDLOD seams at chunk boundaries (worst on A Shau real DEM). All four task branches were dispatched to executor subagents in parallel worktrees and integrated into a cycle branch with one merge-conflict resolution (`tuneCombat.ts`, additive-only). Single PR (#165) merged to master via `--merge` fallback (the cycle branch contained internal merge commits, so rebase-merge was blocked). Live deploy verified at SHA `e34cc6d`.

## End-of-run summary

```
Cycle: cycle-2026-05-08-perception-and-stuck
Dates: 2026-05-08 → 2026-05-08 (single session)
Branch path: cycle-2026-05-08-perception-and-stuck → master
Final master HEAD: e34cc6d
Live deploy SHA: e34cc6d   Live URL: https://terror-in-the-jungle.pages.dev

Round 1: 4/4 task branches landed via parallel executor subagents.
Round 2: Cycle integration branch (5 commits, 1 conflict resolved).
Round 3: PR #165 → CI green (lint, test, build, smoke, perf, mobile-ui).
Round 4: combat-reviewer + terrain-nav-reviewer both APPROVE-WITH-NOTES.
Round 5: --merge to master, deploy.yml dispatched, live SHA verified.
Round 6: this commit (cycle close).

Task branches:
  task/zone-validate-nudge-ashau              (Issue C, +268/-29, 6 files, 7 new tests)
  task/terrain-cdlod-seam                     (Issue D, +365/-18, 12 files; D1 + D2 + overlay)
  task/npc-unfreeze-and-stuck                 (Issue A, +460/-67, 10 files)
  task/npc-imposter-distance-priority         (Issue B, +520/-19, 5 files)

Single integration PR:
  #165  cycle-2026-05-08-perception-and-stuck: NPC unfreeze, imposter range, ZC ditch, terrain seams
        37 files, +2223 / -140 (incl. 4 task briefs). Merged at e34cc6d.

Reviewer findings (non-blocking):
  combat-reviewer:
    - Position-Y drift on slopes during visual-only velocity integration
      (gated by NpcLodConfig.visualOnlyIntegrateVelocity; document or
      sync_terrain_height in next cycle).
    - RespawnManager sets isRejoiningSquad=true directly instead of using
      the new beginRejoiningSquad helper. Inconsistency, not blocking.
    - culledDistantSimIntervalMs default 8000 (was 45000) — 5.6× more
      frequent. Gated by AI budget; passed CI perf check at 5m47s.
  terrain-nav-reviewer:
    - terrainSeamOverlay loop is O(N²) over active tiles, bounded by
      MAX_SEGMENTS=4096 + 4 Hz cadence + dev-only. Fine for now.
    - findSuitableZonePosition still uses Math.random for its spiral
      search (pre-existing). Determinism follow-up.

CI gates:
  lint:      PASS (38s)
  test:      PASS (1m5s, 4153 tests, 268 files, no type errors)
  build:     PASS (39s)
  smoke:     PASS (1m8s)
  perf:      PASS (5m47s) — combat120 within baseline tolerance
  mobile-ui: PASS (16m42s)
  deploy:    PASS (~52s) — live manifest sha=e34cc6d at 21:36:08Z

Verification (live):
  HTTP/1.1 200 OK at https://terror-in-the-jungle.pages.dev/
  /asset-manifest.json gitSha = e34cc6d (matches master HEAD)
  /build-assets/index-BOZ-k3aw.js → 200 OK
```

## Tunables landed (Tweakpane `\` Combat folder)

LOD watchdog (top of folder):
- `combat.lod.visualOnlyIntegrateVelocity` (boolean, default true)
- `combat.lod.rejoinTimeoutMs` (number, default 5000)
- `combat.lod.squadFollowStaleMs` (number, default 4000)
- `combat.lod.culledDistantSimIntervalMs` (number, default 8000 — was hardcoded 45000)

PixelForge subfolder:
- `combat.pixelForge.closeModelDistanceMeters` (number, default 120 — was hardcoded 64)
- `combat.pixelForge.onScreenWeight` (number, default 10)
- `combat.pixelForge.squadWeight` (number, default 4)
- `combat.pixelForge.recentlyVisibleMs` (number, default 800)

New diagnostic overlay (Shift+\ → Y): `terrainSeamOverlay` highlights at-risk CDLOD edges in red.

## Carry-overs (intentionally deferred)

- **Stage D3 — DEM edge padding.** Gated on Stage D1+D2 visual capture review at A Shau north ridgeline. If white seams remain after this lands, file `terrain-dem-edge-pad`.
- **Position-Y drift in visual-only path.** Reviewer note. Either call `syncTerrainHeight` after the integration step, or document the drift bound. Easy follow-up.
- **`RespawnManager` to use `beginRejoiningSquad` helper.** Reviewer note. Consistency cleanup.
- **`findSuitableZonePosition` determinism.** Pre-existing `Math.random` in spiral search; out of cycle scope but flagged.
- **Cover-search synchronous p99 anchor** (`AIStateEngage.initiateSquadSuppression`). Combat AI p99 still ~34 ms, anchored here.
- **NPC slope-stuck / navmesh crowd disabled / terrain-aware solver stall loops.** Carry-over from prior cycles.
- **Helicopter parity audit.** AVIATSIYA-3 through AVIATSIYA-7 still on backlog.

## Playtest checkpoints (still owed by human)

- A Shau Zone Control flyover at 200 m AGL: confirm distant NPC clusters at 200-600 m visibly drift (Layer 1 + velocity-keyed billboards).
- Stuck-leader squad: spawn / observe a squad whose leader is geometrically stuck for 10 s; confirm followers dissolve and re-target within ~5 s.
- `zone_tiger`: confirm the zone center is now on a flatter cell and OPFOR NPCs reach it without bunching. Check engine boot logs for the `Zone placed at ...` line for `zone_tiger`.
- A Shau north ridgeline + multiple altitudes: confirm white seams gone. Toggle Shift+\ → Y to overlay-confirm zero or near-zero red edges.
- Open Frontier flyover and stuck-squad checks: should be unchanged or improved.
- Tweakpane sanity: with `\` open, toggle `visualOnlyIntegrateVelocity` and `closeModelDistanceMeters`; verify both visibly change behavior without restart.

## Hotfix on top of this cycle (2026-05-08)

Stage D2 (`createTileGeometry` in `src/systems/terrain/CDLODRenderer.ts`) shipped with one extra negation on the per-vertex Z coordinate (`z = 0.5 - j/(N-1)` instead of the rotated `PlaneGeometry`'s `z = j/(N-1) - 0.5`). With the index ordering unchanged, every interior triangle's normal flipped from +Y to -Y. `MeshStandardMaterial` defaults to `side: THREE.FrontSide`, so backface culling hid most of the terrain when viewed from above — visibly across all maps (Open Frontier, A Shau, Team Deathmatch). The reviewer-noted "visual review of D1+D2" gate was not closed before merge; CI mocks Three.js entirely, so geometry winding regressions are invisible to `npm run test:run`.

Fix: drop the leading negation at `CDLODRenderer.ts:25`. Anti-seam mechanisms (Stage D1 AABB-distance morph, Stage D2 skirt ring + per-LOD vertex drop, Shift+\ → Y diagnostic overlay) all survive unchanged — the Z-flip was an unrelated transcription error inside the geometry rebuild, not part of the seam protection.

Regression test: `CDLODRenderer.test.ts` now asserts `triangleNormal.y > 0` on the first interior face, so a future winding flip cannot slip through CI again.
