import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeThreatLevel,
  computeOpportunityLevel,
  computeCoverValue,
  computeSquadSupport,
  computeCombinedScores,
  ComputationParams
} from './InfluenceMapComputations';
import { InfluenceMapGrid } from './InfluenceMapGrid';
import { Faction, Combatant } from './types';
import { CaptureZone, ZoneState } from '../world/ZoneManager';
import type {} from '../world/ZoneManager';

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3,
  state: string = 'idle'
): Combatant {
  return {
    id,
    faction,
    position,
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any
  } as Combatant;
}

// Helper to create a mock zone
function createMockZone(
  id: string,
  position: THREE.Vector3,
  owner: Faction | null = null,
  state: ZoneState = ZoneState.NEUTRAL,
  isHomeBase = false
): CaptureZone {
  return {
    id,
    name: `Zone ${id}`,
    position,
    radius: 20,
    height: 2,
    owner,
    state,
    captureProgress: 0,
    captureSpeed: 0,
    isHomeBase
  } as CaptureZone;
}

// Helper to create test params with a small grid
function createTestParams(gridSize = 20, worldSize = 400): ComputationParams {
  const worldOffset = new THREE.Vector2(-worldSize / 2, -worldSize / 2);
  const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

  return {
    grid,
    gridSize,
    cellSize: worldSize / gridSize,
    worldOffset,
    combatants: new Map(),
    zones: [],
    playerPosition: new THREE.Vector3(0, 0, 0),
    sandbagBounds: []
  };
}

describe('InfluenceMapComputations', () => {
  describe('computeThreatLevel', () => {
    it('should accumulate threat from OPFOR combatants', () => {
      const params = createTestParams();
      const enemyPos = new THREE.Vector3(0, 0, 0);
      const enemy = createMockCombatant('enemy1', Faction.NVA, enemyPos);
      params.combatants.set('enemy1', enemy);

      computeThreatLevel(params);

      // Center cell should have threat
      const centerCell = params.grid[10][10];
      expect(centerCell.threatLevel).toBeGreaterThan(0);
      expect(centerCell.threatLevel).toBeLessThanOrEqual(1);
    });

    it('should prioritize OPFOR combatants for threat', () => {
      const params = createTestParams();

      // Add both OPFOR and US combatants
      const enemy = createMockCombatant('enemy1', Faction.NVA, new THREE.Vector3(0, 0, 0));
      const friendly = createMockCombatant('friendly1', Faction.US, new THREE.Vector3(50, 0, 50));
      params.combatants.set('enemy1', enemy);
      params.combatants.set('friendly1', friendly);

      computeThreatLevel(params);

      // Cell near enemy should have higher threat than cell near friendly
      const cellNearEnemy = params.grid[10][10];
      const cellNearFriendly = params.grid[14][14];

      expect(cellNearEnemy.threatLevel).toBeGreaterThan(cellNearFriendly.threatLevel);
    });

    it('should handle dead combatants gracefully', () => {
      const params = createTestParams();

      // Add both alive and dead OPFOR combatants
      const aliveEnemy = createMockCombatant('alive', Faction.NVA, new THREE.Vector3(0, 0, 0), 'engaging');
      const deadEnemy = createMockCombatant('dead', Faction.NVA, new THREE.Vector3(50, 0, 50), 'dead');
      params.combatants.set('alive', aliveEnemy);
      params.combatants.set('dead', deadEnemy);

      computeThreatLevel(params);

      // Cell near alive enemy should have higher threat
      const cellNearAlive = params.grid[10][10];
      const cellNearDead = params.grid[14][14];

      expect(cellNearAlive.threatLevel).toBeGreaterThan(cellNearDead.threatLevel);
    });

    it('should apply higher threat to player position', () => {
      const params = createTestParams();
      // Place enemy far from center to avoid cap at 1.0
      const enemyPos = new THREE.Vector3(80, 0, 80);
      const enemy = createMockCombatant('enemy1', Faction.NVA, enemyPos);
      params.combatants.set('enemy1', enemy);
      params.playerPosition = new THREE.Vector3(0, 0, 0);

      const paramsWithoutPlayer = createTestParams();
      paramsWithoutPlayer.combatants.set('enemy1', enemy);
      paramsWithoutPlayer.playerPosition = new THREE.Vector3(500, 500, 500); // Far away

      computeThreatLevel(params);
      computeThreatLevel(paramsWithoutPlayer);

      // Check cell at player position (0,0) maps to grid[10][10]
      const playerCell1 = params.grid[10][10];
      const playerCell2 = paramsWithoutPlayer.grid[10][10];

      expect(playerCell1.threatLevel).toBeGreaterThan(playerCell2.threatLevel);
    });

    it('should decay threat with distance', () => {
      const params = createTestParams();
      const enemyPos = new THREE.Vector3(0, 0, 0);
      const enemy = createMockCombatant('enemy1', Faction.NVA, enemyPos);
      params.combatants.set('enemy1', enemy);

      computeThreatLevel(params);

      // Cell at enemy position should have max threat
      const centerCell = params.grid[10][10];
      const maxThreat = centerCell.threatLevel;

      // Far cells should have less threat
      const farCell = params.grid[2][2];
      expect(farCell.threatLevel).toBeLessThan(maxThreat);
    });

    it('should cap threat level at 1.0', () => {
      const params = createTestParams();
      // Add multiple enemies at same location
      const pos = new THREE.Vector3(0, 0, 0);
      for (let i = 0; i < 5; i++) {
        const enemy = createMockCombatant(`enemy${i}`, Faction.NVA, pos);
        params.combatants.set(`enemy${i}`, enemy);
      }

      computeThreatLevel(params);

      const centerCell = params.grid[10][10];
      expect(centerCell.threatLevel).toBeLessThanOrEqual(1);
    });
  });

  describe('computeOpportunityLevel', () => {
    it('should accumulate opportunity from contested zones', () => {
      const params = createTestParams();
      const zonePos = new THREE.Vector3(0, 0, 0);
      const zone = createMockZone('zone1', zonePos, null, ZoneState.CONTESTED);
      params.zones.push(zone);

      computeOpportunityLevel(params);

      const centerCell = params.grid[10][10];
      expect(centerCell.opportunityLevel).toBeGreaterThan(0);
    });

    it('should ignore home base zones', () => {
      const params = createTestParams();
      const zonePos = new THREE.Vector3(0, 0, 0);
      const zone = createMockZone('zone1', zonePos, Faction.NVA, ZoneState.OPFOR_CONTROLLED, true);
      params.zones.push(zone);

      computeOpportunityLevel(params);

      let hasAnyOpportunity = false;
      for (let x = 0; x < params.gridSize; x++) {
        for (let z = 0; z < params.gridSize; z++) {
          if (params.grid[x][z].opportunityLevel > 0) {
            hasAnyOpportunity = true;
          }
        }
      }
      expect(hasAnyOpportunity).toBe(false);
    });

    it('should rank zone values correctly', () => {
      // Test that different zone types produce different opportunity values
      // Place zones far from center to avoid hitting max cap
      // Grid center (10,10) is at world (0, 0), ZONE_RADIUS is 30
      const contestedParams = createTestParams();
      const contestedZone = createMockZone(ZoneState.CONTESTED, new THREE.Vector3(-50, 0, -50), null, ZoneState.CONTESTED);
      contestedParams.zones = [contestedZone];

      const enemyParams = createTestParams();
      const enemyZone = createMockZone('enemy', new THREE.Vector3(-50, 0, -50), Faction.NVA, ZoneState.OPFOR_CONTROLLED);
      enemyParams.zones = [enemyZone];

      const neutralParams = createTestParams();
      const neutralZone = createMockZone(ZoneState.NEUTRAL, new THREE.Vector3(-50, 0, -50), null, ZoneState.NEUTRAL);
      neutralParams.zones = [neutralZone];

      const friendlyParams = createTestParams();
      const friendlyZone = createMockZone('friendly', new THREE.Vector3(-50, 0, -50), Faction.US, ZoneState.OPFOR_CONTROLLED);
      friendlyParams.zones = [friendlyZone];

      computeOpportunityLevel(contestedParams);
      computeOpportunityLevel(enemyParams);
      computeOpportunityLevel(neutralParams);
      computeOpportunityLevel(friendlyParams);

      // Grid[8][8] is at world (-40, -40), which is 14 units away from zone at (-50, -50)
      // All zone radius 30, should all have some opportunity
      const cellContested = contestedParams.grid[8][8];
      const cellEnemy = enemyParams.grid[8][8];
      const cellNeutral = neutralParams.grid[8][8];
      const cellFriendly = friendlyParams.grid[8][8];

      // Contested > Enemy > Neutral > Friendly
      expect(cellContested.opportunityLevel).toBeGreaterThan(cellEnemy.opportunityLevel);
      expect(cellEnemy.opportunityLevel).toBeGreaterThan(cellNeutral.opportunityLevel);
      expect(cellNeutral.opportunityLevel).toBeGreaterThan(cellFriendly.opportunityLevel);
    });

    it('should cap opportunity level at 1.0', () => {
      const params = createTestParams();
      // Add multiple contested zones at same location
      const pos = new THREE.Vector3(0, 0, 0);
      for (let i = 0; i < 5; i++) {
        const zone = createMockZone(`zone${i}`, pos, null, ZoneState.CONTESTED);
        params.zones.push(zone);
      }

      computeOpportunityLevel(params);

      const centerCell = params.grid[10][10];
      expect(centerCell.opportunityLevel).toBeLessThanOrEqual(1);
    });
  });

  describe('computeCoverValue', () => {
    it('should add cover value from sandbag positions', () => {
      const params = createTestParams();
      const sandbagBounds = new THREE.Box3(
        new THREE.Vector3(-5, 0, -5),
        new THREE.Vector3(5, 2, 5)
      );
      params.sandbagBounds.push(sandbagBounds);

      computeCoverValue(params);

      const centerCell = params.grid[10][10];
      expect(centerCell.coverValue).toBeGreaterThan(0);
    });

    it('should decay cover with distance', () => {
      const params = createTestParams();
      const sandbagBounds = new THREE.Box3(
        new THREE.Vector3(-5, 0, -5),
        new THREE.Vector3(5, 2, 5)
      );
      params.sandbagBounds.push(sandbagBounds);

      computeCoverValue(params);

      const centerCell = params.grid[10][10];
      const maxCover = centerCell.coverValue;

      const farCell = params.grid[2][2];
      expect(farCell.coverValue).toBeLessThan(maxCover);
    });

    it('should handle multiple sandbags', () => {
      const params = createTestParams();
      const bounds1 = new THREE.Box3(
        new THREE.Vector3(-5, 0, -5),
        new THREE.Vector3(5, 2, 5)
      );
      const bounds2 = new THREE.Box3(
        new THREE.Vector3(80, 0, -5),
        new THREE.Vector3(90, 2, 5)
      );
      params.sandbagBounds.push(bounds1, bounds2);

      computeCoverValue(params);

      // Grid[10][10] is at world position (0, 0) - near bounds1 center
      const cell1 = params.grid[10][10];
      // Bounds2 center at (85, 0), which maps to approximately grid[14][10]
      const cell2 = params.grid[14][10];

      expect(cell1.coverValue).toBeGreaterThan(0);
      expect(cell2.coverValue).toBeGreaterThan(0);
    });

    it('should cap cover value at 1.0', () => {
      const params = createTestParams();
      // Add many sandbags at same location
      const center = new THREE.Vector3(0, 0, 0);
      for (let i = 0; i < 10; i++) {
        const bounds = new THREE.Box3(
          new THREE.Vector3(-2 - i, 0, -2 - i),
          new THREE.Vector3(2 + i, 2, 2 + i)
        );
        params.sandbagBounds.push(bounds);
      }

      computeCoverValue(params);

      const centerCell = params.grid[10][10];
      expect(centerCell.coverValue).toBeLessThanOrEqual(1);
    });
  });

  describe('computeSquadSupport', () => {
    it('should accumulate support from friendly combatants', () => {
      const params = createTestParams();
      const friendlyPos = new THREE.Vector3(0, 0, 0);
      const friendly = createMockCombatant('friendly1', Faction.US, friendlyPos);
      params.combatants.set('friendly1', friendly);

      computeSquadSupport(params);

      const centerCell = params.grid[10][10];
      expect(centerCell.squadSupport).toBeGreaterThan(0);
    });

    it('should ignore OPFOR combatants', () => {
      const params = createTestParams();
      const enemyPos = new THREE.Vector3(0, 0, 0);
      const enemy = createMockCombatant('enemy1', Faction.NVA, enemyPos);
      params.combatants.set('enemy1', enemy);

      computeSquadSupport(params);

      let hasAnySupport = false;
      for (let x = 0; x < params.gridSize; x++) {
        for (let z = 0; z < params.gridSize; z++) {
          if (params.grid[x][z].squadSupport > 0) {
            hasAnySupport = true;
          }
        }
      }
      expect(hasAnySupport).toBe(false);
    });

    it('should ignore dead friendlies', () => {
      const params = createTestParams();
      const deadFriendly = createMockCombatant('dead', Faction.US, new THREE.Vector3(0, 0, 0), 'dead');
      params.combatants.set('dead', deadFriendly);

      computeSquadSupport(params);

      let hasAnySupport = false;
      for (let x = 0; x < params.gridSize; x++) {
        for (let z = 0; z < params.gridSize; z++) {
          if (params.grid[x][z].squadSupport > 0) {
            hasAnySupport = true;
          }
        }
      }
      expect(hasAnySupport).toBe(false);
    });

    it('should decay support with distance', () => {
      const params = createTestParams();
      const friendlyPos = new THREE.Vector3(0, 0, 0);
      const friendly = createMockCombatant('friendly1', Faction.US, friendlyPos);
      params.combatants.set('friendly1', friendly);

      computeSquadSupport(params);

      const centerCell = params.grid[10][10];
      const maxSupport = centerCell.squadSupport;

      const farCell = params.grid[2][2];
      expect(farCell.squadSupport).toBeLessThan(maxSupport);
    });

    it('should cap support at 1.0', () => {
      const params = createTestParams();
      // Add multiple friendlies at same location
      const pos = new THREE.Vector3(0, 0, 0);
      for (let i = 0; i < 10; i++) {
        const friendly = createMockCombatant(`friendly${i}`, Faction.US, pos);
        params.combatants.set(`friendly${i}`, friendly);
      }

      computeSquadSupport(params);

      const centerCell = params.grid[10][10];
      expect(centerCell.squadSupport).toBeLessThanOrEqual(1);
    });
  });

  describe('computeCombinedScores', () => {
    it('should compute combined scores for all cells', () => {
      const params = createTestParams();

      // Set up some influence values
      params.grid[10][10].opportunityLevel = 0.8;
      params.grid[10][10].threatLevel = 0.3;
      params.grid[10][10].coverValue = 0.6;
      params.grid[10][10].squadSupport = 0.4;

      computeCombinedScores(params);

      const cell = params.grid[10][10];
      expect(cell.combinedScore).toBeGreaterThan(0);
      expect(cell.combinedScore).toBeLessThanOrEqual(1);
    });

    it('should normalize scores to 0-1 range', () => {
      const params = createTestParams();

      // All cells should end up with normalized scores
      // Set all influences to maximum
      for (let x = 0; x < params.gridSize; x++) {
        for (let z = 0; z < params.gridSize; z++) {
          params.grid[x][z].opportunityLevel = 1;
          params.grid[x][z].threatLevel = 1;
          params.grid[x][z].coverValue = 1;
          params.grid[x][z].squadSupport = 1;
        }
      }

      computeCombinedScores(params);

      // All scores should be capped at 1.0
      for (let x = 0; x < params.gridSize; x++) {
        for (let z = 0; z < params.gridSize; z++) {
          expect(params.grid[x][z].combinedScore).toBeLessThanOrEqual(1);
          expect(params.grid[x][z].combinedScore).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should prioritize opportunity over threat', () => {
      const params = createTestParams();

      // High opportunity + low threat should score higher than low opportunity + high threat
      params.grid[5][5].opportunityLevel = 1.0;
      params.grid[5][5].threatLevel = 0.2;
      params.grid[5][5].coverValue = 0;
      params.grid[5][5].squadSupport = 0;

      params.grid[15][15].opportunityLevel = 0.1;
      params.grid[15][15].threatLevel = 0.9;
      params.grid[15][15].coverValue = 0;
      params.grid[15][15].squadSupport = 0;

      computeCombinedScores(params);

      const cell1 = params.grid[5][5];
      const cell2 = params.grid[15][15];

      expect(cell1.combinedScore).toBeGreaterThan(cell2.combinedScore);
    });

    it('should incorporate all four factors in scoring', () => {
      const params = createTestParams();

      // Cell with all factors should score higher than cell with none
      params.grid[5][5].opportunityLevel = 1;
      params.grid[5][5].threatLevel = 0; // 1 - threat = 1
      params.grid[5][5].coverValue = 1;
      params.grid[5][5].squadSupport = 1;

      params.grid[15][15].opportunityLevel = 0;
      params.grid[15][15].threatLevel = 1;
      params.grid[15][15].coverValue = 0;
      params.grid[15][15].squadSupport = 0;

      computeCombinedScores(params);

      const cell1 = params.grid[5][5];
      const cell2 = params.grid[15][15];

      expect(cell1.combinedScore).toBeGreaterThan(cell2.combinedScore);
    });

    it('should use correct weighting formula', () => {
      const params = createTestParams();

      // Test the formula: opportunity*2.0 + (1-threat)*1.5 + cover*0.8 + support*0.5
      params.grid[10][10].opportunityLevel = 0.5;
      params.grid[10][10].threatLevel = 0.2;
      params.grid[10][10].coverValue = 0.4;
      params.grid[10][10].squadSupport = 0.6;

      computeCombinedScores(params);

      const cell = params.grid[10][10];
      // Expected: (0.5*2.0) + (0.8*1.5) + (0.4*0.8) + (0.6*0.5) = 1.0 + 1.2 + 0.32 + 0.3 = 2.82
      // Normalized by 4.8: 2.82 / 4.8 = 0.5875
      expect(cell.combinedScore).toBeCloseTo(2.82 / 4.8, 2);
    });

    it('should handle cells with zero influence', () => {
      const params = createTestParams();

      // Cell with no influence should score 0
      params.grid[10][10].opportunityLevel = 0;
      params.grid[10][10].threatLevel = 0; // Actually gives (1-0)*1.5
      params.grid[10][10].coverValue = 0;
      params.grid[10][10].squadSupport = 0;

      computeCombinedScores(params);

      const cell = params.grid[10][10];
      // With all influences zero except threat (which contributes 1*1.5): score = 1.5/4.8 = 0.3125
      expect(cell.combinedScore).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    it('should handle full influence computation pipeline', () => {
      const params = createTestParams();

      // Set up a complex scene
      const enemy1 = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(-50, 0, -50));
      const enemy2 = createMockCombatant('e2', Faction.NVA, new THREE.Vector3(50, 0, 50));
      params.combatants.set('e1', enemy1);
      params.combatants.set('e2', enemy2);

      const friendly1 = createMockCombatant('f1', Faction.US, new THREE.Vector3(0, 0, 0));
      params.combatants.set('f1', friendly1);

      const zone1 = createMockZone('z1', new THREE.Vector3(-30, 0, -30), null, ZoneState.CONTESTED);
      const zone2 = createMockZone('z2', new THREE.Vector3(30, 0, 30), Faction.NVA);
      params.zones.push(zone1, zone2);

      const sandbag = new THREE.Box3(
        new THREE.Vector3(-10, 0, 0),
        new THREE.Vector3(10, 2, 0)
      );
      params.sandbagBounds.push(sandbag);

      params.playerPosition = new THREE.Vector3(0, 0, 0);

      // Run full pipeline
      computeThreatLevel(params);
      computeOpportunityLevel(params);
      computeCoverValue(params);
      computeSquadSupport(params);
      computeCombinedScores(params);

      // Verify results
      let hasAnyScore = false;
      let maxScore = 0;
      for (let x = 0; x < params.gridSize; x++) {
        for (let z = 0; z < params.gridSize; z++) {
          const cell = params.grid[x][z];
          expect(cell.threatLevel).toBeGreaterThanOrEqual(0);
          expect(cell.threatLevel).toBeLessThanOrEqual(1);
          expect(cell.opportunityLevel).toBeGreaterThanOrEqual(0);
          expect(cell.opportunityLevel).toBeLessThanOrEqual(1);
          expect(cell.coverValue).toBeGreaterThanOrEqual(0);
          expect(cell.coverValue).toBeLessThanOrEqual(1);
          expect(cell.squadSupport).toBeGreaterThanOrEqual(0);
          expect(cell.squadSupport).toBeLessThanOrEqual(1);
          expect(cell.combinedScore).toBeGreaterThanOrEqual(0);
          expect(cell.combinedScore).toBeLessThanOrEqual(1);

          if (cell.combinedScore > 0) hasAnyScore = true;
          maxScore = Math.max(maxScore, cell.combinedScore);
        }
      }

      expect(hasAnyScore).toBe(true);
      expect(maxScore).toBeGreaterThan(0);
    });

    it('should maintain cell independence between computations', () => {
      const params1 = createTestParams();
      const params2 = createTestParams();

      const enemy = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(0, 0, 0));

      params1.combatants.set('e1', enemy);
      params2.combatants.set('e1', enemy);

      computeThreatLevel(params1);
      computeThreatLevel(params2);

      // Both should have same threat values
      for (let x = 0; x < params1.gridSize; x++) {
        for (let z = 0; z < params1.gridSize; z++) {
          expect(params1.grid[x][z].threatLevel).toBe(params2.grid[x][z].threatLevel);
        }
      }
    });
  });
});
