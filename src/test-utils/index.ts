/**
 * Shared test utilities - barrel export.
 *
 * Usage:
 *   import { createTestCombatant, mockTerrainRuntime, mockCamera } from '../../test-utils';
 *
 * Logger mocking cannot be shared via import due to vi.mock() hoisting.
 * Use the inline pattern in each test file:
 *   vi.mock('../../utils/Logger', () => ({
 *     Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
 *   }));
 */
export {
  mockCamera,
  createTestCombatant,
  mockTerrainRuntime,
  mockGameRenderer,
} from './mocks';
