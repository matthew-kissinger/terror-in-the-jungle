# Owner Playtest Intake - 2026-07-01

Source: owner testing notes from 2026-07-01.

Purpose: preserve the feedback as code-mapped engineering intake, separate
from implementation. This note identifies each reported issue, the current
runtime ownership that explains it, and the solution options that should be
split into follow-up work.

Current-state check: `docs/DIRECTIVES.md` is the live source. As of
2026-07-01, the embedded 3D deploy map, air-support/fire-mission overhaul,
radial radio dial, soundscape replacement, radio stations, deploy/loadout
flow, and helicopter combat surfaces are code-complete but owner feel-walk
items remain open. This intake supersedes any stale "accepted" reading of the
older cycle briefs for the surfaces below.

## Term Alignment

Use these terms in follow-up briefs:

- "3D deploy marker labels" for the in-air text/legend problem on the orbital
  insertion map.
- "Audio cue taxonomy and provenance pass" for replacing the static, whistle,
  objective, wildlife, and inconsistent status cues.
- "Tracer origin authority" for helicopter and infantry shots visually coming
  from more than one place.
- "Radio radial IA" for the inner/outer/third-ring redesign.
- "Throwable smoke marker" or "target marker smoke" for the hold-to-charge
  smoke throw that later guidance systems can consume.

## 1. 3D deploy map uses color-only enemy/faction markers

Owner note: the foreground/enemy side is marked only by colors, with no legend
or in-air text, so the selected insertion point is discovered only after the
right-side spawn list changes.

### Code mapping

- The old 2D deploy map already has text labels. `OpenFrontierRespawnMapRenderer`
  builds labels like kind plus spawn name at `src/ui/map/OpenFrontierRespawnMapRenderer.ts:243`
  and draws them through `:272`; kind labels live at `:394`.
- The deploy screen already has a 2D legend panel at
  `src/ui/screens/DeployScreen.ts:794`, mounted from `:223`.
- The new 3D map marker layer is visual-only: `OrbitalTopoMarkers` renders
  instanced colored cylinders/pillars at
  `src/ui/map/orbital/OrbitalTopoMarkers.ts:45`, `:52`, `:92`, and `:112`.
- The 3D marker input does contain names/kinds/owners from
  `buildMarkerInputs` in `src/ui/map/orbital/OrbitalTopoMapHost.ts:65`, so the
  data exists; the 3D presentation layer is what is missing.

### Diagnosis

This is not a spawn-data problem. It is a 3D presentation parity gap introduced
by the orbital topographic map. The 2D map has labels and a legend, but the 3D
deploy map compresses all meaning into color and shape.

### Proper solutions

1. Add a 3D label layer to `OrbitalTopoMarkers`.
   - Render billboarding text sprites or DOM/CSS2D labels for key markers.
   - Compose labels from existing `TopoMarkerInput` fields.
   - Suggested labels: `US HQ`, `NVA/VC`, `Contested`, `Insert`, `Helipad`,
     `Spawn`, plus selected/hover details.
2. Add a compact legend in the 3D deploy viewport.
   - Use the same owner colors as `OWNER_COLORS` and `SPAWN_COLOR`.
   - Keep it in the 3D panel so players do not have to look to the right panel
     to decode the map.
3. Avoid clutter with a label-culling policy.
   - Always show selected/hovered marker.
   - Always show home base and hot/contested choices.
   - Hide or fade distant duplicate labels by camera distance and screen-space
     overlap.

### Acceptance

- The 3D deploy view names each marker role without needing the right-side list.
- Selecting a 3D marker still updates the spawn list and selected deploy state.
- 2D and 3D maps use the same faction/zone language.
- Add a pure test for label descriptor composition and a browser screenshot for
  desktop deploy.

## 2. Static, whistle, objective, and soundscape cues read poorly

Owner note: the static, whistle, and objective sounds "all sound terrible" and
should be stripped out or rethought. The capture sound is acceptable for now,
but the whole set should become more consistent.

Update from owner follow-up: no ambient static/background or music layer should
ship by default right now. Music can return later as an intentional radio
station feature; this pass should focus on dry functional SFX and local review
of generated candidates.

Owner correction after fal review: global objective-complete audio is not
needed until there is a real callout/comms layer. The desired feedback is the
actual objective sounding off locally when the player is physically present or
near it. It should not read as a radio pitch, headset chirp, UI reward pulse,
or mission-complete stinger.

### Code mapping

- `src/config/soundscape.ts:13` explicitly says the shipped ambient beds are
  first-party placeholders because production field recordings were not
  sourced. The current one-shots are `wildlifeBird` and `wildlifeCall` at
  `src/config/soundscape.ts:62` and `:74`.
- `AudioManager` preloads those soundscape one-shots and updates the
  soundscape/radio layer at `src/systems/audio/AudioManager.ts:23`,
  `:26`, and `:425`.
- Zone capture events carry objective `position` and `radius` from
  `src/systems/world/ZoneManager.ts:221`; the world VFX already uses that
  payload in `src/systems/effects/ZoneCaptureEffects.ts:175`.
- Zone capture audio was already proximity-gated in `AudioManager`: distant
  captures did not play audio, while nearby captures played the old
  `zoneCaptured` cue from the zone position. The implementation pass replaces
  that single cue with the `zoneCapturedLocal` variant pool.
- Several current sounds are reused placeholders, such as `minigunBurst` at
  `src/config/audio.ts:113` and `airSupportRadio` at `:135`.
- The pre-implementation `STATIONS` category contained a `Green Static` music
  station name that read too close to the rejected static/noise pass. The
  implementation removes that station and moves stations under `Signals`.
- `docs/PLAYTEST_PENDING.md` already records the soundscape beds as
  placeholders and the bomb-whistle/fire-crackle/TTS follow-up as blocked on
  sourcing/sign-off.

### Diagnosis

The audio architecture is serviceable, but the cue library is not production
quality. The current pass mixes placeholder synthesized beds, reused weapon or
UI cues, station copy that sounds like static/noise, and status/capture cues
without a consistent sonic language.

For objectives specifically, the bug is both routing and design language: the
cue was originally treated like a global reward/status notification, but the
owner intent is a local objective-source cue. The visual state can stay global;
the audio should be physical, spatial, and only audible near the objective.

### Proper solutions

1. Immediate strip/mute option.
   - Disable the rejected ambient/static soundscape layer.
   - Remove the ambient-drone/static radio station.
   - Keep capture/objective cues only as reviewed local/proximity variant pools.
   - Add a playtest kill-switch for soundscape one-shots and status cues so the
     owner can isolate categories.
2. Full audio-design pass.
   - Create an audio cue taxonomy: ambient beds, wildlife one-shots, UI/status,
     objective/capture, radio/stations, air-support, weapons, impacts.
   - Replace placeholder/reused sounds with licensed CC0/CC-BY or approved
     generated assets.
   - Normalize loudness/gain per category and document provenance beside the
     asset files.
   - Use the fal.ai local-review workflow in
     `docs/rearch/FAL_AUDIO_REVIEW_2026-07-01.md` before copying anything into
     `public/`.
3. Objective/capture source pass.
   - Treat objective completion, objective loss, and zone capture as local
     source events tied to the objective transform and capture radius.
   - Generate sounds as field-object Foley: flag rope, canvas, field-marker
     latch, crate strap, wood/metal clamp, dirt/gear movement, or objective-
     specific machinery when appropriate.
   - Reject radio chirps, headset acknowledgement tones, UI success pulses,
     heroic stingers, melodic intervals, table stamps, and background beds.
   - When callouts exist later, layer them separately from the physical
     objective-source cue.
4. Split radio station copy from static/noise.
   - Rename or explain any "static" station so it reads as a music channel, not
     an intentionally bad sound effect.

### Acceptance

- No placeholder wildlife/static/whistle cue is exposed without provenance and
  owner sign-off.
- Capture/objective/status cues share a consistent profile.
- Objective audio does not play for distant captures; it is heard only near the
  objective source.
- Objective feedback does not sound like radio/UI confirmation unless a future
  callout system intentionally adds a separate comms layer.
- Weapon, rocket, radio, and air-support cues no longer reuse unrelated sounds
  where a player will notice.
- Human playtest is required; automated tests only prove routing.

## 3. Attack-helicopter shots appear from two places

Owner note: shots appear to fire from two places on screen at once in an attack
helicopter.

### Code mapping

- `HelicopterModel` initializes both systems for the same aircraft weapon list:
  `weaponSystem.initWeapons(...)` at `src/systems/helicopter/HelicopterModel.ts:296`
  and `doorGunner.initGunners(...)` at `:298`.
- During piloted helicopter updates, it advances both
  `weaponSystem.update(...)` and `doorGunner.update(...)` at
  `src/systems/helicopter/HelicopterModel.ts:627` and `:643`, then advances
  both effects systems at `:648` and `:649`.
- `HelicopterWeaponSystem` now owns pilot weapons and crew weapons:
  `crewWeapons` / `playerCrewing` state is declared around
  `src/systems/helicopter/HelicopterWeaponSystem.ts:30`; crew weapon creation
  happens at `:163`, `:174`, and `:181`.
- The same system already tries to distinguish player-crewed and AI-crewed
  firing at `src/systems/helicopter/HelicopterWeaponSystem.ts:234` and `:303`.
- `HelicopterDoorGunner` independently filters the same `firingMode === 'crew'`
  mounts at `src/systems/helicopter/HelicopterDoorGunner.ts:62`.
- `AH1_COBRA` has pilot M134 plus rocket pods at
  `src/systems/helicopter/AircraftConfigs.ts:114` and `:135`; UH-1C-style
  gunships have crew guns, so the exact repro aircraft matters.

### Diagnosis

There are two plausible causes:

1. Real duplicate ownership for crew-served helicopter guns. Crew weapons can
   exist in both `HelicopterWeaponSystem` and `HelicopterDoorGunner`, and only
   the newer `HelicopterWeaponSystem` knows about `playerCrewing`.
2. For the Cobra specifically, the player may be seeing visual-origin mismatch
   between chin gun, alternating rocket pods, tracer effects, and weapon model
   offsets rather than duplicate damage.

The code has enough overlap that this should be treated as a real ownership
risk until instrumented.

### Proper solutions

1. Establish one helicopter weapon-effect authority.
   - Prefer retiring `HelicopterDoorGunner` as an independent firing/effects
     owner.
   - Move AI crew targeting into `HelicopterWeaponSystem`, or make the door
     gunner only provide target choices while the weapon system fires.
2. Add temporary diagnostics before tuning offsets.
   - Emit a dev-only `heli_weapon_fire` record with heli id, weapon name, source
     (`pilot`, `player-crew`, `ai-crew`, `legacy-door-gunner`), origin, aim
     direction, hit point, tracer id, and ammo delta.
3. Validate mount origins after ownership is fixed.
   - Check Cobra M134, rocket pods, and UH-1C crew gun origins against the
     loaded GLBs.
   - Prefer GLB muzzle helper nodes where available instead of config-only
     local offsets.

### Acceptance

- One trigger press creates one player-owned weapon stream.
- No legacy door-gunner stream fires while the player crews the weapon.
- Tracers originate from the visible muzzle or pod.
- Tests cover no-double-fire for crew weapons and a browser capture proves
  the visual origin.

## 4. Infantry weapon seems to fire from barrel plus another ray/ray artifact

Owner note: the player gun appears to shoot from the barrel and from another
position, or possibly shows a reflection artifact.

### Code mapping

- `FirstPersonWeapon.fire()` builds the shot command through
  `WeaponShotCommandBuilder.createShotCommand(...)` at
  `src/systems/player/FirstPersonWeapon.ts:356`.
- `WeaponShotCommandBuilder` gets the damage ray from the camera through
  `gunCore.computeShotRay(camera, spread)` at
  `src/systems/player/weapon/WeaponShotCommandBuilder.ts:35` and `:64`.
- `WeaponFiring.executeShot()` spawns effects after the damage result at
  `src/systems/player/weapon/WeaponFiring.ts:160`.
- The muzzle flash is spawned in the weapon overlay scene at
  `src/systems/player/weapon/WeaponFiring.ts:226`.
- The tracer starts through `spawnBarrelAlignedTracer` and
  `resolveTracerStart` at `src/systems/player/weapon/WeaponFiring.ts:229` and
  `:275`; the normal path projects an overlay-scene muzzle through the main
  camera at `:279` and `:284`.
- A current test explicitly codifies the split behavior:
  "damages from the camera ray while tracing from the projected weapon muzzle"
  at `src/systems/player/weapon/WeaponFiring.test.ts:327`.

### Diagnosis

This is probably not a second gameplay ray. It is an intentional split between:

- damage authority: camera/reticle ray, for FPS feel; and
- visual authority: projected first-person barrel/muzzle, for gun presentation.

That split can look like two rays when the projected muzzle origin, hit point,
and reticle ray diverge, especially because muzzle flash lives in the overlay
scene while tracer lives in world space.

### Proper solutions

1. Define a single visual-shot model.
   - Keep damage camera-centered unless the owner explicitly wants barrel-origin
     gameplay.
   - Compute a stable first-person muzzle anchor in camera space per weapon and
     ADS state.
   - Make the visual tracer converge on the camera ray's resolved impact point
     without creating a second apparent origin.
2. Add a dev-only weapon-shot debug overlay.
   - Draw camera damage ray and visual tracer origin in different colors only
     when diagnostics are enabled.
   - Use this to prove whether the owner is seeing a real second line,
     excessive parallax, or a material/reflection artifact.
3. Avoid moving damage to barrel by default.
   - Barrel-origin damage can feel worse near cover and at close range. Treat it
     as a design change, not a bug fix.

### Acceptance

- Hip-fire and ADS no longer show a second apparent ray.
- Impact flash, tracer, reticle, and muzzle flash feel aligned.
- Existing behavior tests are updated around behavior, not hard-coded offsets.

## 5. Radio radial outer ring is hard to select and IA is unclear

Owner note: the radial wheel does not properly let the owner select the outer
ring, and `Stations` / `Mark` are unclear. The suggested direction is roughly
three inner-ring items, then an outer ring, with optional third-ring drilldowns
that collapse in place.

### Code mapping

- `RadioDialModel` always exposes four peer categories:
  `fire-support`, `squad`, `markings`, and `stations` at
  `src/ui/hud/radio/RadioDialModel.ts:36`.
- `markings` is a sticky modifier from `AIR_SUPPORT_TARGET_MARKINGS`, not a
  direct thrown-smoke action, at `src/ui/hud/radio/RadioDialModel.ts:127`.
- `stations` is music/radio tuning at `src/ui/hud/radio/RadioDialModel.ts:142`.
- `RadioDialController` defaults the selected marking to `smoke` at
  `src/ui/hud/radio/RadioDialController.ts:47` and composes it into later
  fire-support intents at `:159`.
- Desktop `RadialDialView` is a hover-drill SVG. It says this in the file
  header at `src/ui/hud/radio/RadialDialView.ts:6`; the geometry constants
  are at `:28` and `:30`.
- The desktop inner category sector uses hover or click to focus at
  `src/ui/hud/radio/RadialDialView.ts:126` and `:131`; outer option selection
  is click-only at `:137` and `:142`.
- Touch bottom sheet copy still says "target mark" as a peer item at
  `src/ui/hud/radio/RadioBottomSheet.ts:143`.
- Opening the current radio dial is a UI-only state. `CommandInputManager`
  routes `T` / the Radio HUD slot into `toggleRadioDial()` at
  `src/systems/combat/CommandInputManager.ts:386`, opens
  `RadioDialPresenter` at `:419`, and unlocks the pointer at `:433`; it does
  not raise a diegetic radio prop.
- The first-person overlay infrastructure is currently weapon-centric:
  `FirstPersonWeapon` owns `WeaponModel` at
  `src/systems/player/FirstPersonWeapon.ts:64`, while `WeaponModel` owns a
  separate `weaponScene` at `src/systems/player/weapon/WeaponModel.ts:27` and
  renders it over the main scene at `:115`.
- There is already a static command-post radio asset,
  `AN_PRC_25_FIELD`, at `src/config/generated/warAssetCatalog.ts:145` /
  `:286`, but it is a 0.45 x 1.7 x 0.4m field-radio stack, not a player-held
  first-person viewmodel.
- A local Kiln review candidate for a player-held radio was generated under
  `artifacts/kiln/radio-viewmodel/2026-07-01-bc351ff7/`. It is review-only and
  should not be copied into runtime without the normal war-catalog import path.

### Diagnosis

The current desktop radial is mixing category navigation and direct actions in
one hover-dependent control. `Markings` behaves like a fire-support modifier,
but it is presented as a peer category. `Stations` is really a music channel
feature, but it sits beside combat actions without enough explanation. The
outer ring also has a small annular gap and re-renders on hover, which can make
selection feel slippery.

There is also a diegesis gap: opening the radio currently presents a floating UI
surface but never shows the player holding the radio. For a first-person
combined-arms game, the expected sequence should be "raise the radio, choose or
confirm the call, then either use an existing target mark or stow the radio and
throw a marker." Treating the radio, the weapon, and the smoke canister as
separate held equipment states will make the command layer easier to understand
than trying to explain it with HUD text.

### Proper solutions

1. Immediate input fix.
   - Make category focus click-to-lock instead of hover-first.
   - Enlarge outer-sector hit targets, close the ring gap, and add keyboard or
     gamepad radial navigation.
   - Add a center/detail panel that explains the focused category and selected
     option status.
2. Proper radial IA redesign.
   - Use three inner-ring categories such as `Fire Support`, `Squad`, and
     `Signals` or `Field Radio`.
   - Move smoke/WP/grid under `Fire Support` as a target-marking modifier, not a
     peer top-level category.
   - Move music stations under `Signals` with copy that makes default-off music
     behavior explicit.
   - Add third-ring expansion only when a second-ring option needs sub-options.
     Example: `Fire Support -> A-1 Napalm -> Smoke/WP/Grid`.
3. Mirror the same model on touch.
   - The bottom sheet should share the same category tree as desktop instead of
     being a separately-worded escape hatch.
4. Add a first-person radio viewmodel state.
   - When `T` or the Radio HUD slot opens the radio, lower/suppress the current
     weapon and raise a compact radio prop in the lower-center/left of the
     first-person overlay.
   - Prefer a small `HeldEquipmentViewmodelSystem` or equivalent adapter over
     overloading weapon switching. It can reuse the overlay-scene/render
     pattern, but radio/smoke are not firearm rigs and should not inherit
     weapon fire/reload semantics.
   - Use the Kiln candidate only after owner approval and normal import:
     `artifacts/kiln/radio-viewmodel/2026-07-01-bc351ff7/radio-viewmodel.glb`
     should be treated as source review material, not a production model.
   - Keep the prop below the reticle and fade/drop it when aiming, entering a
     vehicle gunner state, or opening a blocking map/deploy surface.
5. Make the radio action sequence explicit.
   - Radio up: choose `Fire Support`, `Squad`, or `Signals`.
   - If a fire-support action needs a target and no target mark exists, present
     `Throw Smoke Marker` as the next action instead of a vague `Mark` category.
   - If a settled target mark exists, present `Use Current Smoke Mark`,
     `Throw New Smoke`, and `Clear Mark` as second-ring choices.
   - Music/stations remain under `Signals` and stay default-off.

### Acceptance

- Desktop outer-ring options can be selected reliably with mouse, keyboard, and
  controller-friendly paths.
- `Mark` no longer reads like a direct action unless it actually throws or
  places a marker.
- `Stations` reads as radio/music and respects music default-off state.
- Opening the radio visibly raises a first-person radio prop and suppresses the
  weapon without firing or reloading side effects.
- The radio prop does not block the reticle, target designation, or threat
  readability in desktop and mobile screenshots.
- Controller/model tests cover category trees and option intents; Playwright
  clicks prove outer ring hit targets.

2026-07-01 hotfix supersession: owner playtest rejected the extra
fire-support target-method step. Current implementation is direct mission
selection: `Fire Support -> mission` arms that mission's targeting smoke marker,
closes the radial, and cancels on weapon swap. Do not restore `Use Current
Smoke Mark`, `Throw Smoke Marker`, or reticle/grid as a second/third-ring
selection without fresh owner approval.

## 6. Smoke mark should be a real hold-to-throw mechanic

Owner note: "mark with smoke" should become a proper thing: hold down to see a
visual charge-up for throw distance, show the arc, release, let it land and
bobble a little, then that landing point becomes the spot. Other guidance
systems can build on it later.

### Code mapping

- Current mark types are data: `AirSupportTargetMarking = 'smoke' |
  'willie_pete' | 'position_only'` at
  `src/systems/airsupport/AirSupportRadioCatalog.ts:15`, with labels at `:42`.
- The radio controller stores marking choice, not a thrown object, at
  `src/ui/hud/radio/RadioDialController.ts:47` and `:114`.
- `StrikeDesignationController.confirm()` is the current target confirmation
  path at `src/systems/airsupport/StrikeDesignationController.ts:137`.
- If the accepted marking is not `position_only`, smoke is spawned immediately
  at the selected target at `src/systems/airsupport/StrikeDesignationController.ts:257`.
- The existing grenade stack already has a trajectory preview:
  `GrenadeArcRenderer` is constructed by `GrenadeSystem` at
  `src/systems/weapons/GrenadeSystem.ts:89`.
- Smoke grenades already route to `spawnSmokeCloud` through
  `GrenadeEffects.explodeSmoke` at `src/systems/weapons/GrenadeEffects.ts:171`
  and `:189`.
- `GrenadeSystem.spawnProjectile(...)` exists at
  `src/systems/weapons/GrenadeSystem.ts:417`.

### Diagnosis

The current "Smoke Mark" is a fire-support targeting modifier that instantly
spawns a smoke cloud on the designated target after confirm. It is not a
physical marker, not throw-charged, and not reusable by future guidance logic.

### Proper solutions

1. Add a throwable smoke-marker mode.
   - Prefer a small `SmokeMarkerSystem` or a narrow extension of
     `GrenadeSystem` with a distinct `smoke_marker` payload.
   - Hold input charges throw velocity/range.
   - Existing `GrenadeArcRenderer` can draw the predicted arc.
   - On release, spawn a canister projectile; on landing, bounce/bobble briefly
     and settle.
2. Create a persistent target-mark record.
   - The resting canister/smoke location becomes an active `TargetMark`.
   - Air-support calls can consume the latest active target mark, or prompt the
     player to throw one.
   - Keep this separate from `StrikeDesignationController`'s current
     look-to-designate flow so the old path can remain as a fallback.
3. Integrate radio IA after the marker exists.
   - The radial can offer `Throw Smoke Marker` or `Use Current Smoke Mark`
     without making "Mark" a vague top-level category.
   - Later guidance systems can subscribe to the same `TargetMark` state.
4. Define the held-equipment sequence.
   - From radio: selecting `Throw Smoke Marker` stows/drops the radio, equips a
     smoke canister viewmodel, and enters hold-to-charge.
   - From direct hotkey: holding the smoke/mark input equips the canister
     immediately, shows charge and arc, and release throws.
   - After the canister settles, the player can raise the radio again and choose
     `Use Current Smoke Mark` for the call.
   - Cancel/escape should return to the previous weapon without leaving a ghost
     arc, stuck charge, or half-open radio UI.

### Acceptance

- Holding the mark input shows charge state and predicted arc.
- Releasing throws a visible smoke canister.
- The canister lands, bounces/bobbles briefly, settles, then emits smoke.
- The settled position is readable by fire-support/guidance code.
- Radio -> smoke -> radio is a supported sequence, not a single overloaded
  radial click.
- Smoke-marker cancellation cleanly restores the prior weapon and clears the
  preview.
- Automated tests cover charge-to-velocity, landing/settle lifecycle, and mark
  record creation; human playtest signs off on throw feel.

2026-07-01 hotfix supersession: the supported radio sequence is now one click
shorter. Selecting a specific fire-support mission equips a mission-specific
smoke marker immediately; the separate radio -> smoke -> radio target-method
loop above remains historical analysis, not the current UX contract.

## Recommended Work Split

Recommended split if this becomes implementation work:

1. `cycle-2026-07-01-playtest-hotfixes`
   - 3D deploy marker labels and legend.
   - Immediate audio strip/mute for worst placeholder one-shots and status cues.
   - Helicopter and infantry tracer-origin diagnostics.
   - Desktop radial click-lock/hit-target improvement.
2. `cycle-2026-07-radio-and-smoke-marker`
   - Full radio IA redesign.
   - First-person radio viewmodel and held-equipment state.
   - Throwable smoke marker.
   - Fire-support target-mark integration.
3. `cycle-2026-07-audio-cue-redesign`
   - Licensed/generated asset sourcing.
   - Cue taxonomy, loudness normalization, provenance docs.
   - Replacement of reused weapon/radio/objective cues.

Risk note: helicopter and infantry shot-origin fixes should be instrumented
before offset tuning. Otherwise there is a high chance of moving the visible
effect without fixing the actual duplicate-owner or parallax cause.

Fence note: the preferred plans above avoid `src/types/SystemInterfaces.ts`.
If implementation later needs a new fenced renderer/HUD/audio interface, that
requires explicit `[interface-change]` approval.
