# terrain-param-sandbox: isolated terrain-gen preview mode with live parameter tuning + heightmap export

**Slug:** `terrain-param-sandbox`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 3
**Priority:** P1 — engine-reuse groundwork. Makes the terrain layer legible without requiring a full game boot.
**Playtest required:** NO (screenshot-verified + parameter-export file compared for byte equality).
**Estimated risk:** medium — isolated mode path bypasses the normal engine wire-up; must not import combat / atmosphere / audio / HUD.
**Budget:** ≤500 LOC.
**Files touched:**

- Create: `src/dev/terrainSandboxMode.ts` — URL guard (mirror of `flightTestMode.ts`).
- Create: `src/dev/terrainSandboxScene.ts` — the isolated scene (terrain system + camera + lights + overlay).
- Create: `src/dev/terrainSandbox/terrainTuning.ts` — Tweakpane bindings for heightmap params.
- Create: `src/dev/terrainSandbox/heightmapExport.ts` — export heightmap PNG + `MapSeedRegistry`-compatible JSON.
- Modify: `src/core/bootstrap.ts` — add `isTerrainSandboxMode()` check after `isFlightTestMode()`.

## Required reading first

- `src/dev/flightTestMode.ts` + `src/dev/flightTestScene.ts` — template for "URL bypass + isolated scene" pattern.
- `src/config/MapSeedRegistry.ts` — the existing heightmap seed registry (5 OF + 3 ZC + 3 TDM variants per CLAUDE.md memory). This task's JSON export must match its shape.
- `src/systems/terrain/**` — the CDLOD terrain system. Needs to be instantiable without the full GameEngine. If not, document the coupling and either (a) add a minimal factory helper or (b) scope down to rendering a single heightmap as a static mesh (no CDLOD streaming).
- `scripts/prebake-navmesh.ts` — existing offline heightmap + navmesh generation pipeline. The sandbox's export format should be compatible.
- `docs/blocks/*.md` — terrain/navmesh block docs for architectural context.

## Fix

### 1. URL bypass

```ts
// src/dev/terrainSandboxMode.ts
export function isTerrainSandboxMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mode') === 'terrain-sandbox';
}
```

In `bootstrap.ts`, after the `isFlightTestMode()` check:

```ts
if (isTerrainSandboxMode()) {
  const { TerrainSandboxScene } = await import('../dev/terrainSandboxScene');
  const scene = new TerrainSandboxScene(document.body);
  scene.start();
  window.addEventListener('beforeunload', () => scene.dispose());
  return;
}
```

### 2. TerrainSandboxScene

- Minimal: one terrain mesh generated from current heightmap params, one orbit camera (Three.js `OrbitControls`), one directional light.
- No combat, no AI, no atmosphere, no audio, no HUD, no vehicles, no player controller.
- Tweakpane panel (installed in R0) for live parameter tuning.

### 3. Parameter surface

Start with the minimum viable set — these are the dominant knobs for procedural heightmaps:

**Noise params**
- `seed` (integer) — 1 to 999999
- `octaves` — 1 to 8
- `frequency` — 0.0001 to 0.01 (step 0.0001)
- `lacunarity` — 1.5 to 3.0 (step 0.05)
- `persistence` — 0.3 to 0.7 (step 0.05)
- `amplitude` — 10 to 300 meters (step 5)

**Domain warp (optional — add if current terrain uses it)**
- `warpStrength` — 0 to 100
- `warpFrequency` — 0.0001 to 0.01

**Terrain shape**
- `mapSizeMeters` — 1000 to 8000 (step 100)
- `resolutionPowerOfTwo` — 128 / 256 / 512 / 1024 / 2048

**Preview**
- Wireframe toggle
- Contour-line toggle (draws elevation-band lines on the mesh)
- Normal-debug toggle (tint by surface normal)

On any param change, regenerate the heightmap and update the terrain mesh. Throttle to 500ms debounce so dragging sliders doesn't melt the GPU.

### 4. Heightmap generation

Reuse whatever noise + shaping code the main game uses for heightmap gen. Grep `prebake-navmesh.ts` and the terrain system for `simplex`, `Perlin`, `noise2D`, etc. If the noise implementation is tightly coupled to the prebake script, extract the core noise function into a shared helper in `src/systems/terrain/` (≤100 LOC additive) and reuse from both paths.

### 5. Export

"Export heightmap" button:
- Serializes current heightmap as 16-bit grayscale PNG (or whatever format `MapSeedRegistry` expects).
- Generates JSON with params + derived seed entry.
- Downloads both as `terrain-<timestamp>.png` and `terrain-<timestamp>.json`.

"Copy MapSeedRegistry entry" button:
- Formats current params as a TypeScript object literal suitable for pasting into `MapSeedRegistry.ts`.
- Copies to clipboard.

### 6. Overlay info

Top-left floating text showing: current params summary, mesh triangle count, generation time (ms), mesh memory (MB).

## Steps

1. Read "Required reading first" — particularly `flightTestMode.ts` for the pattern.
2. Implement URL bypass + empty `TerrainSandboxScene` with orbit camera.
3. Investigate terrain system coupling. If CDLOD terrain cannot be instantiated without GameEngine, scope to static mesh (one heightmap → one BufferGeometry).
4. Extract or reuse noise/heightmap generation.
5. Build Tweakpane bindings for all params.
6. Implement preview toggles (wireframe, contours, normals).
7. Implement export buttons.
8. Behavior tests: mount scene with default params → assert mesh generated; change a param → assert mesh regenerated.
9. `npm run lint`, `npm run test:run`, `npm run build`.
10. Manual smoke: `npm run dev?mode=terrain-sandbox`, tune params, export, inspect files.
11. Screenshots of the sandbox at 3 different param configurations in `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/terrain-param-sandbox/`.

## Exit criteria

- `?mode=terrain-sandbox` boots an isolated scene with terrain + orbit camera.
- Tweakpane panel exposes noise + shape + preview params.
- Parameter changes regenerate the mesh within 500ms.
- Export produces heightmap PNG + JSON in `MapSeedRegistry`-compatible format.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Retail build contains zero terrain-sandbox code (Vite DCE; verify by grep).
- Evidence screenshots committed.

## Non-goals

- No brush-based sculpting. This task is parameters-only. Sculpting belongs to a dedicated future terrain-editor cycle.
- No navmesh regeneration on the fly. Export triggers the offline `prebake-navmesh.ts` path later, not live.
- No zone placement / airfield stamping / water placement. Terrain-only.
- No multi-chunk streaming. Single generated mesh; if the full CDLOD system is too coupled to isolate, use a simplified single-mesh renderer.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- Terrain system requires full GameEngine to instantiate AND extracting a standalone factory requires > 200 LOC refactor → STOP, file a finding, reduce scope to "generate heightmap, render as simplified single-mesh, no CDLOD"; note as future work.
- Heightmap gen is not pure (e.g., requires worker pool that isn't available) → STOP, investigate; either spin up a minimal worker in sandbox or generate on main thread (slower but acceptable for dev-only mode).
- Export PNG format doesn't round-trip through `MapSeedRegistry` loader → STOP, fix the export to match the loader's expected format before merging.

## Pairs with

- Flight test mode (`src/dev/flightTestScene.ts`) — architectural sibling. Do not collapse them into one shared scaffold this cycle; both are slim enough to stand alone.
- `live-tuning-panel` (shares Tweakpane; but sandbox is its own isolated Tweakpane instance, not the main-game panel).
- Engine-trajectory memo (this task is the first concrete seed of that memo's "generalize for reuse" recommendations).
