import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HelicopterAnimation } from './HelicopterAnimation';

function createPhysics(engineRPM: number) {
  return {
    getState: () => ({
      engineRPM,
    }),
  } as any;
}

describe('HelicopterAnimation', () => {
  it('spins cached main and tail rotor roots', () => {
    const animation = new HelicopterAnimation();
    const helicopter = new THREE.Group();
    const mainRotor = new THREE.Group();
    mainRotor.userData.type = 'mainBlades';
    const tailRotor = new THREE.Group();
    tailRotor.userData.type = 'tailBlades';
    helicopter.add(mainRotor);
    helicopter.add(tailRotor);

    animation.initialize('heli-1', helicopter);
    animation.updateRotors(helicopter, 'heli-1', createPhysics(0.75), 0.1);

    expect(mainRotor.rotation.y).not.toBe(0);
    expect(tailRotor.rotation.z).not.toBe(0);
  });

  it('lazily resolves rotor roots if the helicopter was initialized without a group', () => {
    const animation = new HelicopterAnimation();
    const helicopter = new THREE.Group();
    const mainRotor = new THREE.Group();
    mainRotor.userData.type = 'mainBlades';
    helicopter.add(mainRotor);

    animation.initialize('heli-2');
    animation.updateRotors(helicopter, 'heli-2', createPhysics(0.5), 0.1);

    expect(mainRotor.rotation.y).not.toBe(0);
  });

  it('stops updating disposed rotor state', () => {
    const animation = new HelicopterAnimation();
    const helicopter = new THREE.Group();
    const mainRotor = new THREE.Group();
    mainRotor.userData.type = 'mainBlades';
    helicopter.add(mainRotor);

    animation.initialize('heli-3', helicopter);
    animation.dispose('heli-3');
    animation.updateRotors(helicopter, 'heli-3', createPhysics(1), 0.1);

    expect(mainRotor.rotation.y).toBe(0);
  });
});
