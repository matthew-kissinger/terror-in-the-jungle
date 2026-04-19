/**
 * Types for the harness PlayerBot state machine. Mirrors the shape of
 * `src/systems/vehicle/npcPilot/types.ts` (the fixed-wing pilot): each state
 * is a pure function that reads a `PlayerBotStateContext` and produces a
 * `PlayerBotStateStep` with a structured `PlayerBotIntent`. The controller
 * (PlayerBotController) consumes the intent and drives the live
 * PlayerController — the bot itself never touches the engine.
 *
 * The bot plays the game through the same movement + aim + fire surface a
 * human uses. It does NOT reinvent combat primitives: LOS, target search,
 * and path query are all supplied as closures on the context and are
 * expected to be wired to the real NPC/terrain/navmesh systems.
 */

export type PlayerBotState =
  | 'PATROL'        // no target; move toward objective
  | 'ALERT'         // heard/spotted something; orient + advance cautiously
  | 'ENGAGE'        // target visible + in-range; fire + strafe
  | 'ADVANCE'       // target known, not visible or out-of-range; close the gap on navmesh
  | 'SEEK_COVER'    // under fire, health low or suppression high
  | 'RETREAT'       // health critical, break contact
  | 'RESPAWN_WAIT'; // dead, wait for respawn

/** 3D world position (plain object — bot is engine-agnostic). */
export interface BotVec3 {
  x: number;
  y: number;
  z: number;
}

/** Known target observation. The bot tracks the last-known position so it
 * can transition to ADVANCE and close the gap when visibility is lost. */
export interface BotTarget {
  id: string;
  position: BotVec3;
  lastKnownMs: number;
}

/**
 * Intent the bot emits each tick. The controller translates this into the
 * existing PlayerController surface (movement intent, view angles, fire).
 * No behavior lives on this object — it is a plain value.
 */
export interface PlayerBotIntent {
  // Movement — normalized axis values; controller translates to WASD keys.
  moveForward: number;   // -1 (back) .. 0 .. 1 (forward)
  moveStrafe: number;    // -1 (left) .. 0 .. 1 (right)
  sprint: boolean;
  crouch: boolean;
  jump: boolean;         // rare; small ledges only

  // Aim — absolute world-space yaw/pitch targets. Controller slews camera.
  aimYaw: number;        // radians
  aimPitch: number;      // radians
  aimLerpRate: number;   // 0..1; 1 = snap

  // Fire — bot writes intent; controller debounces.
  firePrimary: boolean;
  reload: boolean;
}

/** Input context the state functions read each tick. */
export interface PlayerBotStateContext {
  readonly now: number;
  readonly state: PlayerBotState;
  readonly timeInStateMs: number;
  readonly eyePos: BotVec3;
  readonly velocity: BotVec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly health: number;              // 0..100
  readonly maxHealth: number;
  readonly suppressionScore: number;    // 0..1
  readonly lastDamageMs: number;
  readonly magazine: { current: number; max: number };
  /** The best-known target, if any. State machine owns the transition. */
  readonly currentTarget: BotTarget | null;

  // Primitives consumed from the engine — do NOT reinvent these.
  readonly findNearestEnemy: () => BotTarget | null;
  readonly canSeeTarget: (targetPos: BotVec3) => boolean;
  readonly queryPath: (from: BotVec3, to: BotVec3) => BotVec3[] | null;
  readonly findNearestNavmeshPoint: (point: BotVec3) => BotVec3 | null;
  readonly getObjective: () => { position: BotVec3; priority: number } | null;
  readonly sampleHeight: (x: number, z: number) => number;

  // Tuning — mode profile carried in from the driver.
  readonly config: PlayerBotConfig;
}

/** Per-tick step result — an intent and a next state. */
export interface PlayerBotStateStep {
  readonly intent: PlayerBotIntent;
  /** null means "stay in the current state". */
  readonly nextState: PlayerBotState | null;
  readonly resetTimeInState: boolean;
}

/**
 * Behavior tuning the driver passes into the bot. Mode profile values
 * (aggressive vs standard, engagement range, etc.) live here so the bot
 * itself stays mode-agnostic.
 */
export interface PlayerBotConfig {
  /** Max distance (m) at which ENGAGE will fire. */
  readonly maxFireDistance: number;
  /** Distance (m) threshold for sprint in PATROL/ADVANCE. */
  readonly sprintDistance: number;
  /** Distance (m) threshold for normal advance. */
  readonly approachDistance: number;
  /** Distance (m) at which ENGAGE backs off. */
  readonly retreatDistance: number;
  /** Health fraction below which ENGAGE transitions to SEEK_COVER. */
  readonly coverHealthFraction: number;
  /** Health fraction below which any state transitions to RETREAT. */
  readonly retreatHealthFraction: number;
  /** Suppression score above which ENGAGE breaks off. */
  readonly coverSuppressionScore: number;
  /** Milliseconds of contact quiet before RETREAT returns to PATROL. */
  readonly retreatQuietMs: number;
  /** Aim slew rate per tick (0..1). 1 = instant snap. */
  readonly aimLerpRate: number;
  /** Strafe amplitude in ENGAGE (0..1). 0 disables player-dodge. */
  readonly engageStrafeAmplitude: number;
  /** Strafe oscillation period (ms). */
  readonly engageStrafePeriodMs: number;
  /** Perception range (m) for findNearestEnemy. */
  readonly perceptionRange: number;
  /** Tick length (ms) — used for path-age calculations. */
  readonly tickMs: number;
}

export const DEFAULT_PLAYER_BOT_CONFIG: PlayerBotConfig = {
  maxFireDistance: 165,
  sprintDistance: 200,
  approachDistance: 120,
  retreatDistance: 18,
  coverHealthFraction: 0.5,
  retreatHealthFraction: 0.2,
  coverSuppressionScore: 0.7,
  retreatQuietMs: 5000,
  aimLerpRate: 1,
  engageStrafeAmplitude: 0.3,
  engageStrafePeriodMs: 750,
  perceptionRange: 220,
  tickMs: 250,
};

/** Produce a zeroed intent. Used as the starting point inside each state. */
export function createIdlePlayerBotIntent(): PlayerBotIntent {
  return {
    moveForward: 0,
    moveStrafe: 0,
    sprint: false,
    crouch: false,
    jump: false,
    aimYaw: 0,
    aimPitch: 0,
    aimLerpRate: 1,
    firePrimary: false,
    reload: false,
  };
}
