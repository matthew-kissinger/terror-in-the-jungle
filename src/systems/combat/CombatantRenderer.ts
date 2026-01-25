import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from './types';
import { AssetLoader } from '../assets/AssetLoader';

export interface NPCShaderSettings {
  celShadingEnabled: boolean;
  rimLightingEnabled: boolean;
  auraEnabled: boolean;
  auraIntensity: number;
}

export type ShaderPreset = 'default' | 'cel-shaded' | 'minimal' | 'intense' | 'tactical';

export class CombatantRenderer {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;

  private factionMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private factionAuraMeshes: Map<string, THREE.InstancedMesh> = new Map();
  private factionGroundMarkers: Map<string, THREE.InstancedMesh> = new Map();
  private soldierTextures: Map<string, THREE.Texture> = new Map();
  private factionMaterials: Map<string, THREE.ShaderMaterial> = new Map();
  private playerSquadId?: string;
  private playerSquadDetected = false;
  private shaderSettings = {
    celShadingEnabled: 1.0,
    rimLightingEnabled: 1.0,
    auraEnabled: 1.0,
    auraIntensity: 0.5
  };

  // Preset configurations
  private readonly presets: Record<ShaderPreset, NPCShaderSettings> = {
    default: {
      celShadingEnabled: true,
      rimLightingEnabled: true,
      auraEnabled: true,
      auraIntensity: 0.5
    },
    'cel-shaded': {
      celShadingEnabled: true,
      rimLightingEnabled: false,
      auraEnabled: false,
      auraIntensity: 0.0
    },
    minimal: {
      celShadingEnabled: false,
      rimLightingEnabled: false,
      auraEnabled: false,
      auraIntensity: 0.0
    },
    intense: {
      celShadingEnabled: true,
      rimLightingEnabled: true,
      auraEnabled: true,
      auraIntensity: 1.0
    },
    tactical: {
      celShadingEnabled: false,
      rimLightingEnabled: true,
      auraEnabled: true,
      auraIntensity: 0.3
    }
  };
  private combatantStates: Map<string, { state: number; damaged: number }> = new Map();

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
  }

  async createFactionBillboards(): Promise<void> {
    // Load US soldier textures
    const usWalking = this.assetLoader.getTexture('ASoldierWalking');
    const usAlert = this.assetLoader.getTexture('ASoldierAlert');
    const usFiring = this.assetLoader.getTexture('ASoldierFiring');

    // Load OPFOR soldier textures
    const opforWalking = this.assetLoader.getTexture('EnemySoldierWalking');
    const opforAlert = this.assetLoader.getTexture('EnemySoldierAlert');
    const opforFiring = this.assetLoader.getTexture('EnemySoldierFiring');
    const opforBack = this.assetLoader.getTexture('EnemySoldierBack');

    // Store textures
    if (usWalking) this.soldierTextures.set('US_walking', usWalking);
    if (usAlert) this.soldierTextures.set('US_alert', usAlert);
    if (usFiring) this.soldierTextures.set('US_firing', usFiring);
    if (opforWalking) this.soldierTextures.set('OPFOR_walking', opforWalking);
    if (opforAlert) this.soldierTextures.set('OPFOR_alert', opforAlert);
    if (opforFiring) this.soldierTextures.set('OPFOR_firing', opforFiring);
    if (opforBack) this.soldierTextures.set('OPFOR_back', opforBack);

    // Create instanced meshes for each faction-state combination
    const soldierGeometry = new THREE.PlaneGeometry(5, 7);

    // Helper to create mesh for faction-state with outline effect
    const createFactionMesh = (texture: THREE.Texture, key: string, maxInstances: number = 120) => {
      const isPlayerSquad = key.startsWith('SQUAD');
      const isOpfor = key.includes('OPFOR');
      const isUS = key.includes('US');

      // Main sprite material - no tinting, just the original texture
      const spriteMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        depthWrite: true
      });

      // Create main sprite mesh
      const mesh = new THREE.InstancedMesh(soldierGeometry, spriteMaterial, maxInstances);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      this.factionMeshes.set(key, mesh);

      // Create outline material with appropriate color
      let outlineColor: THREE.Color;
      if (isPlayerSquad) {
        outlineColor = new THREE.Color(0.0, 1.0, 0.3);
      } else if (isUS) {
        outlineColor = new THREE.Color(0.0, 0.6, 1.0);
      } else {
        outlineColor = new THREE.Color(1.0, 0.0, 0.0);
      }

      const outlineMaterial = new THREE.ShaderMaterial({
        vertexShader: this.getOutlineVertexShader(),
        fragmentShader: this.getOutlineFragmentShader(),
        uniforms: {
          map: { value: texture },
          outlineColor: { value: outlineColor },
          combatState: { value: 0.0 },
          time: { value: 0.0 }
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      // Create outline mesh
      const outlineMesh = new THREE.InstancedMesh(soldierGeometry, outlineMaterial, maxInstances);
      outlineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      outlineMesh.frustumCulled = false;
      outlineMesh.count = 0;
      outlineMesh.renderOrder = 9;
      this.scene.add(outlineMesh);
      this.factionAuraMeshes.set(key, outlineMesh);
      this.factionMaterials.set(key, outlineMaterial);

      // Create ground marker
      let markerColor: THREE.Color;
      if (isPlayerSquad) {
        markerColor = new THREE.Color(0.0, 1.0, 0.3);
      } else if (isUS) {
        markerColor = new THREE.Color(0.0, 0.5, 1.0);
      } else {
        markerColor = new THREE.Color(1.0, 0.0, 0.0);
      }

      const markerMaterial = new THREE.MeshBasicMaterial({
        color: markerColor,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const markerGeometry = new THREE.RingGeometry(1.5, 2.5, 16);
      const markerMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, maxInstances);
      markerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      markerMesh.frustumCulled = false;
      markerMesh.count = 0;
      markerMesh.renderOrder = 0;
      this.scene.add(markerMesh);
      this.factionGroundMarkers.set(key, markerMesh);
    };

    // Create meshes for regular US forces
    if (usWalking) createFactionMesh(usWalking, 'US_walking');
    if (usAlert) createFactionMesh(usAlert, 'US_alert');
    if (usFiring) createFactionMesh(usFiring, 'US_firing');

    // Create meshes for player squad (green outlines)
    if (usWalking) createFactionMesh(usWalking, 'SQUAD_walking');
    if (usAlert) createFactionMesh(usAlert, 'SQUAD_alert');
    if (usFiring) createFactionMesh(usFiring, 'SQUAD_firing');

    // Create meshes for OPFOR
    if (opforWalking) createFactionMesh(opforWalking, 'OPFOR_walking');
    if (opforAlert) createFactionMesh(opforAlert, 'OPFOR_alert');
    if (opforFiring) createFactionMesh(opforFiring, 'OPFOR_firing');
    if (opforBack) createFactionMesh(opforBack, 'OPFOR_back');

    console.log('🎖️ Created faction-specific soldier meshes (with player squad support)');
  }

  setPlayerSquadId(squadId: string | undefined): void {
    this.playerSquadId = squadId;
    this.playerSquadDetected = false;
    console.log(`🎨 Renderer: Player squad ID set to: ${squadId}`);
  }

  updateBillboards(combatants: Map<string, Combatant>, playerPosition: THREE.Vector3): void {
    // Reset all mesh counts
    this.factionMeshes.forEach(mesh => mesh.count = 0);

    // Group combatants by faction and state
    const combatantGroups = new Map<string, Combatant[]>();

    const RENDER_DISTANCE = 400; // Do not render AI beyond this distance; simulation still runs

    // Debug: Log first few US combatants and their squad IDs
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
      // Skip fully dead combatants, but allow dying ones to render during animation
      if (combatant.state === CombatantState.DEAD && !combatant.isDying) return;
      if (combatant.isPlayerProxy) return;

      // Skip rendering if far from player
      if (combatant.position.distanceTo(playerPosition) > RENDER_DISTANCE) return;

      // Check if player is behind this enemy combatant
      let isShowingBack = false;
      if (combatant.faction === Faction.OPFOR) {
        const enemyForward = new THREE.Vector3(
          Math.cos(combatant.visualRotation),
          0,
          Math.sin(combatant.visualRotation)
        );
        const toPlayer = new THREE.Vector3()
          .subVectors(playerPosition, combatant.position)
          .normalize();

        const behindDot = enemyForward.dot(toPlayer);
        isShowingBack = behindDot < -0.2 &&
                       (!combatant.target || combatant.target.id !== 'PLAYER');
      }

      let stateKey = 'walking';
      if (isShowingBack) {
        stateKey = 'back';
      } else if (combatant.state === CombatantState.ENGAGING || combatant.state === CombatantState.SUPPRESSING) {
        stateKey = 'firing';
      } else if (combatant.state === CombatantState.ALERT) {
        stateKey = 'alert';
      }

      // Check if this combatant is in the player squad
      const isPlayerSquad = combatant.squadId === this.playerSquadId && combatant.faction === Faction.US;
      const factionPrefix = isPlayerSquad ? 'SQUAD' : combatant.faction;

      const key = `${factionPrefix}_${stateKey}`;
      if (!combatantGroups.has(key)) {
        combatantGroups.set(key, []);
      }
      combatantGroups.get(key)!.push(combatant);

      // Debug: Log first player squad member detection
      if (isPlayerSquad && !this.playerSquadDetected) {
        console.log(`✅ Player squad member detected: ${combatant.id}, squadId: ${combatant.squadId}, rendering as: ${key}`);
        this.playerSquadDetected = true;
      }
    });

    // Update each mesh
    const matrix = new THREE.Matrix4();
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    const cameraAngle = Math.atan2(cameraDirection.x, cameraDirection.z);

    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();
    const cameraForward = new THREE.Vector3(cameraDirection.x, 0, cameraDirection.z).normalize();

    combatantGroups.forEach((combatants, key) => {
      const mesh = this.factionMeshes.get(key);
      if (!mesh) return;
      const capacity = (mesh.instanceMatrix as any).count ?? mesh.count;
      let written = 0;
      for (let index = 0; index < combatants.length && index < capacity; index++) {
        const combatant = combatants[index];
        const isBackTexture = key.includes('_back');

        const combatantForward = new THREE.Vector3(
          Math.cos(combatant.visualRotation),
          0,
          Math.sin(combatant.visualRotation)
        );

        const toCombatant = new THREE.Vector3()
          .subVectors(combatant.position, playerPosition)
          .normalize();

        const viewAngle = toCombatant.dot(cameraRight);

        let finalRotation: number;
        let scaleX = combatant.scale.x;

        if (isBackTexture) {
          finalRotation = cameraAngle * 0.8 + combatant.visualRotation * 0.2;
          scaleX = Math.abs(scaleX);
        } else if (combatant.faction === Faction.OPFOR) {
          finalRotation = cameraAngle;
          scaleX = Math.abs(scaleX);
        } else {
          const facingDot = Math.abs(combatantForward.dot(cameraForward));
          const billboardBlend = 0.3 + facingDot * 0.4;
          finalRotation = cameraAngle * billboardBlend + combatant.visualRotation * (1 - billboardBlend);

          const combatantDotRight = combatantForward.dot(cameraRight);
          const shouldFlip = (viewAngle > 0 && combatantDotRight < 0) ||
                            (viewAngle < 0 && combatantDotRight > 0);
          scaleX = shouldFlip ? -Math.abs(scaleX) : Math.abs(scaleX);
        }

        matrix.makeRotationY(finalRotation);

        // Apply death animation effects
        let finalPosition = combatant.position.clone();
        let finalScaleX = scaleX;
        let finalScaleY = combatant.scale.y;
        let finalScaleZ = combatant.scale.z;
        let opacity = 1.0;

        if (combatant.isDying && combatant.deathProgress !== undefined) {
          const FALL_PHASE = 0.7 / 5.7; // 0.7s fall / 5.7s total
          const GROUND_PHASE = 4.0 / 5.7; // 4.0s ground / 5.7s total
          const FADEOUT_PHASE = 1.0 / 5.7; // 1.0s fadeout / 5.7s total

          const progress = combatant.deathProgress;

          if (progress < FALL_PHASE) {
            // Phase 1: Falling (0 to 0.123)
            const fallProgress = progress / FALL_PHASE;
            const easeOut = 1 - Math.pow(1 - fallProgress, 2); // Ease out quad

            // Fall backward in death direction
            if (combatant.deathDirection) {
              const fallDistance = 1.5; // units
              finalPosition.x += combatant.deathDirection.x * easeOut * fallDistance;
              finalPosition.z += combatant.deathDirection.z * easeOut * fallDistance;
            }

            // Parabolic drop with ground impact
            const dropHeight = 3.5;
            finalPosition.y += dropHeight * (1 - easeOut) - dropHeight;

            // Rotate to horizontal (90 degrees)
            const rotationAngle = easeOut * Math.PI * 0.45; // 81 degrees
            const tiltAxis = combatant.deathDirection ?
              new THREE.Vector3(-combatant.deathDirection.z, 0, combatant.deathDirection.x) :
              new THREE.Vector3(1, 0, 0);
            const tiltMatrix = new THREE.Matrix4().makeRotationAxis(tiltAxis.normalize(), rotationAngle);
            matrix.multiply(tiltMatrix);

            // Slight scale compression on impact
            finalScaleY *= 1 - (easeOut * 0.2);
          } else if (progress < FALL_PHASE + GROUND_PHASE) {
            // Phase 2: On ground (0.123 to 0.825)
            const groundProgress = (progress - FALL_PHASE) / GROUND_PHASE;

            // Keep final fall position
            if (combatant.deathDirection) {
              const fallDistance = 1.5;
              finalPosition.x += combatant.deathDirection.x * fallDistance;
              finalPosition.z += combatant.deathDirection.z * fallDistance;
            }
            finalPosition.y -= 3.5;

            // Stay horizontal
            const tiltAxis = combatant.deathDirection ?
              new THREE.Vector3(-combatant.deathDirection.z, 0, combatant.deathDirection.x) :
              new THREE.Vector3(1, 0, 0);
            const tiltMatrix = new THREE.Matrix4().makeRotationAxis(tiltAxis.normalize(), Math.PI * 0.45);
            matrix.multiply(tiltMatrix);

            // Slight settle effect (minimal bounce)
            const settle = Math.max(0, (1 - groundProgress * 4) * 0.1);
            finalPosition.y += settle;
            finalScaleY *= 0.8;
          } else {
            // Phase 3: Fadeout (0.825 to 1.0)
            const fadeProgress = (progress - FALL_PHASE - GROUND_PHASE) / FADEOUT_PHASE;

            // Keep final position
            if (combatant.deathDirection) {
              const fallDistance = 1.5;
              finalPosition.x += combatant.deathDirection.x * fallDistance;
              finalPosition.z += combatant.deathDirection.z * fallDistance;
            }
            finalPosition.y -= 3.5;

            // Stay horizontal
            const tiltAxis = combatant.deathDirection ?
              new THREE.Vector3(-combatant.deathDirection.z, 0, combatant.deathDirection.x) :
              new THREE.Vector3(1, 0, 0);
            const tiltMatrix = new THREE.Matrix4().makeRotationAxis(tiltAxis.normalize(), Math.PI * 0.45);
            matrix.multiply(tiltMatrix);

            finalScaleY *= 0.8;

            // Fade out by scaling down
            const fadeScale = 1 - fadeProgress;
            finalScaleX *= fadeScale;
            finalScaleY *= fadeScale;
            finalScaleZ *= fadeScale;
          }
        }

        matrix.setPosition(finalPosition);

        const scaleMatrix = new THREE.Matrix4().makeScale(
          finalScaleX,
          finalScaleY,
          finalScaleZ
        );
        matrix.multiply(scaleMatrix);

        mesh.setMatrixAt(index, matrix);
        combatant.billboardIndex = index;

        // Set outline mesh with slightly larger scale for thick outline
        const outlineMesh = this.factionAuraMeshes.get(key);
        if (outlineMesh) {
          // Create scaled matrix for outline (20% larger)
          const outlineMatrix = matrix.clone();
          const scaleMatrix = new THREE.Matrix4().makeScale(1.2, 1.2, 1.2);
          outlineMatrix.multiply(scaleMatrix);
          outlineMesh.setMatrixAt(index, outlineMatrix);
        }

        // Set ground marker at combatant's feet
        const markerMesh = this.factionGroundMarkers.get(key);
        if (markerMesh) {
          const markerMatrix = new THREE.Matrix4();
          // Rotate to lie flat on ground (90 degrees around X axis)
          markerMatrix.makeRotationX(-Math.PI / 2);
          // Position at combatant's feet with slight offset to avoid z-fighting
          markerMatrix.setPosition(combatant.position.x, 0.1, combatant.position.z);
          markerMesh.setMatrixAt(index, markerMatrix);
        }

        written++;
      }

      mesh.count = written;
      mesh.instanceMatrix.needsUpdate = true;

      // Update outline mesh instances to match
      const outlineMesh = this.factionAuraMeshes.get(key);
      if (outlineMesh) {
        outlineMesh.count = written;
        outlineMesh.instanceMatrix.needsUpdate = true;
      }

      // Update ground marker instances
      const markerMesh = this.factionGroundMarkers.get(key);
      if (markerMesh) {
        markerMesh.count = written;
        markerMesh.instanceMatrix.needsUpdate = true;
      }

      // Update outline material uniforms
      const outlineMaterial = this.factionMaterials.get(key);
      if (outlineMaterial && outlineMaterial instanceof THREE.ShaderMaterial) {
        // Determine average combat state for this group
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
    const time = performance.now() * 0.001;

    this.factionMaterials.forEach(material => {
      if (material instanceof THREE.ShaderMaterial && material.uniforms) {
        if (material.uniforms.time) {
          material.uniforms.time.value = time;
        }
        if (material.uniforms.cameraPosition) {
          material.uniforms.cameraPosition.value = this.camera.position;
        }
      }
    });
  }

  // Handle damage flash for specific combatant
  setDamageFlash(combatantId: string, intensity: number): void {
    this.combatantStates.set(combatantId, {
      state: this.combatantStates.get(combatantId)?.state || 0,
      damaged: intensity
    });

    // Decay damage flash over time
    if (intensity > 0) {
      setTimeout(() => {
        const state = this.combatantStates.get(combatantId);
        if (state && state.damaged > 0) {
          state.damaged = Math.max(0, state.damaged - 0.1);
        }
      }, 100);
    }
  }

  // Apply a preset configuration
  applyPreset(preset: ShaderPreset): void {
    const settings = this.presets[preset];
    this.setShaderSettings({
      celShadingEnabled: settings.celShadingEnabled ? 1.0 : 0.0,
      rimLightingEnabled: settings.rimLightingEnabled ? 1.0 : 0.0,
      auraEnabled: settings.auraEnabled ? 1.0 : 0.0,
      auraIntensity: settings.auraIntensity
    });
    console.log(`🎨 Applied NPC shader preset: ${preset}`);
  }

  // Get current shader settings
  getShaderSettings(): NPCShaderSettings {
    return {
      celShadingEnabled: this.shaderSettings.celShadingEnabled > 0.5,
      rimLightingEnabled: this.shaderSettings.rimLightingEnabled > 0.5,
      auraEnabled: this.shaderSettings.auraEnabled > 0.5,
      auraIntensity: this.shaderSettings.auraIntensity
    };
  }

  // Toggle specific effects
  toggleCelShading(): void {
    this.shaderSettings.celShadingEnabled = this.shaderSettings.celShadingEnabled > 0.5 ? 0.0 : 1.0;
    this.updateAllMaterialUniforms();
  }

  toggleRimLighting(): void {
    this.shaderSettings.rimLightingEnabled = this.shaderSettings.rimLightingEnabled > 0.5 ? 0.0 : 1.0;
    this.updateAllMaterialUniforms();
  }

  toggleAura(): void {
    this.shaderSettings.auraEnabled = this.shaderSettings.auraEnabled > 0.5 ? 0.0 : 1.0;
    this.updateAllMaterialUniforms();
  }

  // Update shader settings
  setShaderSettings(settings: Partial<typeof this.shaderSettings>): void {
    Object.assign(this.shaderSettings, settings);
    // Settings stored for future shader implementation
  }

  // Private helper to update all material uniforms
  private updateAllMaterialUniforms(): void {
    // Currently using basic materials
    // This method is kept for future shader implementation
  }

  updateCombatantTexture(combatant: Combatant): void {
    let textureKey = `${combatant.faction}_`;

    switch (combatant.state) {
      case CombatantState.ENGAGING:
      case CombatantState.SUPPRESSING:
        textureKey += 'firing';
        break;
      case CombatantState.ALERT:
        textureKey += 'alert';
        break;
      default:
        textureKey += 'walking';
        break;
    }

    combatant.currentTexture = this.soldierTextures.get(textureKey);
  }

  private getOutlineVertexShader(): string {
    return `
      varying vec2 vUv;

      void main() {
        vUv = uv;

        // Standard billboard transformation
        vec4 worldPos = instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * worldPos;
      }
    `;
  }

  private getOutlineFragmentShader(): string {
    return `
      uniform sampler2D map;
      uniform vec3 outlineColor;
      uniform float combatState;
      uniform float time;

      varying vec2 vUv;

      void main() {
        // Sample the texture
        vec4 texColor = texture2D(map, vUv);

        // Only show outline where sprite has alpha
        if (texColor.a < 0.3) discard;

        // Pulse brightness during combat
        float pulse = 1.0 + sin(time * 4.0) * 0.2 * combatState;
        float brightness = 0.8 + combatState * 0.2;
        brightness *= pulse;

        // Output solid outline color
        gl_FragColor = vec4(outlineColor * brightness, texColor.a);
      }
    `;
  }

  private getNPCFragmentShader(): string {
    return `
      uniform sampler2D map;
      uniform float faction;
      uniform float combatState;
      uniform float time;
      uniform float damaged;
      uniform float celShadingEnabled;
      uniform float rimLightingEnabled;
      uniform float auraEnabled;
      uniform float auraIntensity;
      uniform vec3 ambientLight;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDirection;

      vec3 applyCelShading(vec3 color) {
        float NdotL = dot(normalize(vNormal), normalize(sunDirection));
        float lightIntensity = NdotL * 0.5 + 0.5;
        float celBands = 3.0;
        lightIntensity = floor(lightIntensity * celBands) / celBands;
        vec3 shadedColor = color * (0.4 + lightIntensity * 0.6);
        return shadedColor;
      }

      float calculateRimLight() {
        float rim = 1.0 - max(0.0, dot(vViewDirection, vNormal));
        rim = pow(rim, 2.0);
        return rim;
      }

      vec3 getFactionColor() {
        return mix(vec3(0.2, 0.4, 1.0), vec3(1.0, 0.2, 0.2), faction);
      }

      void main() {
        vec4 texColor = texture2D(map, vUv);
        if (texColor.a < 0.5) discard;

        vec3 finalColor = texColor.rgb;

        if (celShadingEnabled > 0.5) {
          finalColor = applyCelShading(finalColor);
        }

        if (auraEnabled > 0.5) {
          vec3 factionColor = getFactionColor();
          float edgeAlpha = 1.0 - smoothstep(0.5, 0.9, texColor.a);
          float pulse = 1.0 + sin(time * 3.0 + vWorldPosition.x * 0.1) * 0.3 * combatState;
          float auraStrength = auraIntensity * (0.3 + combatState * 0.4) * pulse;
          finalColor = mix(finalColor, finalColor + factionColor * 0.5, edgeAlpha * auraStrength);
        }

        if (rimLightingEnabled > 0.5) {
          float rim = calculateRimLight();
          vec3 rimColor = getFactionColor();
          float rimIntensity = 0.3 + combatState * 0.4;
          finalColor += rimColor * rim * rimIntensity;
        }

        if (damaged > 0.0) {
          vec3 flashColor = vec3(1.0, 0.8, 0.8);
          finalColor = mix(finalColor, flashColor, damaged * 0.7);
        }

        if (combatState > 0.0) {
          vec3 combatTint = getFactionColor() * 0.15;
          finalColor = mix(finalColor, finalColor + combatTint, combatState);
        }

        gl_FragColor = vec4(finalColor, texColor.a);
      }
    `;
  }

  dispose(): void {
    // Dispose main meshes
    this.factionMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      this.scene.remove(mesh);
    });

    // Dispose outline meshes
    this.factionAuraMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      this.scene.remove(mesh);
    });

    // Dispose ground markers
    this.factionGroundMarkers.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      this.scene.remove(mesh);
    });

    this.factionMaterials.forEach(material => {
      material.dispose();
    });

    this.factionMeshes.clear();
    this.factionAuraMeshes.clear();
    this.factionGroundMarkers.clear();
    this.factionMaterials.clear();
    this.soldierTextures.clear();
    this.combatantStates.clear();
  }
}