import * as THREE from 'three';
import { Combatant, CombatantState } from './types';
import { CombatantFactory } from './CombatantFactory';
import { SquadManager } from './SquadManager';
import { SpatialOctree } from './SpatialOctree';
import { ZoneManager } from '../world/ZoneManager';

/**
 * Update loop helper methods for CombatantSystem
 * Extracted from CombatantSystem for better organization
 */
export class CombatantSystemUpdate {
  private readonly SQUAD_OBJECTIVE_REASSIGN_INTERVAL = 10; // seconds
  private squadObjectiveTimer = 0;

  constructor(
    private combatants: Map<string, Combatant>,
    private playerProxyId: string,
    private playerPosition: THREE.Vector3,
    private combatantFactory: CombatantFactory,
    private squadManager: SquadManager,
    private spatialGrid: SpatialOctree,
    private zoneManager?: ZoneManager
  ) {}

  /**
   * Update squad objective timer and reassign objectives if needed
   */
  updateSquadObjectives(deltaTime: number): void {
    if (!this.zoneManager) return;

    this.squadObjectiveTimer += deltaTime;
    if (this.squadObjectiveTimer < this.SQUAD_OBJECTIVE_REASSIGN_INTERVAL) {
      return;
    }

    this.squadObjectiveTimer = 0;

    const zones = this.zoneManager.getAllZones();
    const squads = this.squadManager.getAllSquads();

    squads.forEach(squad => {
      // Skip player-controlled squads
      if (squad.isPlayerControlled) return;

      // Get squad leader position
      let leaderPos: THREE.Vector3 | null = null;
      if (squad.leaderId) {
        const leader = this.combatants.get(squad.leaderId);
        if (leader) {
          leaderPos = leader.position.clone();
        }
      }

      // Fallback to first member if no leader
      if (!leaderPos && squad.members.length > 0) {
        const firstMember = this.combatants.get(squad.members[0]);
        if (firstMember) {
          leaderPos = firstMember.position.clone();
        }
      }

      if (!leaderPos) return;

      // Use influence map to assign best objective
      this.squadManager.assignSquadObjective(squad, leaderPos, zones);
    });
  }

  /**
   * Ensure player proxy exists in combatants map
   */
  ensurePlayerProxy(): void {
    let proxy = this.combatants.get(this.playerProxyId);
    if (!proxy) {
      proxy = this.combatantFactory.createPlayerProxy(this.playerPosition);
      this.combatants.set(this.playerProxyId, proxy);
      this.spatialGrid.updatePosition(this.playerProxyId, this.playerPosition);
    } else {
      proxy.position.copy(this.playerPosition);
      proxy.state = CombatantState.ENGAGING;
      this.spatialGrid.updatePosition(this.playerProxyId, this.playerPosition);
    }
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }
}
