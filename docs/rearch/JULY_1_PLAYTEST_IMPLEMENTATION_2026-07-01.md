# July 1 Playtest Implementation Record

Date: 2026-07-01

Source plan: owner July 1 playtest notes and follow-up audio/radio/smoke plan.

Related analysis: [OWNER_PLAYTEST_INTAKE_2026-07-01.md](OWNER_PLAYTEST_INTAKE_2026-07-01.md)

## Implemented Scope

| Original issue | Code treatment in this pass | Remaining acceptance |
|---|---|---|
| 3D deploy map used color-only markers | `OrbitalTopoMarkers` now composes marker labels from owner/kind/name and adds a compact owner/spawn legend in the 3D marker layer. Pure tests cover descriptor and legend composition. | Browser screenshot of the 3D deploy map and owner readability pass. |
| Static/whistle/objective audio felt bad | Promoted approved fal.ai objective/capture clips as `objectiveCompleteLocal*` and `zoneCapturedLocal*` variant pools; excluded the rejected sharp 11:50 review `capture-confirmation-alt-v2.ogg` and used the softer replacement from the later review folder; kept no ambient static/music background; objective/capture playback is local/proximity-gated. | Human audio-feel review in local runtime before production sign-off. |
| Global objective feedback was wrong semantic layer | `TaskingDirector` plays objective-complete audio only near the objective source through concrete `AudioManager.playVariantSet(...)`; no global objective stinger added. | Future comms/callout layer can add global speech/radio separately. |
| Attack-helicopter shots appeared from two places | `HelicopterModel` no longer advances the standalone `HelicopterDoorGunner` firing/effects path for the player-controlled helicopter; `HelicopterWeaponSystem` remains the only player-airframe firing/effects authority. | Browser capture for Cobra/UH-1C visual origins; future AI crew targeting should delegate into `HelicopterWeaponSystem` rather than emitting its own stream. |
| Infantry gun looked like barrel plus another ray | `WeaponFiring` still uses the camera ray for damage, but now bounds overlay-muzzle projection for visual tracers and records a `ShotOriginDiagnostics` snapshot with damage ray and visual tracer origin/end. | Use diagnostics during playtest if the artifact persists; tune weapon-specific camera-space anchors only with screenshot evidence. |
| Radio radial IA was unclear and outer ring was unreliable | Radio model is now three inner categories: `Fire Support`, `Squad`, `Signals`. Stations moved under `Signals`; vague top-level `Mark` removed. Fire support selection is direct: choosing a mission arms that mission's smoke marker and closes the dial. The desktop radial pins the focused category so moving toward an outer option does not reset the ring; hidden desktop/touch presentations are non-interactive so one surface cannot steal the other's clicks. Controller/view/bottom-sheet tests cover direct smoke-marker parity. | Desktop Playwright click test for direct outer-ring selection; human ergonomics pass. |
| Radio should be held in first person | Added non-firearm `HeldEquipmentViewmodelSystem` with modes `none`, `radio`, and `smoke-marker`; opening radio suppresses the weapon and raises the imported field-radio viewmodel. | Screenshot check that radio does not block reticle or threat readability. |
| Smoke mark should be a real mechanic | Added `SmokeMarkerSystem` using custom grenade-style ballistic logic and the existing arc renderer: LMB hold charges, release throws a canister, it bounces/bobbles/settles, emits smoke, and emits `target_mark_set`. Fire support now starts by equipping a mission-specific targeting smoke marker rather than a separate target-method selection. | Human throw-feel pass; future clear/new-mark UX and guidance-system layering. |
| Radio model import should use proper pipeline/provenance | Added importer append/merge support and imported `field-radio-viewmodel` through `scripts/import-war-catalog.ts` without overwriting the existing generated catalog. Provenance records the Kiln 2026-07 source batch. | `npm run check:asset-gallery` runtime gallery proof. |

## Runtime Boundaries

- `src/types/SystemInterfaces.ts` was not modified.
- New public/fenced interfaces were avoided. Additions are concrete/internal:
  `AUDIO_VARIANT_SETS`, `AudioManager.playVariantSet(...)`, internal target-mark
  events, `HeldEquipmentMode`, and `ShotOriginDiagnostics`.
- Smoke marker v1 stays on custom ballistic simulation; no physics engine was
  added.
- Music/radio stations remain default-off content. No ambient static background
  is shipped by this pass.

## Verification

Focused tests cover:

- audio variant pools and objective proximity playback
- importer append/merge and Kiln provenance
- radio category/direct-smoke-selection/bottom-sheet model behavior
- smoke marker charge, settle, target-mark creation, and cleanup
- 3D deploy marker labels and legend composition
- helicopter player-airframe firing authority
- infantry shot-origin diagnostics and bounded tracer projection

Completed locally on 2026-07-01:

- `npm run typecheck`
- `npm run lint`
- `npm run test:quick`
- `npm run build`
- `npm run validate:fast`
- `npm run check:asset-gallery -- --only field-radio-viewmodel`
- direct-smoke hotfix: focused radio/smoke/player tests (`138`), browser
  report `artifacts/radio-smoke-ux-probe/radio-direct-smoke-browser-report.json`
  (`ok: true`)

Remaining checks are human/browser acceptance: 3D deploy-map screenshot
readability, desktop radial direct outer-ring click feel, first-person radio
framing, smoke throw feel, objective/capture audio feel, and helicopter/infantry
shot-origin readability.
