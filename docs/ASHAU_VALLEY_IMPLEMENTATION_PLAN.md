# A Shau Valley Implementation Plan

Last updated: 2026-02-25
Status: Active
Owner: Matt + Codex

## Mission

Make A Shau Valley a reliable large-scale mode with:
- grounded spawn/respawn behavior
- tactical contact markers that match visible enemies
- fast time-to-contact and sustained skirmish flow
- clear separation of harness behavior vs real gameplay

## Current State Summary

Working:
- War simulator authority model is in place for strategic population.
- Grounding logic improved via terrain-resolved spawn/materialization paths.
- Frontline seeding and respawn candidate scoring improved first-contact timing.

Still failing intermittently:
- occasional spawn/grounding anomalies in edge terrain/loading cases
- HUD/map contact fidelity mismatches (marker present, no visible enemy nearby)
- sustained close-range combat pressure drifts out over time

## Phase Plan

### Phase 1: Spawn and Grounding Reliability

- [x] Run 10 start-spawn checks and 10 respawn checks in A Shau.
- [~] Verify no air spawn, fall-through, or multi-meter snap artifacts. (Improved; occasional edge-terrain anomalies remain)
- [x] Validate terrain-ready gating around insertion points.

Acceptance:
- 20/20 grounding checks pass.

### Phase 2: Tactical Contact Fidelity

- [ ] Define tactical vs strategic marker policy in UI.
- [ ] Ensure default HUD/minimap guidance prioritizes tactical-confirmed contacts.
- [ ] Add debug counters for nearby tactical contacts vs strategic-only markers.

Acceptance:
- Player can navigate to tactical marker and see engageable enemies in repeated tests.

### Phase 3: Time-To-Contact and Flow

- [x] Keep first engagement within 60-120 seconds. (Frontline seeding improved first-contact timing)
- [~] Reduce long wandering loops around non-contact zones. (AShauContactAssist auto-warps after 60s no-contact)
- [ ] Maintain sustained skirmish pressure at 5-minute checkpoint. (Still unstable)

Acceptance:
- `first_contact <= 120s` and non-zero close-contact density at sustained checkpoint.

### Phase 4: Harness Realism Controls

- [ ] Confirm harness invulnerability/auto-heal/auto-respawn flags are explicit and documented.
- [ ] Verify normal gameplay is unaffected by harness-only movement/recovery logic.

Acceptance:
- Realistic damage/death behavior reproducible with harness assists disabled.

## Validation Matrix

- [ ] `npm run build`
- [ ] Targeted tests for touched systems
- [ ] Manual A Shau pass:
  - [ ] start spawn
  - [ ] respawn
  - [ ] tactical marker fidelity
  - [ ] first-contact timing
  - [ ] sustained engagement quality

## Evidence (Latest Known)

- A Shau diagnostics runs show first-contact improvement but inconsistent sustained close-contact.
- Recent work improved post-respawn contact quality; sustained 5-minute close-contact remains unstable.

## Update Protocol

For each iteration:
1. Record the change scope.
2. Record validation commands and result.
3. Record artifact path if diagnostics/perf run was used.
4. Keep only behavior-valid improvements.
