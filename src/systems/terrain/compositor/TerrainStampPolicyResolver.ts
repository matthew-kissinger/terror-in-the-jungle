// R2.1 of cycle-terrain-compositor (memo:
// docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md §"Pass order").
//
// Resolves overlapping-stamp height fights using the policy annotations the
// R1.3 compilers attach to each stamp:
//   - `targetHeightStrategy`: how a stamp computes its datum
//     (`baked` / `sample_at_compose` / `sample_post_compose`).
//   - `obstructionPolicy`: how a stamp's datum reacts when an overlapping
//     stamp (typically higher priority) wants to win the height fight
//     (`override` / `consult` / `never_above` / `never_below`).
//
// Pipeline:
//   1. Walk stamps in ascending priority (the canonical compose order).
//      Lower-priority stamps compose first, higher-priority overrides them
//      inside their footprint - that's the existing `StampedHeightProvider`
//      semantic. The resolver only changes the `fixedTargetHeight` on each
//      stamp, then hands the updated list back to the compositor.
//   2. For `sample_at_compose`: build a "lower-context" provider including
//      everything strictly lower-priority than this stamp, sample the
//      stamp's datum from it.
//   3. For `sample_post_compose`: build an "everything-else" provider that
//      includes every other stamp (using their already-resolved targets when
//      available) and sample the stamp's datum from it. Used by the airfield
//      envelope so its datum reflects the rect stamps + adjacent hydrology
//      cuts - the airfield padding-bug fix.
//   4. For `never_above` / `never_below`: after the target is computed,
//      clamp it against the resolved targets of overlapping conflicting
//      stamps.
//
// The resolver never mutates the input array. It returns:
//   - `stamps`: new array of stamps with `fixedTargetHeight` updated where
//     the strategy/policy demanded.
//   - `conflicts`: the input conflicts with each entry annotated with a
//     `resolution` field describing what the resolver did.

import { StampedHeightProvider, resolveTerrainStamps } from '../StampedHeightProvider';
import type { IHeightProvider } from '../IHeightProvider';
import type {
  ResolvedFlattenCapsuleTerrainStamp,
  ResolvedFlattenCircleTerrainStamp,
  TerrainStampConfig,
} from '../TerrainFeatureTypes';
import type { TerrainStampConflict } from './TerrainStampConflictDetector';
import { stampAABBs, aabbsOverlap, type TerrainStampAABBs } from './TerrainStampConflictDetector';

export type TerrainStampPolicyResolutionKind =
  | 'unchanged'
  | 'overridden'
  | 'resampled'
  | 'clamped';

export interface TerrainStampPolicyResolution extends TerrainStampConflict {
  /** What the resolver did about this conflict. */
  resolution: TerrainStampPolicyResolutionKind;
  /** Stamp index whose target was rewritten (if any). */
  rewroteStamp?: number;
  /** Previous target value (for diff inspection / overlay). */
  previousTarget?: number;
  /** New target value after the resolver applied. */
  newTarget?: number;
}

export interface TerrainStampPolicyResolverOptions {
  /**
   * Reserved for downstream warn-level logging of configuration-error
   * conflicts (e.g. `never_above` motor-pool fully inside a higher river bed
   * AABB). The resolver itself behaves identically regardless of strict mode.
   */
  strict?: boolean;
}

export interface TerrainStampPolicyResolverInput {
  baseProvider: IHeightProvider;
  /** Sorted ascending by priority - the compositor's canonical order. */
  stamps: TerrainStampConfig[];
  /** Output of `detectStampConflicts(stamps)` from the same sorted list. */
  conflicts: TerrainStampConflict[];
  options?: TerrainStampPolicyResolverOptions;
}

export interface TerrainStampPolicyResolverOutput {
  stamps: TerrainStampConfig[];
  resolutions: TerrainStampPolicyResolution[];
}

/**
 * Returns the canonical baked target for a stamp - sampled from the supplied
 * provider when the stamp has no `fixedTargetHeight`, otherwise the baked
 * value. Mirrors `StampedHeightProvider.resolveTerrainStamps` but operates on
 * an arbitrary provider so the resolver can target either the base provider
 * (for `sample_at_compose`) or a partial composed provider (for
 * `sample_post_compose`).
 */
function sampleTargetForStamp(
  stamp: TerrainStampConfig,
  provider: IHeightProvider,
): number {
  const resolved = resolveTerrainStamps(provider, [{ ...stamp, fixedTargetHeight: undefined }]);
  const entry = resolved[0] as
    | ResolvedFlattenCircleTerrainStamp
    | ResolvedFlattenCapsuleTerrainStamp;
  return entry.targetHeight;
}

/**
 * The current effective target height for a stamp - `fixedTargetHeight` when
 * present, otherwise sampled from the base provider. Used when clamping
 * `never_above` / `never_below` against an overlapping stamp without forcing
 * a full provider rebuild.
 */
function effectiveTarget(stamp: TerrainStampConfig, baseProvider: IHeightProvider): number {
  if (typeof stamp.fixedTargetHeight === 'number' && Number.isFinite(stamp.fixedTargetHeight)) {
    return stamp.fixedTargetHeight;
  }
  return sampleTargetForStamp(stamp, baseProvider);
}

/**
 * Build a `StampedHeightProvider` view that includes a subset of stamps.
 * Used to sample the partial composed terrain for `sample_at_compose` and
 * `sample_post_compose`. When `subset` is empty, returns the base provider
 * directly so the StampedHeightProvider construction cost is avoided.
 */
function makePartialProvider(
  baseProvider: IHeightProvider,
  subset: TerrainStampConfig[],
): IHeightProvider {
  if (subset.length === 0) return baseProvider;
  return new StampedHeightProvider(baseProvider, subset);
}

/**
 * AABB overlap test using the outer (grade-radius) extent - matches the
 * conflict detector and the baker's footprint.
 */
function stampsAABBOverlap(a: TerrainStampAABBs, b: TerrainStampAABBs): boolean {
  return aabbsOverlap(a.outer, b.outer) !== null;
}

/**
 * Resolve target heights + policies across the stamp list. Returns the
 * updated stamps + a resolution-annotated conflict array.
 */
export function resolveStampPolicies(
  input: TerrainStampPolicyResolverInput,
): TerrainStampPolicyResolverOutput {
  const { baseProvider, stamps, conflicts } = input;

  // The resolver works on a mutable copy - never on the caller's array.
  const working: TerrainStampConfig[] = stamps.map((stamp) => ({ ...stamp }));
  const aabbs: TerrainStampAABBs[] = working.map((stamp) => stampAABBs(stamp));

  // Initialise resolutions: one entry per conflict, default 'unchanged'.
  const resolutions: TerrainStampPolicyResolution[] = conflicts.map((conflict) => ({
    ...conflict,
    resolution: 'unchanged' as TerrainStampPolicyResolutionKind,
  }));

  // Index conflicts by EITHER stamp index. Pass 1 (target-height resample)
  // can be triggered by a `sample_post_compose` stamp that sits on either
  // side of a conflict, so we want to annotate whichever conflict references
  // the resampled stamp. Pass 2 (obstruction policy) walks resolutions
  // directly and uses `stampA` as the lower-priority side.
  const conflictsByStampIdx = new Map<number, number[]>();
  conflicts.forEach((conflict, index) => {
    for (const idx of [conflict.stampA, conflict.stampB]) {
      const bucket = conflictsByStampIdx.get(idx) ?? [];
      bucket.push(index);
      conflictsByStampIdx.set(idx, bucket);
    }
  });

  // Pass 1: target-height strategies.
  //
  // Order: ascending priority (already the input order). For each stamp:
  //   - baked              -> leave `fixedTargetHeight` alone (default).
  //   - sample_at_compose  -> sample against the provider built from all
  //                           strictly-lower-priority stamps composed so far.
  //   - sample_post_compose -> sample against the provider built from every
  //                           OTHER stamp (excluding self).
  //
  // The memo only uses `sample_post_compose` for the airfield envelope (a
  // low-priority stamp whose higher-priority overlappers - rects + adjacent
  // hydrology cuts - already carry baked targets). One pass is sufficient.
  for (let i = 0; i < working.length; i++) {
    const stamp = working[i];
    const strategy = stamp.targetHeightStrategy ?? 'baked';
    if (strategy === 'baked') continue;

    const others = strategy === 'sample_at_compose'
      ? working.slice(0, i)
      : working.slice(0, i).concat(working.slice(i + 1));
    const provider = makePartialProvider(baseProvider, others);
    const newTarget = sampleTargetForStamp(stamp, provider);
    const previousTarget = stamp.fixedTargetHeight;
    working[i] = { ...stamp, fixedTargetHeight: newTarget };

    annotateResolutionsForStamp(resolutions, conflictsByStampIdx, i, {
      resolution: 'resampled',
      rewroteStamp: i,
      previousTarget,
      newTarget,
    });
  }

  // Pass 2: obstruction policies.
  //
  // For every conflict (lower-priority stampA, higher-priority stampB),
  // examine the LOWER-priority stamp's policy. The lower stamp is the side
  // that "yields" - the higher-priority stamp already overrides inside its
  // footprint via the StampedHeightProvider semantic.
  //
  //   - never_above (lower) -> if higher target is BELOW lower target,
  //                             clamp lower target DOWN to higher target.
  //   - never_below (lower) -> symmetric clamp UP.
  //   - override   (lower) -> lower stamp keeps its target. No clamp.
  //   - consult    (lower) -> already handled in Pass 1 if strategy was
  //                             sample_*. If still `baked`, the lower stamp
  //                             cedes its target to the higher stamp's
  //                             target within their overlap.
  for (let r = 0; r < resolutions.length; r++) {
    const resolution = resolutions[r];
    if (resolution.resolution !== 'unchanged') continue;
    const lowerIdx = resolution.stampA;
    const higherIdx = resolution.stampB;
    if (!stampsAABBOverlap(aabbs[lowerIdx], aabbs[higherIdx])) continue;

    const lower = working[lowerIdx];
    const higher = working[higherIdx];
    const lowerPolicy = lower.obstructionPolicy ?? 'override';

    const higherTarget = effectiveTarget(higher, baseProvider);
    const lowerTarget = effectiveTarget(lower, baseProvider);

    if (lowerPolicy === 'never_above' && higherTarget < lowerTarget) {
      working[lowerIdx] = { ...lower, fixedTargetHeight: higherTarget };
      resolutions[r] = {
        ...resolution,
        resolution: 'clamped',
        rewroteStamp: lowerIdx,
        previousTarget: lowerTarget,
        newTarget: higherTarget,
      };
    } else if (lowerPolicy === 'never_below' && higherTarget > lowerTarget) {
      working[lowerIdx] = { ...lower, fixedTargetHeight: higherTarget };
      resolutions[r] = {
        ...resolution,
        resolution: 'clamped',
        rewroteStamp: lowerIdx,
        previousTarget: lowerTarget,
        newTarget: higherTarget,
      };
    } else if (
      lowerPolicy === 'consult' &&
      (lower.targetHeightStrategy ?? 'baked') === 'baked' &&
      higherTarget !== lowerTarget
    ) {
      // Baked `consult` cedes to the higher stamp's target.
      working[lowerIdx] = { ...lower, fixedTargetHeight: higherTarget };
      resolutions[r] = {
        ...resolution,
        resolution: 'overridden',
        rewroteStamp: lowerIdx,
        previousTarget: lowerTarget,
        newTarget: higherTarget,
      };
    }
  }

  return { stamps: working, resolutions };
}

function annotateResolutionsForStamp(
  resolutions: TerrainStampPolicyResolution[],
  conflictsByStampIdx: Map<number, number[]>,
  stampIdx: number,
  patch: Pick<
    TerrainStampPolicyResolution,
    'resolution' | 'rewroteStamp' | 'previousTarget' | 'newTarget'
  >,
): void {
  const indices = conflictsByStampIdx.get(stampIdx);
  if (!indices || indices.length === 0) return;
  // Only annotate the FIRST 'unchanged' conflict for this stamp - subsequent
  // conflicts on the same stamp remain 'unchanged' because the resolver has
  // already done the work for this stamp.
  for (const idx of indices) {
    if (resolutions[idx].resolution === 'unchanged') {
      resolutions[idx] = { ...resolutions[idx], ...patch };
      return;
    }
  }
}
