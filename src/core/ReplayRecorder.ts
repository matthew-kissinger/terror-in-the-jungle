/**
 * ReplayRecorder — captures seed + tick-indexed inputs + final state for a
 * deterministic session replay (single machine).
 *
 * Pairs with SeededRandom (ambient session mode) and ReplayPlayer. The
 * recorder does not know about any specific sim; callers push input frames
 * each tick and a final-state snapshot at the end. The resulting blob is a
 * plain typed object (not a file format yet) that a test or CI job can hand
 * to ReplayPlayer.
 *
 * This is a prototype on the C2 path defined by
 * docs/rearch/E5-deterministic-sim.md. Cross-machine determinism is out of
 * scope; the tolerance policy below is calibrated for same-machine replays.
 */

export interface ReplayStateSnapshotEntity {
  id: string;
  position: { x: number; y: number; z: number };
  /** Optional attitude vector for aircraft/aim state. yaw, pitch, roll in rad. */
  attitude?: { yaw: number; pitch: number; roll: number };
  health?: number;
}

export interface ReplayStateSnapshot {
  /** Sim time in ms at snapshot capture. */
  timeMs: number;
  /** Tick index at snapshot capture. */
  tick: number;
  entities: ReplayStateSnapshotEntity[];
}

/**
 * One input frame. `input` is left opaque (typed as `unknown`) so consumers
 * can slot in AgentAction, raw keycodes, or simpler per-scenario shapes.
 */
export interface ReplayInputFrame<I = unknown> {
  tick: number;
  input: I;
}

export interface ReplayBlob<I = unknown> {
  readonly format: 'replay-v1';
  readonly seed: number;
  readonly scenario: string;
  readonly tickRateHz: number;
  readonly inputs: ReadonlyArray<ReplayInputFrame<I>>;
  readonly finalState: ReplayStateSnapshot;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ReplayRecorderOptions {
  seed: number;
  scenario: string;
  tickRateHz?: number;
  metadata?: Record<string, unknown>;
}

export class ReplayRecorder<I = unknown> {
  private readonly inputs: ReplayInputFrame<I>[] = [];
  private finalState: ReplayStateSnapshot | null = null;
  private readonly seed: number;
  private readonly scenario: string;
  private readonly tickRateHz: number;
  private readonly metadata?: Record<string, unknown>;
  // Session gate. `recordInput()` is a no-op outside of an active session so
  // the input buffer cannot grow unboundedly if a recorder is accidentally
  // left wired into a long-lived tick loop (e.g. perf capture). Starts true
  // on construction so existing tests that push inputs immediately after
  // `new ReplayRecorder()` without an explicit startSession() keep working.
  private sessionActive = true;

  constructor(opts: ReplayRecorderOptions) {
    this.seed = opts.seed;
    this.scenario = opts.scenario;
    this.tickRateHz = opts.tickRateHz ?? 60;
    this.metadata = opts.metadata;
  }

  getSeed(): number {
    return this.seed;
  }

  getTickRateHz(): number {
    return this.tickRateHz;
  }

  /**
   * Mark the recorder as actively capturing. `recordInput()` only buffers
   * frames while a session is active; pair with `endSession()` to stop the
   * recorder from buffering further frames (e.g. after `build()` has been
   * called but the tick loop is still calling `recordInput`).
   */
  startSession(): void {
    this.sessionActive = true;
  }

  /**
   * Stop buffering input frames. Subsequent `recordInput()` calls are silent
   * no-ops until `startSession()` is called again. Does not clear the
   * already-buffered frames — `build()` still produces a complete blob.
   */
  endSession(): void {
    this.sessionActive = false;
  }

  /** True while the recorder is actively buffering `recordInput()` frames. */
  isSessionActive(): boolean {
    return this.sessionActive;
  }

  /** Push one input frame for the given tick index. No-op outside a session. */
  recordInput(tick: number, input: I): void {
    if (!this.sessionActive) return;
    this.inputs.push({ tick, input });
  }

  /** Capture the final simulation state. Must be called before `build()`. */
  recordFinalState(snapshot: ReplayStateSnapshot): void {
    this.finalState = snapshot;
  }

  /** Get the number of input frames captured so far (primarily for tests). */
  getInputCount(): number {
    return this.inputs.length;
  }

  /**
   * Produce the typed replay blob. Throws if no final state has been
   * recorded — an incomplete replay would be misleading.
   */
  build(): ReplayBlob<I> {
    if (this.finalState === null) {
      throw new Error('ReplayRecorder.build(): no final state recorded');
    }
    return {
      format: 'replay-v1',
      seed: this.seed,
      scenario: this.scenario,
      tickRateHz: this.tickRateHz,
      inputs: this.inputs.slice(),
      finalState: this.finalState,
      metadata: this.metadata,
    };
  }
}
