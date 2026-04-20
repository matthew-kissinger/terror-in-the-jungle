# atmosphere-interface-fence: stand up `ISkyRuntime` + empty `AtmosphereSystem` shell

**Slug:** `atmosphere-interface-fence`
**Cycle:** `cycle-2026-04-20-atmosphere-foundation` *(placeholder — confirm at cycle start)*
**Depends on:** nothing
**Blocks (in this cycle):** `atmosphere-hosek-wilkie-sky`, `atmosphere-fog-tinted-by-sky`, `atmosphere-sun-hemisphere-coupling`
**Playtest required:** no (no visible change — shell only)
**Estimated risk:** low — additive interface + new-file system registration
**Budget:** ≤ 250 LOC
**Files touched:**

New: `src/systems/environment/AtmosphereSystem.ts`, `src/systems/environment/atmosphere/ISkyBackend.ts`, `src/systems/environment/atmosphere/NullSkyBackend.ts`

Modified: `src/types/SystemInterfaces.ts`, `src/core/SystemRegistry.ts` (register AtmosphereSystem in the `World` tracked group), `src/core/SystemUpdater.ts` (no new budget group — share the existing World 1.0ms)

Do NOT touch: `src/systems/environment/Skybox.ts`, `src/systems/environment/WeatherAtmosphere.ts`, `src/core/GameRenderer.ts` lighting setup. All behavior stays identical this cycle.

## Why this task exists

This is the architectural seam for every future atmosphere change (Combo A Hosek-Wilkie, Combo E prebaked cubemap, Combo F fly-through volumetric). Design rationale in `docs/ATMOSPHERE.md`.

The current interface fence (`src/types/SystemInterfaces.ts`) has no sky-related exports. Adding `ISkyRuntime` + `ICloudRuntime` is a fence ADDITION (not modification), so no `[interface-change]` PR title is required per `docs/INTERFACE_FENCE.md`. Confirm this reading with a human before merging.

## Required reading first

- `docs/ATMOSPHERE.md` — the design this brief implements.
- `docs/INTERFACE_FENCE.md` — fence rules; confirm addition-vs-modification reading.
- `src/types/SystemInterfaces.ts` — where the new interfaces go, alphabetically among existing I-prefixed exports.
- `src/systems/environment/Skybox.ts` — the class being replaced (but not deleted yet).
- `src/systems/environment/WeatherAtmosphere.ts` — the class that will later consume `AtmosphereSystem` state instead of mutating lights directly.
- `src/core/SystemRegistry.ts` and `src/core/SystemUpdater.ts` — registration + tracked-group pattern. `AtmosphereSystem` lives in the existing `World` group, not a new one.

## Target state

1. `ISkyRuntime` exported from `SystemInterfaces.ts` with these methods (final naming is executor's call if a better match exists):
   - `getSunDirection(out: THREE.Vector3): THREE.Vector3`
   - `getSunColor(out: THREE.Color): THREE.Color`
   - `getSkyColorAtDirection(dir: THREE.Vector3, out: THREE.Color): THREE.Color`
   - `getZenithColor(out: THREE.Color): THREE.Color`
   - `getHorizonColor(out: THREE.Color): THREE.Color`
2. `ICloudRuntime` exported with `getCoverage(): number` and `setCoverage(v: number): void`. Stub; not consumed yet.
3. `AtmosphereSystem` class at `src/systems/environment/AtmosphereSystem.ts` implements both. Registers in the `World` tracked group. `update(dt)` is a no-op this cycle.
4. `ISkyBackend` interface at `src/systems/environment/atmosphere/ISkyBackend.ts` — backend contract for future Hosek-Wilkie / cubemap / volumetric implementations. Shape (draft): `update(dt, sunDirection)`, `sample(dir, out)`, `getSun(out)`, `getZenith(out)`, `getHorizon(out)`.
5. `NullSkyBackend` at `src/systems/environment/atmosphere/NullSkyBackend.ts` — returns the same constants the current `Skybox` + ambient setup produces (`0x5a7a6a` horizon-ish, `0x87ceeb` zenith, sun direction = frozen moonLight `(0, 80, -50)` normalized, sun color = `0xfffacd`). Default backend for this cycle.
6. `AtmosphereSystem` uses `NullSkyBackend` by default. No visible render change.
7. Existing `Skybox` keeps rendering exactly as before. `WeatherAtmosphere` unchanged.

## Steps

1. Read all files listed in "Required reading first."
2. Sketch the `ISkyRuntime` / `ICloudRuntime` interfaces into `SystemInterfaces.ts`. Include short docblocks — they're contracts consumed by `WeatherAtmosphere` and future fog/sun shaders.
3. Implement `AtmosphereSystem` holding an `ISkyBackend`. Register it in `SystemRegistry`. Wire it into the `World` tracked group in `SystemUpdater` (no new budget group).
4. Implement `NullSkyBackend` so `AtmosphereSystem` returns the same colors the current scene uses.
5. Confirm `npm run typecheck && npm run lint && npm run test:quick` green. No behavior change expected on `npm run dev` — verify the scene still looks identical.

## Exit criteria

- `ISkyRuntime` and `ICloudRuntime` compile and export from `SystemInterfaces.ts`.
- `AtmosphereSystem` instantiates and registers without errors.
- `Skybox` still renders exactly as before; `WeatherAtmosphere` still works exactly as before.
- `npm run validate:fast` green. `npm run build` green.
- Quick `npm run dev` sanity: combat120 scenario looks identical to master.

## Non-goals

- Do not delete `Skybox.ts` — that's the next cycle's cutover.
- Do not wire `WeatherAtmosphere` to consume `AtmosphereSystem` yet — keep scope tight.
- Do not change `GameRenderer.setupLighting()` or unfreeze any lights — `atmosphere-sun-hemisphere-coupling` owns that.
- Do not implement Hosek-Wilkie — `atmosphere-hosek-wilkie-sky` owns that.

## Hard stops

- If adding the new interfaces somehow forces a change to an EXISTING fenced interface (e.g. `IGameRenderer` signature change), STOP and escalate — that's an `[interface-change]` PR and needs human approval per `docs/INTERFACE_FENCE.md`.
- If `npm run test:run` shows ANY regression, STOP. The `NullSkyBackend` constants must reproduce current behavior exactly.
