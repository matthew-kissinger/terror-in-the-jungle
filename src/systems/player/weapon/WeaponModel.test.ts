// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WeaponModel } from './WeaponModel';
import type { WeaponRigManager } from './WeaponRigManager';
import type { WeaponAnimations } from './WeaponAnimations';
import type { WeaponReload } from './WeaponReload';

const DEFAULT_ADS = { x: 0.0, y: -0.18, z: -0.55 };
const LMG_ADS = { x: 0.0, y: -0.35, z: -0.62 };

function makeAnimations(
  adsProgress = 0,
  basePosition = { x: 0.5, y: -0.6, z: -0.82 },
): WeaponAnimations {
  return {
    getADSProgress: () => adsProgress,
    getBasePosition: () => basePosition,
    // Mirror the real per-weapon resolution: the bulky lmg gets a lower offset,
    // every other weapon (and the no-arg call) gets the default.
    getADSPosition: (weaponType?: string) =>
      weaponType === 'lmg' ? LMG_ADS : DEFAULT_ADS,
    getRecoilOffset: () => ({ x: 0, y: 0, z: 0, rotX: 0 }),
    getBobOffset: () => ({ x: 0, y: 0 }),
    getSwayOffset: () => ({ x: 0, y: 0 }),
  } as unknown as WeaponAnimations;
}

function makeReload(): WeaponReload {
  return {
    getReloadTranslation: () => ({ x: 0, y: 0, z: 0 }),
    getReloadRotation: () => ({ x: 0, y: 0, z: 0 }),
  } as unknown as WeaponReload;
}

function makeModel(
  animations: WeaponAnimations = makeAnimations(),
  reload: WeaponReload = makeReload(),
): WeaponModel {
  return new WeaponModel(animations, reload);
}

function makeRigManager(
  rig: THREE.Group,
  weaponType = 'rifle',
): WeaponRigManager {
  return {
    getCurrentRig: () => rig,
    getSwitchOffset: () => ({ y: 0, rotX: 0 }),
    getCurrentWeaponType: () => weaponType,
  } as unknown as WeaponRigManager;
}

describe('WeaponModel presentation', () => {
  let model: WeaponModel | undefined;

  beforeEach(() => {
    vi.stubGlobal('window', {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    model?.dispose();
    model = undefined;
    vi.unstubAllGlobals();
  });

  it('keeps hip-fire weapon presentation lower and less up-tilted than the old raised pose', () => {
    const rig = new THREE.Group();
    model = makeModel(makeAnimations(0));

    model.updateTransform(makeRigManager(rig));

    expect(rig.position.y).toBeLessThan(-0.55);
    expect(rig.position.z).toBeLessThan(-0.8);
    expect(THREE.MathUtils.radToDeg(rig.rotation.x)).toBeLessThan(10);
  });

  it('still levels the weapon toward ADS sight alignment', () => {
    const rig = new THREE.Group();
    model = makeModel(makeAnimations(1));

    model.updateTransform(makeRigManager(rig));

    expect(rig.rotation.x).toBeCloseTo(0, 4);
    expect(rig.position.y).toBeCloseTo(-0.18, 4);
  });

  it('applies the per-weapon ADS offset routed through the rig manager so the bulky LMG sits lower than the rifle when aimed', () => {
    const rifleRig = new THREE.Group();
    const lmgRig = new THREE.Group();
    model = makeModel(makeAnimations(1)); // fully aimed

    model.updateTransform(makeRigManager(rifleRig, 'rifle'));
    model.updateTransform(makeRigManager(lmgRig, 'lmg'));

    // The LMG resolves a distinct, lower sight-line pose than the rifle default,
    // clearing its receiver from the sights.
    expect(lmgRig.position.y).toBeLessThan(rifleRig.position.y);
  });

  it('opts the overlay scene out of automatic full-scene matrix walks', () => {
    model = makeModel();

    expect(model.getWeaponScene().matrixWorldAutoUpdate).toBe(false);
  });

  it('updates the active rig world matrix after applying viewmodel transforms', () => {
    const rig = new THREE.Group();
    const updateMatrixWorld = vi.spyOn(rig, 'updateMatrixWorld');
    const rigManager = makeRigManager(rig);
    model = makeModel(makeAnimations(0, { x: 0.5, y: -0.45, z: -0.75 }));

    model.updateTransform(rigManager);

    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
  });

  it('updates only the active visible rig before rendering the overlay', () => {
    const rig = new THREE.Group();
    const updateMatrixWorld = vi.spyOn(rig, 'updateMatrixWorld');
    const rigManager = {
      getCurrentRig: vi.fn(() => rig),
    } as unknown as WeaponRigManager;
    const renderer = {
      autoClear: true,
      clearDepth: vi.fn(),
      render: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
    model = makeModel();

    model.render(renderer, rigManager);

    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
    expect(renderer.clearDepth).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledWith(model.getWeaponScene(), model.getWeaponCamera());
    expect(renderer.autoClear).toBe(true);
  });

  it('does not repeat the active rig matrix walk after updateTransform already refreshed it', () => {
    const rig = new THREE.Group();
    const updateMatrixWorld = vi.spyOn(rig, 'updateMatrixWorld');
    const rigManager = makeRigManager(rig);
    const renderer = {
      autoClear: true,
      clearDepth: vi.fn(),
      render: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
    model = makeModel();

    model.updateTransform(rigManager);
    updateMatrixWorld.mockClear();
    model.render(renderer, rigManager);

    expect(updateMatrixWorld).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledWith(model.getWeaponScene(), model.getWeaponCamera());
  });
});
