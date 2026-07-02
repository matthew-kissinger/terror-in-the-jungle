<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# cycle-2026-07-audio-cue-redesign

Owner-reported (2026-07-01 playtest intake, `docs/rearch/OWNER_PLAYTEST_INTAKE_2026-07-01.md`
~523-526): too many runtime cues are placeholders reused across unrelated events, and
several UX-critical surfaces (radio dial, dropped smoke marker) are silent. This brief
replaces the reused weapon/radio/ordnance/objective cues with purpose-built one-shots and
wires the already-defined-but-unplayed cue targets. Sourcing/pipeline follow
`docs/rearch/FAL_AUDIO_REVIEW_2026-07-01.md`. **This is a planning + wiring brief: NO paid
generation runs in this campaign — see the HARD RULE below.** Pairs with `task/fixed-wing-bombs`
(ordnance cluster shares its impact/whistle events).

## Reused-cue inventory (current tree)

| Runtime cue | Config key(s) in `src/config/audio.ts` | Reuses (shared file) | fal target to replace it |
|---|---|---|---|
| Pistol / LMG shot | `playerPistol`, `playerLMG` | `playerGunshot.wav` | (own weapon SFX — later cluster) |
| M79 launcher thump | `playerLauncher` | `grenadeExplosion.wav` | `rocket-launch-whoosh` / dedicated launcher |
| Heli rocket launch | `rocketLaunch` | `grenadeExplosion.wav` | `rocket-launch-whoosh` |
| Napalm explosion | `napalmExplosion` | `grenadeExplosion.wav` | `napalm-fire-crackle` (+ blast) |
| Thunder | `AudioManager.playThunder` -> | `grenadeExplosion.wav` | dedicated thunder (review-only bed cluster) |
| Distant battle | `AudioManager.playDistantCombat` -> | `grenadeExplosion`/`otherGunshot` mix | review-only `distant-firefight-loop` |
| Minigun / door-gun burst | `minigunBurst`, `doorGunBurst` | `otherGunshot.wav` | `helicopter-minigun-burst` |
| Air-support confirm chime | `airSupportRadio` | `grenadeBeep.wav` | `radio-confirm-feedback` |
| Radio dial open/focus (silent) | none (RadioDialController/RadialDialView) | — | `radio-open-feedback` |
| Smoke marker land (silent) | none (`SmokeMarkerSystem`) | — | `smoke-marker-land-hiss` |
| Bomb inbound / hit / kill (silent) | none | — | `bomb-whistle-inbound`, `hit-marker-feedback`, `kill-confirm-feedback` |

All 14 functional fal targets already exist in `scripts/generate-fal-audio.ts`; they are just
never promoted or wired.

## Scope (first clusters only — do not attempt all at once)

1. **Ordnance cluster** (pairs with `task/fixed-wing-bombs`): `rocket-launch-whoosh`,
   `napalm-fire-crackle`, `bomb-whistle-inbound`. Split `rocketLaunch`/`napalmExplosion`/
   `playerLauncher` off the shared `grenadeExplosion.wav`; wire the inbound whistle to the
   bomb/rocket release event that lands in the sibling task.
2. **Radio-UI cluster**: `radio-open-feedback` (dial open/focus in `RadioDialController`),
   `radio-confirm-feedback` (replaces the `airSupportRadio` grenadeBeep confirm chime).
3. Add a cue-taxonomy doc + provenance entries for every promoted clip (see Provenance).
4. Later clusters (own follow-on briefs): objective/capture set, hit/kill feedback,
   smoke-marker land, helicopter/aircraft gun bursts, own-weapon SFX de-dup.

## Loudness normalization plan

- Two-pass `ffmpeg loudnorm` (measure pass -> apply pass) to a stated target of
  **-16 LUFS integrated, -1.5 dBTP true-peak, 11 LU range** for all one-shot SFX; beds
  (review-only) target **-20 LUFS**. Applied at PROMOTION time, never in `artifacts/`.
- Encode 48 kHz Ogg Opus, trimmed, matching the existing objective-audio pipeline
  (`docs/asset-provenance/audio-2026-07/README.md`). Record the pre/post integrated LUFS
  in each provenance entry.

## Provenance rules

- Follow the `docs/asset-provenance/audio-2026-07/` precedent exactly: one table row per
  promoted clip with runtime key, source review-artifact path, duration, and SHA-256, plus
  the loudnorm target and measured integrated LUFS. Source model + command recorded at top.
- Rejected candidates are named and reasoned (like the rejected `capture-confirmation-alt-v2`).
- Provenance lands in the SAME PR that wires the clip; no clip ships without a row.

## Non-goals / HARD RULE

- **NO paid generation in this campaign.** Generation runs (`npm run audio:fal:generate`) are
  REVIEW-ONLY and require an explicit owner audition session before ANY clip is promoted.
  Promotion is owner-audition-gated (owner-decision F6, campaign manifest
  `docs/CAMPAIGN_2026-07-02-greenlight-followthrough.md`). Do not call fal.ai without sign-off.
- **TTS / voice / callouts stay BLOCKED** pending a dedicated comms-layer cycle. No global
  objective-complete stinger, no radio speech, no headset voice.
- Do not enable `SOUNDSCAPE_CONFIG.enabled` or ship background/music beds — beds stay
  review-only candidates until selected and wired in a later brief.
- No fenced-interface changes: audio flows through `IAudioManager` and existing runtime
  systems; if a new fenced audio surface seems needed, STOP and escalate `[interface-change]`.

## Acceptance (per cluster PR, not this planning brief)

- [ ] Each promoted clip has a provenance row with source path, SHA-256, and measured LUFS.
- [ ] Reused `grenadeExplosion`/`otherGunshot`/`grenadeBeep` keys for the cluster's events
      point at their new dedicated files; no unrelated event still shares them.
- [ ] `git diff -- src/types/SystemInterfaces.ts` is empty.
- [ ] `npm run lint && npm run test:run && npm run build` all pass; `npm run lint:budget`
      and `npm run check:export-ratchet` stay green.
- [ ] Owner audition session logged before promotion; PR links this brief + the manifest F6 row.

## Dependencies

- Pairs with: `task/fixed-wing-bombs` (ordnance impact/release events the whistle/crackle bind to).
- Blocks: objective/capture, hit/kill, smoke-marker, and gun-burst follow-on briefs.
- Gated by: owner audition session (manifest F6) before any promotion.
