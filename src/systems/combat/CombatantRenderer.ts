import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from './types';
import { AssetLoader } from '../assets/AssetLoader';
import { CombatantMeshFactory, disposeCombatantMeshes, updateCombatantTexture } from './CombatantMeshFactory';
import { CombatantShaderSettingsManager, setDamageFlash, updateShaderUniforms, type NPCShaderSettings, type ShaderPreset, type ShaderUniformSettings } from './CombatantShaders';

const _enemyForward = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();

export type { NPCShaderSettings, ShaderPreset } from './CombatantShaders';

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
  private playerSquadId?: string;
  private playerSquadDetected = false;
  private shaderSettings = new CombatantShaderSettingsManager();
  private combatantStates: Map<string, { state: number; damaged: number }> = new Map();
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
  private readonly scratchTiltMatrix = new THREE.Matrix4();
  private readonly scratchScaleMatrix = new THREE.Matrix4();
  private readonly scratchOutlineMatrix = new THREE.Matrix4();
  private readonly scratchMarkerMatrix = new THREE.Matrix4();
  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.meshFactory = new CombatantMeshFactory(scene, assetLoader);
  }

  async createFactionBillboards(): Promise<void> {
    const assets = this.meshFactory.createFactionBillboards();
    this.factionMeshes = assets.factionMeshes;
    this.factionAuraMeshes = assets.factionAuraMeshes;
    this.factionGroundMarkers = assets.factionGroundMarkers;
    this.soldierTextures = assets.soldierTextures;
    this.factionMaterials = assets.factionMaterials;
  }
  setPlayerSquadId(squadId: string | undefined): void {
    this.playerSquadId = squadId;
    this.playerSquadDetected = false;
    console.log(`🎨 Renderer: Player squad ID set to: ${squadId}`);
  }

  updateBillboards(combatants: Map<string, Combatant>, playerPosition: THREE.Vector3): void {
    this.factionMeshes.forEach(mesh => mesh.count = 0);
    this.factionAuraMeshes.forEach(mesh => mesh.count = 0);
    this.factionGroundMarkers.forEach(mesh => mesh.count = 0);
    const combatantGroups = new Map<string, Combatant[]>();
    const RENDER_DISTANCE = 400;
    if (!this.playerSquadDetected && this.playerSquadId) {
      let debugCount = 0;
      combatants.forEach(c => {
        if (c.faction === Faction.US && debugCount < 3 && c.position.distanceTo(playerPosition) < 50) {
          console.log(`🔍 Debug US combatant: id=${c.id}, squadId=${c.squadId}, playerSquadId=${this.playerSquadId}, match=${c.squadId === this.playerSquadId}`);
          debugCount++;
        }
      });
    }
    combatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD && !combatant.isDying) return;
      if (combatant.isPlayerProxy) return;
      if (combatant.position.distanceTo(playerPosition) > RENDER_DISTANCE) return;

      let isShowingBack = false;
      if (combatant.faction === Faction.OPFOR) {
        _enemyForward.set(Math.cos(combatant.visualRotation), 0, Math.sin(combatant.visualRotation));
        _toPlayer.subVectors(playerPosition, combatant.position).normalize();
        const behindDot = _enemyForward.dot(_toPlayer);
        isShowingBack = behindDot < -0.2 && (!combatant.target || combatant.target.id !== 'PLAYER');
      }
      let stateKey = 'walking';
      if (isShowingBack) {
        stateKey = 'back';
      } else if (combatant.state === CombatantState.ENGAGING || combatant.state === CombatantState.SUPPRESSING) {
        stateKey = 'firing';
      } else if (combatant.state === CombatantState.ALERT) {
        stateKey = 'alert';
      }

      const isPlayerSquad = combatant.squadId === this.playerSquadId && combatant.faction === Faction.US;
      const factionPrefix = isPlayerSquad ? 'SQUAD' : combatant.faction;
      const key = `${factionPrefix}_${stateKey}`;
      if (!combatantGroups.has(key)) {
        combatantGroups.set(key, []);
      }
      combatantGroups.get(key)!.push(combatant);

      if (isPlayerSquad && !this.playerSquadDetected) {
        console.log(`✅ Player squad member detected: ${combatant.id}, squadId: ${combatant.squadId}, rendering as: ${key}`);
        this.playerSquadDetected = true;
      }
    });
    const matrix = this.scratchMatrix;
    this.camera.getWorldDirection(this.scratchCameraDir);
    const cameraAngle = Math.atan2(this.scratchCameraDir.x, this.scratchCameraDir.z);
    this.scratchCameraRight.crossVectors(this.scratchCameraDir, this.scratchUp).normalize();
    this.scratchCameraForward.set(this.scratchCameraDir.x, 0, this.scratchCameraDir.z).normalize();
    combatantGroups.forEach((combatants, key) => {
      const mesh = this.factionMeshes.get(key);
      if (!mesh) return;
      const capacity = (mesh.instanceMatrix as any).count ?? mesh.count;
      let written = 0;
      for (let index = 0; index < combatants.length && index < capacity; index++) {
        const combatant = combatants[index];
        const isBackTexture = key.includes('_back');

        this.scratchCombatantForward.set(Math.cos(combatant.visualRotation), 0, Math.sin(combatant.visualRotation));
        this.scratchToCombatant.subVectors(combatant.position, playerPosition).normalize();
        const viewAngle = this.scratchToCombatant.dot(this.scratchCameraRight);

        let finalRotation: number;
        let scaleX = combatant.scale.x;
        if (isBackTexture) {
          finalRotation = cameraAngle * 0.8 + combatant.visualRotation * 0.2;
          scaleX = Math.abs(scaleX);
        } else if (combatant.faction === Faction.OPFOR) {
          finalRotation = cameraAngle;
          scaleX = Math.abs(scaleX);
        } else {
          const facingDot = Math.abs(this.scratchCombatantForward.dot(this.scratchCameraForward));
          const billboardBlend = 0.3 + facingDot * 0.4;
          finalRotation = cameraAngle * billboardBlend + combatant.visualRotation * (1 - billboardBlend);

          const combatantDotRight = this.scratchCombatantForward.dot(this.scratchCameraRight);
          const shouldFlip = (viewAngle > 0 && combatantDotRight < 0) || (viewAngle < 0 && combatantDotRight > 0);
          scaleX = shouldFlip ? -Math.abs(scaleX) : Math.abs(scaleX);
        }
        matrix.makeRotationY(finalRotation);
        this.scratchPosition.copy(combatant.position);
        let finalPosition = this.scratchPosition;
        let finalScaleX = scaleX;
        let finalScaleY = combatant.scale.y;
        let finalScaleZ = combatant.scale.z;
        if (combatant.isDying && combatant.deathProgress !== undefined) {
          const FALL_PHASE = 0.7 / 5.7;
          const GROUND_PHASE = 4.0 / 5.7;
          const FADEOUT_PHASE = 1.0 / 5.7;

          const progress = combatant.deathProgress;
          const animType = combatant.deathAnimationType || 'fallback';

          if (animType === 'spinfall') {
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
              const groundProgress = (progress - FALL_PHASE) / GROUND_PHASE;
              if (combatant.deathDirection) {
                finalPosition.x += combatant.deathDirection.x * 2.5;
                finalPosition.z += combatant.deathDirection.z * 2.5;
              }
              finalPosition.y -= 4.0;
              this.scratchSpinMatrix.makeRotationZ(Math.PI * 2);
              matrix.multiply(this.scratchSpinMatrix);
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
        written++;
      }
      mesh.count = written;
      mesh.instanceMatrix.needsUpdate = true;
      const outlineMesh = this.factionAuraMeshes.get(key);
      if (outlineMesh) {
        outlineMesh.count = written;
        outlineMesh.instanceMatrix.needsUpdate = true;
      }
      const markerMesh = this.factionGroundMarkers.get(key);
      if (markerMesh) {
        markerMesh.count = written;
        markerMesh.instanceMatrix.needsUpdate = true;
      }
      const outlineMaterial = this.factionMaterials.get(key);
      if (outlineMaterial && outlineMaterial instanceof THREE.ShaderMaterial) {
        let avgCombatState = 0;
        for (const combatant of combatants) {
          if (combatant.state === CombatantState.ENGAGING || combatant.state === CombatantState.SUPPRESSING) {
            avgCombatState = Math.max(avgCombatState, 1.0);
          } else if (combatant.state === CombatantState.ALERT) {
            avgCombatState = Math.max(avgCombatState, 0.5);
          }
        }
        outlineMaterial.uniforms.combatState.value = avgCombatState;
      }
    });
  }

  // Update shader time and global uniforms
  updateShaderUniforms(deltaTime: number): void {
    updateShaderUniforms(this.factionMaterials, this.camera);
  }

  // Handle damage flash for specific combatant
  setDamageFlash(combatantId: string, intensity: number): void {
    setDamageFlash(this.combatantStates, combatantId, intensity);
  }

  // Apply a preset configuration
  applyPreset(preset: ShaderPreset): void {
    this.shaderSettings.applyPreset(preset);
    console.log(`🎨 Applied NPC shader preset: ${preset}`);
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
      factionMaterials: this.factionMaterials
    });
    this.combatantStates.clear();
  }
}
