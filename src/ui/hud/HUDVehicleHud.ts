// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { HelicopterHUD } from './HelicopterHUD';
import { FixedWingHUD } from './FixedWingHUD';

/**
 * Vehicle instrument HUD plumbing extracted from HUDElements.
 *
 * Owns the HelicopterHUD and FixedWingHUD sub-components and exposes the thin
 * delegation methods that forward to them. HUDElements extends this base, so
 * every method below remains reachable on a HUDElements instance with an
 * identical public signature — callers such as HUDSystem are unaffected. The
 * split exists purely to keep the HUDElements method count under the
 * source-budget cap; behavior, ordering, and the public API are unchanged.
 *
 * The two HUD instances are kept `public` to preserve the exact public surface
 * of HUDElements (they were `public` fields there). HUDElements mounts,
 * remounts, and disposes them via these inherited references.
 */
export class HUDVehicleHud {
  // UIComponent-based elements (Phase 4)
  public helicopterHUD: HelicopterHUD;
  public fixedWingHUD: FixedWingHUD;

  constructor() {
    this.helicopterHUD = new HelicopterHUD();
    this.fixedWingHUD = new FixedWingHUD();
  }

  updateElevation(elevation: number): void {
    this.helicopterHUD.setElevation(elevation);
  }

  // Helicopter mouse control indicator methods
  showHelicopterMouseIndicator(): void {
    this.helicopterHUD.showMouseIndicator();
  }

  hideHelicopterMouseIndicator(): void {
    this.helicopterHUD.hideMouseIndicator();
  }

  updateHelicopterMouseMode(controlMode: boolean): void {
    this.helicopterHUD.setMouseMode(controlMode);
  }

  // Helicopter instruments methods (only visible in helicopter)
  showHelicopterInstruments(): void {
    this.helicopterHUD.show();
    this.helicopterHUD.showInstruments();
  }

  hideHelicopterInstruments(): void {
    this.helicopterHUD.hide();
    this.helicopterHUD.hideInstruments();
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    this.helicopterHUD.setInstruments(collective, rpm, autoHover, engineBoost);
  }

  updateHelicopterFlightData(airspeed: number, heading: number, verticalSpeed: number): void {
    this.helicopterHUD.setFlightData(airspeed, heading, verticalSpeed);
  }

  setHelicopterAircraftRole(role: import('../../systems/helicopter/AircraftConfigs').AircraftRole): void {
    this.helicopterHUD.setAircraftRole(role);
  }

  setHelicopterWeaponStatus(name: string, ammo: number): void {
    this.helicopterHUD.setWeaponStatus(name, ammo);
  }

  setHelicopterDamage(healthPercent: number): void {
    this.helicopterHUD.setDamage(healthPercent);
  }

  // Fixed-wing HUD methods
  showFixedWingInstruments(): void {
    this.fixedWingHUD.show();
  }

  hideFixedWingInstruments(): void {
    this.fixedWingHUD.hide();
  }

  updateFixedWingFlightData(airspeed: number, heading: number, verticalSpeed: number): void {
    this.fixedWingHUD.setFlightData(airspeed, heading, verticalSpeed);
  }

  updateFixedWingThrottle(throttle: number): void {
    this.fixedWingHUD.setThrottle(throttle);
  }

  setFixedWingStallWarning(stalled: boolean): void {
    this.fixedWingHUD.setStallWarning(stalled);
  }

  setFixedWingStallSpeed(speed: number): void {
    this.fixedWingHUD.setStallSpeed(speed);
  }

  setFixedWingAutoLevel(active: boolean): void {
    this.fixedWingHUD.setAutoLevel(active);
  }

  setFixedWingFlightAssist(active: boolean): void {
    this.fixedWingHUD.setFlightAssist(active);
  }

  setFixedWingPhase(phase: import('../../systems/vehicle/FixedWingControlLaw').FixedWingControlPhase): void {
    this.fixedWingHUD.setPhase(phase);
  }

  setFixedWingOperationState(state: import('../../systems/vehicle/FixedWingOperations').FixedWingOperationState): void {
    this.fixedWingHUD.setOperationState(state);
  }

  showFixedWingMouseIndicator(): void {
    this.fixedWingHUD.showMouseIndicator();
  }

  hideFixedWingMouseIndicator(): void {
    this.fixedWingHUD.hideMouseIndicator();
  }

  updateFixedWingMouseMode(controlMode: boolean): void {
    this.fixedWingHUD.setMouseMode(controlMode);
  }

  updateFixedWingAmmo(rounds: number, capacity: number, weaponName?: string): void {
    this.fixedWingHUD.setAmmo(rounds, capacity, weaponName);
  }

  setFixedWingSeatFireCue(armed: boolean, broadside: boolean): void {
    this.fixedWingHUD.setSeatFireCue(armed, broadside);
  }

  flashFixedWingAirborneHint(): void {
    this.fixedWingHUD.flashAirborneHint();
  }
}
