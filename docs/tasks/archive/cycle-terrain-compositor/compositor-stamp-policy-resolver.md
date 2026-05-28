<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# compositor-stamp-policy-resolver

R2.1 of `cycle-terrain-compositor`. Wires the R1.2 conflict detector into the
R1.1 `TerrainCompositor` and resolves overlaps by the policy fields R1.3
annotated. Closes the airfield random-mountain / padding side of the cycle
(hydrology bed depth stays anchored to airfield datum; airfield envelope
re-samples after lower-priority stamps compose). Design memo:
[docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).

## Files touched

- `src/systems/terrain/compositor/TerrainCompositor.ts` (consume detector + resolver)
- `src/systems/terrain/compositor/TerrainCompositorTypes.ts` (delete `TerrainStampConflict` placeholder; re-export real one)
- `src/systems/terrain/compositor/TerrainStampPolicyResolver.ts` (new — resolver module)
- `src/systems/terrain/compositor/TerrainStampPolicyResolver.test.ts` (new)
- `src/systems/terrain/compositor/TerrainCompositor.test.ts` (extend with resolver scenarios)
- `src/systems/terrain/compositor/TerrainStampConflictDetector.ts` (F1 + F2 fixes — see Scope §3)

## Scope

1. **Wire detector + resolver into `composeTerrain`.** After merge+sort, call
   `detectStampConflicts(sortedStamps)` and feed the result to a new
   `resolveStampPolicies(stamps, conflicts, baseProvider)` that returns the
   final stamps + an updated conflicts array (each annotated with the
   resolution taken). Return both via `TerrainCompositorOutput.conflicts`.
2. **Implement four resolution rules per memo §"Pass order":**
   - `override` — stamp's `fixedTargetHeight` (or computed datum) wins inside
     its envelope; lower-priority overlapping stamps' `obstructionPolicy`
     decides whether they cede target or keep it.
   - `consult` — stamp re-samples its datum against the partial composed
     provider (lower-priority stamps already applied). Wires the
     `sample_at_compose` / `sample_post_compose` `targetHeightStrategy`
     paths from R1.3.
   - `never_above` — clamp resolved target down when an overlapping
     higher-priority stamp sits below. (Motor-pool sitting in a river
     channel → clamp to channel bed, log conflict.)
   - `never_below` — symmetric clamp up.
3. **F1 stale-comment fix.** [TerrainStampConflictDetector.ts:22,47-48](../../src/systems/terrain/compositor/TerrainStampConflictDetector.ts)
   comments claim "90 m grade ramp"; actual `AIRFIELD_ENVELOPE_GRADE_RAMP_M
   = 48` ([TerrainFeatureCompiler.ts:33](../../src/systems/terrain/TerrainFeatureCompiler.ts)).
   Fix comments; only re-tune `ENVELOPE_RAMP_THRESHOLD_METERS` if measured.
4. **F2 AABB reconcile.** Detector inflates non-envelope capsules by
   `outerRadius`; `TerrainStampGridBaker.ts` uses `gradeRadius` everywhere.
   Return BOTH bboxes from `stampAABB` (inner / outer); resolver consults
   outer for `consult` policies, inner for `override`. Keep R1.2 tests green.
5. **Delete the `TerrainStampConflict = Record<string, never>` placeholder**
   in `TerrainCompositorTypes.ts:71` and re-export the real interface from
   `TerrainStampConflictDetector.ts`. No consumer should import the
   placeholder version after this PR.
6. **Tests.** Five resolver tests minimum:
   - `consult` resolves hydrology bed against partial composed provider.
   - `never_above` clamps motor-pool below river bed (synthetic OF case).
   - `override` keeps airfield rect priority over hydrology capsule.
   - `sample_post_compose` airfield envelope re-samples after route stamp
     composes (regression for airfield padding bug).
   - Resolution is deterministic across two identical compose calls.

## Non-goals

- Hydrology recompose (Pass C is R2.2).
- Worker-side parity changes (R2.2 handles when `composedProvider` changes shape).
- Replacing flat O(n²) detector with R-tree (deferred per memo).
- Debug overlay (R2.3 owns).

## Acceptance

- [ ] `composeTerrain` returns non-empty `conflicts` on OF (≥1 hydrology ∩ airfield).
- [ ] Resolver tests pass + extended `TerrainCompositor.test.ts` snapshots updated.
- [ ] OF airfield height inside `innerRadius` is flat (max-min < 0.5 m) vs master.
- [ ] A Shau composed-stamp list byte-identical vs master (regression sentinel).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] `terrain-nav-reviewer` invoked (nice-to-have on R2.1; mandatory on R2.2).

## Round 2 / Dependencies

- Depends on: R1.1 (compositor surface), R1.2 (detector), R1.3 (annotations). All merged.
- Blocks: R2.2 (hydrology feedback needs resolved stamps), R2.3 (overlay reads resolved conflicts).
