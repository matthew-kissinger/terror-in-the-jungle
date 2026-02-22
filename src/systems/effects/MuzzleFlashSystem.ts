import * as THREE from 'three';

/** Weapon variant index for flash appearance */
export const enum MuzzleFlashVariant {
  RIFLE = 0,
  SHOTGUN = 1,
  SMG = 2,
  PISTOL = 3,
}

const FLASH_LIFETIME = 0.033; // 33ms ~2 frames at 60fps
const MAX_NPC_INSTANCES = 64;

// ---- Shaders ----

const vertexShader = /* glsl */ `
  attribute float instanceLife;
  attribute float instanceVariant;
  attribute float instanceIntensity;

  varying float vLife;
  varying float vVariant;
  varying float vIntensity;
  varying vec2 vUv;

  void main() {
    vLife = instanceLife;
    vVariant = instanceVariant;
    vIntensity = instanceIntensity;
    vUv = uv;

    // Spherical billboard: extract camera-right and camera-up from view matrix
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    // Scale by life (shrinks as it fades) and instance scale from matrix
    float scale = length(instanceMatrix[0].xyz) * mix(0.6, 1.0, instanceLife);

    // Offset quad corners in view space
    mvPosition.xy += position.xy * scale;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vLife;
  varying float vVariant;
  varying float vIntensity;
  varying vec2 vUv;

  void main() {
    if (vLife <= 0.0) discard;

    // Center UV to [-1, 1]
    vec2 uv = vUv * 2.0 - 1.0;
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Variant-dependent spoke count and width
    // 0=rifle(8), 1=shotgun(12), 2=smg(6), 3=pistol(6)
    float spokeCount = 8.0;
    float spokeWidth = 0.45;
    if (vVariant > 0.5 && vVariant < 1.5) {
      spokeCount = 12.0;
      spokeWidth = 0.55;
    } else if (vVariant > 1.5) {
      spokeCount = 6.0;
      spokeWidth = 0.4;
    }

    // Star pattern via angular modulation
    float spoke = abs(cos(angle * spokeCount * 0.5));
    spoke = pow(spoke, 3.0);

    // Radial falloff - hot center to edge fade
    float radialFade = 1.0 - smoothstep(0.0, 0.5 + spoke * spokeWidth, r);

    // Core glow (always bright white in center)
    float core = 1.0 - smoothstep(0.0, 0.15, r);

    // Color temperature per variant
    // Rifle: orange-white, Shotgun: yellow-white, SMG: orange, Pistol: yellow
    vec3 hotColor = vec3(1.0, 0.95, 0.85); // near-white center
    vec3 edgeColor = vec3(1.0, 0.6, 0.15);  // orange edge default (rifle)

    if (vVariant > 0.5 && vVariant < 1.5) {
      // Shotgun: yellow-white
      edgeColor = vec3(1.0, 0.75, 0.2);
    } else if (vVariant > 1.5 && vVariant < 2.5) {
      // SMG: warmer orange
      edgeColor = vec3(1.0, 0.5, 0.1);
    } else if (vVariant > 2.5) {
      // Pistol: yellow
      edgeColor = vec3(1.0, 0.7, 0.15);
    }

    vec3 color = mix(edgeColor, hotColor, core + radialFade * 0.3);

    // Combine: radial shape * life fade * intensity
    float alpha = radialFade * vLife * vIntensity;

    // Discard fully transparent fragments
    if (alpha < 0.01) discard;

    // Overbright output - additive blending allows HDR values for strong glow
    gl_FragColor = vec4(color * alpha * 3.0, alpha);
  }
`;

// Single-mesh vertex shader (no instancing)
const playerVertexShader = /* glsl */ `
  uniform float uLife;
  uniform float uScale;

  varying float vLife;
  varying float vVariant;
  varying float vIntensity;
  varying vec2 vUv;

  // passed via uniforms instead of instance attributes
  uniform float uVariant;
  uniform float uIntensity;

  void main() {
    vLife = uLife;
    vVariant = uVariant;
    vIntensity = uIntensity;
    vUv = uv;

    // Billboard in view space
    vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float scale = uScale * mix(0.6, 1.0, uLife);
    mvPosition.xy += position.xy * scale;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Procedural shader-based muzzle flash system.
 *
 * NPC path: Single InstancedMesh (64 instances) in the main scene.
 * Player path: Single Mesh added to the weapon overlay scene.
 *
 * Replaces MuzzleFlashPool - zero textures, zero PointLights, 1 draw call.
 */
export class MuzzleFlashSystem {
  // ---- NPC path (InstancedMesh) ----
  private npcMesh: THREE.InstancedMesh;
  private lifeAttr: Float32Array;
  private variantAttr: Float32Array;
  private intensityAttr: Float32Array;
  private ringIndex = 0;
  private maxInstances: number;

  // Dirty flag: batches GPU buffer uploads to update() instead of per-spawn
  private npcDirty = false;

  // Scratch objects
  private readonly _mat4 = new THREE.Matrix4();
  private readonly _pos = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _scale = new THREE.Vector3();
  private readonly _zeroScale = new THREE.Vector3(0, 0, 0);

  // ---- Player path (single Mesh) ----
  private playerMesh: THREE.Mesh;
  private playerMaterial: THREE.ShaderMaterial;
  private playerLife = 0;
  private playerAddedToScene: THREE.Scene | null = null;

  constructor(scene: THREE.Scene, maxInstances = MAX_NPC_INSTANCES) {
    this.maxInstances = maxInstances;

    // -- NPC InstancedMesh --
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      side: THREE.DoubleSide,
    });

    this.npcMesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.npcMesh.frustumCulled = false; // instances manage their own visibility via zero-scale

    // Per-instance attributes
    this.lifeAttr = new Float32Array(maxInstances);
    this.variantAttr = new Float32Array(maxInstances);
    this.intensityAttr = new Float32Array(maxInstances);

    const instLife = new THREE.InstancedBufferAttribute(this.lifeAttr, 1);
    const instVariant = new THREE.InstancedBufferAttribute(this.variantAttr, 1);
    const instIntensity = new THREE.InstancedBufferAttribute(this.intensityAttr, 1);

    geometry.setAttribute('instanceLife', instLife);
    geometry.setAttribute('instanceVariant', instVariant);
    geometry.setAttribute('instanceIntensity', instIntensity);

    // Initialize all instances to zero-scale (hidden)
    for (let i = 0; i < maxInstances; i++) {
      this._mat4.compose(this._pos, this._quat, this._zeroScale);
      this.npcMesh.setMatrixAt(i, this._mat4);
    }
    this.npcMesh.instanceMatrix.needsUpdate = true;

    scene.add(this.npcMesh);

    // -- Player Mesh --
    const playerGeometry = new THREE.PlaneGeometry(1, 1);
    this.playerMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uLife: { value: 0.0 },
        uScale: { value: 1.0 },
        uVariant: { value: 0.0 },
        uIntensity: { value: 1.0 },
      },
      vertexShader: playerVertexShader,
      fragmentShader,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.playerMesh = new THREE.Mesh(playerGeometry, this.playerMaterial);
    this.playerMesh.visible = false;
    this.playerMesh.frustumCulled = false;
  }

  /**
   * Spawn a muzzle flash for an NPC in the main scene.
   */
  spawnNPC(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    scale = 1.5,
    variant: MuzzleFlashVariant = MuzzleFlashVariant.RIFLE
  ): void {
    const i = this.ringIndex;
    this.ringIndex = (this.ringIndex + 1) % this.maxInstances;

    // Position slightly forward in fire direction
    this._pos.copy(position).addScaledVector(direction, 0.1);
    this._scale.set(scale, scale, scale);
    this._mat4.compose(this._pos, this._quat, this._scale);

    this.npcMesh.setMatrixAt(i, this._mat4);
    this.lifeAttr[i] = 1.0;
    this.variantAttr[i] = variant as number;
    this.intensityAttr[i] = 1.0 + Math.random() * 0.3;

    // Defer GPU buffer uploads to update() - avoids redundant uploads when
    // multiple NPCs fire in the same frame.
    this.npcDirty = true;
  }

  /**
   * Spawn a muzzle flash for the player weapon in the overlay scene.
   */
  spawnPlayer(
    overlayScene: THREE.Scene,
    muzzleWorldPos: THREE.Vector3,
    direction: THREE.Vector3,
    variant: MuzzleFlashVariant = MuzzleFlashVariant.RIFLE
  ): void {
    // Add to overlay scene if not already there (or if scene changed)
    if (this.playerAddedToScene !== overlayScene) {
      if (this.playerAddedToScene) {
        this.playerAddedToScene.remove(this.playerMesh);
      }
      overlayScene.add(this.playerMesh);
      this.playerAddedToScene = overlayScene;
    }

    this.playerMesh.position.copy(muzzleWorldPos);
    this.playerMesh.visible = true;
    this.playerLife = 1.0;

    // Variant-dependent scale
    let scale = 0.5;
    if (variant === MuzzleFlashVariant.SHOTGUN) scale = 0.7;
    else if (variant === MuzzleFlashVariant.PISTOL) scale = 0.35;
    else if (variant === MuzzleFlashVariant.SMG) scale = 0.4;

    this.playerMaterial.uniforms.uLife.value = 1.0;
    this.playerMaterial.uniforms.uScale.value = scale;
    this.playerMaterial.uniforms.uVariant.value = variant as number;
    this.playerMaterial.uniforms.uIntensity.value = 1.0 + Math.random() * 0.3;
  }

  /**
   * Per-frame update. Decays all active flashes.
   */
  update(deltaTime?: number): void {
    const dt = deltaTime ?? 0.016;
    const decay = dt / FLASH_LIFETIME;

    // -- NPC instances --
    let anyAlive = false;
    for (let i = 0; i < this.maxInstances; i++) {
      if (this.lifeAttr[i] > 0) {
        this.lifeAttr[i] -= decay;
        if (this.lifeAttr[i] <= 0) {
          this.lifeAttr[i] = 0;
          // Zero-scale to hide
          this._mat4.compose(this._pos.set(0, 0, 0), this._quat, this._zeroScale);
          this.npcMesh.setMatrixAt(i, this._mat4);
        }
        anyAlive = true;
      }
    }

    if (anyAlive || this.npcDirty) {
      this.npcMesh.instanceMatrix.needsUpdate = true;
      (this.npcMesh.geometry.attributes.instanceLife as THREE.BufferAttribute).needsUpdate = true;
      // Variant and intensity only change on spawn, not during decay
      if (this.npcDirty) {
        (this.npcMesh.geometry.attributes.instanceVariant as THREE.BufferAttribute).needsUpdate = true;
        (this.npcMesh.geometry.attributes.instanceIntensity as THREE.BufferAttribute).needsUpdate = true;
        this.npcDirty = false;
      }
    }

    // -- Player mesh --
    if (this.playerLife > 0) {
      this.playerLife -= decay;
      if (this.playerLife <= 0) {
        this.playerLife = 0;
        this.playerMesh.visible = false;
        this.playerMaterial.uniforms.uLife.value = 0;
      } else {
        this.playerMaterial.uniforms.uLife.value = this.playerLife;
      }
    }
  }

  dispose(): void {
    this.npcMesh.geometry.dispose();
    (this.npcMesh.material as THREE.ShaderMaterial).dispose();
    this.npcMesh.parent?.remove(this.npcMesh);

    this.playerMesh.geometry.dispose();
    this.playerMaterial.dispose();
    if (this.playerAddedToScene) {
      this.playerAddedToScene.remove(this.playerMesh);
    }
  }
}
