import * as THREE from 'three';

export interface WeaponSpec {
  name: string;
  rpm: number;            // rounds per minute
  adsTime: number;        // seconds to transition to ADS
  baseSpreadDeg: number;  // sigma at rest
  bloomPerShotDeg: number;
  recoilPerShotDeg: number; // vertical recoil per shot (deg)
  recoilHorizontalDeg: number; // horizontal step per shot (deg)
  damageNear: number;
  damageFar: number;
  falloffStart: number;   // meters
  falloffEnd: number;     // meters
  headshotMultiplier: number;
  penetrationPower: number; // simple constant for through foliage later
  pelletCount?: number;   // optional: for shotguns, number of pellets per shot
  pelletSpreadDeg?: number; // optional: cone angle for pellet spread
}

export class RecoilPattern {
  private seed: number;
  constructor(seed = 1337) { this.seed = seed; }
  // Deterministic pseudo pattern in [-1,1]
  next(index: number): number {
    const x = Math.sin(this.seed + index * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
  }
}

export class GunplayCore {
  private spec: WeaponSpec;
  private bloomDeg = 0;
  private lastShotTime = 0;
  private recoilIndex = 0;
  private recoil = new RecoilPattern(9001);
  private accumulatedRecoil = 0; // Track total vertical recoil

  constructor(spec: WeaponSpec) {
    this.spec = spec;
  }

  canFire(): boolean {
    const msPerShot = 60000 / this.spec.rpm;
    return performance.now() - this.lastShotTime >= msPerShot;
  }

  registerShot(): void {
    this.lastShotTime = performance.now();
    this.bloomDeg = Math.min(this.bloomDeg + this.spec.bloomPerShotDeg, this.spec.baseSpreadDeg * 4);
    this.recoilIndex++;
    this.accumulatedRecoil = Math.min(this.accumulatedRecoil + this.spec.recoilPerShotDeg, 10); // Cap at 10 degrees
  }

  cooldown(delta: number): void {
    // smooth bloom decay
    const decay = 6; // per second
    this.bloomDeg = Math.max(0, this.bloomDeg - this.spec.baseSpreadDeg * decay * delta);
    // Recover from accumulated recoil
    this.accumulatedRecoil = Math.max(0, this.accumulatedRecoil - 5 * delta); // Recover 5 degrees per second
  }

  // For perfect hitscan, keep 0 spread; recoil affects camera only
  getSpreadDeg(): number { return 0; }

  getRecoilOffsetDeg(): { pitch: number; yaw: number } {
    const h = this.recoil.next(this.recoilIndex) * this.spec.recoilHorizontalDeg;
    // Use diminishing returns on vertical recoil based on accumulated recoil
    const recoilMultiplier = Math.max(0.3, 1 - this.accumulatedRecoil / 15);
    const v = this.spec.recoilPerShotDeg * recoilMultiplier;
    return { pitch: v, yaw: h };
  }

  // Returns world-space ray from camera with spread applied
  computeShotRay(camera: THREE.Camera, spreadDeg: number): THREE.Ray {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.normalize();

    // For perfect accuracy at center of screen, use no spread
    // Only apply spread if explicitly requested
    if (spreadDeg > 0) {
      // random cone within spread
      const spreadRad = THREE.MathUtils.degToRad(spreadDeg);
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const r = spreadRad * Math.sqrt(v);
      const offset = new THREE.Vector3(Math.cos(theta) * r, Math.sin(theta) * r, 0);

      // build basis around forward
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, dir).normalize();
      const realUp = new THREE.Vector3().crossVectors(dir, right).normalize();
      const perturbed = new THREE.Vector3()
        .copy(dir)
        .addScaledVector(right, offset.x)
        .addScaledVector(realUp, offset.y)
        .normalize();

      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      return new THREE.Ray(origin, perturbed);
    }

    // No spread - perfect accuracy
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    return new THREE.Ray(origin, dir);
  }

  computeDamage(distance: number, isHeadshot: boolean): number {
    const { damageNear, damageFar, falloffStart, falloffEnd, headshotMultiplier } = this.spec;
    let base = damageNear;
    if (distance > falloffStart) {
      const t = THREE.MathUtils.clamp((distance - falloffStart) / Math.max(1e-3, (falloffEnd - falloffStart)), 0, 1);
      base = THREE.MathUtils.lerp(damageNear, damageFar, t);
    }
    return isHeadshot ? base * headshotMultiplier : base;
  }

  // Generate multiple pellet rays for shotgun-type weapons
  computePelletRays(camera: THREE.Camera): THREE.Ray[] {
    const pelletCount = this.spec.pelletCount || 1;
    const pelletSpread = this.spec.pelletSpreadDeg || 0;

    if (pelletCount === 1 || pelletSpread === 0) {
      // Single pellet or no spread - just return one ray
      return [this.computeShotRay(camera, 0)];
    }

    const rays: THREE.Ray[] = [];
    const spreadRad = THREE.MathUtils.degToRad(pelletSpread);

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.normalize();

    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);

    // Build basis vectors for spread
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const realUp = new THREE.Vector3().crossVectors(dir, right).normalize();

    // Generate pellets in a circular pattern
    for (let i = 0; i < pelletCount; i++) {
      // Random position within cone
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const r = spreadRad * Math.sqrt(v);

      const offset = new THREE.Vector3(Math.cos(theta) * r, Math.sin(theta) * r, 0);

      const perturbed = new THREE.Vector3()
        .copy(dir)
        .addScaledVector(right, offset.x)
        .addScaledVector(realUp, offset.y)
        .normalize();

      rays.push(new THREE.Ray(origin.clone(), perturbed));
    }

    return rays;
  }

  isShotgun(): boolean {
    return (this.spec.pelletCount || 1) > 1;
  }
}


