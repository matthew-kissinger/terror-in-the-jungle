# repaint-acceptance-close

Cycle closer for `cycle-2026-06-11-war-asset-repaint`: assemble the
acceptance-standard evidence package, finalize re-roll requests, update the
living docs, and ship. Runs after all R2/R3 merges. The orchestrator may run
this inline (main session) rather than as a worktree executor — it spans docs
+ captures + deploy.

## Files touched

- `docs/ASSET_ACCEPTANCE_STANDARD.md` (add the per-class on-disk convention
  table from the audit memo; point the GLB policy at
  `assets:import-war-catalog` as the general path)
- `docs/ASSET_MANIFEST.md` (regenerate counts/status from the catalog)
- `docs/asset-provenance/repaint-2026-06/REROLL_REQUESTS.md` (finalize with
  gallery findings + owner-flagged items)
- `docs/PLAYTEST_PENDING.md`, `docs/DIRECTIVES.md` (KATALOG-1 row →
  code-complete), `docs/BACKLOG.md` (cycle close section + deferred items)
- `docs/AGENT_ORCHESTRATION.md` (reset Current cycle), brief archival to
  `docs/tasks/archive/cycle-2026-06-11-war-asset-repaint/`

## Scope

1. Evidence: full `check:asset-gallery` screenshot set; per-mode worldgen
   shots (from world task); `evidence:atmosphere` all-mode pass;
   `check:tod-coherence` (standing pre-deploy gate); one aggregated budget
   EXCEPTION note per the acceptance standard (scene attribution + renderer
   stats from the world task's firebase delta).
2. Perf: combat120 + openfrontier:short + ashau:short captures vs the R0
   pre-cycle captures. Hard gate: combat120 p99 within +5% of pre-cycle.
   OF/A Shau deltas reported (no tracked baseline exists — raw comparison).
3. PLAYTEST_PENDING rows: (a) weapons-in-hand + NPC + M2 walk; (b) helicopter
   + fixed-wing feel walks (rotor/prop read, scale, mounts); (c) world walk
   (villages/firebases/new buildings/parked armor, command-tent + aid-station
   orientation); (d) wildlife encounter; (e) arclight call-in. Reference the
   gallery as the owner's re-roll review surface.
4. Deferred follow-ups appended to BACKLOG strategic reserve: new-weapon
   loadout variants (m14/sks/dragunov/rpd), melee (kbar), deployable claymore,
   enemy armor AI (t54), transport/role aircraft (c130/ch47/oh6/ov10/hh3e),
   enemy air (mig17), boats-on-water (post water rework), bird/reptile
   wildlife tier 2, re-roll re-import round.
5. Ship: `npm run deploy:prod` + `npm run check:live-release` (live SHA ==
   HEAD, smoke clean). Run `npx tsx scripts/cycle-validate.ts
   cycle-2026-06-11-war-asset-repaint --close` and the end-of-cycle ritual.

## Non-goals

- No new code. No re-roll imports (next cycle, same importer). No closing
  KATALOG-1 fully (owner walks gate that).

## Acceptance

- [ ] Evidence package complete per the acceptance standard's required list
      (registry paths, mode coverage, screenshots, perf, trust statement).
- [ ] combat120 p99 delta ≤ +5% vs R0 capture (else halt per hard-stops; do
      not deploy a regression).
- [ ] `check:live-release` all gates PASS post-deploy.
- [ ] CARRY_OVERS active count did not grow (cycle-validate --close green).
- [ ] End-of-cycle ritual done (briefs archived, BACKLOG appended, Current
      cycle reset, `docs: close cycle-2026-06-11-war-asset-repaint` commit).

## Round 2 / Dependencies

- Depends on: all R2 + surviving R3 tasks.
