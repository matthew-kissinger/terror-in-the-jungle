<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase P4b, integration glue for P3+P4). -->
# cycle-2026-06-29-radio-station-wiring

Phase P4b — close the integration gap between P4 (`RadioStationSystem`, built
HEADLESS) and P3 (radio dial, which exposes `setStationTuner`/`setSelectedStation`
seams). Today `RadioStationSystem` is instantiated ONLY in its own test, and
`CommandInputManager.setStationTuner()` is never called by any composer, so the
dial's STATIONS channel emits into an undefined `onStationTune` (no-op). Result:
"selectable radio stations" (campaign deliverable e) does not actually play.
Wire it — production-instantiate the system, connect the dial, apply settings.
ZERO fence changes (verified: `IAudioManager` does NOT include the volume/tuner
methods, so `systemManager.audioManager` is the CONCRETE `AudioManager`).

## Files touched

- `src/systems/audio/AudioManager.ts` (455 LOC, headroom) + `AudioManager.test.ts`
- `src/core/GameEngine.ts` (503, headroom) — settings-change cases
- `src/core/LiveEntryActivator.ts` (377, headroom) — initial apply + dial tuner wire
- (do NOT touch `src/core/StartupPlayerRuntimeComposer.ts` — AT CEILING 790/50)

## Scope

1. In `AudioManager` ctor: instantiate `RadioStationSystem(this.listener, trackLoader, { isTouch })`.
   `trackLoader = (path) => this.audioLoader.loadAsync(path)`. Detect `isTouch` from the
   same signal the rest of the app uses (input mode / touch heuristic); default desktop.
2. In `AudioManager.update(dt)` (line ~387): call `this.radioStation.update(dt)` and pass
   `this.radioStation.getActiveMusicBed()` as the music-bed arg to
   `this.duckingSystem.update(dt, this.soundscape.getActiveBeds(), <musicBed>)` (the duck
   method already accepts it — see `AudioDuckingSystem.ts:81`). In `dispose()`: `this.radioStation.dispose()`.
3. Add CONCRETE passthroughs on `AudioManager` (NOT on `IAudioManager`):
   `setMusicEnabled(b)`, `setMusicVolume(0..1)`, `tuneRadioStation(id)`,
   `getSelectedStationId(): string`. Mirror `setMasterScalar` into the radio system from the
   existing worldbuilder-mute / pause path if one applies to the soundscape master.
4. In `GameEngine.applySettingChange()`: add `case 'musicEnabled'` and `case 'musicVolume'`
   mirroring the existing `masterVolume` case (`settings.get('musicEnabled')`,
   `settings.getMusicVolumeNormalized()`).
5. In `LiveEntryActivator` `audio-start` step (next to the existing `setMasterVolume` call):
   apply initial `setMusicEnabled` + `setMusicVolume`, then wire the dial:
   `engine.systemManager.commandInputManager?.setStationTuner((id) => engine.systemManager.audioManager!.tuneRadioStation(id))`
   and `...setSelectedStation(engine.systemManager.audioManager!.getSelectedStationId())`.
   Confirm `commandInputManager` is reachable on `systemManager`; if not, wire it at the
   nearest composition point that holds BOTH the concrete `audioManager` and
   `commandInputManager` — but NEVER grow `StartupPlayerRuntimeComposer`.

## Non-goals

- NO fence change. If any seam only exposes `IAudioManager`, resolve the concrete instance or
  wire at a concrete-typed site — do NOT add methods to the fenced interface.
- NO change to `CommandInputManager` combat logic (the seams already exist; only CALL them).
  If you must touch `src/systems/combat/**`, stop and flag — that needs combat-reviewer.
- Music stays DEFAULT-OFF (`musicEnabled: false`), especially on touch. No auto-fetch until enabled.
- Do NOT re-fetch/commit station audio; the lazy loader fetches on first enable+tune.

## Acceptance

- [ ] Enabling music (settings) + selecting a STATIONS entry in the dial actually tunes/plays;
      changing station crossfades; disabling silences. Verified by unit tests against the
      concrete wire (mock `trackLoader`/audio factory; assert `tuneRadioStation` reaches the system,
      settings cases call through, dial tuner callback is set).
- [ ] Combat ducking attenuates the music bed only while music is enabled (musicBed non-null path).
- [ ] `npm run lint && npm run test:run && npm run build` green; `check:fence` OK; budgets pass
      (no ceilinged file grown). Fence-safe (no `[interface-change]`).
- [ ] Owner audio/level mix deferred to `docs/PLAYTEST_PENDING.md` (can't verify playback headless).

## Dependencies

- Depends on P3 (#462, merged — dial seams) + P4 (#457?/merged — `RadioStationSystem`). Both on
  master. Independent of P5/P6 (no file overlap). No reviewer gate required (audio/core, not
  combat/terrain/nav) UNLESS you end up touching `src/systems/combat/**`.
