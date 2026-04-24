import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { SquadDeployFromHelicopter, type SquadDeployTerrainQuery } from './SquadDeployFromHelicopter';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';

function createMockTerrain(fixedHeight = 10): SquadDeployTerrainQuery {
  return {
    getHeightAt: vi.fn().mockReturnValue(fixedHeight),
  };
}

function makeSnapshot(overrides: Partial<{
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  groundHeight: number;
}> = {}) {
  return {
    position: overrides.position ?? new THREE.Vector3(100, 20, 100),
    velocity: overrides.velocity ?? new THREE.Vector3(0, 0, 0),
    groundHeight: overrides.groundHeight ?? 10,
  };
}

describe('SquadDeployFromHelicopter', () => {
  let deploy: SquadDeployFromHelicopter;
  let terrain: SquadDeployTerrainQuery;

  beforeEach(() => {
    terrain = createMockTerrain(10);
    deploy = new SquadDeployFromHelicopter(terrain);
  });

  describe('canDeploy', () => {
    it('returns true when altitude and speed are within limits', () => {
      // altitude = 20 - 10 = 10m (below 15m limit), speed = 0
      const result = deploy.canDeploy('heli_1', makeSnapshot());
      expect(result.canDeploy).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns false with reason when altitude is too high', () => {
      const result = deploy.canDeploy('heli_1', makeSnapshot({
        position: new THREE.Vector3(100, 50, 100),
        groundHeight: 10, // altitude = 40m
      }));
      expect(result.canDeploy).toBe(false);
      expect(result.reason).toContain('Too high');
    });

    it('returns false with reason when speed is too fast', () => {
      const result = deploy.canDeploy('heli_1', makeSnapshot({
        velocity: new THREE.Vector3(10, 0, 0), // 10 m/s > 5 m/s limit
      }));
      expect(result.canDeploy).toBe(false);
      expect(result.reason).toContain('Too fast');
    });

    it('returns false during cooldown', () => {
      const now = 1000000;
      // Trigger a successful deploy to start the cooldown
      deploy.deploySquad('heli_1', makeSnapshot(), 4, now);

      // Immediately check again
      const result = deploy.canDeploy('heli_1', makeSnapshot(), now + 1000);
      expect(result.canDeploy).toBe(false);
      expect(result.reason).toContain('cooldown');
    });

    it('returns true after cooldown expires', () => {
      const now = 1000000;
      deploy.deploySquad('heli_1', makeSnapshot(), 4, now);

      // Check after 30s cooldown
      const result = deploy.canDeploy('heli_1', makeSnapshot(), now + 31000);
      expect(result.canDeploy).toBe(true);
    });

    it('cooldown check takes priority over other checks', () => {
      const now = 1000000;
      deploy.deploySquad('heli_1', makeSnapshot(), 4, now);

      // Even at valid altitude/speed, cooldown should block
      const result = deploy.canDeploy('heli_1', makeSnapshot(), now + 5000);
      expect(result.canDeploy).toBe(false);
      expect(result.reason).toContain('cooldown');
    });

    it('considers diagonal speed correctly', () => {
      // Diagonal speed: sqrt(4^2 + 4^2) = ~5.66 m/s > 5 m/s
      const result = deploy.canDeploy('heli_1', makeSnapshot({
        velocity: new THREE.Vector3(4, 0, 4),
      }));
      expect(result.canDeploy).toBe(false);
      expect(result.reason).toContain('Too fast');
    });

    it('ignores vertical velocity for speed check', () => {
      // Vertical speed doesn't count for the deploy speed check
      const result = deploy.canDeploy('heli_1', makeSnapshot({
        velocity: new THREE.Vector3(1, -8, 1), // horizontal = ~1.4 m/s, fine
      }));
      expect(result.canDeploy).toBe(true);
    });
  });

  describe('deploySquad', () => {
    it('returns 4 terrain-snapped positions on success', () => {
      const result = deploy.deploySquad('heli_1', makeSnapshot());
      expect(result.success).toBe(true);
      expect(result.positions).toHaveLength(4);

      // All positions should be terrain-snapped to the NPC eye-level actor anchor.
      for (const pos of result.positions) {
        expect(pos.y).toBe(10 + NPC_Y_OFFSET);
      }
    });

    it('positions are spaced around helicopter center', () => {
      const heliPos = new THREE.Vector3(100, 20, 100);
      const result = deploy.deploySquad('heli_1', makeSnapshot({ position: heliPos }));
      expect(result.success).toBe(true);

      // Each position should be offset from helicopter center
      for (const pos of result.positions) {
        const dx = pos.x - heliPos.x;
        const dz = pos.z - heliPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        // Should be approximately 3m offset distance
        expect(dist).toBeCloseTo(3, 0);
      }

      // Positions should be distinct (cardinal directions)
      const unique = new Set(result.positions.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`));
      expect(unique.size).toBe(4);
    });

    it('respects cooldown on subsequent deploy attempts', () => {
      const now = 1000000;
      const first = deploy.deploySquad('heli_1', makeSnapshot(), 4, now);
      expect(first.success).toBe(true);

      const second = deploy.deploySquad('heli_1', makeSnapshot(), 4, now + 5000);
      expect(second.success).toBe(false);
      expect(second.reason).toContain('cooldown');
    });

    it('fails when altitude is too high', () => {
      const result = deploy.deploySquad('heli_1', makeSnapshot({
        position: new THREE.Vector3(100, 50, 100),
        groundHeight: 10,
      }));
      expect(result.success).toBe(false);
      expect(result.positions).toHaveLength(0);
    });

    it('queries terrain runtime for each position', () => {
      deploy.deploySquad('heli_1', makeSnapshot());
      // 4 positions = 4 height queries
      expect(terrain.getHeightAt).toHaveBeenCalledTimes(4);
    });

    it('uses effective terrain height when collision-aware runtime provides it', () => {
      terrain.getEffectiveHeightAt = vi.fn().mockReturnValue(20);
      const result = deploy.deploySquad('heli_1', makeSnapshot());

      expect(result.success).toBe(true);
      expect(result.positions[0].y).toBe(20 + NPC_Y_OFFSET);
      expect(terrain.getEffectiveHeightAt).toHaveBeenCalledTimes(4);
      expect(terrain.getHeightAt).not.toHaveBeenCalled();
    });

    it('limits positions to memberCount', () => {
      const result = deploy.deploySquad('heli_1', makeSnapshot(), 2);
      expect(result.success).toBe(true);
      expect(result.positions).toHaveLength(2);
    });

    it('caps positions at 4 even if more members requested', () => {
      const result = deploy.deploySquad('heli_1', makeSnapshot(), 10);
      expect(result.success).toBe(true);
      expect(result.positions).toHaveLength(4);
    });
  });

  describe('getCooldownRemaining', () => {
    it('returns 0 when no cooldown is active', () => {
      expect(deploy.getCooldownRemaining('heli_1')).toBe(0);
    });

    it('returns remaining seconds after deploy', () => {
      const now = 1000000;
      deploy.deploySquad('heli_1', makeSnapshot(), 4, now);
      const remaining = deploy.getCooldownRemaining('heli_1', now + 10000);
      expect(remaining).toBeCloseTo(20, 0); // 30s - 10s elapsed
    });
  });

  describe('clearCooldowns', () => {
    it('allows deploy again after clearing', () => {
      const now = 1000000;
      deploy.deploySquad('heli_1', makeSnapshot(), 4, now);
      deploy.clearCooldowns();

      const result = deploy.canDeploy('heli_1', makeSnapshot(), now + 1000);
      expect(result.canDeploy).toBe(true);
    });
  });
});
