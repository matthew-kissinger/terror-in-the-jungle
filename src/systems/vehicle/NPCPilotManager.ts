import * as THREE from 'three';
import { NPCPilotAI, PilotControls, PilotMission } from './NPCPilotAI';

interface ActivePilot {
  npcId: string;
  vehicleId: string;
  ai: NPCPilotAI;
}

export interface VehicleStateProvider {
  getPosition(vehicleId: string): THREE.Vector3 | null;
  getVelocity(vehicleId: string): THREE.Vector3 | null;
  getQuaternion(vehicleId: string): THREE.Quaternion | null;
  setControls(vehicleId: string, controls: PilotControls): void;
  getTerrainHeight(x: number, z: number): number;
}

export class NPCPilotManager {
  private pilots: Map<string, ActivePilot> = new Map();
  private stateProvider: VehicleStateProvider | null = null;

  setStateProvider(provider: VehicleStateProvider): void {
    this.stateProvider = provider;
  }

  assignPilot(npcId: string, vehicleId: string, mission: PilotMission): void {
    const ai = new NPCPilotAI();
    ai.setMission(mission);
    this.pilots.set(npcId, { npcId, vehicleId, ai });
  }

  removePilot(npcId: string): void {
    this.pilots.delete(npcId);
  }

  getPilotAI(npcId: string): NPCPilotAI | undefined {
    return this.pilots.get(npcId)?.ai;
  }

  getActivePilotCount(): number {
    return this.pilots.size;
  }

  hasPilotForVehicle(vehicleId: string): boolean {
    for (const pilot of this.pilots.values()) {
      if (pilot.vehicleId === vehicleId) return true;
    }
    return false;
  }

  update(dt: number): void {
    if (!this.stateProvider) return;

    for (const pilot of this.pilots.values()) {
      const pos = this.stateProvider.getPosition(pilot.vehicleId);
      const vel = this.stateProvider.getVelocity(pilot.vehicleId);
      const quat = this.stateProvider.getQuaternion(pilot.vehicleId);
      if (!pos || !vel || !quat) continue;

      const terrainHeight = this.stateProvider.getTerrainHeight(pos.x, pos.z);
      const controls = pilot.ai.update(dt, pos, vel, quat, terrainHeight);
      this.stateProvider.setControls(pilot.vehicleId, controls);
    }
  }

  dispose(): void {
    this.pilots.clear();
  }
}
