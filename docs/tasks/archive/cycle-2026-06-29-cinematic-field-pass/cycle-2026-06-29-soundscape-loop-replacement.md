<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase 1). Sourcing in plan. -->
# cycle-2026-06-29-soundscape-loop-replacement

Phase 1 — the owner's #1 audio ask: kill the annoying always-on jungle loop.
Replaces the naive `AmbientSoundManager` two-clip sequencer with a layered
day/night `SoundscapeDirector` (persistent beds + randomized one-shot wildlife),
crossfading on time-of-day. Independent of every other phase, zero fence/budget
risk. Music/radio stations are a SEPARATE phase (P4) — this is ambient only.

## Files touched

- `public/assets/audio/ambient/*` (new — Opus .ogg, mono 32-48kbps)
- `docs/asset-provenance/audio-2026-06/*` + `THIRD-PARTY-ASSETS.md` (attribution)
- `src/systems/audio/SoundscapeDirector.ts` (+ `.test.ts`, new)
- `src/config/soundscape.ts` (new)
- `src/systems/audio/AudioManager.ts` (repoint ambient), `AmbientSoundManager.ts` (delete/shim)
- `src/systems/audio/AudioDuckingSystem.ts` (per-bed base volume)
- composer wiring (`GameplayRuntimeComposer` / `LiveEntryActivator.ts`)

## Scope

1. Source + encode CC0/CC-BY beds (day = Freesound #427400 CC-BY; night = #175020 CC0; CC0 rain/stream + one-shot wildlife). Finalize attribution before merge.
2. `SoundscapeDirector` with persistent beds + day/night crossfade via `ISkyRuntime.getSunDirection().y` (read-only); O(1)/frame; pooled one-shots.
3. Inject the sky handle via composer as an optional dep; degrade to always-day bed selection when absent (AI_SANDBOX/tests). Generalize ducking to preserve the mix + the `setVolume(0..1)` worldbuilder contract.

## Non-goals

- NO radio stations / music (that is `cycle-2026-06-29-radio-stations-music`).
- MUST NOT touch `CommandModeOverlay`.
- NO `IAudioManager` fence change; NO lingering `ATTRIBUTION_PENDING`.

## Acceptance

- [ ] The permanent music loop is gone; ambient beds crossfade by time-of-day (or load-time select if a scenario pins the sun — acceptable).
- [ ] Attribution finalized in `THIRD-PARTY-ASSETS.md`; SPDX on new source.
- [ ] `npm run lint && npm run test:run && npm run build` green; fence-safe.
- [ ] Owner feel-walk deferred to `docs/PLAYTEST_PENDING.md`.

## Dependencies

- Independent; lands early. Shares the audio layer with `radio-stations-music` (P4).
