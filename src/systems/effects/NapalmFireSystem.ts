// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import { createFireTexture, createScorchTexture } from './ExplosionTextures';

/**
 * NapalmFireSystem — persistent burning-ground VFX for napalm strikes.
 *
 * Mirrors `SmokeCloudSystem`'s pooled persistent-effect lifecycle exactly
 * (pre-allocate a pool, acquire on spawn, age each frame, deactivate back to the
 * pool — never destroy/recreate geometry). Each acquired zone is a small group of
 * additive flame billboards + rising ember points + a ground scorch decal that
 * burns for the caller-supplied duration (the napalm mission's `FIRE_DURATION`,
 * passed in so the gameplay layer stays the single owner of the burn clock) and
 * then fades out over `FADE_DURATION`.
 *
 * The flames are intentionally over-bright (colour multiplied past 1.0) so the
 * hot core clears the post-stack bloom threshold (1.0) under AgX tone-mapping
 * and does not wash out — the bug the old "one pooled burst then nothing" napalm
 * had. `fog:false` keeps the fire crisp through a weather fog spike.
 */

const FADE_DURATION = 2.5;          // seconds to die down after the burn window
const RAMP_DURATION = 0.4;          // seconds to ramp up to full intensity
const FLAMES_PER_ZONE = 8;
const EMBERS_PER_ZONE = 14;
const FLAME_BLOOM_GAIN = 2.2;       // HDR boost so the flame core blooms under AgX
const FLAME_BASE_OPACITY = 0.95;
const EMBER_RISE = 9;               // metres an ember climbs before it loops
const MAX_ZONES = 12;               // 6 zones/strike x headroom for an overlapping call

interface NapalmFireZone {
  group: THREE.Group;
  flames: THREE.Sprite[];
  flameMats: THREE.SpriteMaterial[];
  offsets: Float32Array;            // x,z base offset per flame within the zone (2/flame)
  baseScale: Float32Array;          // base sprite size per flame
  phase: Float32Array;              // flicker phase per flame
  flicker: Float32Array;            // flicker speed per flame
  bob: Float32Array;                // vertical bob amplitude per flame
  embers: THREE.Points;
  emberMat: THREE.PointsMaterial;
  emberBase: Float32Array;          // x,z base + per-ember seed (3/ember: ox, oz, seed)
  emberPositions: Float32Array;     // live point positions (3/ember)
  emberAttr: THREE.BufferAttribute;
  scorch: THREE.Mesh;
  scorchMat: THREE.MeshBasicMaterial;
  age: number;
  duration: number;                 // full-strength burn window (caller-supplied)
  radius: number;
}

let napalmFireSystem: NapalmFireSystem | undefined;

export function setNapalmFireSystem(system?: NapalmFireSystem): void {
  napalmFireSystem = system;
}

/**
 * Spawn one persistent fire zone. `duration` is the full-strength burn window in
 * seconds (the mission passes its `FIRE_DURATION` so the flames and the damage
 * ticks share one clock); `radius` sizes the footprint. No-op when the system is
 * not wired (e.g. in unit tests), exactly like `spawnSmokeCloud`.
 */
export function spawnNapalmFire(position: THREE.Vector3, duration: number, radius: number): void {
  napalmFireSystem?.spawn(position, duration, radius);
}

export class NapalmFireSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  private flameTexture!: THREE.Texture;
  private scorchTexture!: THREE.Texture;
  private zones: NapalmFireZone[] = [];
  private pool: NapalmFireZone[] = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  async init(): Promise<void> {
    Logger.info('effects', 'Initializing Napalm Fire System...');
    this.flameTexture = createFireTexture();
    this.scorchTexture = createScorchTexture();

    for (let i = 0; i < MAX_ZONES; i++) {
      const zone = this.createZone();
      this.scene.add(zone.group);
      this.pool.push(zone);
    }

    Logger.info('effects', `Napalm Fire System initialized (pool: ${MAX_ZONES})`);
  }

  update(deltaTime: number): void {
    if (this.zones.length === 0) return;

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      zone.age += deltaTime;

      const total = zone.duration + FADE_DURATION;
      if (zone.age >= total) {
        this.deactivateZone(i);
        continue;
      }

      // Intensity envelope: quick ramp -> full burn -> fade tail.
      let intensity: number;
      if (zone.age < RAMP_DURATION) {
        intensity = zone.age / RAMP_DURATION;
      } else if (zone.age < zone.duration) {
        intensity = 1;
      } else {
        intensity = 1 - (zone.age - zone.duration) / FADE_DURATION;
      }

      this.updateFlames(zone, intensity);
      this.updateEmbers(zone, intensity);
      this.scorchMat(zone, intensity);
    }
  }

  dispose(): void {
    for (const zone of this.zones) this.disposeZone(zone);
    for (const zone of this.pool) this.disposeZone(zone);
    this.zones.length = 0;
    this.pool.length = 0;
    this.flameTexture?.dispose();
    this.scorchTexture?.dispose();
    // Only surrender the module singleton if it still points at us, so a
    // re-initialised system (constructed + wired before this one tears down)
    // is not accidentally unwired.
    if (napalmFireSystem === this) setNapalmFireSystem(undefined);
    Logger.info('effects', 'Napalm Fire System disposed');
  }

  spawn(position: THREE.Vector3, duration: number, radius: number): void {
    const zone = this.pool.pop() || this.zones.pop();
    if (!zone) return;

    zone.age = 0;
    zone.duration = Math.max(0.1, duration);
    zone.radius = Math.max(1, radius);
    zone.group.position.copy(position);
    zone.group.visible = true;

    // Randomise flame placement + flicker each spawn so reused zones never look
    // identical (the per-billboard frame-rate jitter the plan calls for).
    const footprint = zone.radius * 0.7;
    for (let f = 0; f < zone.flames.length; f++) {
      const ox = (Math.random() * 2 - 1) * footprint;
      const oz = (Math.random() * 2 - 1) * footprint;
      zone.offsets[f * 2] = ox;
      zone.offsets[f * 2 + 1] = oz;
      zone.baseScale[f] = zone.radius * (0.5 + Math.random() * 0.5);
      zone.phase[f] = Math.random() * Math.PI * 2;
      zone.flicker[f] = 6 + Math.random() * 6;        // ±jittered flicker rate
      zone.bob[f] = 0.6 + Math.random() * 1.2;
      zone.flameMats[f].opacity = 0;
    }

    for (let e = 0; e < EMBERS_PER_ZONE; e++) {
      zone.emberBase[e * 3] = (Math.random() * 2 - 1) * footprint;       // ox
      zone.emberBase[e * 3 + 1] = (Math.random() * 2 - 1) * footprint;   // oz
      zone.emberBase[e * 3 + 2] = Math.random() * EMBER_RISE;            // seed/offset
    }
    zone.emberMat.opacity = 0;

    zone.scorch.scale.setScalar(zone.radius);
    zone.scorchMat.opacity = 0;

    this.zones.push(zone);
  }

  private updateFlames(zone: NapalmFireZone, intensity: number): void {
    const sizeScale = 0.45 + 0.55 * intensity;
    for (let f = 0; f < zone.flames.length; f++) {
      const flick = 0.75 + 0.25 * Math.sin(zone.age * zone.flicker[f] + zone.phase[f]);
      const w = zone.baseScale[f] * (0.85 + 0.15 * flick) * sizeScale;
      const h = w * (1.5 + 0.4 * flick);
      const sprite = zone.flames[f];
      const ox = zone.offsets[f * 2];
      const oz = zone.offsets[f * 2 + 1];
      const bob = Math.sin(zone.age * zone.flicker[f] * 0.5 + zone.phase[f]) * zone.bob[f];
      // Sprites are centre-anchored; lift by half height so the base sits on the
      // ground, plus the bob.
      sprite.position.set(ox, h * 0.5 + bob, oz);
      sprite.scale.set(w, h, 1);
      zone.flameMats[f].opacity = FLAME_BASE_OPACITY * intensity * flick;
    }
  }

  private updateEmbers(zone: NapalmFireZone, intensity: number): void {
    const pos = zone.emberPositions;
    for (let e = 0; e < EMBERS_PER_ZONE; e++) {
      const ox = zone.emberBase[e * 3];
      const oz = zone.emberBase[e * 3 + 1];
      const seed = zone.emberBase[e * 3 + 2];
      // Deterministic looping rise computed from age (no per-frame integration
      // state): each ember climbs EMBER_RISE then loops, desynced by its seed.
      const climb = (zone.age * (1.6 + (seed % 1) * 1.2) + seed) % EMBER_RISE;
      const drift = 0.6 * Math.sin(zone.age * 1.3 + seed);
      pos[e * 3] = ox + drift;
      pos[e * 3 + 1] = climb;
      pos[e * 3 + 2] = oz + 0.6 * Math.cos(zone.age * 1.1 + seed);
    }
    zone.emberAttr.needsUpdate = true;
    zone.emberMat.opacity = 0.85 * intensity;
  }

  private scorchMat(zone: NapalmFireZone, intensity: number): void {
    // Scorch lingers near-full through the burn and only fades on the tail.
    zone.scorchMat.opacity = 0.85 * Math.min(1, intensity * 1.6);
  }

  private createZone(): NapalmFireZone {
    const group = new THREE.Group();
    group.visible = false;

    const flames: THREE.Sprite[] = [];
    const flameMats: THREE.SpriteMaterial[] = [];
    for (let i = 0; i < FLAMES_PER_ZONE; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.flameTexture,
        color: new THREE.Color(0xff7a1a).multiplyScalar(FLAME_BLOOM_GAIN),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 3;
      group.add(sprite);
      flames.push(sprite);
      flameMats.push(material);
    }

    const emberPositions = new Float32Array(EMBERS_PER_ZONE * 3);
    const emberGeometry = new THREE.BufferGeometry();
    const emberAttr = new THREE.BufferAttribute(emberPositions, 3);
    emberGeometry.setAttribute('position', emberAttr);
    const emberMat = new THREE.PointsMaterial({
      map: this.flameTexture,
      color: new THREE.Color(0xffb255).multiplyScalar(FLAME_BLOOM_GAIN),
      size: 0.9,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });
    const embers = new THREE.Points(emberGeometry, emberMat);
    embers.renderOrder = 3;
    group.add(embers);

    const scorchMaterial = new THREE.MeshBasicMaterial({
      map: this.scorchTexture,
      color: 0x1a120c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      fog: false,
    });
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(1, 24), scorchMaterial);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.15;
    scorch.renderOrder = 1;
    group.add(scorch);

    return {
      group,
      flames,
      flameMats,
      offsets: new Float32Array(FLAMES_PER_ZONE * 2),
      baseScale: new Float32Array(FLAMES_PER_ZONE),
      phase: new Float32Array(FLAMES_PER_ZONE),
      flicker: new Float32Array(FLAMES_PER_ZONE),
      bob: new Float32Array(FLAMES_PER_ZONE),
      embers,
      emberMat,
      emberBase: new Float32Array(EMBERS_PER_ZONE * 3),
      emberPositions,
      emberAttr,
      scorch,
      scorchMat: scorchMaterial,
      age: 0,
      duration: 12,
      radius: 25,
    };
  }

  private deactivateZone(index: number): void {
    const zone = this.zones[index];
    zone.group.visible = false;
    for (const mat of zone.flameMats) mat.opacity = 0;
    zone.emberMat.opacity = 0;
    zone.scorchMat.opacity = 0;

    const last = this.zones.length - 1;
    if (index !== last) this.zones[index] = this.zones[last];
    this.zones.pop();
    this.pool.push(zone);
  }

  private disposeZone(zone: NapalmFireZone): void {
    this.scene.remove(zone.group);
    for (const mat of zone.flameMats) mat.dispose();
    zone.emberMat.dispose();
    zone.embers.geometry.dispose();
    zone.scorchMat.dispose();
    zone.scorch.geometry.dispose();
  }
}
