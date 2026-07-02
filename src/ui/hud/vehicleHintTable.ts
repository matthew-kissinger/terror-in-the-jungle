// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { VehicleClass, VehicleUIContext } from '../layout/types';
import type { ControlHintContext } from './HudControlHints';

/**
 * vehicleHintTable — the single declarative source of truth for what a given
 * vehicle class teaches the player.
 *
 * Before this module the control-hint logic lived in scattered per-adapter and
 * per-consumer branching: `HudControlHints.actorToContext` mapped actor modes to
 * legend buckets, `seatHintFromContext` branched on kind/role/seat/flags to pick
 * seat cues, and `VehicleActionBar` hardcoded its touch-button captions. A hint
 * change (a new touch verb, a broadside-only note) meant editing several files
 * and risked drift between the desktop legend and the touch bar.
 *
 * This table collapses that into one entry per {@link VehicleClass}. Each entry
 * declares:
 *  - `legendContext`: which desktop control-legend bucket the class renders
 *    (`HudControlHints` reads its bind rows from that bucket).
 *  - `touchVerbs`: the short ACTION-button captions for the on-screen touch bar
 *    (`VehicleActionBar` reads these — driving/steering via the sticks is
 *    implicit and never captioned; keyboard binds NEVER appear on the touch bar,
 *    the wave-1 rule).
 *  - `seatCue`: how the seat block behaves for the class — whether the class ever
 *    swaps a second station (tank driver<->gunner, gunship pilot<->door gun) and
 *    the airframe-specific RMB note wording.
 *
 * The point is behavioural single-sourcing, not a rewrite of the strings: the
 * exact wave-1 fixes (turret legend has no throttle/steer rows, a plain plane
 * shows no RMB note, the door-gun seat re-push flips the label) are preserved by
 * construction here and pinned by `vehicleHintTable.test.ts` +
 * `HudControlHints.test.ts`.
 */

/** Short ACTION-button captions for the touch bar (one per class). */
export interface VehicleTouchVerbs {
  /** Dismount caption. Boats read HELM-free — EXIT everywhere for consistency. */
  readonly exit: string;
  /** Fire caption for armed craft (hidden on unarmed classes by capability). */
  readonly fire: string;
  /** Seat-swap caption for two-station craft (tank, gunship). */
  readonly seat: string;
  /** Bomb-release caption for dropped-bomb strike planes. */
  readonly bomb: string;
  /** Weapon-cycle caption (helicopter gun/rockets). */
  readonly weapon: string;
  /** Sight-zoom / stabiliser caption note — the class's dynamic STAB label base. */
  readonly stabilize: string;
}

/**
 * How the seat block reads for a class. `swapCue` describes the F-swap wording
 * when the class carries a second station; `broadsideNote` / `bombNote` are the
 * mutually-exclusive RMB notes a plane class may carry (a broadside gunship uses
 * RMB for the gun cam, a strike plane uses it to drop a bomb, a plain plane has
 * neither).
 */
export interface VehicleSeatRule {
  /** This class can swap between two crew stations without an enter/exit. */
  readonly canSwapStations: boolean;
}

export interface VehicleHintEntry {
  /** Desktop control-legend bucket the class renders its bind rows from. */
  readonly legendContext: ControlHintContext;
  /** Touch-bar ACTION-button captions. */
  readonly touchVerbs: VehicleTouchVerbs;
  /** Seat-block behaviour for the class. */
  readonly seatRule: VehicleSeatRule;
  /** Free-form notes for regression pins / documentation (never rendered). */
  readonly notes?: string;
}

/** Ground-vehicle touch verbs shared by jeep / truck / apc (identical HUD). */
const GROUND_VERBS: VehicleTouchVerbs = {
  exit: 'EXIT',
  fire: 'FIRE',
  seat: 'SEAT',
  bomb: 'BOMB',
  weapon: 'WPN',
  stabilize: 'STAB',
};

/** Turret / emplacement touch verbs (gun station, no chassis). */
const TURRET_VERBS: VehicleTouchVerbs = {
  exit: 'EXIT',
  fire: 'FIRE',
  seat: 'SEAT',
  bomb: 'BOMB',
  weapon: 'WPN',
  stabilize: 'STAB',
};

/** Rotary-wing touch verbs (throttle/rudder via sticks; STAB = auto-hover). */
const HELI_VERBS: VehicleTouchVerbs = {
  exit: 'EXIT',
  fire: 'FIRE',
  seat: 'SEAT',
  bomb: 'BOMB',
  weapon: 'WPN',
  stabilize: 'STAB',
};

/** Fixed-wing touch verbs (STAB = LEVEL on a strike plane, ORBIT on a gunship). */
const PLANE_VERBS: VehicleTouchVerbs = {
  exit: 'EXIT',
  fire: 'FIRE',
  seat: 'SEAT',
  bomb: 'BOMB',
  weapon: 'WPN',
  stabilize: 'LEVEL',
};

const GUNSHIP_VERBS: VehicleTouchVerbs = {
  ...PLANE_VERBS,
  stabilize: 'ORBIT',
};

/**
 * The canonical per-class hint table. Exhaustive over {@link VehicleClass}: a
 * `Record` keyed on the union means adding a class without an entry is a compile
 * error, and `vehicleHintTable.test.ts` pins the runtime exhaustiveness too.
 */
export const VEHICLE_HINT_TABLE: Record<VehicleClass, VehicleHintEntry> = {
  jeep: {
    legendContext: 'groundVehicle',
    touchVerbs: GROUND_VERBS,
    seatRule: { canSwapStations: false },
    notes: 'Single-seat wheeled: F dismounts, no swap cue.',
  },
  truck: {
    legendContext: 'groundVehicle',
    touchVerbs: GROUND_VERBS,
    seatRule: { canSwapStations: false },
    notes: 'Cargo truck shares the driver legend; single station.',
  },
  apc: {
    legendContext: 'groundVehicle',
    touchVerbs: GROUND_VERBS,
    seatRule: { canSwapStations: false },
    notes: 'Wheeled APC shares the driver legend; single driven station.',
  },
  tank: {
    legendContext: 'groundVehicle',
    touchVerbs: GROUND_VERBS,
    seatRule: { canSwapStations: true },
    notes: 'Two-seat: driver hatch <-> gunner station via F (secondSeat).',
  },
  boat: {
    legendContext: 'groundVehicle',
    touchVerbs: GROUND_VERBS,
    seatRule: { canSwapStations: false },
    notes: 'Watercraft reuses the ground legend (H3 boat identity deferred).',
  },
  emplacement: {
    legendContext: 'turret',
    touchVerbs: TURRET_VERBS,
    seatRule: { canSwapStations: false },
    notes: 'M2HB tripod: mouse-aim, LMB fire, E dismounts; no chassis rows.',
  },
  'heli-transport': {
    legendContext: 'helicopter',
    touchVerbs: HELI_VERBS,
    seatRule: { canSwapStations: false },
    notes: 'Transport / attack pilot: single station, no door-gun swap.',
  },
  'heli-gunship': {
    legendContext: 'helicopter',
    touchVerbs: HELI_VERBS,
    seatRule: { canSwapStations: true },
    notes: 'Door-gun gunship: pilot <-> door gun via F.',
  },
  plane: {
    legendContext: 'fixedWing',
    touchVerbs: PLANE_VERBS,
    seatRule: { canSwapStations: false },
    notes: 'Strike plane (A-1 / F-4): RMB drops a bomb; no broadside note.',
  },
  'plane-broadside': {
    legendContext: 'fixedWing',
    touchVerbs: GUNSHIP_VERBS,
    seatRule: { canSwapStations: false },
    notes: 'AC-47 broadside gunship: RMB is the gun cam; V toggles side/chase.',
  },
};

/** Resolve the table entry for a class, or null when the class is unknown. */
export function vehicleHintEntry(vehicleClass: VehicleClass | undefined): VehicleHintEntry | null {
  return vehicleClass ? VEHICLE_HINT_TABLE[vehicleClass] ?? null : null;
}

/**
 * Derive a {@link VehicleClass} from a legacy `VehicleUIContext` that predates
 * the `vehicleClass` field. Adapters set the field directly now; this fallback
 * keeps the table resolving for any context that still omits it (and lets the
 * legend/seat/touch consumers converge on one code path). Mirrors the historical
 * `kind`/`role`/`viewToggle`/`bombsAvailable` branching the consumers used before
 * the table.
 */
export function deriveVehicleClass(context: VehicleUIContext): VehicleClass {
  if (context.vehicleClass) return context.vehicleClass;

  switch (context.kind) {
    case 'plane':
      // A broadside gunship (AC-47) reports either a viewToggle or the `gunship`
      // flight role; everything else is a strike / gun plane. The two are
      // mutually exclusive by airframe (a broadside plane carries no bombs).
      return context.viewToggle || context.role === 'gunship' ? 'plane-broadside' : 'plane';
    case 'helicopter':
      return context.role === 'gunship' ? 'heli-gunship' : 'heli-transport';
    case 'turret':
      // A tank gunner reports kind:'turret' with a second seat (the driver); a
      // standalone M2HB tripod / solo tank gunner reports no second seat and
      // dismounts on `F`.
      return context.secondSeat ? 'tank' : 'emplacement';
    case 'car':
    default:
      // Tank driver carries secondSeat; a plain wheeled vehicle does not. Boats
      // are indistinguishable from jeeps at this layer (shared ground bucket),
      // so both resolve to the ground legend either way.
      return context.secondSeat ? 'tank' : 'jeep';
  }
}
