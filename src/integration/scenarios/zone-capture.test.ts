import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameScenario } from '../harness/GameScenario';
import { Faction } from '../../systems/combat/types';
import { ZoneState, CaptureZone } from '../../systems/world/ZoneManager';

// Stub HeightQueryCache
vi.mock('../../systems/terrain/HeightQueryCache', () => ({
  getHeightQueryCache: () => ({
    getHeightAt: (_x: number, _z: number) => 0,
  }),
}));

// Silence Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Zone Capture Integration', () => {
  let scenario: GameScenario;

  beforeEach(() => {
    scenario = new GameScenario(2000);
  });

  afterEach(() => {
    scenario.dispose();
  });

  /**
   * Helper: run capture logic for N seconds at 10 Hz (100ms steps).
   * Returns the zone for chaining/inspection.
   */
  function simulateCapture(
    zone: CaptureZone,
    occupants: { us: number; opfor: number },
    seconds: number,
  ): CaptureZone {
    const dt = 0.1;
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      scenario.captureLogic.updateZoneCaptureState(zone, occupants, dt);
    }
    return zone;
  }

  // ---------------------------------------------------------------------------
  // Uncontested capture: one faction only
  // ---------------------------------------------------------------------------

  it('zone with only US presence progresses toward US capture', () => {
    const zone = scenario.createZone('A', 'Alpha', new THREE.Vector3(0, 0, 0));

    // Simulate 15 seconds of US-only presence (dwell + capture)
    simulateCapture(zone, { us: 3, opfor: 0 }, 15);

    expect(zone.owner).toBe(Faction.US);
    expect(zone.state).toBe(ZoneState.US_CONTROLLED);
    expect(zone.captureProgress).toBe(100);
  });

  it('zone with only OPFOR presence progresses toward OPFOR capture', () => {
    const zone = scenario.createZone('B', 'Bravo', new THREE.Vector3(100, 0, 0));

    simulateCapture(zone, { us: 0, opfor: 3 }, 15);

    expect(zone.owner).toBe(Faction.NVA);
    expect(zone.state).toBe(ZoneState.OPFOR_CONTROLLED);
    expect(zone.captureProgress).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // Contested zone: no progress when equal
  // ---------------------------------------------------------------------------

  it('contested zone with equal forces does not change ownership', () => {
    const zone = scenario.createZone('C', 'Charlie', new THREE.Vector3(0, 0, 0));

    simulateCapture(zone, { us: 2, opfor: 2 }, 10);

    // Equal presence = zero net advantage, no progress
    expect(zone.owner).toBeNull();
    expect(zone.state).toBe(ZoneState.CONTESTED);
    expect(zone.captureProgress).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // More troops = faster capture
  // ---------------------------------------------------------------------------

  it('more troops means faster capture', () => {
    // Zone with 1 troop
    const zoneSlow = scenario.createZone('D1', 'DeltaSlow', new THREE.Vector3(0, 0, 0));

    // Zone with 5 troops (same captureSpeed)
    const zoneFast = scenario.createZone('D2', 'DeltaFast', new THREE.Vector3(100, 0, 0));

    // Simulate 5 seconds for both (enough to pass dwell but not enough for slow to complete)
    simulateCapture(zoneSlow, { us: 1, opfor: 0 }, 5);
    simulateCapture(zoneFast, { us: 5, opfor: 0 }, 5);

    // The zone with 5 troops should have progressed further
    expect(zoneFast.captureProgress).toBeGreaterThan(zoneSlow.captureProgress);
  });

  // ---------------------------------------------------------------------------
  // Captured zone triggers ticket bleed
  // ---------------------------------------------------------------------------

  it('captured zone triggers ticket bleed on opposing faction via TicketSystem', () => {
    // Set up two OPFOR-controlled zones
    const zoneA = scenario.createZone('A', 'Alpha', new THREE.Vector3(0, 0, 0), {
      owner: Faction.NVA,
      state: ZoneState.OPFOR_CONTROLLED,
      captureProgress: 100,
    });
    const zoneB = scenario.createZone('B', 'Bravo', new THREE.Vector3(100, 0, 0), {
      owner: Faction.NVA,
      state: ZoneState.OPFOR_CONTROLLED,
      captureProgress: 100,
    });

    // Calculate bleed rate using real ZoneCaptureLogic
    const bleedRates = scenario.captureLogic.calculateTicketBleedRate(scenario.zones);

    // OPFOR holds all zones, US should bleed
    expect(bleedRates.us).toBeGreaterThan(0);
    expect(bleedRates.opfor).toBe(0);
  });

  it('equally controlled zones produce no ticket bleed', () => {
    scenario.createZone('A', 'Alpha', new THREE.Vector3(0, 0, 0), {
      owner: Faction.US,
      state: ZoneState.US_CONTROLLED,
      captureProgress: 100,
    });
    scenario.createZone('B', 'Bravo', new THREE.Vector3(100, 0, 0), {
      owner: Faction.NVA,
      state: ZoneState.OPFOR_CONTROLLED,
      captureProgress: 100,
    });

    const bleedRates = scenario.captureLogic.calculateTicketBleedRate(scenario.zones);

    expect(bleedRates.us).toBe(0);
    expect(bleedRates.opfor).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Neutral zone requires full capture before ownership
  // ---------------------------------------------------------------------------

  it('neutral zone requires full capture (progress=100) before ownership changes', () => {
    const zone = scenario.createZone('E', 'Echo', new THREE.Vector3(0, 0, 0), {
      captureSpeed: 10,
    });

    // Simulate a short time - enough to pass dwell but not enough to reach 100
    simulateCapture(zone, { us: 1, opfor: 0 }, 2);

    // Progress should have started but zone not yet captured
    expect(zone.captureProgress).toBeGreaterThan(0);
    expect(zone.captureProgress).toBeLessThan(100);
    expect(zone.owner).toBeNull();

    // Continue until captured
    simulateCapture(zone, { us: 1, opfor: 0 }, 20);

    expect(zone.captureProgress).toBe(100);
    expect(zone.owner).toBe(Faction.US);
  });

  // ---------------------------------------------------------------------------
  // Owned zone can be neutralized and re-captured
  // ---------------------------------------------------------------------------

  it('owned zone can be neutralized and re-captured by opposing faction', () => {
    const zone = scenario.createZone('F', 'Foxtrot', new THREE.Vector3(0, 0, 0), {
      owner: Faction.US,
      state: ZoneState.US_CONTROLLED,
      captureProgress: 100,
      captureSpeed: 10,
    });

    // OPFOR forces neutralize the zone
    simulateCapture(zone, { us: 0, opfor: 3 }, 15);

    // Zone should be neutralized and then captured by OPFOR
    expect(zone.owner).toBe(Faction.NVA);
    expect(zone.state).toBe(ZoneState.OPFOR_CONTROLLED);
  });

  // ---------------------------------------------------------------------------
  // Home base zones are immune to capture
  // ---------------------------------------------------------------------------

  it('home base zones are immune to capture', () => {
    const zone = scenario.createZone('HQ', 'US HQ', new THREE.Vector3(0, 0, 0), {
      owner: Faction.US,
      state: ZoneState.US_CONTROLLED,
      captureProgress: 100,
      isHomeBase: true,
    });

    // Enemies flood the zone
    simulateCapture(zone, { us: 0, opfor: 10 }, 20);

    // Home base should remain US
    expect(zone.owner).toBe(Faction.US);
    expect(zone.captureProgress).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // Cross-system: capture flow affects ticket bleed
  // ---------------------------------------------------------------------------

  it('capturing a zone changes ticket bleed calculation', () => {
    // Start: OPFOR controls both zones (majority -> US bleeds)
    const zoneA = scenario.createZone('A', 'Alpha', new THREE.Vector3(0, 0, 0), {
      owner: Faction.NVA,
      state: ZoneState.OPFOR_CONTROLLED,
      captureProgress: 100,
    });
    const zoneB = scenario.createZone('B', 'Bravo', new THREE.Vector3(200, 0, 0), {
      owner: Faction.NVA,
      state: ZoneState.OPFOR_CONTROLLED,
      captureProgress: 100,
    });

    let rates = scenario.captureLogic.calculateTicketBleedRate(scenario.zones);
    // OPFOR holds both - US bleeds
    expect(rates.us).toBeGreaterThan(0);
    expect(rates.opfor).toBe(0);

    // US captures zone A -> equal control
    zoneA.owner = Faction.US;
    zoneA.state = ZoneState.US_CONTROLLED;
    zoneA.captureProgress = 100;

    rates = scenario.captureLogic.calculateTicketBleedRate(scenario.zones);
    // Equal control - no bleed for either
    expect(rates.us).toBe(0);
    expect(rates.opfor).toBe(0);

    // US captures zone B as well -> US has all zones
    zoneB.owner = Faction.US;
    zoneB.state = ZoneState.US_CONTROLLED;

    rates = scenario.captureLogic.calculateTicketBleedRate(scenario.zones);
    // US controls all zones - OPFOR bleeds, US does not
    expect(rates.us).toBe(0);
    expect(rates.opfor).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Dwell timer prevents instant capture
  // ---------------------------------------------------------------------------

  it('dwell timer prevents capture progress during initial presence', () => {
    const zone = scenario.createZone('G', 'Golf', new THREE.Vector3(0, 0, 0), {
      captureSpeed: 100, // Very fast capture speed
    });

    // Simulate just 0.5 seconds (under the 1.0s dwell threshold)
    simulateCapture(zone, { us: 1, opfor: 0 }, 0.5);

    // No progress should have occurred despite high captureSpeed
    expect(zone.captureProgress).toBe(0);
    expect(zone.owner).toBeNull();
  });
});
