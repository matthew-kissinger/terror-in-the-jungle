// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  VEHICLE_HINT_TABLE,
  deriveVehicleClass,
  vehicleHintEntry,
} from './vehicleHintTable';
import type { VehicleClass, VehicleUIContext } from '../layout/types';

// Every craft class a player can currently enter. The table MUST carry an entry
// for each — a class without one would silently fall back to the on-foot legend
// and hardcoded touch verbs, the exact drift this table exists to prevent.
const ENTERABLE_CLASSES: VehicleClass[] = [
  'jeep',
  'truck',
  'apc',
  'tank',
  'boat',
  'emplacement',
  'heli-transport',
  'heli-gunship',
  'plane',
  'plane-broadside',
];

function ctx(overrides: Partial<VehicleUIContext>): VehicleUIContext {
  return {
    kind: 'car',
    role: 'driver',
    hudVariant: 'groundVehicle',
    weaponCount: 0,
    capabilities: {
      canExit: true,
      canFirePrimary: false,
      canCycleWeapons: false,
      canFreeLook: false,
      canStabilize: false,
      canDeploySquad: false,
      canOpenMap: false,
      canOpenCommand: false,
    },
    ...overrides,
  };
}

describe('vehicleHintTable — exhaustiveness', () => {
  it('carries an entry for every enterable vehicle class', () => {
    for (const cls of ENTERABLE_CLASSES) {
      expect(vehicleHintEntry(cls), `missing table entry for '${cls}'`).not.toBeNull();
    }
  });

  it('has no extra classes beyond the enterable set (table + union stay in lockstep)', () => {
    expect(Object.keys(VEHICLE_HINT_TABLE).sort()).toEqual([...ENTERABLE_CLASSES].sort());
  });

  it('resolves a missing class to null rather than a silent fallback entry', () => {
    expect(vehicleHintEntry(undefined)).toBeNull();
  });
});

describe('vehicleHintTable — legend buckets', () => {
  it('routes each class to the control-legend bucket its craft actually uses', () => {
    // Ground vehicles + boat share the driven-chassis legend; a gun station uses
    // the turret legend; rotary + fixed wing each get their flight legend.
    expect(vehicleHintEntry('jeep')!.legendContext).toBe('groundVehicle');
    expect(vehicleHintEntry('truck')!.legendContext).toBe('groundVehicle');
    expect(vehicleHintEntry('apc')!.legendContext).toBe('groundVehicle');
    expect(vehicleHintEntry('tank')!.legendContext).toBe('groundVehicle');
    expect(vehicleHintEntry('boat')!.legendContext).toBe('groundVehicle');
    expect(vehicleHintEntry('emplacement')!.legendContext).toBe('turret');
    expect(vehicleHintEntry('heli-transport')!.legendContext).toBe('helicopter');
    expect(vehicleHintEntry('heli-gunship')!.legendContext).toBe('helicopter');
    expect(vehicleHintEntry('plane')!.legendContext).toBe('fixedWing');
    expect(vehicleHintEntry('plane-broadside')!.legendContext).toBe('fixedWing');
  });
});

describe('vehicleHintTable — seat-swap rule', () => {
  it('marks only the two-station craft (tank, door-gun gunship) as swapping', () => {
    // These are the ONLY classes where `F` swaps a second station rather than
    // dismounting — the seat-cue truth the wave-1 fix restored.
    const swapping = ENTERABLE_CLASSES.filter((c) => vehicleHintEntry(c)!.seatRule.canSwapStations);
    expect(swapping.sort()).toEqual(['heli-gunship', 'tank']);
  });

  it('does NOT mark the single-seat gun stations as swapping', () => {
    // The M2HB emplacement and a direct-boarded solo tank gunner both report the
    // `emplacement` class — `F` dismounts, so no swap cue.
    expect(vehicleHintEntry('emplacement')!.seatRule.canSwapStations).toBe(false);
  });
});

describe('vehicleHintTable — touch verbs', () => {
  it('never emits a keyboard bind as a touch caption (wave-1 rule)', () => {
    // The touch bar teaches on-screen buttons, not keys. No caption may read like
    // a key bind ("W/S", "LMB", "RMB", "Space", "E:", "F:").
    for (const cls of ENTERABLE_CLASSES) {
      const verbs = vehicleHintEntry(cls)!.touchVerbs;
      for (const caption of Object.values(verbs)) {
        expect(caption, `touch caption '${caption}' on '${cls}' looks like a keyboard bind`)
          .not.toMatch(/\b(W\/S|A\/D|LMB|RMB|Space|Arrows|Ctrl)\b/);
        expect(caption).not.toMatch(/^[A-Z]:/); // no "F: swap" style key cues
      }
    }
  });

  it('gives the strike plane a LEVEL stabiliser and the gunship an ORBIT one', () => {
    // The AC-47 orbits; the A-1 / F-4 level off. STAB stays the label for every
    // ground/turret/rotary craft.
    expect(vehicleHintEntry('plane')!.touchVerbs.stabilize).toBe('LEVEL');
    expect(vehicleHintEntry('plane-broadside')!.touchVerbs.stabilize).toBe('ORBIT');
    expect(vehicleHintEntry('jeep')!.touchVerbs.stabilize).toBe('STAB');
    expect(vehicleHintEntry('heli-transport')!.touchVerbs.stabilize).toBe('STAB');
    expect(vehicleHintEntry('emplacement')!.touchVerbs.stabilize).toBe('STAB');
  });

  it('keeps the shared ACTION captions stable (EXIT / FIRE / SEAT / BOMB)', () => {
    const jeep = vehicleHintEntry('jeep')!.touchVerbs;
    expect(jeep.exit).toBe('EXIT');
    expect(jeep.fire).toBe('FIRE');
    expect(jeep.seat).toBe('SEAT');
    expect(jeep.bomb).toBe('BOMB');
  });
});

describe('deriveVehicleClass — legacy fallback', () => {
  it('uses the explicit vehicleClass when the context carries one', () => {
    // The adapter-set field always wins, even when kind/role would derive
    // something else (a tank gunner reports kind:'turret' but class:'tank').
    expect(deriveVehicleClass(ctx({ kind: 'turret', role: 'gunner', vehicleClass: 'tank' }))).toBe('tank');
  });

  it('derives a broadside plane vs a strike plane from the view toggle', () => {
    expect(
      deriveVehicleClass(ctx({
        kind: 'plane', role: 'pilot',
        viewToggle: { inactiveLabel: 'SIDE', activeLabel: 'CHASE', active: false },
      })),
    ).toBe('plane-broadside');
    expect(deriveVehicleClass(ctx({ kind: 'plane', role: 'pilot' }))).toBe('plane');
  });

  it('derives a gunship heli vs a transport/attack heli from the role', () => {
    expect(deriveVehicleClass(ctx({ kind: 'helicopter', role: 'gunship' }))).toBe('heli-gunship');
    expect(deriveVehicleClass(ctx({ kind: 'helicopter', role: 'transport' }))).toBe('heli-transport');
    expect(deriveVehicleClass(ctx({ kind: 'helicopter', role: 'attack' }))).toBe('heli-transport');
  });

  it('derives a two-seat tank vs a single-seat wheeled vehicle from the second seat', () => {
    expect(deriveVehicleClass(ctx({ kind: 'car', role: 'pilot', secondSeat: true }))).toBe('tank');
    expect(deriveVehicleClass(ctx({ kind: 'car', role: 'driver' }))).toBe('jeep');
  });

  it('derives a bare turret to the emplacement class, but a two-seat turret gunner to tank', () => {
    // A standalone M2HB / solo tank gunner has one station (F dismounts); a tank
    // gunner still crewing a two-seat M48 reports a second seat (F swaps).
    expect(deriveVehicleClass(ctx({ kind: 'turret', role: 'gunner' }))).toBe('emplacement');
    expect(deriveVehicleClass(ctx({ kind: 'turret', role: 'gunner', secondSeat: true }))).toBe('tank');
  });
});
