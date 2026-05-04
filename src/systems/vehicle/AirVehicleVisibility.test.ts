/**
 * L1 behavior tests for `shouldSimulateAirVehicle`. The helper is a pure
 * function that gates `FixedWingModel`'s per-frame `airframe.step()` call —
 * parked / idle unpiloted aircraft far from the camera skip the physics path
 * entirely. Tests assert the observable contract (piloted always simulates,
 * airborne NPC aircraft always simulate, unpiloted parked aircraft cull by
 * camera distance with hysteresis) rather than the exact distance constant.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shouldRenderAirVehicle, shouldSimulateAirVehicle } from './AirVehicleVisibility';

function makeCamera(position: THREE.Vector3): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  camera.position.copy(position);
  return camera;
}

function makeFoggyScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x888888, 50, 450);
  return scene;
}

describe('shouldSimulateAirVehicle', () => {
  it('always simulates a piloted aircraft regardless of distance', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const scene = makeFoggyScene();
    const farPosition = new THREE.Vector3(10_000, 0, 0);

    expect(
      shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: farPosition,
        isAirborne: false,
        isPiloted: true,
        hasActiveNPCPilot: false,
        currentlySimulating: false,
      }),
    ).toBe(true);
  });

  it('always simulates an airborne NPC-piloted aircraft even far from the camera', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const scene = makeFoggyScene();
    const farPosition = new THREE.Vector3(5_000, 500, 0);

    expect(
      shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: farPosition,
        isAirborne: true,
        isPiloted: false,
        hasActiveNPCPilot: true,
        currentlySimulating: false,
      }),
    ).toBe(true);
  });

  it('simulates an unpiloted parked aircraft when the camera is close', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const scene = makeFoggyScene();
    const nearPosition = new THREE.Vector3(50, 0, 0);

    expect(
      shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: nearPosition,
        isAirborne: false,
        isPiloted: false,
        hasActiveNPCPilot: false,
        currentlySimulating: false,
      }),
    ).toBe(true);
  });

  it('culls simulation for an unpiloted parked aircraft far beyond the cull distance', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const scene = makeFoggyScene();
    // Fog far is 450m; clamp floor is 180m. 10km is unambiguously outside.
    const farPosition = new THREE.Vector3(10_000, 0, 0);

    expect(
      shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: farPosition,
        isAirborne: false,
        isPiloted: false,
        hasActiveNPCPilot: false,
        currentlySimulating: true,
      }),
    ).toBe(false);
  });

  it('culls a parked NPC-piloted aircraft when the camera is far and the aircraft is grounded', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const scene = makeFoggyScene();
    const farPosition = new THREE.Vector3(10_000, 0, 0);

    expect(
      shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: farPosition,
        isAirborne: false,
        isPiloted: false,
        hasActiveNPCPilot: true,
        currentlySimulating: true,
      }),
    ).toBe(false);
  });

  it('applies hysteresis: once culled, the vehicle resumes at a closer distance than it was culled at', () => {
    const scene = makeFoggyScene();
    // Pick a vehicle position and find the distance band where hysteresis matters.
    // With fog far ~450m the effective cull distance for a grounded vehicle is
    // near that value; a 1.12x hysteresis means the resume boundary is ~10%
    // closer than the cull boundary. We test the relative behavior: for a
    // fixed vehicle position and camera, "currentlySimulating: true" should be
    // at least as permissive as "currentlySimulating: false".
    const vehicle = new THREE.Vector3(0, 0, 0);

    // Sweep camera distances; for each distance the "resumed" branch must be
    // true whenever the "culled" branch is true. (Monotonicity of hysteresis.)
    for (let d = 100; d <= 800; d += 25) {
      const camera = makeCamera(new THREE.Vector3(d, 0, 0));
      const resumedResult = shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: vehicle,
        isAirborne: false,
        isPiloted: false,
        hasActiveNPCPilot: false,
        currentlySimulating: false,
      });
      const culledResult = shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: vehicle,
        isAirborne: false,
        isPiloted: false,
        hasActiveNPCPilot: false,
        currentlySimulating: true,
      });
      // If the vehicle was already being simulated, it should remain simulated
      // at any distance where a freshly-resumed one would also simulate.
      if (resumedResult) {
        expect(culledResult).toBe(true);
      }
    }

    // And there must exist at least one distance where the currently-simulating
    // branch returns true but the freshly-resumed branch returns false — that
    // is the hysteresis band. Otherwise the hysteresis is a no-op.
    let hysteresisBandFound = false;
    for (let d = 100; d <= 800; d += 5) {
      const camera = makeCamera(new THREE.Vector3(d, 0, 0));
      const resumedResult = shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: vehicle,
        isAirborne: false,
        isPiloted: false,
        hasActiveNPCPilot: false,
        currentlySimulating: false,
      });
      const culledResult = shouldSimulateAirVehicle({
        camera,
        scene,
        vehiclePosition: vehicle,
        isAirborne: false,
        isPiloted: false,
        hasActiveNPCPilot: false,
        currentlySimulating: true,
      });
      if (culledResult && !resumedResult) {
        hysteresisBandFound = true;
        break;
      }
    }
    expect(hysteresisBandFound).toBe(true);
  });

  it('simulates when no camera is available (defensive fallback)', () => {
    const scene = makeFoggyScene();
    expect(
      shouldSimulateAirVehicle({
        camera: null,
        scene,
        vehiclePosition: new THREE.Vector3(10_000, 0, 0),
        isAirborne: false,
        isPiloted: false,
        hasActiveNPCPilot: false,
        currentlySimulating: false,
      }),
    ).toBe(true);
  });
});

describe('shouldRenderAirVehicle', () => {
  it('always renders a piloted aircraft regardless of distance', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const scene = makeFoggyScene();

    expect(
      shouldRenderAirVehicle({
        camera,
        scene,
        vehiclePosition: new THREE.Vector3(10_000, 0, 0),
        isAirborne: false,
        isPiloted: true,
        currentlyVisible: false,
      }),
    ).toBe(true);
  });

  it('culls an unpiloted parked aircraft far beyond the visibility distance', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const scene = makeFoggyScene();

    expect(
      shouldRenderAirVehicle({
        camera,
        scene,
        vehiclePosition: new THREE.Vector3(10_000, 0, 0),
        isAirborne: false,
        isPiloted: false,
        currentlyVisible: true,
      }),
    ).toBe(false);
  });
});
