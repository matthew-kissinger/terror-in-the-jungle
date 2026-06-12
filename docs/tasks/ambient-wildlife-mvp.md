# ambient-wildlife-mvp

First life in the jungle: a minimal ambient `WildlifeSystem` spawns ground
animals (tiger, water-buffalo, wild-boar, macaque) that wander the jungle and
flee from the player. Closes the "12 animal assets, zero consumers" gap with a
user-observable feature instead of dead files. Part of
`cycle-2026-06-11-war-asset-repaint` (audit memo: no wildlife system or
remnants exist in src/ — this is greenfield). DROPPABLE: if the round goes
red, this task defers to backlog without blocking cycle close.

## Files touched

- `src/systems/wildlife/WildlifeSystem.ts` (new, + sibling
  `WildlifeSystem.test.ts` — required for new `src/systems/**`)
- `src/config/WildlifeConfig.ts` (new; roster, caps, distances as named
  constants)
- `SystemInitializer` + declarative schedule metadata (new system rule from
  AGENTS.md "Patterns to Avoid")
- SPDX headers on all new first-party files (relicense policy)

## Scope

1. `WildlifeSystem` (implements `GameSystem`): spawn up to ~8 active animals
   from the roster in jungle-biased cells ≥150m from objectives/bases and
   ≥80m from the player; despawn beyond ~300m or on combat proximity. Use
   `ITerrainRuntime` height queries for ground clamp (NOT navmesh — keep it
   cheap); `SimulationScheduler` low-cadence group.
2. Behavior: slow wander (heading + speed noise, slope-limited) with
   player-proximity flee (<25m triggers a burst away, then despawn-fade at
   range). No combat interaction, no damage, no audio this MVP.
3. Models from `warAssetCatalog` (`models/animals/`), loaded via the shared
   `modelLoader`, X→+Z normalized by the importer, yawed to heading; shadows
   on; frustum culling default.
4. Spawn only in Open Frontier + A Shau initially (config-gated per mode;
   combat120 harness must stay animal-free — assert in test).
5. L2 behavior tests: spawn respects exclusion distances; flee triggers and
   despawns; system disposes cleanly; zero spawns in combat120 harness config.

## Non-goals

- No birds/reptiles this cycle (egret is a size re-roll; others stay
  catalog/gallery-only). No animal AI beyond wander+flee (no herds, no
  predator behavior). No huntable/damage interactions. No audio. No navmesh
  coupling.

## Acceptance

- [ ] Screenshot set: tiger/buffalo/boar/macaque in OF jungle, ground-clamped,
      correctly scaled vs an NPC, committed to
      `artifacts/cycle-war-asset-repaint/wildlife/`.
- [ ] combat120 capture shows zero WildlifeSystem cost (system absent or
      0-entity; named in the capture's per-system telemetry if present).
- [ ] New-system wiring follows SystemInitializer + schedule metadata rules;
      `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Depends on: `war-asset-import-pipeline`.
- Droppable without blocking cycle close (orchestrator may defer to BACKLOG).
