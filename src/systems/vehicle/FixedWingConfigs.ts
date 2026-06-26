// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Per-aircraft configuration for the fixed-wing flight controller.
 *
 * The flight model is intentionally sim-lite: aircraft-specific values describe
 * the performance envelope, control authority, and ground handling rather than
 * a few overloaded lift/turn-rate constants.
 */

import { AircraftModels, warAssetCatalog } from '../assets/modelPaths';
import type { WarAssetEntry } from '../assets/modelPaths';
import { isAircraftArtLegacy } from '../../config/aircraftArt';

export interface FixedWingPhysicsConfig {
  mass: number; // kg
  wingArea: number; // m^2
  maxThrust: number; // N
  stallSpeed: number; // m/s
  vrSpeed: number; // m/s
  v2Speed: number; // m/s
  maxSpeed: number; // m/s
  throttleResponse: number; // 1/sec
  controlResponse: number; // 1/sec
  cl0: number;
  clAlpha: number; // 1/rad
  clMax: number;
  alphaStallDeg: number;
  alphaMaxDeg: number;
  trimAlphaDeg: number;
  cd0: number;
  inducedDragK: number;
  sideForceCoefficient: number;
  elevatorPower: number;
  aileronPower: number;
  rudderPower: number;
  pitchStability: number;
  rollLevelStrength: number;
  yawStability: number;
  pitchDamping: number;
  rollDamping: number;
  yawDamping: number;
  stabilityAssistPitch: number;
  stabilityAssistRoll: number;
  stabilityAssistYaw: number;
  maxPitchRate: number; // rad/s
  maxRollRate: number; // rad/s
  maxYawRate: number; // rad/s
  groundSteering: number; // rad/s
  groundLateralFriction: number;
  rollingResistance: number;
  brakeDeceleration: number; // m/s^2
  gearClearance: number; // m
  liftoffClearance: number; // m
  rotationPitchLimitDeg: number;
  groundEffectStrength: number;
  /**
   * Per-aircraft saturation clamp on the assist-tier altitude-hold PD's
   * elevator command (symmetric; abs value). When omitted the Airframe uses
   * a 0.15 default. Aircraft with higher thrust-to-weight at cruise throttle
   * (e.g. A-1 Skyraider) can saturate a tight clamp while recapturing from a
   * climb-wedge disturbance and benefit from a wider value. Hard ceiling is
   * ~0.40 before the PD risks bang-bang oscillation.
   */
  altitudeHoldElevatorClamp?: number;
}

export interface FixedWingOperationInfo {
  minimumRunwayLength: number; // meters for current simplified takeoff/landing contract
  preferredSpawnMode: 'parked' | 'orbit';
  playerFlow: 'runway' | 'gunship_orbit';
  taxiSpeedMax: number;
  stoppedSpeedMax: number;
  exitSpeedMax: number;
  approachSpeed: number;
  orbitRadius?: number;
  orbitBankDeg?: number;
  orbitTurnDirection?: -1 | 1;
  orbitMinAltitude?: number;
}

export type FixedWingPilotProfile = 'trainer' | 'fast_jet' | 'gunship';

export interface FixedWingConfig {
  physics: FixedWingPhysicsConfig;
  role: 'transport' | 'fighter' | 'attack' | 'gunship';
  pilotProfile: FixedWingPilotProfile;
  operation: FixedWingOperationInfo;
}

export type PropellerSpinAxis = 'x' | 'y' | 'z';

export interface FixedWingDisplayInfo {
  displayName: string;
  hasPropellers: boolean;
  /**
   * Names of the propeller hub nodes to spin. For the repaint fleet these are
   * the importer-grafted `Joint_Propeller*` hub joints sourced from the war
   * asset catalog (the upstream prop/rotor animation clips were stripped, so
   * spin is procedural off the named hub, never an animation track).
   */
  propellerNodes: string[];
  /**
   * Local spin axis for the propeller hub joints (catalog-measured). The
   * repaint A-1 and AC-47 props spin around their local X. Defaults to 'z' for
   * any airframe whose catalog entry omits the axis.
   */
  propellerSpinAxis: PropellerSpinAxis;
  autoLevelDefault: boolean;
  cameraDistance: number;
  cameraHeight: number;
  fovWidenEnabled: boolean;
  seats: number;
  /**
   * Per-aircraft visual yaw offset (radians) applied to the inner GLB model so
   * it visually aligns with the physics forward direction. Defaults to Math.PI
   * for GLBs authored facing +Z. The repaint fleet (cycle-2026-06-11) is
   * uniformly +Z-forward per the war-asset catalog, so no airframe overrides
   * this — the universal flip applies to all three.
   */
  modelYawOffset?: number;
}

/**
 * Config key -> war-asset catalog slug (the catalog owns measured dims + joints).
 *
 * Flag-selected at module-init by the Kiln-art kill-switch: the default Kiln
 * slugs resolve the new kiln-war-2026-06 GLBs' dims + grafted prop joints;
 * `?aircraftArt=legacy` restores the prior cycle-2026-06-11 repaint slugs so the
 * catalog entry matches whichever GLB the airfield/visual layer actually loads
 * (keeping prop-hub joint names in sync with the loaded mesh).
 */
const FIXED_WING_CATALOG_SLUG: Record<string, string> = isAircraftArtLegacy()
  ? {
      A1_SKYRAIDER: 'a1-skyraider',
      AC47_SPOOKY: 'ac47-spooky',
      F4_PHANTOM: 'f4-phantom',
    }
  : {
      A1_SKYRAIDER: 'a-1-skyraider-spad',
      AC47_SPOOKY: 'ac-47-spooky-gunship',
      F4_PHANTOM: 'f-4-phantom-ii',
    };

/** Resolve the war-asset catalog entry for a fixed-wing config key. */
export function getFixedWingCatalogEntry(key: string): WarAssetEntry | null {
  const slug = FIXED_WING_CATALOG_SLUG[key];
  return slug ? warAssetCatalog[slug] ?? null : null;
}

/**
 * Pull the grafted propeller hub joint names + their spin axis from the
 * catalog. The importer grafts a single hub joint per propeller (the repaint
 * A-1 has per-blade `Joint_Blade0..3` collapsed under one `Joint_Propeller`),
 * recording the spin axis as metadata. Returns empty when the airframe carries
 * no propeller joints (jets).
 */
function catalogPropellers(key: string): { nodes: string[]; axis: PropellerSpinAxis } {
  const entry = getFixedWingCatalogEntry(key);
  const propJoints = (entry?.joints ?? []).filter((j) => j.name.startsWith('Joint_Propeller'));
  const nodes = propJoints.map((j) => j.name);
  const axis = (propJoints[0]?.spinAxis ?? 'z') as PropellerSpinAxis;
  return { nodes, axis };
}

const A1_PROPS = catalogPropellers('A1_SKYRAIDER');
const AC47_PROPS = catalogPropellers('AC47_SPOOKY');

const FIXED_WING_DISPLAY: Record<string, FixedWingDisplayInfo> = {
  A1_SKYRAIDER: {
    displayName: 'A-1 Skyraider',
    hasPropellers: true,
    propellerNodes: A1_PROPS.nodes,
    propellerSpinAxis: A1_PROPS.axis,
    autoLevelDefault: true,
    // Camera distances kept in step with the re-banded FixedWingCameraFit table
    // (Kiln spans: A-1 13.42 m, F-4 14.12 m, AC-47 28.4 m).
    cameraDistance: 30,
    cameraHeight: 8,
    fovWidenEnabled: false,
    seats: 1,
  },
  AC47_SPOOKY: {
    displayName: 'AC-47 Spooky',
    hasPropellers: true,
    propellerNodes: AC47_PROPS.nodes,
    propellerSpinAxis: AC47_PROPS.axis,
    autoLevelDefault: true,
    cameraDistance: 50,
    cameraHeight: 13,
    fovWidenEnabled: false,
    seats: 2,
  },
  F4_PHANTOM: {
    displayName: 'F-4 Phantom',
    hasPropellers: false,
    propellerNodes: [],
    propellerSpinAxis: 'z',
    autoLevelDefault: true,
    cameraDistance: 36,
    cameraHeight: 9,
    fovWidenEnabled: true,
    seats: 1,
  },
};

export function getFixedWingDisplayInfo(key: string): FixedWingDisplayInfo | null {
  return FIXED_WING_DISPLAY[key] ?? null;
}

export function getFixedWingConfigKeyForModelPath(modelPath: string): string | null {
  return FIXED_WING_MODEL_TO_KEY[modelPath] ?? null;
}

export function getFixedWingConfigForModelPath(modelPath: string): FixedWingConfig | null {
  const key = getFixedWingConfigKeyForModelPath(modelPath);
  return key ? FIXED_WING_CONFIGS[key] ?? null : null;
}

export const FIXED_WING_CONFIGS: Record<string, FixedWingConfig> = {
  AC47_SPOOKY: {
    physics: {
      mass: 12000,
      wingArea: 91.7,
      maxThrust: 58000,
      stallSpeed: 32,
      vrSpeed: 36,
      v2Speed: 42,
      maxSpeed: 80,
      throttleResponse: 1.2,
      controlResponse: 3.2,
      cl0: 0.34,
      clAlpha: 4.7,
      clMax: 1.85,
      alphaStallDeg: 14,
      alphaMaxDeg: 24,
      trimAlphaDeg: 4.5,
      cd0: 0.042,
      inducedDragK: 0.065,
      sideForceCoefficient: 1.35,
      elevatorPower: 1.6,
      aileronPower: 1.5,
      rudderPower: 1.0,
      pitchStability: 2.6,
      rollLevelStrength: 1.0,
      yawStability: 2.1,
      pitchDamping: 1.8,
      rollDamping: 2.6,
      yawDamping: 1.7,
      stabilityAssistPitch: 1.4,
      stabilityAssistRoll: 2.6,
      stabilityAssistYaw: 1.8,
      maxPitchRate: 0.9,
      maxRollRate: 0.9,
      maxYawRate: 0.55,
      groundSteering: 0.5,
      groundLateralFriction: 8.0,
      rollingResistance: 0.017,
      brakeDeceleration: 12,
      // Re-banded to the Kiln AC-47 catalog dims (kiln-war-2026-06): the GLB
      // bottoms out 0.24 m below model origin (minY -0.24), so parked clearance
      // seats the landing gear/tailwheel against the runway. The
      // `?aircraftArt=legacy` escape hatch reuses this Kiln-tuned value on the
      // legacy GLB (best-effort; a small parked-height drift is cosmetic).
      gearClearance: 0.24,
      liftoffClearance: 0.2,
      rotationPitchLimitDeg: 11,
      groundEffectStrength: 0.22,
    },
    role: 'gunship',
    pilotProfile: 'gunship',
    operation: {
      minimumRunwayLength: 340,
      preferredSpawnMode: 'parked',
      playerFlow: 'gunship_orbit',
      taxiSpeedMax: 7,
      stoppedSpeedMax: 1.4,
      exitSpeedMax: 2.8,
      approachSpeed: 48,
      orbitRadius: 650,
      orbitBankDeg: 24,
      orbitTurnDirection: -1,
      orbitMinAltitude: 90,
    },
  },

  F4_PHANTOM: {
    physics: {
      mass: 18000,
      wingArea: 49.2,
      maxThrust: 155000,
      stallSpeed: 60,
      vrSpeed: 68,
      v2Speed: 82,
      maxSpeed: 200,
      throttleResponse: 2.4,
      controlResponse: 5.8,
      cl0: 0.12,
      clAlpha: 3.8,
      clMax: 1.35,
      alphaStallDeg: 16,
      alphaMaxDeg: 28,
      trimAlphaDeg: 3.5,
      cd0: 0.024,
      inducedDragK: 0.052,
      sideForceCoefficient: 1.15,
      elevatorPower: 2.8,
      aileronPower: 4.8,
      rudderPower: 1.4,
      pitchStability: 1.9,
      rollLevelStrength: 0.7,
      yawStability: 1.7,
      pitchDamping: 1.5,
      rollDamping: 2.9,
      yawDamping: 1.5,
      stabilityAssistPitch: 1.0,
      stabilityAssistRoll: 1.9,
      stabilityAssistYaw: 1.4,
      maxPitchRate: 1.5,
      maxRollRate: 2.8,
      maxYawRate: 0.95,
      groundSteering: 0.42,
      groundLateralFriction: 8.8,
      rollingResistance: 0.015,
      brakeDeceleration: 18,
      // Re-banded to the Kiln F-4 catalog dims (kiln-war-2026-06): the GLB seats
      // its lowest mesh at model origin (minY 0), so no origin lift is needed.
      // The `?aircraftArt=legacy` escape hatch reuses this on the legacy GLB
      // (best-effort; a small parked-height drift is cosmetic).
      gearClearance: 0.0,
      liftoffClearance: 0.2,
      rotationPitchLimitDeg: 10,
      groundEffectStrength: 0.14,
    },
    role: 'fighter',
    pilotProfile: 'fast_jet',
    operation: {
      // Rechecked for the Kiln F-4 (length 14.12 m vs the legacy 18.82 m):
      // ground roll is physics-driven (Vr 68 m/s, T/W from 155 kN @ 18 t →
      // ~270 m to rotate), not airframe-length-driven, so the shorter Kiln model
      // does not shorten the requirement. 420 m holds with margin.
      minimumRunwayLength: 420,
      preferredSpawnMode: 'parked',
      playerFlow: 'runway',
      taxiSpeedMax: 10,
      stoppedSpeedMax: 2.2,
      exitSpeedMax: 4.5,
      approachSpeed: 90,
    },
  },

  A1_SKYRAIDER: {
    physics: {
      mass: 8200,
      wingArea: 37.2,
      // Arcade-feel tuning from B1 rebuild. Original certified-procedure
      // numbers (50 kN thrust, 1.6/s throttle ramp, Vr=42) meant a 10+ s
      // ground roll; the rebuild targets ~6 s to clear the runway and a
      // climb-out that clears 20 m inside 8 s at full power.
      maxThrust: 95000,
      stallSpeed: 34,
      vrSpeed: 38,
      v2Speed: 46,
      maxSpeed: 120,
      throttleResponse: 4.0,
      controlResponse: 5.0,
      // Arcade-lift wing: cl0 sized so a Skyraider at 50 m/s generates ~1g
      // of lift with wings level (no alpha needed). The rebuild prioritizes
      // "plane holds altitude when you let go of the stick" over historical
      // accuracy. Level-flight cl at cruise = weight / (q * wingArea)
      // ≈ 80 kN / (1531 * 37.2) ≈ 1.41. cl0 is set slightly above to give
      // a small climb margin at trim alpha.
      cl0: 1.55,
      clAlpha: 5.5,
      clMax: 2.6,
      alphaStallDeg: 16,
      alphaMaxDeg: 26,
      trimAlphaDeg: 4.0,
      cd0: 0.032,
      // Induced drag K bumped so cruise speed naturally levels off near
      // 55-65 m/s at mid-throttle. Prevents runaway acceleration that
      // would otherwise push lift way past 1g at a locked altitude.
      inducedDragK: 0.22,
      sideForceCoefficient: 1.2,
      elevatorPower: 1.5,
      aileronPower: 3.2,
      rudderPower: 1.0,
      pitchStability: 2.2,
      rollLevelStrength: 0.9,
      yawStability: 1.9,
      pitchDamping: 1.5,
      rollDamping: 2.5,
      yawDamping: 1.3,
      stabilityAssistPitch: 1.2,
      stabilityAssistRoll: 2.3,
      stabilityAssistYaw: 1.5,
      maxPitchRate: 0.5,
      maxRollRate: 1.7,
      maxYawRate: 0.8,
      groundSteering: 0.6,
      groundLateralFriction: 7.4,
      rollingResistance: 0.014,
      brakeDeceleration: 14,
      // Re-banded to the Kiln A-1 catalog dims (kiln-war-2026-06): the GLB
      // bottoms out just 0.03 m below model origin (minY -0.03), so the parked
      // origin sits 0.03 m over the ground to seat the gear. The
      // `?aircraftArt=legacy` escape hatch reuses this on the legacy GLB
      // (best-effort; a small parked-height drift is cosmetic).
      gearClearance: 0.03,
      liftoffClearance: 0.2,
      rotationPitchLimitDeg: 14,
      groundEffectStrength: 0.35,
      // A-1 has the highest thrust-to-weight of the three aircraft at cruise
      // throttle; the default 0.15 elevator clamp saturates during both the
      // recapture-after-pitch-release transient and hands-off cruise (60 s
      // saturated climb of ~2.2 km at 0.15). The probe sweep at 0.16..0.40
      // shows a narrow stable band: 0.18 still saturates in steady state,
      // 0.30+ over-corrects into a dive-and-not-recover divergence, and
      // 0.20..0.24 is monotone-stable. 0.22 is probe-optimal: recapture
      // peak deviation = 82 m (was 526 m at 0.15), steady-state 60 s peak
      // deviation = 35 m (was 2234 m at 0.15), no oscillation. See
      // docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/
      // a1-altitude-hold-elevator-clamp/.
      altitudeHoldElevatorClamp: 0.22,
    },
    role: 'attack',
    pilotProfile: 'trainer',
    operation: {
      minimumRunwayLength: 280,
      preferredSpawnMode: 'parked',
      playerFlow: 'runway',
      taxiSpeedMax: 8,
      stoppedSpeedMax: 1.8,
      exitSpeedMax: 3.4,
      approachSpeed: 55,
    },
  },
};

// Both the legacy and Kiln (kiln-war-2026-06) GLB paths map to the same flight
// config key, so the airfield/visual layer resolves a config whichever art the
// `__aircraftArt` kill-switch selects for a parking spot.
const FIXED_WING_MODEL_TO_KEY: Record<string, string> = {
  [AircraftModels.A1_SKYRAIDER]: 'A1_SKYRAIDER',
  [AircraftModels.A_1_SKYRAIDER_SPAD]: 'A1_SKYRAIDER',
  [AircraftModels.F4_PHANTOM]: 'F4_PHANTOM',
  [AircraftModels.F_4_PHANTOM_II]: 'F4_PHANTOM',
  [AircraftModels.AC47_SPOOKY]: 'AC47_SPOOKY',
  [AircraftModels.AC_47_SPOOKY_GUNSHIP]: 'AC47_SPOOKY',
};

/**
 * Dormant fixed-wing registrations (cycle-2026-06-11-war-asset-repaint).
 *
 * These net-new repaint airframes ship in the war-asset catalog but carry no
 * flight config yet, so they are NOT runway-enterable / spawnable as flyable
 * aircraft. They are catalogued here so the gallery review route and follow-up
 * tasks can enumerate them with display names + measured dims without re-deriving
 * the slug mapping:
 *
 *  - B-52 Stratofortress — arclight bomber. Its high-altitude flight profile is
 *    added by the air-support / arclight task, not here.
 *  - C-130 Hercules, OV-10 Bronco, MiG-17 (NVA) — role systems pending; static /
 *    scenery + future cycles.
 *  - A-37 Dragonfly — flagged as a scale re-roll advisory (catalog 5.48 m long
 *    vs real ~8.6 m); cataloged dormant until re-rolled.
 */
export interface DormantFixedWingInfo {
  readonly displayName: string;
  readonly slug: string;
  /** True when the airframe is flagged for an asset scale re-roll. */
  readonly scaleRerollAdvisory: boolean;
}

const FIXED_WING_DORMANT: Record<string, DormantFixedWingInfo> = {
  B52_STRATOFORTRESS: { displayName: 'B-52 Stratofortress', slug: 'b52-stratofortress', scaleRerollAdvisory: false },
  C130_HERCULES: { displayName: 'C-130 Hercules', slug: 'c130-hercules', scaleRerollAdvisory: false },
  OV10_BRONCO: { displayName: 'OV-10 Bronco', slug: 'ov10-bronco', scaleRerollAdvisory: false },
  A37_DRAGONFLY: { displayName: 'A-37 Dragonfly', slug: 'a37-dragonfly', scaleRerollAdvisory: true },
  MIG17_NVA: { displayName: 'MiG-17 (NVA)', slug: 'mig17-nva', scaleRerollAdvisory: false },
};

/** Dormant (cataloged, not-yet-flyable) fixed-wing airframe keys. */
export function getDormantFixedWingKeys(): string[] {
  return Object.keys(FIXED_WING_DORMANT);
}

/** Resolve dormant-airframe display info for a registry key (null if unknown). */
export function getDormantFixedWingInfo(key: string): DormantFixedWingInfo | null {
  return FIXED_WING_DORMANT[key] ?? null;
}

/**
 * Minimal high-altitude flight profile for the B-52 Arc Light strike
 * (cycle-2026-06-11-war-asset-repaint).
 *
 * The B-52 is NOT player-flyable this cycle — it is deliberately kept out of
 * `FIXED_WING_CONFIGS` so `isFixedWingRunwayEnterable('B52_STRATOFORTRESS')`
 * stays false and the airframe remains a dormant catalog entry. This profile
 * exists only to drive the airborne `NPCFlightController` for the air-support
 * sortie: a single straight, high-altitude run-in over the marked heading with
 * no orbit. The numbers are heavy-bomber-shaped (high mass and cruise speed,
 * gentle control authority, large turn radius) but are not tuned for ground
 * handling or takeoff/landing, since the sortie spawns airborne and despawns
 * outbound. Values track the AC-47 gunship profile's structure (the other large
 * multi-engine plane) scaled up for a bomber.
 */
export const B52_ARCLIGHT_PHYSICS: FixedWingPhysicsConfig = {
  mass: 100000,
  wingArea: 370,
  maxThrust: 540000,
  stallSpeed: 70,
  vrSpeed: 80,
  v2Speed: 95,
  maxSpeed: 200,
  throttleResponse: 0.8,
  controlResponse: 1.6,
  cl0: 0.30,
  clAlpha: 4.6,
  clMax: 1.6,
  alphaStallDeg: 13,
  alphaMaxDeg: 22,
  trimAlphaDeg: 3.5,
  cd0: 0.030,
  inducedDragK: 0.055,
  sideForceCoefficient: 1.4,
  elevatorPower: 1.0,
  aileronPower: 0.9,
  rudderPower: 0.8,
  pitchStability: 2.8,
  rollLevelStrength: 1.1,
  yawStability: 2.3,
  pitchDamping: 2.2,
  rollDamping: 3.0,
  yawDamping: 2.0,
  stabilityAssistPitch: 1.6,
  stabilityAssistRoll: 2.8,
  stabilityAssistYaw: 2.0,
  maxPitchRate: 0.4,
  maxRollRate: 0.5,
  maxYawRate: 0.35,
  groundSteering: 0.3,
  groundLateralFriction: 8.0,
  rollingResistance: 0.018,
  brakeDeceleration: 10,
  // The repaint B-52 catalog entry seats its lowest mesh at model origin
  // (minY 0); the run-in flies at altitude, so gear clearance is nominal.
  gearClearance: 0.0,
  liftoffClearance: 0.2,
  rotationPitchLimitDeg: 8,
  groundEffectStrength: 0.12,
};

export function isFixedWingRunwayEnterable(key: string): boolean {
  return Boolean(FIXED_WING_CONFIGS[key]);
}

export function getFixedWingInteractionPriority(key: string): number {
  const profile = FIXED_WING_CONFIGS[key]?.pilotProfile ?? 'trainer';
  switch (profile) {
    case 'trainer':
      return 0;
    case 'fast_jet':
      return 1;
    case 'gunship':
    default:
      return 2;
  }
}
