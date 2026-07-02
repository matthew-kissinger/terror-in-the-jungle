<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# small-truth-fixes

Five verified, surgical, owner-independent truth fixes (campaign
greenlight-followthrough, Wave-1 fix-now batch 4). None change gameplay feel;
each removes a lie the code told a reader (a perf report that always blamed the
wrong system, a launcher log that named the wrong weapon, a write-only field
that implied the module could hurt the player, a dead audio entry every client
fetched, and an orphaned music track shipped in every deploy artifact).

## Files touched

- `scripts/perf-tail-attribution.ts` + `scripts/perf-tail-attribution.test.ts`
- `src/systems/weapons/GrenadeSystem.ts`
- `src/systems/combat/CombatantDamage.ts` + `.test.ts`, `src/systems/combat/CombatantCombat.ts`
- `src/config/audio.ts` + `docs/asset-provenance/audio-2026-06/zone-captured-sting.provenance.json`
- `src/config/radioStations.ts`, `THIRD-PARTY-ASSETS.md`, `docs/asset-provenance/audio-2026-06/README.md`, `public/assets/audio/music/station-ossuary-air.ogg` (deleted)

## Scope

1. Tail-attribution: when runtime `systemTop` is empty (the default capture never
   sets the diagnostics flags), fall back to the slowest `loopFrameBreakdown`
   entry's `systemTimings` for combat/topSystem, tagged `source:
   'loop-frame-lastMs'` (worst-frame lastMs, NOT EMA — semantics preserved).
2. `GrenadeSystem.spawnProjectile` log: interpolate `killFeedWeaponType ?? 'M79'`
   so helicopter/air-support rockets stop logging as "M79 grenade launched".
3. Delete the write-only `playerHealthSystem` field + setter + import in
   `CombatantDamage.ts`, drop the forwarding call in `CombatantCombat.ts`, update
   the test. Live player-damage path (CombatantCombat's own ref) untouched.
4. Delete the dead `zoneCaptured` `SOUND_CONFIGS` entry (handler plays the
   `zoneCapturedLocal` pool); keep the `.ogg` on disk; annotate provenance.
5. Delete orphaned `station-ossuary-air.ogg` (zero code refs) + fix stale "three
   tracks" texts; retire its CC-BY attribution (no longer distributed).

## Non-goals

- No changes to `CombatantSystemDamage.ts` (sibling task/player-explosion-damage owns it).
- No touch to the adjacent audio/stats calls in `spawnProjectile`.
- No deletion of `zoneCaptured.ogg` from disk (rollback insurance) or the
  `station-ossuary-air.provenance.json`/`fetch-stations.sh` history records.

## Acceptance

- [ ] `npm run typecheck && npm run lint` pass; focused tests green.
- [ ] Zero gameplay behavior change (invisible truth fixes).
- [ ] PR opened against `master`, combat-reviewer signs off.

## Dependencies

- Sibling: `task/player-explosion-damage` (disjoint file scope — compatible).
