// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { Faction } from '../combat/types';

export type AirSupportType = 'spooky' | 'napalm' | 'rocket_run' | 'recon' | 'arclight';

export interface AirSupportRequest {
  type: AirSupportType;
  targetPosition: THREE.Vector3;
  approachDirection?: THREE.Vector3;
  /**
   * Faction that called the strike. Threaded into mission damage so friendly
   * combatants are never hit. Defaults to the player faction (US) when omitted.
   */
  requesterFaction?: Faction;
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
  /** Faction that called the strike (for friend-or-foe damage filtering). */
  requesterFaction?: Faction;
  /** Mission-specific state (orbit angle, rockets fired, etc.) */
  missionData: Record<string, number>;
}

interface AirSupportConfig {
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
  // B-52 Arc Light: the top-tier strike. A single high-altitude pass walks a
  // long bomb string across the marked heading. It is the most expensive
  // call-in in the catalog (longest cooldown) and the bomber spawns well above
  // the AA/engagement ceiling — visually small from the ground, audible on the
  // run-in. The `duration` is the active bomb-walk window; the airframe then
  // continues outbound. Faster than the prop strikers but slower than the F-4
  // fast jet, reflecting a heavy-bomber cruise.
  arclight: {
    delay: 20,
    duration: 10,
    cooldown: 300,
    modelKey: 'B52_STRATOFORTRESS',
    altitude: 600,
    speed: 150,
  },
};
