import * as THREE from 'three';
import { EffectPool } from './EffectPool';

interface WadeSplashBurst {
  particles: THREE.Points;
  sparks: THREE.Points;
  aliveUntil: number;
  startTime: number;
  velocity: THREE.Vector3[];
}

/** Caller-bound immersion sampler. Returns `immersion01` ∈ [0, 1]. */
export interface WadeSplashImmersionSampler {
  sampleImmersion01At(footPosition: THREE.Vector3): number;
}

/** Splash fires only inside this immersion band. Below = dry, above = swim. */
const SPLASH_IMMERSION_LOWER = 0.1;
const SPLASH_IMMERSION_UPPER = 0.5;

/** Horizontal stride distance (metres) between successive splashes per emitter. */
const STRIDE_DISTANCE_METERS = 1.2;
const MAX_TRACKED_EMITTERS = 256;

const PARTICLE_COUNT = 8;
const SPARK_COUNT = 6;
const SPLASH_LIFETIME_MS = 380;
const FADE_START_MS = 220;
const PARTICLE_BASE_OPACITY = 0.85;
const SPARK_BASE_OPACITY = 0.95;

const GRAVITY = new THREE.Vector3(0, -9.8, 0);

/** Deterministic radial spread directions (XZ unit vectors); no per-spawn RNG. */
const SPREAD_DIRECTIONS: ReadonlyArray<readonly [number, number]> = (() => {
  const count = Math.max(PARTICLE_COUNT, SPARK_COUNT);
  const dirs: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    dirs.push([Math.cos(angle), Math.sin(angle)]);
  }
  return dirs;
})();

interface EmitterState {
  lastX: number;
  lastZ: number;
  strideAccum: number;
  /** True once we have a valid lastX/lastZ baseline (skips first frame). */
  primed: boolean;
}

/**
 * Wade-splash particle pool. Spawns a small water-puff burst when a foot
 * lands in shallow water (`immersion01 ∈ [0.1, 0.5]`). Reuses the existing
 * `EffectPool` abstraction (same pattern as `ImpactEffectsPool` /
 * `ExplosionEffectsPool`) so per-spawn cost is zero allocation past warmup.
 */
export class WadeSplashEffect extends EffectPool<WadeSplashBurst> {
  private readonly particleMaterial: THREE.PointsMaterial;
  private readonly sparkMaterial: THREE.PointsMaterial;
  private readonly emitterStates = new Map<string, EmitterState>();
  private sampler: WadeSplashImmersionSampler | null = null;

  constructor(scene: THREE.Scene, maxEffects = 16) {
    super(scene, maxEffects);

    this.particleMaterial = new THREE.PointsMaterial({
      color: 0xb6d8e8,
      size: 0.09,
      transparent: true,
      opacity: PARTICLE_BASE_OPACITY,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.sparkMaterial = new THREE.PointsMaterial({
      color: 0xeaf6ff,
      size: 0.06,
      transparent: true,
      opacity: SPARK_BASE_OPACITY,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    for (let i = 0; i < maxEffects; i++) {
      const burst = this.createEffect();
      this.scene.add(burst.particles);
      this.scene.add(burst.sparks);
      this.pool.push(burst);
    }
  }

  /** Bind / unbind the immersion sampler. `null` disables splash emission. */
  setSampler(sampler: WadeSplashImmersionSampler | null): void {
    this.sampler = sampler;
  }

  protected createEffect(): WadeSplashBurst {
    const particles = this.makePoints(PARTICLE_COUNT, this.particleMaterial);
    const sparks = this.makePoints(SPARK_COUNT, this.sparkMaterial);
    const velocity: THREE.Vector3[] = [];
    for (let i = 0; i < PARTICLE_COUNT + SPARK_COUNT; i++) velocity.push(new THREE.Vector3());
    return { particles, sparks, aliveUntil: 0, startTime: 0, velocity };
  }

  protected isExpired(burst: WadeSplashBurst, now: number): boolean {
    return burst.aliveUntil <= now;
  }

  protected deactivateEffect(burst: WadeSplashBurst): void {
    burst.particles.visible = false;
    burst.sparks.visible = false;
  }

  protected disposeEffect(burst: WadeSplashBurst): void {
    this.scene.remove(burst.particles);
    this.scene.remove(burst.sparks);
    burst.particles.geometry.dispose();
    burst.sparks.geometry.dispose();
  }

  /** Force-spawn a splash at `position`, bypassing immersion + stride checks. */
  emit(position: THREE.Vector3): boolean {
    const burst = this.acquire();
    if (!burst) return false;

    this.fillBurstParticles(burst, position, PARTICLE_COUNT, 1.4, 2.0, false);
    this.fillBurstParticles(burst, position, SPARK_COUNT, 2.4, 3.2, true);

    burst.particles.visible = true;
    burst.sparks.visible = true;
    (burst.particles.material as THREE.PointsMaterial).opacity = PARTICLE_BASE_OPACITY;
    (burst.sparks.material as THREE.PointsMaterial).opacity = SPARK_BASE_OPACITY;

    const now = performance.now();
    burst.startTime = now;
    burst.aliveUntil = now + SPLASH_LIFETIME_MS;

    this.pushActive(burst);
    return true;
  }

  /** Player splash hook. Called per fixed step from `PlayerMovement`. */
  tryEmitForPlayer(footPosition: THREE.Vector3, isGroundedAndMoving: boolean): boolean {
    return this.tickEmitter('player', footPosition, isGroundedAndMoving);
  }

  /** NPC splash hook. Per-id stride state so NPCs don't share accumulators. */
  tryEmitForCombatant(
    combatantId: string,
    footPosition: THREE.Vector3,
    isGroundedAndMoving: boolean,
  ): boolean {
    return this.tickEmitter(combatantId, footPosition, isGroundedAndMoving);
  }

  /** Drop tracking state for a combatant (death / dematerialization). */
  forgetEmitter(emitterId: string): void {
    this.emitterStates.delete(emitterId);
  }

  /** Per-frame integrate + fade + sweep. Mirrors `ImpactEffectsPool.update`. */
  update(deltaTime: number): void {
    const now = performance.now();
    for (const burst of this.active) {
      if (burst.aliveUntil <= now) continue;
      this.integrateGroup(burst, 0, PARTICLE_COUNT, burst.particles.geometry.attributes.position as THREE.BufferAttribute, deltaTime);
      this.integrateGroup(burst, PARTICLE_COUNT, SPARK_COUNT, burst.sparks.geometry.attributes.position as THREE.BufferAttribute, deltaTime);

      const elapsed = now - burst.startTime;
      if (elapsed > FADE_START_MS) {
        const span = Math.max(1, SPLASH_LIFETIME_MS - FADE_START_MS);
        const fade = Math.min(1, (elapsed - FADE_START_MS) / span);
        (burst.particles.material as THREE.PointsMaterial).opacity = PARTICLE_BASE_OPACITY * (1 - fade);
        (burst.sparks.material as THREE.PointsMaterial).opacity = SPARK_BASE_OPACITY * (1 - fade);
      }
    }
    this.sweep(now);
  }

  dispose(): void {
    super.dispose();
    this.particleMaterial.dispose();
    this.sparkMaterial.dispose();
    this.emitterStates.clear();
  }

  private makePoints(count: number, material: THREE.PointsMaterial): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.matrixAutoUpdate = true;
    return points;
  }

  private fillBurstParticles(
    burst: WadeSplashBurst,
    position: THREE.Vector3,
    count: number,
    horizontalSpeed: number,
    verticalSpeed: number,
    isSparkGroup: boolean,
  ): void {
    const positions = (isSparkGroup ? burst.sparks : burst.particles).geometry.attributes.position as THREE.BufferAttribute;
    const velocityOffset = isSparkGroup ? PARTICLE_COUNT : 0;
    for (let i = 0; i < count; i++) {
      positions.setXYZ(i, position.x, position.y, position.z);
      const [dx, dz] = SPREAD_DIRECTIONS[i % SPREAD_DIRECTIONS.length];
      burst.velocity[velocityOffset + i].set(dx * horizontalSpeed, verticalSpeed, dz * horizontalSpeed);
    }
    positions.needsUpdate = true;
  }

  private integrateGroup(
    burst: WadeSplashBurst,
    velocityOffset: number,
    count: number,
    positions: THREE.BufferAttribute,
    deltaTime: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const v = burst.velocity[velocityOffset + i];
      v.addScaledVector(GRAVITY, deltaTime);
      positions.setXYZ(
        i,
        positions.getX(i) + v.x * deltaTime,
        positions.getY(i) + v.y * deltaTime,
        positions.getZ(i) + v.z * deltaTime,
      );
    }
    positions.needsUpdate = true;
  }

  private tickEmitter(
    emitterId: string,
    footPosition: THREE.Vector3,
    isGroundedAndMoving: boolean,
  ): boolean {
    const state = this.getOrCreateEmitterState(emitterId, footPosition);
    if (!isGroundedAndMoving) {
      // Reset stride so the next moving step does not instantly fire.
      state.lastX = footPosition.x;
      state.lastZ = footPosition.z;
      state.strideAccum = 0;
      state.primed = true;
      return false;
    }
    if (!state.primed) {
      state.lastX = footPosition.x;
      state.lastZ = footPosition.z;
      state.primed = true;
      return false;
    }

    const dx = footPosition.x - state.lastX;
    const dz = footPosition.z - state.lastZ;
    state.lastX = footPosition.x;
    state.lastZ = footPosition.z;
    state.strideAccum += Math.sqrt(dx * dx + dz * dz);
    if (state.strideAccum < STRIDE_DISTANCE_METERS) return false;

    state.strideAccum = 0;
    if (!this.sampler) return false;
    const immersion = this.sampler.sampleImmersion01At(footPosition);
    if (!Number.isFinite(immersion)) return false;
    if (immersion < SPLASH_IMMERSION_LOWER || immersion > SPLASH_IMMERSION_UPPER) return false;
    return this.emit(footPosition);
  }

  private getOrCreateEmitterState(emitterId: string, footPosition: THREE.Vector3): EmitterState {
    const existing = this.emitterStates.get(emitterId);
    if (existing) return existing;
    if (this.emitterStates.size >= MAX_TRACKED_EMITTERS) {
      const oldestKey = this.emitterStates.keys().next().value;
      if (oldestKey !== undefined) this.emitterStates.delete(oldestKey);
    }
    const state: EmitterState = {
      lastX: footPosition.x,
      lastZ: footPosition.z,
      strideAccum: 0,
      primed: false,
    };
    this.emitterStates.set(emitterId, state);
    return state;
  }
}
