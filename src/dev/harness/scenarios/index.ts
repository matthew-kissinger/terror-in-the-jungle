/**
 * Scenario registry. `findScenario(id)` returns the config; runner handles
 * the rest. New scenarios add one export + one entry here.
 */

import type { ScenarioConfig } from '../types';
import { combat120 } from './combat120';
import { openFrontierShort } from './openfrontier-short';
import { aShauShort } from './ashau-short';
import { frontier30m } from './frontier30m';

export const SCENARIOS: Readonly<Record<string, ScenarioConfig>> = Object.freeze({
  [combat120.id]: combat120,
  [openFrontierShort.id]: openFrontierShort,
  [aShauShort.id]: aShauShort,
  [frontier30m.id]: frontier30m,
});

export function findScenario(id: string): ScenarioConfig | null {
  return SCENARIOS[id] ?? null;
}

export function listScenarioIds(): string[] {
  return Object.keys(SCENARIOS);
}

export { combat120, openFrontierShort, aShauShort, frontier30m };
