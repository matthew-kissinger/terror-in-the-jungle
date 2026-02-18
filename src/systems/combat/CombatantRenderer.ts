import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from './types';
import { AssetLoader } from '../assets/AssetLoader';
import { CombatantMeshFactory, disposeCombatantMeshes, updateCombatantTexture, type ViewDirection, type WalkFrameMap } from './CombatantMeshFactory';
import { CombatantShaderSettingsManager, setDamageFlash, updateShaderUniforms, type NPCShaderSettings, type ShaderPreset, type ShaderUniformSettings } from './CombatantShaders';
import { Logger } from '../../utils/Logger';

export type { NPCShaderSettings, ShaderPreset } from './CombatantShaders';

/** Walk animation interval in seconds. */
const WALK_FRAME_INTERVAL = 0.4;

/** Dot product threshold for side view. Below this absolute value = side. */
const SIDE_DOT_THRESHOLD = 0.45;

/** Y bob amplitude in world units. */
const BOB_AMPLITUDE = 0.12;

/** Y bob speed multiplier. */
const BOB_SPEED = 3.0;

export class CombatantRenderer {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;
  private meshFactory: CombatantMeshFactory;
  private factionMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private factionAuraMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private factionGroundMarkers: Map<string, THREE.InstancedMesh> = new Map();
  private soldierTextures: Map<string, THREE.Texture> = new Map();
  private factionMaterials: Map<string, THREE.ShaderMaterial> = new Map();
  private walkFrameTextures: WalkFrameMap = new Map();
  private playerSquadId?: string;
  private playerSquadDetected = false;
  private shaderSettings = new CombatantShaderSettingsManager();
  private combatantStates: Map<string, { state: number; damaged: number }> = new Map();

  // Walk animation state
  private walkFrameTimer = 0;
  private currentWalkFrame: 'a' | 'b' = 'a';
  private elapsedTime = 0;

  // Scratch objects to avoid per-frame allocation
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchSpinMatrix = new THREE.Matrix4();
  private readonly scratchCameraDir = new THREE.Vector3();
  private readonly scratchCameraRight = new THREE.Vector3();
  private readonly scratchCameraForward = new THREE.Vector3();
  private readonly scratchCombatantForward = new THREE.Vector3();
  private readonly scratchToCombatant = new THREE.Vector3();
  private readonly scratchPosition = new THREE.Vector3();
  private readonly scratchUp = new THREE.Vector3(0, 1, 0);
  private readonly scratchTiltAxis = new THREE.Vector3();
  private readonly scratchPerpDir = new THREE.Vector3();
  private readonly scratchTiltMatrix = new THREE.Matrix4();
  private readonly scratchScaleMatrix = new THREE.Matrix4();
  private readonly scratchOutlineMatrix = new THREE.Matrix4();
  private readonly scratchMarkerMatrix = new THREE.Matrix4();
  private readonly renderWriteCounts = new Map<string, number>();
  private readonly renderCombatStates = new Map<string, number>();

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.meshFactory = new CombatantMeshFactory(scene, assetLoader);
  }

  private stableHash01(id: string): number {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 1000) / 1000;
  }

  async createFactionBillboards(): Promise<void> {
    const assets = this.meshFactory.createFactionBillboards();
    this.factionMeshes = assets.factionMeshes;
    this.factionAuraMeshes = assets.factionAuraMeshes;
    this.factionGroundMarkers = assets.factionGroundMarkers;
    this.soldierTextures = assets.soldierTextures;
    this.factionMaterials = assets.factionMaterials;
    this.walkFrameTextures = assets.walkFrameTextures;
  }

  setPlayerSquadId(squadId: string | undefined): void {
    this.playerSquadId = squadId;
    this.playerSquadDetected = false;
    Logger.info('combat-renderer', ` Renderer: Player squad ID set to: ${squadId}`);
  }

  /**
   * Compute viewing direction for a combatant based on camera angle.
   * Returns 'front' if camera is in front of the NPC, 'back' if behind, 'side' if perpendicular.
   */
  private getViewDirection(combatantForward: THREE.Vector3, cameraToCombatant: THREE.Vector3): ViewDirection {
    const facingDot = combatantForward.dot(cameraToCombatant);
    if (Math.abs(facingDot) < SIDE_DOT_THRESHOLD) return 'side';
    // facingDot > 0 means camera-to-npc aligns with npc facing = camera sees back
    return facingDot > 0 ? 'back' : 'front';
  }

  /**
   * Update walk frame animation timer. Call once per frame.
   */
  updateWalkFrame(deltaTime: number): void {
    this.elapsedTime += deltaTime;
    this.walkFrameTimer += deltaTime;
    if (this.walkFrameTimer >= WALK_FRAME_INTERVAL) {
      this.walkFrameTimer -= WALK_FRAME_INTERVAL;
      this.currentWalkFrame = this.currentWalkFrame === 'a' ? 'b' : 'a';

      // Swap textures on all walking meshes
      this.walkFrameTextures.forEach((frames, key) => {
        const tex = frames[this.currentWalkFrame];
        // Key is "{FACTION}_{direction}", mesh key is "{FACTION}_walking_{direction}"
        const meshKey = `${key.split('_')[0]}_walking_${key.split('_')[1]}`;
        const mesh = this.factionMeshes.get(meshKey);
        if (mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.map = tex;
          mesh.material.needsUpdate = true;
        }
        // Also update outline mesh texture
        const outlineMat = this.factionMaterials.get(meshKey);
        if (outlineMat && outlineMat.uniforms.map) {
          outlineMat.uniforms.map.value = tex;
        }
      });
    }
  }

  updateBillboards(combatants: Map<string, Combatant>, playerPosition: THREE.Vector3): void {
    this.factionMeshes.forEach(mesh => mesh.count = 0);
    this.factionAuraMeshes.forEach(mesh => mesh.count = 0);
    this.factionGroundMarkers.forEach(mesh => mesh.count = 0);
    const RENDER_DISTANCE_SQ = 400 * 400;
    this.renderWriteCounts.clear();
    this.renderCombatStates.clear();
    this.factionMeshes.forEach((_mesh, key) => {
      this.renderWriteCounts.set(key, 0);
      this.renderCombatStates.set(key, 0);
    });

    const matrix = this.scratchMatrix;
    this.camera.getWorldDirection(this.scratchCameraDir);
    const cameraAngle = Math.atan2(this.scratchCameraDir.x, this.scratchCameraDir.z);
    this.scratchCameraRight.crossVectors(this.scratchCameraDir, this.scratchUp).normalize();
    this.scratchCameraForward.set(this.scratchCameraDir.x, 0, this.scratchCameraDir.z).normalize();

    combatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD && !combatant.isDying) return;
      if (combatant.isPlayerProxy) return;
      if (combatant.position.distanceToSquared(playerPosition) > RENDER_DISTANCE_SQ) return;

      // Compute NPC forward direction
      this.scratchCombatantForward.set(
        Math.cos(combatant.visualRotation), 0, Math.sin(combatant.visualRotation)
      );

      // Camera-to-NPC vector (normalized)
      this.scratchToCombatant.subVectors(combatant.position, this.camera.position).normalize();

      // Determine viewing direction
      const viewDir = this.getViewDirection(this.scratchCombatantForward, this.scratchToCombatant);

      // Determine render state
      let stateKey: string;
      if (combatant.state === CombatantState.ENGAGING || combatant.state === CombatantState.SUPPRESSING) {
        stateKey = 'firing';
      } else {
        stateKey = 'walking';
      }

      // Build mesh key: {faction}_{ state}_{direction}
      const isPlayerSquad = combatant.squadId === this.playerSquadId && combatant.faction === Faction.US;
      if (isPlayerSquad && !this.playerSquadDetected) this.playerSquadDetected = true;
      const factionPrefix = isPlayerSquad ? 'SQUAD' : combatant.faction;
      const key = `${factionPrefix}_${stateKey}_${viewDir}`;

      const mesh = this.factionMeshes.get(key);
      if (!mesh) return;
      const capacity = (mesh.instanceMatrix as any).count ?? mesh.count;
      const index = this.renderWriteCounts.get(key) ?? 0;
      if (index >= capacity) return;

      // Billboard rotation: face camera
      matrix.makeRotationY(cameraAngle);

      // Determine scaleX (side sprite flipping)
      let scaleX = Math.abs(combatant.scale.x);
      if (viewDir === 'side') {
        // Side sprites show the soldier facing right.
        // Determine NPC travel direction relative to camera right axis.
        // If NPC faces right relative to camera, flip the sprite so it faces forward.
        const combatantDotRight = this.scratchCombatantForward.dot(this.scratchCameraRight);
        if (combatantDotRight > 0) {
          scaleX = -scaleX; // Flip horizontally
        }
      }

      // Position with Y bob for walking NPCs
      this.scratchPosition.copy(combatant.position);
      let finalPosition = this.scratchPosition;
      let finalScaleX = scaleX;
      let finalScaleY = combatant.scale.y;
      let finalScaleZ = combatant.scale.z;

      // Walking Y bob (not for firing or dying)
      if (stateKey === 'walking' && !combatant.isDying) {
        const bobPhase = this.stableHash01(combatant.id) * Math.PI * 2;
        const bobY = Math.sin(this.elapsedTime * BOB_SPEED + bobPhase) * BOB_AMPLITUDE;
        finalPosition.y += bobY;
      }

      // Death animation
      if (combatant.isDying && combatant.deathProgress !== undefined) {
          const FALL_PHASE = 0.7 / 5.7;
          const GROUND_PHASE = 4.0 / 5.7;
          const FADEOUT_PHASE = 1.0 / 5.7;

          const progress = combatant.deathProgress;
          const animType = combatant.deathAnimationType || 'fallback';

          if (animType === 'shatter') {
            const seed = this.stableHash01(combatant.id);
            const spinBias = 0.8 + seed * 1.2;
            const spreadBias = 1.0 + seed * 0.9;
            const deathDir = combatant.deathDirection ?? this.scratchTiltAxis.set(0, 0, -1);
            this.scratchPerpDir.set(-deathDir.z, 0, deathDir.x).normalize();

            if (progress < FALL_PHASE) {
              const t = progress / FALL_PHASE;
              const pop = Math.sin(t * Math.PI);
              finalPosition.x += deathDir.x * pop * (0.9 * spreadBias);
              finalPosition.z += deathDir.z * pop * (0.9 * spreadBias);
              finalPosition.x += this.scratchPerpDir.x * pop * ((seed - 0.5) * 1.4);
              finalPosition.z += this.scratchPerpDir.z * pop * ((seed - 0.5) * 1.4);
              finalPosition.y += 0.25 + pop * 0.45;
              const spinY = (0.8 + t * 2.4) * Math.PI * spinBias;
              const spinZ = (0.2 + t * 1.4) * Math.PI * (0.6 + seed);
              this.scratchSpinMatrix.makeRotationY(spinY);
              matrix.multiply(this.scratchSpinMatrix);
              this.scratchSpinMatrix.makeRotationZ(spinZ);
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleX *= 1.05 + pop * (0.45 + seed * 0.2);
              finalScaleY *= Math.max(0.3, 1.0 - pop * 0.65);
              finalScaleZ *= 1.02 + pop * 0.25;
            } else if (progress < FALL_PHASE + GROUND_PHASE) {
              const t = (progress - FALL_PHASE) / GROUND_PHASE;
              finalPosition.x += deathDir.x * (1.9 * spreadBias);
              finalPosition.z += deathDir.z * (1.9 * spreadBias);
              finalPosition.x += this.scratchPerpDir.x * (seed - 0.5) * 1.8;
              finalPosition.z += this.scratchPerpDir.z * (seed - 0.5) * 1.8;
              finalPosition.y -= 0.8 + t * 1.0;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * (0.55 + seed * 0.35));
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleX *= 1.25 + seed * 0.2;
              finalScaleY *= 0.18;
              finalScaleZ *= 1.18 + (1 - seed) * 0.15;
            } else {
              const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;
              finalPosition.x += deathDir.x * (1.9 * spreadBias);
              finalPosition.z += deathDir.z * (1.9 * spreadBias);
              finalPosition.x += this.scratchPerpDir.x * (seed - 0.5) * 1.8;
              finalPosition.z += this.scratchPerpDir.z * (seed - 0.5) * 1.8;
              finalPosition.y -= 1.8;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * (0.55 + seed * 0.35));
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleX *= 1.25 + seed * 0.2;
              finalScaleY *= 0.18;
              finalScaleZ *= 1.18 + (1 - seed) * 0.15;
              const flicker = 0.7 + 0.3 * Math.sin((fadeProgress + seed) * Math.PI * 10);
              const fadeScale = Math.max(0, (1 - fadeProgress) * flicker);
              finalScaleX *= fadeScale;
              finalScaleY *= fadeScale;
              finalScaleZ *= fadeScale;
            }
          } else if (animType === 'spinfall') {
            if (progress < FALL_PHASE) {
              const fallProgress = progress / FALL_PHASE;
              const easeOut = 1 - Math.pow(1 - fallProgress, 2);
              if (combatant.deathDirection) {
                const fallDistance = 2.5;
                finalPosition.x += combatant.deathDirection.x * easeOut * fallDistance;
                finalPosition.z += combatant.deathDirection.z * easeOut * fallDistance;
              }
              const dropHeight = 4.0;
              finalPosition.y += dropHeight * (1 - easeOut) - dropHeight;
              const spinAngle = easeOut * Math.PI * 2;
              this.scratchSpinMatrix.makeRotationZ(spinAngle);
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleY *= 1 - (easeOut * 0.3);
            } else if (progress < FALL_PHASE + GROUND_PHASE) {
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 2.5;
                finalPosition.z += combatant.deathDirection.z * 2.5;
              }
              finalPosition.y -= 4.0;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * 2);
              matrix.multiply(this.scratchSpinMatrix);
              const groundProgress = (progress - FALL_PHASE) / GROUND_PHASE;
              const settle = Math.max(0, (1 - groundProgress * 4) * 0.1);
              finalPosition.y += settle;
              finalScaleY *= 0.7;
            } else {
              const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 2.5;
                finalPosition.z += combatant.deathDirection.z * 2.5;
              }
              finalPosition.y -= 4.0;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * 2);
              matrix.multiply(this.scratchSpinMatrix);
              finalScaleY *= 0.7;
              const fadeScale = 1 - fadeProgress;
              finalScaleX *= fadeScale;
              finalScaleY *= fadeScale;
              finalScaleZ *= fadeScale;
            }
          } else if (animType === 'crumple') {
            if (progress < FALL_PHASE) {
              const fallProgress = progress / FALL_PHASE;
              const easeOut = 1 - Math.pow(1 - fallProgress, 2);
              if (combatant.deathDirection) {
                const fallDistance = 0.5;
                finalPosition.x += combatant.deathDirection.x * easeOut * fallDistance;
                finalPosition.z += combatant.deathDirection.z * easeOut * fallDistance;
              }
              finalScaleY *= 1 - (easeOut * 0.8);
              finalPosition.y -= easeOut * 2.5;
            } else if (progress < FALL_PHASE + GROUND_PHASE) {
              const groundProgress = (progress - FALL_PHASE) / GROUND_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 0.5;
                finalPosition.z += combatant.deathDirection.z * 0.5;
              }
              finalPosition.y -= 2.5;
              finalScaleY *= 0.2;
              const settle = Math.max(0, (1 - groundProgress * 4) * 0.05);
              finalPosition.y += settle;
            } else {
              const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 0.5;
                finalPosition.z += combatant.deathDirection.z * 0.5;
              }
              finalPosition.y -= 2.5;
              finalScaleY *= 0.2;
              const fadeScale = 1 - fadeProgress;
              finalScaleX *= fadeScale;
              finalScaleY *= fadeScale;
              finalScaleZ *= fadeScale;
            }
          } else {
            if (progress < FALL_PHASE) {
              const fallProgress = progress / FALL_PHASE;
              const easeOut = 1 - Math.pow(1 - fallProgress, 2);
              if (combatant.deathDirection) {
                const fallDistance = 1.5;
                finalPosition.x += combatant.deathDirection.x * easeOut * fallDistance;
                finalPosition.z += combatant.deathDirection.z * easeOut * fallDistance;
              }
              const dropHeight = 3.5;
              finalPosition.y += dropHeight * (1 - easeOut) - dropHeight;
              const rotationAngle = easeOut * Math.PI * 0.45;
              if (combatant.deathDirection) {
                this.scratchTiltAxis.set(-combatant.deathDirection.z, 0, combatant.deathDirection.x);
              } else {
                this.scratchTiltAxis.set(1, 0, 0);
              }
              this.scratchTiltMatrix.makeRotationAxis(this.scratchTiltAxis.normalize(), rotationAngle);
              matrix.multiply(this.scratchTiltMatrix);
              finalScaleY *= 1 - (easeOut * 0.2);
            } else if (progress < FALL_PHASE + GROUND_PHASE) {
              const groundProgress = (progress - FALL_PHASE) / GROUND_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 1.5;
                finalPosition.z += combatant.deathDirection.z * 1.5;
              }
              finalPosition.y -= 3.5;
              if (combatant.deathDirection) {
                this.scratchTiltAxis.set(-combatant.deathDirection.z, 0, combatant.deathDirection.x);
              } else {
                this.scratchTiltAxis.set(1, 0, 0);
              }
              this.scratchTiltMatrix.makeRotationAxis(this.scratchTiltAxis.normalize(), Math.PI * 0.45);
              matrix.multiply(this.scratchTiltMatrix);
              const settle = Math.max(0, (1 - groundProgress * 4) * 0.1);
              finalPosition.y += settle;
              finalScaleY *= 0.8;
            } else {
              const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 1.5;
                finalPosition.z += combatant.deathDirection.z * 1.5;
              }
              finalPosition.y -= 3.5;
              if (combatant.deathDirection) {
                this.scratchTiltAxis.set(-combatant.deathDirection.z, 0, combatant.deathDirection.x);
              } else {
                this.scratchTiltAxis.set(1, 0, 0);
              }
              this.scratchTiltMatrix.makeRotationAxis(this.scratchTiltAxis.normalize(), Math.PI * 0.45);
              matrix.multiply(this.scratchTiltMatrix);
              finalScaleY *= 0.8;
              const fadeScale = 1 - fadeProgress;
              finalScaleX *= fadeScale;
              finalScaleY *= fadeScale;
              finalScaleZ *= fadeScale;
            }
          }
      }

      matrix.setPosition(finalPosition);
      this.scratchScaleMatrix.makeScale(finalScaleX, finalScaleY, finalScaleZ);
      matrix.multiply(this.scratchScaleMatrix);
      mesh.setMatrixAt(index, matrix);
      combatant.billboardIndex = index;

      const outlineMesh = this.factionAuraMeshes.get(key);
      if (outlineMesh) {
        this.scratchOutlineMatrix.copy(matrix);
        this.scratchScaleMatrix.makeScale(1.2, 1.2, 1.2);
        this.scratchOutlineMatrix.multiply(this.scratchScaleMatrix);
        outlineMesh.setMatrixAt(index, this.scratchOutlineMatrix);
      }
      const markerMesh = this.factionGroundMarkers.get(key);
      if (markerMesh) {
        this.scratchMarkerMatrix.makeRotationX(-Math.PI / 2);
        this.scratchMarkerMatrix.setPosition(combatant.position.x, 0.1, combatant.position.z);
        markerMesh.setMatrixAt(index, this.scratchMarkerMatrix);
      }

      this.renderWriteCounts.set(key, index + 1);
      const currentCombatState = this.renderCombatStates.get(key) ?? 0;
      let combatStateWeight = currentCombatState;
      if (combatant.state === CombatantState.ENGAGING || combatant.state === CombatantState.SUPPRESSING) {
        combatStateWeight = Math.max(combatStateWeight, 1.0);
      } else if (combatant.state === CombatantState.ALERT) {
        combatStateWeight = Math.max(combatStateWeight, 0.5);
      }
      this.renderCombatStates.set(key, combatStateWeight);
    });

    this.factionMeshes.forEach((mesh, key) => {
      const written = this.renderWriteCounts.get(key) ?? 0;
      const previousCount = mesh.count;
      mesh.count = written;
      if (written > 0 || previousCount !== written) {
        mesh.instanceMatrix.needsUpdate = true;
      }
      const outlineMesh = this.factionAuraMeshes.get(key);
      if (outlineMesh) {
        const previousOutlineCount = outlineMesh.count;
        outlineMesh.count = written;
        if (written > 0 || previousOutlineCount !== written) {
          outlineMesh.instanceMatrix.needsUpdate = true;
        }
      }
      const markerMesh = this.factionGroundMarkers.get(key);
      if (markerMesh) {
        const previousMarkerCount = markerMesh.count;
        markerMesh.count = written;
        if (written > 0 || previousMarkerCount !== written) {
          markerMesh.instanceMatrix.needsUpdate = true;
        }
      }
      const outlineMaterial = this.factionMaterials.get(key);
      if (outlineMaterial && outlineMaterial instanceof THREE.ShaderMaterial) {
        outlineMaterial.uniforms.combatState.value = this.renderCombatStates.get(key) ?? 0;
      }
    });
  }

  // Update shader time and global uniforms
  updateShaderUniforms(_deltaTime: number): void {
    updateShaderUniforms(this.factionMaterials, this.camera);
  }

  // Handle damage flash for specific combatant
  setDamageFlash(combatantId: string, intensity: number): void {
    setDamageFlash(this.combatantStates, combatantId, intensity);
  }

  // Apply a preset configuration
  applyPreset(preset: ShaderPreset): void {
    this.shaderSettings.applyPreset(preset);
    Logger.info('combat-renderer', ` Applied NPC shader preset: ${preset}`);
  }

  // Get current shader settings
  getShaderSettings(): NPCShaderSettings {
    return this.shaderSettings.getSettings();
  }

  // Toggle specific effects
  toggleCelShading(): void {
    this.shaderSettings.toggleCelShading();
  }

  toggleRimLighting(): void {
    this.shaderSettings.toggleRimLighting();
  }

  toggleAura(): void {
    this.shaderSettings.toggleAura();
  }

  setShaderSettings(settings: Partial<ShaderUniformSettings>): void {
    this.shaderSettings.setSettings(settings);
  }

  updateCombatantTexture(combatant: Combatant): void {
    updateCombatantTexture(this.soldierTextures, combatant);
  }


  dispose(): void {
    disposeCombatantMeshes(this.scene, {
      factionMeshes: this.factionMeshes,
      factionAuraMeshes: this.factionAuraMeshes,
      factionGroundMarkers: this.factionGroundMarkers,
      soldierTextures: this.soldierTextures,
      factionMaterials: this.factionMaterials,
      walkFrameTextures: this.walkFrameTextures
    });
    this.combatantStates.clear();
  }
}
