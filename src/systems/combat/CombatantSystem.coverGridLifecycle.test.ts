// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi } from 'vitest';
import { CombatantSystem } from './CombatantSystem';

// Mode-switch lifecycle guard for the cover-grid leak (combat-reviewer
// follow-up on cover-grid-wiring). On every mode switch/restart, GameModeManager
// repopulates combatants on the regenerated map via ONE OF TWO CombatantSystem
// paths, forked on config.warSimulator?.enabled (GameModeManager.ts:313-319):
//   - reseedForcesForMode()                -> OF / ZC / TDM (the common path)
//   - clearCombatantsForExternalPopulation -> WarSimulator / A Shau Valley
// BOTH must clear the cover grid, otherwise stale cross-map cover cells leak
// (the grid's region entries are TTL-refreshed but never evicted). The original
// fix only wired the WarSimulator branch, so the common OF/ZC/TDM path still
// leaked -- these tests guard both branches.
//
// CombatantSystem's constructor instantiates GPU-bound effect pools and the
// renderer, so we exercise the *real* method bodies against a structural `this`
// double rather than constructing the whole system. The assertion is the wiring
// contract: each repopulation path resets the cover grid.

describe('CombatantSystem cover-grid mode-switch reset', () => {
  it('resets the cover grid on the common reseedForcesForMode path (OF/ZC/TDM)', () => {
    const resetCoverGrid = vi.fn();
    const setSquads = vi.fn();
    const reseed = vi.fn(() => undefined);
    const stub = {
      spawnManager: { reseedForcesForMode: reseed },
      squadManager: { getAllSquads: vi.fn(() => new Map()) },
      combatantAI: { setSquads, resetCoverGrid },
      shouldCreatePlayerSquad: false,
      playerSquadId: undefined as string | undefined,
    };

    CombatantSystem.prototype.reseedForcesForMode.call(stub);

    expect(reseed).toHaveBeenCalledTimes(1);
    expect(resetCoverGrid).toHaveBeenCalledTimes(1);
    // Reset runs after squads are re-synced.
    expect(setSquads.mock.invocationCallOrder[0]).toBeLessThan(
      resetCoverGrid.mock.invocationCallOrder[0],
    );
  });

  it('resets the cover grid on the WarSimulator clearCombatantsForExternalPopulation path (A Shau)', () => {
    const resetCoverGrid = vi.fn();
    const setSquads = vi.fn();
    const stub = {
      combatants: new Map<string, unknown>([['c1', {}], ['c2', {}]]),
      spatialGridManager: { removeEntity: vi.fn() },
      squadManager: { dispose: vi.fn(), getAllSquads: vi.fn(() => new Map()) },
      spawnManager: { resetRuntimeStateForExternalPopulation: vi.fn() },
      combatantAI: { setSquads, resetCoverGrid },
      playerSquadId: 'squad-1' as string | undefined,
    };

    CombatantSystem.prototype.clearCombatantsForExternalPopulation.call(stub);

    // Cover grid is reset exactly once, after the squad/spawn state is cleared.
    expect(resetCoverGrid).toHaveBeenCalledTimes(1);
    expect(setSquads.mock.invocationCallOrder[0]).toBeLessThan(
      resetCoverGrid.mock.invocationCallOrder[0],
    );

    // The rest of the clear contract still runs (guards against the reset call
    // being added at the cost of an existing teardown step).
    expect(stub.spatialGridManager.removeEntity).toHaveBeenCalledTimes(2);
    expect(stub.squadManager.dispose).toHaveBeenCalledTimes(1);
    expect(stub.spawnManager.resetRuntimeStateForExternalPopulation).toHaveBeenCalledTimes(1);
    expect(stub.combatants.size).toBe(0);
    expect(stub.playerSquadId).toBeUndefined();
  });
});
