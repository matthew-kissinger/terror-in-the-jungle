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

  it('uses embedded propeller animation metadata to choose the spin axis', () => {
    const group = createGroupWithPropeller('propeller');
    const clip = new THREE.AnimationClip('PropSpin', 0.4, [
      new THREE.QuaternionKeyframeTrack(
        'propeller.quaternion',
        [0, 0.2, 0.4],
        [
          0, 0, 0, 1,
          1, 0, 0, 0,
          0, 0, 0, -1,
        ],
      ),
    ]);

    animation.initialize('fw-pixel-forge', 'A1_SKYRAIDER', group, [clip]);
    animation.update('fw-pixel-forge', 1.0, 1 / 60);

    const prop = group.getObjectByName('propeller')!;
    expect(prop.rotation.x).not.toBe(0);
    expect(prop.rotation.z).toBe(0);
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

  it('does not spin when isActive is false (parked unpiloted aircraft)', () => {
    const group = createGroupWithPropeller('propeller');
    animation.initialize('fw-parked', 'A1_SKYRAIDER', group);

    for (let i = 0; i < 60; i++) {
      animation.update('fw-parked', 0, 1 / 60, false);
    }

    const prop = group.getObjectByName('propeller')!;
    expect(prop.rotation.z).toBe(0);
  });

  it('still spins at idle (throttle=0) when isActive is true (idle floor)', () => {
    const group = createGroupWithPropeller('propeller');
    animation.initialize('fw-idle', 'A1_SKYRAIDER', group);

    for (let i = 0; i < 60; i++) {
      animation.update('fw-idle', 0, 1 / 60, true);
    }

    const prop = group.getObjectByName('propeller')!;
    expect(prop.rotation.z).not.toBe(0);
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
