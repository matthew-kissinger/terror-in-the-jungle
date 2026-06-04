// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared test utilities - barrel export.
 *
 * Usage:
 *   import { createTestCombatant, mockTerrainRuntime } from '../../test-utils';
 *
 * Logger mocking cannot be shared via import due to vi.mock() hoisting.
 * Use the inline pattern in each test file:
 *   vi.mock('../../utils/Logger', () => ({
 *     Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
 *   }));
 */
export { createTestCombatant, mockTerrainRuntime } from './mocks';
export { makeHydrologyArtifact, makeChannelPolyline, makePolylinePoint } from './hydrology';
