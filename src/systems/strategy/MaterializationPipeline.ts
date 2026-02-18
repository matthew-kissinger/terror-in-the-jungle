import { Logger } from '../../utils/Logger';
import { WarSimulatorConfig } from '../../config/gameModeTypes';
import { AgentTier, StrategicAgent, StrategicSquad } from './types';
import type { CombatantSystem } from '../combat/CombatantSystem';

/**
 * Manages the transition of agents between tiers:
 * STRATEGIC <-> SIMULATED <-> MATERIALIZED
 *
 * Per frame:
 * 1. Iterate alive agents, compute distance-squared to player
 * 2. Within materializationRadius + under maxMaterialized cap -> materialize
 * 3. Beyond dematerializationRadius -> dematerialize (hysteresis prevents thrashing)
 * 4. Remaining: SIMULATED if within simulatedRadius, else STRATEGIC
 * 5. Squad-coherent: materialize full squads when any member is in range
 */
export class MaterializationPipeline {
  private agents: Map<string, StrategicAgent>;
  private squads: Map<string, StrategicSquad>;
  private config: WarSimulatorConfig;
  private combatantSystem: CombatantSystem;

  // Precomputed distance thresholds (squared)
  private matRadiusSq: number;
  private dematRadiusSq: number;
  private simRadiusSq: number;

  // Prediction factor: how far ahead to look based on player velocity
  private readonly PREDICTION_DISTANCE = 200; // meters ahead in movement direction

  // Throttling: don't materialize/dematerialize more than N per frame
  private readonly MAX_MATERIALIZE_PER_FRAME = 4;
  private readonly MAX_DEMATERIALIZE_PER_FRAME = 4;

  constructor(
    agents: Map<string, StrategicAgent>,
    squads: Map<string, StrategicSquad>,
    config: WarSimulatorConfig,
    combatantSystem: CombatantSystem
  ) {
    this.agents = agents;
    this.squads = squads;
    this.config = config;
    this.combatantSystem = combatantSystem;

    this.matRadiusSq = config.materializationRadius * config.materializationRadius;
    this.dematRadiusSq = config.dematerializationRadius * config.dematerializationRadius;
    this.simRadiusSq = config.simulatedRadius * config.simulatedRadius;
  }

  update(
    playerX: number, playerY: number, playerZ: number,
    playerVelX: number, playerVelZ: number
  ): void {
    // Prediction point: where the player will be in ~2 seconds
    const velLen = Math.sqrt(playerVelX * playerVelX + playerVelZ * playerVelZ);
    let predX = playerX;
    let predZ = playerZ;
    if (velLen > 0.5) {
      const scale = this.PREDICTION_DISTANCE / velLen;
      predX = playerX + playerVelX * Math.min(scale, 60); // cap at 60 frames
      predZ = playerZ + playerVelZ * Math.min(scale, 60);
    }

    let materializedCount = 0;
    let materializeThisFrame = 0;
    let dematerializeThisFrame = 0;

    // Collect squads that need materialization (for squad-coherent spawning)
    const squadsToMaterialize = new Set<string>();

    // First pass: count materialized, identify dematerialization candidates
    for (const agent of this.agents.values()) {
      if (!agent.alive) {
        if (agent.tier === AgentTier.MATERIALIZED) {
          agent.tier = AgentTier.STRATEGIC;
        }
        continue;
      }

      if (agent.tier === AgentTier.MATERIALIZED) {
        materializedCount++;
      }

      const dx = agent.x - playerX;
      const dz = agent.z - playerZ;
      const distSq = dx * dx + dz * dz;

      // Also check prediction distance
      const pdx = agent.x - predX;
      const pdz = agent.z - predZ;
      const predDistSq = pdx * pdx + pdz * pdz;
      const minDistSq = Math.min(distSq, predDistSq);

      if (agent.tier === AgentTier.MATERIALIZED) {
        // Dematerialize if beyond hysteresis radius
        if (distSq > this.dematRadiusSq) {
          if (dematerializeThisFrame < this.MAX_DEMATERIALIZE_PER_FRAME) {
            this.dematerialize(agent);
            dematerializeThisFrame++;
            materializedCount--;
          }
        }
      } else {
        // Candidate for materialization
        if (minDistSq < this.matRadiusSq) {
          squadsToMaterialize.add(agent.squadId);
        }

        // Update tier for simulated vs strategic
        if (distSq < this.simRadiusSq) {
          agent.tier = AgentTier.SIMULATED;
        } else {
          agent.tier = AgentTier.STRATEGIC;
        }
      }
    }

    // Second pass: materialize squads (squad-coherent)
    for (const squadId of squadsToMaterialize) {
      if (materializedCount >= this.config.maxMaterialized) break;
      if (materializeThisFrame >= this.MAX_MATERIALIZE_PER_FRAME) break;

      const squad = this.squads.get(squadId);
      if (!squad) continue;

      for (const memberId of squad.members) {
        if (materializedCount >= this.config.maxMaterialized) break;
        if (materializeThisFrame >= this.MAX_MATERIALIZE_PER_FRAME) break;

        const agent = this.agents.get(memberId);
        if (!agent || !agent.alive || agent.tier === AgentTier.MATERIALIZED) continue;

        // Check that this specific agent is within extended squad range
        const dx = agent.x - playerX;
        const dz = agent.z - playerZ;
        const distSq = dx * dx + dz * dz;
        const extendedRadius = this.config.materializationRadius + 100; // squad coherence buffer
        if (distSq > extendedRadius * extendedRadius) continue;

        this.materialize(agent);
        materializeThisFrame++;
        materializedCount++;
      }
    }
  }

  private materialize(agent: StrategicAgent): void {
    try {
      const combatantId = this.combatantSystem.materializeAgent({
        faction: agent.faction,
        x: agent.x,
        y: agent.y,
        z: agent.z,
        health: agent.health,
        squadId: agent.squadId
      });

      agent.tier = AgentTier.MATERIALIZED;
      agent.combatantId = combatantId;
      agent.combatState = 'fighting'; // Full AI takes over
    } catch (e) {
      Logger.warn('materialization', `Failed to materialize agent ${agent.id}: ${e}`);
    }
  }

  private dematerialize(agent: StrategicAgent): void {
    if (!agent.combatantId) {
      agent.tier = AgentTier.SIMULATED;
      return;
    }

    const snapshot = this.combatantSystem.dematerializeAgent(agent.combatantId);
    if (snapshot) {
      agent.x = snapshot.x;
      agent.y = snapshot.y;
      agent.z = snapshot.z;
      agent.health = snapshot.health;
      agent.alive = snapshot.alive;
      agent.combatState = snapshot.alive ? 'idle' : 'dead';
    }

    agent.tier = AgentTier.SIMULATED;
    agent.combatantId = undefined;
  }
}
