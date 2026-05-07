import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Faction } from '../combat/types';
import { ZoneState, type CaptureZone, type ZoneManager } from '../world/ZoneManager';
import type { WarSimulatorConfig } from '../../config/gameModeTypes';
import { StrategicDirector } from './StrategicDirector';
import { WarEventEmitter } from './WarEventEmitter';
import type { StrategicSquad } from './types';

function makeConfig(): WarSimulatorConfig {
  return {
    enabled: true,
    totalAgents: 40,
    agentsPerFaction: 20,
    materializationRadius: 500,
    dematerializationRadius: 600,
    simulatedRadius: 2000,
    abstractCombatInterval: 2000,
    directorUpdateInterval: 0,
    maxMaterialized: 48,
    reinforcementCooldown: 9999,
    squadSize: { min: 4, max: 4 },
  };
}

function makeZone(
  id: string,
  owner: Faction | null,
  x: number,
  z: number,
  options: { home?: boolean; state?: CaptureZone['state']; bleed?: number } = {},
): CaptureZone {
  return {
    id,
    name: id,
    position: new THREE.Vector3(x, 0, z),
    radius: 60,
    height: 0,
    owner,
    state: options.state ?? ZoneState.NEUTRAL,
    captureProgress: 0,
    captureSpeed: 1,
    currentFlagHeight: 0,
    isHomeBase: options.home ?? false,
    ticketBleedRate: options.bleed ?? 1,
  };
}

function makeZoneManager(zones: CaptureZone[]): ZoneManager {
  return {
    getAllZones: () => zones,
  } as unknown as ZoneManager;
}

function makeSquad(id: string, faction: Faction, strength = 1): StrategicSquad {
  return {
    id,
    faction,
    members: [],
    leaderId: '',
    x: 0,
    z: 0,
    objectiveX: 0,
    objectiveZ: 0,
    stance: 'patrol',
    strength,
    combatActive: false,
    lastCombatTime: 0,
  };
}

describe('StrategicDirector mixed-faction objective pressure', () => {
  it('treats allied-owned zones as valid defense objectives for ARVN squads', () => {
    const squads = new Map<string, StrategicSquad>();
    for (let index = 0; index < 4; index++) {
      const squad = makeSquad(`arvn_${index}`, Faction.ARVN);
      squads.set(squad.id, squad);
    }
    const zones = [
      makeZone('us_hq', Faction.US, -800, 0, { home: true }),
      makeZone('nva_hq', Faction.NVA, 800, 0, { home: true }),
      makeZone('us_firebase', Faction.US, -180, 0, { bleed: 4 }),
      makeZone('nva_depot', Faction.NVA, 250, 0, { bleed: 5 }),
    ];
    const director = new StrategicDirector(
      squads,
      new Map(),
      makeConfig(),
      new WarEventEmitter(),
      makeZoneManager(zones),
    );

    director.update(1);

    expect(squads.get('arvn_2')?.objectiveZoneId).toBe('us_firebase');
    expect(squads.get('arvn_2')?.stance).toBe('defend');
  });

  it('retreats weak VC squads toward OPFOR-owned zones instead of the nearest enemy home base', () => {
    const weakVc = makeSquad('vc_weak', Faction.VC, 0.25);
    weakVc.x = -700;
    weakVc.z = 0;
    const squads = new Map([[weakVc.id, weakVc]]);
    const zones = [
      makeZone('us_hq', Faction.US, -720, 0, { home: true }),
      makeZone('nva_hq', Faction.NVA, 720, 0, { home: true }),
    ];
    const director = new StrategicDirector(
      squads,
      new Map(),
      makeConfig(),
      new WarEventEmitter(),
      makeZoneManager(zones),
    );

    director.update(1);

    expect(weakVc.objectiveZoneId).toBe('nva_hq');
    expect(weakVc.stance).toBe('retreat');
  });
});
