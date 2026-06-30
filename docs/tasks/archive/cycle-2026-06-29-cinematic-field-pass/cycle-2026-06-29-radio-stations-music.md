<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase 4). -->
# cycle-2026-06-29-radio-stations-music

Phase 4 — replace the single (removed) music loop with several selectable radio
stations the player tunes from the radio dial. In-game music has never really
existed, so this is net-new: a headless `RadioStationSystem` with lazy-decoded,
license-clean station tracks. Default OFF (especially on touch — no cellular
auto-download). UI hookup joins the dial at P3d.

## Files touched

- `src/systems/audio/RadioStationSystem.ts` (+ `.test.ts`, new)
- `src/config/radioStations.ts` (new)
- `src/config/SettingsManager.ts` (+ test), `src/ui/loading/SettingsModal.ts`
- `src/systems/audio/AudioDuckingSystem.ts`, `src/ui/.../MobilePauseOverlay.ts`
- `public/assets/audio/music/*` + `docs/asset-provenance/audio-2026-06/*` (attribution)

## Scope

1. `RadioStationSystem`: station list, lazy decode + capped cache (≤2 buffers — each decoded track is ~28MB; touch = 1-buffer hard-cut), separate music GainNode, 1.5s crossfade, localStorage `lastStationId`.
2. Source stations: tense/combat = incompetech CC-BY (Volatile Reaction, Five Armies); ambient = Bartmann CC0 drones; AFN = hand-verified CC-BY surf. Opus stereo 64-96kbps, lazy-loaded.
3. Settings: `musicVolume`/`ambientVolume`/`musicEnabled` (music OFF, ambient ON) + sliders; music ducking gated entirely behind `musicEnabled`.

## Non-goals

- NO copyrighted 1960s hits; NO NC/ND-licensed tracks; NO eager bundling of music.
- The dial/slot UI is `radio-dial-revival` (P3d wires STATIONS to this system).
- Keep pause behavior as-is (`masterVolume(0)` already silences correctly) unless playtest says otherwise.

## Acceptance

- [ ] Player tunes between stations with crossfade; a test asserts ≤2 decoded buffers held.
- [ ] Music default OFF on touch; attribution finalized; SPDX on new source.
- [ ] `npm run lint && npm run test:run && npm run build` green; fence-safe.

## Dependencies

- Headless core can land parallel with P3a/P3b; STATIONS UI joins at P3d (`radio-dial-revival`).
