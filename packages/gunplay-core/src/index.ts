// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export interface WeaponSpec {
  id: string;
  rpm: number;
  baseSpreadDeg: number;
  bloomPerShotDeg: number;
  recoilPerShotDeg: number;
  recoilHorizontalDeg: number;
  damageNear: number;
  damageFar: number;
  falloffStart: number;
  falloffEnd: number;
  headshotMultiplier: number;
  pelletCount?: number;
  pelletSpreadDeg?: number;
}

export interface GunplayClock {
  nowMs(): number;
}

export type GunplayRng = () => number;

export interface GunplayCoreOptions {
  clock?: GunplayClock;
  rng?: GunplayRng;
}

export interface RecoilOffset {
  pitchDeg: number;
  yawDeg: number;
}

export interface ShotCommand {
  weaponId: string;
  firedAtMs: number;
  spreadDeg: number;
  recoil: RecoilOffset;
  pelletCount: number;
  pelletSpreadDeg: number;
}

export interface GunplayCore {
  canFire(): boolean;
  registerShot(): ShotCommand;
  cooldown(deltaSeconds: number): void;
  getSpreadDeg(): number;
  getRecoilOffsetDeg(): RecoilOffset;
  computeDamage(distance: number, isHeadshot: boolean): number;
  getSpec(): WeaponSpec;
}

export function createGunplayCore(
  spec: WeaponSpec,
  options: GunplayCoreOptions = {},
): GunplayCore {
  const clock = options.clock ?? { nowMs: () => performance.now() };
  const rng = options.rng ?? Math.random;
  let bloomDeg = 0;
  let lastShotTime = -Infinity;
  let recoilIndex = 0;
  let accumulatedRecoil = 0;

  function canFire(): boolean {
    const msPerShot = 60000 / spec.rpm;
    return clock.nowMs() - lastShotTime >= msPerShot;
  }

  function getRecoilOffsetDeg(): RecoilOffset {
    const yaw = seededPattern(recoilIndex, rng) * spec.recoilHorizontalDeg;
    const recoilMultiplier = Math.max(0.3, 1 - accumulatedRecoil / 15);
    return {
      pitchDeg: spec.recoilPerShotDeg * recoilMultiplier,
      yawDeg: yaw,
    };
  }

  function registerShot(): ShotCommand {
    if (!canFire()) {
      throw new Error(`Weapon ${spec.id} cannot fire yet.`);
    }
    lastShotTime = clock.nowMs();
    bloomDeg = Math.min(bloomDeg + spec.bloomPerShotDeg, spec.baseSpreadDeg * 4);
    recoilIndex++;
    accumulatedRecoil = Math.min(accumulatedRecoil + spec.recoilPerShotDeg, 10);
    return createShotCommand({
      weaponId: spec.id,
      firedAtMs: lastShotTime,
      spreadDeg: bloomDeg,
      recoil: getRecoilOffsetDeg(),
      pelletCount: spec.pelletCount ?? 1,
      pelletSpreadDeg: spec.pelletSpreadDeg ?? 0,
    });
  }

  return {
    canFire,
    registerShot,
    cooldown(deltaSeconds) {
      bloomDeg = Math.max(0, bloomDeg - spec.baseSpreadDeg * 6 * deltaSeconds);
      accumulatedRecoil = Math.max(0, accumulatedRecoil - 5 * deltaSeconds);
    },
    getSpreadDeg: () => bloomDeg,
    getRecoilOffsetDeg,
    computeDamage: (distance, isHeadshot) => computeDamage(spec, distance, isHeadshot),
    getSpec: () => ({ ...spec }),
  };
}

export function createShotCommand(command: ShotCommand): ShotCommand {
  if (!Number.isFinite(command.firedAtMs)) {
    throw new Error('ShotCommand firedAtMs must be finite.');
  }
  if (command.pelletCount < 1 || !Number.isInteger(command.pelletCount)) {
    throw new Error('ShotCommand pelletCount must be a positive integer.');
  }
  return { ...command, recoil: { ...command.recoil } };
}

export function computeDamage(spec: WeaponSpec, distance: number, isHeadshot: boolean): number {
  const t = distance <= spec.falloffStart
    ? 0
    : clamp((distance - spec.falloffStart) / Math.max(1e-3, spec.falloffEnd - spec.falloffStart), 0, 1);
  const base = lerp(spec.damageNear, spec.damageFar, t);
  return isHeadshot ? base * spec.headshotMultiplier : base;
}

function seededPattern(index: number, rng: GunplayRng): number {
  const randomNudge = rng() * 0.0001;
  const x = Math.sin(9001 + index * 12.9898 + randomNudge) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}