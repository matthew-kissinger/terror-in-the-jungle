// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Orbit + zoom controls for the orbital relief mesh.
 *
 * PC: left-drag orbits (azimuth + polar), wheel zooms.
 * Touch: one-finger drag orbits, two-finger pinch zooms.
 *
 * The camera position is a spherical orbit around a fixed target. The pure
 * spherical-clamp + orbit-math lives in `applyOrbitDelta` / `applyZoom` /
 * `orbitToCartesian` so it unit-tests without a renderer; the class wires DOM
 * events and writes the resulting position onto a THREE.Camera each frame an
 * input arrives (render-on-demand: it invokes `onChange`, never a RAF loop).
 */

import * as THREE from 'three';

export interface OrbitState {
  /** Horizontal angle (radians). */
  azimuth: number;
  /** Vertical angle from +Y (radians), clamped away from the poles. */
  polar: number;
  /** Distance from target. */
  radius: number;
}

export interface OrbitLimits {
  minPolar: number;
  maxPolar: number;
  minRadius: number;
  maxRadius: number;
}

export const DEFAULT_ORBIT_LIMITS: OrbitLimits = {
  minPolar: 0.18,
  maxPolar: 1.45,
  minRadius: 40,
  maxRadius: 320,
};

/** Apply an azimuth/polar delta with polar clamped away from the poles. Pure. */
export function applyOrbitDelta(state: OrbitState, dAzimuth: number, dPolar: number, limits: OrbitLimits): OrbitState {
  const polar = Math.max(limits.minPolar, Math.min(limits.maxPolar, state.polar + dPolar));
  return { azimuth: state.azimuth + dAzimuth, polar, radius: state.radius };
}

/** Multiply the orbit radius by `factor`, clamped. Pure. */
export function applyZoom(state: OrbitState, factor: number, limits: OrbitLimits): OrbitState {
  const radius = Math.max(limits.minRadius, Math.min(limits.maxRadius, state.radius * factor));
  return { azimuth: state.azimuth, polar: state.polar, radius };
}

/** Convert an orbit state around `target` to a world camera position. Pure. */
export function orbitToCartesian(state: OrbitState, target: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const sinPolar = Math.sin(state.polar);
  return {
    x: target.x + state.radius * sinPolar * Math.sin(state.azimuth),
    y: target.y + state.radius * Math.cos(state.polar),
    z: target.z + state.radius * sinPolar * Math.cos(state.azimuth),
  };
}

export class OrbitalTopoControls {
  private state: OrbitState;
  private readonly limits: OrbitLimits;
  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly onChange: () => void;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private pinchDistance = 0;
  private readonly orbitSpeed = 0.008;

  private readonly bound: {
    pointerDown: (e: PointerEvent) => void;
    pointerMove: (e: PointerEvent) => void;
    pointerUp: (e: PointerEvent) => void;
    wheel: (e: WheelEvent) => void;
    touchStart: (e: TouchEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchEnd: (e: TouchEvent) => void;
  };

  constructor(opts: {
    camera: THREE.PerspectiveCamera;
    element: HTMLElement;
    onChange: () => void;
    initialState?: Partial<OrbitState>;
    limits?: OrbitLimits;
  }) {
    this.camera = opts.camera;
    this.element = opts.element;
    this.onChange = opts.onChange;
    this.limits = opts.limits ?? DEFAULT_ORBIT_LIMITS;
    this.state = {
      azimuth: opts.initialState?.azimuth ?? Math.PI * 0.25,
      polar: opts.initialState?.polar ?? 0.9,
      radius: opts.initialState?.radius ?? 150,
    };

    this.bound = {
      pointerDown: this.handlePointerDown.bind(this),
      pointerMove: this.handlePointerMove.bind(this),
      pointerUp: this.handlePointerUp.bind(this),
      wheel: this.handleWheel.bind(this),
      touchStart: this.handleTouchStart.bind(this),
      touchMove: this.handleTouchMove.bind(this),
      touchEnd: this.handleTouchEnd.bind(this),
    };

    this.attach();
    this.applyToCamera();
  }

  private attach(): void {
    this.element.addEventListener('pointerdown', this.bound.pointerDown);
    window.addEventListener('pointermove', this.bound.pointerMove);
    window.addEventListener('pointerup', this.bound.pointerUp);
    this.element.addEventListener('wheel', this.bound.wheel, { passive: false });
    this.element.addEventListener('touchstart', this.bound.touchStart, { passive: false });
    this.element.addEventListener('touchmove', this.bound.touchMove, { passive: false });
    this.element.addEventListener('touchend', this.bound.touchEnd, { passive: false });
    this.element.addEventListener('touchcancel', this.bound.touchEnd, { passive: false });
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') return; // touch handled separately
    if (e.button !== 0) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragging || e.pointerType === 'touch') return;
    this.orbitBy(e.clientX - this.lastX, e.clientY - this.lastY);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  private handlePointerUp(_e: PointerEvent): void {
    this.dragging = false;
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    this.state = applyZoom(this.state, e.deltaY > 0 ? 1.12 : 1 / 1.12, this.limits);
    this.applyToCamera();
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 2) {
      this.pinchDistance = this.touchDistance(e.touches[0], e.touches[1]);
    } else if (e.touches.length === 1) {
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = this.touchDistance(e.touches[0], e.touches[1]);
      if (this.pinchDistance > 0) {
        this.state = applyZoom(this.state, this.pinchDistance / dist, this.limits);
        this.applyToCamera();
      }
      this.pinchDistance = dist;
    } else if (e.touches.length === 1) {
      this.orbitBy(e.touches[0].clientX - this.lastX, e.touches[0].clientY - this.lastY);
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    this.pinchDistance = 0;
    if (e.touches.length === 1) {
      this.lastX = e.touches[0].clientX;
      this.lastY = e.touches[0].clientY;
    }
  }

  private orbitBy(dx: number, dy: number): void {
    this.state = applyOrbitDelta(this.state, -dx * this.orbitSpeed, -dy * this.orbitSpeed, this.limits);
    this.applyToCamera();
  }

  private touchDistance(a: Touch, b: Touch): number {
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  private applyToCamera(): void {
    const pos = orbitToCartesian(this.state, this.target);
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.camera.lookAt(this.target);
    this.onChange();
  }

  /** Reset to the initial framing. */
  reset(state?: Partial<OrbitState>): void {
    this.state = {
      azimuth: state?.azimuth ?? Math.PI * 0.25,
      polar: state?.polar ?? 0.9,
      radius: state?.radius ?? 150,
    };
    this.applyToCamera();
  }

  getState(): Readonly<OrbitState> {
    return this.state;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.bound.pointerDown);
    window.removeEventListener('pointermove', this.bound.pointerMove);
    window.removeEventListener('pointerup', this.bound.pointerUp);
    this.element.removeEventListener('wheel', this.bound.wheel);
    this.element.removeEventListener('touchstart', this.bound.touchStart);
    this.element.removeEventListener('touchmove', this.bound.touchMove);
    this.element.removeEventListener('touchend', this.bound.touchEnd);
    this.element.removeEventListener('touchcancel', this.bound.touchEnd);
  }
}
