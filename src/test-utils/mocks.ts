/**
 * Shared test mock factories for Terror in the Jungle.
 *
 * Usage in test files:
 *   import { createTestCombatant, mockTerrainRuntime, mockCamera } from '../../test-utils';
 *
 * Note: Logger mocking cannot be shared via import because vi.mock() factories
 * are hoisted above all imports. Use the inline pattern directly in each test:
 *   vi.mock('../../utils/Logger', () => ({
 *     Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
 *   }));
 */
import { vi } from 'vitest';
import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from '../systems/combat/types';
import type { ITerrainRuntime, IGameRenderer } from '../types/SystemInterfaces';

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/**
 * Create a real THREE.PerspectiveCamera.
 * Works in vitest/node because three.js math is pure JS.
 */
export function mockCamera(
  fov = 75,
  aspect = 1,
  near = 0.1,
  far = 1000,
): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(fov, aspect, near, far);
}

// ---------------------------------------------------------------------------
// Combatant
// ---------------------------------------------------------------------------

/**
 * Create a Combatant with sensible defaults. Any field can be overridden.
 *
 *   const c = createTestCombatant();
 *   const nva = createTestCombatant({ id: 'nva-1', faction: Faction.NVA });
 */
export function createTestCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'test-combatant',
    faction: Faction.US,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.IDLE,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    target: undefined,
    lastKnownTargetPos: undefined,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high' as const,
    kills: 0,
    deaths: 0,
    damageHistory: [],
    ...overrides,
  } as Combatant;
}

// ---------------------------------------------------------------------------
// ITerrainRuntime
// ---------------------------------------------------------------------------

/**
 * Create a mock ITerrainRuntime. All methods are vi.fn() with safe defaults.
 * Provide `overrides` to customise specific methods.
 *
 *   const terrain = mockTerrainRuntime();
 *   const terrain = mockTerrainRuntime({ getHeightAt: vi.fn(() => 5) });
 */
export function mockTerrainRuntime(
  overrides: Partial<Record<keyof ITerrainRuntime, any>> = {},
): ITerrainRuntime {
  return {
    getHeightAt: vi.fn((_x: number, _z: number) => 0),
    getEffectiveHeightAt: vi.fn((_x: number, _z: number) => 0),
    getPlayableWorldSize: vi.fn(() => 2000),
    getVisualWorldSize: vi.fn(() => 2400),
    getVisualMargin: vi.fn(() => 200),
    getWorldSize: vi.fn(() => 2000),
    isTerrainReady: vi.fn(() => true),
    isAreaReadyAt: vi.fn(() => true),
    hasTerrainAt: vi.fn(() => true),
    getActiveTerrainTileCount: vi.fn(() => 0),
    setSurfaceWetness: vi.fn(),
    updatePlayerPosition: vi.fn(),
    registerCollisionObject: vi.fn(),
    unregisterCollisionObject: vi.fn(),
    raycastTerrain: vi.fn(() => ({ hit: false, distance: undefined })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IGameRenderer
// ---------------------------------------------------------------------------

/**
 * Create a mock IGameRenderer with the minimum surface used by most tests.
 */
export function mockGameRenderer(
  overrides: Partial<Record<keyof IGameRenderer, any>> = {},
): IGameRenderer {
  return {
    renderer: {} as THREE.WebGLRenderer,
    scene: new THREE.Scene(),
    camera: mockCamera(),
    postProcessing: undefined,
    fog: undefined,
    ambientLight: undefined,
    moonLight: undefined,
    hemisphereLight: undefined,
    getPerformanceStats: vi.fn(() => ({})),
    showSpawnLoadingIndicator: vi.fn(),
    hideSpawnLoadingIndicator: vi.fn(),
    showRenderer: vi.fn(),
    showCrosshair: vi.fn(),
    onWindowResize: vi.fn(),
    ...overrides,
  };
}

