# Dead-code triage 2026-04-21

Scope: `cycle-2026-04-21-stabilization-reset`.

## Removed

- `src/systems/agent/index.ts`
  - Unused barrel only. Live agent code is imported directly from concrete
    modules such as `createAgentControllerFromEngine`.
- `src/systems/vehicle/airframe/index.ts`
  - Unused barrel only. It also pointed at non-merged E6 design docs.
- `src/systems/vehicle/airframe/configs.ts`
  - Unused duplicate fixed-wing config source. Production now keeps
    `FixedWingConfigs.ts` plus `airframeConfigFromLegacy(...)` as the single
    runtime source of truth until a future vehicle rework deliberately changes
    that contract.
- `scripts/npc-fw-pilot-trace.ts`
  - One-off trace evidence for the NPC fixed-wing pilot task. Current coverage
    lives in tests plus `npm run probe:fixed-wing`.

## Retained but ignored by Knip

- `scripts/capture-*-shots.ts`
  - Historical visual-evidence scripts referenced by archived atmosphere cycle
    docs. They are not active runtime entry points, but keeping the commands
    reproducible is useful when reviewing old screenshot evidence.
- `tools/generate-*.mjs`
  - One-off GLB generator scripts for existing vehicle assets. They are not
    part of active validation or runtime, but they document how generated GLBs
    were authored.
- `gh`
  - External CLI used by deploy scripts. Knip cannot infer that binary from the
    GitHub workflow context.

## Export hygiene

The cleanup also removed accidental value exports and type-only public
surfaces that had no consumers. `npm run deadcode` now reports no findings.
