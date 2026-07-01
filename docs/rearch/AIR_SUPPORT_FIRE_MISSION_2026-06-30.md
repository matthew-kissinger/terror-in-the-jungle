# Air-Support Fire-Mission — Call-In, Choreography, VFX & Audio (DESIGN SPIKE)

Status: **Draft plan — review before implementation. Default-OFF rollout behind feature flags; phased.**
Slug: `air-support-fire-mission` · Date: 2026-06-30 · Owner review required.

**Decisions locked (2026-06-30, owner):** (1) **Targeting** = world-space laze + confirm (primary modality). (2) **Radio key** = add a visible **T** key-hint badge only — do NOT bind `Digit4` (it is SANDBAG, which suppresses the radio's `T`) and no backtick alias. (3) **Audio** = free/CC0 + existing sounds only — no ElevenLabs generation; procedural radial-gradient fire texture as the flame stopgap (no image-gen). (4) **Scope** = execute all phases 0-3. These override the recommendations in §9 where they differ (notably §3.3 radio binding and §5.5 manifest).

Companion source of truth (VERIFIED, do not re-derive): [`AIR_SUPPORT_FIRE_MISSION_ANALYSIS_2026-06-30.md`](AIR_SUPPORT_FIRE_MISSION_ANALYSIS_2026-06-30.md) (same directory) (fix backlog #1-14). Prior spike that wired the working sortie engine: `docs/rearch/AIR_SUPPORT_RADIO_SPIKE_2026-06-03.md`. Brief precedent: `docs/tasks/archive/air-support-radio/air-support-radio.md`.

> Scope note: this is a design/planning doc (a spike). The cycle brief that dispatches the work will be created (at cycle kickoff) at `docs/tasks/air-support-fire-mission.md` (≤80 LOC, per `docs/tasks/_TEMPLATE.md`) and links back here. This doc is exhaustive on purpose; the brief will be terse.

---

## 1. Vision — the felt experience

You are pinned in the treeline. You key the radio (`T`). The dial opens, a soft station hiss under it. You pick **AC-47 Spooky**. The menu closes you back into your own eyes — now a ground ring tracks where you look, sized to the gun's footprint, the reticle snapping to the dirt. You sweep it onto the enemy ridge: the ring goes green, the reticle pulses, "RANGE 412m ✓". You squeeze: **CLEARED HOT? — GRID 412 / -088**. You confirm — a short camera kick, "Cleared hot." A bearing pip slides onto your compass, "Spooky inbound, ten seconds," a low rumble building. Then the gunship arrives on a tight left-hand pylon turn, a solid silhouette against the haze (no flicker), and walks a cone of tracer fire onto your mark. Smoke blooms where you painted it. Rounds complete. The asset goes onto cooldown. **Every aircraft is visibly, intentionally choreographed — inbound, pattern, ordnance, egress.**

What this fixes, felt: today the target is frozen the instant the menu opens and you cannot re-aim (`CommandInputManager.ts:375,432,462`); selecting an asset fires immediately with no confirm (`:576-595`); the marking selector is decorative (`AirSupportRadioCatalog.ts:42-46`); aircraft blink in and out (`AirSupportManager.ts:250-252`); Spooky orbits slow and shaky (`states.ts:114-119`); napalm burns 12s with zero visuals (`NapalmMission.ts:104-128`).

---

## 2. Current state (verified)

**Plumbing is sound; execution is incomplete.** One composition point and one request→queue→spawn→tick→cleanup lifecycle serve all five sortie types (`SystemInitializer.ts:182`, `OperationalRuntimeComposer.ts:503-524`, `SystemUpdater.ts:281-289`, `AirSupportManager.ts:113-135,217-244,313-372`). All three call-in surfaces funnel into `AirSupportManager.requestSupport(request)` (`AirSupportManager.ts:113`) — **non-fenced**, so additive changes are safe.

Verified root causes (from `air-support-analysis.md`):

| Defect | Root cause | Cite |
|---|---|---|
| Target frozen on menu-open, can't re-aim | `resolveRadioTarget()` runs once on open, pointer unlocks | `CommandInputManager.ts:375,432,462,382,435,464` |
| No DESIGNATE / CONFIRM step | Asset-select calls `requestSupport` immediately + closes surface | `CommandInputManager.ts:576,591-595` |
| Marking (smoke/WP/grid) is cosmetic | Never threaded into request; `AirSupportRequest` has no marking field | `AirSupportRadioCatalog.ts:42-46`, `AirSupportTypes.ts:10-19` |
| "Press 4" footgun | `Digit4`→SANDBAG, which *suppresses* the radio's `KeyT` open | `InventoryManager.ts:345-347`, `PlayerInput.ts:585` |
| Air-support aircraft flicker | No `frustumCulled=false`; default per-mesh GLB culling on a banking hierarchy | `AirSupportManager.ts:250-252` |
| Spooky orbit shaky + slow | Live orbit is PD-pursuit through 6-DOF airframe; catalog speed never reaches controller; clean parametric orbit is dead code | `states.ts:114-119`, `types.ts:91,98`, `SpookyMission.ts:48-66` |
| Arclight wastes physics | `B52_ARCLIGHT_PHYSICS` built + ticked, then `updateArclight` overwrites pose every frame with no `physicsControlled` guard | `AirSupportManager.ts:316-322,385`, `ArclightMission.ts:68-73` |
| Napalm fire invisible | One pooled burst/zone at drop (fire sub-effect ~800ms of a 3s bundle); 9-11s of burn with zero VFX; no fire texture, sub-pixel size | `NapalmMission.ts:81-86,104-128`, `ExplosionParticleUpdater.ts:39`, `ExplosionEffectFactory.ts:54-58,103-111` |
| Napalm audio mis-wired | Plays generic `grenadeExplosion` not the dedicated `napalmExplosion` config | `NapalmMission.ts:100`, `audio.ts:139-145` |
| RocketRun IFF gap | `GrenadeSystem.spawnProjectile` called with no faction | `RocketRunMission.ts:81` |

Live renderer: `WebGLRenderer` + `THREE.AgXToneMapping` exposure 1.0 (`GameRenderer.ts:50,179-180`); camera far 1000 (4000 on A Shau, `AShauValleyConfig.ts:148`); bloom threshold 1.0 (`ExplosionEffectFactory.ts:8`). **Every new emissive material must be screenshot-verified against live AgX** (analysis §9).

---

## 3. Call-in UX

### 3.1 State machine

Adds **DESIGNATE** and **CONFIRM** between SELECT and the existing `requestSupport()` call. Everything downstream is reused verbatim.

```
                          ┌──────────────────────────────────────────────────────────┐
                          │                                                          │
                          ▼                                                          │ (abort / Esc
   ╔═════════╗  open radio (T / pill / pad)  ╔════════════════╗                      │  any state →
   ║  IDLE   ║ ────────────────────────────► ║  RADIO/SELECT  ║                      │  returns to play,
   ║(playing)║ ◄──────── close (no pick) ──── ║  (pick asset)  ║                      │  no cooldown spent)
   ╚═════════╝                                ╚════════╤═══════╝                      │
        ▲                                              │ select asset (cooldown OK)  │
        │                                              ▼                             │
        │                                     ╔════════════════╗  ◄── live view-ray  │
        │        cancel / re-pick asset ◄──── ║   DESIGNATE    ║      every frame     │
        │                                     ║ (place target) ║  ──► reticle+ring    │
        │                                     ╚════════╤═══════╝      track ground    │
        │                                              │ commit point (LMB / pad A / tap)
        │                                              ▼
        │                          ┌──── INVALID gate ─┴───────────────┐
        │                          │  out-of-range  │ danger-close      │  valid
        │                          │  no-ground*    │ (friendlies in     │
        │                          ▼                │  effect radius)    ▼
        │                  (ring greyed/red,        │           ╔════════════════╗
        │                   commit disabled,        └─────────► ║    CONFIRM     ║
        │                   re-aim to clear)  override (hold)    ║ "CLEARED HOT?" ║
        │                          ▲                             ╚════╤══════╤════╝
        │                          └──────────── re-aim ──────────────┘      │ confirm
        │                                                                    ▼
        │                                                           ╔════════════════╗
        │                                            cancel window  ║    INBOUND     ║  requestSupport()
        │                                            (≤ ~2s, refund ║ callsign + ETA ║  fires HERE →
        │                                             cooldown)  ◄── ╚════════╤═══════╝  air_support_inbound
        │                                                                    │ ETA = 0 (config.delay elapsed)
        │                                                                    ▼
        │                                                           ╔════════════════╗
        │                                                           ║    EXECUTE     ║  spawnMission →
        │                                                           ║ pass/orbit/drop║  updateMission (existing)
        │                                                           ╚════════╤═══════╝
        │                                                                    │ mission outbound complete
        │   cooldown fill complete (per-type)                       ╔════════▼═══════╗
        └───────────────────────────────────────────────────────── ║  BDA / COOLDOWN║  air_support_complete
                                                                    ║"ROUNDS COMPLETE"║  → cooldown ring
                                                                    ╚════════════════╝
  * no-ground = looked at sky; picker returns 200m fallback → ring grey until player looks down.
  LOS is SOFT (advisory): strikes are top-down ordnance; the picker stops at first terrain hit by construction.
```

Transition table (abbreviated; full table in §3.6):

| From | Trigger | To | Key side effect |
|---|---|---|---|
| IDLE | `T`/pill/pad | RADIO/SELECT | open dial; **do NOT freeze `radioTarget` on open anymore** (the delta vs today) |
| RADIO/SELECT | asset selected (ready) | DESIGNATE | stash `pendingAssetId`+`selectedMarking`; relock pointer; show reticle+ring |
| DESIGNATE | every frame | DESIGNATE | `resolveCameraGroundPick(radioTarget)` per frame (`CommandInputManager.ts:631`) drives ring; recompute gates |
| DESIGNATE | commit on valid | CONFIRM | snapshot `radioTarget`; freeze ring; show banner |
| DESIGNATE | commit on invalid | DESIGNATE | reject pulse (danger-close needs hold-override) |
| CONFIRM | confirm | INBOUND | build `approachDirection` (`:566-574`); `requestSupport()` (`:576`); spend cooldown |
| INBOUND | within ~2s → abort | IDLE | `cancelSupport()` refunds 50% (`AirSupportManager.ts:137,145`) |
| INBOUND | ETA=0 | EXECUTE | engine auto (`processPending`, `:217-227`); UI observes |
| EXECUTE | outbound complete | BDA | `air_support_complete` (`:187`) → toast + cooldown ring |
| **ANY (pre-INBOUND)** | Esc/pad-B | IDLE | abort, no cost |

### 3.2 Primary targeting modality (TOP OPEN DECISION)

**Recommendation: world-space laze-and-confirm is PRIMARY; tactical-map click is SECONDARY.**

The verified #1 defect is the frozen-on-open target the player can't re-aim (`CommandInputManager.ts:375,382`). Laze-and-confirm inverts it: the menu closes into a live DESIGNATE where the pointer is relocked and the marker tracks the view ray via `resolveCameraGroundPick` called **per frame** instead of once (`:631`). The picker is already shared with squad look-to-mark, so reuse keeps parity. Secondary path: in `CommandModeOverlay`, route `CommandTacticalMap.onPointSelected` (`CommandTacticalMap.ts:82-84,154-156`, already a click→`Vector3` + gamepad cursor) into the **same CONFIRM gate** when a fire-support asset is armed — both modalities converge on CONFIRM → `requestSupport`. Map-first is ~90% pre-wired (it's a routing flip), so the owner can flip the default after playtest with no rewrite.

### 3.3 Radio SELECT binding (resolving "press 4")

`Digit4`→`WeaponSlot.SANDBAG` unconditionally (`InventoryManager.ts:345-347`), and SANDBAG mode *suppresses* the `KeyT` open (`PlayerInput.ts:585`). **Do not bind Digit4.** Three coordinated parts:

1. **Keep `KeyT` canonical** (`PlayerInput.ts:586` → `toggleRadioDial`, `CommandInputManager.ts:341-352`).
2. **Add a visible `T` key-hint badge** to the radio pill, matching the `.uwb-key` glyph on weapon slots 1-6 (`RadioHotbarSlot.ts:47-51`) — backlog #5, cheapest discoverability fix.
3. **Add one dedicated alias** `Backquote` (`` ` ``, left of `1`, free — 1-6 are weapons/heli, Shift+1-6 are squad quick-commands per `PlayerInput.ts:637-651`). Route it through the **pill-click path** dispatching `RADIO_SLOT_OPEN_EVENT` (`RadioHotbarSlot.ts:60`, consumed at `CommandInputManager.ts:106`) — this path **bypasses the SANDBAG guard**, removing the last footgun. Reject promoting RADIO to a 7th `WeaponSlot` — it fights the explicit non-weapon design (`RadioHotbarSlot.ts:5-7`).

### 3.4 HUD per state (reuse map)

| HUD element | State(s) | Reuse | Cite | New |
|---|---|---|---|---|
| Radio wheel / asset list / marking row / cooldown bars | SELECT | `RadioDial`+`AirSupportRadioMenu`+`CommandModeOverlay`; `setRadioCooldowns` fan-out | `CommandInputManager.ts:354-357,377-381` | promote marking (§5.2) |
| Live target reticle (center, pulses on valid) | DESIGNATE | HUD-layer CSS reticle (NOT a new `CrosshairMode`, leave `CrosshairSystem` enum untouched) | `CrosshairSystem.ts:39-47,241-247` (pattern) | small CSS + keyframe |
| Ground effect-radius ring + beacon | DESIGNATE→EXECUTE | **mirror** `SquadCommandWorldMarker` (ring/fill/post/cap, `frustumCulled=false`, `toneMapped:false`) | `SquadCommandWorldMarker.ts:25-83,101-124` | new `StrikeTargetMarker`, radius-param + color states |
| Range gate (grey when too far) | DESIGNATE | origin→target scratch | `CommandInputManager.ts:566-574` | `maxCallRange` config field |
| Danger-close (red ring + ⚠ + hold-override) | DESIGNATE | `dangerCloseRadius` (already in catalog) + friendly count via Recon's spatial query | `AirSupportRadioCatalog.ts:31`; `ReconMission.ts` `querySpatialRadius` | gate + hold |
| CONFIRM "cleared hot" banner + grid | CONFIRM | `describeRadioTarget()` grid text | `CommandInputManager.ts:665` | `FireMissionBanner` element |
| Inbound callsign + ETA countdown | INBOUND | `air_support_inbound` payload `{eta}`; `showMessage` for callsign | `AirSupportManager.ts:128-132`; `HUDSystem.ts:551` | fixed-width ETA readout |
| Inbound compass bearing pip | INBOUND | `CompassSystem` marker (as zone/vehicle markers) | `CompassSystem.ts:140-148` | strike-marker source |
| On-target smoke mark | INBOUND→EXECUTE | `SmokeCloudSystem` | `SmokeCloudSystem.ts:33-37` | spawn keyed off marking |
| Impact shake (ordnance-scaled) | EXECUTE | `CameraShakeSystem.shakeFromExplosion` | `CameraShakeSystem.ts:156` | wire from mission explosions |
| BDA "ROUNDS COMPLETE" toast | BDA | `showMessage` on `air_support_complete` | `HUDSystem.ts:551`; `AirSupportManager.ts:187` | listener |
| Cooldown fill | BDA→IDLE | existing radio cooldown bars | `CommandInputManager.ts:354` | none |

Wireframes (compact):

- **DESIGNATE:** top strip `▌AC-47 SPOOKY · DESIGNATE … RANGE 412m ✓`; center reticle; ground ring (GREEN valid / GREY out-of-range or no-ground / RED danger-close); bottom hint `[LMB/TAP: mark here] [Esc: back]`.
- **CONFIRM:** ring locked brighter (amber pre-confirm pulse); center-low banner `CLEARED HOT? AC-47 SPOOKY → GRID 412 / -088 · [ENTER/LMB/(A) CONFIRM] [ESC/(B) ABORT]` (never over the reticle).
- **INBOUND:** strip `… INBOUND ETA 06`; compass strike pip `▲082°`; ring faint/dashed; smoke blooming if marking ∈ {smoke, willie_pete}; line "Spooky inbound, ten seconds"; `[Esc: ABORT (refund)]`.
- **BDA:** toast `ROUNDS COMPLETE — AC-47`; asset row shows cooldown ring next open.

Color roles (consistent): GREEN=valid, RED=danger, AMBER=pending-confirm, GREY=disabled/out-of-range. Every critical state has **two feedback channels** (e.g. danger-close = red ring + ⚠ text + pulse + audio). Numerics fixed-width (ETA `06`, range `412m`, grid `412 / -088`). Edge HUD padded with `env(safe-area-inset-*)`; touch CONFIRM ≥44px, separated from look/fire. (threejs-game-ui-designer: `references/checklists/hud-readability.md`, `game-ui-quality.md`, `responsive-ui-fit.md`, `mobile-input.md`, `references/ui-patterns.md`.)

### 3.5 Gating rules (INVALID handling)

- **Cooldown (SELECT):** grey rows when `getCooldownRemaining(type)>0` (`AirSupportManager.ts:149`); reject selection in SELECT (don't reach DESIGNATE) instead of late-rejecting in `requestSupport` (`CommandInputManager.ts:597-603`).
- **Range (DESIGNATE):** `dist = horizontalDistance(radioOrigin, radioTarget)` each frame; `dist > asset.maxCallRange` → grey ring + commit blocked + `✕ TOO FAR`. `maxCallRange` is a new additive config field, generous defaults (spooky ~1500m, arclight unlimited).
- **LOS — SOFT/advisory:** picker stops at first terrain hit (`CommandInputManager.ts:642-655`), so marks are on visible ground by construction; sky-aim hits the 200m fallback → faint `· NO GROUND ·` + grey until player looks down. No separate raycast.
- **Danger-close (DESIGNATE→CONFIRM):** count friendlies within `asset.dangerCloseRadius` (`AirSupportRadioCatalog.ts:31`) via Recon's spatial query; if >0 → red ring + `⚠ DANGER CLOSE — N FRIENDLY IN RADIUS` + commit requires hold (~600ms LMB / pad-A) to override. Makes danger-close a real mechanic for the first time.

### 3.6 Input matrix

| Action | KB/Mouse | Gamepad | Touch |
|---|---|---|---|
| Open radio | `T` · `` ` `` alias · click pill | pad open → `RADIO_SLOT_OPEN_EVENT` | tap pill (bottom-sheet) |
| Navigate / cycle marking | ↑↓ Enter / click; click `[Smoke][WP][Grid]` | stick/d-pad + A; LB/RB cycle marking | tap row / chip |
| Aim target | mouse-look (relocked) | right-stick; or map cursor `nudgeGamepadCursor` (`CommandTacticalMap.ts:130`) | drag-look / tap-on-map (secondary) |
| Commit point | LMB (hold = danger-close override) | A (hold) | tap (long-press override) |
| CONFIRM cleared hot | LMB/Enter | A | tap CONFIRM |
| Cancel/abort | Esc / B | B | tap ABORT |
| Abort inbound (refund) | Esc in cancel window | B | tap ABORT |

### 3.7 Juice

| Beat | Effect | Reuse |
|---|---|---|
| Reticle snap+pulse on valid lock | scale 1.15→1.0 (120ms) + ring opacity pop | CSS keyframe; mirrors spread-ring (`CrosshairSystem.ts:241-247`) |
| Confirm camera-kick | `shake(0.10-0.14, ~180ms)` | `CameraShakeSystem.shake()` (`CameraShakeSystem.ts:118`) |
| Danger-close pulse | red ring + ⚠ at ~2Hz, intensifies on hold | CSS keyframe |
| Inbound rumble swell | as ETA crosses ~3s: faint low rumble + subtle `shake(0.02)` | `CameraShakeSystem.shake()`; audio via `IAudioManager.play` (no signature change) |
| Impact shake scaled to ordnance | per explosion `shakeFromExplosion(pos, playerPos, radius)` — Arclight rolling walk, Napalm one WHUMP, rockets sharp | `CameraShakeSystem.shakeFromExplosion()` (`:156`) |
| Controller rumble | NEW additive `GamepadManager.rumble(strong, weak, ms)` via `vibrationActuator.playEffect('dual-rumble', …)` | additive on `GamepadManager` (no existing rumble); not fenced |

Reduced-motion: gate the continuous inbound shake + screen pulses; keep discrete confirm-kick + impact shakes (informational).

---

## 4. Per-aircraft choreography + VFX

### 4.0 Universal visibility fix (implement ONCE in `spawnMission`, applies to all 5)

After `this.scene.add(aircraft)` (`AirSupportManager.ts:252`):
1. `aircraft.traverse(c => { c.frustumCulled = false; })` — backlog #1, highest leverage; kills the multi-mesh-GLB blink (stale local bounding spheres on a banking hierarchy). At most ~5 transient hero aircraft; cost negligible.
2. `material.fog=false` on hero materials (guard array materials) — keeps crisp silhouettes when `WeatherAtmosphere` spikes fog ×1.5-3.5 (`WeatherAtmosphere.ts:170-184`); sidesteps fog-driven blink (#12) for air-support specifically.
3. No distance/frustum cull for air-support aircraft (they never call `shouldRenderAirVehicle`; keep it that way). Max mission altitude 600 sits inside camera far 1000/4000.

### 4.1 Per-aircraft table

| Aircraft | Inbound | Pattern | Ordnance | Impact VFX | Juice |
|---|---|---|---|---|---|
| **Spooky AC-47** | spawn 500m out, climb to orbit during COLD→ORBIT spin-up | **Re-enable dead parametric circle** (`SpookyMission.ts:48-66`): `getPhysicsConfig('spooky')→undefined` so `physicsControlled=false` (backlog #2, `AirSupportManager.ts:381,350`). Raise `speed` 40→~58, tighten `ORBIT_RADIUS` 200→~170 (`SpookyMission.ts:12,49`) for a ~18s loop. Left-hand pylon turn, `BANK_ANGLE≈0.44` | minigun bursts 2-3s, 25 rds/burst, 8 dmg/rd, 15m scatter — unchanged (`SpookyMission.ts:16-20,69-120`) | existing `tracerPool?.spawn()` per round (`:101`) — keep; re-verify convergence post-orbit (belly offset `-2` ignores bank, `:92`) | quaternion-slerp orbit attitude vs Euler-snap (backlog #11, `SpookyMission.ts:65`): target quat from tangent yaw + constant bank, slerp `1-exp(-k·dt)`, k≈6-8. Low continuous shake while player inside orbit footprint |
| **Arclight B-52** | spawn 500m out, single straight run at `terrainH+600` | straight carpet, no turns (by design). **Fix double-drive first** (backlog #3, critical): **drop the `B52_ARCLIGHT_PHYSICS` controller** — `updateArclight` already overwrites pose every frame with no guard (`ArclightMission.ts:68-73`); physics is 100% wasted. Smallest diff, zero behavior change | 12 bombs walked one per `BOMB_INTERVAL=0.18s`, 14m radius / 160 dmg, correct IFF — unchanged (`ArclightMission.ts:30-36,89-105,146-155`) | existing pooled `explosionSpawn`/bomb (flash+smoke+fire+debris+shockwave) — already staggered correctly; reference pattern | distant rumble ~1-2s BEFORE visual carpet (delayed audio cue, not flash-synced); escalating `shakeFromExplosion` as stick walks toward player (distance falloff already built, `CameraShakeSystem.ts:151-169`) |
| **Napalm A-1/F-4** | spawn 500m out, low fast run at `terrainH+100` | low straight pass (current `updateNapalm` lerp shape correct) | drop at 50m, 6 fire zones on 75m line, 200 burst dmg + 12s burn ticks — damage correct, untouched (`NapalmMission.ts:12,67,71-78,104-128`) | **Currently one burst/zone then nothing 9-11s.** Fix: keep 6 staggered bursts AND spawn 6 persistent `NapalmFireZone` (§4.2) for full 12s | stagger 6 bursts over ~0.3-0.6s (backlog #6, avoids pool eviction, `CombatantSystem.ts:141`); fix audio key → `napalmExplosion` (backlog #7, `NapalmMission.ts:100`); sharp drop shake, then quiet burn (no continuous shake) |
| **RocketRun AH-1** | spawn 400m out, diving approach at `terrainH+80` | dive → fire window 200→100m → pitch-up break climb 30m/s for 5s — real pass-and-break, keep (`RocketRunMission.ts:38-112`) | 6 rockets 0.3s apart via `GrenadeSystem.spawnProjectile(…, 'rocket')` (`:69-81`). **OPEN IFF risk** (backlog #13): no `shooterFaction` passed; verify `GrenadeSystem`'s `'rocket'` path threads IFF or thread it before shipping juice | delegated to `GrenadeSystem` projectile-impact (shared pooled explosion) | pitch-up break (`rotation.x=-0.3·min(breakT,1)`, `:103-107`) is the most filmable beat — brief camera-follow yaw nudge + engine pitch-up sting |
| **Recon A-1** | spawn 300m out, high slow loiter at `terrainH+200` | dead-straight flyover, no ordnance — correct (`ReconMission.ts:8-37`) | none; `recon_reveal` event once within 100m (`:45-54`) | none | lowest-juice by design: single soft "spotted" sting on `recon_reveal`, no shake; over-juicing recon competes with the kinetic missions |

### 4.2 Napalm fire system (the headline missing visual)

**Technique: additive sprite-sheet flipbook billboards** (cheapest reliable; matches engine idiom). `SmokeCloudSystem` (`SmokeCloudSystem.ts`) is already a billboard-sprite persistent-effect system with the exact lifecycle shape — **mirror its structure, do not invent a new pattern**. Rejected alternatives (per analysis §6): GPU-particle dependency (new dep for one feature); ray-marched volumetric (heaviest, no official TSL fire example). Ref: threejs-aaa-graphics-builder `SKILL.md:51-53` (Core Rule: authored forms → materials → lighting → effects), `references/render-recipes.md`, `references/implementation-blueprint.md`.

**Architecture — `NapalmFireSystem` (new module, mirrors `SmokeCloudSystem`):**
- Pool 12 slots (6 zones × headroom for 2 overlapping calls; cooldown 90s, burn 12s — overlap rare). Mirrors `SmokeCloudSystem` MAX_CLOUDS pattern (`SmokeCloudSystem.ts:46`).
- Per zone = one `NapalmFireZone` group:
  - **Flame:** 6-10 additive flipbook billboards, UV-offset sprite-sheet, per-billboard frame-rate jitter ±15% so they don't sync.
  - **Smoke:** reuse `SmokeCloudSystem.spawnSmokeCloud(zonePos)` per zone (`SmokeCloudSystem.ts:33-35`) — its expand→linger→dissipate (~12-14s, `:170-173`) tracks `FIRE_DURATION=12s`. Zero new smoke code (genuine reuse via the public module fn).
  - **Embers:** small `THREE.Points`, 8-15/zone, upward drift + flicker-fade, additive; ember dot texture from `createFlashTexture` radial-gradient approach (`ExplosionTextures.ts:29-49`).
  - **Scorch decal:** flat additive/normal quad rotated `-PI/2` (as the shockwave ring, `ExplosionEffectFactory.ts:142,156`) at terrain height, persists `FIRE_DURATION` then fades on the same dissipate tail.

**Material recipe (AgX-tuned):**
```
new THREE.SpriteMaterial({
  map: flameAtlasTexture,                           // NOT in repo — see asset note
  color: new THREE.Color(0xff7a1a).multiplyScalar(FLAME_BLOOM_GAIN), // ~2.0-2.4 (> explosion fire's 1.8)
  blending: THREE.AdditiveBlending, transparent: true,
  depthWrite: false, depthTest: true,               // respects scene depth, no terrain bleed-through
  sizeAttenuation: true,                            // stays visible at 50-500m (the bug: 1.2px sub-pixel)
  fog: false,                                       // saturated through scenario fog
});
```
Per-billboard base scale ~3-5m + slow sin size-pulse (period ~0.4-0.6s, ±10%) on top of flipbook. Bloom check: `0xff7a1a`×2.0-2.4 clears threshold 1.0 on all channels; **screenshot-verify against live AgX** (analysis §9).

**Budget (full 6-zone strike):** ~36-60 flame sprites + 48-90 ember points (6 `Points` objects) + 6 scorch quads + smoke (reuses existing pool, 0 new draw calls) ≈ 18 new objects, comparable to one Arclight bomb-stick footprint; transient (gone ~15s, 90s cooldown). Flame sprite count is within the proven `SmokeCloudSystem` 24/cloud × 10 = 240-sprite steady-state budget.

**Lifecycle (mirror `SmokeCloudSystem` exactly):** pool/acquire/age/deactivate; track `age` vs imported `FIRE_DURATION` (`NapalmMission.ts:16`, don't fork "12"); fade final ~2s (mirror dissipate taper, `:105-109`); on expiry zero-opacity + `visible=false` + return to pool (never destroy/recreate geometry, as `deactivateCloud` `:301-316`); wire disposal from the existing `fireElapsed > FIRE_DURATION` → outbound branch (`NapalmMission.ts:131-133`).

**Asset gap (explicit):** no fire atlas exists in `src/` (`ExplosionTextures.ts` has smoke/flash/debris only, `:9-69`). Procedural radial-gradient stopgap (static frame) can unblock presence; the real flame atlas needs sourcing (`threejs-image-generator`, gated per `threejs-aaa-graphics-builder/SKILL.md:30-37`). Do not silently ship procedural-only as final.

### 4.3 Shared VFX upgrades

- **Marker smoke on confirm:** spawn one `SmokeCloudSystem.spawn(targetPosition)` at "cleared hot" — pure reuse, instant visual confirmation of the mark before the aircraft arrives.
- **Staggered-spawn discipline:** Napalm 6 zones over ~0.3-0.6s (0.05-0.1s apart) — adapt Arclight's accumulator (`ArclightMission.ts:20-23`) to keep the shared 16-slot pool from evicting mid-spawn under concurrent load.
- **Explosion fire texture (backlog #8, helps all explosions):** give pooled fire a real texture + `sizeAttenuation` tuning (`ExplosionTextures.ts`, `ExplosionEffectFactory.ts:103-111`).

---

## 5. Audio

`IAudioManager` is fenced to 4 methods incl. `play(soundName, position?, volume?)` (`SystemInterfaces.ts:262-268`). **No signature changes** — every cue is a new `SOUND_CONFIGS` key (`src/config/audio.ts`) played through `play()`; `position` present = positional `PositionalAudio`, omitted = 2D (`AudioManager.ts:367-405`). Refs: threejs-audio-generator `references/audio-workflows.md:9-31`.

### 5.1 Free wins (no new assets)
- Dial open/close is **silent today** — wire `radioOpen`/`radioClose` into `openRadioDial()`/`closeRadioDial()` (`CommandInputManager.ts:368-393`).
- Napalm audio key fix → `napalmExplosion` (backlog #7, `NapalmMission.ts:100`; config exists `audio.ts:139-145`).
- `airSupportRadio` config exists but is orphaned (`audio.ts:135-138`, no call site) — repurpose for the CONFIRM chime or inbound-chatter placeholder.

### 5.2 Promote the marking selector (smoke/WP/grid)
Add **additive** `marking?: AirSupportTargetMarking` to `AirSupportRequest` (`AirSupportTypes.ts:10-19`, not fenced); thread through `requestSupport` (`CommandInputManager.ts:576-581`). On INBOUND, if marking ∈ {smoke, willie_pete} spawn `SmokeCloudSystem` (white / brighter-WP tint); `position_only` = HUD grid readout only. State already persists via `setSelectedMarking` fan-out (`CommandInputManager.ts:360-364`).

### 5.3 UX-state cues (2D unless noted)

| State | Cue(s) | Hook |
|---|---|---|
| Radio open/close | `radioOpen`/`radioClose` + `radioHiss` loop | `openRadioDial`/`closeRadioDial` (`:368-393`) |
| Designating | `designatingTone` loop | DESIGNATE enter/exit |
| CONFIRM | `clearedHotVO` + `confirmChime` | gate on `requestSupport` success (`:411-413`), not on every click |
| INBOUND | `radioChatterInbound` + `tenSecondsCallout` + positional engine swell | callout fires at `delay`−10s (new scheduled hook in `pendingRequests` countdown, `:113-135`) |
| EXECUTE | per-aircraft ordnance (positional) | mission explosion call sites |
| BDA | `bdaGoodEffect` / `bdaRoundsComplete` | mission completion / `air_support_complete` (`:187`) |
| Cooldown-ready | `cooldownReadyPing` | edge-detect cooldown→0 in `feedRadioCooldowns` (`:376`) |
| Error/reject | `errorBuzzer` | range/danger-close reject (depends on §3.5 landing) |

### 5.4 Per-aircraft audio (positional)

| Mission | Engine loop | Ordnance |
|---|---|---|
| Spooky | `ac47EngineDrone` | `spookyMinigunBrrt` (sustained, gated 1:1 to tracer burst) |
| Arclight | `b52HighRumble` (distant) | `bombWhistle` + `carpetBoomSequence` (per-bomb boom at each impact, `ArclightMission.ts:146-155`) |
| Napalm | `a1RadialEngine` | `napalmWhoosh` (drop) + `napalmFireCrackleLoop` (12s/zone — closes the audio half of the burn gap even before VFX #10) |
| RocketRun | `ah1RotorLoop` | `rocketSalvoWhoosh` (reuse `rocketLaunch`, `audio.ts:120-126`) + impact booms at `spawnProjectile` (`:81`) |
| Recon | `a1RadialEngine` (shared) | none; optional `reconCameraClick` on `recon_reveal` |

Engine loops are the one new runtime primitive: a persistent `PositionalAudio` attached to the aircraft `Object3D` (today's `play()` positional path is one-shot via temp-`Object3D` `onEnded` cleanup, `AudioManager.ts:387-397`). Add an **additive** `AudioManager.attachLoopingPositional(name, parentObject3D, volume)` returning a stop handle — **not on `IAudioManager`**, fenced consumers only call `play()`.

### 5.5 Asset manifest (free / exists / GENERATE-ElevenLabs)

| Cue | Source | Loop? |
|---|---|---|
| `radioOpen`,`radioClose` | GENERATE (radio click on/off) | one-shot |
| `radioHiss` | GENERATE (faint static bed) | loop 6s |
| `designatingTone` | GENERATE (soft targeting pulse) | loop 2s |
| `clearedHotVO` | GENERATE TTS "Cleared hot." | one-shot |
| `confirmChime` | GENERATE (two-tone bell) OR reuse orphaned `airSupportRadio` | one-shot |
| `radioChatterInbound` | GENERATE TTS "Copy, inbound." | one-shot |
| `tenSecondsCallout` | GENERATE TTS "Ten seconds!" | one-shot |
| `bdaGoodEffect`,`bdaRoundsComplete` | GENERATE TTS | one-shot |
| `cooldownReadyPing`,`errorBuzzer` | GENERATE | one-shot |
| `ac47EngineDrone`,`b52HighRumble`,`a1RadialEngine`,`ah1RotorLoop` | GENERATE engine loops | loop |
| `spookyMinigunBrrt`,`napalmFireCrackleLoop` | GENERATE | loop (gated) |
| `bombWhistle`,`carpetBoomSequence`,`napalmWhoosh` | GENERATE | one-shot |
| `rocketSalvoWhoosh` (`rocketLaunch`), `rocketImpact`/`grenadeExplosion`, `napalmExplosion` | **EXISTS** (`audio.ts:120-126,72-78,139-145`) | one-shot |
| `airSupportRadio` | **EXISTS, unwired** (`audio.ts:135-138`) — assign to chime/chatter | one-shot |

All ElevenLabs generation requires explicit owner sign-off (external paid API, per `CLAUDE.md` generator-skill policy).

---

## 6. Implementation plan (PHASED, mapped to backlog #1-14)

Tests per `docs/TESTING.md` four-layer contract (L1 pure / L2 single-system / L3 scenario / L4 full engine); behavior-only, no implementation-mirror tests, no asserting tuning constants/state-name strings.

### Phase 0 — Quick-win fixes (no flag; low-risk; ship first)
**Scope:** backlog #1 (frustumCulled+fog=false in `spawnMission`), #2 (Spooky parametric orbit), #3 (drop Arclight controller), #5 (radio `T` key-hint badge + `` ` `` alias), #6 (stagger napalm bursts), #7 (napalm audio key), #9 (stale comment). Plus the two free audio wires (dial open/close, `:368-393`).
**Files:** `AirSupportManager.ts:250-252,376-377,381`, `SpookyMission.ts:12,49,65`, `ArclightMission.ts:48-73`, `NapalmMission.ts:81-86,100`, `RadioHotbarSlot.ts:47-51,60`, `PlayerInput.ts` (alias), `CommandInputManager.ts:368-393` (audio).
**Flag:** Spooky orbit retune behind `airSupport.spookyParametricOrbit` (default-OFF, backlog #2 is a behavior change). Rest unflagged.
**Tests:** L2 — Arclight pose no longer double-driven (assert `updateArclight` owns pose, physics removed); L1 — orbit `omega=speed/radius` produces a closed circle; L2 — napalm bursts staggered (timestamps monotonic, ≤16 concurrent). 
**Acceptance:** `probe:fixed-wing` clean; AC-47 visibly stops flickering + tighter/smoother orbit (owner playtest); no aircraft blink across a fog-weather cycle; `lint`+`test:run`+`build` green.

### Phase 1 — Napalm fire system + scorch (backlog #10, #8)
**Scope:** new `NapalmFireSystem` (mirror `SmokeCloudSystem`) + scorch decal + ember points; reuse `SmokeCloudSystem` per zone; explosion fire texture (#8).
**Files:** new `src/systems/effects/NapalmFireSystem.ts`; `NapalmMission.ts:81-86,104-128,131-133`; `ExplosionTextures.ts`, `ExplosionEffectFactory.ts:103-111`; injection via `OperationalRuntimeComposer`.
**Flag:** `airSupport.napalmFireVfx` (default-OFF until AgX screenshot signs off).
**Tests:** L1 — fire-zone lifecycle (acquire→age→deactivate, pool never exceeds 12, no geometry recreate); L2 — disposal hooked to `fireElapsed>FIRE_DURATION`.
**Acceptance:** **AgX screenshot check** (flame clears bloom threshold 1.0, not washed out); fire visible full 12s at 50-500m; scorch persists then fades; no slope sink/clip; combat120 perf compare (transient hero VFX, verify no p99 regression).

### Phase 2 — Designate → Confirm UX + HUD (the felt core)
**Scope:** DESIGNATE per-frame loop (`resolveCameraGroundPick` `:631`); CONFIRM gate before `requestSupport` (`:576`); `StrikeTargetMarker` (mirror `SquadCommandWorldMarker.ts:25-83`); range/danger-close/LOS gates (§3.5); marking → `AirSupportRequest` (§5.2) + on-target smoke; HUD (reticle, `FireMissionBanner`, ETA/range strip, `CompassSystem` strike pip); secondary map routing into the same CONFIRM gate.
**Files:** `CommandInputManager.ts:375,432,462,566-595,631,665` (designate/confirm rework, stop freeze-on-open); new `src/systems/airsupport/StrikeTargetMarker.ts`; `AirSupportTypes.ts:10-19` (additive `marking`/`maxCallRange`); `AirSupportRadioCatalog.ts` (range/danger-close fields); new `src/ui/hud/FireMissionBanner.ts`; `CompassSystem.ts` (strike-marker source); `CommandTacticalMap.ts:82` (secondary route); audio cues §5.3.
**Flag:** `airSupport.designateConfirmFlow` (default-OFF; OFF = today's freeze-on-open immediate path).
**Tests:** L1 — range/danger-close gate predicates (pure, given positions+radii); L2 — marking threads to `requestSupport`; danger-close blocks commit without hold; L3 — full mark→designate→confirm→`air_support_inbound` emitted with correct `targetPosition`; L2 — abort-in-cancel-window refunds cooldown (`cancelSupport` `:145`).
**Acceptance:** owner playtest — re-aimable target, confirm beat reads, danger-close friction, ETA/bearing/smoke legible PC+mobile; `check:hud`+`check:mobile-ui` green; AgX screenshot for `StrikeTargetMarker` color states.

### Phase 3 — Per-aircraft choreography polish + audio

> **Implemented 2026-06-30** (branch `task/air-support-fire-mission`; typecheck/lint/lint:budget/test:run/build all green, 7302 tests).
> **Landed:** (#13) RocketRun IFF — `Grenade.ownerFaction` threaded through `spawnProjectile`→`GrenadeEffects.explodeFrag`→`applyExplosionDamage` (6th arg); `updateRocketRun` now takes `shooterFaction`, fed `mission.requesterFaction`. Legacy player grenades unchanged (undefined faction = damage-everyone). (#11) Spooky attitude now slerps a target quaternion (tangent yaw + constant bank) by `slerpFactor(k,dt)=1-exp(-k·dt)`, k=7, instead of an Euler snap — pure helper exported + L1-tested. Impact camera shake (Arclight + Napalm) via additive `AirSupportManager.setImpactShake` callback wired in `OperationalRuntimeComposer` to `playerController.applyExplosionShake` (per-ordnance radius; Arclight escalates for free via the distance falloff already in `shakeFromExplosion`). "Cleared hot" confirm chime: existing `airSupportRadio` sound played in the single `requestSupport` success funnel (all call-in surfaces). Additive `GamepadManager.rumble(strong,weak,ms)` haptic primitive + unit tests. Also fixed a pre-existing Phase-2 gap: `CommandRadioMenu.test.ts` still asserted the old immediate-`requestSupport` path; updated to the designate→confirm flow.
> **Deferred (owner audio decision: existing/free sounds only — no ElevenLabs):** engine loops (`ac47EngineDrone`/`b52HighRumble`/`a1RadialEngine`/`ah1RotorLoop`), `attachLoopingPositional` helper (no existing loop assets to attach), `spookyMinigunBrrt`/`bombWhistle`/`napalmFireCrackleLoop`, and all TTS callouts (`clearedHotVO`/`tenSecondsCallout`/BDA) — every one needs generation. Per-aircraft ordnance one-shots already use existing keys (Phase 0). **Rumble call-site wiring deferred:** the confirm path lives in `CommandInputManager` (at its 700-LOC/50-method budget wall) and the composer's air-support runtime group exposes no gamepad handle, so the tested `rumble()` primitive ships unwired — wire it during the controller-feel playtest pass.
> **Gates still PENDING (cannot self-verify):** owner playtest (`docs/PLAYTEST_CHECKLIST.md`: flight feel, Spooky orbit smoothness, impact shake scaling, friendly-fire-zero on RocketRun); `probe:fixed-wing`; combat120 perf compare if any hot path is implicated.

**Scope:** Spooky quaternion-slerp (#11) + tracer convergence re-verify; RocketRun IFF resolve (#13); engine loops + ordnance audio (§5.4) + `attachLoopingPositional` helper; controller rumble (§3.7); Arclight delayed-rumble + escalating shake; per-aircraft impact `shakeFromExplosion` wiring.
**Files:** `SpookyMission.ts:65,91-93`; `RocketRunMission.ts:81` + `GrenadeSystem` (IFF); `AudioManager.ts` (additive `attachLoopingPositional`); `GamepadManager` (additive `rumble`); mission explosion call sites (shake).
**Flag:** `airSupport.choreographyAudio` (default-OFF during bake).
**Tests:** L2 — RocketRun threads faction (friendly takes ZERO damage, deterministic IFF — mirrors `air-support-radio.md` acceptance); L1 — slerp factor `1-exp(-k·dt)` monotonic; L2 — looping-positional attaches+disposes with the mission.
**Acceptance:** owner playtest per `docs/PLAYTEST_CHECKLIST.md` (flight feel, audio mix, rumble); ElevenLabs assets signed off; combat120 perf compare if any hot-path touched.

---

## 7. Rollout & flags

All behavior changes default-OFF, flipped after owner playtest. Flag names:
- `airSupport.spookyParametricOrbit` (Phase 0, #2)
- `airSupport.napalmFireVfx` (Phase 1, #10)
- `airSupport.designateConfirmFlow` (Phase 2 — kill-switch reverts to today's immediate path)
- `airSupport.choreographyAudio` (Phase 3)

Unflagged (low-risk, ship immediately): #1 frustumCulled, #5 key-hint/alias, #6 napalm stagger, #7 audio key, #9 comment, #3 Arclight controller drop (zero behavior change), dial open/close audio. Each flag is an independent kill-switch; OFF restores prior behavior exactly. Follow the repo's default-OFF/opt-in bake discipline (per MEMORY: cinematic-field-pass campaign shipped all-OFF/opt-in, zero fence changes).

---

## 8. Interface-fence checks

Fenced set (`src/types/SystemInterfaces.ts`, confirmed analysis §8): `IHUDSystem`, `IPlayerController`, `IHelicopterModel`, `IFirstPersonWeapon`, `ITerrainRuntime(+Controller)`, `IAudioManager`, `IAmmoManager`, `IFlashbangScreenEffect`, `IGameRenderer`.

**No fenced signature changes.** Specifically:
- `IAudioManager` — new cues are `SOUND_CONFIGS` keys played via existing `play()`; engine-loop helper `attachLoopingPositional` lives on the concrete `AudioManager`, NOT the interface.
- `IGameRenderer` — untouched; `StrikeTargetMarker`/`NapalmFireSystem` add meshes to the scene like any system, not via a renderer API.
- `IHUDSystem` — `FireMissionBanner` + strike pip are new HUD elements; reuse `showMessage` (`HUDSystem.ts:551`) without changing its signature.
- `requestSupport` / `AirSupportRequest` are **non-fenced**; `marking?`/`maxCallRange` are additive optional fields.
- Rumble on `GamepadManager`, shake on `CameraShakeSystem`, smoke on `SmokeCloudSystem` — all non-fenced.

**[interface-change] risk: NONE as scoped.** Mandatory verify before each PR: confirm no edit lands in `src/types/SystemInterfaces.ts`. If any phase discovers a fence need, STOP and surface the exact delta for `[interface-change]` approval (per AGENTS.md hard rule #1).

---

## 9. Open decisions (most important first)

1. **Primary targeting modality** — world-space laze-and-confirm (recommended) vs tactical-map-first. World-space directly fixes the verified #1 defect (frozen-on-open) and is the smallest fix; map is ~90% pre-wired as secondary so the default can flip after playtest.
2. **Radio SELECT binding** — confirm: keep `T` + add visible `T` badge + add `` ` `` alias (NOT `Digit4`, which collides with SANDBAG and blocks the radio). Owner originally said "press 4"; this resolves the intent without the footgun.
3. **Complete the physics-flight migration for rocket_run/recon?** (backlog #14) — recommend NO; they read fine as deterministic lerps and physics gave Spooky its shake. Keep partial; document the split.
4. **Napalm fire technique** — flipbook billboards (recommended) vs GPU-particle dep vs ray-marched volumetric. Recommend flipbook (cheapest, matches `SmokeCloudSystem` idiom, lowest risk across 6 zones).
5. **Asset sourcing** — (a) fire flame atlas (not in repo; procedural stopgap vs sourced via `threejs-image-generator`); (b) ElevenLabs sign-off for the ~20 generated cues (external paid API, owner approval required).

---

## 10. Risks & validation

**Validation plan (per AGENTS.md + `docs/TESTING.md`):**
- `npm run typecheck` · `npm run lint` · `npm run lint:budget` (700 LOC / 50 methods one-way ratchet — `NapalmFireSystem`/`StrikeTargetMarker` are new files, watch method counts) · `npm run test:run` · `npm run build` · `npm run validate` (lint+test+build+smoke:prod).
- `npm run probe:fixed-wing` after any aircraft/flight change (Phase 0, 3).
- `npm run perf:capture:combat120` + `npm run perf:compare` for Phase 1 (new VFX) and any hot-path touch — note combat120 p99 is ±6ms multi-capture-noisy (MEMORY), capture more than once. NOTE: AI_SANDBOX combat120 sets `usesZones=false` so air-support may be dormant there; also capture Open Frontier / A Shau where strikes actually run.
- `npm run check:hud` + `npm run check:mobile-ui` for Phase 2 HUD.
- **AgX screenshot check** (manual): `NapalmFireSystem` flame + `StrikeTargetMarker` color states against the live AgX pipeline (`GameRenderer.ts:50,179-180`); confirm bloom threshold 1.0 is cleared and nothing washes out (analysis §9).
- Perf captures CANNOT run from agent worktrees on Windows (MAX_PATH → ERR_FAILED, per MEMORY) — orchestrator runs perf from the MAIN worktree.

**Playtest checklist (game-feel; required, automated checks are necessary-not-sufficient per AGENTS.md):**
- [ ] Open radio with `T`, `` ` ``, and pill click; `T` badge visible.
- [ ] DESIGNATE: ground ring tracks view ray live; re-aim works; reticle pulses on valid lock.
- [ ] Range gate greys ring when too far; sky-aim shows NO GROUND.
- [ ] Danger-close: red ring + ⚠ + hold-to-override beat reads as deliberate.
- [ ] CONFIRM: grid readout correct; camera-kick + "Cleared hot"; abort works.
- [ ] INBOUND: ETA counts down, bearing pip on compass, smoke marks if Smoke/WP, abort-refund within window.
- [ ] Each aircraft: visible NO-flicker inbound + intentional pattern + correct ordnance + impact shake scaled to ordnance.
- [ ] Spooky: tight smooth left-hand orbit, tracer cone converges on mark, no shake/stutter.
- [ ] Napalm: fire visible the full 12s, scorch persists, crackle audio for the burn.
- [ ] RocketRun: pitch-up break filmable; friendlies take ZERO damage (IFF).
- [ ] Mobile: bottom-sheet SELECT, drag-look DESIGNATE, ≥44px CONFIRM in safe area, long-press override.
- [ ] Reduced-motion: ambient swell off, confirm/impact shakes retained.

**Top risks:** (a) AgX wash-out on the fire material — mitigated by the screenshot gate before flag-on; (b) Spooky orbit retune changing tracer geometry — re-verify convergence (analysis §9); (c) RocketRun friendly-fire if `GrenadeSystem` doesn't thread IFF — resolve before Phase 3 juice; (d) combat120 noise masking a real regression — multi-capture + capture OF/A Shau too.
