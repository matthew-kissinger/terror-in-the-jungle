import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameMode } from '../../../config/gameModeTypes';
import { Alliance, Faction } from '../../combat/types';
import { ZoneState } from '../ZoneManager';
import { resolveInitialSpawnPosition, resolveRespawnFallbackPosition } from './ModeSpawnResolver';

describe('ModeSpawnResolver', () => {
  it('uses origin spawn for sandbox definitions', () => {
    const definition = {
      id: GameMode.AI_SANDBOX,
      config: {
        id: GameMode.AI_SANDBOX,
        name: 'AI Sandbox',
        description: '',
        worldSize: 400,
        chunkRenderDistance: 6,
        maxTickets: 0,
        matchDuration: 0,
        deathPenalty: 0,
        playerCanSpawnAtZones: false,
        respawnTime: 5,
        spawnProtectionDuration: 0,
        maxCombatants: 10,
        squadSize: { min: 4, max: 4 },
        reinforcementInterval: 30,
        zones: [],
        captureRadius: 0,
        captureSpeed: 0,
        minimapScale: 200,
        viewDistance: 150
      },
      policies: {
        objective: { kind: 'sandbox', usesZones: false, usesTickets: false, usesWarSimulator: false },
        deploy: { flow: 'sandbox', mapVariant: 'standard', allowSpawnSelection: false, allowLoadoutEditingOnRespawn: true },
        respawn: { allowControlledZoneSpawns: false, initialSpawnRule: 'origin', fallbackRule: 'homebase', contactAssistStyle: 'none' },
        mapIntel: { tacticalRangeOverride: null, showStrategicAgentsOnMinimap: false, strategicLayer: 'none' },
        command: { quickCommands: true, surface: 'radial', scale: 'squad' },
        teamRules: { ownershipModel: 'alliance', composition: 'single_faction', playableAlliances: [Alliance.BLUFOR, Alliance.OPFOR] }
      }
    } as any;

    const spawn = resolveInitialSpawnPosition(definition);
    expect(spawn.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
  });

  it('resolves forward insertion on the friendly side of the objective', () => {
    const definition = {
      id: GameMode.A_SHAU_VALLEY,
      config: {
        id: GameMode.A_SHAU_VALLEY,
        name: 'A Shau Valley',
        description: '',
        worldSize: 2000,
        chunkRenderDistance: 6,
        maxTickets: 100,
        matchDuration: 100,
        deathPenalty: 1,
        playerCanSpawnAtZones: true,
        respawnTime: 5,
        spawnProtectionDuration: 0,
        maxCombatants: 60,
        squadSize: { min: 8, max: 12 },
        reinforcementInterval: 30,
        zones: [
          { id: 'us_hq_east', name: 'East LZ', position: new THREE.Vector3(500, 0, 0), radius: 30, isHomeBase: true, owner: Faction.US, ticketBleedRate: 0 },
          { id: 'obj', name: 'Objective', position: new THREE.Vector3(0, 0, 0), radius: 30, isHomeBase: false, owner: null, ticketBleedRate: 6 }
        ],
        captureRadius: 25,
        captureSpeed: 5,
        minimapScale: 200,
        viewDistance: 150
      },
      policies: {
        objective: { kind: 'warfront', usesZones: true, usesTickets: true, usesWarSimulator: true },
        deploy: { flow: 'air_assault', mapVariant: 'standard', allowSpawnSelection: true, allowLoadoutEditingOnRespawn: true },
        respawn: { allowControlledZoneSpawns: true, initialSpawnRule: 'forward_insertion', fallbackRule: 'pressure_front', contactAssistStyle: 'pressure_front' },
        mapIntel: { tacticalRangeOverride: 900, showStrategicAgentsOnMinimap: false, strategicLayer: 'optional' },
        command: { quickCommands: true, surface: 'radial', scale: 'battalion' },
        teamRules: { ownershipModel: 'alliance', composition: 'alliance_mix', playableAlliances: [Alliance.BLUFOR, Alliance.OPFOR] }
      }
    } as any;

    const spawn = resolveInitialSpawnPosition(definition);
    expect(spawn.x).toBeGreaterThan(0);
    expect(spawn.x).toBeLessThan(500);
  });

  it('resolves pressure-front fallback away from home base', () => {
    const spawn = resolveRespawnFallbackPosition(
      {
        allowControlledZoneSpawns: true,
        initialSpawnRule: 'forward_insertion',
        fallbackRule: 'pressure_front',
        contactAssistStyle: 'pressure_front'
      },
      {
        zones: [
          {
            id: 'us_base',
            name: 'US Base',
            position: new THREE.Vector3(0, 0, -50),
            state: ZoneState.BLUFOR_CONTROLLED,
            isHomeBase: true,
            owner: Faction.US,
            radius: 50,
            captureProgress: 0,
            ticketBleedRate: 0
          },
          {
            id: 'zone_us_forward',
            name: 'US Forward',
            position: new THREE.Vector3(100, 0, 100),
            state: ZoneState.BLUFOR_CONTROLLED,
            isHomeBase: false,
            owner: Faction.US,
            radius: 50,
            captureProgress: 0,
            ticketBleedRate: 2
          },
          {
            id: 'zone_obj',
            name: 'Objective',
            position: new THREE.Vector3(220, 0, 220),
            state: ZoneState.CONTESTED,
            isHomeBase: false,
            owner: null,
            radius: 50,
            captureProgress: 0,
            ticketBleedRate: 6
          }
        ] as any,
        alliance: Alliance.BLUFOR,
        terrainReadyAt: () => true
      }
    );

    expect(spawn).not.toBeNull();
    expect(spawn!.x).toBeGreaterThan(100);
    expect(spawn!.z).toBeGreaterThan(100);
  });
});
