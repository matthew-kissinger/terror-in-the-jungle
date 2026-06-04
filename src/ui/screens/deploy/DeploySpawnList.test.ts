/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { RespawnSpawnPoint } from '../../../systems/player/RespawnSpawnPoint';
import { classifySpawnThreat, makeSpawnOptionButton } from './DeploySpawnList';

function makeSpawn(partial: Partial<RespawnSpawnPoint>): RespawnSpawnPoint {
  return {
    id: 'sp',
    name: 'Sector',
    position: new THREE.Vector3(10, 0, 20),
    safe: true,
    kind: 'zone',
    selectionClass: 'nearest_controlled_zone',
    ...partial,
  };
}

describe('DeploySpawnList — classifySpawnThreat (UX-4)', () => {
  it('reads CLEAR for a safe spawn with no nearby enemies', () => {
    expect(classifySpawnThreat(makeSpawn({ threat: 0, safe: true }))).toEqual({ label: 'CLEAR', kind: 'clear' });
    // Absent threat (WarSimulator off) defaults to clear for a safe spawn.
    expect(classifySpawnThreat(makeSpawn({ safe: true }))).toEqual({ label: 'CLEAR', kind: 'clear' });
  });

  it('reads WARM with a few nearby enemies', () => {
    expect(classifySpawnThreat(makeSpawn({ threat: 1 })).kind).toBe('warm');
    expect(classifySpawnThreat(makeSpawn({ threat: 3 })).label).toBe('WARM');
  });

  it('reads HOT when enemies cluster near the spawn', () => {
    expect(classifySpawnThreat(makeSpawn({ threat: 4 }))).toEqual({ label: 'HOT', kind: 'hot' });
    expect(classifySpawnThreat(makeSpawn({ threat: 12 })).kind).toBe('hot');
  });

  it('reads EXPOSED for a forward insertion with no strategic agents nearby', () => {
    expect(classifySpawnThreat(makeSpawn({ threat: 0, safe: false }))).toEqual({ label: 'EXPOSED', kind: 'warm' });
  });

  it('lets a real threat count override the safe flag', () => {
    expect(classifySpawnThreat(makeSpawn({ threat: 6, safe: false })).kind).toBe('hot');
  });
});

describe('DeploySpawnList — makeSpawnOptionButton threat meta', () => {
  it('renders the threat band as a data-tagged span for FJ colouring', () => {
    const ctx = {
      styles: {
        spawnOption: 'so',
        spawnOptionSelected: 'sos',
        spawnOptionLabel: 'sol',
        spawnOptionMeta: 'som',
        spawnThreat: 'st',
      },
    } as never;
    const button = makeSpawnOptionButton(ctx, makeSpawn({ threat: 5 }), false);
    const span = button.querySelector('.st') as HTMLElement;
    expect(span?.dataset.threat).toBe('hot');
    expect(span?.textContent).toBe('HOT');
    expect(button.textContent).toContain('ZONE');
  });
});
