import { describe, it, expect, vi } from 'vitest';
import { CombatantSystem } from './CombatantSystem';

// Mode-switch lifecycle guard for the cover-grid leak (combat-reviewer
// follow-up on cover-grid-wiring). On every mode switch/restart, GameModeManager
// repopulates combatants via CombatantSystem.clearCombatantsForExternalPopulation
// (GameModeManager.ts:318). That hook must clear the cover grid so stale
// cross-map cover cells don't accumulate -- the grid's region entries are
// TTL-refreshed but never evicted, so without an explicit reset they leak
// across switches.
//
// CombatantSystem's constructor instantiates GPU-bound effect pools and the
// renderer, so we exercise the *real* method body against a structural `this`
// double rather than constructing the whole system. The assertion is the wiring
// contract: clearing combatants for external population resets the cover grid.

describe('CombatantSystem.clearCombatantsForExternalPopulation cover-grid reset', () => {
  it('invokes combatantAI.resetCoverGrid on the mode-switch repopulation hook', () => {
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
