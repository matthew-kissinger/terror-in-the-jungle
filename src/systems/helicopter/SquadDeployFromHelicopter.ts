import * as THREE from 'three';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';

// --- Deploy constraints ---
const MAX_DEPLOY_ALTITUDE = 15; // meters above ground
const MAX_DEPLOY_SPEED = 5; // m/s horizontal speed
const DEPLOY_COOLDOWN_S = 30; // seconds between deploys per helicopter
const DEPLOY_OFFSET_DISTANCE = 3; // meters from helicopter center
const DEPLOY_POSITIONS_COUNT = 4;

interface DeployCheck {
  canDeploy: boolean;
  reason?: string;
}

interface DeployResult {
  success: boolean;
  positions: THREE.Vector3[];
  reason?: string;
}

export interface SquadDeployTerrainQuery {
  getHeightAt(x: number, z: number): number;
  getEffectiveHeightAt?(x: number, z: number): number;
}

interface HelicopterSnapshot {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  groundHeight: number;
}

/**
 * Calculates whether and where a squad can be deployed from a helicopter.
 * Pure calculation - does not spawn combatants or manage scene objects.
 */
export class SquadDeployFromHelicopter {
  private terrain: SquadDeployTerrainQuery;
  private cooldowns: Map<string, number> = new Map();

  constructor(terrain: SquadDeployTerrainQuery) {
    this.terrain = terrain;
  }

  /**
   * Check whether deploy conditions are met for the given helicopter.
   */
  canDeploy(
    helicopterId: string,
    state: HelicopterSnapshot,
    now: number = Date.now()
  ): DeployCheck {
    // Cooldown check
    const cooldownEnd = this.cooldowns.get(helicopterId) ?? 0;
    if (now < cooldownEnd) {
      const remaining = Math.ceil((cooldownEnd - now) / 1000);
      return { canDeploy: false, reason: `Deploy cooldown: ${remaining}s remaining` };
    }

    // Altitude check (height above ground)
    const altitudeAboveGround = state.position.y - state.groundHeight;
    if (altitudeAboveGround > MAX_DEPLOY_ALTITUDE) {
      return {
        canDeploy: false,
        reason: `Too high: ${altitudeAboveGround.toFixed(0)}m (max ${MAX_DEPLOY_ALTITUDE}m)`
      };
    }

    // Speed check (horizontal speed only)
    const hx = state.velocity.x;
    const hz = state.velocity.z;
    const horizontalSpeed = Math.sqrt(hx * hx + hz * hz);
    if (horizontalSpeed > MAX_DEPLOY_SPEED) {
      return {
        canDeploy: false,
        reason: `Too fast: ${horizontalSpeed.toFixed(1)}m/s (max ${MAX_DEPLOY_SPEED}m/s)`
      };
    }

    return { canDeploy: true };
  }

  /**
   * Calculate deploy positions around the helicopter and set cooldown.
   * Call canDeploy() first to verify conditions are met.
   */
  deploySquad(
    helicopterId: string,
    state: HelicopterSnapshot,
    memberCount: number = DEPLOY_POSITIONS_COUNT,
    now: number = Date.now()
  ): DeployResult {
    const check = this.canDeploy(helicopterId, state, now);
    if (!check.canDeploy) {
      return { success: false, positions: [], reason: check.reason };
    }

    const positions: THREE.Vector3[] = [];
    const count = Math.min(memberCount, DEPLOY_POSITIONS_COUNT);

    // Place members in cardinal directions around the helicopter
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2; // N, E, S, W for 4 members
      const offsetX = Math.cos(angle) * DEPLOY_OFFSET_DISTANCE;
      const offsetZ = Math.sin(angle) * DEPLOY_OFFSET_DISTANCE;

      const worldX = state.position.x + offsetX;
      const worldZ = state.position.z + offsetZ;
      const terrainHeight = this.terrain.getEffectiveHeightAt?.(worldX, worldZ)
        ?? this.terrain.getHeightAt(worldX, worldZ);

      positions.push(new THREE.Vector3(worldX, terrainHeight + NPC_Y_OFFSET, worldZ));
    }

    // Set cooldown
    this.cooldowns.set(helicopterId, now + DEPLOY_COOLDOWN_S * 1000);

    return { success: true, positions };
  }

  /**
   * Get remaining cooldown in seconds (0 if ready).
   */
  getCooldownRemaining(helicopterId: string, now: number = Date.now()): number {
    const cooldownEnd = this.cooldowns.get(helicopterId) ?? 0;
    if (now >= cooldownEnd) return 0;
    return (cooldownEnd - now) / 1000;
  }

  /**
   * Clear all cooldowns (for testing or match reset).
   */
  clearCooldowns(): void {
    this.cooldowns.clear();
  }

  dispose(): void {
    this.cooldowns.clear();
  }
}
