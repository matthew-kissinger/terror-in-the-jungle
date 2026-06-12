// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FixedWingAnimation } from './FixedWingAnimation';
import { getFixedWingDisplayInfo } from './FixedWingConfigs';

/** Build a GLB-like group whose child node names match the airframe's catalog propeller hubs. */
function createGroupForAirframe(configKey: string): THREE.Group {
  const group = new THREE.Group();
  const display = getFixedWingDisplayInfo(configKey)!;
  for (const nodeName of display.propellerNodes) {
    const prop = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 3));
    prop.name = nodeName;
    group.add(prop);
  }
  return group;
}

/** Spin axis the airframe's catalog declares for its propeller hub. */
function spinAxis(configKey: string): 'x' | 'y' | 'z' {
  return getFixedWingDisplayInfo(configKey)!.propellerSpinAxis;
}

describe('FixedWingAnimation', () => {
  let animation: FixedWingAnimation;

  beforeEach(() => {
    animation = new FixedWingAnimation();
  });

  it('finds and spins the grafted propeller hub (A-1 Skyraider)', () => {
    const group = createGroupForAirframe('A1_SKYRAIDER');
    animation.initialize('fw1', 'A1_SKYRAIDER', group);

    // Run a few frames at full throttle
    for (let i = 0; i < 60; i++) {
      animation.update('fw1', 1.0, 1 / 60);
    }

    const axis = spinAxis('A1_SKYRAIDER');
    const prop = group.getObjectByName(getFixedWingDisplayInfo('A1_SKYRAIDER')!.propellerNodes[0])!;
    expect(prop.rotation[axis]).not.toBe(0);
  });

  it('spins around the catalog-declared axis, not a hardcoded one', () => {
    // Repaint A-1/AC-47 hubs spin around local X (catalog metadata), not Z.
    const group = createGroupForAirframe('A1_SKYRAIDER');
    animation.initialize('fw-axis', 'A1_SKYRAIDER', group);
    animation.update('fw-axis', 1.0, 1 / 60);

    const prop = group.getObjectByName(getFixedWingDisplayInfo('A1_SKYRAIDER')!.propellerNodes[0])!;
    expect(prop.rotation.x).not.toBe(0);
    expect(prop.rotation.z).toBe(0);
  });

  it('lets a surviving animation track override the spin axis per node', () => {
    const group = createGroupForAirframe('A1_SKYRAIDER');
    const hubName = getFixedWingDisplayInfo('A1_SKYRAIDER')!.propellerNodes[0];
    const clip = new THREE.AnimationClip('PropSpin', 0.4, [
      // A track that rotates predominantly around Y, overriding the catalog X.
      new THREE.QuaternionKeyframeTrack(
        `${hubName}.quaternion`,
        [0, 0.2, 0.4],
        [
          0, 0, 0, 1,
          0, 1, 0, 0,
          0, 0, 0, -1,
        ],
      ),
    ]);

    animation.initialize('fw-clip', 'A1_SKYRAIDER', group, [clip]);
    animation.update('fw-clip', 1.0, 1 / 60);

    const prop = group.getObjectByName(hubName)!;
    expect(prop.rotation.y).not.toBe(0);
    expect(prop.rotation.x).toBe(0);
  });

  it('finds and spins twin propeller hubs (AC-47 Spooky)', () => {
    const group = createGroupForAirframe('AC47_SPOOKY');
    animation.initialize('fw2', 'AC47_SPOOKY', group);

    for (let i = 0; i < 60; i++) {
      animation.update('fw2', 1.0, 1 / 60);
    }

    const axis = spinAxis('AC47_SPOOKY');
    const nodes = getFixedWingDisplayInfo('AC47_SPOOKY')!.propellerNodes;
    expect(nodes.length).toBe(2);
    for (const name of nodes) {
      expect(group.getObjectByName(name)!.rotation[axis]).not.toBe(0);
    }
  });

  it('spins faster at higher throttle', () => {
    const groupLow = createGroupForAirframe('A1_SKYRAIDER');
    const groupHigh = createGroupForAirframe('A1_SKYRAIDER');
    const animLow = new FixedWingAnimation();
    const animHigh = new FixedWingAnimation();

    animLow.initialize('low', 'A1_SKYRAIDER', groupLow);
    animHigh.initialize('high', 'A1_SKYRAIDER', groupHigh);

    for (let i = 0; i < 60; i++) {
      animLow.update('low', 0.2, 1 / 60);
      animHigh.update('high', 1.0, 1 / 60);
    }

    const axis = spinAxis('A1_SKYRAIDER');
    const name = getFixedWingDisplayInfo('A1_SKYRAIDER')!.propellerNodes[0];
    const propLow = groupLow.getObjectByName(name)!;
    const propHigh = groupHigh.getObjectByName(name)!;
    expect(Math.abs(propHigh.rotation[axis])).toBeGreaterThan(Math.abs(propLow.rotation[axis]));
  });

  it('does not spin when isActive is false (parked unpiloted aircraft)', () => {
    const group = createGroupForAirframe('A1_SKYRAIDER');
    animation.initialize('fw-parked', 'A1_SKYRAIDER', group);

    for (let i = 0; i < 60; i++) {
      animation.update('fw-parked', 0, 1 / 60, false);
    }

    const axis = spinAxis('A1_SKYRAIDER');
    const prop = group.getObjectByName(getFixedWingDisplayInfo('A1_SKYRAIDER')!.propellerNodes[0])!;
    expect(prop.rotation[axis]).toBe(0);
  });

  it('still spins at idle (throttle=0) when isActive is true (idle floor)', () => {
    const group = createGroupForAirframe('A1_SKYRAIDER');
    animation.initialize('fw-idle', 'A1_SKYRAIDER', group);

    for (let i = 0; i < 60; i++) {
      animation.update('fw-idle', 0, 1 / 60, true);
    }

    const axis = spinAxis('A1_SKYRAIDER');
    const prop = group.getObjectByName(getFixedWingDisplayInfo('A1_SKYRAIDER')!.propellerNodes[0])!;
    expect(prop.rotation[axis]).not.toBe(0);
  });

  it('cleans up on dispose', () => {
    const group = createGroupForAirframe('A1_SKYRAIDER');
    animation.initialize('fw1', 'A1_SKYRAIDER', group);
    animation.dispose('fw1');

    const axis = spinAxis('A1_SKYRAIDER');
    const name = getFixedWingDisplayInfo('A1_SKYRAIDER')!.propellerNodes[0];
    const propBefore = group.getObjectByName(name)!.rotation[axis];
    animation.update('fw1', 1.0, 1 / 60);
    expect(group.getObjectByName(name)!.rotation[axis]).toBe(propBefore);
  });
});
