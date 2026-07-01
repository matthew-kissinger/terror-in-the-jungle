// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Faction } from '../combat/types';
import type { AirSupportManager } from './AirSupportManager';
import type { AirSupportType } from './AirSupportTypes';
import {
  getAirSupportRadioAsset,
  radioAssetToSupportType,
  type AirSupportRadioAssetId,
  type AirSupportTargetMarking,
} from './AirSupportRadioCatalog';
import {
  resolveStrikeGate,
  horizontalDistanceXZ,
  STRIKE_MAX_CALL_RANGE,
  STRIKE_FOOTPRINT_RADIUS,
  type StrikeGateResult,
} from './StrikeGates';
import { StrikeTargetMarker } from './StrikeTargetMarker';
import { FireMissionBanner } from '../../ui/hud/FireMissionBanner';
import { spawnSmokeCloud } from '../effects/SmokeCloudSystem';

/**
 * Resolve the player's view-ray onto the ground. `ok` is false only when there
 * is no camera; `hasGround` is false when the ray fell back to the sky.
 */
export type StrikePickProvider = (out: THREE.Vector3) => { ok: boolean; hasGround: boolean };

const OVERRIDE_TIMEOUT = 2.0; // seconds the danger-close override stays armed

/**
 * StrikeDesignationController — the DESIGNATE → CONFIRM step of an air-support
 * call-in, extracted from `CommandInputManager` (which only forwards to it).
 *
 * On `begin()` the radio surface has closed and the pointer is relocked; this
 * controller then tracks the player's view-ray each frame (re-aimable, the core
 * fix vs the old freeze-on-open), drives the world `StrikeTargetMarker` + the
 * `FireMissionBanner`, runs the range / danger-close / no-ground gates, and only
 * fires `AirSupportManager.requestSupport` on a deliberate confirm. Danger-close
 * needs a second confirm (override). Abort spends no cooldown.
 */
export class StrikeDesignationController {
  private readonly banner = new FireMissionBanner();
  private marker?: StrikeTargetMarker;
  private scene?: THREE.Scene;
  private terrainHeightAt?: (x: number, z: number) => number;
  private airSupportManager?: AirSupportManager;
  private pickProvider?: StrikePickProvider;
  private originProvider?: () => THREE.Vector3;
  private friendlyCountInRadius?: (center: THREE.Vector3, radius: number) => number;

  private active = false;
  private assetId?: AirSupportRadioAssetId;
  private supportType?: AirSupportType;
  private marking: AirSupportTargetMarking = 'smoke';
  private gate: StrikeGateResult = { status: 'no_ground', canCommit: false, requiresOverride: false };
  private overrideArmed = false;
  private overrideElapsed = 0;
  private fixedTarget?: THREE.Vector3;

  private readonly target = new THREE.Vector3();
  private readonly approach = new THREE.Vector3();
  private readonly scratchOrigin = new THREE.Vector3();

  mount(parent: HTMLElement): void {
    this.banner.mount(parent);
  }

  unmount(): void {
    this.banner.unmount();
  }

  setScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  setTerrainHeightProvider(fn: (x: number, z: number) => number): void {
    this.terrainHeightAt = fn;
  }

  setAirSupportManager(manager: AirSupportManager): void {
    this.airSupportManager = manager;
  }

  setPickProvider(pick: StrikePickProvider, origin: () => THREE.Vector3): void {
    this.pickProvider = pick;
    this.originProvider = origin;
  }

  setFriendlyCountProvider(fn: (center: THREE.Vector3, radius: number) => number): void {
    this.friendlyCountInRadius = fn;
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Arm the DESIGNATE step for an asset. Returns 'unwired' when no air-support
   * manager / unknown asset (caller keeps its prior status echo), 'rejected'
   * when the asset is still cooling down, or 'designating' on success.
   */
  begin(assetId: AirSupportRadioAssetId, marking: AirSupportTargetMarking): 'designating' | 'rejected' | 'unwired' {
    const supportType = radioAssetToSupportType[assetId];
    if (!this.airSupportManager || !supportType) return 'unwired';

    if (this.airSupportManager.getCooldownRemaining(supportType) > 0) {
      return 'rejected';
    }

    this.active = true;
    this.assetId = assetId;
    this.supportType = supportType;
    this.marking = marking;
    this.fixedTarget = undefined;
    this.overrideArmed = false;
    this.overrideElapsed = 0;
    this.ensureMarker();
    this.recompute();
    return 'designating';
  }

  beginAtTarget(
    assetId: AirSupportRadioAssetId,
    marking: AirSupportTargetMarking,
    target: THREE.Vector3,
  ): 'designating' | 'rejected' | 'unwired' {
    const outcome = this.begin(assetId, marking);
    if (outcome !== 'designating') return outcome;
    this.fixedTarget = target.clone();
    this.recompute();
    return 'designating';
  }

  update(dt: number): void {
    if (!this.active) return;
    if (this.overrideArmed) {
      this.overrideElapsed += dt;
      if (this.overrideElapsed >= OVERRIDE_TIMEOUT) {
        this.overrideArmed = false;
        this.recompute();
      }
    }
    this.recompute();
    this.marker?.tick(dt);
  }

  /** LMB / pad-A while designating. Returns true if it consumed the input. */
  confirm(): boolean {
    if (!this.active) return false;

    // Invalid marks (out of range / sky) reject; stay in DESIGNATE to re-aim.
    if (this.gate.status === 'no_ground' || this.gate.status === 'out_of_range') {
      return true;
    }

    // Danger-close: first press arms the override, second press commits.
    if (this.gate.requiresOverride && !this.overrideArmed) {
      this.overrideArmed = true;
      this.overrideElapsed = 0;
      this.renderBanner();
      return true;
    }

    this.commit();
    return true;
  }

  /** Esc / pad-B while designating. Returns true if it consumed the input. */
  cancel(): boolean {
    if (!this.active) return false;
    this.finish();
    return true;
  }

  dispose(): void {
    this.finish();
    this.marker?.dispose();
    this.marker = undefined;
    this.banner.dispose();
  }

  private ensureMarker(): void {
    if (this.marker || !this.scene) return;
    this.marker = new StrikeTargetMarker(this.scene, { terrainHeightAt: this.terrainHeightAt });
  }

  private recompute(): void {
    if (!this.supportType) return;

    const pick = this.fixedTarget
      ? (this.target.copy(this.fixedTarget), { ok: true, hasGround: true })
      : this.pickProvider?.(this.target);
    if (!pick) return;
    const origin = this.origin();
    const distance = horizontalDistanceXZ(origin.x, origin.z, this.target.x, this.target.z);

    const asset = getAirSupportRadioAsset(this.assetId!);
    const dangerCloseRadius = asset.dangerCloseRadius;
    const friendliesInRadius = pick.ok && dangerCloseRadius
      ? (this.friendlyCountInRadius?.(this.target, dangerCloseRadius) ?? 0)
      : 0;

    this.gate = resolveStrikeGate({
      horizontalDistance: distance,
      hasGround: pick.ok && pick.hasGround,
      maxCallRange: STRIKE_MAX_CALL_RANGE[this.supportType],
      dangerCloseRadius,
      friendliesInRadius,
    });

    this.marker?.setState(
      this.target,
      this.gate.status,
      false,
      STRIKE_FOOTPRINT_RADIUS[this.supportType],
    );
    this.renderBanner(distance);
  }

  private renderBanner(distance?: number): void {
    if (!this.assetId) return;
    const label = getAirSupportRadioAsset(this.assetId).label.toUpperCase();

    if (this.overrideArmed) {
      this.banner.showConfirm({
        asset: label,
        gridText: this.gridText(),
        danger: true,
        override: true,
      });
      return;
    }

    const origin = this.origin();
    const dist = distance ?? horizontalDistanceXZ(origin.x, origin.z, this.target.x, this.target.z);

    let statusLabel: string;
    let statusKind: 'valid' | 'invalid' | 'danger';
    switch (this.gate.status) {
      case 'valid': statusLabel = `RANGE ${Math.round(dist)}m`; statusKind = 'valid'; break;
      case 'danger_close': statusLabel = 'DANGER CLOSE'; statusKind = 'danger'; break;
      case 'out_of_range': statusLabel = 'TOO FAR'; statusKind = 'invalid'; break;
      default: statusLabel = 'NO GROUND'; statusKind = 'invalid'; break;
    }

    const hint = this.gate.status === 'danger_close'
      ? '[LMB] mark (danger close)   [Esc] back'
      : '[LMB] mark   [Esc] back';
    this.banner.showDesignate({ asset: label, statusLabel, statusKind, hint });
  }

  private commit(): void {
    if (!this.airSupportManager || !this.supportType) {
      this.finish();
      return;
    }

    const origin = this.origin();
    this.approach.set(this.target.x - origin.x, 0, this.target.z - origin.z);
    if (this.approach.lengthSq() < 1) this.approach.set(0, 0, 1);
    this.approach.normalize();

    const accepted = this.airSupportManager.requestSupport({
      type: this.supportType,
      targetPosition: this.target.clone(),
      approachDirection: this.approach.clone(),
      requesterFaction: Faction.US,
      marking: this.marking,
    });

    if (accepted && this.marking !== 'position_only') {
      // Instant on-target mark so the player sees where they painted before the
      // aircraft arrives (white smoke / brighter willie-pete reuse the pool).
      spawnSmokeCloud(this.target);
    }

    this.finish();
  }

  private finish(): void {
    this.active = false;
    this.assetId = undefined;
    this.supportType = undefined;
    this.fixedTarget = undefined;
    this.overrideArmed = false;
    this.overrideElapsed = 0;
    this.marker?.hide();
    this.banner.hide();
  }

  private origin(): THREE.Vector3 {
    return this.originProvider?.() ?? this.scratchOrigin.set(0, 0, 0);
  }

  private gridText(): string {
    return `GRID ${Math.round(this.target.x)} / ${Math.round(this.target.z)}`;
  }
}
