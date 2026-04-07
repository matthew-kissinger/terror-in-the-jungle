# Fixed-Wing Airfield Recovery Plan

Last updated: 2026-04-07

## Scope

This pass fixes the current fixed-wing/airfield contract end to end without rewriting the full vehicle stack.

## Goals

- Replace the decorative airfield layout with an operable runway/apron layout.
- Make runway and apron terrain shaping directional and flat enough for takeoff, landing, and parking.
- Fix generated fixed-wing parking so aircraft spawn side-by-side on stands instead of collapsing into a bad longitudinal row.
- Align current fixed-wing content with the airfield templates that host it.
- Add tests and live validation so the same regressions do not come back.

## Tasks

- [x] Rebuild `AirfieldTemplates` around longer runways, apron geometry, and explicit stand layout.
- [x] Fix `AirfieldLayoutGenerator` so generated aircraft offsets stay in feature-local space and do not get double-rotated at spawn time.
- [x] Compile airfield-specific terrain stamps from the layout instead of relying on the old circular flatten pass.
- [x] Extend airfield surface generation to include apron/taxi geometry that matches the new stand layout.
- [x] Align Open Frontier and A Shau airfield feature footprints/clear zones with the new runway/apron sizes.
- [x] Add compatibility metadata/tests so template-hosted aircraft are validated against the runway contract.
- [x] Validate the result with targeted tests plus a live Open Frontier browser probe.

## Outcome

- Open Frontier main airfield now uses a `480m x 28m` runway, a dedicated apron, and three side-by-side fixed-wing stands.
- Airfield terrain is compiled from runway/apron/taxi geometry using directional capsule stamps, which eliminated the old circular-flatten hump and the broken stand elevations.
- Generated fixed-wing parking now stays in feature-local space, so rotated airfields no longer double-rotate aircraft into a bad longitudinal line.
- Compatibility guards now validate fixed-wing parking against runway length requirements.

## Validation

- `npm run validate`: PASS
- `npm run perf:capture:openfrontier:short`: PASS with warn-only tail (`artifacts/perf/2026-04-07T05-49-35-671Z`)
- `npm run perf:compare -- --scenario openfrontier:short`: `7 pass / 1 warn / 0 fail`
- Settled Open Frontier probe confirmed:
  - runway heights at `x=80,200,320,440,560 / z=-1230`: all `14.94`
  - fixed-wing stand heights at `x=238,320,402 / z=-1326`: all `13.84`
  - fixed-wing spawn positions: `(238,14.34,-1326)`, `(320,14.34,-1326)`, `(402,14.34,-1326)`

## Non-Goals For This Pass

- Full JSBSim-style flight dynamics replacement.
- New AI taxi/takeoff/landing autopilot.
- Helicopter control redesign.

## Follow-On Direction

After this pass, the next safe upgrade is to split fixed-wing operations by role:

- A-1: rough-field attack aircraft
- AC-47: orbit-first gunship workflow
- F-4: runway/air-start fast-jet workflow with stronger assist
