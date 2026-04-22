# world-overlay-debugger: 3D scene overlay registry for navmesh / LOS / squad influence / LOD / contact / chunk viz

**Slug:** `world-overlay-debugger`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 3
**Priority:** P1 — visualizes the relationships and state that the entity inspector can only show per-entity.
**Playtest required:** NO (screenshot-verified per overlay).
**Estimated risk:** medium — reads from multiple subsystems; one overlay per frame at scale could be perf-significant.
**Budget:** ≤500 LOC.
**Files touched:**

- Create: `src/ui/debug/WorldOverlayRegistry.ts` — registry + master toggle.
- Create: `src/ui/debug/worldOverlays/` directory with per-overlay files:
  - `navmeshWireframeOverlay.ts`
  - `losRayOverlay.ts`
  - `squadInfluenceOverlay.ts`
  - `lodTierOverlay.ts`
  - `aircraftContactOverlay.ts`
  - `terrainChunkOverlay.ts`
- Modify: `src/core/GameRenderer.ts` — add overlay group to scene; overlays register into it.
- Modify: `src/core/GameEngineInput.ts` — keybinds (see below).
- Possibly additive ≤20 LOC read-only accessors in `src/systems/navigation/**`, `src/systems/combat/**`, `src/systems/terrain/**` (reviewer-scoped).

## Required reading first

- `src/systems/navigation/**` — grep for navmesh exposure API. `recast-navigation` typically exposes triangle mesh for debug viz.
- `src/systems/combat/CombatantLODManager.ts` — exposes combatant LOD tier per entity.
- `src/systems/combat/LOSAccelerator.ts` — the registered static obstacles from PR #122. BVH boxes visualizable.
- `src/systems/terrain/**` — chunk subdivision boundaries.
- `docs/blocks/*.md` — block files cover nav + terrain + combat architecture.

## Fix

### 1. WorldOverlayRegistry

```ts
export interface WorldOverlay {
  id: string;
  label: string;
  hotkey?: string; // single-letter + modifier, e.g., 'N' or 'Shift+N'
  defaultVisible: boolean;
  mount(scene: THREE.Scene): void;
  unmount(): void;
  update?(dt: number): void;
}
```

Master toggle bound to `Shift+\` (hold Shift + backslash) — shows/hides all overlays at once.

Each overlay self-contained: creates its own `Object3D` subtree, updates per frame, unmounts on toggle-off.

### 2. Overlay specs

**navmeshWireframeOverlay** (hotkey `N`)
- Read navmesh triangles from the active nav system.
- Render as green `THREE.LineSegments` wireframe with 50% opacity.
- `recast-navigation-three` may already export a `NavMeshHelper`; prefer reuse over hand-roll.

**losRayOverlay** (hotkey `L`)
- Each frame, iterate active combatants.
- For each combatant with a current target, draw a line from combatant to target.
- Color-code: green = clear LOS, red = blocked, yellow = partial/suppressed.
- Cap at 100 rays to prevent visual clutter; prioritize combatants near camera.

**squadInfluenceOverlay** (hotkey `I`)
- Read influence-map cells from `src/systems/combat/InfluenceMapSystem.ts`.
- Render as a semi-transparent colored grid on the ground plane (red = OPFOR influence, blue = BLUFOR).
- Update at 2Hz (data is slow-moving).
- Render area bounded to ~400m radius around camera for cost.

**lodTierOverlay** (hotkey `T`)
- Tint each combatant's root mesh by LOD tier: HIGH=white, MEDIUM=yellow, LOW=orange, DISTANT=red, CULLED=grey.
- Restore original tint on overlay toggle-off (cache material emissive or use an outline pass if simpler).

**aircraftContactOverlay** (hotkey `C`)
- Read `LOSAccelerator.chunkCache` static obstacles (BVH boxes registered by PR #122).
- Render each as a magenta wireframe bounding box.
- Also render the live aircraft sweep capsule (per-frame) for any active aircraft.

**terrainChunkOverlay** (hotkey `X`)
- Read CDLOD chunk boundaries from terrain system.
- Render as cyan wireframe boxes around each loaded chunk.
- Label each with chunk id + LOD level if possible.

### 3. Registration order + toggle UI

Registry has a small floating UI (top-left, 240px, mounted via `DebugHudRegistry` if present) with a checkbox per overlay + master toggle. Keybinds toggle individual overlays.

### 4. Perf discipline

- Overlays should use `BufferGeometry` + `LineSegments` + `Material.transparent` — no heavy per-frame allocations.
- Reuse geometry where possible.
- Each overlay tracks its own `update` cost via `performance.now()` timestamps so the debug HUD can show overlay-specific cost.
- If any overlay's per-frame cost exceeds 3ms at combat120, flag in PR body.

## Steps

1. Read "Required reading first."
2. Build `WorldOverlayRegistry` with tests.
3. Implement `navmeshWireframeOverlay` first — it's the foundational one (needed to sanity-check the registry pattern).
4. Implement the rest in priority order: `lodTierOverlay`, `aircraftContactOverlay`, `losRayOverlay`, `squadInfluenceOverlay`, `terrainChunkOverlay`.
5. Behavior tests: synthetic scene with 3 navmesh triangles → assert overlay mounts 3 line segments.
6. `npm run lint`, `npm run test:run`, `npm run build`.
7. Manual smoke: boot combat120, press each hotkey in turn, screenshot each overlay visible.
8. Screenshots committed to `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/world-overlay-debugger/` — one per overlay.

## Exit criteria

- All six overlays implemented, each with an individual keybind + master `Shift+\` toggle.
- Per-overlay per-frame cost < 3ms at combat120 (run `npm run perf:capture:combat120` with master toggle on and off; deltas recorded in PR body).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Six screenshots committed.

## Non-goals

- No overlay for decision-tree visualization (that's a future utility-AI task).
- No overlay for audio propagation / sound volumes.
- No overlay for GPU timing. Frame-budget panel already handles that.
- Do not modify any subsystem beyond ≤20 LOC additive accessors.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- Any overlay's per-frame cost > 5ms at combat120 → STOP, disable that overlay by default, mark as opt-in, file a finding.
- Required navmesh / influence-map / LOD-tier read surface requires > 20 LOC of additive accessors → render that overlay as "—" placeholder, file finding, continue.
- `scene.add` of many lines causes draw-call spike beyond the perf gate → use `InstancedMesh` or batch geometry, re-probe.

## Pairs with

- `debug-hud-registry` (soft dep: overlay-registry UI mounts as panel).
- `free-fly-camera-and-entity-inspector` (complementary: inspector shows entity state, world-overlay shows entity relations + spatial state).
- `time-control-overlay` (complementary: pause + view all overlays at once on a single frame).
