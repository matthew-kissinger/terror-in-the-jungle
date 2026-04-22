import * as THREE from 'three';
import { Logger } from '../../utils/Logger';

/**
 * Detached spectator / free-fly camera for debug drill-in.
 *
 * Owns its own PerspectiveCamera. On `activate(source)` we copy pose and
 * projection from the main camera so the view doesn't jump-cut. The engine
 * renders through this camera while active; PlayerController keeps updating
 * the main camera off-screen, so the player view snaps back intact on
 * deactivate. No listeners here — `GameEngineInput` feeds input via
 * `applyMouseDelta`/`update(dt, input)`.
 */

const UP = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _followScratch = new THREE.Vector3();

const BASE_SPEED_MPS = 25;
const FAST_MULT = 4;
const SLOW_MULT = 0.25;
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.01;

export interface FreeFlyInput {
  forward: boolean; back: boolean; left: boolean; right: boolean;
  up: boolean;     // E (Q/E = down/up per brief)
  down: boolean;   // Q
  fast: boolean;   // Shift
  slow: boolean;   // Ctrl
}

export interface FollowTarget {
  getPosition(target: THREE.Vector3): THREE.Vector3 | null;
}

export class FreeFlyCamera {
  private readonly camera: THREE.PerspectiveCamera;
  private active = false;
  private yaw = 0;
  private pitch = 0;
  private followTarget: FollowTarget | null = null;
  private followDistance = 15;
  private followHeight = 5;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 5000);
  }

  getCamera(): THREE.PerspectiveCamera { return this.camera; }
  isActive(): boolean { return this.active; }
  hasFollowTarget(): boolean { return this.followTarget !== null; }

  activate(source: THREE.PerspectiveCamera): void {
    if (this.active) return;
    this.camera.fov = source.fov;
    this.camera.aspect = source.aspect;
    this.camera.near = source.near;
    this.camera.far = Math.max(source.far, 5000);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(source.position);
    this.camera.quaternion.copy(source.quaternion);
    // Derive yaw/pitch so the first mouse delta doesn't snap to identity.
    _euler.setFromQuaternion(source.quaternion, 'YXZ');
    this.yaw = _euler.y;
    this.pitch = _euler.x;
    this.active = true;
    this.followTarget = null;
    Logger.info('free-fly-camera', 'Activated');
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.followTarget = null;
    Logger.info('free-fly-camera', 'Deactivated');
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  applyMouseDelta(dx: number, dy: number): void {
    if (!this.active) return;
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  }

  setFollowTarget(target: FollowTarget | null): void { this.followTarget = target; }

  update(dt: number, input: FreeFlyInput): void {
    if (!this.active) return;

    _euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    if (this.followTarget) {
      const pos = this.followTarget.getPosition(_followScratch);
      if (pos) {
        _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.camera.position.set(
          pos.x - _forward.x * this.followDistance,
          pos.y + this.followHeight,
          pos.z - _forward.z * this.followDistance,
        );
        return;
      }
      this.followTarget = null;  // target despawned; drop the lock.
    }

    let speed = BASE_SPEED_MPS;
    if (input.fast) speed *= FAST_MULT;
    if (input.slow) speed *= SLOW_MULT;
    const step = speed * dt;

    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);

    if (input.forward) this.camera.position.addScaledVector(_forward, step);
    if (input.back)    this.camera.position.addScaledVector(_forward, -step);
    if (input.right)   this.camera.position.addScaledVector(_right,   step);
    if (input.left)    this.camera.position.addScaledVector(_right,  -step);
    if (input.up)      this.camera.position.addScaledVector(UP,       step);
    if (input.down)    this.camera.position.addScaledVector(UP,      -step);
  }
}
