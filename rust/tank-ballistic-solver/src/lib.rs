//! Tank ballistic-solver pilot crate.
//!
//! First Rust->WASM pilot for the project per
//! `docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` §3.5. Deliberately
//! tiny: one entry point, gravity-only ballistic integrator, no external
//! physics libraries (per the cycle hard-stop). Mirrors the gravity-only
//! arc the TS reference `TankCannonProjectileSystem` uses (`GRAVITY =
//! -9.8 m/s^2`, explicit Euler at 1/60 s). The pilot's job is to validate
//! the toolchain and benchmark surface, not to add new physics.
//!
//! The pilot lives behind a TS wrapper (`TankBallisticSolver.ts`) that
//! dispatches to WASM when initialized and falls back to a TS reference
//! when WASM is unavailable (non-browser, init failure). Both code paths
//! produce numerically identical trajectory samples within float
//! tolerance.

use wasm_bindgen::prelude::*;

/// One sample of the projectile's flight. Mirrors the TS-side
/// `TrajectorySample` shape one-for-one. Used by the host-side cargo
/// tests; the WASM-bridged surface uses the flat `Vec<f32>` route in
/// `solve_trajectory_flat` to avoid per-sample externref allocations.
#[derive(Clone, Copy, Debug)]
pub struct TrajectorySample {
    pub time: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

const STEP_SECONDS: f32 = 1.0 / 60.0;
const MAX_FLIGHT_SECONDS: f32 = 30.0;
const MAX_SAMPLES: usize = ((MAX_FLIGHT_SECONDS / STEP_SECONDS) as usize) + 1;

/// Solve a gravity-only ballistic trajectory; return packed `[time, x, y, z]`
/// quads. The TS-side wrapper rehydrates these into the same
/// `TrajectorySample` object shape the TS reference produces.
///
/// * `v` — muzzle speed (m/s).
/// * `angle` — launch pitch in radians (positive = above horizontal). Launch
///   azimuth is the +XZ direction from the origin to (targetX, _, targetZ).
/// * `target_x`, `target_y`, `target_z` — world-space target position. The
///   integrator terminates the moment the projectile crosses the target's
///   XZ plane (horizontal travel >= target horizontal distance) or after
///   `MAX_FLIGHT_SECONDS`, whichever fires first.
/// * `gravity` — vertical acceleration (m/s^2). Pass `-9.8` for the
///   project's canonical value.
///
/// Returns a Vec of f32 of length `4 * sample_count`. The trajectory
/// origin is always `(0, 0, 0)` — callers translate into world space as
/// needed.
#[wasm_bindgen(js_name = solveTrajectoryFlat)]
pub fn solve_trajectory_flat(
    v: f32,
    angle: f32,
    target_x: f32,
    target_y: f32,
    target_z: f32,
    gravity: f32,
) -> Vec<f32> {
    let samples = solve_trajectory_native(v, angle, target_x, target_y, target_z, gravity);
    let mut out: Vec<f32> = Vec::with_capacity(samples.len() * 4);
    for s in &samples {
        out.push(s.time);
        out.push(s.x);
        out.push(s.y);
        out.push(s.z);
    }
    out
}

/// Native-side implementation factored out so unit tests can call it
/// without going through wasm-bindgen.
pub fn solve_trajectory_native(
    v: f32,
    angle: f32,
    target_x: f32,
    _target_y: f32,
    target_z: f32,
    gravity: f32,
) -> Vec<TrajectorySample> {
    // Azimuth from origin to target XZ plane. Degenerate (target at origin)
    // degrades to +Z forward to mirror the TS reference's NaN-guard.
    let horiz_len = (target_x * target_x + target_z * target_z).sqrt();
    let (cos_az, sin_az) = if horiz_len < 1e-6 {
        (0.0_f32, 1.0_f32)
    } else {
        (target_x / horiz_len, target_z / horiz_len)
    };

    let cos_pitch = angle.cos();
    let sin_pitch = angle.sin();

    let vx = v * cos_pitch * cos_az;
    let mut vy = v * sin_pitch;
    let vz = v * cos_pitch * sin_az;

    let mut x = 0.0_f32;
    let mut y = 0.0_f32;
    let mut z = 0.0_f32;
    let mut t = 0.0_f32;

    let mut samples: Vec<TrajectorySample> = Vec::with_capacity(MAX_SAMPLES);
    samples.push(TrajectorySample { time: t, x, y, z });

    // The TS-plane "passed the target" check is direction-aware: we compare
    // the projected horizontal distance against the target horizontal
    // distance, so the integrator terminates regardless of azimuth sign.
    let target_horiz = horiz_len;

    while t < MAX_FLIGHT_SECONDS {
        // Explicit-Euler step. Matches `MortarBallistics` + the TS
        // `TankCannonProjectileSystem.update()` path.
        vy += gravity * STEP_SECONDS;

        x += vx * STEP_SECONDS;
        y += vy * STEP_SECONDS;
        z += vz * STEP_SECONDS;
        t += STEP_SECONDS;

        samples.push(TrajectorySample { time: t, x, y, z });

        let horiz_now = (x * x + z * z).sqrt();
        if horiz_now >= target_horiz {
            break;
        }
    }

    samples
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_sample_is_origin() {
        let samples = solve_trajectory_native(400.0, 0.1, 1000.0, 0.0, 0.0, -9.8);
        assert!(!samples.is_empty());
        let s0 = samples[0];
        assert_eq!(s0.time, 0.0);
        assert_eq!(s0.x, 0.0);
        assert_eq!(s0.y, 0.0);
        assert_eq!(s0.z, 0.0);
    }

    #[test]
    fn terminates_after_target_plane() {
        let samples = solve_trajectory_native(400.0, 0.05, 500.0, 0.0, 0.0, -9.8);
        let last = samples.last().expect("samples non-empty");
        let horiz = (last.x * last.x + last.z * last.z).sqrt();
        assert!(horiz >= 500.0, "horizontal travel {horiz} must reach target");
        // Must terminate well below the 30 s max.
        assert!(last.time < 30.0);
    }

    #[test]
    fn terminates_at_max_flight_time_for_unreachable_target() {
        // High-pitch lob with target far past muzzle energy + gravity
        // budget — projectile lands short, but the integrator stops when
        // it crosses the XZ plane (horizontal travel >= target horizontal).
        // To force the max-time stop, point the target so far that even a
        // hot launch can't reach it within 30 s.
        let samples = solve_trajectory_native(400.0, 1.4, 100_000.0, 0.0, 0.0, -9.8);
        let last = samples.last().expect("samples non-empty");
        // At 1.4 rad pitch, horizontal velocity is v*cos(1.4) ~ 68 m/s;
        // in 30 s that's ~2040 m horizontal. Far short of 100km target,
        // so the integrator must exit on time, not target plane.
        assert!(last.time >= 30.0 - STEP_SECONDS);
    }

    #[test]
    fn step_count_matches_target_horizontal() {
        let samples = solve_trajectory_native(400.0, 0.1, 800.0, 0.0, 0.0, -9.8);
        // Horizontal velocity component = 400 * cos(0.1) ~ 398. Time-to-target =
        // 800 / 398 ~ 2.01 s, which is ~120 steps. We expect ~121 samples
        // (origin + 120 steps). Tolerance: a step or two either side.
        assert!(samples.len() >= 119, "got {} samples", samples.len());
        assert!(samples.len() <= 123, "got {} samples", samples.len());
    }
}
