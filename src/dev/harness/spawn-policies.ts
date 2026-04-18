/**
 * Spawn policies — decide *where* to put the player at scenario start.
 *
 * Kept side-effect-free: `resolveSpawnPoint` returns a target position. The
 * runner is responsible for teleporting the player there (engine-dependent
 * call site). Test doubles supply a scripted world state without a live
 * engine.
 */

import type { Faction } from '../../systems/combat/types';
import { getAlliance, isBlufor, isOpfor } from '../../systems/combat/types';
import type { SpawnPolicyConfig } from './types';
import type { Vec3 } from '../../systems/agent/AgentTypes';

export interface WorldHostileQuery {
  /** Current player position; used as fallback for `at-spawn-point`. */
  getPlayerPosition(): Vec3;
  /** Returns positions of combatants with the requested faction predicate. */
  findCombatants(predicate: (f: Faction) => boolean): Vec3[];
}

export interface SpawnResolution {
  position: Vec3;
  source: string;
  /** Optional facing in radians. */
  yawRad?: number;
}

export function resolveSpawnPoint(
  cfg: SpawnPolicyConfig,
  world: WorldHostileQuery,
  rng: () => number,
): SpawnResolution {
  switch (cfg.kind) {
    case 'at-spawn-point': {
      return { position: world.getPlayerPosition(), source: 'at-spawn-point' };
    }
    case 'coords': {
      return { position: cfg.position, source: 'coords', yawRad: cfg.yawRad };
    }
    case 'within-engagement-range': {
      const predicate: (f: Faction) => boolean = cfg.targetFaction === 'opfor'
        ? isOpfor
        : cfg.targetFaction === 'blufor'
          ? isBlufor
          : (f: Faction) => f === cfg.targetFaction;
      // Also rule out allied targets if a concrete faction was given:
      const allianceFilter: (f: Faction) => boolean = typeof cfg.targetFaction === 'string'
        && (cfg.targetFaction === 'opfor' || cfg.targetFaction === 'blufor')
        ? predicate
        : (f: Faction) => getAlliance(f) === getAlliance(cfg.targetFaction as Faction);
      const hostiles = world.findCombatants(allianceFilter);
      if (hostiles.length === 0) {
        return { position: world.getPlayerPosition(), source: 'within-engagement-range:fallback-player-pos' };
      }
      // Pick a hostile deterministically via the seeded RNG.
      const pick = hostiles[Math.floor(rng() * hostiles.length) % hostiles.length];
      // Place the player on a bearing from the hostile, at a distance in
      // [minDistM, maxDistM]. Seeded angle ensures reproducibility.
      const angle = rng() * Math.PI * 2;
      const dist = cfg.minDistM + rng() * Math.max(0, cfg.maxDistM - cfg.minDistM);
      const x = pick.x + Math.cos(angle) * dist;
      const z = pick.z + Math.sin(angle) * dist;
      const dx = pick.x - x;
      const dz = pick.z - z;
      const yaw = Math.atan2(dx, dz);
      return {
        position: { x, y: pick.y, z },
        source: `within-engagement-range:faction=${String(cfg.targetFaction)}:dist=${dist.toFixed(1)}`,
        yawRad: yaw,
      };
    }
    default: {
      const _exhaustive: never = cfg;
      throw new Error(`Unknown spawn policy: ${String((_exhaustive as { kind?: string }).kind)}`);
    }
  }
}
