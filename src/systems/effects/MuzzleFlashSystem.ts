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

// ---- Player overlay shader (orthographic camera, fixed pixel size) ----
const PLAYER_VERT = /* glsl */`
  attribute float aLife;
  attribute float aBaseSize;
  attribute vec3  aColor;
  varying vec3  vColor;
  varying float vLife;

  void main() {
    vColor = aColor;
    vLife  = aLife;
    if (aLife <= 0.0) {
      gl_Position = vec4(99999.0, 99999.0, 0.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aBaseSize * aLife;
  }
`;

// ---- NPC scene shader (perspective camera, distance-attenuated size) ----
const NPC_VERT = /* glsl */`
  attribute float aLife;
  attribute float aBaseSize;
  attribute vec3  aColor;
  varying vec3  vColor;
  varying float vLife;

  void main() {
    vColor = aColor;
    vLife  = aLife;
    if (aLife <= 0.0) {
      gl_Position = vec4(99999.0, 99999.0, 0.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec4 mvPos   = modelViewMatrix * vec4(position, 1.0);
    gl_Position  = projectionMatrix * mvPos;
    // world-unit base size, divided by view-space depth for perspective
    gl_PointSize = (aBaseSize * aLife * 40.0) / -mvPos.z;
  }
`;

// Shared fragment shader: soft radial circle, bright core
const SHARED_FRAG = /* glsl */`
  varying vec3  vColor;
  varying float vLife;

  void main() {
    if (vLife <= 0.0) discard;
    vec2  coord = gl_PointCoord * 2.0 - 1.0;
    float d     = length(coord);
    if (d > 1.0) discard;
    float alpha = (1.0 - d * d) * vLife * 0.85;
    // hot white core, variant color at edge
    vec3  col   = mix(vColor, vec3(1.0, 0.96, 0.90), max(0.0, 1.0 - d * 1.8));
    gl_FragColor = vec4(col * 1.6, alpha);
  }
`;

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

function buildPoints(max: number, vertexShader: string): {
  points: THREE.Points;
  positions: Float32Array;
  colors: Float32Array;
  lives: Float32Array;
  sizes: Float32Array;
} {
  const positions = new Float32Array(max * 3);
  const colors    = new Float32Array(max * 3);
  const lives     = new Float32Array(max);
  const sizes     = new Float32Array(max);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor',    new THREE.BufferAttribute(colors,    3));
  geo.setAttribute('aLife',     new THREE.BufferAttribute(lives,     1));
  geo.setAttribute('aBaseSize', new THREE.BufferAttribute(sizes,     1));

  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: SHARED_FRAG,
    blending:      THREE.AdditiveBlending,
    depthWrite:    false,
    depthTest:     true,
    transparent:   true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return { points, positions, colors, lives, sizes };
}

// Emit one particle into a slot
function emitParticle(
  slot: CpuParticle,
  pos: THREE.Vector3,
  forwardDir: { x: number; y: number; z: number },
  preset: typeof PRESETS[number],
  sizeScale = 1,
): void {
  slot.x = pos.x; slot.y = pos.y; slot.z = pos.z;

  // Random direction in a cone around forwardDir
  const theta  = Math.random() * Math.PI * 2;
  const phi    = Math.random() * preset.spread;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  // Build a perpendicular frame (simple - not fully accurate but fine for small spread)
  const perpX = sinPhi * Math.cos(theta);
  const perpY = sinPhi * Math.sin(theta);

  const spd = preset.speed * (0.7 + Math.random() * 0.6);
  slot.vx = (forwardDir.x * cosPhi + perpX) * spd;
  slot.vy = (forwardDir.y * cosPhi + perpY) * spd;
  slot.vz = forwardDir.z * cosPhi * spd;

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
  lives: Float32Array,
  sizes: Float32Array,
  geo: THREE.BufferGeometry,
): void {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const i3 = i * 3;
    positions[i3]     = s.x;
    positions[i3 + 1] = s.y;
    positions[i3 + 2] = s.z;
    colors[i3]        = s.r;
    colors[i3 + 1]    = s.g;
    colors[i3 + 2]    = s.b;
    lives[i]          = s.life;
    sizes[i]          = s.size;
  }
  (geo.getAttribute('position')  as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('aColor')    as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('aLife')     as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('aBaseSize') as THREE.BufferAttribute).needsUpdate = true;
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
  private playerRing  = 0;
  private playerGeo!: THREE.BufferGeometry;
  private playerPos!: Float32Array;
  private playerCol!: Float32Array;
  private playerLif!: Float32Array;
  private playerSiz!: Float32Array;
  private playerMesh?: THREE.Points;
  private playerScene: THREE.Scene | null = null;

  // ---- NPC path ----
  private npcSlots: CpuParticle[];
  private npcRing  = 0;
  private npcGeo:   THREE.BufferGeometry;
  private npcPos:   Float32Array;
  private npcCol:   Float32Array;
  private npcLif:   Float32Array;
  private npcSiz:   Float32Array;
  private npcMesh:  THREE.Points;

  constructor(scene: THREE.Scene, _maxInstances = 64) {
    // NPC pool lives in the main scene from construction
    const npc = buildPoints(MAX_NPC, NPC_VERT);
    this.npcSlots = makeCpuSlots(MAX_NPC);
    this.npcGeo   = npc.points.geometry as THREE.BufferGeometry;
    this.npcPos   = npc.positions;
    this.npcCol   = npc.colors;
    this.npcLif   = npc.lives;
    this.npcSiz   = npc.sizes;
    this.npcMesh  = npc.points;
    scene.add(this.npcMesh);
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
    const fwd = { x: direction.x, y: direction.y, z: direction.z };

    for (let i = 0; i < preset.count; i++) {
      const slot = this.npcSlots[this.npcRing];
      this.npcRing = (this.npcRing + 1) % MAX_NPC;
      _scratchVec.copy(position).addScaledVector(direction, 0.05);
      emitParticle(slot, _scratchVec, fwd, preset, scale * 0.3);
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
    // Lazily build the player Points geometry and add to the overlay scene
    if (this.playerScene !== overlayScene) {
      if (this.playerMesh && this.playerScene) {
        this.playerScene.remove(this.playerMesh);
      }
      const player = buildPoints(MAX_PLAYER, PLAYER_VERT);
      this.playerSlots = makeCpuSlots(MAX_PLAYER);
      this.playerGeo   = player.points.geometry as THREE.BufferGeometry;
      this.playerPos   = player.positions;
      this.playerCol   = player.colors;
      this.playerLif   = player.lives;
      this.playerSiz   = player.sizes;
      this.playerMesh  = player.points;
      this.playerRing  = 0;
      overlayScene.add(this.playerMesh);
      this.playerScene = overlayScene;
    }

    const preset = PRESETS[variant as number] ?? PRESETS[0];

    // Forward direction in overlay scene: from muzzle toward screen center in XY,
    // with a small -Z component (barrel points roughly into screen in ortho view).
    const fx = -muzzleWorldPos.x;
    const fy = -muzzleWorldPos.y;
    const fLen = Math.sqrt(fx * fx + fy * fy) || 1;
    const fwd = {
      x: (fx / fLen) * 0.85,
      y: (fy / fLen) * 0.85,
      z: -0.3,
    };

    for (let i = 0; i < preset.count; i++) {
      const slot = this.playerSlots[this.playerRing];
      this.playerRing = (this.playerRing + 1) % MAX_PLAYER;
      emitParticle(slot, muzzleWorldPos, fwd, preset, 1.0);
    }
  }

  /**
   * Per-frame update — decays all active particles and uploads to GPU.
   */
  update(deltaTime?: number): void {
    const dt = deltaTime ?? 0.016;
    let playerDirty = false;
    let npcDirty    = false;

    // Player slots
    if (this.playerMesh) {
      for (let i = 0; i < MAX_PLAYER; i++) {
        const s = this.playerSlots[i];
        if (s.life > 0) {
          s.life -= s.decay * dt;
          if (s.life < 0) s.life = 0;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.z += s.vz * dt;
          playerDirty = true;
        }
      }
      if (playerDirty) {
        uploadSlots(this.playerSlots, this.playerPos, this.playerCol, this.playerLif, this.playerSiz, this.playerGeo);
      }
    }

    // NPC slots
    for (let i = 0; i < MAX_NPC; i++) {
      const s = this.npcSlots[i];
      if (s.life > 0) {
        s.life -= s.decay * dt;
        if (s.life < 0) s.life = 0;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        npcDirty = true;
      }
    }
    if (npcDirty) {
      uploadSlots(this.npcSlots, this.npcPos, this.npcCol, this.npcLif, this.npcSiz, this.npcGeo);
    }
  }

  dispose(): void {
    this.npcMesh.geometry.dispose();
    (this.npcMesh.material as THREE.ShaderMaterial).dispose();
    this.npcMesh.parent?.remove(this.npcMesh);

    if (this.playerMesh) {
      this.playerMesh.geometry.dispose();
      (this.playerMesh.material as THREE.ShaderMaterial).dispose();
      this.playerScene?.remove(this.playerMesh);
    }
  }
}
