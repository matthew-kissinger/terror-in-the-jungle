# Environment Polish Plan — 2026-05-18

Status: planning memo, owner-requested interrupt outside the 13-cycle campaign chain.

## TL;DR

Three user-reported environment issues, three workstreams, all ship outside the cycle queue as a polish pass:

1. **Grass should bend away from the player, not inward.** Today the only motion is camera-relative wind sway in `BillboardNodeMaterial.ts:211-221`. There is **no** player-imprint mechanism. Add one (radial push-away from player position) + switch wind to a world-direction vector so all blades lean the same way.
2. **Sun must read as the sun, not a tracking dot.** `SunDiscMesh.ts` is a 28-unit `PlaneGeometry` with `lookAt(camera)` — no halo, no bloom, sub-pixel in the baked LUT. Replace with an in-shader sun pin-point + aureole in the dome's TSL `colorNode`. Subset of the queued cycle #12 work; can ship in isolation.
3. **Menu load time.** Vegetation atlas decode + river geometry compile + terrain material compile all block before the main menu renders. Split engine init into `initializeForMenu()` (fast) and `initializeForGameplay()` (deferred until mode-select).

Phased delivery, four PRs (A → D), one phase at a time. Each phase has its own playtest evidence and back-out.

---

## Section 1 — Diagnosis recap

### 1.1 Grass folding (Workstream W1)

The "grass" is the vegetation billboard system: instanced `PlaneGeometry` quads materialized with `BillboardNodeMaterial`. Current motion math at [BillboardNodeMaterial.ts:189-221](../../src/systems/world/billboard/BillboardNodeMaterial.ts:189):

```
toCameraXZ = cameraPosition.xz - instancePosition.xz
forward    = toCameraXZ / max(length(toCameraXZ), 0.001)
right      = vec3(forward.z, 0, -forward.x)
sway       = (primarySway + 0.35 * gustSway) * windStrength * lodWindScale
swayWeight = uv.y * uv.y
positionNode = instancePosition
             + right * (scaledX + sway * swayWeight)
             + up    * scaledY
```

Three problems with this:

- **Sway axis is camera-relative.** Every blade's `right` is perpendicular to its own camera-to-blade vector. The displacement is along that local right-axis. From the player's point of view, this means all visible blades sway sideways in *screen space* but in different *world directions*. A line of tufts in front of the player looks like it's compressing/expanding rather than leaning consistently the way a wind gust looks in reality.
- **No player interaction.** Walk into a dense patch, the grass does nothing.
- **`xzLength` clamp at 0.001 means a near-vertical view of a blade gets an unstable `forward`** → billboard yaw snaps. Visible when crouched right over a tuft.

The user's "sheep/sheepdog imprint cover, not into" describes the missing feature: grass should radially push away from the player's position, leaving a visible parted path. Wind on top, imprint underneath.

### 1.2 Sun + glare dot (Workstream W2)

Architecture today (per [SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)):

- **Dome:** `SphereGeometry(500)` with `MeshBasicMaterial` sampling a 256×128 baked LUT (`HosekWilkieSkyBackend.ts:232-261`). The in-LUT sun-disc covers ~3 texels horizontally — sub-pixel after bilinear stretch.
- **Standalone sun disc:** `SunDiscMesh` — `PlaneGeometry(28, 28)` at `cameraPos + sunDir * 495`, with `MeshBasicMaterial` (additive, `toneMapped: false`), `lookAt(cameraPos)` each frame. Radial-gradient canvas texture.
- **No bloom, no halo, no lens flare.** `PostProcessingManager` is a no-op shim.

What the user sees: a small bright dot floating in front of the camera. Because there's no surrounding aureole or HDR pin-point in the dome, the sprite reads as a UI artifact rather than a celestial body. The `lookAt(cameraPos)` per frame creates micro-rotations that look like jitter.

The queued [`cycle-sun-and-atmosphere-overhaul`](SUN_AND_ATMOSPHERE_VISION_2026-05-16.md) (position #12 in the campaign) is the planned fix — full TSL fragment-shader Preetham + AGX tonemap + sun pin-point. That's ~600-900 LOC and a perf-baseline interaction. For polish-pass purposes we can ship the **sun-disc subset** now and let cycle #12 still do the full Preetham/AGX port.

### 1.3 Menu load time (Workstream W3)

Bootstrap path: [main.ts:14](../../src/main.ts:14) → [bootstrap.ts:61-151](../../src/core/bootstrap.ts:61) → `engine.initialize()` → [SystemInitializer.initializeAllSystems](../../src/core/SystemInitializer.ts:69) → [GameEngineInit.ts:83-84](../../src/core/GameEngineInit.ts:83) shows the menu.

Three sync blockers between bootstrap and the main menu rendering:

- `GPUBillboardSystem.initializeFromConfig()` decodes color + normal atlases for all vegetation types (~15-20 textures, ~5-10 MB) on the main thread.
- `WaterSystem` constructs the global water plane + compiles `HydrologyRiverSurface` geometry from bake data.
- `TerrainSystem.init()` compiles the TSL terrain material and applies the vegetation config.

The menu does not need any of these to render. The mode-select screen kicks off `preGenerateSpawnArea()` later — the heavy vegetation/water init can fold into that path.

KB-LOAD residual is already on `docs/CARRY_OVERS.md` but unscheduled in the 13-cycle campaign.

---

## Section 2 — Workstream W1: Grass player-imprint + world-direction wind

### W1.1 — World-direction wind (replace camera-relative `right` axis)

**File:** [`src/systems/world/billboard/BillboardNodeMaterial.ts`](../../src/systems/world/billboard/BillboardNodeMaterial.ts)

**Approach:** Keep the camera-facing billboard yaw (so the sprite always faces the camera). Replace the *sway displacement axis* from camera-relative `right` to a world-direction `windDirection` uniform.

Add uniforms:
- `windDirection: vec3` (normalized, XZ plane; Y=0). Default `(1, 0, 0.3)` normalized.
- Keep `windStrength`, `windSpeed`, `windSpatialScale`.

Change the displacement composition:

```ts
// OLD: sway along camera-relative right
positionNode = instancePos + right * (scaledX + sway * swayWeight) + up * scaledY

// NEW: sway along world wind direction
const swayOffset = windDirection.mul(sway.mul(swayWeight))
positionNode = instancePos + right * scaledX + up * scaledY + swayOffset
```

Now `right * scaledX` only sets the billboard's quad orientation (camera-facing); `swayOffset` is in world coords and identical for every blade at the same instant (modulo phase noise from position). All visible blades lean together — readable as a real wind gust.

**Bonus:** add per-blade wind-direction jitter so the gust isn't unnaturally synchronized:
```ts
const localWindDir = mix(windDirection, vec3(0, 0, 1), instanceRotation.mul(0.15))
```
Tiny rotational noise per instance so the cluster reads organic.

**Test:** L1 unit test for the position node graph (snapshot test the TSL chain), L2 visual regression for "all blades lean the same way at t=0.5s".

### W1.2 — Player imprint (radial push-away)

**File:** same.

Add uniforms:
- `playerWorldPosition: vec3`
- `playerImprintRadius: float` (default 2.2 m)
- `playerImprintStrength: float` (default 0.8)

Add an imprint displacement node:

```ts
const toPlayerXZ   = playerWorldPosition.xz.sub(instancePosition.xz)
const distToPlayer = length(toPlayerXZ)
const safeDist     = max(distToPlayer, 0.001)
const pushDirXZ    = toPlayerXZ.div(safeDist).negate()   // away from player
const falloff      = saturate(1 - distToPlayer / playerImprintRadius)
const imprint      = pushDirXZ.mul(falloff.pow(2)).mul(playerImprintStrength)
const imprintWeight = uv.y  // linear, not quadratic — base must move too
const imprintXZ    = vec3(imprint.x, 0, imprint.y).mul(imprintWeight)

positionNode = instancePos + right * scaledX + up * scaledY + swayOffset + imprintXZ
```

Notes:
- Quadratic falloff (`falloff^2`) so blades right next to the player get pushed hard, distant blades barely move.
- Use *linear* `imprintWeight = uv.y` (not the `uv.y²` used for wind) so the base of the blade also shifts — this is what makes a real "parted path" visual, vs. just the tips tilting.
- Imprint is XZ-only (no vertical lift). Optional: add small +Y squash at high imprint magnitude to read as "blade pressed down".

**Uniform plumbing:** new method `BillboardNodeMaterial.setPlayerWorldPosition(v: Vector3)` called each frame from `GPUBillboardSystem.update` (or wherever the `time` uniform is currently pushed). The position comes from `IPlayerController.getWorldPosition()` (already used elsewhere).

**Multi-actor expansion (deferred to a later phase):** the user mentioned "sheep or sheepdog" — suggests they might want NPCs to also imprint. For this phase, only the player imprints. NPC imprint can be added later by:
- Replacing the single `playerWorldPosition` vec3 with a small `imprintSources: StorageBuffer` (top-N nearest actors)
- Iterating in the shader and summing imprint contributions
- This is a Phase B+ followup; ship player-only first.

**Test:**
- L1: unit test the imprint math at distances 0.5m, 2.0m, 3.0m → expected push magnitude
- L2: visual playtest, walk through a dense grass patch, screenshot the parted path
- L4: smoke that vegetation still renders with all uniforms wired

### W1.3 — Vertical-view stability fix (bonus)

The `xzLength = max(length(toCameraXZ), 0.001)` clamp at line 191 creates unstable `forward` when looking nearly straight down at a tuft. Fix:

```ts
// Replace 0.001 clamp with a smooth blend to a fallback right-axis
const xzLen = length(toCameraXZ)
const blend = smoothstep(0.05, 0.3, xzLen)
const stableForward = mix(vec3(1, 0, 0), toCameraXZ.div(max(xzLen, 0.001)), blend)
const right = vec3(stableForward.z, 0, stableForward.x.negate())
```

When you crouch directly over a blade, the billboard yaw freezes to a fallback orientation instead of snapping each frame.

### W1.4 — Acceptance for W1

- Player walks forward through a dense grass patch → blades within ~2m bend radially outward, forming a momentary parted path
- All visible blades in a gust lean in the same world direction
- Looking straight down at a tuft does not snap the billboard yaw
- Perf: no measurable cost change vs current (uniforms are cheap; shader ops add <5 ALU per fragment)
- Playtest evidence: 3 screenshots (no wind / mid-gust / player walking through)

### W1.5 — Risks / back-out

- **TSL `instancedBufferAttribute` interaction with new vec3 instancePos refs.** Already used; no risk.
- **WebGL2 fallback parity.** TSL → GLSL translation handles vec3 math fine; verify on `?renderer=webgl`.
- **Back-out:** all changes are in one file. Revert with a single commit.

---

## Section 3 — Workstream W2: Sun pin-point + aureole

### W2.1 — Option A (recommended for this polish pass): in-dome sun via TSL `colorNode`

**Files:**
- [`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts) — convert dome material to `MeshBasicNodeMaterial`, sample the LUT in a `colorNode` plus add a per-fragment sun overlay
- [`src/systems/environment/atmosphere/SunDiscMesh.ts`](../../src/systems/environment/atmosphere/SunDiscMesh.ts) — delete
- [`src/systems/environment/AtmosphereSystem.ts`](../../src/systems/environment/AtmosphereSystem.ts) — remove the `sunDisc.update()` hook at line 507-510

**Dome material node graph:**

```ts
const skyDir   = normalize(positionWorld.sub(domeCenter))
const sunDir   = uniform('sunDirection')
const sunDot   = max(skyDir.dot(sunDir), 0.0)

// LUT background
const skyBase = texture(lutTexture, skyDirToUv(skyDir))   // unchanged math

// Sun disc — sharp center
const disc = smoothstep(0.99985, 0.99996, sunDot)  // ~3-4° apparent

// Aureole — soft halo around the disc
const aureole = smoothstep(0.94, 1.0, sunDot).pow(2.0).mul(0.4)

// HDR pin-point
const sunIntensity = uniform('sunColor').mul(uniform('sunPeakMultiplier'))
const sunContribution = sunIntensity.mul(disc.add(aureole))

return skyBase.rgb.add(sunContribution)
```

Tunables (start values):
- `sunPeakMultiplier`: 12.0 at noon, scaled by `elevation^2` to fade at horizon
- Disc edge `smoothstep` thresholds tuned per playtest
- Aureole exponent (2.0) makes the halo fall off smoothly

**Why this fixes "tracking in bad ways":** the sun is now *part of the sky shader*, not a separate billboard. It has no `lookAt`. Its position is purely a function of `skyDir.dot(sunDir)` — the same math that already places everything else on the dome. No jitter, no screen-space drift.

**Why it reads as a sun:** the aureole gives a visible halo extending 6-10° around the disc, transitioning smoothly into the sky color. Compared to today's hard-edged 28-unit sprite, this matches the visual signature of a real sun (bright pearl with a glowing halo).

### W2.2 — Option B (out of scope for this pass): full cycle #12

The full vision in [SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](SUN_AND_ATMOSPHERE_VISION_2026-05-16.md) lands the entire Preetham port to TSL + AGX tonemap + night-red fix + horizon glow. ~600-900 LOC. Stays as cycle #12 in the campaign queue.

Option A above is fully compatible with Option B — when cycle #12 ships, the sun pin-point node graph from this polish pass is reused inside the larger fragment-shader Preetham node graph. No throwaway work.

### W2.3 — Acceptance for W2

- Sun visible as a recognizable disc + halo at all daytime elevations on all 5 scenarios
- No jitter or screen-space drift when panning the camera
- Perf: dome fragment shader gains ~3-4 ALU ops + 1 dot product per fragment — negligible
- Playtest evidence: 4 screenshots (noon / golden / dusk / night) on `openfrontier`

### W2.4 — Risks / back-out

- **Removing `SunDiscMesh` might leave orphan references** — search for all callers of `AtmosphereSystem.sunDisc` and `updateSunDisc` before deleting
- **Half-float LUT interaction with the new colorNode**: verify the dome material still samples the existing `HalfFloatType` `DataTexture` correctly under the new node-material path
- **WebGL2 fallback:** TSL `colorNode` translates to GLSL inside WebGPURenderer's WebGL2 backend — verify visual parity at `?renderer=webgl`
- **Back-out:** restore `SunDiscMesh`; revert dome material to `MeshBasicMaterial`. Single commit revert.

---

## Section 4 — Workstream W3: Menu load 2-phase init

### W4.1 — Split init into `initializeForMenu()` + `initializeForGameplay()`

**Files:**
- [`src/core/SystemInitializer.ts`](../../src/core/SystemInitializer.ts)
- [`src/core/GameEngineInit.ts`](../../src/core/GameEngineInit.ts)
- [`src/systems/world/billboard/GPUBillboardSystem.ts`](../../src/systems/world/billboard/GPUBillboardSystem.ts)
- [`src/systems/environment/WaterSystem.ts`](../../src/systems/environment/WaterSystem.ts)

**Strategy:**

Today, `engine.initialize()` runs all systems synchronously, then `showMainMenu()` fires. Change to:

```ts
// engine.initialize()
await this.initializeForMenu()       // renderer, scene, camera, sky dome, input, UI
loadingScreen.showMainMenu()         // <— menu appears HERE
this.gameplayReadyPromise = this.initializeForGameplay()  // fire-and-forget, awaited later

// when player clicks mode-select:
await this.gameplayReadyPromise      // ensure heavy init done before scenario boot
```

**What moves out of menu-blocking:**
- `GPUBillboardSystem.initializeFromConfig` (vegetation atlas decode)
- `WaterSystem` river geometry compile
- `TerrainSystem.applyVegetationConfig`
- Heavy chunk pre-generation

**What stays in menu-blocking:**
- Renderer + scene setup
- Atmosphere dome (sky background visible on menu)
- Input + UI
- Audio init (kick off, but don't await — UI doesn't need sound for the menu screen)

**Concurrency:** the gameplay-ready phase runs while the player is reading menu text + picking a scenario. By the time they click "Play", most or all of it has resolved.

### W4.2 — Acceptance for W3

- Measure `bootstrapGame()` → `loadingScreen.showMainMenu()` wall-clock before and after, on a cold cache
- Target: ≥40% reduction (likely 50-70%)
- Mode-select "Play" button does not stall if the gameplay-ready phase isn't quite done — show a brief "preparing scenario..." spinner

### W4.3 — Risks / back-out

- **Race conditions:** code that runs at menu time but assumes vegetation/water are ready. Need to grep callers and either move them to gameplay-ready phase or guard with the promise
- **`__KB_LOAD_DISABLE_VEGETATION_NORMALS__` flag** at `GPUBillboardSystem.ts:8-9` — already exists as a load-time mitigation, this work supersedes the need
- **Audio init** — keep awaited if any menu UI plays sound; defer otherwise
- **Back-out:** revert the two-phase split, restore the single `initializeAllSystems` call. Single commit revert.

---

## Section 5 — Phased delivery

Each phase is its own PR with its own playtest evidence, merged independently.

| Phase | Scope | Files | LOC | Risk |
|-------|-------|-------|-----|------|
| A | W1.1 — World-direction wind on grass billboards | `BillboardNodeMaterial.ts`, `GPUBillboardSystem.ts` (uniform pump) | ~50 | Low (visual only, isolated material) |
| B | W1.2 — Player-imprint on grass + W1.3 vertical-view stability | `BillboardNodeMaterial.ts`, `GPUBillboardSystem.ts`, new `PlayerImprintUniformPump.ts` | ~80 | Low (additive uniform; off-by-default constant) |
| C | W2.1 — In-dome sun pin-point + remove `SunDiscMesh` | `HosekWilkieSkyBackend.ts`, `AtmosphereSystem.ts`, delete `SunDiscMesh.ts` | ~150 | Medium (dome material conversion to NodeMaterial; verify LUT sampling) |
| D | W3 — Menu load 2-phase init | `SystemInitializer.ts`, `GameEngineInit.ts`, `GPUBillboardSystem.ts`, `WaterSystem.ts` | ~150 | Medium (race conditions; needs caller audit) |

Total: ~430 LOC across 4 PRs.

Ship A → B → C → D in order. Each phase is independently revert-able.

---

## Section 6 — Tracking / iteration

This memo is the plan-of-record. Edit in place as each phase lands or as findings shift. At each phase close:
- Update the phase row in Section 5 with the commit SHA + PR # + playtest evidence path
- Surface any newfound carry-overs in `docs/CARRY_OVERS.md`
- Note any deviation from the plan in a per-phase changelog at the bottom of this file

### Phase changelog

- 2026-05-18 — plan authored, no phases shipped yet.

---

## Section 7 — Open questions for owner

1. **W1.2 imprint radius and strength.** Defaults proposed: 2.2 m radius, 0.8 strength. Tune via WorldBuilder `\` console once Phase B is in?
2. **W2.1 sun size.** Disc edge `smoothstep(0.99985, 0.99996, sunDot)` ≈ 3-4° apparent. Real sun is 0.5°. Going gameplay-readable rather than astronomically accurate — confirm?
3. **W2 — defer cycle #12 or fold into this pass?** Recommendation: defer; cycle #12 still does the full Preetham + AGX. Confirm.
4. **W3 — add a "preparing scenario..." spinner** on mode-select if gameplay-ready promise hasn't resolved? Likely yes; small UI lift.
5. **NPC imprint on grass** — out of scope for this pass per Section 2.1.2. Re-raise as a followup once Phase B is in?
