/**
 * Airframe — unified fixed-wing simulation module (B1 rebuild).
 *
 * Public surface: one class, one config type, one intent type, one command
 * type, one state type, one terrain-probe primitive. Import from here.
 *
 * See docs/rearch/E6-vehicle-physics-design.md.
 */

export { Airframe, AIRFRAME_FIXED_STEP } from './Airframe';
export { buildAirframeCommand } from './buildCommand';
export {
  AIRFRAME_CONFIGS,
  SKYRAIDER_AIRFRAME,
  PHANTOM_AIRFRAME,
  SPOOKY_AIRFRAME,
  getAirframeConfig,
} from './configs';
export {
  createFlatTerrainProbe,
  createHeightFunctionProbe,
  createTerrainRuntimeProbe,
} from './terrainProbe';
export type {
  AirframeCommand,
  AirframeConfig,
  AirframeIntent,
  AirframePhase,
  AirframeState,
  AirframeTerrainProbe,
  AirframeTerrainSample,
  AirframeTier,
} from './types';
