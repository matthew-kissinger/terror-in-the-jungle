# Air-Support / Radio — Research & Analysis (VERIFIED)

## 1. Executive summary

- **Radio "press 4" path does not exist, by design.** The hotbar "radio" is `RadioHotbarSlot`, explicitly *not* a `WeaponSlot` (`src/ui/hud/radio/RadioHotbarSlot.ts:5-7`). `Digit4` unconditionally selects `WeaponSlot.SANDBAG` (`src/systems/player/InventoryManager.ts:345-347`), and — worse — being in SANDBAG mode actively *suppresses* the radio's real `KeyT` open path (`src/systems/player/PlayerInput.ts:585`). So "4" is the single worst key for the owner's intent. This is a UX/expectation gap, not a latent bug.
- **The orchestration wiring is structurally sound; the per-mission execution is inconsistent.** One composition point, one request→queue→spawn→tick→cleanup lifecycle for all five types (`SystemInitializer.ts:182`, `OperationalRuntimeComposer.ts:503-524`, `SystemUpdater.ts:281-289`). The "rigged in" feel is real but localized: only Spooky is *truly* physics-flown; Arclight builds a physics controller whose output is discarded; three others are scripted lerps.
- **Aircraft flicker (CONFIRMED, two causes).** (A) World-owned aircraft: `shouldRenderAirVehicle`'s frustum branch has **no hysteresis** while the distance branch does (`src/systems/vehicle/AirVehicleVisibility.ts:35-37` vs `:47`/`:131-132`); fog density also drives the *hard* distance cull, so weather fog oscillation toggles `group.visible` (`:108`). (B) Air-support aircraft never get `frustumCulled=false` and are left on default per-mesh GLB culling (`src/systems/airsupport/AirSupportManager.ts:250-252`).
- **Spooky orbit shake + slowness (CONFIRMED).** The live orbit is a per-tick PD-pursuit through a 6-DOF airframe, not a parametric circle: `flyOrbit` recomputes a carrot from the aircraft's own `atan2` angle every tick (`src/systems/vehicle/npcPilot/states.ts:114-119`). Speed/altitude are hardcoded defaults (`cruiseAirspeedMs=48`, `cruiseAltitudeAGLm=180` from `DEFAULT_NPC_PILOT_CONFIG`, `src/systems/vehicle/npcPilot/types.ts:91,98`) — the catalog `spooky.speed=40` never reaches the controller. A clean parametric orbit already exists but is dead code (`src/systems/airsupport/SpookyMission.ts:48-66`).
- **Napalm fire invisible (CONFIRMED).** `explosionSpawn` fires once per zone at drop (`src/systems/airsupport/NapalmMission.ts:81-86`); the pooled "fire" sub-effect lives only 800ms of a 3s bundle (`ExplosionParticleUpdater.ts:39`, `ExplosionEffectsPool.ts:112`), while the burn runs 12s with **zero** further VFX (`NapalmMission.ts:104-128` calls only `applyExplosionDamage`). The fire material also has no texture map (`ExplosionEffectFactory.ts:54-58`) and uses size 1.2 with default sizeAttenuation, so even the burst is near-invisible at strike range.
- **Verdict:** The plumbing is "properly implemented." The *flight dynamics, visibility management, and VFX* are not — they are an incomplete incremental migration with one genuine double-drive bug (Arclight) and one missing visual system (napalm fire).

## 2. Radio equip & "press 4"

**How it works today.** The hotbar radio is `RadioHotbarSlot`, documented as "the dedicated, non-weapon Radio HUD affordance… NOT a 7th `WeaponSlot`, NOT a carried loadout item" (`src/ui/hud/radio/RadioHotbarSlot.ts:5-7`). It is mounted as a *sibling* DOM child into the same `weapon-bar` grid slot as `UnifiedWeaponBar` (`src/ui/hud/HUDElements.ts:328,330,334-335`), so it visually abuts the six numbered slots and reads like "slot 7." `UnifiedWeaponBar` renders exactly six fixed slots key-hinted 1–6 (`src/ui/hud/UnifiedWeaponBar.ts:79,153`), backed by a six-member `WeaponSlot` enum with no RADIO member (`src/systems/player/InventoryManager.ts:17-24`).

**Can/should "4" select the radio?** No code path makes it. Number keys are owned solely by `InventoryManager.onKeyDown` (`src/systems/player/InventoryManager.ts:323-326,334-358`); `Digit4` unconditionally calls `switchToSlot(WeaponSlot.SANDBAG)` (`:345-347`). The radio opens only via `KeyT` (`src/systems/player/PlayerInput.ts:585-586`) or a click on the pill, which dispatches `RADIO_SLOT_OPEN_EVENT` consumed by `CommandInputManager` (`src/ui/hud/radio/RadioHotbarSlot.ts:57-61`, `src/systems/combat/CommandInputManager.ts:105-106`) — both converging on `toggleRadioDial()` (`:341-352`). Plain digit keys 1–6 unshifted are deliberately reserved for vehicle/weapon contexts ("digit 1/2 are heli weapons without Shift", `PlayerInput.ts:631`); only `Shift+Digit1-6` is bound (to squad quick-commands, `:637-651`).

**The amplifying gotcha.** `KeyT` is gated on `this.currentWeaponMode !== WeaponSlot.SANDBAG` (`PlayerInput.ts:585`). Slot 4 *is* SANDBAG. So if the owner presses "4" expecting the radio, they enter the one weapon mode that actively *blocks* the radio's real open key. The pill-click path bypasses this guard, creating an inconsistency where the click can open the dial in states `T` cannot.

**What's missing / discoverability.** The pill's `title` is `"Field Radio (T)"` (`RadioHotbarSlot.ts:47`) so the key surfaces on hover, but there is no visible key-hint badge like the `.uwb-key` "1"–"6" glyphs on the weapon slots. The `setOnActivate`/`onActivate` API is dead code — never called outside the test (`RadioHotbarSlot.ts:67` def, only `RadioHotbarSlot.test.ts:27` calls it); the DOM CustomEvent is the only live wiring.

**Cleanest way to make the radio selectable (design decision for owner):**
- *Minimal (recommended first):* add a visible "T" key-hint badge to `RadioHotbarSlot` matching the `.uwb-key` style, so the row is self-explanatory. Effort S.
- *Honor the literal "press 4" model:* add a `Digit4` (or a free key) binding in `PlayerInput.ts` that dispatches the same `RADIO_SLOT_OPEN_EVENT` the pill fires on click — isolated input-layer change, no air-support changes. But "4" specifically collides with SANDBAG; a clean free key (e.g. a dedicated radio digit, or keep `T`) avoids the collision. Effort S.
- *Full "7th slot" model:* adding RADIO to `WeaponSlot` is a larger, riskier change to inventory semantics and is **not** recommended — it fights the explicit design doc.

## 3. Air-support wiring map

| Mission | Catalog entry(ies) | Mission class | Aircraft model key | Shared flight ctrl? | Actually runs as | Effect |
|---|---|---|---|---|---|---|
| **spooky** | `ac47_orbit`, `huey_gunship_strafe` | `SpookyMission` | `AC47_SPOOKY` | **Yes** (`AC47_SPOOKY.physics`) | **Physics-driven** (only one) | Tracers via `TracerPool` + point damage |
| **arclight** | (B-52 Arc Light) | `ArclightMission` | `B_52D_STRATOFORTRESS` | Yes (`B52_ARCLIGHT_PHYSICS`) but **output discarded** | **Scripted lerp** (physics wasted) | 12 walking bombs, pooled explosion + `applyExplosionDamage` |
| **napalm** | `a1_napalm`, `f4_bombs` | `NapalmMission` | `A_1_SKYRAIDER` / F-4 | No | Scripted lerp | 1 explosion/zone at drop + 12s invisible damage |
| **rocket_run** | (Cobra rocket run) | `RocketRunMission` | `AH_1G_COBRA` | No | Scripted lerp | Real `GrenadeSystem` projectiles ("rocket") |
| **recon** | (Recon flight) | `ReconMission` | `A_1_SKYRAIDER` | No | Scripted lerp | No ordnance; `recon_reveal` event only |

Sources: `radioAssetToSupportType` (`src/systems/airsupport/AirSupportRadioCatalog.ts:120-128`); `getPhysicsConfig` returns configs only for `spooky`/`arclight` (`src/systems/airsupport/AirSupportManager.ts:379-388`); model keys (`src/systems/airsupport/AirSupportTypes.ts:57-113`, `src/config/generated/warAssetCatalog.ts:72-81`); effects per mission file (`SpookyMission.ts:101`, `ArclightMission.ts:146-155`, `NapalmMission.ts:85`, `RocketRunMission.ts:81`, `ReconMission.ts:45-54`).

**Is the wiring sound, and why was it built this way?** The *orchestration* is sound and uniform: a single composition point (`SystemInitializer.ts:182` instantiates, `OperationalRuntimeComposer.ts:503-524` injects combatant/grenade/audio/HUD/terrain/explosion deps, `:209` hands it to `CommandInputManager`), ticked every frame via the `air_support` cadence group at `intervalSeconds:0` (`src/core/SimulationScheduler.ts:22`, `src/core/SystemUpdater.ts:281-289`). Request flow is one shared implementation: `requestSupport` → `pendingRequests` → per-type `delay` → `spawnMission` (GLB or placeholder) → `updateMission` switch (`AirSupportManager.ts:113-135,217-244,313-372`). One fire-support call-in path is shared by the dial, the legacy radio menu, and the command overlay (`CommandInputManager.ts:90,95,411-413,576-581`) — no duplicated request logic.

The split exists because physics-driven NPC flight is an **incremental migration** ("Currently enabled for spooky (AC-47) only", `AirSupportManager.ts:376-377` — note this comment is now *stale*, since the switch also returns `arclight`). That answers "why is it wired the way it is": it is partial adoption, not random.

**Dead / stubbed wiring (the genuine bugs):**
- **Arclight double-drive (the critical one).** `updateMission` runs `fc.update(dt, terrainH)` first (`AirSupportManager.ts:316-322`), which copies the airframe pose to `aircraft.position`/`quaternion` (`NPCFlightController.ts:118-119`). Then the switch calls `updateArclight()` with **no** `physicsControlled` guard (unlike Spooky at `:350`), and it unconditionally re-writes `aircraft.position`/`rotation` (`ArclightMission.ts:68-73`). Because `updateArclight` runs *last*, the **kinematic pose wins and the physics result is discarded every frame** — the NPCFlightController for arclight is pure wasted computation.
- **Spooky's parametric orbit** (`SpookyMission.ts:48-66`) is permanently dead because `physicsControlled` is always true for spooky (`AirSupportManager.ts:350,381`).
- **`AC47_SPOOKY operation.orbitRadius:650 / orbitBankDeg:24`** (`FixedWingConfigs.ts:281-284`) are consumed by the *player-flown* control law, not the NPC orbit — orphaned for the call-in path.

## 4. Aircraft visibility flicker

There are **two distinct render paths** with two distinct flicker causes.

**Path A — world-owned FixedWing/helicopters (`shouldRenderAirVehicle`).** Confirmed root cause: the frustum-edge branch has **no hysteresis**. `VISIBLE_HYSTERESIS_MULTIPLIER = 1.12` is applied only to `maxDistance` (`src/systems/vehicle/AirVehicleVisibility.ts:35-37`); line 47 returns the raw `airVehicleIntersectsCameraView(...)` boolean, which sets `_airVehicleBounds.radius = 80` and returns `intersectsSphere` with no margin (`:131-132`). The frustum is rebuilt from `camera.projectionMatrix` every call (`:126-129`). An aircraft sitting on the frustum boundary flips `group.visible` true/false frame to frame (`FixedWingModel.ts:418-426`, `HelicopterModel.ts:658-665`).

**Second Path-A cause — fog drives the HARD cull.** `getAirVehicleCullDistance` uses `Math.min(getFogVisibilityDistance(scene.fog), cameraFar*0.95)` as the distance base (`AirVehicleVisibility.ts:108`). `WeatherAtmosphere` modulates fog density ×1.5 / ×2.5 / ×3.5 for rain/heavy/storm (`src/systems/environment/WeatherAtmosphere.ts:170,177,184`). When density animates, `maxDistance` moves; an aircraft near that boundary crosses `maxDistanceSq` and hard-toggles `group.visible` — the 1.12× dead-band only protects swings under 12%. This directly supports the owner's fog suspicion.

**Path B — air-support aircraft (AC-47, F-4, AH-1, A-1, B-52).** Confirmed: they are `scene.add()`ed with no visibility management at all — they never call `shouldRenderAirVehicle`, never set `.visible`, and never set `frustumCulled=false` (`src/systems/airsupport/AirSupportManager.ts:250-252`; grep across `src/systems/airsupport` finds `frustumCulled`/`.visible` only on `AAEmplacement.ts`). `ModelLoader.loadModel` sets no culling overrides, so every GLB child mesh keeps Three.js default `frustumCulled=true` with auto bounding spheres computed once (`src/systems/assets/ModelLoader.ts`). The external research confirms this is the textbook multi-mesh-GLB flicker pattern: per-*child* culling with stale local bounding spheres on a banking/orbiting hierarchy (three.js forum: "3D figures disappear partly"; mrdoob/three.js#18412). `FixedWingRenderOptimization` is draw-call/telemetry only — no distance show/hide — and is not even applied to air-support spawns (`src/systems/vehicle/FixedWingRenderOptimization.ts:48-57`).

**Camera/fog facts.** Camera is `PerspectiveCamera(75, aspect, 0.1, 1000)` (`src/core/GameRenderer.ts:121-126`), bumped to far=4000 only on A Shau (`src/config/AShauValleyConfig.ts:148`). Bootstrap fog `FogExp2(…, 0.0022)` (`GameRenderer.ts:205`) is **overwritten per scenario** by `AtmosphereSystem` to `preset.fogDensity` (0.0003–0.0012, `src/systems/environment/AtmosphereSystem.ts:303`). So in non-A-Shau scenarios fog visibility (~899m at 0.0022) and far=1000 are close, and Spooky at ~360m slant range sits at ~50% transmittance — hazy, not a hard on/off. **Note:** the runtime fog density is *not* the 0.0022 bootstrap constant; any fog-flicker reasoning must use the per-scenario value.

**Concrete fix.**
1. Path B (highest leverage, lowest risk): after `spawnMission` adds the GLB, `aircraft.traverse(c => { c.frustumCulled = false; })`. These are few, transient hero objects — the cost is negligible and it eliminates the per-mesh blink. The codebase already does this for combatant/tracer/billboard meshes.
2. Path A: extend the existing hysteresis to the frustum branch — when `currentlyVisible`, inflate the test sphere radius (e.g. ×1.5) or pad the frustum planes; or for airborne aircraft skip the frustum test entirely and rely on the distance gate plus renderer per-mesh culling (which never writes `group.visible`, so it cannot cause game-logic flicker). Effort S each.
3. Optionally set `material.fog=false` on hero air-support aircraft so weather fog spikes fade but never blink them off.

## 5. Spooky orbit (shaky + slow)

**Shake — confirmed root cause.** The live orbit is a closed-loop PD pursuit through a full aerodynamic airframe, not a parametric circle. `flyOrbit` (`src/systems/vehicle/npcPilot/states.ts:109-128`) each tick computes the aircraft's *own* polar angle `currentAngle = atan2(dx,-dz)` (`:116`), picks a carrot a fixed `0.35` rad ahead (`:117`), and hands it to `flyToward` (`:120-127`), which runs three independent PD loops: `altitudeHold` (pitch, `kpAlt=0.003`), `headingHold` (bank from heading error ×0.35, clamped 30°, `kpBank=0.04 / kdRate=0.006`), `airspeedHold` (throttle) — `src/systems/vehicle/npcPilot/pdControllers.ts:20-32,35-52`. Because the carrot is re-derived from the aircraft's measured position, any tracking error feeds the next target; bank/pitch are integrated from noisy per-tick error rather than slerped toward a smoothed attitude. The PD gains are commented "deliberately conservative / stable but slow" (`pdControllers.ts:9`). Altitude bob compounds it: `altitudeHold` targets AGL while the airframe re-samples terrain every 1/60 sub-step (`src/systems/vehicle/airframe/Airframe.ts:293,737`), so the reference moves under the aircraft over A Shau terrain. The raw (non-interpolated) airframe pose is copied to the aircraft (`NPCFlightController.ts:118-119`), adding a small render-time stutter on top.

**Slowness — confirmed root cause.** The pilot is constructed with *no* config (`NPCFlightController.ts:60`), so it uses `DEFAULT_NPC_PILOT_CONFIG`: `cruiseAirspeedMs=48`, `cruiseAltitudeAGLm=180` (`src/systems/vehicle/npcPilot/types.ts:91,98`). The catalog `AIR_SUPPORT_CONFIGS.spooky.speed=40` and `altitude=300` (`AirSupportTypes.ts:58-64`) **never reach the orbit** — `flyOrbit`/`flyToward` read `ctx.config.cruiseAirspeedMs`, not the mission waypoints. Radius is hardcoded `200` (`NPCFlightController.ts:230`), and AC-47 `maxSpeed=80 / stallSpeed=32` (`FixedWingConfigs.ts:227,230`). With a 30° bank clamp on a 200m circle, the turn is bank-limited and the orbit is a slow ~25-31s loop the owner cannot tune from the menu. There is also a spin-up: the pilot walks COLD→…→ORBIT through the state machine before any steady orbit.

**Exact minimal changes (recommended path — re-enable the existing parametric orbit):**
- `src/systems/airsupport/AirSupportManager.ts:381` — return `undefined` for `'spooky'` from `getPhysicsConfig` (or attach the controller only for inbound/outbound transit, not the orbit). This makes `physicsControlled=false`, so the clean kinematic orbit in `SpookyMission.ts:48-66` runs: `angle += (speed/ORBIT_RADIUS)*dt`, exact circle position, fixed bank, fixed `terrainH+300` altitude — smooth by construction.
- `src/systems/airsupport/SpookyMission.ts:12,49` — raise `speed` (currently 40) and/or lower `ORBIT_RADIUS` (currently 200) so `omega=speed/radius` is larger; e.g. speed 55–65, radius 160–180 stays under the 80 m/s maxSpeed and gives a faster, tighter loop.
- For residual roll/yaw smoothness, build the orbit attitude as a quaternion (tangent yaw + constant bank) and `slerp` toward it with a dt-scaled factor `1 - exp(-k*dt)` instead of `aircraft.rotation.set(...)` Euler-snap at `SpookyMission.ts:65`.

*Alternative (keep physics):* thread `cruiseAirspeed`/radius/bank-clamp into the pilot config and special-case the ORBIT state to track a precomputed parametric circle, but this is more work for the same visual result. **Verify tracer geometry afterward** — `SpookyMission.ts:91-93` reads `aircraft.position` with a flat `-2` belly offset that ignores bank.

## 6. Napalm & fire VFX

**Why fire is invisible — confirmed on three independent grounds.**
1. **Temporal gap.** `explosionSpawn` fires once per fire zone at drop (`src/systems/airsupport/NapalmMission.ts:81-86`, verified). The pooled "fire" sub-effect is only drawn for the first 800ms (`src/systems/effects/ExplosionParticleUpdater.ts:39`) of a 3s bundle lifetime (`src/systems/effects/ExplosionEffectsPool.ts:112`), while `FIRE_DURATION=12s`. The persistent-damage loop (`NapalmMission.ts:104-128`, verified) calls **only** `combatantSystem.applyExplosionDamage` — no VFX hook — so for ~9-11s there is damage with zero visual.
2. **No texture, sub-pixel size.** The fire `PointsMaterial` has no `map` — `createExplosionEffect` explicitly voids smoke/debris textures and only the flash sprite gets `map:` (`src/systems/effects/ExplosionEffectFactory.ts:54-58`). Fire renders as flat untextured GL squares at `size:1.2`, `AdditiveBlending`, color `0xff6600`×1.8 (`:103-111`), with default `sizeAttenuation=true`, so at 50-500m strike range it shrinks to a few pixels. Against bright A Shau sky under AgX tone mapping (see below) it reads grey/invisible.
3. **No persistent fire/scorch system anywhere.** Grep for `scorch`/`Scorch` returns zero; `ExplosionTextures.ts` has smoke/flash/debris only, no fire texture. There is no fire mesh, billboard, sprite-sheet, or shader.

**Secondary issues:** all 6 zones spawn in one frame into a shared 16-slot pool (`CombatantSystem.ts:141`) whose `acquire()` evicts the oldest active effect (`packages/three-effect-pool/src/index.ts:38-43`) — *conditional* eviction (6<16 alone is fine; needs concurrent grenade/mortar/AA load to exceed 16), violating the stagger discipline Arclight documents (`ArclightMission.ts:14-23`). Napalm also plays the generic `'grenadeExplosion'` cue instead of the dedicated `'napalmExplosion'` config with longer falloff (`NapalmMission.ts:100` vs `src/config/audio.ts:139-145`).

**Existing reusable primitives to mirror:** `SmokeCloudSystem` (`src/systems/effects/SmokeCloudSystem.ts:37`) already implements a longer-lived (expand → ~9s linger → 3s dissipate) sprite-based cloud — the exact persistent-VFX pattern napalm should reuse. `createFlashTexture` (`ExplosionTextures.ts:29`) is a radial-gradient canvas texture to clone for a warm flame gradient.

**Recommended Three.js r185 fire approach (from research).** The engine still runs `WebGLRenderer` in production, and critically uses **`THREE.AgXToneMapping` at exposure 1.0** (`GameRenderer.ts:50,179-180`), which compresses/desaturates highlights more than ACES — any new fire material must be tuned and screenshotted against the live AgX pipeline or it reads washed-out exactly as reported.
- **First choice — sprite-sheet/flipbook fire (cheap, reliable):** animate a fire texture atlas via UV offset on additive billboards. Reference: tamani-coding/threejs-sprite-flipbook; stemkoski Texture-Animation; SpriteMixer forum. Spawn one per fire zone on drop, keep alive for `FIRE_DURATION`, dispose in sync with `NapalmMission.ts:131`. Needs a real fire atlas (not in repo).
- **GPU particle option (embers/smoke):** NewKrok/three-particles (r182+, built-in soft-particle depth fade, documented fire-cone preset).
- **Procedural/ray-marched (heaviest, budget carefully for 6 zones):** typeWolffo/THREE.Fire (WebGL r150+). Note: no official threejs.org TSL fire example exists (mrdoob/three.js#31614 closed "not planned").
- **Soft particles** to avoid hard terrain intersection lines: sample scene depth in the fragment shader and fade alpha. Caveat: `frustumCulled=false` doesn't always fully fix `THREE.Points` (mrdoob/three.js#11229).
- Material recipe: `transparent:true`, `AdditiveBlending`, `depthWrite:false`, `depthTest:true`, plus a real flame texture and `sizeAttenuation` tuned so the flame doesn't vanish at range.
- Pair with a **scorched-ground decal** at each zone persisting for `FIRE_DURATION` (none exists today).

## 7. Other missions (Arclight / RocketRun / Recon)

**Arclight (B-52) — wiring correct, flight architecture buggy.** Bomb logic is fully wired and correct: 12 bombs walked one per 0.18s via `releaseBomb` (`src/systems/airsupport/ArclightMission.ts:33-36,146-155`), each `explosionSpawn` then `applyExplosionDamage(impact, 14, 160, undefined, 'arclight', shooterFaction)` — correct IFF threading and shared-pool stagger discipline. The defect is the **physics double-drive** (Section 3): a `B52_ARCLIGHT_PHYSICS` controller is created (`AirSupportManager.ts:385`, `FixedWingConfigs.ts:510`) but `updateArclight` overwrites its pose every frame with a scripted lerp and has no `physicsControlled` guard (`ArclightMission.ts:48-56,68-73`). Net: physics is wasted, the B-52 flies the kinematic path. Minor redundancy: `ArclightMission` hardcodes `speed=150` and `CRUISE_OFFSET=600` duplicating the config (`AirSupportTypes.ts:110`) and diverging from the physics maxSpeed — silent desync risk.

**RocketRun (Cobra) — pure kinematic, one IFF gap.** Linear approach/break-off (`RocketRunMission.ts:38-112`), fires real ballistic projectiles via `grenadeSystem.spawnProjectile(pos, vel, ROCKET_FUSE=10, 'rocket')` (`:81`). It does **not** call `applyExplosionDamage` itself — damage is delegated to `GrenadeSystem`'s projectile-impact path. **Open risk:** the spawn passes only 4 args and **no faction**, unlike Arclight/Spooky/Napalm which thread `shooterFaction` into every damage call — if `GrenadeSystem`'s `'rocket'` detonation doesn't independently apply IFF, rocket-run damage will hit friendlies. Needs `GrenadeSystem.spawnProjectile` inspection to close.

**Recon (Skyraider) — correct by design.** Pure kinematic flyover, zero ordnance. Calls `querySpatialRadius(targetPosition, REVEAL_RADIUS=100)` once within 100m and emits `GameEventBus.emit('recon_reveal', …)` (`src/systems/airsupport/ReconMission.ts:10,45-54`). Matches its "Recon flight" catalog intent; fully wired to whatever HUD/minimap consumes `recon_reveal`.

**Inconsistency vs Spooky/Napalm.** Five mission types span three flight models: 1 truly physics-driven (spooky), 1 physics-built-but-discarded (arclight), 3 scripted-lerp (napalm/rocket_run/recon). No abstraction enforces parity, and the `AirSupportManager.ts:376-377` comment claiming physics is "spooky only" is stale. RocketRun/Recon being deterministic lerps means they *cannot* exhibit Spooky's shake — but also get no banking realism.

## 8. Prioritized fix backlog

### Quick wins (high impact-per-effort)

| # | Fix | Area | Severity | Effort | Files to touch |
|---|---|---|---|---|---|
| 1 | Set `frustumCulled=false` on air-support aircraft after spawn (`aircraft.traverse`) | Visibility (Path B) | Major | S | `src/systems/airsupport/AirSupportManager.ts:250-252` |
| 2 | Re-enable parametric Spooky orbit: `getPhysicsConfig('spooky')→undefined`; raise speed / tighten radius | Spooky orbit | Major | S | `src/systems/airsupport/AirSupportManager.ts:381`, `src/systems/airsupport/SpookyMission.ts:12,49` |
| 3 | Add `physicsControlled` guard to `updateArclight` (mirror Spooky) OR drop the arclight controller | Arclight double-drive | Critical (wasted work) | S | `src/systems/airsupport/AirSupportManager.ts:362`, `src/systems/airsupport/ArclightMission.ts:48-73` |
| 4 | Add hysteresis to the frustum branch of `shouldRenderAirVehicle` (inflate sphere when visible, or skip frustum test for airborne) | Visibility (Path A) | Critical | S | `src/systems/vehicle/AirVehicleVisibility.ts:47,131-132` |
| 5 | Add visible "T" key-hint badge to the radio pill | Radio UX | Minor | S | `src/ui/hud/radio/RadioHotbarSlot.ts:47-51` |
| 6 | Stagger napalm's 6 zone spawns (mirror Arclight `BOMB_INTERVAL`) | Napalm pool discipline | Major (conditional) | S | `src/systems/airsupport/NapalmMission.ts:81-86` |
| 7 | Fix napalm audio key → `'napalmExplosion'` | Napalm audio | Minor | S | `src/systems/airsupport/NapalmMission.ts:100` |
| 8 | Give pooled fire particles a real texture + `sizeAttenuation` tuning (helps all explosions) | Explosion VFX | Minor | S | `src/systems/effects/ExplosionTextures.ts`, `src/systems/effects/ExplosionEffectFactory.ts:103-111` |
| 9 | Update stale "spooky only" comment; document the physics split | Wiring clarity | Trivial | S | `src/systems/airsupport/AirSupportManager.ts:376-377` |

### Deeper rework

| # | Fix | Area | Severity | Effort | Files to touch |
|---|---|---|---|---|---|
| 10 | Build a dedicated persistent napalm fire system (sprite-sheet flipbook, alive 12s, per zone) + scorch decal | Napalm VFX | Critical (symptom) | M | new module + `src/systems/airsupport/NapalmMission.ts:81-86,104-128`; mirror `SmokeCloudSystem` |
| 11 | Quaternion-slerp the orbit attitude instead of Euler-snap / PD-integrated bank | Spooky smoothness | Minor | S–M | `src/systems/airsupport/SpookyMission.ts:65` (or pilot retune in `pdControllers.ts`) |
| 12 | Decouple weather fog oscillation from the hard distance cull (low-pass `maxDistance`, or fog floor for aircraft) | Visibility (Path A, fog) | Major | M | `src/systems/vehicle/AirVehicleVisibility.ts:108`, `src/systems/environment/WeatherAtmosphere.ts:170-184` |
| 13 | Verify + thread faction into RocketRun's rocket projectile IFF | RocketRun friendly-fire | Minor (risk) | S | `src/systems/airsupport/RocketRunMission.ts:81` + `GrenadeSystem` |
| 14 | (Optional) decide whether rocket_run/recon should also be physics-driven for parity | Flight consistency | Minor | M | `AirSupportManager.ts:379-388` + mission files |

**Interface-fence / flag notes:**
- None of these fixes touch a **fenced** export in `src/types/SystemInterfaces.ts` as currently scoped (fenced set: `IHUDSystem`, `IPlayerController`, `IHelicopterModel`, `IFirstPersonWeapon`, `ITerrainRuntime(+Controller)`, `IAudioManager`, `IAmmoManager`, `IFlashbangScreenEffect`, `IGameRenderer`). `AirSupportManager`, `AirVehicleVisibility`, `NPCFlightController`, and the mission classes are **not** fenced. **Verify** before any PR that no fix alters an `IAudioManager` or `IGameRenderer` signature.
- **Default-OFF flag candidates:** #2 (Spooky orbit behavior change), #10 (new napalm fire system), #12 (fog-cull change). Quick wins #1, #4, #5, #7, #9 are low-risk and likely don't need flags.

## 9. Open questions / things to verify by playtest

- **Which aircraft does the owner see flicker** — world-owned patrol/airfield FixedWings (Path A) or the AC-47 air-support hero (Path B)?
- **Actual runtime fog density during sessions** — cited 0.0022 is bootstrap-only; per-scenario it's 0.0003–0.0012, ×weather.
- **Does `GrenadeSystem`'s `'rocket'`-tagged detonation apply IFF** despite RocketRun passing no faction? (friendly-fire risk)
- **Is the air-support physics-flight migration meant to complete** (rocket_run/recon get controllers) or stay partial? Product call.
- **Napalm fire intent:** persistent flame never built, vs cheap stopgap, vs proper fire-sheet system (correct fix)?
- **AgX tone-mapping check:** any new fire material must be screenshotted against the live AgX pipeline (`GameRenderer.ts:50,179-180`).
- **Does post bloom threshold (1.0) clear** the fire color (`0xff6600`×1.8) against bright daylight sky?
- **Fire-zone Y grounding on slopes** — additive `depthWrite:false` points at terrain height may sink/clip on slopes.
- **After the Spooky parametric switch,** confirm minigun tracer convergence still looks right.
