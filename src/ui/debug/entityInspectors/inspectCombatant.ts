import type { Combatant } from '../../../systems/combat/types';

export interface CombatantSource {
  getAllCombatants(): Combatant[];
}

/**
 * Read-only snapshot of a combatant for the inspector panel. No new
 * accessors on CombatantSystem — `getAllCombatants()` already exists and
 * every field below is part of the public Combatant interface. Returns
 * `null` if the combatant has despawned.
 */
export function inspectCombatant(source: CombatantSource, id: string): Record<string, unknown> | null {
  const c = source.getAllCombatants().find(x => x.id === id);
  if (!c) return null;
  const targetId = c.target && 'id' in c.target ? (c.target as { id: string }).id : null;
  return {
    id: c.id,
    faction: c.faction,
    state: c.state,
    previousState: c.previousState ?? null,
    health: `${c.health.toFixed(0)} / ${c.maxHealth}`,
    position: vec3(c.position),
    velocity: vec3(c.velocity),
    speed: c.velocity.length().toFixed(2),
    squad: { id: c.squadId ?? null, role: c.squadRole ?? null },
    target: targetId,
    lastKnownTargetPos: c.lastKnownTargetPos ? vec3(c.lastKnownTargetPos) : null,
    suppression: c.suppressionLevel.toFixed(2),
    panic: c.panicLevel.toFixed(2),
    alertTimer: c.alertTimer.toFixed(2),
    lod: c.simLane,
    inCover: c.inCover === true,
    kills: c.kills ?? 0,
    deaths: c.deaths ?? 0,
    weapon: c.weaponSpec?.name ?? null,
    movementIntent: c.movementIntent ?? null,
    vehicleId: c.vehicleId ?? null,
    isDying: c.isDying === true,
  };
}

function vec3(v: { x: number; y: number; z: number }): string {
  return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
}
