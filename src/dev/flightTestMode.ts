/**
 * Flight test mode entry guard.
 *
 * Activated by `?mode=flight-test` on the URL. When active, bootstrap skips the
 * normal GameEngine wire-up and runs the isolated FlightTestScene instead so a
 * human (or agent) can validate the input → physics → render path without AI,
 * combat, LOD, objectives, terrain streaming, or HUD noise.
 *
 * See docs/tasks/A1-plane-test-mode.md for the motivating task.
 */

const FLIGHT_TEST_MODE_PARAM = 'mode';
const FLIGHT_TEST_MODE_VALUE = 'flight-test';

export function isFlightTestMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get(FLIGHT_TEST_MODE_PARAM) === FLIGHT_TEST_MODE_VALUE;
}
