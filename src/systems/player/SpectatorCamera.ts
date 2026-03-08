import * as THREE from 'three';
import { Faction } from '../combat/types';
import { Logger } from '../../utils/Logger';

/** Minimal candidate data required for spectating. */
export interface SpectatorCandidate {
  id: string;
  position: THREE.Vector3;
  faction?: Faction;
}

// ── Camera constants ──
const FOLLOW_OFFSET = new THREE.Vector3(0, 3, -8);
const LERP_SPEED = 4.0;
const OVERHEAD_HEIGHT = 30;
const MOUSE_SENSITIVITY = 0.003;

const _desiredPosition = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _offset = new THREE.Vector3();

/**
 * Third-person spectator camera that smoothly follows alive teammates.
 * Activates after the death presentation finishes. Self-contained - does not
 * modify DeathCamSystem or PlayerRespawnManager.
 */
export class SpectatorCamera {
  private camera: THREE.PerspectiveCamera;
  private active = false;
  private currentTargetId: string | null = null;
  private candidateIds: string[] = [];
  private yawAngle = 0;

  // Stored camera state for restoration
  private savedPosition?: THREE.Vector3;
  private savedQuaternion?: THREE.Quaternion;

  // Overhead fallback
  private lastKnownPosition = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /**
   * Start spectating the given candidates. Picks the first valid target.
   */
  activate(candidates: SpectatorCandidate[]): void {
    if (this.active) return;

    this.savedPosition = this.camera.position.clone();
    this.savedQuaternion = this.camera.quaternion.clone();

    this.active = true;
    this.yawAngle = 0;
    this.candidateIds = candidates.map(c => c.id);

    if (candidates.length > 0) {
      this.currentTargetId = candidates[0].id;
      this.lastKnownPosition.copy(candidates[0].position);
      Logger.info('player', `Spectator camera activated, watching ${this.currentTargetId}`);
    } else {
      this.currentTargetId = null;
      Logger.info('player', 'Spectator camera activated, no targets - overhead fallback');
    }
  }

  /**
   * Stop spectating and restore camera state.
   */
  deactivate(): void {
    if (!this.active) return;

    this.active = false;
    this.currentTargetId = null;
    this.candidateIds = [];

    if (this.savedPosition && this.savedQuaternion) {
      this.camera.position.copy(this.savedPosition);
      this.camera.quaternion.copy(this.savedQuaternion);
    }

    this.savedPosition = undefined;
    this.savedQuaternion = undefined;
    Logger.info('player', 'Spectator camera deactivated');
  }

  /**
   * Cycle to the next alive candidate.
   */
  nextTarget(): void {
    if (!this.active || this.candidateIds.length === 0) return;
    this.cycleTarget(1);
  }

  /**
   * Cycle to the previous alive candidate.
   */
  prevTarget(): void {
    if (!this.active || this.candidateIds.length === 0) return;
    this.cycleTarget(-1);
  }

  /**
   * Per-frame update. Smooth-follows the current target or falls back to overhead.
   */
  update(dt: number, candidates: SpectatorCandidate[]): void {
    if (!this.active) return;

    // Rebuild candidate list each frame
    this.candidateIds = candidates.map(c => c.id);

    // If current target is gone (died), auto-advance
    const currentTarget = candidates.find(c => c.id === this.currentTargetId);
    if (!currentTarget) {
      this.autoAdvance(candidates);
    }

    const target = candidates.find(c => c.id === this.currentTargetId);
    if (target) {
      this.lastKnownPosition.copy(target.position);
      this.updateFollowCamera(dt, target.position);
    } else {
      this.updateOverheadCamera(dt);
    }
  }

  /**
   * Apply mouse movement to rotate the spectator view around the target.
   */
  applyMouseDelta(deltaX: number): void {
    if (!this.active) return;
    this.yawAngle += deltaX * MOUSE_SENSITIVITY;
  }

  isActive(): boolean {
    return this.active;
  }

  getCurrentTargetId(): string | null {
    return this.active ? this.currentTargetId : null;
  }

  // ── Private helpers ──

  private cycleTarget(direction: 1 | -1): void {
    if (this.candidateIds.length === 0) {
      this.currentTargetId = null;
      return;
    }

    const currentIndex = this.currentTargetId
      ? this.candidateIds.indexOf(this.currentTargetId)
      : -1;

    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = 0;
    } else {
      nextIndex = (currentIndex + direction + this.candidateIds.length) % this.candidateIds.length;
    }

    this.currentTargetId = this.candidateIds[nextIndex];
    this.yawAngle = 0;
    Logger.info('player', `Spectator camera now watching ${this.currentTargetId}`);
  }

  private autoAdvance(candidates: SpectatorCandidate[]): void {
    if (candidates.length === 0) {
      this.currentTargetId = null;
      return;
    }

    // Try to pick the next candidate in order after the old one
    const oldIndex = this.currentTargetId
      ? this.candidateIds.indexOf(this.currentTargetId)
      : -1;

    // candidateIds was already rebuilt, so pick index 0 as fallback
    const nextIndex = oldIndex >= 0 && oldIndex < candidates.length
      ? Math.min(oldIndex, candidates.length - 1)
      : 0;

    this.currentTargetId = candidates[nextIndex].id;
    this.yawAngle = 0;
    Logger.info('player', `Spectator auto-advanced to ${this.currentTargetId}`);
  }

  private updateFollowCamera(dt: number, targetPosition: THREE.Vector3): void {
    // Compute offset rotated by yaw
    _offset.copy(FOLLOW_OFFSET);
    _offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yawAngle);

    // Desired camera position = target + rotated offset
    _desiredPosition.copy(targetPosition).add(_offset);

    // Smooth lerp
    const lerpFactor = 1 - Math.exp(-LERP_SPEED * dt);
    this.camera.position.lerp(_desiredPosition, lerpFactor);

    // Look at target (slightly above ground level for chest height)
    _lookTarget.copy(targetPosition);
    _lookTarget.y += 1.2;
    this.camera.lookAt(_lookTarget);
  }

  private updateOverheadCamera(dt: number): void {
    // Fixed overhead camera looking down at last known position
    _desiredPosition.set(
      this.lastKnownPosition.x,
      this.lastKnownPosition.y + OVERHEAD_HEIGHT,
      this.lastKnownPosition.z
    );

    const lerpFactor = 1 - Math.exp(-LERP_SPEED * dt);
    this.camera.position.lerp(_desiredPosition, lerpFactor);

    _lookTarget.copy(this.lastKnownPosition);
    this.camera.lookAt(_lookTarget);
  }
}
