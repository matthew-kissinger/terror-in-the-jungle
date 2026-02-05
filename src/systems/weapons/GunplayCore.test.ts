import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GunplayCore, RecoilPattern, WeaponSpec } from './GunplayCore';

// Mock performance.now() for fire rate tests
let mockTime = 0;
vi.spyOn(performance, "now").mockImplementation(() => mockTime);

describe("WeaponSpec interface", () => {
  it("should define the expected properties for a weapon specification", () => {
    const spec: WeaponSpec = {
      name: "AssaultRifle",
      rpm: 600,
      adsTime: 0.2,
      baseSpreadDeg: 1.0,
      bloomPerShotDeg: 0.5,
      recoilPerShotDeg: 0.3,
      recoilHorizontalDeg: 0.1,
      damageNear: 30,
      damageFar: 15,
      falloffStart: 20,
      falloffEnd: 50,
      headshotMultiplier: 2.0,
      penetrationPower: 0.5,
    };

    expect(spec).toBeDefined();
    expect(typeof spec.name).toBe("string");
    expect(typeof spec.rpm).toBe("number");
    expect(typeof spec.adsTime).toBe("number");
    expect(typeof spec.baseSpreadDeg).toBe("number");
    expect(typeof spec.bloomPerShotDeg).toBe("number");
    expect(typeof spec.recoilPerShotDeg).toBe("number");
    expect(typeof spec.recoilHorizontalDeg).toBe("number");
    expect(typeof spec.damageNear).toBe("number");
    expect(typeof spec.damageFar).toBe("number");
    expect(typeof spec.falloffStart).toBe("number");
    expect(typeof spec.falloffEnd).toBe("number");
    expect(typeof spec.headshotMultiplier).toBe("number");
    expect(typeof spec.penetrationPower).toBe("number");
  });

  it("should allow optional pelletCount and pelletSpreadDeg for shotguns", () => {
    const shotgunSpec: WeaponSpec = {
      name: "Shotgun",
      rpm: 60,
      adsTime: 0.3,
      baseSpreadDeg: 5.0,
      bloomPerShotDeg: 2.0,
      recoilPerShotDeg: 5.0,
      recoilHorizontalDeg: 2.0,
      damageNear: 10,
      damageFar: 5,
      falloffStart: 5,
      falloffEnd: 15,
      headshotMultiplier: 1.5,
      penetrationPower: 1.0,
      pelletCount: 8,
      pelletSpreadDeg: 10,
    };

    expect(shotgunSpec).toBeDefined();
    expect(typeof shotgunSpec.pelletCount).toBe("number");
    expect(typeof shotgunSpec.pelletSpreadDeg).toBe("number");
  });
});

describe("RecoilPattern", () => {
  it("constructor should initialize with a seed", () => {
    const pattern = new RecoilPattern(123);
    expect(pattern).toBeInstanceOf(RecoilPattern);
  });

  it("next should return deterministic values in the range [-1, 1]", () => {
    const pattern = new RecoilPattern(100);
    const value1 = pattern.next(0);
    const value2 = pattern.next(1);
    const value3 = pattern.next(0); // Check determinism for same index

    expect(value1).toBeGreaterThanOrEqual(-1);
    expect(value1).toBeLessThanOrEqual(1);
    expect(value2).toBeGreaterThanOrEqual(-1);
    expect(value2).toBeLessThanOrEqual(1);
    expect(value3).toBe(value1); // Should be deterministic
    expect(value1).not.toBe(value2); // Consecutive values should generally differ
  });

  it("should produce the same sequence for the same seed", () => {
    const patternA = new RecoilPattern(42);
    const patternB = new RecoilPattern(42);

    for (let i = 0; i < 10; i++) {
      expect(patternA.next(i)).toBe(patternB.next(i));
    }
  });

  it("should produce different sequences for different seeds", () => {
    const patternA = new RecoilPattern(1);
    const patternB = new RecoilPattern(2);

    let sameCount = 0;
    for (let i = 0; i < 10; i++) {
      if (patternA.next(i) === patternB.next(i)) {
        sameCount++;
      }
    }
    // Very unlikely to be all same
    expect(sameCount).toBeLessThan(5);
  });
});

describe("GunplayCore", () => {
  const testSpec: WeaponSpec = {
    name: "TestRifle",
    rpm: 600,
    adsTime: 0.2,
    baseSpreadDeg: 1.0,
    bloomPerShotDeg: 0.5,
    recoilPerShotDeg: 0.3,
    recoilHorizontalDeg: 0.1,
    damageNear: 30,
    damageFar: 15,
    falloffStart: 20,
    falloffEnd: 50,
    headshotMultiplier: 2.0,
    penetrationPower: 0.5,
  };

  const shotgunSpec: WeaponSpec = {
    name: "TestShotgun",
    rpm: 120,
    adsTime: 0.3,
    baseSpreadDeg: 5.0,
    bloomPerShotDeg: 2.0,
    recoilPerShotDeg: 5.0,
    recoilHorizontalDeg: 2.0,
    damageNear: 10,
    damageFar: 5,
    falloffStart: 5,
    falloffEnd: 15,
    headshotMultiplier: 1.5,
    penetrationPower: 1.0,
    pelletCount: 8,
    pelletSpreadDeg: 10,
  };

  beforeEach(() => {
    mockTime = 0; // Reset mock time before each test
  });

  it("constructor should initialize with weapon spec", () => {
    const gun = new GunplayCore(testSpec);
    expect(gun).toBeDefined();
    // Private properties are not directly testable without type-casts or getter,
    // but we can infer successful initialization through other methods.
  });

  // Category 1: Fire Rate
  describe("canFire()", () => {
    it("should allow firing initially", () => {
      const gun = new GunplayCore(testSpec);
      // Advance mockTime so that the gun is ready to fire initially
      mockTime = 60000 / testSpec.rpm; // At least one shot interval has passed
      expect(gun.canFire()).toBe(true);
    });

    it("should respect RPM-based fire rate", () => {
      const gun = new GunplayCore(testSpec);
      const msPerShot = 60000 / testSpec.rpm; // 600 RPM = 100ms

      gun.registerShot();
      mockTime = msPerShot - 1; // Just before next shot is ready
      expect(gun.canFire()).toBe(false);

      mockTime = msPerShot; // Exactly when next shot is ready
      expect(gun.canFire()).toBe(true);

      gun.registerShot();
      mockTime = msPerShot * 2 - 1;
      expect(gun.canFire()).toBe(false);

      mockTime = msPerShot * 2;
      expect(gun.canFire()).toBe(true);
    });
  });

  // Category 2: Bloom Mechanics
  describe("bloom mechanics", () => {
    it("registerShot should increase bloom", () => {
      const gun = new GunplayCore(testSpec);
      // Access private bloomDeg for testing purposes (not ideal in real code)
      // @ts-ignore
      expect(gun.bloomDeg).toBe(0);

      gun.registerShot();
      // @ts-ignore
      expect(gun.bloomDeg).toBeCloseTo(testSpec.bloomPerShotDeg);

      gun.registerShot();
      // @ts-ignore
      expect(gun.bloomDeg).toBeCloseTo(testSpec.bloomPerShotDeg * 2);
    });

    it("bloom should be capped at 4x baseSpreadDeg", () => {
      const gun = new GunplayCore(testSpec);
      // Shoot enough times to exceed the cap
      const shotsToCap = Math.ceil((testSpec.baseSpreadDeg * 4) / testSpec.bloomPerShotDeg);
      for (let i = 0; i < shotsToCap + 5; i++) {
        gun.registerShot();
      }
      // @ts-ignore
      expect(gun.bloomDeg).toBeCloseTo(testSpec.baseSpreadDeg * 4);
    });

    it("cooldown should reduce bloom over time", () => {
      const gun = new GunplayCore(testSpec);
      gun.registerShot(); // Initial bloom
      // @ts-ignore
      const initialBloom = gun.bloomDeg;
      expect(initialBloom).toBeGreaterThan(0);

      const delta = 0.1; // 100ms
      gun.cooldown(delta);
      // @ts-ignore
      const expectedBloom = Math.max(0, initialBloom - testSpec.baseSpreadDeg * 6 * delta);
      // @ts-ignore
      expect(gun.bloomDeg).toBeCloseTo(expectedBloom);

      // Decay to zero
      gun.cooldown(100); // Large delta to ensure full decay
      // @ts-ignore
      expect(gun.bloomDeg).toBeCloseTo(0);
    });
  });

  // Category 3: Spread Calculation
  describe("getSpreadDeg()", () => {
    it("should return 0 as per current implementation (perfect hitscan)", () => {
      const gun = new GunplayCore(testSpec);
      expect(gun.getSpreadDeg()).toBe(0);
    });
  });

  // Category 4: Recoil Pattern
  describe("getRecoilOffsetDeg()", () => {
    it("should increment recoilIndex on registerShot", () => {
      const gun = new GunplayCore(testSpec);
      // @ts-ignore
      expect(gun.recoilIndex).toBe(0);
      gun.registerShot();
      // @ts-ignore
      expect(gun.recoilIndex).toBe(1);
    });

    it("should return recoil values based on spec and pattern", () => {
      const gun = new GunplayCore(testSpec);
      gun.registerShot(); // Increment recoil index to 1
      const recoilOffset = gun.getRecoilOffsetDeg();

      expect(typeof recoilOffset.pitch).toBe("number");
      expect(typeof recoilOffset.yaw).toBe("number");

      // Verify pitch is based on recoilPerShotDeg and capped, applying recoilMultiplier
      expect(recoilOffset.pitch).toBeCloseTo(testSpec.recoilPerShotDeg * (1 - testSpec.recoilPerShotDeg / 15));

      // Verify yaw is within bounds based on recoilHorizontalDeg
      expect(recoilOffset.yaw).toBeGreaterThanOrEqual(-testSpec.recoilHorizontalDeg);
      expect(recoilOffset.yaw).toBeLessThanOrEqual(testSpec.recoilHorizontalDeg);
    });

    it("should apply diminishing returns to vertical recoil based on accumulated recoil", () => {
      const gun = new GunplayCore(testSpec);
      const initialRecoilPerShot = testSpec.recoilPerShotDeg; // 0.3

      // Shoot multiple times to accumulate recoil
      // The recoil multiplier caps at 0.3 when accumulatedRecoil is 10 (or more)
      // So at 10 accumulated recoil, pitch should be 0.3 * 0.3 = 0.09
      for (let i = 0; i < 30; i++) { // 30 * 0.3 = 9 degrees, then it caps at 10
        gun.registerShot();
      }
      // @ts-ignore
      expect(gun.accumulatedRecoil).toBeCloseTo(9); // Should be 9, not 10, as 30 * 0.3 = 9

      const recoilOffset = gun.getRecoilOffsetDeg();
      expect(recoilOffset.pitch).toBeCloseTo(initialRecoilPerShot * 0.4); // 0.3 * 0.4 = 0.12
    });

    it("cooldown should reduce accumulated recoil over time", () => {
      const gun = new GunplayCore(testSpec);
      gun.registerShot(); // Initial accumulated recoil
      // @ts-ignore
      const initialAccumulatedRecoil = gun.accumulatedRecoil;
      expect(initialAccumulatedRecoil).toBeGreaterThan(0);

      const delta = 0.1; // 100ms
      gun.cooldown(delta);
      // @ts-ignore
      const expectedAccumulatedRecoil = Math.max(0, initialAccumulatedRecoil - 5 * delta);
      // @ts-ignore
      expect(gun.accumulatedRecoil).toBeCloseTo(expectedAccumulatedRecoil);

      // Recover to zero
      gun.cooldown(100); // Large delta to ensure full recovery
      // @ts-ignore
      expect(gun.accumulatedRecoil).toBeCloseTo(0);
    });
  });

  // Category 5: Damage Falloff
  describe("computeDamage(distance, isHeadshot)", () => {
    it("should return damageNear for distances before falloffStart", () => {
      const gun = new GunplayCore(testSpec);
      expect(gun.computeDamage(10, false)).toBe(testSpec.damageNear);
      expect(gun.computeDamage(testSpec.falloffStart - 0.1, false)).toBe(testSpec.damageNear);
    });

    it("should return damageFar for distances after falloffEnd", () => {
      const gun = new GunplayCore(testSpec);
      expect(gun.computeDamage(60, false)).toBe(testSpec.damageFar);
      expect(gun.computeDamage(testSpec.falloffEnd + 0.1, false)).toBe(testSpec.damageFar);
    });

    it("should interpolate damage between falloffStart and falloffEnd", () => {
      const gun = new GunplayCore(testSpec);
      // Midpoint between 20 and 50 is 35
      const midpointDamage = (testSpec.damageNear + testSpec.damageFar) / 2; // (30 + 15) / 2 = 22.5
      expect(gun.computeDamage(35, false)).toBeCloseTo(22.5);

      // Quarter point (20 + (50-20)/4 = 27.5)
      const quarterPointDamage = THREE.MathUtils.lerp(testSpec.damageNear, testSpec.damageFar, 0.25);
      expect(gun.computeDamage(27.5, false)).toBeCloseTo(quarterPointDamage);
    });

    it("should apply headshot multiplier", () => {
      const gun = new GunplayCore(testSpec);
      expect(gun.computeDamage(10, true)).toBe(testSpec.damageNear * testSpec.headshotMultiplier);
      expect(gun.computeDamage(60, true)).toBe(testSpec.damageFar * testSpec.headshotMultiplier);

      // With interpolation
      const interpolatedDamage = gun.computeDamage(35, false);
      expect(gun.computeDamage(35, true)).toBeCloseTo(interpolatedDamage * testSpec.headshotMultiplier);
    });
  });

  // Category 6: Shot Ray
  describe("computeShotRay(camera, spreadDeg)", () => {
    let mockCamera: THREE.Camera; // Declare here

    beforeEach(() => {
      mockCamera = new THREE.PerspectiveCamera();
      mockCamera.position.set(0, 0, 0);
      mockCamera.lookAt(0, 0, -1); // Pointing down negative Z

      // Provide a sequence of random values for pellet generation
      const pelletRandomValues = [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, // u for 8 pellets
        0.9, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75 // v for 8 pellets
      ];
      vi.spyOn(Math, 'random').mockImplementation(() => pelletRandomValues.shift() || 0.5);
    });

    afterEach(() => {
      vi.restoreAllMocks(); // Restore Math.random to its original implementation
    });

    it("should return a Ray from camera origin along camera direction with no spread", () => {
      const gun = new GunplayCore(testSpec);
      const ray = gun.computeShotRay(mockCamera, 0);

      expect(ray).toBeInstanceOf(THREE.Ray);
      expect(ray.origin.x).toBeCloseTo(mockCamera.position.x);
      expect(ray.origin.y).toBeCloseTo(mockCamera.position.y);
      expect(ray.origin.z).toBeCloseTo(mockCamera.position.z);

      const expectedDirection = new THREE.Vector3();
      mockCamera.getWorldDirection(expectedDirection);
      expect(ray.direction.x).toBeCloseTo(expectedDirection.x);
      expect(ray.direction.y).toBeCloseTo(expectedDirection.y);
      expect(ray.direction.z).toBeCloseTo(expectedDirection.z);
    });

    it("should apply spread when spreadDeg is greater than 0", () => {
      const gun = new GunplayCore(testSpec);
      const spreadDeg = 5;
      const ray = gun.computeShotRay(mockCamera, spreadDeg);

      const expectedDirection = new THREE.Vector3();
      mockCamera.getWorldDirection(expectedDirection);

      // The ray direction should be different from the camera's world direction due to spread
      // With Math.random() mocked to 0.5, the offset should be deterministic.
      // u = 0.5, v = 0.5 => theta = PI, r = spreadRad * sqrt(0.5)
      // _offset.x = cos(PI) * r = -r
      // _offset.y = sin(PI) * r = 0
      // So the perturbed direction should be primarily offset in the -X (right) direction relative to camera's basis.

      const spreadRad = THREE.MathUtils.degToRad(spreadDeg);
      const u_val = 0.1; // First value from pelletRandomValues
      const v_val = 0.2; // Second value from pelletRandomValues
      const r_calculated = spreadRad * Math.sqrt(v_val);

      // Check that the direction is not the same as the camera's
      expect(ray.direction.equals(expectedDirection)).toBe(false);

      // The angle between the original direction and the perturbed direction should be around 'r_calculated'
      const angle = ray.direction.angleTo(expectedDirection);
      expect(angle).toBeCloseTo(r_calculated);
    });

    it("computePelletRays should return single ray if not a shotgun or no spread", () => {
      const gun = new GunplayCore(testSpec); // Not a shotgun
      const rays = gun.computePelletRays(mockCamera);
      expect(rays.length).toBe(1);
      expect(rays[0]).toBeInstanceOf(THREE.Ray);

      const singlePelletShotgunSpec: WeaponSpec = { ...shotgunSpec, pelletCount: 1 };
      const singlePelletGun = new GunplayCore(singlePelletShotgunSpec);
      const singleRays = singlePelletGun.computePelletRays(mockCamera);
      expect(singleRays.length).toBe(1);
      expect(singleRays[0]).toBeInstanceOf(THREE.Ray);
    });

    it("computePelletRays should return multiple rays for shotguns with spread", () => {
      const gun = new GunplayCore(shotgunSpec);
      const rays = gun.computePelletRays(mockCamera);
      expect(rays.length).toBe(shotgunSpec.pelletCount);
      let anySpreadApplied = false;
      const expectedDirection = new THREE.Vector3();
      mockCamera.getWorldDirection(expectedDirection);
      const maxSpreadRad = THREE.MathUtils.degToRad(shotgunSpec.pelletSpreadDeg!);

      for (let i = 0; i < rays.length; i++) {
        const ray = rays[i];
        expect(ray).toBeInstanceOf(THREE.Ray);

        if (i > 0) { // Compare subsequent rays to the first one
          // They should be distinct objects
          expect(ray.direction).not.toBe(rays[0].direction);
          // And their values should be different due to spread
          expect(ray.direction.equals(rays[0].direction)).toBe(false);
        }

        // The angle from the camera's forward direction should be within the max pellet spread
        const angle = ray.direction.angleTo(expectedDirection);
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThanOrEqual(maxSpreadRad + 1e-6); // Add small epsilon for floating point

        if (angle > 1e-6) { // Check if any significant spread was applied
          anySpreadApplied = true;
        }
      }
      expect(anySpreadApplied).toBe(true); // At least one pellet should have some spread
    });

    it("isShotgun should return true for shotguns and false otherwise", () => {
      const rifleGun = new GunplayCore(testSpec);
      expect(rifleGun.isShotgun()).toBe(false);

      const shotgunGun = new GunplayCore(shotgunSpec);
      expect(shotgunGun.isShotgun()).toBe(true);

      const singlePelletShotgunSpec: WeaponSpec = { ...shotgunSpec, pelletCount: 1 };
      const singlePelletGun = new GunplayCore(singlePelletShotgunSpec);
      expect(singlePelletGun.isShotgun()).toBe(false); // If pelletCount is 1, it's not considered a shotgun
    });
  });
});
