// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export {
  UtilityScorer,
  bearingAwayFromThreat,
} from './UtilityScorer'
export type {
  UtilityContext,
} from './UtilityScorer'
export {
  fireAndFadeAction,
  repositionAction,
  holdAction,
  DEFAULT_UTILITY_ACTIONS,
} from './actions'
export {
  mountEmplacementAction,
  buildEmplacementContext,
  enemyInFieldOfFire,
  EmplacementMountTracker,
  EmplacementCandidateCache,
  STALE_TARGET_DISMOUNT_MS,
} from '../EmplacementSeekHelper'
export type {
  INpcEmplacementWeapon,
  INpcEmplacementVehicle,
  INpcEmplacementQuery,
} from '../EmplacementSeekHelper'
