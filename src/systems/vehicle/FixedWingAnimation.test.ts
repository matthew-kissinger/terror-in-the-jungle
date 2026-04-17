import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FixedWingAnimation } from './FixedWingAnimation';

function createGroupWithPropeller(propName: string): THREE.Group {
  const group = new THREE.Group();
  const prop = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 3));
  prop.name = propName;
  group.add(prop);
  return group;
}

function createGroupWithTwinProps(): THREE.Group {
  const group = new THREE.Group();
  const propL = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 3));
  propL.name = 'propLeft';
  const propR = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 3));
  propR.name = 'propRight';
  group.add(propL);
  group.add(propR);
  return group;
}

describe('FixedWingAnimation', () => {
  let animation: FixedWingAnimation;

  beforeEach(() => {
    animation = new FixedWingAnimation();
  });

  it('finds and spins a single propeller (A-1 Skyraider)', () => {
    const group = createGroupWithPropeller('propeller');
    animation.initialize('fw1', 'A1_SKYRAIDER', group);

    // Run a few frames at full throttle
    for (let i = 0; i < 60; i++) {
      animation.update('fw1', 1.0, 1 / 60);
    }

    const prop = group.getObjectByName('propeller')!;
    expect(prop.rotation.z).not.toBe(0);
  });

  it('finds and spins twin propellers (AC-47 Spooky)', () => {
    const group = createGroupWithTwinProps();
    animation.initialize('fw2', 'AC47_SPOOKY', group);

    for (let i = 0; i < 60; i++) {
      animation.update('fw2', 1.0, 1 / 60);
    }

    const propL = group.getObjectByName('propLeft')!;
    const propR = group.getObjectByName('propRight')!;
    expect(propL.rotation.z).not.toBe(0);
    expect(propR.rotation.z).not.toBe(0);
  });

  it('spins faster at higher throttle', () => {
    const groupLow = createGroupWithPropeller('propeller');
    const groupHigh = createGroupWithPropeller('propeller');
    const animLow = new FixedWingAnimation();
    const animHigh = new FixedWingAnimation();

    animLow.initialize('low', 'A1_SKYRAIDER', groupLow);
    animHigh.initialize('high', 'A1_SKYRAIDER', groupHigh);

    for (let i = 0; i < 60; i++) {
      animLow.update('low', 0.2, 1 / 60);
      animHigh.update('high', 1.0, 1 / 60);
    }

    const propLow = groupLow.getObjectByName('propeller')!;
    const propHigh = groupHigh.getObjectByName('propeller')!;
    expect(Math.abs(propHigh.rotation.z)).toBeGreaterThan(Math.abs(propLow.rotation.z));
  });

  it('cleans up on dispose', () => {
    const group = createGroupWithPropeller('propeller');
    animation.initialize('fw1', 'A1_SKYRAIDER', group);
    animation.dispose('fw1');

    // Should not spin after dispose (no-op)
    const propBefore = group.getObjectByName('propeller')!.rotation.z;
    animation.update('fw1', 1.0, 1 / 60);
    expect(group.getObjectByName('propeller')!.rotation.z).toBe(propBefore);
  });
});
