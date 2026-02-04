import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Faction, Squad } from './types';
import { ZoneManager } from '../world/ZoneManager';
import { Logger } from '../../utils/Logger';

interface RallyPoint {
  position: THREE.Vector3;
  active: boolean;
  creationTime: number;
  usesRemaining: number;
  maxUses: number;
  lifetime: number; // seconds
  regenerationTime: number; // seconds after depleted
  lastDepletedTime?: number;
  flagMesh?: THREE.Mesh;
  poleMesh?: THREE.Mesh;
}

export class RallyPointSystem implements GameSystem {
  private scene: THREE.Scene;
  private rallyPoints: Map<string, RallyPoint> = new Map(); // keyed by squadId
  private zoneManager?: ZoneManager;
  private playerSquadId?: string;

  // Rally point configuration
  private readonly RALLY_POINT_LIFETIME = 60; // seconds
  private readonly RALLY_POINT_MAX_USES = 3;
  private readonly RALLY_POINT_REGENERATION_TIME = 30; // seconds
  private readonly RALLY_POINT_PLACEMENT_RANGE = 50; // must be within 50m of friendly zone
  private readonly FLAG_HEIGHT = 4;
  private readonly FLAG_WIDTH = 2.5;
  private readonly POLE_HEIGHT = 5;

  // Animation state
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    Logger.info('rally-point', ' Rally Point System initialized');
  }

  update(deltaTime: number): void {
    this.time += deltaTime;

    // Update all rally points
    const currentTime = performance.now() / 1000;

    for (const [squadId, rallyPoint] of this.rallyPoints.entries()) {
      // Check expiration
      if (rallyPoint.active && currentTime - rallyPoint.creationTime > rallyPoint.lifetime) {
        Logger.info('rally-point', ` Rally point for squad ${squadId} expired`);
        this.deactivateRallyPoint(squadId);
        continue;
      }

      // Check regeneration
      if (!rallyPoint.active && rallyPoint.lastDepletedTime) {
        if (currentTime - rallyPoint.lastDepletedTime > rallyPoint.regenerationTime) {
          Logger.info('rally-point', ` Rally point for squad ${squadId} regenerated`);
          rallyPoint.active = true;
          rallyPoint.usesRemaining = rallyPoint.maxUses;
          rallyPoint.creationTime = currentTime;
          delete rallyPoint.lastDepletedTime;

          // Make flag visible again
          if (rallyPoint.flagMesh) {
            rallyPoint.flagMesh.visible = true;
          }
        }
      }

      // Animate flag wave
      if (rallyPoint.flagMesh && rallyPoint.active) {
        this.animateFlag(rallyPoint.flagMesh);
      }
    }
  }

  dispose(): void {
    // Remove all rally point meshes
    for (const rallyPoint of this.rallyPoints.values()) {
      if (rallyPoint.flagMesh) {
        this.scene.remove(rallyPoint.flagMesh);
      }
      if (rallyPoint.poleMesh) {
        this.scene.remove(rallyPoint.poleMesh);
      }
    }
    this.rallyPoints.clear();
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  setPlayerSquadId(squadId: string): void {
    this.playerSquadId = squadId;
  }

  /**
   * Attempt to place a rally point for the player's squad
   * Returns true if successful, false if placement failed
   */
  placeRallyPoint(position: THREE.Vector3, squadId: string, faction: Faction): { success: boolean; message: string } {
    // Check if near a friendly zone
    if (!this.isNearFriendlyZone(position, faction)) {
      return {
        success: false,
        message: 'Rally point must be placed near a friendly zone'
      };
    }

    // Get existing rally point or create new entry
    let rallyPoint = this.rallyPoints.get(squadId);

    if (rallyPoint) {
      // Remove old visual meshes
      if (rallyPoint.flagMesh) {
        this.scene.remove(rallyPoint.flagMesh);
      }
      if (rallyPoint.poleMesh) {
        this.scene.remove(rallyPoint.poleMesh);
      }
    }

    // Create new rally point
    const currentTime = performance.now() / 1000;
    rallyPoint = {
      position: position.clone(),
      active: true,
      creationTime: currentTime,
      usesRemaining: this.RALLY_POINT_MAX_USES,
      maxUses: this.RALLY_POINT_MAX_USES,
      lifetime: this.RALLY_POINT_LIFETIME,
      regenerationTime: this.RALLY_POINT_REGENERATION_TIME
    };

    // Create visual representation
    this.createRallyPointMesh(rallyPoint, faction);

    this.rallyPoints.set(squadId, rallyPoint);

    Logger.info('rally-point', ` Rally point placed for squad ${squadId} at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
    Logger.info('rally-point', `   Uses: ${rallyPoint.usesRemaining}/${rallyPoint.maxUses}, Lifetime: ${rallyPoint.lifetime}s`);

    return {
      success: true,
      message: `Rally point set (${rallyPoint.usesRemaining}/${rallyPoint.maxUses} uses)`
    };
  }

  /**
   * Get rally point position for a squad if available
   * Returns null if no active rally point or no uses remaining
   */
  getRallyPointPosition(squadId: string): THREE.Vector3 | null {
    const rallyPoint = this.rallyPoints.get(squadId);

    if (!rallyPoint || !rallyPoint.active || rallyPoint.usesRemaining <= 0) {
      return null;
    }

    return rallyPoint.position.clone();
  }

  /**
   * Consume one use of the rally point
   * Returns true if successful, false if no uses remaining
   */
  consumeRallyPointUse(squadId: string): boolean {
    const rallyPoint = this.rallyPoints.get(squadId);

    if (!rallyPoint || !rallyPoint.active || rallyPoint.usesRemaining <= 0) {
      return false;
    }

    rallyPoint.usesRemaining--;
    Logger.info('rally-point', ` Rally point use consumed for squad ${squadId}: ${rallyPoint.usesRemaining}/${rallyPoint.maxUses} remaining`);

    // Deactivate if depleted
    if (rallyPoint.usesRemaining <= 0) {
      Logger.info('rally-point', ` Rally point depleted for squad ${squadId}, will regenerate in ${rallyPoint.regenerationTime}s`);
      rallyPoint.lastDepletedTime = performance.now() / 1000;
      this.deactivateRallyPoint(squadId);
    }

    return true;
  }

  /**
   * Get rally point status for HUD display
   */
  getRallyPointStatus(squadId: string): { active: boolean; usesRemaining: number; maxUses: number; timeRemaining: number } | null {
    const rallyPoint = this.rallyPoints.get(squadId);

    if (!rallyPoint) {
      return null;
    }

    const currentTime = performance.now() / 1000;
    let timeRemaining = 0;

    if (rallyPoint.active) {
      timeRemaining = Math.max(0, rallyPoint.lifetime - (currentTime - rallyPoint.creationTime));
    } else if (rallyPoint.lastDepletedTime) {
      // Show regeneration time
      timeRemaining = Math.max(0, rallyPoint.regenerationTime - (currentTime - rallyPoint.lastDepletedTime));
    }

    return {
      active: rallyPoint.active,
      usesRemaining: rallyPoint.usesRemaining,
      maxUses: rallyPoint.maxUses,
      timeRemaining: Math.ceil(timeRemaining)
    };
  }

  private isNearFriendlyZone(position: THREE.Vector3, faction: Faction): boolean {
    if (!this.zoneManager) {
      return false;
    }

    const zones = this.zoneManager.getAllZones();

    for (const zone of zones) {
      // Check if zone is owned by the same faction
      if (zone.owner === faction) {
        const distance = position.distanceTo(zone.position);
        if (distance <= zone.radius + this.RALLY_POINT_PLACEMENT_RANGE) {
          return true;
        }
      }
    }

    return false;
  }

  private deactivateRallyPoint(squadId: string): void {
    const rallyPoint = this.rallyPoints.get(squadId);
    if (!rallyPoint) return;

    rallyPoint.active = false;

    // Hide flag mesh
    if (rallyPoint.flagMesh) {
      rallyPoint.flagMesh.visible = false;
    }
  }

  private createRallyPointMesh(rallyPoint: RallyPoint, faction: Faction): void {
    // Create pole
    const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, this.POLE_HEIGHT, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.8,
      roughness: 0.2
    });
    const poleMesh = new THREE.Mesh(poleGeometry, poleMaterial);
    poleMesh.position.copy(rallyPoint.position);
    poleMesh.position.y += this.POLE_HEIGHT / 2;
    this.scene.add(poleMesh);
    rallyPoint.poleMesh = poleMesh;

    // Create flag
    const flagGeometry = new THREE.PlaneGeometry(this.FLAG_WIDTH, this.FLAG_HEIGHT, 8, 8);

    // Set flag color based on faction
    const flagColor = faction === Faction.US ? 0x0080ff : 0xff0000;
    const flagMaterial = new THREE.MeshStandardMaterial({
      color: flagColor,
      side: THREE.DoubleSide,
      emissive: flagColor,
      emissiveIntensity: 0.3
    });

    const flagMesh = new THREE.Mesh(flagGeometry, flagMaterial);
    flagMesh.position.copy(rallyPoint.position);
    flagMesh.position.y += this.POLE_HEIGHT - this.FLAG_HEIGHT / 2;
    flagMesh.position.x += this.FLAG_WIDTH / 2; // Offset from pole

    this.scene.add(flagMesh);
    rallyPoint.flagMesh = flagMesh;
  }

  private animateFlag(flagMesh: THREE.Mesh): void {
    // Simple wave animation using vertex displacement
    const geometry = flagMesh.geometry as THREE.PlaneGeometry;
    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);

      // Wave effect: amplitude decreases toward pole (x=0)
      const waveAmplitude = (x / this.FLAG_WIDTH) * 0.3;
      const waveFrequency = 3;
      const waveSpeed = 2;

      const waveOffset = Math.sin(this.time * waveSpeed + x * waveFrequency) * waveAmplitude;

      positions.setZ(i, waveOffset);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }
}
