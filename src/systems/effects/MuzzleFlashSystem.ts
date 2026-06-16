// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

/** Weapon variant index for particle appearance */
export const enum MuzzleFlashVariant {
  RIFLE = 0,
  SHOTGUN = 1,
  SMG = 2,
  PISTOL = 3,
}

// Per-variant burst parameters
const PRESETS = [
  // RIFLE: tight hot burst
  { count: 8,  spread: 0.14, speed: 0.55, lifetime: 0.055, baseSize: 11, r: 1.0, g: 0.70, b: 0.30 },
  // SHOTGUN: wide orange spray
  { count: 13, spread: 0.32, speed: 0.48, lifetime: 0.080, baseSize: 14, r: 1.0, g: 0.72, b: 0.18 },
  // SMG: small fast orange burst
  { count: 6,  spread: 0.18, speed: 0.65, lifetime: 0.042, baseSize: 10, r: 1.0, g: 0.62, b: 0.22 },
  // PISTOL: softer yellow pop
  { count: 5,  spread: 0.24, speed: 0.50, lifetime: 0.065, baseSize: 11, r: 1.0, g: 0.82, b: 0.38 },
] as const;

const MAX_PLAYER = 32;  // ring buffer for player weapon overlay
const MAX_NPC    = 64;  // ring buffer shared across all NPC weapons

const HIDDEN_POINT = 99999;
const PLAYER_POINT_SIZE = 12;
const NPC_POINT_SIZE = 0.55;
const MUZZLE_FLASH_PERF_CATEGORY = 'muzzle_flash_fx';

// CPU-side particle state (plain arrays for tight memory layout)
interface CpuParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;    // 0..1 normalized
  decay: number;   // per second
  r: number; g: number; b: number;
  size: number;    // pixels (player) or world fraction (NPC)
}

function makeCpuSlots(n: number): CpuParticle[] {
  return Array.from({ length: n }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    life: 0, decay: 0, r: 1, g: 1, b: 1, size: 10,
  }));
}

function buildPoints(max: number, options: { size: number; sizeAttenuation: boolean; name: string }): {
  points: THREE.Points;
  positions: Float32Array;
  colors: Float32Array;
} {
  const positions = new Float32Array(max * 3);
  const colors    = new Float32Array(max * 3);

  for (let i = 0; i < max; i++) {
    const i3 = i * 3;
    positions[i3] = HIDDEN_POINT;
    positions[i3 + 1] = HIDDEN_POINT;
    positions[i3 + 2] = HIDDEN_POINT;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',     new THREE.BufferAttribute(colors,    3));
  (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

  const mat = new THREE.PointsMaterial({
    name: options.name,
    size: options.size,
    sizeAttenuation: options.sizeAttenuation,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    alphaTest: 0.02,
    opacity: 1,
  });

  const points = new THREE.Points(geo, mat);
  points.name = options.name.replace(/Material$/, '');
  points.userData.perfCategory = MUZZLE_FLASH_PERF_CATEGORY;
  points.frustumCulled = false;

  return { points, positions, colors };
}

// Emit one particle into a slot
function emitParticle(
  slot: CpuParticle,
  pos: THREE.Vector3,
  forwardX: number,
  forwardY: number,
  forwardZ: number,
  preset: typeof PRESETS[number],
  sizeScale = 1,
): void {
  slot.x = pos.x; slot.y = pos.y; slot.z = pos.z;

  // Random direction in a cone around the supplied forward direction.
  const theta  = Math.random() * Math.PI * 2;
  const phi    = Math.random() * preset.spread;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  // Build a perpendicular frame (simple - not fully accurate but fine for small spread)
  const perpX = sinPhi * Math.cos(theta);
  const perpY = sinPhi * Math.sin(theta);

  const spd = preset.speed * (0.7 + Math.random() * 0.6);
  slot.vx = (forwardX * cosPhi + perpX) * spd;
  slot.vy = (forwardY * cosPhi + perpY) * spd;
  slot.vz = forwardZ * cosPhi * spd;

  slot.life  = 1.0;
  slot.decay = 1.0 / (preset.lifetime * (0.8 + Math.random() * 0.4));
  slot.r     = preset.r;
  slot.g     = preset.g;
  slot.b     = preset.b;
  slot.size  = preset.baseSize * sizeScale * (0.8 + Math.random() * 0.4);
}

// Upload particle state to GPU buffers
function uploadSlots(
  slots: CpuParticle[],
  positions: Float32Array,
  colors: Float32Array,
  geo: THREE.BufferGeometry,
  firstDirtySlot = 0,
  lastDirtySlot = slots.length - 1,
): void {
  if (lastDirtySlot < firstDirtySlot) {
    return;
  }

  for (let i = firstDirtySlot; i <= lastDirtySlot; i++) {
    const s = slots[i];
    const i3 = i * 3;
    if (s.life > 0) {
      positions[i3]     = s.x;
      positions[i3 + 1] = s.y;
      positions[i3 + 2] = s.z;
    } else {
      positions[i3]     = HIDDEN_POINT;
      positions[i3 + 1] = HIDDEN_POINT;
      positions[i3 + 2] = HIDDEN_POINT;
    }
    const intensity = s.life * 1.6;
    colors[i3]        = s.r * intensity;
    colors[i3 + 1]    = s.g * intensity;
    colors[i3 + 2]    = s.b * intensity;
  }

  const slotCount = lastDirtySlot - firstDirtySlot + 1;
  const rangeStart = firstDirtySlot * 3;
  const rangeCount = slotCount * 3;
  const positionAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const colorAttr = geo.getAttribute('color') as THREE.BufferAttribute;
  addAttributeUpdateRange(positionAttr, rangeStart, rangeCount);
  addAttributeUpdateRange(colorAttr, rangeStart, rangeCount);
  positionAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
}

function addAttributeUpdateRange(attribute: THREE.BufferAttribute, start: number, count: number): void {
  if (typeof attribute.addUpdateRange === 'function') {
    attribute.addUpdateRange(start, count);
  }
}

function makeActiveSlotPositions(max: number): Int16Array {
  const positions = new Int16Array(max);
  positions.fill(-1);
  return positions;
}

function activateSlot(slotIndex: number, activeSlots: number[], activeSlotPositions: Int16Array): void {
  if (activeSlotPositions[slotIndex] >= 0) {
    return;
  }
  activeSlotPositions[slotIndex] = activeSlots.length;
  activeSlots.push(slotIndex);
}

function removeActiveSlotAt(activeIndex: number, activeSlots: number[], activeSlotPositions: Int16Array): void {
  const slotIndex = activeSlots[activeIndex];
  const lastActiveIndex = activeSlots.length - 1;
  const lastSlotIndex = activeSlots[lastActiveIndex];
  activeSlotPositions[slotIndex] = -1;
  if (activeIndex !== lastActiveIndex) {
    activeSlots[activeIndex] = lastSlotIndex;
    activeSlotPositions[lastSlotIndex] = activeIndex;
  }
  activeSlots.pop();
}

function updateActiveSlots(
  slots: CpuParticle[],
  activeSlots: number[],
  activeSlotPositions: Int16Array,
  positions: Float32Array,
  colors: Float32Array,
  geo: THREE.BufferGeometry,
  dt: number,
): void {
  let firstDirty = slots.length;
  let lastDirty = -1;

  for (let activeIndex = 0; activeIndex < activeSlots.length;) {
    const slotIndex = activeSlots[activeIndex];
    const s = slots[slotIndex];

    if (s.life > 0) {
      s.life -= s.decay * dt;
      if (s.life < 0) s.life = 0;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
    }

    firstDirty = Math.min(firstDirty, slotIndex);
    lastDirty = Math.max(lastDirty, slotIndex);

    if (s.life <= 0) {
      removeActiveSlotAt(activeIndex, activeSlots, activeSlotPositions);
    } else {
      activeIndex++;
    }
  }

  uploadSlots(slots, positions, colors, geo, firstDirty, lastDirty);
}

// Scratch vectors to avoid allocation
const _scratchVec = new THREE.Vector3();

/**
 * 3D particle burst system for weapon firing.
 *
 * Player path: Points burst in the weapon overlay scene (orthographic camera).
 *   Particles spread from the muzzle tip in a cone toward screen center.
 *
 * NPC path: Points burst in the main 3D scene (perspective camera).
 *   Ring-buffered pool shared across all NPC weapons firing simultaneously.
 *
 * Zero textures. 1 draw call per path. Ring-buffer pool, no alloc per shot.
 */
export class MuzzleFlashSystem {
  // ---- Player path ----
  private playerSlots: CpuParticle[]  = makeCpuSlots(MAX_PLAYER);
  private playerActiveSlots: number[] = [];
  private playerActiveSlotPositions = makeActiveSlotPositions(MAX_PLAYER);
  private playerRing  = 0;
  private playerGeo!: THREE.BufferGeometry;
  private playerPos!: Float32Array;
  private playerCol!: Float32Array;
  private playerMesh?: THREE.Points;
  private playerScene: THREE.Scene | null = null;

  // ---- NPC path ----
  private npcSlots: CpuParticle[];
  private npcActiveSlots: number[] = [];
  private npcActiveSlotPositions = makeActiveSlotPositions(MAX_NPC);
  private npcRing  = 0;
  private npcGeo:   THREE.BufferGeometry;
  private npcPos:   Float32Array;
  private npcCol:   Float32Array;
  private npcMesh:  THREE.Points;

  constructor(scene: THREE.Scene, _maxInstances = 64) {
    // NPC pool lives in the main scene from construction
    const npc = buildPoints(MAX_NPC, {
      size: NPC_POINT_SIZE,
      sizeAttenuation: true,
      name: 'NPCMuzzleFlashPointsMaterial',
    });
    this.npcSlots = makeCpuSlots(MAX_NPC);
    this.npcGeo   = npc.points.geometry as THREE.BufferGeometry;
    this.npcPos   = npc.positions;
    this.npcCol   = npc.colors;
    this.npcMesh  = npc.points;
    this.npcMesh.matrixAutoUpdate = true;
    scene.add(this.npcMesh);
  }

  preparePlayerOverlayScene(overlayScene: THREE.Scene): void {
    this.ensurePlayerOverlayScene(overlayScene);
  }

  /**
   * Spawn a particle burst for an NPC weapon firing.
   */
  spawnNPC(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    scale = 1.0,
    variant: MuzzleFlashVariant = MuzzleFlashVariant.RIFLE,
  ): void {
    const preset = PRESETS[variant as number] ?? PRESETS[0];
    const forwardX = direction.x;
    const forwardY = direction.y;
    const forwardZ = direction.z;
    _scratchVec.copy(position).addScaledVector(direction, 0.05);

    for (let i = 0; i < preset.count; i++) {
      const slotIndex = this.npcRing;
      const slot = this.npcSlots[slotIndex];
      this.npcRing = (this.npcRing + 1) % MAX_NPC;
      emitParticle(slot, _scratchVec, forwardX, forwardY, forwardZ, preset, scale * 0.3);
      activateSlot(slotIndex, this.npcActiveSlots, this.npcActiveSlotPositions);
    }
  }

  /**
   * Spawn a particle burst for the player weapon.
   * Particles are added to the overlay scene and spread from the muzzle tip.
   */
  spawnPlayer(
    overlayScene: THREE.Scene,
    muzzleWorldPos: THREE.Vector3,
    _direction: THREE.Vector3,
    variant: MuzzleFlashVariant = MuzzleFlashVariant.RIFLE,
  ): void {
    this.ensurePlayerOverlayScene(overlayScene);

    const preset = PRESETS[variant as number] ?? PRESETS[0];

    // Forward direction in overlay scene: from muzzle toward screen center in XY,
    // with a small -Z component (barrel points roughly into screen in ortho view).
    const fx = -muzzleWorldPos.x;
    const fy = -muzzleWorldPos.y;
    const fLen = Math.sqrt(fx * fx + fy * fy) || 1;
    const forwardX = (fx / fLen) * 0.85;
    const forwardY = (fy / fLen) * 0.85;
    const forwardZ = -0.3;

    for (let i = 0; i < preset.count; i++) {
      const slotIndex = this.playerRing;
      const slot = this.playerSlots[slotIndex];
      this.playerRing = (this.playerRing + 1) % MAX_PLAYER;
      emitParticle(slot, muzzleWorldPos, forwardX, forwardY, forwardZ, preset, 1.0);
      activateSlot(slotIndex, this.playerActiveSlots, this.playerActiveSlotPositions);
    }
  }

  private ensurePlayerOverlayScene(overlayScene: THREE.Scene): void {
    if (this.playerScene === overlayScene) return;

    if (this.playerMesh && this.playerScene) {
      this.playerScene.remove(this.playerMesh);
    }
    const player = buildPoints(MAX_PLAYER, {
      size: PLAYER_POINT_SIZE,
      sizeAttenuation: false,
      name: 'PlayerMuzzleFlashPointsMaterial',
    });
    this.playerSlots = makeCpuSlots(MAX_PLAYER);
    this.playerActiveSlots.length = 0;
    this.playerActiveSlotPositions.fill(-1);
    this.playerGeo   = player.points.geometry as THREE.BufferGeometry;
    this.playerPos   = player.positions;
    this.playerCol   = player.colors;
    this.playerMesh  = player.points;
    this.playerRing  = 0;
    overlayScene.add(this.playerMesh);
    this.playerScene = overlayScene;
  }

  /**
   * Per-frame update — decays all active particles and uploads to GPU.
   */
  update(deltaTime?: number): void {
    const dt = deltaTime ?? 0.016;

    // Player slots
    if (this.playerMesh && this.playerActiveSlots.length > 0) {
      updateActiveSlots(
        this.playerSlots,
        this.playerActiveSlots,
        this.playerActiveSlotPositions,
        this.playerPos,
        this.playerCol,
        this.playerGeo,
        dt,
      );
    }

    // NPC slots
    if (this.npcActiveSlots.length > 0) {
      updateActiveSlots(
        this.npcSlots,
        this.npcActiveSlots,
        this.npcActiveSlotPositions,
        this.npcPos,
        this.npcCol,
        this.npcGeo,
        dt,
      );
    }
  }

  dispose(): void {
    this.npcMesh.geometry.dispose();
    (this.npcMesh.material as THREE.PointsMaterial).dispose();
    this.npcMesh.parent?.remove(this.npcMesh);

    if (this.playerMesh) {
      this.playerMesh.geometry.dispose();
      (this.playerMesh.material as THREE.PointsMaterial).dispose();
      this.playerScene?.remove(this.playerMesh);
    }
  }
}
