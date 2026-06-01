import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { initRecon, updateRecon } from './ReconMission';
import { GameEventBus } from '../../core/GameEventBus';
import { createAirSupportMission, flatTerrainHeight } from '../../test-utils/airSupportMission';

/**
 * ReconMission — L2 behavior tests.
 *
 * Observable contract (no tuning constants asserted):
 *  - the recon aircraft makes a straight flyover above the target;
 *  - when it passes over the target area it queries nearby enemies once and, if
 *    any are present, emits a `recon_reveal` event carrying the reveal position
 *    and the count of detected enemies;
 *  - it reveals at most once per mission;
 *  - with no enemies present it emits nothing;
 *  - it hands off to the 'outbound' phase at the end of the flyover.
 */

function makeCombatantSystem(enemyIds: string[]) {
  return {
    querySpatialRadius: vi.fn().mockReturnValue(enemyIds),
  } as any;
}

/** Capture recon_reveal events. GameEventBus is queued; flush to deliver. */
function captureReveals() {
  const events: Array<{ position: THREE.Vector3; radius: number; enemyCount: number }> = [];
  const unsub = GameEventBus.subscribe('recon_reveal', (e) => events.push(e));
  return { events, unsub, flush: () => GameEventBus.flush() };
}

function runRecon(opts: {
  combatantSystem?: any;
  seconds?: number;
} = {}) {
  const mission = createAirSupportMission('recon', { x: 400, z: -200 });
  initRecon(mission);
  const dt = 0.1;
  const steps = Math.round((opts.seconds ?? 20) / dt);
  for (let i = 0; i < steps; i++) {
    mission.elapsed += dt;
    updateRecon(mission, dt, opts.combatantSystem, flatTerrainHeight());
    if (mission.state === 'outbound') break;
  }
  return mission;
}

describe('ReconMission', () => {
  let cap: ReturnType<typeof captureReveals>;

  beforeEach(() => {
    GameEventBus.clear();
    cap = captureReveals();
  });

  afterEach(() => {
    cap.unsub();
    GameEventBus.clear();
  });

  it('initializes as not-yet-revealed', () => {
    const mission = createAirSupportMission('recon');
    initRecon(mission);
    expect(mission.missionData.revealed).toBe(0);
  });

  it('flies the aircraft above terrain across the target', () => {
    const mission = createAirSupportMission('recon', { x: 0, z: 0 });
    initRecon(mission);
    mission.elapsed = 0.01;
    updateRecon(mission, 0.01, makeCombatantSystem([]), flatTerrainHeight(60));
    expect(mission.aircraft.position.y).toBeGreaterThan(60);
  });

  it('advances the aircraft along the flight path over time', () => {
    const mission = createAirSupportMission('recon', { x: 0, z: 0 });
    initRecon(mission);
    mission.elapsed = 0.5;
    updateRecon(mission, 0.5, makeCombatantSystem([]), flatTerrainHeight());
    const early = mission.aircraft.position.z;
    mission.elapsed = 6;
    updateRecon(mission, 0.5, makeCombatantSystem([]), flatTerrainHeight());
    const late = mission.aircraft.position.z;
    expect(late).toBeGreaterThan(early);
  });

  it('emits a recon_reveal when passing over enemies', () => {
    runRecon({ combatantSystem: makeCombatantSystem(['e1', 'e2', 'e3']) });
    cap.flush();
    expect(cap.events.length).toBe(1);
    expect(cap.events[0].enemyCount).toBe(3);
  });

  it('reveals at the target position', () => {
    runRecon({ combatantSystem: makeCombatantSystem(['e1']) });
    cap.flush();
    expect(cap.events.length).toBe(1);
    expect(cap.events[0].position.x).toBeCloseTo(400, 1);
    expect(cap.events[0].position.z).toBeCloseTo(-200, 1);
    expect(cap.events[0].radius).toBeGreaterThan(0);
  });

  it('reveals at most once per mission', () => {
    const cs = makeCombatantSystem(['e1', 'e2']);
    runRecon({ combatantSystem: cs, seconds: 30 });
    cap.flush();
    expect(cap.events.length).toBe(1);
  });

  it('marks the mission as revealed after passing the target', () => {
    const mission = runRecon({ combatantSystem: makeCombatantSystem(['e1']) });
    expect(mission.missionData.revealed).toBe(1);
  });

  it('does not emit a reveal when no enemies are present', () => {
    runRecon({ combatantSystem: makeCombatantSystem([]) });
    cap.flush();
    expect(cap.events.length).toBe(0);
  });

  it('queries the combat system for nearby enemies', () => {
    const cs = makeCombatantSystem(['e1']);
    runRecon({ combatantSystem: cs });
    expect(cs.querySpatialRadius).toHaveBeenCalled();
  });

  it('transitions to outbound at the end of the flyover', () => {
    const mission = runRecon({ combatantSystem: makeCombatantSystem([]), seconds: 30 });
    expect(mission.state).toBe('outbound');
  });

  it('does not crash without a combatant system', () => {
    expect(() => runRecon({ combatantSystem: undefined })).not.toThrow();
  });
});
