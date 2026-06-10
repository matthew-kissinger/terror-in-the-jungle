<!-- cycle-2026-06-09-foliage-npc-lighting R2; follows billboard-rig-migration -->
# npc-impostor-and-effects-rig

The NPC impostor family is the last unlit consumer off the rig: it re-scans
`scene.children` for light objects (the "second authority" from the memo) and
shows the same clamp signature the billboards had (rig-on corr 0.817).
Migrate it to the SAME tuned wrapped-Lambert response `billboard-rig-migration`
landed, delete the scene scanning on the rig path, and sweep the remaining
lit-surface stragglers. (Folds the manifest's `effects-prop-pass` into this
task — same dispatch round, small surface.) Spec:
`docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md`.

## Files touched

- `src/systems/combat/CombatantShaders.ts` (+ test) — rig-path consumption of
  the shared bindings; `resolveNpcAtmosphereSnapshot` scene-children scan
  bypassed when the flag is ON (deletion happens Phase 4)
- `src/core/SystemUpdater.ts` — wiring only if required
- Grep-driven sweep (read-mostly): remaining `AtmosphereLightingSnapshot` /
  `getLightingSnapshot` consumers (tracers/impact/explosion pools, water-era
  leftovers) — each either consumes the rig on the rig path or is documented
  unlit; list every site + verdict in the PR body

## Scope

0. **FIX THE INSTRUMENT FIRST** (finding from billboard-rig-migration PR
   #376): the sweep's `foliage` and `npc` sample regions are fixed fallback
   boxes that land on bare terrain — terrain-vs-terrain rows. In
   `scripts/capture-tod-coherence-sweep.ts`, anchor both regions on actual
   billboard/impostor pixels (project known world anchors to screen, the way
   the `glb` row already does). Re-baseline after the fix; all band numbers
   below are against the FIXED instrument.
1. NPC impostors consume `lightingRigBindings` directly on the rig path with
   the SAME response (wrap/attenuation constants) the billboard migration
   tuned — no per-family re-tune; share constants via import, not copy.
2. Rig path skips `resolveNpcAtmosphereSnapshot`'s scene scanning entirely
   (single authority); legacy path byte-identical when OFF.
3. Effects/prop sweep: enumerate remaining snapshot consumers; migrate any
   that visibly diverge under the rig (tracers/explosions are emissive —
   likely "documented unlit"); no speculative changes.
4. A/B with the FIXED instrument (`--label=p2b-off/p2b-on --rig-on`):
   foliage AND npc corrVsTerrain ≥ 0.92 with rangeRatio [0.6, 1.6] with the
   flag ON — this is the first run where those rows measure real pixels, so
   it also retroactively validates billboard-rig-migration's tuning; if the
   foliage band fails on the fixed instrument, tune the SHARED constants
   (billboard + NPC together) until it passes or report the structural
   blocker. Paste tables.

## Non-goals

- No billboard re-tuning (consume its constants).
- No exposure/preset/fog work (Phase 3).
- No deletions (Phase 4 owns removing the scan + legacy paths).
- No combat AI/behavior changes (shader/lighting only).

## Acceptance

- [ ] p2b-on: NPC family inside the band; foliage holds; all TODs measurable.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief; combat-reviewer gates (touches
      `src/systems/combat/**`).

## Round 2 / Dependencies

- Depends on: `billboard-rig-migration` (merged).
- Closes Phase 2 of the lighting campaign; Phase 3 (exposure/fog/presets)
  follows.
