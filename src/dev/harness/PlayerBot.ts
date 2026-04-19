/**
 * Harness PlayerBot. State-machine bot that plays the game through the
 * player's own controls by producing a `PlayerBotIntent` each tick.
 *
 * Mirrors `src/systems/vehicle/NPCFixedWingPilot.ts` exactly in shape:
 * `update(dtMs, observation) -> intent` where `observation` is a bundle of
 * engine-derived values plus the four NPC primitives (canSeeTarget,
 * findNearestEnemy, queryPath, findNearestNavmeshPoint) the state functions
 * consume. The bot does not reach into the engine itself — the caller
 * (driver) wires observations in.
 *
 * The point of this separation: the state machine is a pure function of its
 * inputs, so it is unit-testable without Three.js or the whole engine, and
 * it is replay-friendly (record observations, replay to drive the bot).
 */

import {
  BotTarget,
  BotVec3,
  DEFAULT_PLAYER_BOT_CONFIG,
  PlayerBotConfig,
  PlayerBotIntent,
  PlayerBotState,
  PlayerBotStateContext,
} from './playerBot/types';
import { stepState } from './playerBot/states';

/** Observation bundle the driver supplies each tick. */
export interface PlayerBotObservation {
  readonly now: number;
  readonly eyePos: BotVec3;
  readonly velocity: BotVec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly suppressionScore: number;
  readonly lastDamageMs: number;
  readonly magazine: { current: number; max: number };
  readonly findNearestEnemy: () => BotTarget | null;
  readonly canSeeTarget: (targetPos: BotVec3) => boolean;
  readonly queryPath: (from: BotVec3, to: BotVec3) => BotVec3[] | null;
  readonly findNearestNavmeshPoint: (point: BotVec3) => BotVec3 | null;
  readonly getObjective: () => { position: BotVec3; priority: number } | null;
  readonly sampleHeight: (x: number, z: number) => number;
}

/** Bounded transition log entry for debug / playtest evidence. */
export interface PlayerBotTransition {
  readonly from: PlayerBotState;
  readonly to: PlayerBotState;
  readonly atMs: number;
}

/** Histogram of time spent in each state (ms). Used for smoke-capture telemetry. */
export type PlayerBotStateHistogram = Record<PlayerBotState, number>;

export class PlayerBot {
  private state: PlayerBotState = 'PATROL';
  private timeInStateMs = 0;
  private currentTarget: BotTarget | null = null;
  private readonly config: PlayerBotConfig;
  private readonly transitionLog: PlayerBotTransition[] = [];
  private static readonly TRANSITION_LOG_CAP = 128;
  private readonly histogram: PlayerBotStateHistogram = {
    PATROL: 0,
    ALERT: 0,
    ENGAGE: 0,
    ADVANCE: 0,
    RESPAWN_WAIT: 0,
  };

  constructor(config: PlayerBotConfig = DEFAULT_PLAYER_BOT_CONFIG) {
    this.config = config;
  }

  getState(): PlayerBotState {
    return this.state;
  }

  getTimeInStateMs(): number {
    return this.timeInStateMs;
  }

  getCurrentTarget(): BotTarget | null {
    return this.currentTarget;
  }

  getTransitionLog(): ReadonlyArray<PlayerBotTransition> {
    return this.transitionLog;
  }

  getStateHistogram(): Readonly<PlayerBotStateHistogram> {
    return this.histogram;
  }

  getConfig(): PlayerBotConfig {
    return this.config;
  }

  /**
   * Advance the bot by `dtMs`, returning the intent for this tick. The
   * caller is expected to apply the intent via `PlayerBotController`.
   */
  update(dtMs: number, obs: PlayerBotObservation): PlayerBotIntent {
    this.timeInStateMs += Math.max(0, dtMs);
    this.histogram[this.state] += Math.max(0, dtMs);

    // Target acquisition / invalidation. Keep the locked target unless it
    // has died, moved out of perception, or the nearest-enemy query yields
    // a different id AND the old one is stale.
    const nextTarget = this.updateTarget(obs);

    const ctx: PlayerBotStateContext = {
      now: obs.now,
      state: this.state,
      timeInStateMs: this.timeInStateMs,
      eyePos: obs.eyePos,
      velocity: obs.velocity,
      yaw: obs.yaw,
      pitch: obs.pitch,
      health: obs.health,
      maxHealth: obs.maxHealth,
      suppressionScore: obs.suppressionScore,
      lastDamageMs: obs.lastDamageMs,
      magazine: obs.magazine,
      currentTarget: nextTarget,
      findNearestEnemy: obs.findNearestEnemy,
      canSeeTarget: obs.canSeeTarget,
      queryPath: obs.queryPath,
      findNearestNavmeshPoint: obs.findNearestNavmeshPoint,
      getObjective: obs.getObjective,
      sampleHeight: obs.sampleHeight,
      config: this.config,
    };

    const step = stepState(this.state, ctx);
    this.currentTarget = nextTarget;

    if (step.nextState && step.nextState !== this.state) {
      this.transitionTo(step.nextState, obs.now);
    } else if (step.resetTimeInState) {
      this.timeInStateMs = 0;
    }

    return step.intent;
  }

  /**
   * Compute the target for this tick. Returns the current locked target if
   * it is still valid; otherwise refreshes from `findNearestEnemy`.
   *
   * "Still valid" = we have last seen it within 4s AND findNearestEnemy
   * returned the same id OR returned nothing (object-permanence window).
   */
  private updateTarget(obs: PlayerBotObservation): BotTarget | null {
    const fresh = obs.findNearestEnemy();
    const staleWindowMs = 4000;

    if (!this.currentTarget) {
      return fresh;
    }

    if (fresh && fresh.id === this.currentTarget.id) {
      // Same target — refresh last-known.
      return fresh;
    }

    // Stale? Drop.
    if ((obs.now - this.currentTarget.lastKnownMs) > staleWindowMs) {
      return fresh;
    }

    // Keep the stale target so ADVANCE can close the gap (object permanence).
    // If a fresh candidate appears, prefer it — closer/visible beats stale.
    return fresh ?? this.currentTarget;
  }

  private transitionTo(next: PlayerBotState, atMs: number): void {
    if (this.state === next) return;
    this.transitionLog.push({ from: this.state, to: next, atMs });
    if (this.transitionLog.length > PlayerBot.TRANSITION_LOG_CAP) {
      this.transitionLog.shift();
    }
    this.state = next;
    this.timeInStateMs = 0;
  }
}

export type { PlayerBotConfig, PlayerBotState, PlayerBotIntent, BotVec3, BotTarget } from './playerBot/types';
export { createIdlePlayerBotIntent, DEFAULT_PLAYER_BOT_CONFIG } from './playerBot/types';
