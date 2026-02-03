# Terror in the Jungle — Alpha Upgrade Roadmap

> **PRIORITY ORDER**: Start with **Section 6 (Tooling, Diagnostics & Observability)** before optimizing anything else. We need to understand what's actually broken before fixing it. Build the profiler, build the stress test mode, then use data to guide the rest.

This living document groups the meta‑level tasks required to evolve the prototype into an alpha-ready build. Each block contains:

- **Outcome** — what success looks like.
- **Why Now** — risk or opportunity addressed.
- **Readiness Checklist** — preconditions or artifacts we expect before greenlighting individual tasks.
- **Key Tasks** — modular TODOs with short metaprompts that future tickets can reuse verbatim.
- **Best-Practice References (2024–2025)** — starting points for implementation patterns, code samples, or discussions.

> **Usage**: Treat every Key Task’s metaprompt as a seed for a more detailed implementation ticket. Update this roadmap as work lands or new discoveries surface (profiling data, player feedback, etc.).

---

## 1. Rendering & Post-Processing Modernization

**Outcome**: Stable 120 FPS headroom on RTX 3070 at native resolution with post effects toggled, WebGPU-compatible pipeline ready for rollout.

**Why Now**: Current composer forces HalfFloat offscreen buffers and SMAA even when not needed, consuming ~4–6 ms CPU/GPU in dense scenes.

**Readiness Checklist**
- Capture GPU frame profiles (Chrome WebGPU profiler or WebGL Insight) for Zone Control & Open Frontier.
- Inventory of existing effects (pixelation, outlines, HUD overlays).

**Key Tasks & Metaprompts**
- *Adaptive Render Path Switch*
  - Metaprompt: “Refactor `SandboxRenderer` so the engine auto-selects a no-post, half-resolution, or full chain render path per frame based on current GPU time. Implement a hysteresis-driven budget (target 6 ms) and expose a debug HUD overlay.”
- *WebGPU Experiment Branch*
  - Metaprompt: “Add a flag to bootstrap the Three.js WebGPURenderer. Render terrain, vegetation, and NPC billboards in parity with WebGL, falling back gracefully when the adapter lacks features. Document incompatibilities.”
- *Post-Chain Modularization*
  - Metaprompt: “Decompose post-processing into discrete passes with data-driven config (JSON/TS). Allow toggling SMAA, pixelation, outlines individually and support per-mode defaults.”

**Validation**
- GPU frame time averages ≤6 ms across 60 s capture in Zone Control and Open Frontier (Chrome Profiler trace attached to ticket).
- WebGPU prototype renders feature-parity scenes with <3% deviation in measured luminance compared to WebGL reference screenshots.
- Post-processing toggles persist per mode, verified via automated Playwright smoke test.

**Best-Practice References (2024–2025)**
- Three.js r160–r165 release notes on WebGPURenderer + EffectComposer interop.
- Google Chrome WebGPU samples (`googlechrome/chrome-samples/webgpu`) — dynamic render budget patterns.
- “Dynamic Resolution Rendering with WebGPU” (GDC 2024 talk by Intel).
- PlayCanvas blog: Adaptive post-processing pipelines (2023–2024).

---

## 2. NPC Simulation: ECS & Job Scheduling

**Outcome**: 150+ active agents with deterministic behavior and <4 ms main-thread budget in both game modes.

**Why Now**: Current `CombatantSystem` sorts/maps objects each frame, causing GC churn and uneven frame pacing when agent counts climb.

**Readiness Checklist**
- Profiling captures showing CPU cost by subsystem.
- Agreement on ECS library (bitecs, ecsy, or custom typed-array layer).

**Key Tasks & Metaprompts**
- *ECS Migration Spike*
  - Metaprompt: “Prototype combatant data in a struct-of-arrays using `bitecs`. Mirror current fields (position, velocity, state, squad) and benchmark update step vs. class-based system.”
- *Job Scheduler & Time Slicing*
  - Metaprompt: “Implement a frame-budgeted job scheduler that batches AI/LOS updates. Use priority queues per distance bucket to keep near-field agents at 60 Hz and far-field at 5 Hz.”
- *Memory Pooling & Scratch Buffers*
  - Metaprompt: “Introduce shared scratch `Vector3`/`Matrix4` pools for renderer + AI, eliminating per-frame allocations. Guard with unit tests to catch re-entrancy issues.”

**Validation**
- ECS prototype demonstrates ≥35% reduction in CPU time for `CombatantSystem.update` in profiling capture.
- Scheduler keeps 95th percentile frame time <18 ms while sustaining 150 agents (profiling artifact attached).
- Heap snapshots before/after show garbage collection pause reductions ≥40%.

**Best-Practice References (2024–2025)**
- `LastTry/bitecs` docs & migration guides for typed-array ECS.
- GDC 2024 “Data-Oriented JavaScript” (Olli Leino, Playable Agency).
- Unity DOTS (Entities 1.0) pattern breakdowns — reference for scheduling & job graph ideas.
- Mozilla’s `workerize-flow` discussion on SharedArrayBuffer messaging for WebGL apps.

---

## 3. Combat AI Optimization & Behavior Layers

**Outcome**: Tactical behaviors maintained while CPU cost scales sub-linearly with combatant count; AI remains responsive across biomes.

**Why Now**: AI currently recomputes squad coordination and LOS with expensive raycasts (`chunkManager.raycastTerrain`) even for culled agents.

**Readiness Checklist**
- Heatmap of LOS checks per frame.
- Identified hotspots from Chrome Trace (Performance tab) or Spector.js.

**Key Tasks & Metaprompts**
- *LOS Acceleration Structure*
  - Metaprompt: “Integrate `three-mesh-bvh`’s accelerated raycast with cached terrain tiles. Batch LOS queries per chunk to amortize BVH traversal.”
- *Influence Map for Strategic Targeting*
  - Metaprompt: “Compute a low-resolution influence grid using worker threads. Feed scores into squad target selection instead of per-agent random zone picks.”
- *Predictive Animation States*
  - Metaprompt: “Pre-cache billboard animation states per squad tick instead of per-agent. Broadcast state changes via event emitter to renderer.”

**Validation**
- LOS cache cuts per-frame raycasts by ≥50% (instrumentation counter reported in HUD).
- Influence map decisions reduce average squad idle time → <3 s (telemetry export screenshot).
- Animation cache eliminates duplicate texture swaps confirmed via renderer logs and visual QA pass.

**Best-Practice References (2024–2025)**
- `gkjohnson/three-mesh-bvh` advanced usage notes (instanced meshes, shared bounds).
- Overwatch 2 AI GDC 2023 talk on influence maps — still relevant for large squads.
- `amandaghassaei/pathfinding-3d` Web Worker navmesh experiments.

---

## 4. World Streaming & Terrain Pipeline

**Outcome**: Terrain streaming peaks under 2 ms/frame, memory footprint below 1.5 GB, no hitching when sprinting across Open Frontier.

**Why Now**: `ImprovedChunkManager` scans huge instance arrays and uses `setInterval`, risking drift; vegetation allocations never shrink.

**Readiness Checklist**
- Baseline metrics: chunk load time, vegetation instance counts, memory snapshots.
- Asset catalog with per-texture dimensions.

**Key Tasks & Metaprompts**
- *Frame-Budgeted Streaming Loop*
  - Metaprompt: “Replace `setInterval` loaders with `requestIdleCallback` + frame budget. Track debt and surface telemetry in debug overlay.”
- *Vegetation Pool Refactor*
  - Metaprompt: “Rework GPU vegetation to use chunk-local free lists. Ensure unloading chunks restores `activeCount` and purge zero-scale instances.”
- *Texture Residency & Compression*
  - Metaprompt: “Introduce KTX2/Basis compressed textures with mipmap levels. Add tooling to report VRAM usage per asset bundle.”

**Validation**
- Sprint traversal across Open Frontier exhibits no frame spikes >4 ms, verified in profiler timeline.
- Vegetation pool metrics show `activeCount` returning to baseline after unloading edge chunks (logged in HUD overlay).
- VRAM usage reports <1.2 GB with compressed asset pack, validated via Chrome GPU tab.

**Best-Practice References (2024–2025)**
- `pmndrs/drei` + `three-stdlib` examples on KTX2/Basis compression.
- PlayCanvas & Babylon.js streaming terrain writeups (2023–2024).
- `donmccurdy/three-loader-utils` for async asset pipelines.

---

## 5. Rendering Layer: Vegetation & Billboard Overhaul

**Outcome**: Vegetation draw calls collapse to 3–4 instanced draws with GPU frustum + distance culling; billboards scale gracefully in 4K.

**Why Now**: Current GPU billboard system keeps per-instance logs, lacks frustum culling, and duplicates meshes for outlines/markers.

**Readiness Checklist**
- Documented vegetation density targets per biome.
- GPU profiling confirming draw-call counts.

**Key Tasks & Metaprompts**
- *GPU Frustum & Depth Culling*
  - Metaprompt: “Add compute-friendly culling via hierarchical depth grid (CPU fallback with `frustum.containsPoint`). Drive instance count for each draw each frame.”
- *Merged Outline Shader*
  - Metaprompt: “Implement single instanced material that renders sprite + outline via shader branching. Remove duplicate instanced meshes.”
- *Biome Density Profiles*
  - Metaprompt: “Externalize vegetation spawn tables (JSON). Support per-mode overrides and runtime blending to reduce density near combat hotspots.”

**Validation**
- Draw call count stays ≤10 in both modes (measured via Three.js renderer info overlay).
- Outline shader replacement verified by matching visual golden images within ±2% pixel variance.
- Density profiles load per mode and adjust runtime (QA script records per-biome instance counts).

**Best-Practice References (2024–2025)**
- `pmndrs/lamina` shader layering examples for outlines.
- GPUInstancing techniques from Unreal 5.3 documentation (conceptual guidance).
- “Clustered Culling for Billboards in WebGL2” — SIGGRAPH 2024 Mobile talk.

---

## 6. Tooling, Diagnostics & Observability

**Outcome**: Dev builds provide actionable telemetry (FPS, CPU/GPU budgets, AI timers) and automated regression checks for frame time.

**Why Now**: Heavy console logging throttles performance; no automated perf baselines.

**Readiness Checklist**
- Decide on HUD style (React overlay vs. HTML templates).
- Consent on logging policy.

**Key Tasks & Metaprompts**
- *Structured Telemetry HUD*
  - Metaprompt: “Create a detachable debug HUD that streams frame timings, draw calls, job scheduler stats. Toggle via F1 and export JSON snapshots.”
- *Logging Policy & Rate Limiting*
  - Metaprompt: “Wrap console logging with categories + rate limiter. Persist high-frequency events to in-memory ring buffer surfaced via HUD.”
- *Perf Regression Harness*
  - Metaprompt: “Add Playwright or Puppeteer script that runs canned replays (Zone Control / Open Frontier) and records frame timing histograms. Fail CI if p95 exceeds budget.”

**Validation**
- HUD overlay displays live metrics with <0.2 ms update overhead (microbenchmark documented).
- Logging bursts no longer exceed 20 logs/sec (rate limiter metric exposed in HUD).
- CI pipeline gate produces and archives histogram PNG/JSON artifacts per PR.

**Best-Practice References (2024–2025)**
- `pmndrs/leva` for quick debug UI panels.
- Chrome Trace Event format (`trace-event-lib`) for custom profiling exports.
- Playwright GPU benchmarking recipes (Microsoft Build 2024 session).

---

## 7. Asset & Build Pipeline Hardening

**Outcome**: Deterministic builds with hashed asset bundles, automated linting, and per-branch preview deployments.

**Why Now**: Large textures + audio assets live unchecked; no automated sanity checks or CDN-friendly pipeline.

**Readiness Checklist**
- Inventory of current npm scripts & Vite config.
- Storage budget for CI artifacts.

**Key Tasks & Metaprompts**
- *Asset Lint & Budgeting*
  - Metaprompt: “Add a `pnpm run audit:assets` script that flags textures >2048², audio >5 MB, and missing compression. Fail CI on violations.”
- *Deterministic Build Outputs*
  - Metaprompt: “Configure Vite build to emit hashed filenames, asset manifest, and gzip/brotli sizes. Document deployment checklist.”
- *Preview Deploy Pipeline*
  - Metaprompt: “Set up GitHub Actions (or alternative CI) to build, run perf harness, and deploy preview builds to a staging bucket with auto-expiring links.”

**Validation**
- Asset audit fails on introduced over-budget files (sample PR demonstrating guard).
- Build artifacts hash-stable across repeated runs (CI log comparison).
- Preview deployments accessible via signed URL, auto-expire confirmed after retention period.

**Best-Practice References (2024–2025)**
- Vite 5.x docs on `build.rollupOptions.output.manualChunks` & asset hashing.
- GitHub Actions reusable workflows for WebGL builds (`actions/examples` repo, 2024 updates).
- `asset-buddy` / `webpack-bundle-analyzer` analogs for Vite (`rollup-plugin-visualizer`).

---

## 8. Mode-Specific Balancing & Scalability

**Outcome**: Zone Control and Open Frontier share core tech but toggle density, LOD, and spawn logic via data-driven configs.

**Why Now**: Today’s configs adjust counts but not AI cadence, chunk budgets, or vegetation density; Open Frontier suffers from Zone Control-centric tuning.

**Readiness Checklist**
- Profiling comparisons between modes.
- Agreement on acceptable NPC counts & view distances per mode.

**Key Tasks & Metaprompts**
- *Mode Parameter Matrix*
  - Metaprompt: “Create a declarative `modeProfiles` module that centralizes LOD ranges, render distances, job budgets, vegetation scalars. Wire into system initializers.”
- *Dynamic Ticket & Respawn Scaling*
  - Metaprompt: “Adjust ticket bleed and respawn timers based on current active agents and performance budget. Ensure fairness via automated tests.”
- *Playtest Telemetry Export*
  - Metaprompt: “Record per-mode metrics (average FPS, deaths, zone flips) into CSV/JSON for balancing. Provide export hotkey.”

**Validation**
- Switching modes updates all linked systems without manual code edits (unit/integration tests).
- Telemetry exports consumed by balancing spreadsheet, containing expected fields validated by schema test.
- Automated match simulations finish within target duration ±10% for both modes.

**Best-Practice References (2024–2025)**
- Battlefield franchise postmortems on mode scaling (GDC Vault).
- “Data-Driven Difficulty Tuning” — Game Dev Summit 2024 panel.
- Open-source balancing tooling (`open-balancing-suite`).

---

## 9. Future-Facing: Multiplayer & Netcode Feasibility (Optional)

**Outcome**: Documented path to coop/multiplayer, even if not immediate, ensuring current architecture doesn’t block future work.

**Why Now**: ECS/job system migration decisions affect replication strategies.

**Readiness Checklist**
- Network latency targets & authoritative model decision.
- Audit of deterministic vs. non-deterministic systems.

**Key Tasks & Metaprompts**
- *Determinism Audit*
  - Metaprompt: “Catalog all random sources and time-based animations. Propose seeding & lockstep-friendly alternatives where needed.”
- *State Snapshot Prototype*
  - Metaprompt: “Prototype binary state snapshots for ECS data. Measure size & diff frequency for 60 Hz replication.”
- *Rollback Feasibility Study*
  - Metaprompt: “Evaluate lightweight rollback architecture inspired by GGPO. Document costs for physics, AI, and terrain streaming.”

**Validation**
- Determinism audit checklist signed off with mitigation plan per random source.
- Snapshot prototype transmits ≤64 KB per frame for 120 agents (profiling output attached).
- Rollback study includes go/no-go recommendation with estimated engineering weeks.

**Best-Practice References (2024–2025)**
- `colyseus/colyseus` ECS synchronization examples (2024 updates).
- GGPO rollback whitepapers & Slippi netcode postmortem.
- Valve’s “Networked Physics in Dota 2 Reborn” (still relevant for determinism planning).

---

### How to Iterate This Roadmap
- Maintain a changelog section listing completed initiatives and their impact on frame time.
- Cross-link profiling captures, design docs, and tickets per task.
- Review quarterly to align with playtest feedback and funding milestones.
