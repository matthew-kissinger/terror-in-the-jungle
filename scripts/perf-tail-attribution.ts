/**
 * combat-p99-tail-attribution (DEFEKT-3, L1)
 *
 * Per-method attribution of the single worst-p99 sample window, computed from
 * the timers a `perf:capture` run already records (`combatBreakdown` +
 * `systemTop`). Additive + read-only against the engine — no extra per-frame
 * cost. Extracted into its own module so it is unit-testable without importing
 * `perf-capture.ts` (which runs a real capture on import).
 *
 * The returned object IS the proof for "where is the tail frame's time?" from a
 * single capture, no baseline required:
 *
 *  - `coverSearch.totalCoverMs` ≈0 confirms DEFEKT-3's first clause (the
 *    synchronous cover search no longer dominates p99): the search is wired
 *    O(1), triple-capped, and off the hot path.
 *  - `combat.unattributedMs` = the Combat-phase total minus its named children,
 *    where the NPC contour terrain-stall movement cost hides (movement is billed
 *    to the Combat phase but not to a named aiMethodMs timer). Paired with the
 *    `state.advancing` entry in `topAiStates`.
 *  - `combatVsOther` splits the worst frame into the Combat system's cost vs
 *    render/"Other", surfacing the superposition in
 *    docs/rearch/COMBAT_AI_P99_SPIKE_2026-06-03.md (a combat-only fix may not
 *    clear the frame).
 */

/** Minimal shape of a runtime sample this attribution consumes. */
export interface TailAttributionSample {
  ts: string;
  frameCount: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  systemTop?: Array<{ name: string; emaMs: number; peakMs: number }>;
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    spatialSyncMs?: number;
    billboardUpdateMs?: number;
    effectPoolsMs?: number;
    influenceMapMs?: number;
    aiStateMs?: Record<string, number>;
    aiMethodMs?: Record<string, number>;
    aiMethodCounts?: Record<string, number>;
    closeEngagement?: {
      engagement?: {
        suppressionFlankCoverSearches?: number;
        suppressionFlankCoverSearchCapSkips?: number;
      };
    };
  };
}

export type TailAttribution = {
  sampleTs: string;
  sampleFrameCount: number;
  p99FrameMs: number;
  maxFrameMs: number;
  combat: {
    totalMs: number;
    aiUpdateMs: number;
    spatialSyncMs: number;
    billboardUpdateMs: number;
    effectPoolsMs: number;
    influenceMapMs: number;
    /**
     * totalMs - sum(named children). Where un-named combat work (incl. the NPC
     * contour terrain-stall movement cost) lands.
     */
    unattributedMs: number;
  };
  topAiMethods: Array<{ name: string; ms: number; calls?: number }>;
  topAiStates: Array<{ name: string; ms: number }>;
  coverSearch: {
    coverGridQueryMs: number;
    coverSearchMs: number;
    findBestCoverMs: number;
    computeFlankDestinationMs: number;
    totalCoverMs: number;
    flankCoverSearches?: number;
    flankCoverSearchCapSkips?: number;
  };
  combatVsOther: {
    topSystem: string | null;
    topSystemMs: number;
    combatSystemMs: number;
    frameMs: number;
    /** frameMs - combatSystemMs (render/"Other" residual). */
    otherMs: number;
  };
  /** totalCoverMs is a meaningful share (>10%) of the tail frame. */
  coverDominatesTail: boolean;
  /** Combat system is the frame's top cost AND >half the frame. */
  combatDominatesTail: boolean;
  conclusion: string;
};

const COVER_GRID_QUERY_KEY = 'engage.suppression.initiate.coverGridQuery';
const COVER_SEARCH_KEY = 'engage.suppression.initiate.coverSearch';
const FIND_BEST_COVER_KEY = 'engage.cover.findBestCover';
const COMPUTE_FLANK_DEST_KEY = 'engage.suppression.initiate.computeFlankDestination';

function rankRecord(
  rec: Record<string, number> | undefined,
  topN: number,
): Array<{ name: string; ms: number }> {
  return Object.entries(rec ?? {})
    .map(([name, ms]) => ({ name, ms: Number(ms) }))
    .filter((e) => Number.isFinite(e.ms))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, topN);
}

/**
 * Pick the worst-p99 runtime sample and decompose its frame. Returns undefined
 * when no sample carried a `combatBreakdown`.
 */
export function computeTailAttribution(
  samples: TailAttributionSample[],
): TailAttribution | undefined {
  const withBreakdown = samples.filter((s) => s.combatBreakdown);
  if (withBreakdown.length === 0) return undefined;

  // Tail window = the sample with the highest rolling p99 (fall back to
  // maxFrame, then avgFrame, so a capture without p99 still attributes a sample).
  const score = (s: TailAttributionSample): number =>
    Number(s.p99FrameMs ?? s.maxFrameMs ?? s.avgFrameMs ?? 0);
  let tail = withBreakdown[0];
  for (const s of withBreakdown) {
    if (score(s) > score(tail)) tail = s;
  }

  const cb = tail.combatBreakdown!;
  const totalMs = Number(cb.totalMs ?? 0);
  const aiUpdateMs = Number(cb.aiUpdateMs ?? 0);
  const spatialSyncMs = Number(cb.spatialSyncMs ?? 0);
  const billboardUpdateMs = Number(cb.billboardUpdateMs ?? 0);
  const effectPoolsMs = Number(cb.effectPoolsMs ?? 0);
  const influenceMapMs = Number(cb.influenceMapMs ?? 0);
  const namedChildrenMs =
    aiUpdateMs + spatialSyncMs + billboardUpdateMs + effectPoolsMs + influenceMapMs;
  const unattributedMs = Math.max(0, totalMs - namedChildrenMs);

  const methodCounts = cb.aiMethodCounts ?? {};
  const topAiMethods = rankRecord(cb.aiMethodMs, 8).map((e) => ({
    ...e,
    calls: methodCounts[e.name] !== undefined ? Number(methodCounts[e.name]) : undefined,
  }));
  const topAiStates = rankRecord(cb.aiStateMs, 6);

  const methodMs = cb.aiMethodMs ?? {};
  const coverGridQueryMs = Number(methodMs[COVER_GRID_QUERY_KEY] ?? 0);
  const coverSearchMs = Number(methodMs[COVER_SEARCH_KEY] ?? 0);
  const findBestCoverMs = Number(methodMs[FIND_BEST_COVER_KEY] ?? 0);
  const computeFlankDestinationMs = Number(methodMs[COMPUTE_FLANK_DEST_KEY] ?? 0);
  const totalCoverMs = coverGridQueryMs + coverSearchMs + findBestCoverMs;
  const engagement = cb.closeEngagement?.engagement;

  // Frame-level Combat-vs-Other split from systemTop.
  const systemTop = Array.isArray(tail.systemTop) ? tail.systemTop : [];
  const topSystemEntry = systemTop[0] ?? null;
  const combatEntry = systemTop.find((s) => s.name.toLowerCase().includes('combat')) ?? null;
  const combatSystemMs = combatEntry ? Number(combatEntry.emaMs) : 0;
  // Frame cost: prefer the explicit p99/max frame; else sum the system EMAs.
  const frameMs = Number(
    tail.p99FrameMs ??
      tail.maxFrameMs ??
      systemTop.reduce((sum, s) => sum + Number(s.emaMs ?? 0), 0),
  );
  const otherMs = Math.max(0, frameMs - combatSystemMs);

  // "Dominates" is deliberately coarse — the question is order of magnitude.
  const coverDominatesTail = frameMs > 0 && totalCoverMs > frameMs * 0.1;
  const combatDominatesTail =
    !!topSystemEntry &&
    topSystemEntry.name.toLowerCase().includes('combat') &&
    frameMs > 0 &&
    combatSystemMs > frameMs * 0.5;

  const pct = (ms: number): string =>
    frameMs > 0 ? `${((ms / frameMs) * 100).toFixed(0)}%` : 'n/a';
  const conclusion =
    `Tail frame ~${frameMs.toFixed(1)}ms @ frame ${tail.frameCount}: ` +
    `cover-search ${totalCoverMs.toFixed(3)}ms (${pct(totalCoverMs)}) - ` +
    `${coverDominatesTail ? 'COVER IS A FACTOR' : 'cover is NOT the driver'}; ` +
    `Combat system ${combatSystemMs.toFixed(1)}ms (${pct(combatSystemMs)}), ` +
    `render/Other ${otherMs.toFixed(1)}ms (${pct(otherMs)}); ` +
    `combat-phase unattributed (movement/stall) ${unattributedMs.toFixed(2)}ms. ` +
    (combatDominatesTail
      ? 'Combat dominates the tail.'
      : 'Tail is a superposition - a combat-only fix is not guaranteed to clear it.');

  return {
    sampleTs: tail.ts,
    sampleFrameCount: Number(tail.frameCount ?? 0),
    p99FrameMs: Number(tail.p99FrameMs ?? 0),
    maxFrameMs: Number(tail.maxFrameMs ?? 0),
    combat: {
      totalMs,
      aiUpdateMs,
      spatialSyncMs,
      billboardUpdateMs,
      effectPoolsMs,
      influenceMapMs,
      unattributedMs,
    },
    topAiMethods,
    topAiStates,
    coverSearch: {
      coverGridQueryMs,
      coverSearchMs,
      findBestCoverMs,
      computeFlankDestinationMs,
      totalCoverMs,
      flankCoverSearches:
        engagement?.suppressionFlankCoverSearches !== undefined
          ? Number(engagement.suppressionFlankCoverSearches)
          : undefined,
      flankCoverSearchCapSkips:
        engagement?.suppressionFlankCoverSearchCapSkips !== undefined
          ? Number(engagement.suppressionFlankCoverSearchCapSkips)
          : undefined,
    },
    combatVsOther: {
      topSystem: topSystemEntry ? topSystemEntry.name : null,
      topSystemMs: topSystemEntry ? Number(topSystemEntry.emaMs) : 0,
      combatSystemMs,
      frameMs,
      otherMs,
    },
    coverDominatesTail,
    combatDominatesTail,
    conclusion,
  };
}
