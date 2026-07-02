// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantSystemDamage, PLAYER_SELF_EXPLOSION_SCALE } from './CombatantSystemDamage';
import { CombatantState, Faction } from './types';
import type { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { createTestCombatant } from '../../test-utils';
import { KillAssistTracker } from './KillAssistTracker';
import type { SquadManager } from './SquadManager';
import type { CombatantSpawnManager } from './CombatantSpawnManager';
import type { TicketSystem } from '../world/TicketSystem';
import { GameEventBus } from '../../core/GameEventBus';
import { Tank } from '../vehicle/Tank';
import { GroundVehicle } from '../vehicle/GroundVehicle';
import type { IVehicle } from '../vehicle/IVehicle';
import { spatialGridManager } from './SpatialGridManager';

vi.mock('./KillAssistTracker', () => ({
  KillAssistTracker: {
    trackDamage: vi.fn(),
    processKillAssists: vi.fn(() => new Set<string>()),
  },
}));

vi.mock('./SpatialGridManager', () => ({
  spatialGridManager: {
    getIsInitialized: vi.fn(() => true),
    queryRadius: vi.fn(() => [] as string[]),
    removeEntity: vi.fn(),
    syncEntity: vi.fn(),
  },
}));

describe('CombatantSystemDamage', () => {
  let combatants: Map<string, ReturnType<typeof createTestCombatant>>;
  let damage: CombatantSystemDamage;

  beforeEach(() => {
    clearWorldBuilderState();
    // Drain any cross-test event-bus residue so subscribers in this file
    // do not see emissions queued by prior tests / files.
    GameEventBus.flush();
    GameEventBus.clear();
    combatants = new Map();
    damage = new CombatantSystemDamage(
      combatants,
      { getSquad: vi.fn(), getAllSquads: () => new Map(), removeSquadMember: vi.fn() } as unknown as SquadManager,
      { queueRespawn: vi.fn() } as unknown as CombatantSpawnManager,
    );
    vi.clearAllMocks();
    // The explosion route now resolves candidates through the spatial grid.
    // Return every live combatant id so the in-function distance test still
    // performs the exact radius filtering these scenarios depend on.
    (spatialGridManager.queryRadius as unknown as vi.Mock).mockImplementation(
      () => Array.from(combatants.keys()),
    );
  });

  afterEach(() => {
    clearWorldBuilderState();
    GameEventBus.flush();
    GameEventBus.clear();
  });

  it('keeps player-authored explosion damage scaled by distance by default', () => {
    const target = createTestCombatant({
      id: 'target-1',
      faction: Faction.NVA,
      health: 100,
      position: new THREE.Vector3(5, 0, 0),
    });
    combatants.set(target.id, target);

    damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

    expect(target.health).toBeCloseTo(80);
    expect(target.state).not.toBe(CombatantState.DEAD);
  });

  describe('player explosion hit/kill feedback', () => {
    function makeHud() {
      return {
        showHitMarker: vi.fn(),
        spawnDamageNumber: vi.fn(),
        addKillToFeed: vi.fn(),
        addKill: vi.fn(),
      };
    }
    function addEnemy(id: string, health: number, x: number) {
      const e = createTestCombatant({ id, faction: Faction.NVA, health, position: new THREE.Vector3(x, 0, 0) });
      combatants.set(id, e);
      return e;
    }

    it('shows a hit marker + damage number when a player explosion wounds an enemy', () => {
      const hud = makeHud();
      damage.setHUDSystem(hud as never);
      const enemy = addEnemy('e1', 100, 2);

      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

      expect(enemy.state).not.toBe(CombatantState.DEAD);
      expect(hud.showHitMarker).toHaveBeenCalledWith('hit');
      expect(hud.spawnDamageNumber).toHaveBeenCalledTimes(1);
      const [, , isHeadshot, isKill] = hud.spawnDamageNumber.mock.calls[0];
      expect(isHeadshot).toBe(false);
      expect(isKill).toBe(false);
    });

    it('credits the kill (count/streak/marker via addKill) + a kill damage number', () => {
      const hud = makeHud();
      damage.setHUDSystem(hud as never);
      const enemy = addEnemy('e1', 10, 0.5);

      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 200, 'PLAYER');

      expect(enemy.state).toBe(CombatantState.DEAD);
      // Kills route through the canonical player-kill entry point, which credits
      // the kill counter + streak and shows the kill marker — same as a rifle.
      expect(hud.addKill).toHaveBeenCalledTimes(1);
      expect(hud.addKill).toHaveBeenCalledWith(false);
      const isKill = hud.spawnDamageNumber.mock.calls[0][3];
      expect(isKill).toBe(true);
    });

    it('credits one addKill per enemy killed by a single blast (multikill)', () => {
      const hud = makeHud();
      damage.setHUDSystem(hud as never);
      addEnemy('e1', 10, 0.5);
      addEnemy('e2', 10, 0.6);
      addEnemy('e3', 10, 0.7);

      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 200, 'PLAYER');

      expect(hud.addKill).toHaveBeenCalledTimes(3);
    });

    it("credits the grenade-kill sub-stat when the kill's weaponType is 'grenade' (default)", () => {
      const hud = makeHud();
      damage.setHUDSystem(hud as never);
      const statsTracker = { addGrenadeKill: vi.fn() };
      damage.setPlayerStatsTracker(statsTracker as never);
      addEnemy('e1', 10, 0.5);

      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 200, 'PLAYER');

      expect(statsTracker.addGrenadeKill).toHaveBeenCalledTimes(1);
    });

    it('does not credit the grenade-kill sub-stat for non-grenade explosive kills (mortar, air support)', () => {
      const hud = makeHud();
      damage.setHUDSystem(hud as never);
      const statsTracker = { addGrenadeKill: vi.fn() };
      damage.setPlayerStatsTracker(statsTracker as never);
      addEnemy('e1', 10, 0.5);

      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 200, 'PLAYER', 'mortar');

      expect(hud.addKill).toHaveBeenCalledTimes(1);
      expect(statsTracker.addGrenadeKill).not.toHaveBeenCalled();
    });

    it('shows no player feedback for an explosion the player did not cause', () => {
      const hud = makeHud();
      damage.setHUDSystem(hud as never);
      addEnemy('e1', 100, 2);

      // NPC-attributed (mortar / tank cannon) — no 'PLAYER' attacker id.
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, undefined, 'mortar');

      expect(hud.showHitMarker).not.toHaveBeenCalled();
      expect(hud.spawnDamageNumber).not.toHaveBeenCalled();
    });

    it('gives no enemy feedback when a player explosion only catches friendlies', () => {
      const hud = makeHud();
      damage.setHUDSystem(hud as never);
      const friendly = createTestCombatant({ id: 'f1', faction: Faction.US, health: 100, position: new THREE.Vector3(2, 0, 0) });
      combatants.set(friendly.id, friendly);

      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

      expect(friendly.health).toBeLessThan(100); // bare grenades still hurt friendlies
      expect(hud.showHitMarker).not.toHaveBeenCalled(); // but no enemy marker
    });

    it('rate-limits rapid non-kill hit markers yet never suppresses a kill credit', () => {
      const hud = makeHud();
      damage.setHUDSystem(hud as never);
      const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);

      addEnemy('e1', 100, 2);
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');
      expect(hud.showHitMarker).toHaveBeenCalledTimes(1); // first non-kill hit shows

      addEnemy('e2', 100, 2);
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');
      expect(hud.showHitMarker).toHaveBeenCalledTimes(1); // within cooldown: suppressed

      addEnemy('e3', 5, 0.5); // dies this blast (kill path, not the 'hit' marker path)
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 200, 'PLAYER');
      expect(hud.addKill).toHaveBeenCalled(); // kill credited despite the cooldown
      expect(hud.showHitMarker).toHaveBeenCalledTimes(1); // kills don't emit a 'hit' marker

      nowSpy.mockRestore();
    });
  });

  it('ignores conservative spatial-grid combatant candidates outside the explosion radius', () => {
    const target = createTestCombatant({
      id: 'target-outside-radius',
      faction: Faction.NVA,
      health: 100,
      position: new THREE.Vector3(10.1, 0, 0),
    });
    combatants.set(target.id, target);

    damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

    expect(target.health).toBe(100);
    expect(target.state).not.toBe(CombatantState.DEAD);
    expect(KillAssistTracker.trackDamage).not.toHaveBeenCalled();
  });

  it('lets the WorldBuilder one-shot flag make player-authored explosions lethal', () => {
    publishWorldBuilderState(true);

    const target = createTestCombatant({
      id: 'target-1',
      faction: Faction.NVA,
      health: 100,
      position: new THREE.Vector3(5, 0, 0),
    });
    combatants.set(target.id, target);

    damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

    expect(target.health).toBeLessThanOrEqual(0);
    expect(target.state).toBe(CombatantState.DEAD);
    expect(KillAssistTracker.trackDamage).toHaveBeenCalledWith(target, 'PLAYER', 100);
  });

  it('does not apply the WorldBuilder one-shot flag to non-player explosions', () => {
    publishWorldBuilderState(true);

    const target = createTestCombatant({
      id: 'target-1',
      faction: Faction.NVA,
      health: 100,
      position: new THREE.Vector3(5, 0, 0),
    });
    combatants.set(target.id, target);

    damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, undefined, 'napalm');

    expect(target.health).toBeCloseTo(80);
    expect(target.state).not.toBe(CombatantState.DEAD);
  });

  describe('kill attribution on tank-cannon lethal impact', () => {
    it('debits tickets via TicketSystem.onCombatantDeath when an NPC tank cannon kills a combatant', () => {
      const onCombatantDeath = vi.fn();
      const ticketSystem = { onCombatantDeath } as unknown as TicketSystem;
      damage.setTicketSystem(ticketSystem);

      const shooter = createTestCombatant({
        id: 'shooter-1',
        faction: Faction.US,
        position: new THREE.Vector3(50, 0, 0),
      });
      combatants.set(shooter.id, shooter);

      const victim = createTestCombatant({
        id: 'victim-1',
        faction: Faction.NVA,
        health: 50, // low enough that the 200-damage profile kills outright
        position: new THREE.Vector3(0, 0, 0),
      });
      combatants.set(victim.id, victim);

      // Tank cannon profile from resolveTankAmmoDamage('AP'): radius 9, maxDamage 200.
      damage.applyExplosionDamage(
        new THREE.Vector3(0, 0, 0),
        9,
        200,
        shooter.id,
        'tank_cannon',
        Faction.US,
      );

      expect(victim.state).toBe(CombatantState.DEAD);
      expect(onCombatantDeath).toHaveBeenCalledTimes(1);
      expect(onCombatantDeath).toHaveBeenCalledWith(Faction.NVA);
    });

    it("emits 'npc_killed' on the GameEventBus when a tank cannon kills a combatant", () => {
      const events: Array<{ killerId: string; victimId: string; killerFaction: Faction; victimFaction: Faction; weaponType?: string }> = [];
      const unsubscribe = GameEventBus.subscribe('npc_killed', (e) => {
        events.push({
          killerId: e.killerId,
          victimId: e.victimId,
          killerFaction: e.killerFaction,
          victimFaction: e.victimFaction,
          weaponType: e.weaponType,
        });
      });

      try {
        const shooter = createTestCombatant({
          id: 'shooter-2',
          faction: Faction.US,
          position: new THREE.Vector3(50, 0, 0),
        });
        combatants.set(shooter.id, shooter);

        const victim = createTestCombatant({
          id: 'victim-2',
          faction: Faction.NVA,
          health: 50,
          position: new THREE.Vector3(0, 0, 0),
        });
        combatants.set(victim.id, victim);

        damage.applyExplosionDamage(
          new THREE.Vector3(0, 0, 0),
          9,
          200,
          shooter.id,
          'tank_cannon',
          Faction.US,
        );

        // Flush queued bus events so the subscriber sees them.
        GameEventBus.flush();

        expect(victim.state).toBe(CombatantState.DEAD);
        expect(events).toHaveLength(1);
        expect(events[0].victimId).toBe('victim-2');
        expect(events[0].victimFaction).toBe(Faction.NVA);
        expect(events[0].killerId).toBe('shooter-2');
        expect(events[0].killerFaction).toBe(Faction.US);
        expect(events[0].weaponType).toBe('tank_cannon');
      } finally {
        unsubscribe();
      }
    });

    it("does not emit 'npc_killed' when the player kills via explosion (PLAYER attribution path)", () => {
      // Player kills emit 'player_kill' separately; subscribers to
      // 'npc_killed' should not double-count player explosions.
      const events: unknown[] = [];
      const unsubscribe = GameEventBus.subscribe('npc_killed', (e) => events.push(e));

      try {
        const victim = createTestCombatant({
          id: 'victim-3',
          faction: Faction.NVA,
          health: 10,
          position: new THREE.Vector3(0, 0, 0),
        });
        combatants.set(victim.id, victim);

        damage.applyExplosionDamage(
          new THREE.Vector3(0, 0, 0),
          5,
          100,
          'PLAYER',
          'grenade',
        );

        GameEventBus.flush();

        expect(victim.state).toBe(CombatantState.DEAD);
        expect(events).toHaveLength(0);
      } finally {
        unsubscribe();
      }
    });
  });

  describe('player explosion damage (owner decision F1: full symmetry)', () => {
    // Minimal PlayerHealthSystem double: records applied damage and reports
    // death when cumulative damage crosses the health pool. Spawn protection is
    // modeled as swallowing the hit entirely (returns false, no damage), which
    // is the real system's behavior.
    function makePlayerHealth(opts: { health?: number; spawnProtected?: boolean } = {}) {
      let health = opts.health ?? 150;
      const takeDamage = vi.fn((amount: number) => {
        if (opts.spawnProtected) return false;
        health -= amount;
        return health <= 0;
      });
      return {
        health: () => health,
        system: { takeDamage } as unknown as PlayerHealthSystem,
        takeDamage,
      };
    }

    function wirePlayer(health: ReturnType<typeof makePlayerHealth>, position: THREE.Vector3) {
      damage.setPlayerFaction(Faction.US);
      damage.setPlayerHealthSystem(health.system);
      damage.setPlayerPositionSource(() => position);
    }

    it("scales the player's own frag by 0.75 with distance falloff", () => {
      const health = makePlayerHealth();
      wirePlayer(health, new THREE.Vector3(5, 0, 0)); // half-radius from a radius-10 blast
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

      // NPC-equivalent at the same spot: 40 * (1 - 5/10) = 20. Own scale 0.75 → 15.
      expect(health.takeDamage).toHaveBeenCalledTimes(1);
      expect(health.takeDamage.mock.calls[0][0]).toBeCloseTo(20 * PLAYER_SELF_EXPLOSION_SCALE, 5);
    });

    it('applies enemy ordnance at full 1.0x (no self-scale)', () => {
      const health = makePlayerHealth();
      wirePlayer(health, new THREE.Vector3(5, 0, 0));
      // NPC mortar: enemy faction shooter, no PLAYER attribution.
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'nva-mortar-1', 'mortar', Faction.NVA);

      expect(health.takeDamage).toHaveBeenCalledTimes(1);
      expect(health.takeDamage.mock.calls[0][0]).toBeCloseTo(20, 5); // full, unscaled
    });

    it('applies an enemy tank shell to the player at full 1.0x', () => {
      const health = makePlayerHealth();
      wirePlayer(health, new THREE.Vector3(0, 0, 0)); // dead center
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 9, 200, 'nva-tank-1', 'tank_cannon', Faction.NVA);

      expect(health.takeDamage).toHaveBeenCalledTimes(1);
      expect(health.takeDamage.mock.calls[0][0]).toBeCloseTo(200, 5);
    });

    it('does no damage to a player outside the blast radius', () => {
      const health = makePlayerHealth();
      wirePlayer(health, new THREE.Vector3(11, 0, 0)); // beyond radius 10
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

      expect(health.takeDamage).not.toHaveBeenCalled();
    });

    it('spares the player from allied ordnance (friendly-fire exclusion)', () => {
      const health = makePlayerHealth();
      wirePlayer(health, new THREE.Vector3(0, 0, 0));
      // Allied faction shell (ARVN is BLUFOR with the US player).
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 9, 200, 'arvn-tank-1', 'tank_cannon', Faction.ARVN);

      expect(health.takeDamage).not.toHaveBeenCalled();
    });

    it('respects spawn protection (takeDamage swallows the hit)', () => {
      const health = makePlayerHealth({ spawnProtected: true });
      wirePlayer(health, new THREE.Vector3(0, 0, 0));
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 200, 'PLAYER');

      // The blast still routes through takeDamage (that is where protection
      // lives) but the player takes no health loss and does not die.
      expect(health.takeDamage).toHaveBeenCalledTimes(1);
      expect(health.health()).toBe(150);
    });

    it("emits 'player_killed' with source attribution when a blast is lethal", () => {
      const events: Array<{ killerId: string; killerFaction: Faction }> = [];
      const unsubscribe = GameEventBus.subscribe('player_killed', (e) => {
        events.push({ killerId: e.killerId, killerFaction: e.killerFaction });
      });
      try {
        const health = makePlayerHealth({ health: 50 });
        wirePlayer(health, new THREE.Vector3(0, 0, 0));
        // Point-blank enemy tank shell — well over 50 HP.
        damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 9, 200, 'nva-tank-1', 'tank_cannon', Faction.NVA);
        GameEventBus.flush();

        expect(events).toHaveLength(1);
        expect(events[0].killerId).toBe('nva-tank-1');
        expect(events[0].killerFaction).toBe(Faction.NVA);
      } finally {
        unsubscribe();
      }
    });

    it("emits 'player_killed' for a lethal danger-close OWN Arclight", () => {
      const events: Array<{ killerId: string; killerFaction: Faction }> = [];
      const unsubscribe = GameEventBus.subscribe('player_killed', (e) => {
        events.push({ killerId: e.killerId, killerFaction: e.killerFaction });
      });
      try {
        const health = makePlayerHealth({ health: 50 });
        wirePlayer(health, new THREE.Vector3(0, 0, 0));
        // Player-called strike at own feet: 200 * 0.75 = 150 > 50 HP.
        damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 30, 200, 'PLAYER', 'arclight');
        GameEventBus.flush();

        expect(events).toHaveLength(1);
        expect(events[0].killerId).toBe('PLAYER');
        expect(events[0].killerFaction).toBe(Faction.US); // player's own faction
      } finally {
        unsubscribe();
      }
    });

    it('does no player damage for a no-damage blast (e.g. smoke deploy semantics)', () => {
      // Smoke grenades never call applyExplosionDamage (GrenadeEffects.explodeSmoke
      // spawns a cloud with no damage). At the damage-handler layer the equivalent
      // no-damage contract is a zero maxDamage blast: the player is untouched.
      const health = makePlayerHealth();
      wirePlayer(health, new THREE.Vector3(0, 0, 0));
      damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 0, 'PLAYER', 'smoke');

      expect(health.takeDamage).not.toHaveBeenCalled();
    });

    it('does not touch the player when no health system is wired', () => {
      // Explosion still processes NPCs/vehicles; player coupling is inert.
      const target = createTestCombatant({ id: 'n1', faction: Faction.NVA, health: 100, position: new THREE.Vector3(2, 0, 0) });
      combatants.set(target.id, target);
      damage.setPlayerPositionSource(() => new THREE.Vector3(0, 0, 0));

      expect(() => damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER')).not.toThrow();
      expect(target.health).toBeLessThan(100); // NPC damage still applies
    });
  });

  describe('vehicle damage routing', () => {
    it('applies radial explosion damage to enemy tanks through the injected vehicle query', () => {
      const enemyTank = new Tank('nva_tank', positionedObject(new THREE.Vector3(0, 0, 0)), Faction.NVA);
      damage.setVehicleDamageQuery({
        getVehiclesInRadius: vi.fn(() => [enemyTank]),
      });

      damage.applyExplosionDamage(
        new THREE.Vector3(0, 0, 0),
        9,
        200,
        'shooter-vehicle',
        'tank_cannon',
        Faction.US,
      );

      expect(enemyTank.getHealthPercent()).toBeCloseTo(0.8, 5);
      expect(enemyTank.getHpBand()).toBe('healthy');
    });

    it('skips allied tanks when shooter faction is supplied', () => {
      const friendlyTank = new Tank('us_tank', positionedObject(new THREE.Vector3(0, 0, 0)), Faction.US);
      damage.setVehicleDamageQuery({
        getVehiclesInRadius: vi.fn(() => [friendlyTank]),
      });

      damage.applyExplosionDamage(
        new THREE.Vector3(0, 0, 0),
        9,
        200,
        'shooter-vehicle',
        'tank_cannon',
        Faction.US,
      );

      expect(friendlyTank.getHealthPercent()).toBe(1);
    });

    it('applies radial explosion damage to enemy M151 vehicles through the same route', () => {
      const jeep = new GroundVehicle('nva_m151', positionedObject(new THREE.Vector3(0, 0, 0)), Faction.NVA);
      damage.setVehicleDamageQuery({
        getVehiclesInRadius: vi.fn(() => [jeep]),
      });

      damage.applyExplosionDamage(
        new THREE.Vector3(0, 0, 0),
        9,
        125,
        'shooter-vehicle',
        'tank_cannon',
        Faction.US,
      );

      expect(jeep.getHealthPercent()).toBeCloseTo(0.5, 5);
      expect(jeep.isDestroyed()).toBe(false);
    });

    it('uses the allocation-free vehicle radius iterator when available', () => {
      const jeep = new GroundVehicle('nva_m151', positionedObject(new THREE.Vector3(0, 0, 0)), Faction.NVA);
      const getVehiclesInRadius = vi.fn(() => {
        throw new Error('fallback vehicle radius array should not be materialized');
      });
      const forEachVehicleInRadius = vi.fn((
        _center: THREE.Vector3,
        _radius: number,
        visitor: (vehicle: IVehicle) => void,
      ) => {
        visitor(jeep);
      });
      damage.setVehicleDamageQuery({
        getVehiclesInRadius,
        forEachVehicleInRadius,
      });

      damage.applyExplosionDamage(
        new THREE.Vector3(0, 0, 0),
        9,
        125,
        'shooter-vehicle',
        'tank_cannon',
        Faction.US,
      );

      expect(forEachVehicleInRadius).toHaveBeenCalledTimes(1);
      expect(getVehiclesInRadius).not.toHaveBeenCalled();
      expect(jeep.getHealthPercent()).toBeCloseTo(0.5, 5);
      expect(jeep.isDestroyed()).toBe(false);
    });

    it('ignores conservative vehicle-query candidates outside the explosion radius', () => {
      const jeep = new GroundVehicle('nva_m151', positionedObject(new THREE.Vector3(9.1, 0, 0)), Faction.NVA);
      damage.setVehicleDamageQuery({
        getVehiclesInRadius: vi.fn(() => [jeep]),
      });

      damage.applyExplosionDamage(
        new THREE.Vector3(0, 0, 0),
        9,
        125,
        'shooter-vehicle',
        'tank_cannon',
        Faction.US,
      );

      expect(jeep.getHealthPercent()).toBe(1);
      expect(jeep.isDestroyed()).toBe(false);
    });

    it('skips allied non-tank vehicles when shooter faction is supplied', () => {
      const friendlyJeep = new GroundVehicle('us_m151', positionedObject(new THREE.Vector3(0, 0, 0)), Faction.US);
      damage.setVehicleDamageQuery({
        getVehiclesInRadius: vi.fn(() => [friendlyJeep]),
      });

      damage.applyExplosionDamage(
        new THREE.Vector3(0, 0, 0),
        9,
        125,
        'shooter-vehicle',
        'tank_cannon',
        Faction.US,
      );

      expect(friendlyJeep.getHealthPercent()).toBe(1);
    });
  });
});

type WorldBuilderTestWindow = { __worldBuilder?: unknown };
type WorldBuilderTestGlobal = typeof globalThis & { window?: WorldBuilderTestWindow };

function clearWorldBuilderState(): void {
  delete (globalThis as WorldBuilderTestGlobal).window?.__worldBuilder;
}

function publishWorldBuilderState(oneShotKills: boolean): void {
  const global = globalThis as WorldBuilderTestGlobal;
  global.window = global.window ?? {};
  global.window.__worldBuilder = {
    invulnerable: false,
    infiniteAmmo: false,
    noClip: false,
    oneShotKills,
    shadowsEnabled: true,
    postProcessEnabled: true,
    hudVisible: true,
    ambientAudioEnabled: true,
    npcTickPaused: false,
    forceTimeOfDay: -1,
    active: true,
  };
}

function positionedObject(position: THREE.Vector3): THREE.Object3D {
  const object = new THREE.Object3D();
  object.position.copy(position);
  return object;
}
