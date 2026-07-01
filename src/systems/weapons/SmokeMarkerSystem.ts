// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { GameEventBus, type TargetMark } from '../../core/GameEventBus';
import { GrenadeArcRenderer } from './GrenadeArcRenderer';
import { spawnSmokeCloud } from '../effects/SmokeCloudSystem';

const GRAVITY = -42;
const AIR_RESISTANCE = 0.995;
const BOUNCE_DAMPING = 0.32;
const GROUND_FRICTION = 0.62;
const MIN_THROW_FORCE = 14;
const MAX_THROW_FORCE = 52;
const MAX_ARC_POINTS = 90;
const CANISTER_RADIUS = 0.08;
const SETTLE_SPEED_SQ = 1.1;
const BOBBLE_SECONDS = 0.85;

const _start = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _velocity = new THREE.Vector3();
const _nextPosition = new THREE.Vector3();
const _delta = new THREE.Vector3();

interface SmokeCanister {
  id: string;
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotationVelocity: THREE.Vector3;
  settled: boolean;
  bobbleTime: number;
}

export class SmokeMarkerSystem implements GameSystem {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private terrainSystem?: ITerrainRuntime;
  private readonly arcRenderer: GrenadeArcRenderer;
  private equipped = false;
  private charging = false;
  private power = 0.3;
  private powerTime = 0;
  private nextId = 1;
  private activeMark: TargetMark | null = null;
  private readonly canisters: SmokeCanister[] = [];
  private onThrowModeEnd?: () => void;

  constructor(scene: THREE.Scene, camera: THREE.Camera, terrainSystem?: ITerrainRuntime) {
    this.scene = scene;
    this.camera = camera;
    this.terrainSystem = terrainSystem;
    this.arcRenderer = new GrenadeArcRenderer(scene, MAX_ARC_POINTS, 4);
  }

  async init(): Promise<void> {}

  update(deltaTime: number): void {
    if (this.charging) {
      this.powerTime += deltaTime;
      this.power = Math.min(0.3 + (this.powerTime / 1.6) * 0.7, 1.0);
      this.updateArc();
      const landingIndicator = this.arcRenderer.getLandingIndicator();
      if (landingIndicator?.material instanceof THREE.MeshBasicMaterial) {
        landingIndicator.material.opacity = 0.45 + Math.sin(this.powerTime * 9) * 0.12;
      }
    }

    for (let i = this.canisters.length - 1; i >= 0; i--) {
      this.updateCanister(this.canisters[i], deltaTime);
    }
  }

  dispose(): void {
    this.cancelThrowMode();
    for (const canister of this.canisters) {
      this.scene.remove(canister.mesh);
      canister.mesh.geometry.dispose();
      const materials = Array.isArray(canister.mesh.material) ? canister.mesh.material : [canister.mesh.material];
      for (const material of materials) material.dispose();
    }
    this.canisters.length = 0;
    this.arcRenderer.dispose();
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
  }

  setThrowModeEndHook(hook: () => void): void {
    this.onThrowModeEnd = hook;
  }

  beginThrowMode(): void {
    this.equipped = true;
    this.charging = false;
    this.power = 0.3;
    this.powerTime = 0;
    this.arcRenderer.showArc(false);
  }

  beginCharge(): boolean {
    if (!this.equipped) return false;
    this.charging = true;
    this.power = 0.3;
    this.powerTime = 0;
    this.arcRenderer.showArc(true);
    this.updateArc();
    return true;
  }

  releaseThrow(): boolean {
    if (!this.equipped) return false;
    if (!this.charging) {
      this.cancelThrowMode();
      return true;
    }

    this.camera.getWorldDirection(_direction);
    _start.copy(this.camera.position).addScaledVector(_direction, 0.55);
    _start.y -= 0.28;
    SmokeMarkerSystem.computeThrowVelocity(_direction, this.power, _velocity);
    this.spawnCanister(_start, _velocity);
    this.finishThrowMode();
    return true;
  }

  cancelThrowMode(): boolean {
    if (!this.equipped && !this.charging) return false;
    this.finishThrowMode();
    return true;
  }

  isEquippedForThrow(): boolean {
    return this.equipped;
  }

  isCharging(): boolean {
    return this.charging;
  }

  isHandlingInput(): boolean {
    return this.equipped || this.charging;
  }

  getAimingState(): { equipped: boolean; charging: boolean; power: number; estimatedDistance: number } {
    return {
      equipped: this.equipped,
      charging: this.charging,
      power: this.power,
      estimatedDistance: this.charging ? this.updateArc() : 0,
    };
  }

  getActiveMark(): TargetMark | null {
    return this.activeMark;
  }

  clearActiveMark(): void {
    if (!this.activeMark) return;
    const mark = this.activeMark;
    this.activeMark = null;
    GameEventBus.emit('target_mark_cleared', { markId: mark.id });
  }

  updateArc(): number {
    if (!this.charging) return 0;
    return this.arcRenderer.updateArc(
      this.camera,
      this.power,
      GRAVITY,
      MIN_THROW_FORCE,
      MAX_THROW_FORCE,
      (x, z) => this.getGroundHeight(x, z),
      AIR_RESISTANCE,
      BOUNCE_DAMPING,
      GROUND_FRICTION,
    );
  }

  static computeThrowVelocity(direction: THREE.Vector3, power: number, target: THREE.Vector3): THREE.Vector3 {
    const clampedPower = THREE.MathUtils.clamp(power, 0.3, 1);
    const baseThrowAngle = 0.22 + 0.14 * clampedPower;
    _forward.copy(direction);
    _forward.y = 0;
    if (_forward.lengthSq() < 0.0001) _forward.set(0, 0, -1);
    _forward.normalize();

    const force = MIN_THROW_FORCE + (MAX_THROW_FORCE - MIN_THROW_FORCE) * clampedPower;
    target.set(
      _forward.x * Math.cos(baseThrowAngle),
      Math.sin(baseThrowAngle),
      _forward.z * Math.cos(baseThrowAngle),
    );
    target.multiplyScalar(force);
    target.y += Math.max(0, direction.y * 2.2) * clampedPower;
    return target;
  }

  private finishThrowMode(): void {
    this.equipped = false;
    this.charging = false;
    this.power = 0.3;
    this.powerTime = 0;
    this.arcRenderer.showArc(false);
    this.onThrowModeEnd?.();
  }

  private spawnCanister(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.34, 14),
      new THREE.MeshStandardMaterial({ color: 0x7f8670, roughness: 0.72, metalness: 0.32 }),
    );
    mesh.castShadow = true;
    mesh.position.copy(position);
    mesh.rotation.z = Math.PI / 2;
    this.scene.add(mesh);
    this.canisters.push({
      id: `smoke-marker-${this.nextId++}`,
      mesh,
      position: position.clone(),
      velocity: velocity.clone(),
      rotationVelocity: new THREE.Vector3(4.1, 1.7, 2.4),
      settled: false,
      bobbleTime: 0,
    });
  }

  private updateCanister(canister: SmokeCanister, deltaTime: number): void {
    if (canister.settled) {
      if (canister.bobbleTime < BOBBLE_SECONDS) {
        canister.bobbleTime += deltaTime;
        const decay = 1 - Math.min(1, canister.bobbleTime / BOBBLE_SECONDS);
        canister.mesh.position.y = canister.position.y + Math.sin(canister.bobbleTime * 18) * 0.035 * decay;
        canister.mesh.rotation.x += deltaTime * 0.6 * decay;
      }
      return;
    }

    canister.velocity.y += GRAVITY * deltaTime;
    canister.velocity.multiplyScalar(Math.pow(AIR_RESISTANCE, deltaTime * 60));
    _nextPosition.copy(canister.position).add(_delta.copy(canister.velocity).multiplyScalar(deltaTime));

    const groundY = this.getGroundHeight(_nextPosition.x, _nextPosition.z) + CANISTER_RADIUS;
    if (_nextPosition.y <= groundY) {
      _nextPosition.y = groundY;
      if (Math.abs(canister.velocity.y) > 1.4) {
        canister.velocity.y = -canister.velocity.y * BOUNCE_DAMPING;
        canister.velocity.x *= (1 - GROUND_FRICTION * 0.32);
        canister.velocity.z *= (1 - GROUND_FRICTION * 0.32);
        canister.rotationVelocity.multiplyScalar(0.72);
      } else {
        canister.velocity.y = 0;
        canister.velocity.x *= (1 - GROUND_FRICTION);
        canister.velocity.z *= (1 - GROUND_FRICTION);
        canister.rotationVelocity.multiplyScalar(0.65);
      }
    }

    canister.position.copy(_nextPosition);
    canister.mesh.position.copy(canister.position);
    canister.mesh.rotation.x += canister.rotationVelocity.x * deltaTime;
    canister.mesh.rotation.y += canister.rotationVelocity.y * deltaTime;
    canister.mesh.rotation.z += canister.rotationVelocity.z * deltaTime;

    if (canister.position.y <= groundY + 0.001 && canister.velocity.lengthSq() <= SETTLE_SPEED_SQ) {
      this.settleCanister(canister);
    }
  }

  private settleCanister(canister: SmokeCanister): void {
    canister.settled = true;
    canister.velocity.set(0, 0, 0);
    canister.position.y = this.getGroundHeight(canister.position.x, canister.position.z) + CANISTER_RADIUS;
    canister.mesh.position.copy(canister.position);
    const mark: TargetMark = {
      id: canister.id,
      kind: 'smoke-marker',
      position: canister.position.clone(),
      createdAt: performance.now(),
      source: 'player',
    };
    this.activeMark = mark;
    spawnSmokeCloud(mark.position);
    GameEventBus.emit('target_mark_set', { mark });
  }

  private getGroundHeight(x: number, z: number): number {
    return this.terrainSystem?.getEffectiveHeightAt(x, z)
      ?? this.terrainSystem?.getHeightAt(x, z)
      ?? 0;
  }
}
