# Tasks

Last updated: 2026-02-25
Last synced with ARCHITECTURE_RECOVERY_PLAN.md: 2026-02-25

> Lightweight task subset. See `docs/ARCHITECTURE_RECOVERY_PLAN.md` for full priority board and decision log.

## P0 - Stability

- [ ] A Shau spawn/respawn grounding reliability pass (20/20 manual checks)
- [ ] Tactical marker fidelity: map/HUD contact must match visible enemy presence
- [ ] Remove random/erratic AI firing behavior in low-confidence targeting states

## P1 - Performance Frontier

- [ ] Complete F3 spatial ownership migration and retire duplicate sync paths
- [ ] Isolate retained heap growth sources in combat-heavy runs
- [ ] Lock matched A/B evidence before flipping `spatialSecondarySync=0` default

## P2 - Gameplay Flow

- [ ] A Shau sustained skirmish pressure at 5-minute checkpoint
- [ ] Reduce long no-contact wandering loops in large-world modes
- [ ] Add clearer insertion-to-objective flow for large-scale testability

## P3 - Content

- [ ] Fill Priority 1 combat audio backlog (`docs/AUDIO_ASSETS_NEEDED.md`)
- [ ] Add helicopter gameplay integration specific to A Shau flow

## P4 - UX

- [ ] Improve full-map and minimap tactical clarity (tactical vs strategic layers)
- [ ] Finalize mobile parity for major gameplay actions
