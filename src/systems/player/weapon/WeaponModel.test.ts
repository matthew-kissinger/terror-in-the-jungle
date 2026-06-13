// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WeaponModel } from './WeaponModel';
import type { WeaponRigManager } from './WeaponRigManager';
import type { WeaponAnimations } from './WeaponAnimations';
import type { WeaponReload } from './WeaponReload';

function makeAnimations(adsProgress = 0): WeaponAnimations {
  return {
    getADSProgress: () => adsProgress,
    getBasePosition: () => ({ x: 0.5, y: -0.6, z: -0.82 }),
    getADSPosition: () => ({ x: 0.0, y: -0.18, z: -0.55 }),
    getRecoilOffset: () => ({ x: 0, y: 0, z: 0, rotX: 0 }),
    getBobOffset: () => ({ x: 0, y: 0 }),
    getSwayOffset: () => ({ x: 0, y: 0 }),
  } as unknown as WeaponAnimations;
}

function makeReload(): WeaponReload {
  return {
    getReloadTranslation: () => ({ x: 0, y: 0, z: 0 }),
    getReloadRotation: () => ({ x: 0, z: 0 }),
  } as unknown as WeaponReload;
}

function makeRigManager(rig: THREE.Group): WeaponRigManager {
  return {
    getCurrentRig: () => rig,
    getSwitchOffset: () => ({ y: 0, rotX: 0 }),
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
    model = new WeaponModel(makeAnimations(0), makeReload());

    model.updateTransform(makeRigManager(rig));

    expect(rig.position.y).toBeLessThan(-0.55);
    expect(rig.position.z).toBeLessThan(-0.8);
    expect(THREE.MathUtils.radToDeg(rig.rotation.x)).toBeLessThan(10);
  });

  it('still levels the weapon toward ADS sight alignment', () => {
    const rig = new THREE.Group();
    model = new WeaponModel(makeAnimations(1), makeReload());

    model.updateTransform(makeRigManager(rig));

    expect(rig.rotation.x).toBeCloseTo(0, 4);
    expect(rig.position.y).toBeCloseTo(-0.18, 4);
  });
});
