import * as THREE from 'three';
import type { Crowd, CrowdAgent } from '@recast-navigation/core';
import type { Combatant } from '../combat/types';
import { NPC_Y_OFFSET, NPC_MAX_SPEED } from '../../config/CombatantConfig';
import { Logger } from '../../utils/Logger';

const _targetPos = { x: 0, y: 0, z: 0 };
const TARGET_UPDATE_THRESHOLD_SQ = 4.0; // 2m - debounce target updates
const ZERO_VELOCITY_THRESHOLD_SQ = 0.001; // near-zero velocity after target set = pathfinding failure
const PATHFIND_FAIL_CHECK_FRAMES = 3; // frames to wait before declaring failure

// ── Crowd agent parameters ──
const AGENT_RADIUS = 0.5;
const AGENT_HEIGHT = 3.0;
const AGENT_MAX_ACCELERATION = 8.0;
const AGENT_COLLISION_QUERY_RANGE = 12.0;
const AGENT_PATH_OPTIMIZATION_RANGE = 30.0;
const AGENT_SEPARATION_WEIGHT = 2.0;

/**
 * Bridges the Recast crowd simulation with CombatantMovement.
 *
 * State handlers (patrol/combat/cover/defend) still decide WHERE to go
 * by setting combatant.destinationPoint and combatant.velocity.
 * This adapter intercepts the velocity and replaces it with crowd-steered
 * velocity for high/medium LOD NPCs that have been registered.
 */
export class NavmeshMovementAdapter {
  private crowd: Crowd;
  private agentMap = new Map<string, CrowdAgent>();
  private lastTargetMap = new Map<string, THREE.Vector3>();
  private zeroVelocityFrames = new Map<string, number>();

  constructor(crowd: Crowd) {
    this.crowd = crowd;
  }

  /** Register a combatant with the crowd. Returns true if successful. */
  registerAgent(combatant: Combatant): boolean {
    if (this.agentMap.has(combatant.id)) return true;
    if (this.agentMap.size >= this.crowd.getAgentCount()) return false;

    try {
      const agent = this.crowd.addAgent(
        { x: combatant.position.x, y: combatant.position.y - NPC_Y_OFFSET, z: combatant.position.z },
        {
          radius: AGENT_RADIUS,
          height: AGENT_HEIGHT,
          maxAcceleration: AGENT_MAX_ACCELERATION,
          maxSpeed: NPC_MAX_SPEED,
          collisionQueryRange: AGENT_COLLISION_QUERY_RANGE,
          pathOptimizationRange: AGENT_PATH_OPTIMIZATION_RANGE,
          separationWeight: AGENT_SEPARATION_WEIGHT,
        }
      );
      this.agentMap.set(combatant.id, agent);
      return true;
    } catch {
      return false;
    }
  }

  /** Unregister a combatant from the crowd. */
  unregisterAgent(id: string): void {
    const agent = this.agentMap.get(id);
    if (agent) {
      this.crowd.removeAgent(agent);
      this.agentMap.delete(id);
      this.lastTargetMap.delete(id);
      this.zeroVelocityFrames.delete(id);
    }
  }

  /** Check if a combatant is registered in the crowd. */
  hasAgent(id: string): boolean {
    return this.agentMap.has(id);
  }

  /** Push the combatant's destination to the crowd agent (debounced). Returns false if pathfinding appears to have failed. */
  updateAgentTarget(combatant: Combatant): boolean {
    const agent = this.agentMap.get(combatant.id);
    if (!agent) return false;

    const dest = combatant.destinationPoint;
    if (!dest) return true; // no destination is not a failure

    // Debounce - only update if target moved significantly
    const lastTarget = this.lastTargetMap.get(combatant.id);
    if (lastTarget) {
      const dx = dest.x - lastTarget.x;
      const dz = dest.z - lastTarget.z;
      if (dx * dx + dz * dz < TARGET_UPDATE_THRESHOLD_SQ) {
        return this.checkAgentMoving(combatant.id, agent);
      }
    }

    _targetPos.x = dest.x;
    _targetPos.y = dest.y - NPC_Y_OFFSET;
    _targetPos.z = dest.z;

    agent.requestMoveTarget(_targetPos);
    // Reset zero-velocity counter when a new target is set
    this.zeroVelocityFrames.set(combatant.id, 0);

    if (!lastTarget) {
      this.lastTargetMap.set(combatant.id, dest.clone());
    } else {
      lastTarget.copy(dest);
    }
    return true;
  }

  /** Override combatant velocity with crowd-steered velocity. */
  applyAgentVelocity(combatant: Combatant): void {
    const agent = this.agentMap.get(combatant.id);
    if (!agent) return;

    const vel = agent.velocity();
    // Only override XZ. Y is handled by terrain snap in CombatantMovement.
    combatant.velocity.x = vel.x;
    combatant.velocity.z = vel.z;

    // Track consecutive zero-velocity frames for pathfinding failure detection
    const velSq = vel.x * vel.x + vel.z * vel.z;
    if (velSq < ZERO_VELOCITY_THRESHOLD_SQ && combatant.destinationPoint) {
      const frames = (this.zeroVelocityFrames.get(combatant.id) ?? 0) + 1;
      this.zeroVelocityFrames.set(combatant.id, frames);
    } else {
      this.zeroVelocityFrames.set(combatant.id, 0);
    }
  }

  /** Check if a crowd agent appears to be moving toward its target. */
  private checkAgentMoving(id: string, _agent: CrowdAgent): boolean {
    const frames = this.zeroVelocityFrames.get(id) ?? 0;
    if (frames >= PATHFIND_FAIL_CHECK_FRAMES) {
      Logger.warn('navmesh', `Agent ${id} has zero velocity for ${frames} frames — target likely unreachable`);
      return false;
    }
    return true;
  }

  /** Get current agent count. */
  getAgentCount(): number {
    return this.agentMap.size;
  }

  /** Clean up all agents. */
  dispose(): void {
    for (const [id] of this.agentMap) {
      this.unregisterAgent(id);
    }
  }
}
