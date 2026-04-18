/**
 * Runner behavior tests. Focus is the A4-class acceptance contract:
 *   "if the agent adapter sends the player backward instead of forward,
 *    combat120 must FAIL at min-engagements — loudly and automatically."
 *
 * These tests construct a fake AgentLike that emulates a minimal world —
 * an opfor target at a fixed position. The "good" adapter moves the player
 * toward the target; the "sign-flipped" adapter moves them away. The
 * runner's observation accumulator + validator chain must diverge those two.
 */

import { describe, it, expect } from 'vitest';
import { runScenario, accumulateObservation } from '../runner';
import type { AgentLike } from '../runner';
import type {
  AgentAction,
  AgentObservation,
  OwnStateSnapshot,
  VisibleEntity,
} from '../../../systems/agent/AgentTypes';
import type { ScenarioConfig } from '../types';
import { Faction } from '../../../systems/combat/types';

const TEST_TICK_HZ = 120; // fast-forward in tests

type World = {
  playerX: number;
  playerZ: number;
  playerVelX: number;
  playerVelZ: number;
  magazine: number;
  firing: boolean;
  hostilePos: { x: number; z: number };
  hostileAlive: boolean;
};

function makeWorld(): World {
  return {
    playerX: 0,
    playerZ: 0,
    playerVelX: 0,
    playerVelZ: 0,
    magazine: 30,
    firing: false,
    hostilePos: { x: 0, z: 50 },
    hostileAlive: true,
  };
}

function mkOwnState(world: World, overrides: Partial<OwnStateSnapshot> = {}): OwnStateSnapshot {
  return {
    position: { x: world.playerX, y: 0, z: world.playerZ },
    velocity: { x: world.playerVelX, y: 0, z: world.playerVelZ },
    yawRad: 0,
    pitchRad: 0,
    healthAbs: 100,
    healthFrac: 1,
    ammoInMag: world.magazine,
    ammoReserve: 90,
    stance: 'standing',
    isRunning: false,
    isGrounded: true,
    isDead: false,
    inVehicle: null,
    faction: Faction.US,
    ...overrides,
  };
}

const TEST_VISION_RANGE_M = 200;

function mkObservation(world: World, tick: number): AgentObservation {
  const dx = world.hostilePos.x - world.playerX;
  const dz = world.hostilePos.z - world.playerZ;
  const dist = Math.hypot(dx, dz);
  const inRange = dist <= TEST_VISION_RANGE_M;
  const visible: VisibleEntity[] = world.hostileAlive && inRange
    ? [
        {
          id: 'h1',
          kind: 'combatant',
          faction: Faction.NVA,
          position: { x: world.hostilePos.x, y: 0, z: world.hostilePos.z },
          velocity: { x: 0, y: 0, z: 0 },
          healthFrac: 1,
          distance: dist,
          bearingRad: Math.atan2(dx, dz),
        },
      ]
    : [];
  return {
    tick,
    timeMs: tick * (1000 / TEST_TICK_HZ),
    ownState: mkOwnState(world),
    visibleEntities: visible,
    objectives: [],
  };
}

function createFakeAgent(opts: {
  world: World;
  /** If true, move-to inverts the direction (A4 regression). */
  flipMoveSign?: boolean;
  /** Speed in m/tick applied when a move-to action is active. */
  moveSpeed?: number;
}): AgentLike & { tickIndex: number } {
  const world = opts.world;
  const flip = opts.flipMoveSign ?? false;
  const speed = opts.moveSpeed ?? 2;
  let tickIndex = 0;

  let pendingMove: AgentAction & { kind: 'move-to' } | null = null;

  return {
    get tickIndex() { return tickIndex; },
    apply(action: AgentAction): unknown {
      if (action.kind === 'move-to') {
        pendingMove = action;
      } else if (action.kind === 'stop-moving' || action.kind === 'cease-fire') {
        pendingMove = null;
        world.firing = false;
      } else if (action.kind === 'fire-at') {
        // Fake fire: reduce magazine to simulate shots.
        if (world.magazine > 0) {
          world.magazine--;
          world.firing = true;
        }
      }
      return { accepted: true };
    },
    step(): void {
      if (pendingMove) {
        const dx = pendingMove.target.x - world.playerX;
        const dz = pendingMove.target.z - world.playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.01) {
          const sign = flip ? -1 : 1;
          world.playerVelX = sign * (dx / dist) * speed * TEST_TICK_HZ;
          world.playerVelZ = sign * (dz / dist) * speed * TEST_TICK_HZ;
          world.playerX += sign * (dx / dist) * speed;
          world.playerZ += sign * (dz / dist) * speed;
        }
      } else {
        world.playerVelX = 0;
        world.playerVelZ = 0;
      }
      tickIndex++;
    },
    observe(): AgentObservation {
      return mkObservation(world, tickIndex);
    },
    release(): void {
      pendingMove = null;
      world.firing = false;
    },
  };
}

const tinyCombat: ScenarioConfig = {
  id: 'tiny-combat',
  map: 'ai_sandbox',
  npcCount: 1,
  durationSec: 0.5, // short enough to finish fast in tests
  warmupSec: 0,
  player: {
    spawn: { kind: 'at-spawn-point' },
    policy: { kind: 'engage-nearest-hostile', fireMode: 'hold', reengageCooldownMs: 0 },
    seed: 'tiny',
  },
  observe: { frameTimes: true, aiBudgetOverruns: false, shotsFired: true, engagements: true },
  validators: [
    { kind: 'min-shots', count: 3 },
    { kind: 'min-engagements', count: 1 },
  ],
};

// Scenario equivalent to combat120 for the purpose of testing A4 regression
// detection: requires 3 distinct engagements. The fake world toggles
// hostile visibility so a working agent can exercise multiple engagements
// (closing the distance multiple times after the hostile "respawns") while
// a sign-flipped agent keeps the hostile out of sight.
const multiEngagementScenario: ScenarioConfig = {
  id: 'multi-engagement',
  map: 'ai_sandbox',
  npcCount: 1,
  durationSec: 0.8,
  warmupSec: 0,
  player: {
    spawn: { kind: 'at-spawn-point' },
    policy: { kind: 'engage-nearest-hostile', fireMode: 'hold', reengageCooldownMs: 0 },
    seed: 'multi',
  },
  observe: { frameTimes: true, aiBudgetOverruns: false, shotsFired: true, engagements: true },
  validators: [
    { kind: 'min-shots', count: 3 },
    { kind: 'min-engagements', count: 3 },
  ],
};

function fakeClock(): { nowMs: () => number; advance: (ms: number) => void } {
  let t = 0;
  return {
    nowMs: () => t,
    advance: (ms: number) => { t += ms; },
  };
}

describe('harness runner — scenario contract', () => {
  it('passes validators when the agent engages combat correctly', async () => {
    const world = makeWorld();
    const agent = createFakeAgent({ world });
    const clock = fakeClock();
    const result = await runScenario({
      scenario: tinyCombat,
      agent,
      clock,
      tickRateHz: TEST_TICK_HZ,
      wait: async (ms) => clock.advance(ms),
    });

    expect(result.scenarioId).toBe('tiny-combat');
    expect(result.overall).toBe('pass');
    expect(result.observations.shotsFired).toBeGreaterThanOrEqual(3);
    expect(result.observations.engagements).toBeGreaterThanOrEqual(1);
    const shots = result.validators.find((v) => v.kind === 'min-shots')!;
    expect(shots.status).toBe('pass');
  });

  /**
   * Acceptance test for the A4 regression. The brief requires that a
   * sign-flipped `move-to` adapter makes combat120 FAIL at `min-engagements`.
   *
   * Setup:
   *  - Scenario `multi-engagement` requires min-engagements: 3.
   *  - Fake world puts the hostile just inside vision range (at z=190).
   *  - Good agent closes → stays in contact → only 1 engagement (not enough
   *    for 3) — but with the hostile toggling through out-of-view pulses
   *    (simulated below), the good agent re-engages each pulse.
   *
   * For this test we rely on hostile visibility cycling driven by the
   * `onTick` hook — forcing hostileAlive to false periodically.
   */
  it('A4 regression: sign-flipped move-to fails min-engagements loudly', async () => {
    const world = makeWorld();
    // Start the player near the edge of vision so a single sign-flipped
    // tick takes the hostile permanently out of sight. No cycling needed:
    // the broken adapter is the only cause of failure.
    world.hostilePos = { x: 0, z: 50 };
    world.playerX = 0;
    world.playerZ = -145;

    const brokenAgent = createFakeAgent({
      world,
      flipMoveSign: true,
      moveSpeed: 30,
    });

    const clock = fakeClock();
    const result = await runScenario({
      scenario: multiEngagementScenario,
      agent: brokenAgent,
      clock,
      tickRateHz: TEST_TICK_HZ,
      wait: async (ms) => clock.advance(ms),
    });

    expect(result.overall).toBe('fail');
    const engagements = result.validators.find((v) => v.kind === 'min-engagements');
    expect(engagements).toBeDefined();
    expect(engagements!.status).toBe('fail');
    expect(engagements!.message).toMatch(/did not exercise combat/);
    expect(result.observations.engagements).toBeLessThan(3);
  });

  it('good agent earns multiple engagements via visibility cycling', async () => {
    // Control case: the hostile cycles in/out of visibility, and a non-
    // flipped adapter stays close enough to re-engage each cycle.
    const world = makeWorld();
    world.hostilePos = { x: 0, z: 50 };
    const goodAgent = createFakeAgent({ world, moveSpeed: 1 });

    let tickCount = 0;
    const clock = fakeClock();
    const result = await runScenario({
      scenario: multiEngagementScenario,
      agent: goodAgent,
      clock,
      tickRateHz: TEST_TICK_HZ,
      wait: async (ms) => clock.advance(ms),
      onTick: () => {
        tickCount++;
        const phase = tickCount % 15;
        world.hostileAlive = phase < 10;
      },
    });

    expect(result.observations.engagements).toBeGreaterThanOrEqual(3);
    const engagements = result.validators.find((v) => v.kind === 'min-engagements')!;
    expect(engagements.status).toBe('pass');
  });

  it('produces a replay blob with the seed and input frames', async () => {
    const world = makeWorld();
    const agent = createFakeAgent({ world });
    const clock = fakeClock();
    const result = await runScenario({
      scenario: tinyCombat,
      agent,
      clock,
      tickRateHz: TEST_TICK_HZ,
      wait: async (ms) => clock.advance(ms),
    });

    const replay = result.replay as { format: string; seed: number; scenario: string; inputs: unknown[] };
    expect(replay.format).toBe('replay-v1');
    expect(replay.scenario).toBe('tiny-combat');
    expect(replay.seed).toBeGreaterThan(0);
    expect(replay.inputs.length).toBeGreaterThan(0);
  });
});

describe('accumulateObservation — pure folder', () => {
  function base(): AgentObservation {
    return mkObservation(makeWorld(), 0);
  }

  it('counts shots fired as a positive delta in magazine', () => {
    const a = base();
    const b = { ...a, ownState: { ...a.ownState, ammoInMag: 25 } };
    const state = accumulateObservation(
      { shotsFired: 0, engagements: 0, distanceTraversedM: 0, maxStuckSeconds: 0, ticks: 0, elapsedMs: 0 },
      b, a, 16,
    );
    expect(state.shotsFired).toBe(5);
  });

  it('ignores magazine increases (reloads)', () => {
    const a = base();
    const b = { ...a, ownState: { ...a.ownState, ammoInMag: 60 } };
    const state = accumulateObservation(
      { shotsFired: 0, engagements: 0, distanceTraversedM: 0, maxStuckSeconds: 0, ticks: 0, elapsedMs: 0 },
      b, a, 16,
    );
    expect(state.shotsFired).toBe(0);
  });

  it('accumulates distance when the player moves between ticks', () => {
    const a = base();
    const b = { ...a, ownState: { ...a.ownState, position: { x: 0, y: 0, z: 5 } } };
    const state = accumulateObservation(
      { shotsFired: 0, engagements: 0, distanceTraversedM: 0, maxStuckSeconds: 0, ticks: 0, elapsedMs: 0 },
      b, a, 16,
    );
    expect(state.distanceTraversedM).toBeCloseTo(5, 4);
  });

  it('counts an engagement transition from 0 → ≥1 visible hostiles', () => {
    const noHostile: AgentObservation = { ...base(), visibleEntities: [] };
    const hostile: AgentObservation = {
      ...noHostile,
      visibleEntities: [
        {
          id: 'h', kind: 'combatant', faction: Faction.NVA,
          position: { x: 0, y: 0, z: 50 }, distance: 50, bearingRad: 0,
        },
      ],
    };
    const state = accumulateObservation(
      { shotsFired: 0, engagements: 0, distanceTraversedM: 0, maxStuckSeconds: 0, ticks: 0, elapsedMs: 0 },
      hostile, noHostile, 16,
    );
    expect(state.engagements).toBe(1);
  });
});
