// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { TargetMark } from '../../core/GameEventBus';
import type { FirstPersonWeapon } from '../player/FirstPersonWeapon';
import type { HeldEquipmentMode, HeldEquipmentViewmodelSystem } from '../player/HeldEquipmentViewmodelSystem';
import type { SmokeMarkerSystem, SmokeMarkerThrowModeEndReason } from '../weapons/SmokeMarkerSystem';

export interface CommandHeldEquipmentConfig {
  firstPersonWeapon?: FirstPersonWeapon;
  heldEquipment?: HeldEquipmentViewmodelSystem;
  smokeMarkerSystem?: SmokeMarkerSystem;
  onSmokeMarkerThrowModeEnd?: (reason: SmokeMarkerThrowModeEndReason) => void;
}

export class CommandHeldEquipmentBridge {
  private firstPersonWeapon?: FirstPersonWeapon;
  private heldEquipment?: HeldEquipmentViewmodelSystem;
  private smokeMarkerSystem?: SmokeMarkerSystem;
  private onSmokeMarkerThrowModeEnd?: (reason: SmokeMarkerThrowModeEndReason) => void;
  private weaponVisibleBeforeEquipment: boolean | null = null;

  configure(config: CommandHeldEquipmentConfig): void {
    this.firstPersonWeapon = config.firstPersonWeapon;
    this.heldEquipment = config.heldEquipment;
    this.smokeMarkerSystem = config.smokeMarkerSystem;
    this.onSmokeMarkerThrowModeEnd = config.onSmokeMarkerThrowModeEnd;
    this.smokeMarkerSystem?.setThrowModeEndHook((reason) => {
      this.restore();
      this.onSmokeMarkerThrowModeEnd?.(reason);
    });
  }

  show(mode: Exclude<HeldEquipmentMode, 'none'>): void {
    if (this.weaponVisibleBeforeEquipment === null) {
      this.weaponVisibleBeforeEquipment = this.firstPersonWeapon?.getWeaponPresentationState?.().requestedVisible ?? true;
    }
    this.firstPersonWeapon?.setWeaponVisibility(false);
    this.heldEquipment?.setMode(mode);
  }

  restore(): void {
    this.heldEquipment?.setMode('none');
    if (this.weaponVisibleBeforeEquipment !== null) {
      this.firstPersonWeapon?.setWeaponVisibility(this.weaponVisibleBeforeEquipment);
      this.weaponVisibleBeforeEquipment = null;
    }
  }

  beginSmokeMarkerThrow(): boolean {
    if (!this.smokeMarkerSystem) return false;
    this.smokeMarkerSystem.beginThrowMode();
    this.show('smoke-marker');
    return true;
  }

  cancelSmokeMarkerThrow(): boolean {
    return this.smokeMarkerSystem?.cancelThrowMode() ?? false;
  }

  isSmokeMarkerHandlingInput(): boolean {
    return this.smokeMarkerSystem?.isHandlingInput() ?? false;
  }

  hasActiveSmokeMark(): boolean {
    return Boolean(this.smokeMarkerSystem?.getActiveMark());
  }

  getActiveSmokeMark(): TargetMark | null {
    return this.smokeMarkerSystem?.getActiveMark() ?? null;
  }

  clearActiveSmokeMark(): void {
    this.smokeMarkerSystem?.clearActiveMark();
  }
}
