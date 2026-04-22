import { FIXED_WING_CONFIGS } from '../../../systems/vehicle/FixedWingConfigs';
import type { PaneLike, TuningState } from '../LiveTuningPanel';

/**
 * Flight-tier knobs: per-aircraft `altitudeHoldElevatorClamp`. The PD-gain
 * fields listed in the cycle brief (`altitudeHoldPGain`/`DGain`, `pitchDamperGain`)
 * are NOT on `FixedWingPhysicsConfig` today — Airframe uses hardcoded PD
 * gains. Per "Hide the knob if the target is not available" we omit them.
 */

const K_A1 = 'flight.a1.altitudeHoldElevatorClamp';
const K_F4 = 'flight.f4.altitudeHoldElevatorClamp';
const K_AC47 = 'flight.ac47.altitudeHoldElevatorClamp';

export function captureAirframeDefaults(): TuningState {
  return {
    [K_A1]: FIXED_WING_CONFIGS.A1_SKYRAIDER?.physics.altitudeHoldElevatorClamp ?? 0.22,
    [K_F4]: FIXED_WING_CONFIGS.F4_PHANTOM?.physics.altitudeHoldElevatorClamp ?? 0.15,
    [K_AC47]: FIXED_WING_CONFIGS.AC47_SPOOKY?.physics.altitudeHoldElevatorClamp ?? 0.15,
  };
}

export function applyAirframeState(state: TuningState): void {
  const a1 = FIXED_WING_CONFIGS.A1_SKYRAIDER;
  const f4 = FIXED_WING_CONFIGS.F4_PHANTOM;
  const ac47 = FIXED_WING_CONFIGS.AC47_SPOOKY;
  if (a1) a1.physics.altitudeHoldElevatorClamp = num(state[K_A1], a1.physics.altitudeHoldElevatorClamp);
  if (f4) f4.physics.altitudeHoldElevatorClamp = num(state[K_F4], f4.physics.altitudeHoldElevatorClamp);
  if (ac47) ac47.physics.altitudeHoldElevatorClamp = num(state[K_AC47], ac47.physics.altitudeHoldElevatorClamp);
}

export function bindAirframeKnobs(pane: PaneLike, state: TuningState, onChange: () => void): void {
  const folder = pane.addFolder({ title: 'Flight', expanded: false });
  if (FIXED_WING_CONFIGS.A1_SKYRAIDER) {
    folder.addBinding(state, K_A1, { label: 'A-1 elev clamp', min: 0.10, max: 0.40, step: 0.01 }).on('change', onChange);
  }
  if (FIXED_WING_CONFIGS.F4_PHANTOM) {
    folder.addBinding(state, K_F4, { label: 'F-4 elev clamp', min: 0.10, max: 0.30, step: 0.01 }).on('change', onChange);
  }
  if (FIXED_WING_CONFIGS.AC47_SPOOKY) {
    folder.addBinding(state, K_AC47, { label: 'AC-47 elev clamp', min: 0.10, max: 0.30, step: 0.01 }).on('change', onChange);
  }
}

function num(v: unknown, fallback: number | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
