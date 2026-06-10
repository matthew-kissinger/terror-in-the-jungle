/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { EmplacementPlayerAdapter } from './EmplacementPlayerAdapter';
import { Emplacement, type EmplacementConfig } from './Emplacement';
import { M2HBWeapon } from '../combat/weapons/M2HBWeapon';
import { Faction } from '../combat/types';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// CSS-module proxy so the panel's class lookups resolve under jsdom.
vi.mock('../../ui/hud/EmplacementGunPanel.module.css', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

function makeEmplacement(config?: EmplacementConfig): Emplacement {
  const scene = new THREE.Scene();
  const tripod = new THREE.Object3D();
  tripod.position.set(20, 1.2, 30);
  scene.add(tripod);
  scene.updateMatrixWorld(true);
  return new Emplacement('m2hb_emp_1', tripod, Faction.US, config ? { config } : {});
}

function createPlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    speed: 10, runSpeed: 20, isRunning: false, isGrounded: true, isJumping: false,
    jumpForce: 12, gravity: -25, isCrouching: false,
    isInHelicopter: false, helicopterId: null,
    isInFixedWing: false, fixedWingId: null,
  };
}

function createTransitionContext(): VehicleTransitionContext {
  return {
    playerState: createPlayerState(),
    vehicleId: 'm2hb_emp_1',
    position: new THREE.Vector3(20, 5, 30),
    setPosition: vi.fn(),
    input: {
      setInHelicopter: vi.fn(), setFlightVehicleMode: vi.fn(), setInputContext: vi.fn(),
      isKeyPressed: vi.fn(() => false), isMouseButtonPressed: vi.fn(() => false),
      getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })), clearMouseMovement: vi.fn(),
      getIsPointerLocked: vi.fn(() => false), getTouchControls: vi.fn(() => null),
      getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
      getTouchFlightCyclicInput: vi.fn(() => ({ pitch: 0, roll: 0 })),
      relockPointer: vi.fn(),
    } as any,
    cameraController: {
      saveInfantryAngles: vi.fn(), restoreInfantryAngles: vi.fn(),
    } as any,
    hudSystem: { setVehicleContext: vi.fn() } as any,
    gameRenderer: { setCrosshairMode: vi.fn() } as any,
  };
}

function updateCtx(ctx: VehicleTransitionContext): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input: ctx.input,
    cameraController: ctx.cameraController,
    hudSystem: ctx.hudSystem,
  };
}

describe('EmplacementPlayerAdapter — gun experience (jsdom)', () => {
  let adapter: EmplacementPlayerAdapter;
  let model: Emplacement;
  let weapon: M2HBWeapon;
  let host: HTMLElement;

  beforeEach(() => {
    model = makeEmplacement();
    weapon = new M2HBWeapon();
    adapter = new EmplacementPlayerAdapter(model);
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  const countText = () =>
    adapter.getPanel().element.querySelector('[data-ref="count"]')?.textContent;

  it('mounts the belt panel into the HUD host on gunner-seat entry, seeded with the full belt', () => {
    adapter.setHudPanelHost(host, weapon);
    expect(adapter.getPanel().mounted).toBe(false);

    adapter.onEnter(createTransitionContext());

    expect(adapter.getPanel().mounted).toBe(true);
    expect(host.contains(adapter.getPanel().element)).toBe(true);
    expect(countText()).toBe('250');
  });

  it('decrements the belt readout as the gun fires, then refills after dismount/remount', () => {
    adapter.setHudPanelHost(host, weapon);
    const ctx = createTransitionContext();
    adapter.onEnter(ctx);
    expect(countText()).toBe('250');

    // Fire ten rounds (the M2HB system would cycle these; here we cycle the
    // weapon directly and let the adapter's per-frame refresh mirror it).
    for (let i = 0; i < 10; i++) {
      weapon.tryFire();
      weapon.update(1); // clear the cyclic cooldown so the next round can cycle
    }
    adapter.update(updateCtx(ctx));
    expect(countText()).toBe('240');

    // Dismount: the existing reload-on-dismount path refills the box. Remount
    // shows a full belt again.
    adapter.onExit(ctx);
    expect(adapter.getPanel().mounted).toBe(false);
    weapon.reload();

    adapter.onEnter(ctx);
    expect(countText()).toBe('250');
  });

  it('lights the LOW belt state once the box runs down past the threshold', () => {
    adapter.setHudPanelHost(host, weapon);
    const ctx = createTransitionContext();
    adapter.onEnter(ctx);

    const countLow = () =>
      adapter.getPanel().element.querySelector('[data-ref="count"]')?.classList.contains('countLow');
    expect(countLow()).toBe(false);

    // Drain the belt down to a sliver.
    for (let i = 0; i < 230; i++) {
      weapon.tryFire();
      weapon.update(1);
    }
    adapter.update(updateCtx(ctx));
    expect(countText()).toBe('020');
    expect(countLow()).toBe(true);
  });

  it('fires the traverse cue at the pitch stops and clears it mid-travel', () => {
    adapter.setHudPanelHost(host, weapon);
    const ctx = createTransitionContext();
    adapter.onEnter(ctx);

    const stopUpLit = () =>
      adapter.getPanel().element.querySelector('[data-ref="stopUp"]')?.classList.contains('stopActive');

    // No stop while the barrel is level.
    adapter.update(updateCtx(ctx));
    expect(adapter.getTraverseStop()).toBeNull();
    expect(stopUpLit()).toBe(false);

    // Drive the barrel hard up past the elevation limit; the model clamps the
    // target to the stop, and the adapter cues it.
    model.setAim(0, Math.PI); // far past the +60° envelope
    adapter.update(updateCtx(ctx));
    expect(adapter.getTraverseStop()).toBe('up');
    expect(stopUpLit()).toBe(true);

    // Bring it back to level — cue clears.
    model.setAim(0, 0);
    adapter.update(updateCtx(ctx));
    expect(adapter.getTraverseStop()).toBeNull();
    expect(stopUpLit()).toBe(false);
  });

  it('cues left/right stops for a limited-arc emplacement at its yaw envelope', () => {
    const DEG = Math.PI / 180;
    model = makeEmplacement({ yawLimits: { min: -45 * DEG, max: 45 * DEG } });
    adapter = new EmplacementPlayerAdapter(model);
    adapter.setHudPanelHost(host, weapon);
    const ctx = createTransitionContext();
    adapter.onEnter(ctx);

    model.setAim(Math.PI, 0); // far past the +45° (left) yaw stop
    adapter.update(updateCtx(ctx));
    expect(adapter.getTraverseStop()).toBe('left');

    model.setAim(-Math.PI, 0); // far past the -45° (right) yaw stop
    adapter.update(updateCtx(ctx));
    expect(adapter.getTraverseStop()).toBe('right');
  });

  it('applies a subtle visual-only camera recoil after a shot without moving the aim', () => {
    adapter.setHudPanelHost(host, weapon);
    const ctx = createTransitionContext();
    adapter.onEnter(ctx);

    // Resting pose (no recoil): record the eye + look-target.
    const restEye = new THREE.Vector3();
    const restLook = new THREE.Vector3();
    adapter.computeBarrelCamera(restEye, restLook);

    // Fire one round → the weapon carries a live recoil offset.
    weapon.tryFire();
    expect(weapon.getRecoilOffsetM()).toBeGreaterThan(0);

    const recoilEye = new THREE.Vector3();
    const recoilLook = new THREE.Vector3();
    adapter.computeBarrelCamera(recoilEye, recoilLook);

    // The eye pulled back (moved, not identical) and the look-target lifted
    // (muzzle climb) — a visible kick.
    expect(recoilEye.distanceTo(restEye)).toBeGreaterThan(0);
    expect(recoilLook.y).toBeGreaterThan(restLook.y);
  });

  it('stays headless-safe when no host is injected (no panel, no throw)', () => {
    // No setHudPanelHost → onEnter must not throw and must not mount a panel.
    expect(() => adapter.onEnter(createTransitionContext())).not.toThrow();
    expect(adapter.getPanel().mounted).toBe(false);
  });
});
