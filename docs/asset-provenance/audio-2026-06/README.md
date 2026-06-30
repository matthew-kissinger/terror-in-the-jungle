# Ambient soundscape audio — provenance (audio-2026-06)

Cycle: `cycle-2026-06-29-soundscape-loop-replacement` (Phase 1 of the Cinematic
Field Pass campaign). These assets back the layered day/night `SoundscapeDirector`
that replaced the old always-on `jungle1`/`jungle2` loop.

## What shipped

Four Opus `.ogg` beds/one-shots under `public/assets/audio/ambient/`:

| File | Role | License |
|------|------|---------|
| `jungle-day.ogg` | Persistent **day** bed (looping) | first-party placeholder, CC BY-SA 4.0 |
| `jungle-night.ogg` | Persistent **night** bed (looping) | first-party placeholder, CC BY-SA 4.0 |
| `wildlife-bird.ogg` | One-shot wildlife cue (day) | first-party placeholder, CC BY-SA 4.0 |
| `wildlife-call.ogg` | One-shot wildlife cue (any) | first-party placeholder, CC BY-SA 4.0 |

All are mono, Opus ~40 kbps, ~18 s (beds) / ~1.2-1.6 s (one-shots).

## These are FIRST-PARTY PLACEHOLDERS, not production field recordings

The campaign plan cited two Freesound beds to source (day `#427400`, CC-BY;
night `#175020`, CC0) plus CC0 rain/stream/wildlife. **Freesound downloads
require an account / API token that this autonomous run did not have**, so the
guessed preview URLs returned 404. Per the dispatch directive ("do NOT invent
attributions and do NOT ship a silent file pretending to be a real bed"), these
beds were instead **synthesized from first principles** with ffmpeg/libopus and
are original first-party work under **CC BY-SA 4.0** (the project's asset
license — see `LICENSE-ASSETS`). They are recorded here, and in
`THIRD-PARTY-ASSETS.md`, as first-party placeholders so there is no ambiguity.

They are intentionally simple (filtered noise wind/insect beds, a synth bird
chirp, a distant call) — enough to exercise and ship the architecture (permanent
loop gone, day/night crossfade), but **not** the final field-recording quality.

## Owner follow-up (production beds)

The `SoundscapeDirector` is bed-agnostic: swapping these `.ogg` files for genuine
CC0/CC-BY field recordings needs **no code change** — keep the same filenames
under `public/assets/audio/ambient/` (or update paths in `src/config/soundscape.ts`).
When production beds land, replace these entries with the real upstream
attribution (source URL + author + license) in `THIRD-PARTY-ASSETS.md`.

## Reproducing the placeholders

The placeholders are deterministic-ish ffmpeg synthesis. See `generate-beds.sh`
in this directory; it requires `ffmpeg` built with `libopus`.

---

# Radio station music — provenance (audio-2026-06)

Cycle: `cycle-2026-06-29-radio-stations-music` (Phase 4 of the Cinematic Field
Pass campaign). These tracks back the headless `RadioStationSystem` — the
selectable radio stations that replaced the old (removed) single music loop.
Music is **default-OFF** (especially on touch: no cellular auto-download); the
tracks are lazy-loaded only when the player tunes to a station.

## What shipped — genuine CC BY 4.0 tracks (Kevin MacLeod, incompetech.com)

Three Opus stereo `.ogg` tracks under `public/assets/audio/music/`:

| File | Station | Title / Author | License |
|------|---------|----------------|---------|
| `station-volatile-reaction.ogg` | Firebase (tense combat) | "Volatile Reaction" — Kevin MacLeod | **CC BY 4.0** |
| `station-five-armies.ogg` | Thunder (martial score) | "Five Armies" — Kevin MacLeod | **CC BY 4.0** |
| `station-ossuary-air.ogg` | Green Static (ambient drone) | "Ossuary 6 - Air" — Kevin MacLeod | **CC BY 4.0** |

All are stereo, Opus ~80 kbps (within the 64-96 kbps band), 2.5-4 min.

These are **real third-party CC-BY tracks**, not placeholders. They were fetched
directly from `incompetech.com` (HTTP 200, no credentials) and re-encoded to
Opus with ffmpeg/libopus (metadata stripped). incompetech music is published
under "Creative Commons: By Attribution 4.0 License" — attribution is required
and is recorded in `THIRD-PARTY-ASSETS.md` and the per-track `.provenance.json`
files in this directory.

### Required attribution (must remain in `THIRD-PARTY-ASSETS.md`)

- "Volatile Reaction" by Kevin MacLeod (incompetech.com) — CC BY 4.0.
- "Five Armies" by Kevin MacLeod (incompetech.com) — CC BY 4.0.
- "Ossuary 6 - Air" by Kevin MacLeod (incompetech.com) — CC BY 4.0.

License text: https://creativecommons.org/licenses/by/4.0/

## Sourcing note — substitution for the ambient station

The brief cited Bartmann CC0 drones and a hand-verified AFN CC-BY surf clip for
the ambient/AFN stations. Those sources are account/credential-bound and could
not be fetched license-clean in this autonomous run, so the ambient station ships
Kevin MacLeod's "Ossuary 6 - Air" (CC BY 4.0) from incompetech instead — same
license posture, fully attributed, no invented provenance. Swapping in a
genuine CC0 drone later needs no code change beyond `src/config/radioStations.ts`.

## Reproducing the station encode

See `fetch-stations.sh` in this directory; it requires `curl` and `ffmpeg` built
with `libopus`. It re-downloads the three incompetech MP3s and re-encodes them to
the shipped Opus `.ogg` files.
