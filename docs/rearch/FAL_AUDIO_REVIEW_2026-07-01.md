# fal.ai Audio Review Workflow - 2026-07-01

Source: owner direction on 2026-07-01.

Decision:

- No default placeholder background/music layer for now.
- Remove the rejected ambient/static pass from runtime.
- Generate replacement candidates through fal.ai for local review only.
- Keep generated files out of `public/` until the owner approves specific clips.
- Do not use global objective-complete audio until there is a proper callout /
  comms layer. Global objective state already has visual feedback.
- Objective and capture sounds mean local, diegetic, proximity-gated feedback at
  the objective source when the player is physically present or very close.
- Focus first on functional game SFX: radio UI, objective feedback, hit/kill
  feedback, aircraft, weapons, and ordnance.
- Runtime background loops can be generated as review-only candidates for
  location/state layering, but they are not promoted until selected and wired.

## Runtime State

`src/config/soundscape.ts` has `SOUNDSCAPE_CONFIG.enabled = false`, so the
day/night ambient beds are not boot-critical and are not played. Random ambient
one-shots are empty. The former `Green Static` station was removed from
`src/config/radioStations.ts`.

`AudioManager` no longer treats `zone_captured` as a global reward sting. It
only plays `zoneCaptured` from the zone position when the listener is inside or
just outside that objective radius. The existing visual event remains global.

## Generation Command

The generator reads `FAL_KEY` from the local shell and writes ignored review
artifacts:

```bash
npm run audio:fal:generate -- --list
npm run audio:fal:generate -- --all --variants 2
npm run audio:fal:generate -- --id radio-confirm-feedback,bomb-whistle-inbound --variants 3
```

Animal/location/background sketches are excluded by default:

```bash
npm run audio:fal:generate -- --all --include-review-only --variants 1
```

Output lands under:

```text
artifacts/audio/fal-review/<timestamp>/
```

Open `review.html` in that folder to audition candidates.

## Model Choice

Primary model: `bytedance/seed-audio-1.0` through fal.ai.

Reason: fal documents it as a text-to-audio model for full audio scenes,
sound effects, music/atmosphere, and reference-audio workflows, with
`ogg_opus` and 48 kHz output available. That makes it suitable for quickly
trying several stylistic variants while keeping prompts dry and game-focused.

Useful source docs:

- https://fal.ai/models/bytedance/seed-audio-1.0/api
- https://fal.ai/learn/tools/how-to-use-seed-audio
- https://fal.ai/docs/documentation/model-apis/inference/queue

## Promotion Rules

Do not ship generated audio directly from `artifacts/`.

For each accepted clip:

1. Normalize and trim it for the runtime target.
2. Rename it to the existing runtime sound key or add a new key deliberately.
3. Copy it into `public/assets/optimized/` or the relevant audio asset folder.
4. Add provenance under `docs/asset-provenance/audio-2026-07/`.
5. Wire the key in `src/config/audio.ts`, `src/config/soundscape.ts`, or the
   relevant runtime system.
6. Run the targeted audio tests and a local playtest.

## Initial Target Set

Functional SFX:

- `radio-open-feedback`
- `radio-confirm-feedback`
- `objective-offer-feedback`
- `objective-complete-feedback`
- `objective-fail-feedback`
- `capture-confirmation-alt`
- `hit-marker-feedback`
- `kill-confirm-feedback`
- `bomb-whistle-inbound`
- `rocket-launch-whoosh`
- `napalm-fire-crackle`
- `helicopter-minigun-burst`
- `aircraft-cannon-burst`
- `smoke-marker-land-hiss`

Objective/capture target semantics:

- `objective-offer-feedback`, `objective-complete-feedback`, and
  `objective-fail-feedback` are local objective-state cues, not radio calls.
- `capture-confirmation-alt` is a local zone-source replacement candidate for
  `zoneCaptured`, not a HUD fanfare.
- Preferred sound language: flag cloth, rope, field-marker hardware, crate
  latches, canvas straps, wood/metal contact, dirt, subtle mechanical state
  changes when the objective type supports it.
- Rejected sound language: radio pitch/chirp, headset acknowledgement, UI
  success pulse, heroic/melodic stinger, brass/choir, table stamp, ambient bed,
  static, or voice.

Review-only future ambience/location:

- `single-jungle-bird-call`
- `jungle-insect-bed-sketch`
- `ashau-day-jungle-loop`
- `ashau-night-jungle-loop`
- `firebase-perimeter-loop`
- `distant-firefight-loop`
- `monsoon-rain-canopy-loop`
- `spooky-gunship-orbit-bed`

Prompt rule: every functional SFX prompt says no music, no constant background
bed, no ambient static hiss, and no voice unless explicitly required.
Objective/capture prompts must also say local/proximity/objective-source and
must reject radio/electronic acknowledgement language. Runtime background
prompts are allowed to be beds, but still reject music, static, and clear
speech.
