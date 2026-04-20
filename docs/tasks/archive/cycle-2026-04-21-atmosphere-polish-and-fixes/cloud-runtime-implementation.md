# cloud-runtime-implementation: implement ICloudRuntime with a high-altitude cloud band

**Slug:** `cloud-runtime-implementation`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P2 — `ICloudRuntime` is currently a stub interface (`SystemInterfaces.ts:313-318`) with `AtmosphereSystem` already declaring `implements ICloudRuntime` and stub `getCoverage()/setCoverage()`. No render hookup yet.
**Playtest required:** YES.
**Estimated risk:** medium — new render path; budget-sensitive; flight-aware.
**Budget:** ≤ 400 LOC.
**Files touched:**

- New: `src/systems/environment/atmosphere/CloudLayer.ts`.
- Modified: `src/systems/environment/AtmosphereSystem.ts` to own the cloud layer (parallel to the sky dome), return real values from `getCoverage()` / `setCoverage()`, and wire weather-state cloudiness into coverage.
- Modified: `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` to add per-scenario default cloud coverage.

Do NOT touch: `SystemInterfaces.ts` (`ICloudRuntime` is already there, surface is fine).

## Why this task exists

`docs/ATMOSPHERE.md` lists clouds as a v1+ scope element. PR #97 added the `ICloudRuntime` interface but no implementation. User explicitly asked for clouds at cycle-2026-04-20 close-out: "maybe we can add in clouds next pass too."

Recon (2026-04-20) confirmed:
- `ICloudRuntime` shape (verbatim): `getCoverage(): number; setCoverage(v: number): void;` — tiny, no altitude/color surface, fine for v1.
- `AtmosphereSystem` already has stub `cloudCoverage` field + clamped getter/setter; just needs render wiring.
- `WeatherAtmosphere` already authors per-state fog-darken values (CLEAR=1.0, LIGHT_RAIN=0.88, HEAVY_RAIN=0.7, STORM=0.45). Adding `setCloudCoverage()` follows the same pattern.

## Critical constraint: cloud base must NOT intersect the flight envelope

This game has both fixed-wing aircraft and helicopters. **Recon confirmed there is NO enforced helicopter altitude ceiling** (`HelicopterPhysics.ts` only constrains `groundEffectHeight: 8.0` and `MAX_DEPLOY_ALTITUDE: 15` for paratroop drops). Players can climb to whatever altitude lift allows.

Aircraft cruise reference points (from recon):
- `NPCFixedWingPilotConfig.cruiseAltitudeAGLm: 180` (npcPilot/types.ts:88).
- CAS missions: 300m AGL (NPCFlightController test).
- `FixedWingControlLaw` test fixture climbs to **800m AGL exactly** — this is why 800m base is unsafe.
- F-4 Phantom maxSpeed 200 m/s with no altitude limit.

**Set cloud base to 1200m AGL** for v1. Player aircraft can still punch through if they push it; alpha-fade the layer when camera Y is within ±100m of base so the edge-on paper-thin look doesn't break the shot.

## Required reading first

- `src/types/SystemInterfaces.ts` — `ICloudRuntime` (lines 313-318).
- `src/systems/environment/AtmosphereSystem.ts` — current `getCoverage()` / `setCoverage()` stubs; `applyToRenderer`; `applyFogColor`; the `getSunDirection()` getter (cloud shader will read this each frame).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` — for the dome mesh/shader pattern (`SphereGeometry`, BackSide, `renderOrder: -1`, `depthWrite: false`).
- `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` — five preset keys: ashau, openfrontier, tdm, zc, combat120.
- `src/systems/environment/WeatherAtmosphere.ts` — `FogTintIntentReceiver` pattern; mirror it for cloud coverage.
- `docs/ATMOSPHERE.md` — cloud roadmap.

## Target state

**Render approach: horizontal plane at fixed Y with procedural cloud fragment shader.** Recon validated this against four other approaches; volumetric is out of budget, billboards break under fly-through, sky-shader has no parallax. Plane wins for the dominant ground-troop viewing angle (looking up at underbelly).

Mesh details:
- Single horizontal `PlaneGeometry`, 4km × 4km, BackSide-style (visible from below).
- Y position: `cameraY + (1200 - clamp(cameraY - terrainY, 0, 1200))` — i.e. layer sits at world Y = `terrainY + 1200`. Don't recompute world position; translate XZ each frame to follow camera so the plane stays under the player.
- `renderOrder: -2` (behind sky dome); `depthWrite: false`; `transparent: true`.
- **UV is world-space**: shader samples noise at `vec2(worldXZ * scale)`, NOT mesh-local. Mesh-local UV would lock the cloud pattern to the player position so clouds wouldn't drift overhead as the player walks.

Shader details:
- Procedural Perlin/Worley + 2-3 octaves of fbm. Coverage uniform thresholds the noise field.
- Sun direction uniform read from `AtmosphereSystem.getSunDirection()` **every frame** (not preset bootstrap). Cheap "lit cumulus" tint: brighter where surface normal of cloud puff faces sun, darker on the shadow side.
- Sun-disc visibility: alpha mask in cloud-thin areas should let the disc glow through.
- **Edge-on alpha-fade:** `alpha *= smoothstep(100.0, 0.0, abs(cameraY - layerY))` — when camera is within ±100m of the cloud base, fade the layer out so the paper-thin edge artifact disappears. Below the fade range, layer is fully visible; above it, layer is fully visible from above; in between, it gracefully vanishes.

Concrete defaults:

- `cloudBaseAltitudeAGL: 1200` (was 800 — corrected after recon).
- Per-scenario coverage:
  - `combat120`: 0.2 (light scattered).
  - `ashau`: 0.4 (jungle valley overcast).
  - `openfrontier`: 0.1 (clear).
  - `tdm`: 0.6 (overcast dusk).
  - `zc`: 0.3 (broken golden-hour clouds).
- Weather override (mirror `WeatherAtmosphere`'s lerp pattern; do NOT raw-write — coverage transitions should be `transitionProgress`-blended like fog darken):
  - STORM: coverage → 1.0, cloud color darkens.
  - HEAVY_RAIN: coverage → 0.85.
  - LIGHT_RAIN: coverage → 0.6.
  - CLEAR: returns to preset default.

## Coordination with `atmosphere-day-night-cycle`

This task **must merge after** `atmosphere-day-night-cycle` (which lands in Round 2). Reason: day-night will mutate `sunDirection` per frame; cloud shader must read live values. If clouds land first, the shader bootstrap will lock the sun direction at preset value and look wrong once day-night is enabled.

Do NOT change the signature of `AtmosphereSystem.getSunDirection()` or `getSunColor()` — day-night brief assumes those stay stable.

## Steps

1. Read all of "Required reading first."
2. Implement `CloudLayer.ts` with the chosen render path. Start from `HosekWilkieSkyBackend.ts` as a template for the mesh + material setup.
3. Wire `AtmosphereSystem` to construct + own + update + dispose the cloud layer; forward `getCoverage()`/`setCoverage()` to the layer; pass live `sunDirection` to the layer's uniform every frame.
4. Wire `WeatherAtmosphere` cloud-coverage intent (mirror the fog darken pattern; lerp via `transitionProgress`).
5. Per-scenario preset extension: add `cloudCoverageDefault` field; default 0.0 if unset (preserves combat120 baseline if no value).
6. Verify in `npm run dev`:
   - Ground-level looking up shows clouds at all coverage levels.
   - Flying through at 500m AGL shows clear sky below + cloud layer above.
   - Flying at 1100m AGL: layer alpha-fades to invisible (no edge-on artifact).
   - Flying at 1500m AGL: layer visible from above.
   - Walking 100m sideways shows clouds drift overhead (UV is world-space).
   - Day-night cycle running: cloud color tracks the sun.
7. Verify perf via `npm run perf:capture:combat120` — must stay within WARN bound.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/cloud-runtime-implementation/`:

- One shot per scenario showing the per-scenario default coverage from ground level.
- `combat120-storm-clouds.png` — heavy coverage during storm.
- `flight-through-clouds.png` — view from inside an aircraft cockpit at cruise altitude (or position the player camera at 1500m AGL and look forward) to confirm the cloud layer reads from above.
- `flight-edge-on-fade.png` — camera at 1200m AGL ±50m, layer should be visibly faded.
- `helicopter-altitude-clear.png` — view at typical helicopter altitude (200m AGL) looking up — should show clear sky beneath the cloud base.

## Exit criteria

- `AtmosphereSystem.getCoverage()` returns the live coverage; `setCoverage()` actually changes the visible cloud field.
- Each scenario boots with its preset default coverage.
- STORM weather smoothly lerps coverage near 1.0; clear returns to preset.
- Cloud base never below 1200m AGL.
- Camera Y within ±100m of cloud base alpha-fades the layer (no paper-thin-edge artifact).
- Cloud shader reads live `getSunDirection()` each frame (compatible with day-night cycle).
- Walking sideways shows clouds drift overhead (world-space UV, not mesh-local).
- Sun disc visible through low-coverage gaps.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- `combat120` perf smoke within WARN bound. **Benchmark on a non-RTX baseline** if possible (Cloudflare Pages users include integrated GPUs); shader complexity is the actual concern, not vertex count.

## Non-goals

- Do not implement volumetric (raymarched froxel) clouds.
- Do not implement shadow-casting clouds (sun shadow stays from terrain only).
- Do not animate clouds drifting across the sky over time (parallel-cycle work).
- Do not animate cloud-base altitude (static per scenario).
- Do not change `ICloudRuntime` interface surface — current shape is sufficient.

## Hard stops

- Fence change → STOP.
- Cloud render blows the World group budget → STOP, simplify the shader.
- Sun-occluded cloud math produces NaN → STOP, clamp.
- Cloud layer visibly intersects the helicopter / aircraft envelope at the configured 1200m base → STOP, raise base.
- `atmosphere-day-night-cycle` hasn't merged yet → wait for it (avoid having to retrofit live sun-direction reads).
