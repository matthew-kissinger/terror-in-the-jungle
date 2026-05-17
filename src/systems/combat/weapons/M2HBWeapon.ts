/**
 * M2HB weapon component — ammo, cooldown, recoil offset, tracer cadence.
 *
 * Real-world reference: Browning M2HB on M3 tripod, 12.7×99 mm (.50
 * BMG), M33 ball round, 575 RPM cyclic, 887 m/s muzzle velocity, one
 * tracer every fifth round, ~250-round belt-fed box.
 *
 * The component is pure-data: it does not touch the scene, audio, or
 * combatant system. The owning `M2HBEmplacementSystem` calls
 * `tryFire()` (returns true once per round that cycled) and the per-
 * frame `update(dt)` advances cooldown + recoil decay. An NPC gunner
 * controller can call the same `tryFire()` without involving the
 * player adapter.
 */

/**
 * M2HB tuning. Values live in a single readable block; tests pin
 * behavior (RPM cadence, tracer cadence, reload-on-dismount) rather
 * than these literals.
 */
export const M2HB_STATS = Object.freeze({
  /** Cyclic rate, rounds per minute. ~104 ms between rounds. */
  rpm: 575,
  /** Muzzle velocity, metres per second (M33 ball). */
  muzzleVelocityMps: 887,
  /** Per-round damage applied to combatants on hit (heavy MG). */
  damagePerRound: 50,
  /** Ammo box capacity, rounds. Belt-fed; reload on dismount. */
  ammoBoxRounds: 250,
  /** Tracer every Nth round. */
  tracerEveryNth: 5,
  /** Tracer visual lifetime, milliseconds. */
  tracerLifetimeMs: 180,
  /** Max effective range, metres (also caps tracer end visualization). */
  maxRangeM: 1500,
  /** Recoil kick along the barrel's -Z, metres per shot. */
  recoilKickM: 0.015,
  /** Recoil decay rate per second (exponential). */
  recoilDecayPerSecond: 8,
  /** Audio cue identifier from `src/config/audio.ts`. */
  audioCue: 'doorGunBurst' as const,
  /** Audio cooldown so back-to-back shots don't stack samples. */
  audioMinIntervalSec: 0.18,
});

/** Seconds between rounds at cyclic RPM. */
const ROUND_INTERVAL_SEC = 60 / M2HB_STATS.rpm;

export interface M2HBWeaponSnapshot {
  ammo: number;
  ammoMax: number;
  cooldownRemainingSec: number;
  recoilOffsetM: number;
  totalRoundsFired: number;
}

export class M2HBWeapon {
  private ammo: number;
  private cooldownRemainingSec = 0;
  private audioCooldownSec = 0;
  private roundsSinceTracer = 0;
  private totalRoundsFired = 0;
  private recoilOffsetM = 0;
  /** True for the most recent successful fire; consumed by effects render. */
  private lastShotWasTracer = false;

  constructor(public readonly ammoMax: number = M2HB_STATS.ammoBoxRounds) {
    this.ammo = ammoMax;
  }

  /** Step the per-frame timers (cooldown, audio gate, recoil decay). */
  update(dt: number): void {
    if (dt <= 0) return;
    if (this.cooldownRemainingSec > 0) {
      this.cooldownRemainingSec = Math.max(0, this.cooldownRemainingSec - dt);
    }
    if (this.audioCooldownSec > 0) {
      this.audioCooldownSec = Math.max(0, this.audioCooldownSec - dt);
    }
    if (this.recoilOffsetM > 0) {
      const decay = Math.exp(-M2HB_STATS.recoilDecayPerSecond * dt);
      this.recoilOffsetM *= decay;
      if (this.recoilOffsetM < 0.0005) this.recoilOffsetM = 0;
    }
  }

  /**
   * Attempt to fire one round. Returns `true` if the round cycled
   * (caller should spawn tracer / impact / audio for it), `false` if
   * the cooldown hasn't elapsed or the box is empty.
   */
  tryFire(): boolean {
    if (this.cooldownRemainingSec > 0) return false;
    if (this.ammo <= 0) return false;
    this.ammo -= 1;
    this.cooldownRemainingSec = ROUND_INTERVAL_SEC;
    this.recoilOffsetM = Math.min(0.1, this.recoilOffsetM + M2HB_STATS.recoilKickM);
    this.totalRoundsFired += 1;
    this.roundsSinceTracer += 1;
    if (this.roundsSinceTracer >= M2HB_STATS.tracerEveryNth) {
      this.roundsSinceTracer = 0;
      this.lastShotWasTracer = true;
    } else {
      this.lastShotWasTracer = false;
    }
    return true;
  }

  /**
   * Returns true (and resets) if the just-cycled round was a tracer
   * round. Caller invokes immediately after a successful `tryFire`.
   */
  consumeTracerFlag(): boolean {
    const v = this.lastShotWasTracer;
    this.lastShotWasTracer = false;
    return v;
  }

  /**
   * Returns true (and resets the gate) if the audio cue should fire
   * this round; throttled by `audioMinIntervalSec` to avoid sample
   * stacking at 575 RPM.
   */
  consumeAudioGate(): boolean {
    if (this.audioCooldownSec > 0) return false;
    this.audioCooldownSec = M2HB_STATS.audioMinIntervalSec;
    return true;
  }

  /** Refill the box (called on dismount per the M2HB ammo rule). */
  reload(): void {
    this.ammo = this.ammoMax;
    this.roundsSinceTracer = 0;
  }

  /** Current recoil pull-back along the barrel axis (metres, >= 0). */
  getRecoilOffsetM(): number {
    return this.recoilOffsetM;
  }

  getAmmo(): number { return this.ammo; }
  isEmpty(): boolean { return this.ammo <= 0; }

  snapshot(): M2HBWeaponSnapshot {
    return {
      ammo: this.ammo,
      ammoMax: this.ammoMax,
      cooldownRemainingSec: this.cooldownRemainingSec,
      recoilOffsetM: this.recoilOffsetM,
      totalRoundsFired: this.totalRoundsFired,
    };
  }
}
