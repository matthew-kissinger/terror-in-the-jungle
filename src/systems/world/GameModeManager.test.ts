import { describe, expect, it, vi } from 'vitest';
import { getGameModeDefinition } from '../../config/gameModeDefinitions';
import { GameMode } from '../../config/gameModeTypes';
import { GameModeManager } from './GameModeManager';

describe('GameModeManager', () => {
  it('applies map intel policy from the active runtime', () => {
    const manager = new GameModeManager();
    const mockZoneManager = {
      setGameModeConfig: vi.fn(),
      getAllZones: vi.fn(() => []),
    } as any;
    const mockCombatantSystem = {
      setMaxCombatants: vi.fn(),
      setSquadSizes: vi.fn(),
      setReinforcementInterval: vi.fn(),
      setAutonomousSpawningEnabled: vi.fn(),
      reseedForcesForMode: vi.fn(),
      clearCombatantsForExternalPopulation: vi.fn(),
      combatantAI: {
        setEngagementRange: vi.fn(),
      },
      setSpatialBounds: vi.fn(),
    } as any;
    const mockTicketSystem = {
      setMaxTickets: vi.fn(),
      setMatchDuration: vi.fn(),
      setDeathPenalty: vi.fn(),
      setTDMMode: vi.fn(),
    } as any;
    const mockTerrainSystem = {
      setRenderDistance: vi.fn(),
      getHeightAt: vi.fn(() => 0),
    } as any;
    const mockMinimapSystem = {
      setMapIntelPolicy: vi.fn(),
      setWorldScale: vi.fn(),
    } as any;
    const mockFullMapSystem = { setMapIntelPolicy: vi.fn() } as any;

    manager.connectSystems(
      mockZoneManager,
      mockCombatantSystem,
      mockTicketSystem,
      mockTerrainSystem,
      mockMinimapSystem,
      mockFullMapSystem
    );

    manager.setGameMode(GameMode.A_SHAU_VALLEY);
    expect(mockMinimapSystem.setMapIntelPolicy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tacticalRangeOverride: 900,
        showStrategicAgentsOnMinimap: false,
      })
    );
    expect(mockFullMapSystem.setMapIntelPolicy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showStrategicAgentsOnFullMap: true,
        strategicLayer: 'optional',
      })
    );

    manager.setGameMode(GameMode.ZONE_CONTROL);
    expect(mockMinimapSystem.setMapIntelPolicy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tacticalRangeOverride: null,
        showStrategicAgentsOnMinimap: false,
      })
    );
    expect(mockFullMapSystem.setMapIntelPolicy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        showStrategicAgentsOnFullMap: false,
        strategicLayer: 'none',
      })
    );
  });

  it('runs runtime exit, enter, and reapply hooks in order', () => {
    const events: string[] = [];
    const manager = new GameModeManager(getGameModeDefinition, definition => ({
      definition,
      onEnter: context => {
        events.push(`enter:${context.mode}`);
      },
      onExit: context => {
        events.push(`exit:${context.mode}->${context.nextMode}`);
      },
      onReapply: context => {
        events.push(`reapply:${context.mode}`);
      }
    }));

    manager.setGameMode(GameMode.OPEN_FRONTIER);
    manager.setGameMode(GameMode.OPEN_FRONTIER);

    expect(events).toEqual([
      'exit:zone_control->open_frontier',
      'enter:open_frontier',
      'reapply:open_frontier'
    ]);
  });

  it('passes scheduled runtime updates through the active mode runtime', () => {
    const events: string[] = [];
    const manager = new GameModeManager(getGameModeDefinition, definition => ({
      definition,
      update: (_context, deltaTime, gameStarted) => {
        events.push(`${definition.id}:${deltaTime}:${gameStarted}`);
      }
    }));

    manager.setGameMode(GameMode.AI_SANDBOX);
    manager.updateRuntime(0.5, true);

    expect(events).toEqual(['ai_sandbox:0.5:true']);
  });

  it('exposes current deploy and respawn policies', () => {
    const manager = new GameModeManager();
    manager.setGameMode(GameMode.OPEN_FRONTIER);

    expect(manager.getDeployPolicy().mapVariant).toBe('frontier');
    expect(manager.getDeploySession('respawn').flowLabel).toBe('Frontier insertion');
    expect(manager.getRespawnPolicy().allowControlledZoneSpawns).toBe(true);
    expect(manager.canPlayerSpawnAtZones()).toBe(true);
  });
});
