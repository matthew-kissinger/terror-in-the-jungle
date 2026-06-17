// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { CombatantSimLane } from './CombatantSimLaneTelemetry';

type SimLaneCarrier = {
  simLane: CombatantSimLane;
};

const SIM_LANE_HYSTERESIS_RATIO = 0.08;
const SIM_LANE_HYSTERESIS_MIN_M = 8;
const SIM_LANE_HYSTERESIS_MAX_M = 30;

export function classifyCombatantSimLane(
  combatant: SimLaneCarrier,
  distanceSq: number,
  highRange: number,
  mediumRange: number,
  lowRange: number,
): CombatantSimLane {
  const distance = Math.sqrt(distanceSq);
  const desiredLane = classifyWithoutHysteresis(distance, highRange, mediumRange, lowRange);
  const previousLane = combatant.simLane;
  if (desiredLane === previousLane) return desiredLane;

  switch (previousLane) {
    case 'high':
      return desiredLane === 'medium' && distance <= getLaneExitRange(highRange)
        ? 'high'
        : desiredLane;
    case 'medium':
      if (desiredLane === 'high' && distance >= getLaneEnterRange(highRange)) return 'medium';
      if (desiredLane === 'low' && distance <= getLaneExitRange(mediumRange)) return 'medium';
      return desiredLane;
    case 'low':
      if (desiredLane === 'medium' && distance >= getLaneEnterRange(mediumRange)) return 'low';
      if (desiredLane === 'culled' && distance <= getLaneExitRange(lowRange)) return 'low';
      return desiredLane;
    case 'culled':
      return desiredLane === 'low' && distance >= getLaneEnterRange(lowRange)
        ? 'culled'
        : desiredLane;
  }
}

function classifyWithoutHysteresis(
  distance: number,
  highRange: number,
  mediumRange: number,
  lowRange: number,
): CombatantSimLane {
  if (distance < highRange) return 'high';
  if (distance < mediumRange) return 'medium';
  if (distance < lowRange) return 'low';
  return 'culled';
}

function getLaneEnterRange(range: number): number {
  return Math.max(0, range - getLaneHysteresisMargin(range));
}

function getLaneExitRange(range: number): number {
  return range + getLaneHysteresisMargin(range);
}

function getLaneHysteresisMargin(range: number): number {
  return Math.min(
    SIM_LANE_HYSTERESIS_MAX_M,
    Math.max(SIM_LANE_HYSTERESIS_MIN_M, range * SIM_LANE_HYSTERESIS_RATIO),
  );
}
