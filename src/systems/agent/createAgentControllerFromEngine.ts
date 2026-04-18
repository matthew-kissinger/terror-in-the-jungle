/**
 * Factory for an AgentController bound to the live engine.
 * Only loaded in dev / perf-harness builds (see `src/core/bootstrap.ts`).
 */

import type * as THREE from 'three';
import { AgentController } from './AgentController';
import type { AgentControllerDeps, PortCombatant, PortZone, ReadVec3 } from './AgentPlayerPort';
import { Faction } from '../combat/types';

type EngineLike = {
  systemManager: {
    playerController: {
      getPosition(t?: THREE.Vector3): THREE.Vector3;
      getVelocity(t?: THREE.Vector3): THREE.Vector3;
      getYaw(): number;
      getPitch(): number;
      setViewAngles(yaw: number, pitch: number): void;
      applyMovementIntent(intent: { forward: number; strafe: number; sprint: boolean }): void;
      fireStart(): void;
      fireStop(): void;
      reloadWeapon(): void;
      isInHelicopter(): boolean;
      isInFixedWing(): boolean;
      exitHelicopter(pos: THREE.Vector3): void;
      exitFixedWing(pos: THREE.Vector3): void;
    };
    combatantSystem: { getAllCombatants(): ReadonlyArray<unknown> };
    zoneManager?: { getAllZones(): ReadonlyArray<unknown> };
    playerHealthSystem?: {
      isDead(): boolean;
      getHealth?(): number;
      getMaxHealth?(): number;
    };
    firstPersonWeapon?: { getAmmoState?(): { currentMagazine: number; reserveAmmo: number } };
  };
};

export function createAgentControllerFromEngine(engine: EngineLike): AgentController {
  const sys = engine.systemManager;
  const pc = sys.playerController;

  const deps: AgentControllerDeps = {
    player: {
      isPlayerDead: () => Boolean(sys.playerHealthSystem?.isDead?.()),
      getPosition: () => pc.getPosition(),
      getVelocity: () => pc.getVelocity(),
      getYaw: () => pc.getYaw(),
      getPitch: () => pc.getPitch(),
      setViewAngles: (yaw, pitch) => pc.setViewAngles(yaw, pitch),
      applyMovementIntent: (intent) => pc.applyMovementIntent(intent),
      fireStart: () => pc.fireStart(),
      fireStop: () => pc.fireStop(),
      reload: () => pc.reloadWeapon(),
      isInVehicle: () => pc.isInHelicopter() || pc.isInFixedWing(),
      // Nearest-vehicle search is not on the player surface yet; agent ignores.
      tryEnterNearbyVehicle: () => null,
      tryExitVehicle: () => {
        const p = pc.getPosition();
        if (pc.isInHelicopter()) { pc.exitHelicopter(p); return true; }
        if (pc.isInFixedWing()) { pc.exitFixedWing(p); return true; }
        return false;
      },
      getFaction: () => Faction.US,
      getAmmoState: () => {
        const raw = sys.firstPersonWeapon?.getAmmoState?.();
        return {
          magazine: Number(raw?.currentMagazine ?? 0),
          reserve: Number(raw?.reserveAmmo ?? 0),
        };
      },
      getHealth: () => ({
        hp: Number(sys.playerHealthSystem?.getHealth?.() ?? 0),
        maxHp: Number(sys.playerHealthSystem?.getMaxHealth?.() ?? 100),
      }),
      isGrounded: () => true,
      isRunning: () => false,
      isCrouching: () => false,
    },
    combatants: {
      getAllCombatants: () => adaptCombatants(sys.combatantSystem.getAllCombatants()),
      getCombatantById: (id) => {
        const list = sys.combatantSystem.getAllCombatants();
        for (let i = 0; i < list.length; i++) {
          const c = list[i] as { id?: string } | undefined;
          if (c && c.id === id) return adaptOne(c);
        }
        return null;
      },
    },
    zones: {
      getZones: () => adaptZones(sys.zoneManager?.getAllZones() ?? []),
    },
  };

  return new AgentController(deps);
}

function adaptCombatants(raw: ReadonlyArray<unknown>): PortCombatant[] {
  const out: PortCombatant[] = [];
  for (let i = 0; i < raw.length; i++) {
    const adapted = adaptOne(raw[i]);
    if (adapted) out.push(adapted);
  }
  return out;
}

function adaptOne(raw: unknown): PortCombatant | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as {
    id?: string; faction?: Faction; position?: ReadVec3; velocity?: ReadVec3;
    health?: number; maxHealth?: number; state?: string; isDying?: boolean;
  };
  if (!r.id || !r.faction || !r.position) return null;
  return {
    id: r.id,
    faction: r.faction,
    position: { x: r.position.x, y: r.position.y, z: r.position.z },
    velocity: r.velocity ? { x: r.velocity.x, y: r.velocity.y, z: r.velocity.z } : undefined,
    health: Number(r.health ?? 0),
    maxHealth: Number(r.maxHealth ?? 100),
    state: r.state,
    isDying: Boolean(r.isDying),
  };
}

function adaptZones(raw: ReadonlyArray<unknown>): PortZone[] {
  const out: PortZone[] = [];
  for (let i = 0; i < raw.length; i++) {
    const z = raw[i] as {
      id?: string; isHomeBase?: boolean; owner?: Faction | null; state?: string;
      position?: ReadVec3; radius?: number; captureProgress?: number;
    } | undefined;
    if (!z || !z.id || !z.position) continue;
    const owner: Faction | 'contested' | 'neutral' = z.state === 'contested'
      ? 'contested'
      : (z.owner ?? 'neutral');
    out.push({
      id: z.id,
      isHomeBase: Boolean(z.isHomeBase),
      owner,
      position: { x: z.position.x, y: z.position.y, z: z.position.z },
      radius: Number(z.radius ?? 0),
      captureProgress: Number(z.captureProgress ?? 0),
    });
  }
  return out;
}
