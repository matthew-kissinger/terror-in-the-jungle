// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../../types';
import { GameEventBus } from '../../core/GameEventBus';
import { Faction, isOpfor } from '../combat/types';

const ZONE_CAPTURE_FX_PERF_CATEGORY = 'zone_capture_fx';

const RING_SLOTS = 3;
const RING_LIFETIME_S = 1.3;
const RING_PADDING_FACTOR = 0.55;
const RING_PEAK_OPACITY = 0.85;

const PILLAR_SLOTS = 3;
const PILLAR_LIFETIME_S = 0.5;
const PILLAR_ATTACK_FRACTION = 0.18;
const PILLAR_HEIGHT_M = 14;
const PILLAR_WIDTH_M = 1.4;
const PILLAR_PEAK_OPACITY = 0.7;

const EMBER_BURST_COUNT = 26;
const EMBER_MAX_SLOTS = EMBER_BURST_COUNT * 4; // headroom for ~4 concurrent captures
const EMBER_LIFETIME_S = 1.7;
const EMBER_RISE_SPEED = 1.4;
const EMBER_OUTWARD_SPEED = 1.1;
const EMBER_GRAVITY = 0.6; // gentle deceleration so embers settle rather than rocket up
const EMBER_POINT_SIZE = 0.45;
const EMBER_HIDDEN_POINT = 99999;
// Boosted above the post-stack BloomPass threshold (1.0, see
// MuzzleFlashSystem.MUZZLE_FLASH_BLOOM_GAIN) so embers glow when the optional
// cinematic post-stack is on; harmless additive color when it's off.
const EMBER_BLOOM_GAIN = 1.8;

interface FactionColor { r: number; g: number; b: number; }

const US_COLOR: FactionColor = { r: 0.25, g: 0.85, b: 2.0 };
const OPFOR_COLOR: FactionColor = { r: 2.0, g: 0.35, b: 0.2 };

function colorForFaction(faction: Faction): FactionColor {
  return isOpfor(faction) ? OPFOR_COLOR : US_COLOR;
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function pickOldestOrFree<T extends { active: boolean; age: number }>(slots: T[]): T {
  const free = slots.find(s => !s.active);
  if (free) return free;
  return slots.reduce((oldest, s) => (s.age > oldest.age ? s : oldest));
}

interface RingSlot {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  active: boolean;
  baseRadius: number;
}

interface PillarSlot {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  active: boolean;
}

interface EmberParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  decay: number;
  r: number; g: number; b: number;
}

/**
 * Lightweight "juice" pass for zone-capture completion: a faction-colored
 * expanding ground ring, a brief vertical light-pillar flash at the flagpole,
 * and a rising ember burst. Deliberately distinct from the
 * ExplosionEffectsPool/SmokeCloudSystem combat VFX — a capture is a reward
 * moment, not a hit, so nothing here reads as smoke or an explosion. Capture
 * is a rare event, so all geometry/materials are small fixed pools built once
 * at construction; nothing allocates per trigger.
 */
export class ZoneCaptureEffects implements GameSystem {
  private scene: THREE.Scene;
  private unsubscribe?: () => void;

  private ringGeometry: THREE.RingGeometry;
  private ringSlots: RingSlot[] = [];

  private pillarGeometry: THREE.PlaneGeometry;
  private pillarSlots: PillarSlot[] = [];

  private emberSlots: EmberParticle[];
  private emberActive: number[] = [];
  private emberRing = 0;
  private emberGeometry: THREE.BufferGeometry;
  private emberPositions: Float32Array;
  private emberColors: Float32Array;
  private emberMesh: THREE.Points;
  private emberMaterial: THREE.PointsMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.ringGeometry = new THREE.RingGeometry(0.92, 1, 40);
    for (let i = 0; i < RING_SLOTS; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.ringGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.userData.perfCategory = ZONE_CAPTURE_FX_PERF_CATEGORY;
      scene.add(mesh);
      this.ringSlots.push({ mesh, material, age: 0, active: false, baseRadius: 1 });
    }

    this.pillarGeometry = new THREE.PlaneGeometry(PILLAR_WIDTH_M, PILLAR_HEIGHT_M);
    this.pillarGeometry.translate(0, PILLAR_HEIGHT_M / 2, 0);
    for (let i = 0; i < PILLAR_SLOTS; i++) {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.pillarGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.userData.perfCategory = ZONE_CAPTURE_FX_PERF_CATEGORY;
      scene.add(mesh);
      this.pillarSlots.push({ mesh, material, age: 0, active: false });
    }

    this.emberSlots = Array.from({ length: EMBER_MAX_SLOTS }, () => ({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, decay: 0, r: 1, g: 1, b: 1,
    }));
    const positions = new Float32Array(EMBER_MAX_SLOTS * 3);
    const colors = new Float32Array(EMBER_MAX_SLOTS * 3);
    for (let i = 0; i < EMBER_MAX_SLOTS; i++) {
      positions[i * 3] = positions[i * 3 + 1] = positions[i * 3 + 2] = EMBER_HIDDEN_POINT;
    }
    this.emberGeometry = new THREE.BufferGeometry();
    this.emberGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.emberGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.emberPositions = positions;
    this.emberColors = colors;
    this.emberMaterial = new THREE.PointsMaterial({
      size: EMBER_POINT_SIZE,
      sizeAttenuation: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      alphaTest: 0.02,
    });
    this.emberMesh = new THREE.Points(this.emberGeometry, this.emberMaterial);
    this.emberMesh.frustumCulled = false;
    this.emberMesh.userData.perfCategory = ZONE_CAPTURE_FX_PERF_CATEGORY;
    scene.add(this.emberMesh);
  }

  async init(): Promise<void> {
    this.unsubscribe = GameEventBus.subscribe('zone_captured', (e) => {
      this.trigger(e.position, e.radius, e.faction);
    });
  }

  /** Real trigger path is the event subscription above; exposed directly for tests. */
  trigger(position: THREE.Vector3, radius: number, faction: Faction): void {
    const color = colorForFaction(faction);
    const safeRadius = Math.max(0.5, radius);

    const ring = pickOldestOrFree(this.ringSlots);
    ring.active = true;
    ring.age = 0;
    ring.baseRadius = safeRadius;
    ring.mesh.visible = true;
    ring.mesh.position.set(position.x, position.y + 0.25, position.z);
    ring.mesh.scale.setScalar(safeRadius);
    ring.material.color.setRGB(color.r, color.g, color.b);
    ring.material.opacity = RING_PEAK_OPACITY;

    const pillar = pickOldestOrFree(this.pillarSlots);
    pillar.active = true;
    pillar.age = 0;
    pillar.mesh.visible = true;
    pillar.mesh.position.copy(position);
    pillar.material.color.setRGB(color.r, color.g, color.b);
    pillar.material.opacity = 0;

    this.spawnEmbers(position, safeRadius, color);
  }

  private spawnEmbers(position: THREE.Vector3, radius: number, color: FactionColor): void {
    const spawnRadius = Math.max(1, radius * 0.6);
    for (let i = 0; i < EMBER_BURST_COUNT; i++) {
      const slotIndex = this.emberRing;
      this.emberRing = (this.emberRing + 1) % EMBER_MAX_SLOTS;
      const slot = this.emberSlots[slotIndex];

      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * spawnRadius;
      slot.x = position.x + Math.cos(angle) * r;
      slot.y = position.y + 0.3;
      slot.z = position.z + Math.sin(angle) * r;

      const outward = EMBER_OUTWARD_SPEED * (0.4 + Math.random() * 0.6);
      slot.vx = Math.cos(angle) * outward;
      slot.vz = Math.sin(angle) * outward;
      slot.vy = EMBER_RISE_SPEED * (0.6 + Math.random() * 0.6);

      slot.life = 1.0;
      slot.decay = 1.0 / (EMBER_LIFETIME_S * (0.75 + Math.random() * 0.5));
      slot.r = color.r; slot.g = color.g; slot.b = color.b;

      if (!this.emberActive.includes(slotIndex)) {
        this.emberActive.push(slotIndex);
      }
    }
  }

  update(deltaTime: number): void {
    this.updateRings(deltaTime);
    this.updatePillars(deltaTime);
    this.updateEmbers(deltaTime);
  }

  private updateRings(dt: number): void {
    for (const slot of this.ringSlots) {
      if (!slot.active) continue;
      slot.age += dt;
      if (slot.age >= RING_LIFETIME_S) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      const t = easeOutCubic(slot.age / RING_LIFETIME_S);
      slot.mesh.scale.setScalar(slot.baseRadius * (1 + t * RING_PADDING_FACTOR));
      slot.material.opacity = RING_PEAK_OPACITY * (1 - t);
    }
  }

  private updatePillars(dt: number): void {
    for (const slot of this.pillarSlots) {
      if (!slot.active) continue;
      slot.age += dt;
      if (slot.age >= PILLAR_LIFETIME_S) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      const t = slot.age / PILLAR_LIFETIME_S;
      slot.material.opacity = t < PILLAR_ATTACK_FRACTION
        ? PILLAR_PEAK_OPACITY * (t / PILLAR_ATTACK_FRACTION)
        : PILLAR_PEAK_OPACITY * (1 - (t - PILLAR_ATTACK_FRACTION) / (1 - PILLAR_ATTACK_FRACTION));
    }
  }

  private updateEmbers(dt: number): void {
    if (this.emberActive.length === 0) return;

    let firstDirty = this.emberSlots.length;
    let lastDirty = -1;

    for (let i = 0; i < this.emberActive.length;) {
      const slotIndex = this.emberActive[i];
      const slot = this.emberSlots[slotIndex];

      slot.life -= slot.decay * dt;
      if (slot.life > 0) {
        slot.x += slot.vx * dt;
        slot.y += slot.vy * dt;
        slot.z += slot.vz * dt;
        slot.vy -= EMBER_GRAVITY * dt;
      }

      firstDirty = Math.min(firstDirty, slotIndex);
      lastDirty = Math.max(lastDirty, slotIndex);

      if (slot.life <= 0) {
        const last = this.emberActive.length - 1;
        this.emberActive[i] = this.emberActive[last];
        this.emberActive.pop();
      } else {
        i++;
      }
    }

    if (lastDirty < firstDirty) return;
    for (let i = firstDirty; i <= lastDirty; i++) {
      const slot = this.emberSlots[i];
      const i3 = i * 3;
      if (slot.life > 0) {
        this.emberPositions[i3] = slot.x;
        this.emberPositions[i3 + 1] = slot.y;
        this.emberPositions[i3 + 2] = slot.z;
        const intensity = slot.life * EMBER_BLOOM_GAIN;
        this.emberColors[i3] = slot.r * intensity;
        this.emberColors[i3 + 1] = slot.g * intensity;
        this.emberColors[i3 + 2] = slot.b * intensity;
      } else {
        this.emberPositions[i3] = EMBER_HIDDEN_POINT;
        this.emberPositions[i3 + 1] = EMBER_HIDDEN_POINT;
        this.emberPositions[i3 + 2] = EMBER_HIDDEN_POINT;
      }
    }
    (this.emberGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.emberGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.unsubscribe?.();

    for (const slot of this.ringSlots) {
      this.scene.remove(slot.mesh);
      slot.material.dispose();
    }
    this.ringGeometry.dispose();

    for (const slot of this.pillarSlots) {
      this.scene.remove(slot.mesh);
      slot.material.dispose();
    }
    this.pillarGeometry.dispose();

    this.scene.remove(this.emberMesh);
    this.emberGeometry.dispose();
    this.emberMaterial.dispose();
  }
}
