import * as THREE from 'three';

export type AirSupportType = 'spooky' | 'napalm' | 'rocket_run' | 'recon';

export interface AirSupportRequest {
  type: AirSupportType;
  targetPosition: THREE.Vector3;
  approachDirection?: THREE.Vector3;
}

export interface AirSupportMission {
  id: string;
  type: AirSupportType;
  aircraft: THREE.Group;
  state: 'inbound' | 'active' | 'outbound';
  elapsed: number;
  duration: number;
  targetPosition: THREE.Vector3;
  approachDirection: THREE.Vector3;
  /** Mission-specific state (orbit angle, rockets fired, etc.) */
  missionData: Record<string, number>;
}

export interface AirSupportConfig {
  /** Seconds before aircraft arrives after request */
  delay: number;
  /** Seconds the mission is active */
  duration: number;
  /** Cooldown in seconds after mission ends */
  cooldown: number;
  /** Key into AircraftModels for the GLB path */
  modelKey: string;
  /** Cruise altitude in meters above terrain */
  altitude: number;
  /** Aircraft speed in m/s */
  speed: number;
}

export const AIR_SUPPORT_CONFIGS: Record<AirSupportType, AirSupportConfig> = {
  spooky: {
    delay: 10,
    duration: 90,
    cooldown: 180,
    modelKey: 'AC47_SPOOKY',
    altitude: 300,
    speed: 40,
  },
  napalm: {
    delay: 15,
    duration: 8,
    cooldown: 90,
    modelKey: 'F4_PHANTOM',
    altitude: 100,
    speed: 120,
  },
  rocket_run: {
    delay: 10,
    duration: 6,
    cooldown: 60,
    modelKey: 'AH1_COBRA',
    altitude: 80,
    speed: 60,
  },
  recon: {
    delay: 8,
    duration: 30,
    cooldown: 45,
    modelKey: 'A1_SKYRAIDER',
    altitude: 200,
    speed: 50,
  },
};
