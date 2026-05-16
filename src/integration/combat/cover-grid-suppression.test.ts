import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameScenario } from '../harness/GameScenario';
import { AIStateEngage } from '../../systems/combat/ai/AIStateEngage';
import { CombatantState, Faction } from '../../systems/combat/types';
import { FrameTimingTracker } from '../../systems/debug/FrameTimingTracker';
import { SeededRandom } from '../../core/SeededRandom';

// L3 small-scenario test (per docs/TESTING.md): exercises the full squad
// suppression pipeline end-to-end. The cover spatial-grid (cycle
// KONVEYER-11 R1: cover-spatial-grid-cpu + engage-state-grid-consumer)
// is an *implementation* of the existing cover-selection contract — this
// test asserts the *observable* contract:
//
//   1. Squad-suppression flips assigned NPCs into the expected states
//      (one suppressor, others ADVANCING with flank destinations).
//   2. Cover-target selection produces a stable set for a seeded
//      scenario (determinism guard from the cycle brief: §"Critical
//      Process Notes" 2).
//   3. Per-call `Combat.AI` cost stays under budget — guarding against
//      either sibling task being reverted, which would reintroduce the
//      synchronous cover-search peak (~954 ms documented in the
//      cycle brief).
//
// Budget choice: 5 ms p99 per suppression flip. This is the "generous
// ceiling" the cycle brief calls for (§"Method 2") when the precise
// post-fix expected value is not yet available from the
// engage-state-grid-consumer PR. The current synchronous baseline
// peaks at ~954 ms, so 5 ms still catches a full revert by orders of
// magnitude. Tighten once the consumer-wiring perf trace lands.

const SUPPRESSION_BUDGET_MS = 5;
const DETERMINISM_SEED = 0xC0FFEE;

// Stub HeightQueryCache so SquadManager doesn't depend on noise generation.
vi.mock('../../systems/terrain/HeightQueryCache', () => ({
  getHeightQueryCache: () => ({
    getHeightAt: (_x: number, _z: number) => 0,
  }),
}));

// Silence Logger to keep test output clean.
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Cover Grid Squad-Suppression (KONVEYER-11 R1 regression guard)', () => {
  let scenario: GameScenario;
  let aiStateEngage: AIStateEngage;
  let tracker: FrameTimingTracker;

  beforeEach(() => {
    // Seed the ambient PRNG so SquadManager/CombatantFactory random
    // choices are reproducible across runs. The brief's hard-stop
    // "determinism regression" check needs this floor.
    SeededRandom.beginSession(DETERMINISM_SEED);
    scenario = new GameScenario(2000);
    aiStateEngage = new AIStateEngage();
    aiStateEngage.setSquads(scenario.squadManager.getAllSquads());
    tracker = new FrameTimingTracker();
  });

  afterEach(() => {
    scenario.dispose();
    SeededRandom.endSession();
  });

  // ---------------------------------------------------------------------------
  // Scenario: 12-NPC squad converges on a known threat origin.
  // ---------------------------------------------------------------------------

  function spawnSuppressionScenario() {
    // 12 NVA in a single squad — large enough to exceed the 3-member
    // SQUAD_MIN_SIZE_FOR_SUPPRESSION gate; small enough to keep the
    // scenario tractable.
    const squadCenter = new THREE.Vector3(0, 0, 0);
    const { squad, members } = scenario.spawnSquad(Faction.NVA, squadCenter, 12);

    // Make sure the AIStateEngage instance sees the same squad map the
    // scenario's SquadManager owns. setSquads() takes a live reference.
    aiStateEngage.setSquads(scenario.squadManager.getAllSquads());

    // US target combatant inside the suppression range band
    // (SUPPRESSION_MIN_DISTANCE..MAX_DISTANCE = 30..80m).
    const targetPos = new THREE.Vector3(50, 0, 0);
    const target = scenario.spawnCombatant(Faction.US, targetPos);

    // Wire each squad member into a suppressible state: alive, with a
    // target, recently-updated. Position them so distance-to-target is
    // inside the band.
    for (const m of members) {
      m.target = target;
      m.state = CombatantState.ENGAGING;
      m.health = m.maxHealth;
    }

    return { squad, members, target, targetPos };
  }

  // Stub cover-finder that returns a known cover position offset from the
  // member, so we can assert deterministic cover-target selection. The
  // real cover-system implementation (synchronous scan today,
  // spatial-grid after R1 lands) is what the cycle brief is replacing —
  // either implementation must call findNearestCover with the threat
  // position and accept the returned point.
  function makeFindNearestCover(callLog: Array<{ from: THREE.Vector3; threat: THREE.Vector3 }>) {
    return (combatant: { position: THREE.Vector3 }, threatPosition: THREE.Vector3) => {
      callLog.push({
        from: combatant.position.clone(),
        threat: threatPosition.clone(),
      });
      // Cover spot 4m behind the member relative to the threat.
      const toThreat = threatPosition.clone().sub(combatant.position).normalize();
      return combatant.position.clone().sub(toThreat.multiplyScalar(4));
    };
  }

  // ---------------------------------------------------------------------------
  // Behavior: full squad-suppression flow assigns the expected states.
  // ---------------------------------------------------------------------------

  it('initiates squad suppression with one suppressor and the remaining members flanking', () => {
    const { squad, members, targetPos } = spawnSuppressionScenario();
    const coverCalls: Array<{ from: THREE.Vector3; threat: THREE.Vector3 }> = [];
    const findNearestCover = makeFindNearestCover(coverCalls);

    // Leader triggers the squad suppression on behalf of the squad.
    const leader = members.find(m => m.squadRole === 'leader')!;
    expect(leader).toBeDefined();

    aiStateEngage.initiateSquadSuppression(
      leader,
      targetPos,
      scenario.combatants,
      findNearestCover,
    );

    // Observable outcome 1: at least one suppressor was assigned.
    const suppressors = members.filter(m => m.state === CombatantState.SUPPRESSING);
    expect(suppressors.length).toBeGreaterThanOrEqual(1);

    // Observable outcome 2: the rest of the squad advances (flanking).
    const flankers = members.filter(m => m.state === CombatantState.ADVANCING);
    expect(flankers.length).toBeGreaterThanOrEqual(1);
    expect(suppressors.length + flankers.length).toBe(members.length);

    // Observable outcome 3: every flanker has a flank destination set and
    // is flagged as a flanking move.
    for (const f of flankers) {
      expect(f.destinationPoint).toBeDefined();
      expect(f.isFlankingMove).toBe(true);
    }

    // Observable outcome 4: the cover-finder was consulted at least once
    // for flank cover. (Capped at MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION
    // = 2 inside AIStateEngage; the post-cap searches are skipped by
    // design.) This guards against a future refactor accidentally
    // bypassing the cover query entirely.
    expect(coverCalls.length).toBeGreaterThan(0);

    // Touch the squad reference so the test does not flag it as unused.
    expect(squad.members.length).toBe(12);
  });

  // ---------------------------------------------------------------------------
  // Determinism: same scenario -> same suppressor/flanker assignment. The
  // assignment is driven by leader-role + member-index, neither of which is
  // random. Position-level determinism is *not* asserted here because
  // SquadManager.calculateFormationPosition() uses raw Math.random() for
  // wedge offset jitter — that's a documented reviewer follow-up from
  // cycle-2026-05-08 (memory/project_perception_and_stuck_2026-05-08.md),
  // not in this cycle's scope. The cycle brief's hard-stop §"Determinism
  // regression" applies to *grid wiring* not introducing *new* sources of
  // non-determinism beyond those pre-existing ones.
  // ---------------------------------------------------------------------------

  it('produces a stable suppressor/flanker state-assignment across runs', () => {
    function runOnce(): string[] {
      SeededRandom.endSession();
      SeededRandom.beginSession(DETERMINISM_SEED);
      scenario.dispose();
      scenario = new GameScenario(2000);
      aiStateEngage = new AIStateEngage();
      aiStateEngage.setSquads(scenario.squadManager.getAllSquads());

      const { members, targetPos } = spawnSuppressionScenario();
      const coverCalls: Array<{ from: THREE.Vector3; threat: THREE.Vector3 }> = [];
      const findNearestCover = makeFindNearestCover(coverCalls);
      const leader = members.find(m => m.squadRole === 'leader')!;

      aiStateEngage.initiateSquadSuppression(
        leader,
        targetPos,
        scenario.combatants,
        findNearestCover,
      );

      return members.map(m => m.state as string);
    }

    const first = runOnce();
    const second = runOnce();

    expect(first.length).toBe(12);
    expect(second).toEqual(first);

    // And the pattern itself matches the AIStateEngage rule: leader (index 0)
    // and index 1 suppress; everyone else advances. If a refactor flips
    // that rule (e.g. moving suppression to indices 0/2 or scrubbing the
    // index-based gating), the snapshot breaks here.
    expect(first[0]).toBe(CombatantState.SUPPRESSING);
    expect(first[1]).toBe(CombatantState.SUPPRESSING);
    for (let i = 2; i < first.length; i++) {
      expect(first[i]).toBe(CombatantState.ADVANCING);
    }
  });

  // ---------------------------------------------------------------------------
  // Perf budget: per-suppression Combat.AI cost stays under SUPPRESSION_BUDGET_MS.
  // ---------------------------------------------------------------------------

  it('keeps per-suppression Combat.AI cost under the post-fix budget', () => {
    const { members, targetPos } = spawnSuppressionScenario();
    const coverCalls: Array<{ from: THREE.Vector3; threat: THREE.Vector3 }> = [];
    const findNearestCover = makeFindNearestCover(coverCalls);
    const leader = members.find(m => m.squadRole === 'leader')!;

    // Wire AIStateEngage's method timer through FrameTimingTracker so we
    // can read the resulting Combat.AI bucket back out via the same
    // surface the runtime uses (PerformanceTelemetry consumes
    // getSystemBreakdown()).
    aiStateEngage.setMethodTimer((name, fn) => {
      tracker.beginSystem(`Combat.AI.${name}`);
      try {
        return fn();
      } finally {
        tracker.endSystem(`Combat.AI.${name}`);
      }
    });

    // Bracket the suppression call inside a Combat.AI frame so the
    // tracker attributes the cost to the same bucket the runtime uses.
    tracker.beginFrame();
    tracker.beginSystem('Combat.AI');
    const startMs = performance.now();
    aiStateEngage.initiateSquadSuppression(
      leader,
      targetPos,
      scenario.combatants,
      findNearestCover,
    );
    const elapsedMs = performance.now() - startMs;
    tracker.endSystem('Combat.AI');
    tracker.endFrame();

    // Direct wall-clock guard: the synchronous-scan baseline peaks at
    // ~954 ms (cycle brief). 5 ms catches a revert by ~190x.
    expect(elapsedMs).toBeLessThan(SUPPRESSION_BUDGET_MS);

    // Tracker surface guard: the Combat.AI bucket must surface in the
    // breakdown and be under budget. This guards against
    // PerformanceTelemetry losing the bucket via a rename or refactor.
    const breakdown = tracker.getSystemBreakdown();
    const combatAI = breakdown.find(e => e.name === 'Combat.AI');
    expect(combatAI).toBeDefined();
    expect(combatAI!.lastMs).toBeLessThan(SUPPRESSION_BUDGET_MS);
  });

  // ---------------------------------------------------------------------------
  // Cover-search call cap: MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION = 2.
  // ---------------------------------------------------------------------------

  it('caps flank cover-searches so a 12-member squad does not run 11 scans', () => {
    const { members, targetPos } = spawnSuppressionScenario();
    const coverCalls: Array<{ from: THREE.Vector3; threat: THREE.Vector3 }> = [];
    const findNearestCover = makeFindNearestCover(coverCalls);
    const leader = members.find(m => m.squadRole === 'leader')!;

    aiStateEngage.initiateSquadSuppression(
      leader,
      targetPos,
      scenario.combatants,
      findNearestCover,
    );

    // The internal cap (MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION = 2)
    // exists precisely so the synchronous scan can't fan out to N
    // searches per suppression. Once the spatial-grid lands, this cap
    // may be relaxed — when it is, update the assertion accordingly.
    // Until then, this guards against accidental fan-out.
    expect(coverCalls.length).toBeLessThanOrEqual(2);

    // Telemetry should record the skip reasons.
    const telemetry = aiStateEngage.getCloseEngagementTelemetry();
    expect(telemetry.suppressionFlankDestinationComputations).toBeGreaterThan(0);
    // Either reuse-skips or cap-skips should have fired for the
    // remainder of the flanker pool (≥ flankers - 2).
    const skips = telemetry.suppressionFlankCoverSearchReuseSkips +
      telemetry.suppressionFlankCoverSearchCapSkips;
    const flankerCount = members.filter(m => m.state === CombatantState.ADVANCING).length;
    expect(skips).toBeGreaterThanOrEqual(Math.max(0, flankerCount - 2));
  });
});
