import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TicketSystem, GameState, TicketBleedRate } from './TicketSystem';
import { Faction } from '../combat/types';
import { ZoneManager, CaptureZone, ZoneState } from './ZoneManager';
import { Logger } from '../../utils/Logger';

// Mock Logger to prevent console output during tests
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper to create a mock ZoneManager
const createMockZoneManager = (zones: CaptureZone[] = []): ZoneManager => {
  const mockZoneManager: Partial<ZoneManager> = {
    getAllZones: vi.fn(() => zones),
    getZoneById: vi.fn((id: string) => zones.find(z => z.id === id)),
  };
  return mockZoneManager as ZoneManager;
};

// Helper to create a mock CaptureZone
const createMockCaptureZone = (
  id: string,
  state: ZoneState = ZoneState.NEUTRAL,
  isHomeBase: boolean = false,
): CaptureZone => ({
  id,
  name: `Zone ${id}`,
  position: { x: 0, y: 0, z: 0 } as any, // Mock enough for type
  radius: 10,
  height: 5,
  owner: null,
  state,
  captureProgress: 0,
  captureSpeed: 0,
  isHomeBase,
});

describe('TicketSystem', () => {
  let ticketSystem: TicketSystem;
  let mockZoneManager: ZoneManager;

  beforeEach(() => {
    // Reset mocks and create a new TicketSystem before each test
    vi.clearAllMocks();
    ticketSystem = new TicketSystem();
    mockZoneManager = createMockZoneManager();
    ticketSystem.setZoneManager(mockZoneManager);
  });

  describe('Initialization', () => {
    it('should initialize with default ticket values', async () => {
      await ticketSystem.init();
      expect(ticketSystem.getTickets(Faction.US)).toBe(300);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(300);
      expect(ticketSystem.isGameActive()).toBe(true);
      expect(ticketSystem.getGameState().phase).toBe('SETUP');
    });

    it('should allow setting custom max tickets before init', async () => {
      ticketSystem.setMaxTickets(500);
      await ticketSystem.init();
      expect(ticketSystem.getTickets(Faction.US)).toBe(500);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(500);
    });

    it('should initialize kill counts to zero', async () => {
      await ticketSystem.init();
      expect(ticketSystem.getKills(Faction.US)).toBe(0);
      expect(ticketSystem.getKills(Faction.OPFOR)).toBe(0);
    });
  });

  describe('Ticket Deduction', () => {
    it('should deduct tickets for the opposing faction when a US combatant dies', () => {
      ticketSystem.onCombatantDeath(Faction.US);
      expect(ticketSystem.getTickets(Faction.US)).toBe(298); // Default death penalty is 2
      expect(ticketSystem.getKills(Faction.OPFOR)).toBe(1);
    });

    it('should deduct tickets for the opposing faction when an OPFOR combatant dies', () => {
      ticketSystem.onCombatantDeath(Faction.OPFOR);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(298); // Default death penalty is 2
      expect(ticketSystem.getKills(Faction.US)).toBe(1);
    });

    it('should not deduct tickets below zero', () => {
      ticketSystem.setDeathPenalty(350); // Set a large penalty
      ticketSystem.onCombatantDeath(Faction.US);
      expect(ticketSystem.getTickets(Faction.US)).toBe(0);
    });

    it('should deduct custom death penalty amount', () => {
      ticketSystem.setDeathPenalty(5);
      ticketSystem.onCombatantDeath(Faction.US);
      expect(ticketSystem.getTickets(Faction.US)).toBe(295);
    });

    it('should not deduct tickets if game is not active', () => {
      ticketSystem.forceEndGame(Faction.US);
      ticketSystem.onCombatantDeath(Faction.US);
      expect(ticketSystem.getTickets(Faction.US)).toBe(300); // Should remain default
      expect(ticketSystem.getKills(Faction.OPFOR)).toBe(0);
    });
  });

  describe('TDM Mode', () => {
    beforeEach(() => {
      ticketSystem.setTDMMode(true, 50); // Enable TDM with a target of 50 kills
    });

    it('should report correct mode status', () => {
      expect(ticketSystem.isTDMMode()).toBe(true);
      expect(ticketSystem.getKillTarget()).toBe(50);
    });

    it('should track kills instead of deducting tickets on death', () => {
      expect(ticketSystem.getTickets(Faction.US)).toBe(0); // Kills start at 0 in TDM
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(0);

      ticketSystem.onCombatantDeath(Faction.US); // OPFOR gets a kill
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(1);
      expect(ticketSystem.getKills(Faction.OPFOR)).toBe(1);
      expect(ticketSystem.getTickets(Faction.US)).toBe(0); // US tickets (kills) still 0

      ticketSystem.onCombatantDeath(Faction.OPFOR); // US gets a kill
      expect(ticketSystem.getTickets(Faction.US)).toBe(1);
      expect(ticketSystem.getKills(Faction.US)).toBe(1);
    });

    it('should end game when US reaches kill target', () => {
      const gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);

      // Advance game to COMBAT phase
      ticketSystem.update(ticketSystem['setupDuration'] + 0.1);

      for (let i = 0; i < 49; i++) {
        ticketSystem.onCombatantDeath(Faction.OPFOR); // US gets 49 kills
      }
      expect(ticketSystem.isGameActive()).toBe(true); // Game not ended yet

      ticketSystem.onCombatantDeath(Faction.OPFOR); // US gets 50th kill (triggers checkVictoryConditions -> endGame)

      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.US);
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.US, expect.any(Object));
      expect(gameEndCallback.mock.calls[0][1].phase).toBe('ENDED');
    });

    it('should end game when OPFOR reaches kill target', () => {
      const gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);

      // Advance game to COMBAT phase
      ticketSystem.update(ticketSystem['setupDuration'] + 0.1);

      for (let i = 0; i < 49; i++) {
        ticketSystem.onCombatantDeath(Faction.US); // OPFOR gets 49 kills
      }
      expect(ticketSystem.isGameActive()).toBe(true); // Game not ended yet

      ticketSystem.onCombatantDeath(Faction.US); // OPFOR gets 50th kill (triggers checkVictoryConditions -> endGame)

      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.OPFOR);
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.OPFOR, expect.any(Object));
      expect(gameEndCallback.mock.calls[0][1].phase).toBe('ENDED');
    });

    it('should reset kills when restarting match in TDM mode', () => {
      ticketSystem.onCombatantDeath(Faction.US); // OPFOR gets 1 kill
      ticketSystem.onCombatantDeath(Faction.OPFOR); // US gets 1 kill

      expect(ticketSystem.getKills(Faction.US)).toBe(1);
      expect(ticketSystem.getKills(Faction.OPFOR)).toBe(1);

      ticketSystem.restartMatch();

      expect(ticketSystem.getKills(Faction.US)).toBe(0);
      expect(ticketSystem.getKills(Faction.OPFOR)).toBe(0);
      expect(ticketSystem.isGameActive()).toBe(true);
      expect(ticketSystem.getGameState().phase).toBe('SETUP');
    });
  });

  describe('Zone Control Effects (Ticket Bleed)', () => {
    const setupZones = (zones: CaptureZone[], initialUsTickets = 300, initialOpforTickets = 300) => {
      mockZoneManager = createMockZoneManager(zones);
      ticketSystem.setZoneManager(mockZoneManager);
      ticketSystem.setMaxTickets(initialUsTickets); // Also resets current tickets to initialUsTickets
      ticketSystem['usTickets'] = initialUsTickets; // Explicitly set current tickets
      ticketSystem['opforTickets'] = initialOpforTickets; // Explicitly set current tickets

      // Advance matchDuration past setupDuration to enter COMBAT phase
      ticketSystem['gameState'].matchDuration = ticketSystem['setupDuration'] + 0.1;
      ticketSystem['gameState'].phase = 'COMBAT';
    };

    it('should have no ticket bleed if no zones are managed', () => {
      ticketSystem.setZoneManager(undefined); // Explicitly remove zone manager
      ticketSystem.update(ticketSystem['setupDuration'] + 1); // Move to combat phase
      ticketSystem['gameState'].phase = 'COMBAT';

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      expect(ticketSystem.getTickets(Faction.US)).toBe(initialUSTickets);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(initialOpforTickets);
      expect(ticketSystem.getTicketBleedRate()).toEqual({ usTickets: 0, opforTickets: 0, bleedPerSecond: 0 });
    });

    it('should apply ticket bleed to both factions if all zones are neutral (less than 50% control)', () => {
      const zones = [createMockCaptureZone('A', ZoneState.NEUTRAL), createMockCaptureZone('B', ZoneState.NEUTRAL)];
      setupZones(zones);

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      // 0/2 US controlled (0%), 0/2 OPFOR controlled (0%)
      // Both bleed: (0.5 - 0) * 2 * baseBleedRate = 1.0 * baseBleedRate
      expect(ticketSystem.getTickets(Faction.US)).toBeCloseTo(initialUSTickets - 1.0 * ticketSystem['baseBleedRate']);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBeCloseTo(initialOpforTickets - 1.0 * ticketSystem['baseBleedRate']);
      expect(ticketSystem.getTicketBleedRate().usTickets).toBeCloseTo(1.0 * ticketSystem['baseBleedRate']);
      expect(ticketSystem.getTicketBleedRate().opforTickets).toBeCloseTo(1.0 * ticketSystem['baseBleedRate']);
    });

    it('should have no ticket bleed if zones are equally controlled', () => {
      const zones = [
        createMockCaptureZone('A', ZoneState.US_CONTROLLED),
        createMockCaptureZone('B', ZoneState.OPFOR_CONTROLLED),
      ];
      setupZones(zones);

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      expect(ticketSystem.getTickets(Faction.US)).toBeCloseTo(initialUSTickets);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBeCloseTo(initialOpforTickets);
      expect(ticketSystem.getTicketBleedRate()).toEqual({ usTickets: 0, opforTickets: 0, bleedPerSecond: 0 });
    });

    it('should apply ticket bleed to US if OPFOR controls more zones', () => {
      const zones = [
        createMockCaptureZone('A', ZoneState.OPFOR_CONTROLLED),
        createMockCaptureZone('B', ZoneState.OPFOR_CONTROLLED),
        createMockCaptureZone('C', ZoneState.NEUTRAL),
      ];
      setupZones(zones);

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      // 2/3 OPFOR controlled (66%), 0/3 US controlled (0%)
      // US bleed rate: (0.5 - 0) * 2 * baseBleedRate = 1.0 * baseBleedRate
      expect(ticketSystem.getTickets(Faction.US)).toBeCloseTo(initialUSTickets - 1.0 * ticketSystem['baseBleedRate']);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBeCloseTo(initialOpforTickets);
      expect(ticketSystem.getTicketBleedRate().usTickets).toBeCloseTo(1.0 * ticketSystem['baseBleedRate']);
      expect(ticketSystem.getTicketBleedRate().opforTickets).toBeCloseTo(0);
    });

    it('should apply ticket bleed to OPFOR if US controls more zones', () => {
      const zones = [
        createMockCaptureZone('A', ZoneState.US_CONTROLLED),
        createMockCaptureZone('B', ZoneState.US_CONTROLLED),
        createMockCaptureZone('C', ZoneState.NEUTRAL),
      ];
      setupZones(zones);

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      // 2/3 US controlled (66%), 0/3 OPFOR controlled (0%)
      // OPFOR bleed rate: (0.5 - 0) * 2 * baseBleedRate = 1.0 * baseBleedRate
      expect(ticketSystem.getTickets(Faction.US)).toBeCloseTo(initialUSTickets);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBeCloseTo(initialOpforTickets - 1.0 * ticketSystem['baseBleedRate']);
      expect(ticketSystem.getTicketBleedRate().usTickets).toBeCloseTo(0);
      expect(ticketSystem.getTicketBleedRate().opforTickets).toBeCloseTo(1.0 * ticketSystem['baseBleedRate']);
    });

    it('should apply accelerated ticket bleed if US controls all zones', () => {
      const zones = [
        createMockCaptureZone('A', ZoneState.US_CONTROLLED),
        createMockCaptureZone('B', ZoneState.US_CONTROLLED),
      ];
      setupZones(zones);

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      // OPFOR bleed rate should be baseBleedRate * 2
      expect(ticketSystem.getTickets(Faction.US)).toBeCloseTo(initialUSTickets);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBeCloseTo(initialOpforTickets - 2 * ticketSystem['baseBleedRate']);
      expect(ticketSystem.getTicketBleedRate().opforTickets).toBeCloseTo(2 * ticketSystem['baseBleedRate']);
    });

    it('should apply accelerated ticket bleed if OPFOR controls all zones', () => {
      const zones = [
        createMockCaptureZone('A', ZoneState.OPFOR_CONTROLLED),
        createMockCaptureZone('B', ZoneState.OPFOR_CONTROLLED),
      ];
      setupZones(zones);

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      // US bleed rate should be baseBleedRate * 2
      expect(ticketSystem.getTickets(Faction.US)).toBeCloseTo(initialUSTickets - 2 * ticketSystem['baseBleedRate']);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBeCloseTo(initialOpforTickets);
      expect(ticketSystem.getTicketBleedRate().usTickets).toBeCloseTo(2 * ticketSystem['baseBleedRate']);
    });

    it('should not apply ticket bleed if in SETUP phase', () => {
      const zones = [
        createMockCaptureZone('A', ZoneState.OPFOR_CONTROLLED),
      ];
      mockZoneManager = createMockZoneManager(zones);
      ticketSystem.setZoneManager(mockZoneManager);

      // Force SETUP phase by ensuring matchDuration is less than setupDuration
      ticketSystem['gameState'].matchDuration = ticketSystem['setupDuration'] / 2;
      ticketSystem['gameState'].phase = 'SETUP'; // Explicitly set to SETUP

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      // Tickets should not change even if getTicketBleedRate returns a value
      expect(ticketSystem.getTickets(Faction.US)).toBe(initialUSTickets);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(initialOpforTickets);
    });

    it('should not apply ticket bleed if TDM mode is active', () => {
      const zones = [
        createMockCaptureZone('A', ZoneState.OPFOR_CONTROLLED),
      ];
      mockZoneManager = createMockZoneManager(zones);
      ticketSystem.setZoneManager(mockZoneManager);
      ticketSystem.setTDMMode(true, 50); // Enable TDM

      // Ensure game is in COMBAT phase for bleed calculation
      ticketSystem.update(ticketSystem['setupDuration'] + 0.1);
      ticketSystem['gameState'].phase = 'COMBAT';

      const initialUSTickets = ticketSystem.getTickets(Faction.US);
      const initialOpforTickets = ticketSystem.getTickets(Faction.OPFOR);
      ticketSystem.update(1); // 1 second passes

      // Tickets should not change even if getTicketBleedRate returns a value
      expect(ticketSystem.getTickets(Faction.US)).toBe(initialUSTickets);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(initialOpforTickets);
    });

    it('should not bleed tickets below zero', () => {
      const zones = [
        createMockCaptureZone('A', ZoneState.OPFOR_CONTROLLED),
        createMockCaptureZone('B', ZoneState.OPFOR_CONTROLLED),
      ];
      mockZoneManager = createMockZoneManager(zones);
      ticketSystem.setZoneManager(mockZoneManager);

      // Ensure game is in COMBAT phase for bleed calculation
      // Directly set phase and matchDuration to avoid applying bleed during setup
      ticketSystem['gameState'].matchDuration = ticketSystem['setupDuration'] + 0.1;
      ticketSystem['gameState'].phase = 'COMBAT';

      ticketSystem['usTickets'] = 1; // Set US tickets low (bleeds at 2x rate = 2 tickets/sec)
      ticketSystem.update(1); // 1 second passes, US should bleed 2 tickets

      expect(ticketSystem.getTickets(Faction.US)).toBe(0);
    });

    it('should calculate correct bleed rates for mixed control', () => {
      // 3 zones: 1 US, 1 OPFOR, 1 neutral
      const zones = [
        createMockCaptureZone('A', ZoneState.US_CONTROLLED),
        createMockCaptureZone('B', ZoneState.OPFOR_CONTROLLED),
        createMockCaptureZone('C', ZoneState.NEUTRAL),
      ];
      setupZones(zones);

      // 1/3 US controlled, 1/3 OPFOR controlled. Both < 0.5 ratio
      // US control ratio = 0.333, OPFOR control ratio = 0.333
      // US bleed = (0.5 - 0.333) * 2 * baseBleedRate = 0.333 * baseBleedRate
      // OPFOR bleed = (0.5 - 0.333) * 2 * baseBleedRate = 0.333 * baseBleedRate
      const expectedBleed = (0.5 - (1/3)) * 2 * ticketSystem['baseBleedRate'];

      const bleedRates = ticketSystem.getTicketBleedRate();
      expect(bleedRates.usTickets).toBeCloseTo(expectedBleed);
      expect(bleedRates.opforTickets).toBeCloseTo(expectedBleed);
      expect(bleedRates.bleedPerSecond).toBeCloseTo(expectedBleed);
    });
  });

  describe('Win Condition Detection', () => {
    let gameEndCallback: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);
    });

    it('should declare OPFOR winner if US tickets deplete', () => {
      const gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);

      // Advance game to COMBAT phase
      ticketSystem.update(ticketSystem['setupDuration'] + 0.1);

      ticketSystem['usTickets'] = 1;
      ticketSystem.onCombatantDeath(Faction.US); // Deduct last 2 tickets (triggers checkVictoryConditions -> endGame)

      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.OPFOR);
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.OPFOR, expect.any(Object));
      expect(gameEndCallback.mock.calls[0][1].phase).toBe('ENDED');
    });

    it('should declare US winner if OPFOR tickets deplete', () => {
      const gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);

      // Advance game to COMBAT phase
      ticketSystem.update(ticketSystem['setupDuration'] + 0.1);

      ticketSystem['opforTickets'] = 1;
      ticketSystem.onCombatantDeath(Faction.OPFOR); // Deduct last 2 tickets (triggers checkVictoryConditions -> endGame)

      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.US);
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.US, expect.any(Object));
      expect(gameEndCallback.mock.calls[0][1].phase).toBe('ENDED');
    });

    it('should declare US winner if US controls all zones (total control)', () => {
      const gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);

      const zones = [
        createMockCaptureZone('A', ZoneState.US_CONTROLLED),
        createMockCaptureZone('B', ZoneState.US_CONTROLLED),
      ];
      mockZoneManager = createMockZoneManager(zones);
      ticketSystem.setZoneManager(mockZoneManager);

      // Ensure game is in COMBAT phase for win condition to apply
      ticketSystem['gameState'].matchDuration = ticketSystem['setupDuration'] + 0.1; // Set duration to combat phase
      ticketSystem['gameState'].phase = 'COMBAT'; // Explicitly set to COMBAT

      ticketSystem.update(0); // Trigger checkVictoryConditions

      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.US);
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.US, expect.any(Object));
      expect(gameEndCallback.mock.calls[0][1].phase).toBe('ENDED');
    });

    it('should declare OPFOR winner if OPFOR controls all zones (total control)', () => {
      const gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);

      const zones = [
        createMockCaptureZone('A', ZoneState.OPFOR_CONTROLLED),
        createMockCaptureZone('B', ZoneState.OPFOR_CONTROLLED),
      ];
      mockZoneManager = createMockZoneManager(zones);
      ticketSystem.setZoneManager(mockZoneManager);

      // Ensure game is in COMBAT phase for win condition to apply
      ticketSystem['gameState'].matchDuration = ticketSystem['setupDuration'] + 0.1; // Set duration to combat phase
      ticketSystem['gameState'].phase = 'COMBAT'; // Explicitly set to COMBAT

      ticketSystem.update(0); // Trigger checkVictoryConditions

      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.OPFOR);
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.OPFOR, expect.any(Object));
      expect(gameEndCallback.mock.calls[0][1].phase).toBe('ENDED');
    });

    it('should enter OVERTIME if tickets are close at match end time', () => {
      ticketSystem.setMaxTickets(300); // Reset tickets
      ticketSystem['usTickets'] = 100;
      ticketSystem['opforTickets'] = 120; // Difference is 20, less than 50

      // Advance time to just before combatDuration ends
      const timeToOvertime = ticketSystem['setupDuration'] + ticketSystem['combatDuration'] - 0.1;
      ticketSystem.update(timeToOvertime);
      expect(ticketSystem.getGameState().phase).toBe('COMBAT');

      ticketSystem.update(0.2); // Pass combatDuration

      expect(ticketSystem.getGameState().phase).toBe('OVERTIME');
      expect(ticketSystem.isGameActive()).toBe(true);
      expect(gameEndCallback).not.toHaveBeenCalled();
    });

    it('should end game by time limit if tickets are not close at match end time', () => {
      ticketSystem.setMaxTickets(300); // Reset tickets
      ticketSystem['usTickets'] = 200;
      ticketSystem['opforTickets'] = 50; // Difference is 150, more than 50

      // Advance time to just before combatDuration ends
      const timeToGameEnd = ticketSystem['setupDuration'] + ticketSystem['combatDuration'] - 0.1;
      ticketSystem.update(timeToGameEnd);
      expect(ticketSystem.getGameState().phase).toBe('COMBAT');

      ticketSystem.update(0.2); // Pass combatDuration

      expect(ticketSystem.getGameState().phase).toBe('ENDED');
      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.US); // US had more tickets
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.US, expect.any(Object));
    });

    it('should declare winner after overtime if tickets are still different', () => {
      ticketSystem.setMaxTickets(300); // Reset tickets
      ticketSystem['usTickets'] = 100;
      ticketSystem['opforTickets'] = 120; // Difference is 20, less than 50

      // Advance time to enter OVERTIME
      ticketSystem.update(ticketSystem['setupDuration'] + ticketSystem['combatDuration'] + 0.1);
      expect(ticketSystem.getGameState().phase).toBe('OVERTIME');

      // Advance time past overtimeDuration
      ticketSystem.update(ticketSystem['overtimeDuration']);

      expect(ticketSystem.getGameState().phase).toBe('ENDED');
      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.OPFOR); // OPFOR had more tickets
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.OPFOR, expect.any(Object));
    });

    it('should not end game if conditions are not met', () => {
      // Game active, combat phase, plenty of tickets for both, no total control
      ticketSystem.update(ticketSystem['setupDuration'] + 1);
      ticketSystem['gameState'].phase = 'COMBAT';
      ticketSystem.update(0); // Trigger checkVictoryConditions

      expect(ticketSystem.isGameActive()).toBe(true);
      expect(ticketSystem.getGameState().phase).toBe('COMBAT');
      expect(gameEndCallback).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Durations', () => {
    it('should correctly transition through game phases based on duration', () => {
      // SETUP phase
      ticketSystem.update(ticketSystem['setupDuration'] / 2);
      expect(ticketSystem.getGameState().phase).toBe('SETUP');

      // Transition to COMBAT
      ticketSystem.update(ticketSystem['setupDuration'] / 2 + 0.1); // Just past setup
      expect(ticketSystem.getGameState().phase).toBe('COMBAT');

      // Stay in COMBAT
      ticketSystem.update(ticketSystem['combatDuration'] / 2);
      expect(ticketSystem.getGameState().phase).toBe('COMBAT');

      // Transition to OVERTIME or ENDED handled by other tests
    });

    it('getMatchTimeRemaining should reflect current phase', () => {
      // SETUP
      ticketSystem.update(1);
      expect(ticketSystem.getGameState().phase).toBe('SETUP');
      expect(ticketSystem.getMatchTimeRemaining()).toBeCloseTo(ticketSystem['setupDuration'] - 1);

      // COMBAT
      ticketSystem.update(ticketSystem['setupDuration']); // Advances to duration = setupDuration + 1 = 11, which is 1s into COMBAT
      ticketSystem.update(1); // Now duration = 12, which is 2s into COMBAT
      expect(ticketSystem.getGameState().phase).toBe('COMBAT');
      expect(ticketSystem.getMatchTimeRemaining()).toBeCloseTo(ticketSystem['combatDuration'] - 2); // 2 seconds into combat phase

      // OVERTIME
      ticketSystem['usTickets'] = 100;
      ticketSystem['opforTickets'] = 120; // Close score
      ticketSystem.update(ticketSystem['combatDuration'] - 2); // Advances to end of combat (duration = setupDuration + combatDuration)
      ticketSystem.update(1); // 1 sec into overtime
      expect(ticketSystem.getGameState().phase).toBe('OVERTIME');
      expect(ticketSystem.getMatchTimeRemaining()).toBeCloseTo(ticketSystem['overtimeDuration'] - 1);

      // ENDED
      ticketSystem.forceEndGame(Faction.US);
      expect(ticketSystem.getMatchTimeRemaining()).toBe(0);
    });

    it('should handle large deltaTime values gracefully', () => {
      const largeDeltaTime = 2000; // Much larger than total duration (setup 10 + combat 900 + overtime 120 = 1030)
      ticketSystem.update(largeDeltaTime);

      // The game should have ended by time limit
      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().phase).toBe('ENDED');
      expect(ticketSystem.getGameState().matchDuration).toBeGreaterThan(ticketSystem['setupDuration'] + ticketSystem['combatDuration'] + ticketSystem['overtimeDuration']);
      expect(ticketSystem.getGameState().winner).toBeDefined(); // A winner should be determined
    });

    it('addTickets should not exceed maxTickets', () => {
      ticketSystem['usTickets'] = 290;
      ticketSystem.addTickets(Faction.US, 20); // Add 20, max is 300
      expect(ticketSystem.getTickets(Faction.US)).toBe(300);

      ticketSystem['opforTickets'] = 250;
      ticketSystem.addTickets(Faction.OPFOR, 60); // Add 60, max is 300
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(300);
    });

    it('removeTickets should not go below zero', () => {
      ticketSystem['usTickets'] = 10;
      ticketSystem.removeTickets(Faction.US, 20); // Remove 20, currently 10
      expect(ticketSystem.getTickets(Faction.US)).toBe(0);

      ticketSystem['opforTickets'] = 0;
      ticketSystem.removeTickets(Faction.OPFOR, 5); // Remove 5, currently 0
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(0);
    });
  });

  describe('Public API Methods', () => {
    it('getGameState should return a copy of the current game state', () => {
      const gameState = ticketSystem.getGameState();
      expect(gameState.gameActive).toBe(true);
      expect(gameState.phase).toBe('SETUP');
      // Modify the returned object to ensure it's a copy
      gameState.gameActive = false;
      expect(ticketSystem.isGameActive()).toBe(true);
    });

    it('isGameActive should return the current game active status', () => {
      expect(ticketSystem.isGameActive()).toBe(true);
      ticketSystem.forceEndGame(Faction.US);
      expect(ticketSystem.isGameActive()).toBe(false);
    });

    it('getKills should return correct kill counts', () => {
      ticketSystem.onCombatantDeath(Faction.US); // OPFOR kill
      ticketSystem.onCombatantDeath(Faction.OPFOR); // US kill
      expect(ticketSystem.getKills(Faction.US)).toBe(1);
      expect(ticketSystem.getKills(Faction.OPFOR)).toBe(1);
    });

    it('setMatchDuration should update combatDuration', () => {
      const newDuration = 600;
      ticketSystem.setMatchDuration(newDuration);
      expect(ticketSystem['combatDuration']).toBe(newDuration);
    });

    it('setDeathPenalty should update deathPenalty', () => {
      const newPenalty = 10;
      ticketSystem.setDeathPenalty(newPenalty);
      expect(ticketSystem['deathPenalty']).toBe(newPenalty);
    });

    it('setTicketUpdateCallback should register and trigger callback', () => {
      const updateCallback = vi.fn();
      ticketSystem.setTicketUpdateCallback(updateCallback);
      ticketSystem.update(0); // Trigger update
      expect(updateCallback).toHaveBeenCalledWith(300, 300);
    });

    it('setGameEndCallback should register and trigger callback on game end', () => {
      const gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);
      ticketSystem.forceEndGame(Faction.OPFOR);
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.OPFOR, expect.any(Object));
    });

    it('forceEndGame should end the game and set winner', () => {
      const gameEndCallback = vi.fn();
      ticketSystem.setGameEndCallback(gameEndCallback);

      ticketSystem.forceEndGame(Faction.US);
      expect(ticketSystem.isGameActive()).toBe(false);
      expect(ticketSystem.getGameState().winner).toBe(Faction.US);
      expect(gameEndCallback).toHaveBeenCalledWith(Faction.US, expect.any(Object));
      expect(ticketSystem.getGameState().phase).toBe('ENDED');
    });

    it('restartMatch should reset game state', () => {
      ticketSystem.onCombatantDeath(Faction.US); // Change state
      ticketSystem.forceEndGame(Faction.OPFOR); // End game

      ticketSystem.restartMatch();

      expect(ticketSystem.isGameActive()).toBe(true);
      expect(ticketSystem.getGameState().phase).toBe('SETUP');
      expect(ticketSystem.getTickets(Faction.US)).toBe(300);
      expect(ticketSystem.getTickets(Faction.OPFOR)).toBe(300);
      expect(ticketSystem.getKills(Faction.US)).toBe(0);
      expect(ticketSystem.getKills(Faction.OPFOR)).toBe(0);
    });

    it('dispose should log message', () => {
      ticketSystem.dispose();
      expect(Logger.info).toHaveBeenCalledWith('tickets', 'Ticket System disposed');
    });
  });
});

