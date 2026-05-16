# Packaging, engine reuse, and frontier primitives

Last verified: 2026-05-16 (cycle-sky-visual-restore close; cycle-mobile-webgl2-fallback-fix R1 in flight)

Forward-looking synthesis on how the post-WebGPU engine can be packaged for
distribution surfaces beyond Cloudflare Pages, extracted as a reusable
engine for adjacent 3D games, and pushed with browser primitives that
weren't on the radar when [BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
landed (or that earn re-framing now that WebGPU is on master).

Companion to:
- [BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
  — the leverage-ranked CPU/memory/audio/input inventory.
- [POST_KONVEYER_MIGRATION_2026-05-13.md](POST_KONVEYER_MIGRATION_2026-05-13.md)
  — capping memo for the KONVEYER campaign.
- [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
  — "keep the stack" stance with 2026-05-13 ground-vehicle addendum.
- [MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
  — the alignment memo driving the active 12-cycle campaign.

This memo is **strategy and inventory** — not a dispatchable cycle brief. The
adoption ladder (§7) names the few items concrete enough to slot into the
queue once the active campaign clears.

---

## TL;DR

The engine is now a mature browser-first 3D combat runtime:
WebGL2 + WebGPU dual renderer, ~3,000-NPC materialization tiers, real-DEM
21 km terrain, ECS-adjacent hot path under build-out, 464 source files
behind a fenced public interface
(`src/types/SystemInterfaces.ts`). Single distribution channel today:
Cloudflare Pages. Single product today: Terror in the Jungle.

Three axes of leverage open up next:

1. **Packaging.** PWA install + service-worker prebake cache is a
   one-cycle win that unlocks offline play and home-screen installability
   with zero new infra. Tauri 2 is a 2-3-cycle win for a Steam-ready
   desktop binary off the same browser bundle. Capacitor is the path to
   App Store + Play Store; cost is non-trivial (Metal/WebGPU
   pipeline-state gaps to verify).
2. **Engine reuse.** The interface fence + systems-based architecture
   are already 80% of what an extractable `@tjengine/core` package
   needs. A modest cycle could publish a private npm package that
   another 3D game (or a tools/editor side-project) could consume
   without forking. The benefit is multiplier for the owner's broader
   3D-game portfolio, not Terror itself.
3. **Frontier primitives** beyond what's already in
   [BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md):
   WebGPU subgroups (Chrome 125+) for cover-query indexing, WebTransport
   over QUIC as the eventual multiplayer foundation, WebCodecs for
   replay/spectate capture, View Transitions API for menu-flow polish,
   `navigator.gpu.requestAdapter({ powerPreference })` tier-detection
   for mobile material variants.

Risk and adoption ladder in §7. Concrete cycle-shaped proposals in §8.

---

## 1. Frame: where the engine is now

State snapshot as of 2026-05-16, post `cycle-sky-visual-restore` close:

| Surface | State | Notes |
|---|---|---|
| Renderer | WebGPU + TSL default; WebGL2 fallback via `WebGPURenderer` internal backend (mobile lands here). Classic `THREE.WebGLRenderer` available via `?renderer=webgl` escape hatch. | Cycle #2 in flight closes the mobile-fallback-perf gap (KB-MOBILE-WEBGPU). |
| Distribution | Cloudflare Pages, `terror-in-the-jungle.pages.dev`, CGNAT, 1Gbps symmetric. CSP + COOP/COEP already set on `public/_headers`. | `crossOriginIsolated === true` reachable today; SAB / `performance.measureUserAgentSpecificMemory()` unblocked. |
| Asset pipeline | Vite 8 build → static CDN. Heightmaps and navmeshes prebaked via `scripts/prebake-navmesh.ts`. No service-worker / no offline cache today. | OPFS not in use; `localStorage` for settings/saves. |
| Engine surface | `src/types/SystemInterfaces.ts` fenced (10 interfaces); 464 source files; `src/systems/**` organized by subsystem; `src/core/` orchestration; `src/ui/` paradigm-mixed. | Fence enforces stable consumer-side ABI. |
| Test surface | 4,258+ tests in 282 files; Vitest 4; 4-layer contract (L1 pure / L2 single-system / L3 small scenario / L4 full engine). | High enough to refactor confidently. |
| Game scope | Single-player, FPS + helicopter + fixed-wing. VEKHIKL-* (ground vehicles), VODA-* (water), AVIATSIYA-* (helicopter polish) on the active 12-cycle queue. | No multiplayer today; not in the active queue. |
| Codebase shape | Systems orchestrator pattern with `SystemUpdater` per-frame dispatch + telemetry. WASM via `@recast-navigation/*` for navmesh; no other WASM. | Worker pool for terrain + navmesh tile generation. |

What this state enables that wasn't true 6 months ago:

- A standalone desktop binary off the same bundle is a small step (Tauri 2 webview is WebGPU-capable since Tauri 2.5 / 2026-Q1).
- An iOS Safari deploy is *theoretically* one PWA manifest + a Capacitor wrap away; in practice the WebGPU path on iOS 18.2+ Safari is real but pipeline-state-cache thrashing is documented (see §5.3).
- Engine extraction is a matter of `package.json` workspace plumbing because the systems already speak through `SystemInterfaces.ts` consumers.

---

## 2. Packaging axes

Ranked by ROI on owner's actual distribution goals (single-player
browser-first game; broader portfolio of 3D experiments).

### 2.1 PWA install + service-worker prebake cache

**What.** Web App Manifest (`manifest.json`) declaring icon, theme,
display mode, screenshots; service worker (Workbox or hand-rolled)
caching the Vite bundle + prebaked navmesh/heightmap artifacts on first
load.

**Browser support.** Universal on desktop Chrome/Edge/Safari. Mobile
Chrome (Android) treats it as a first-class installable app with
launcher-icon, no URL bar, splash screen. Mobile Safari (iOS) supports
Add to Home Screen with PWA semantics since iOS 16.4 (2023). No app
store; users install directly from the web.

**What it unlocks.**
1. **Offline play.** After first visit, the game boots offline. For a
   single-player game this is meaningful — local LAN parties, on a
   plane, on the train.
2. **Home-screen install with custom icon and splash.** On mobile this
   collapses the perception gap between "web demo" and "real game."
3. **Smaller cold-start TTI on repeat visits.** The current Cloudflare
   Pages cache is opportunistic; a service worker is deterministic.
4. **Prebake-asset durability.** Heightmaps and navmeshes can live in
   the service-worker cache instead of relying on HTTP cache
   negotiation. Cuts a few seconds off the second visit.
5. **Push notifications** (later) — could announce "weekly mission
   refresh" if the game ever has a meta-loop.

**What it costs.**
- ~150 LOC `service-worker.ts` + `manifest.json` + a Vite plugin
  (`vite-plugin-pwa` is the canonical choice).
- One-time icon + splash asset pass (sized variants for iOS, Android, desktop).
- A `BeforeInstallPromptEvent` handler in the UI to show "Install" in
  the menu on supported platforms.
- A versioning/migration story for the cache (Workbox handles this).

**Risk.**
- iOS PWA semantics drift between iOS 16/17/18; need to walk an actual
  device after each iOS release.
- Asset cache invalidation across deploys needs care (the standard
  Workbox precache-with-hash pattern handles it).

**Position on adoption ladder.** Tier A (this campaign, after cycle
#12 lands). Single-cycle, no new dependencies of consequence.

### 2.2 Tauri 2 desktop wrap

**What.** Tauri is a Rust-based desktop app shell that loads a web
frontend via the OS's system webview (WKWebView on macOS, WebView2 on
Windows, WebKitGTK on Linux). Tauri 2.x (2026-Q1+) supports WebGPU on
all three platforms because the system webviews carry it.

**Browser support.** Not a browser-support question — it's a system-
webview question. Windows WebView2 is Chromium-based (carries WebGPU
from Chromium); macOS WKWebView is WebKit-based (carries WebGPU since
Safari 18.2 / macOS Sequoia 15.2); Linux WebKitGTK trails by ~1 year
on WebGPU support. The Tauri 2 docs flag the Linux gap.

**What it unlocks.**
1. **Distribute as a binary.** ~6 MB Tauri shell + the game's assets
   (currently a few hundred MB). Users install via standard installer
   (MSI on Windows, DMG on macOS, AppImage/DEB on Linux). No browser
   indirection; no Cloudflare bandwidth.
2. **Steam path.** Steamworks SDK expects a native binary; a Tauri wrap
   is the cheapest way to satisfy that without writing a true native
   game. Friends-list, achievements, controller config inheritance, and
   Steam Workshop integration become possible at modest cost.
3. **Itch.io distribution.** Itch accepts any native binary; same
   wrap satisfies it.
4. **Out-of-process features.** Tauri's Rust shell can host things the
   browser sandbox can't: file-system access without the
   `showOpenFilePicker` permission dance (for mod loading), arbitrary
   network protocols, hardware probes, AudioWorklet at sample-accurate
   latency.
5. **Native AOT-compiled hot paths.** Rust kernels (the ballistic
   solver from `TANK_SYSTEMS_2026-05-13.md` cycle #9) can ship as
   native Rust calls instead of WASM, with FFI to the webview.

**What it costs.**
- ~1 cycle to ship a viable Tauri build pipeline alongside the Vite
  build: shared bundle, CI matrix bumped from 5 to 8 jobs (3 platform
  builds), code-signing certificates for Win/macOS (one-time owner
  cost), notarization step for macOS.
- A `tauri.conf.json` and Rust shell crate (`src-tauri/`).
- A "launched via Tauri" runtime probe to skip the `BeforeInstallPromptEvent`
  PWA install dance.
- CI build time grows (Rust crate compile + 3 platform installers).
- One human pass on each platform per release (the same gate that
  exists for owner playtest, just times 3).

**Risk.**
- Tauri 2 is young; breaking changes between 2.x releases are real.
  Pin and read the release notes. Tauri 1 → 2 was a hard migration.
- macOS notarization requires an Apple Developer account ($99/yr).
- Linux webview WebGPU lag: ship with explicit-WebGL2 mode on Linux
  initially.
- Steam approval is a real human review with a 1-3 week lead time.

**Position on adoption ladder.** Tier C (post-VEKHIKL, after the
ground-vehicle direction lands a recognizable game-feel beat). Earlier
than that would be premature — the game needs to be worth distributing
beyond the browser.

### 2.3 Capacitor + native mobile

**What.** Capacitor is Ionic's equivalent of Tauri for mobile: an iOS
and Android shell that loads the web frontend in WKWebView (iOS) or
Android WebView (Chromium). Same Vite bundle ships to the App Store
and Play Store as a "native" app.

**Browser support.** Same as 2.2 — it's a system-webview question.
Android Chromium-based WebView carries WebGPU per Chrome version
(Android Chrome 125+). iOS WKWebView carries WebGPU since iOS 18.2.
Pre-18.2 iOS users get WebGL2 fallback (the same path cycle #2 is
hardening).

**What it unlocks.**
1. **App Store + Play Store presence.** Discovery channels the web
   can't match. Mobile-first players will not find the game otherwise.
2. **Touch-first input.** Capacitor exposes a touch API the browser
   can't replicate at the same fidelity (haptics, multi-touch with
   true gesture recognizers).
3. **Push notifications via APNs/FCM** without PWA limitations.
4. **In-app purchases.** Monetization path that the web can't access.

**What it costs.**
- 2-3 cycles. iOS app needs Apple Developer membership, App Store
  review (1-7 day lead), provisioning profile management.
- Android similar; Play Console + signing-key custody.
- Mobile-specific tuning (cycle #2 is the start of that conversation):
  pixel-ratio cap, lower-LOD biome variants, deferred audio decode.
- Touch input rewrite for combat (the current FPS controls assume
  PointerLock).
- App Store review is real human review with subjective veto. Likely
  hostile to a war-themed shooter without polish + age-gate work.

**Risk.**
- iOS App Store guidelines on violent/war content are strict; the
  game's current visual posture may need a "Combat sandbox" framing
  to pass review.
- WKWebView pipeline-state cache thrashing on TSL graphs that rebuild
  per-frame (see §5.3) — even with cycle #2's fixes, the iOS path
  may need extra material-variant work.
- Mobile QA matrix explodes (iOS 16/17/18 × multiple device classes
  × Android 12/13/14 × multiple GPU families).

**Position on adoption ladder.** Tier C-D. After Tauri proves the
shell+bundle pattern. Mobile-native is a substantial commitment.

### 2.4 Itch.io browser-embed

**What.** Itch.io accepts HTML5 games as a zipped directory; same
bundle Vite emits. The game runs in an iframe under Itch's domain.

**Browser support.** Same as the current Cloudflare Pages deploy.
COOP/COEP under iframe needs Itch to forward the headers; they support
it via project settings.

**What it unlocks.**
1. **Discovery on a game-focused platform.** Itch has a community of
   browser-game players who don't find Cloudflare Pages projects.
2. **Optional rev-share.** Itch handles payments if/when the owner
   wants to monetize.
3. **Game-jam compatibility.** If the game ever ships a "limited mode"
   variant for a jam, Itch is the natural home.

**What it costs.**
- ~half a day. Vite build → zip → upload.
- One-time Itch project page setup + description + screenshots.

**Risk.**
- COOP/COEP forwarding gotchas on Itch's iframe wrapper; may need a
  flag toggle in the project settings.
- Itch's player base may not be the audience for a 3D combat sim.

**Position on adoption ladder.** Tier A optional (cheap to try).

### 2.5 Discord activity

**What.** Discord launched the Activities API; web apps can run inside
a voice channel as a shared experience. Same bundle, additional shim
for the Activities SDK (auth + voice-channel presence).

**Browser support.** Discord's native client (Electron) and web client
both support Activities. WebGPU works in modern Discord.

**What it unlocks.**
1. **Built-in social layer.** Voice + text chat + presence are
   pre-wired. The "play with friends" loop happens inside Discord.
2. **Discovery via Discord servers.** Communities can pin the
   activity for their members.

**What it costs.**
- Discord Developer Portal app registration.
- Activities SDK shim (~200 LOC).
- An "Activity mode" UI variant that uses Discord's voice-channel
  identity instead of the game's local identity.
- Subject to Discord's review.

**Risk.**
- Discord Activities are typically multiplayer-shaped; a single-player
  combat sim is an unusual fit. Probably waits for the multiplayer
  direction (WebTransport in §5.2) to land.

**Position on adoption ladder.** Tier D — speculative until
multiplayer exists.

---

## 3. Engine reuse and extraction

The systems-based architecture + interface fence make the engine
extractable with modest effort. Whether that's worth doing depends on
whether the owner wants to build other 3D games against this stack.

### 3.1 What's already engine-shaped

The hard work is done:

- **`src/types/SystemInterfaces.ts`** is exactly the ABI surface a
  reusable engine wants: stable consumer-side contracts that
  implementations can vary behind.
- **`src/systems/**`** is organized by subsystem (combat, terrain,
  audio, environment, navigation, debug, input, player, weapons) —
  the natural extraction boundary.
- **`src/core/`** holds the orchestrator (`GameEngine`,
  `SystemUpdater`, `GameRenderer`, init/loop modules) — also engine
  surface.
- **`scripts/prebake-navmesh.ts`**, `scripts/perf-capture.ts`,
  `scripts/cycle-validate.ts`, `scripts/check-fence.ts` — engine
  tooling.
- **`docs/blocks/*.md`** — block-level architecture docs that double
  as engine documentation.
- **`docs/TESTING.md`**, `docs/INTERFACE_FENCE.md` — engine policies.

### 3.2 What's game-shaped (stays in the consumer)

- **`src/dev/`** — gun-range scene, terrain sandbox, debug HUDs (these
  are Terror-specific test surfaces; an engine package would document
  the *pattern* but not ship the implementations).
- **`src/config/MapSeedRegistry.ts`** — Terror-specific map seeds.
- **`src/systems/combat/**`** — squad logic, weapons damage tables,
  faction definitions (engine ships the *primitives*; the game writes
  the *content*).
- **`src/ui/`** — Terror-specific HUD, menus, mode-select.
- **Asset directories** — Terror's textures, models, audio.

### 3.3 Proposed extraction shape

If the owner wants this:

```
@tjengine/core         — src/core/, src/types/, src/systems/(non-content)/, scripts/
@tjengine/three-tsl    — TerrainMaterial, AtmosphereSystem primitives, SunDiscMesh, HosekWilkieSkyBackend
@tjengine/dev-tools    — perf-capture, prebake scripts, validate scripts, debug HUDs
@terror-in-the-jungle  — game-specific systems, content, UI (consumes the three engine packages)
```

Mechanics:

- npm workspaces or pnpm workspaces (no monorepo tooling beyond what
  npm 7+ provides).
- Each engine package versions semver; SystemInterfaces.ts changes are
  major-version bumps (the fence already gates this).
- The consumer game pins major versions; minor/patch bumps land
  through dependabot or a manual sweep.

### 3.4 What this costs

- One cycle to set up the workspace + move files. Probably ~10-15
  tasks because of the import-rewrite scope (every cross-package import
  needs to switch from relative to package-name).
- A migration risk window: while files are moving, the cycle is
  fragile.
- Long-tail cost: every engine change now requires a release step,
  not just a commit.
- Test reshuffling: tests need to follow the systems they test.

### 3.5 What this earns

- **Reuse for the owner's other 3D game ideas.** If the owner ships a
  second 3D experience, it gets the engine for free.
- **Versioned ABI surface** that a contributor (or a future Claude
  session) can rely on without reading the implementation.
- **Engine-internal refactors stop bleeding into the game.** Today,
  a refactor anywhere in `src/systems/` is a Terror commit; with
  extraction, it's an engine commit + a consumer-side major bump
  (or not, if the ABI held).

### 3.6 What this doesn't earn

- Performance. Bundling moves the same code through the same Vite
  pipeline; no runtime difference.
- "Open source" status. Extraction can stay private (npm scoped
  package) or go public; that's a separate decision.

**Position on adoption ladder.** Tier C-D. Don't extract until the
owner is committed to building a second project against this engine.
Premature extraction has historically cost more than it earned in this
kind of codebase.

---

## 4. Frontier WebGPU primitives

The primitives [BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
doesn't cover (because it focuses on the CPU/memory/audio surface
*around* WebGPU). All of these are post-WebGPU-default-merge bets.

### 4.1 WebGPU subgroups

**What.** Subgroups are the WGSL equivalent of warp/wavefront SIMD
primitives — operations that share data across the 16-64 invocations
in a GPU's SIMD lane group. Operations: `subgroupBroadcast`,
`subgroupShuffle`, `subgroupAdd`, `subgroupMax`, `subgroupBallot`,
etc. WGSL extension `chromium-experimental-subgroups`; standard since
Chrome 125 (April 2025).

**What it unlocks for this game.**
- **Cover-query indexing (DEFEKT-3 / cycle #3
  `cycle-konveyer-11-spatial-grid-compute`).** The synchronous cover
  search in `AIStateEngage.initiateSquadSuppression` is the long-tail
  p99 contributor. A compute shader writes a coarse spatial grid keyed
  by NPC squad ID; `subgroupBroadcast` lets one invocation share a
  candidate cover position with the entire subgroup, collapsing the
  N×M scan into log(N) passes.
- **NPC LOS batching.** Same shape; one ray-cast result broadcast to
  all subgroup-mates checking the same direction.
- **Particle sort.** GPU bitonic sort with subgroup primitives drops
  the per-frame cost of explosion+tracer pools (currently CPU-sorted
  for additive-blend correctness).

**Risk.**
- Safari ships subgroups behind a flag (as of 2026-05-16); production
  use requires WebGL2 fallback for non-Chromium users.
- Subgroup size varies per GPU (4 on Apple, 32-64 on NVIDIA/AMD);
  writing portable kernels takes care.

**Position.** Tier B. Spike against DEFEKT-3 in the
`cycle-konveyer-11-spatial-grid-compute` window — it's already on the
queue.

### 4.2 Storage textures + indirect draw

**What.** Storage textures (read/write 2D/3D textures in shaders) +
`GPUCommandEncoder.drawIndirect` (draws driven by a GPU-side buffer,
not a CPU call per draw).

**What it unlocks.**
- **GPU-driven culling pipeline.** A compute pass writes an indirect-
  draw arg buffer; the CPU never sees per-impostor visibility. The
  KONVEYER hold-list item `cycle-konveyer-12-indirect-draw-gpu-culling`
  is the named home for this work.
- **Atlas-write paths.** Current `DataTexture` + `needsUpdate` upload
  path serializes through CPU; storage textures let the GPU write the
  atlas directly (e.g. sky LUT bake could move from CPU to compute).
- **GPU navmesh markup.** Speculative — Recast on the CPU is robust;
  a GPU-side reachability check (compute pass over heightmap +
  sphere markers) might cut steady-state per-NPC navmesh-query cost.

**Risk.**
- Three.js + TSL surface for storage textures is still maturing; some
  patterns require dropping to raw `WebGPURenderer` / WGSL.
- Indirect-draw + Three.js scene graph needs adapter work; the
  `BatchedMesh` path is the canonical entry point.

**Position.** Tier B. Already queued via the
`cycle-konveyer-12-indirect-draw-gpu-culling` hold-list item; promote
after cycle #5 VODA-1 lands (per the campaign manifest).

### 4.3 GPU timestamp queries

**What.** `GPUDevice.requestQuerySet({ type: 'timestamp' })` lets
shaders write nanosecond-resolution timestamps to a buffer.
`renderer.info.programs` and the new `WebGPURenderer.getRenderInfo()`
surface in Three.js r184 expose this when present.

**What it unlocks.**
- **Per-pass attribution.** Today's `FrameTimingTracker` measures
  wall-clock between system boundaries. GPU timestamps let us
  attribute frame time to render passes individually: shadow pass,
  terrain pass, billboard pass, sky pass, post-process.
- **Mobile profiling correctness.** CPU/GPU pipelining hides GPU
  cost from wall-clock measurement; timestamps cut through that.

**Risk.**
- Timestamp precision is GPU-dependent; some adapters lie.
- Requires the user agent to grant the `timestamp-query` feature
  (Chrome grants by default on desktop).

**Position.** Tier A spike. Pair with the
`render-bucket-telemetry-fix` task in cycle #2 R1 (currently in
flight) — same telemetry surface, would close the "GPU cost is dark"
gap the `mobile-startup-and-frame-budget.md` R1 memo flagged.

### 4.4 TSL ComputeNode particle pipelines

**What.** TSL's `ComputeNode` lets compute shaders be authored in
JS-flavoured TSL instead of WGSL strings. Three.js r184 supports
ComputeNode for particle systems, simulations, post-process passes.

**What it unlocks.**
- **GPU tracer/impact/explosion pools.** The current CPU pools
  (`TracerPool`, `ImpactEffectsPool`, `ExplosionEffectsPool`) are
  ~30 ms p99 contributors on `combat120` per recent perf captures.
  Migrating to ComputeNode would offload the integration step and the
  state churn.
- **GPU billboard layout.** `GPUBillboardSystem` already does instanced
  rendering, but the per-frame transform update is CPU-bound. A
  ComputeNode could do the transform update on the GPU.

**Risk.**
- ComputeNode API is new; patterns are still being established
  upstream. Read the Three.js examples/jsm directory for current
  shapes.
- Determinism breaks if the GPU sim diverges between adapters.

**Position.** Tier B-C. Spike after cycle #11 DEFEKT-4 lands and the
movement/navigation surface stabilizes.

### 4.5 GPU buffers + WebGPU 3D textures

**What.** True 3D textures (not 2D arrays) + storage buffers >
512 MB.

**What it unlocks.**
- **Volumetric clouds.** The retired `CloudLayer` plane was 2D;
  volumetric clouds with 3D noise textures + ray-marching are now
  feasible. The cycle-sky-visual-restore "out of scope" list
  explicitly defers cloud-fidelity to a future cycle; this is the
  primitive that enables it.
- **3D fog volumes.** Tactical use — fog of war, smoke grenades
  with directional dispersion, jungle canopy light shafts.

**Risk.**
- Volumetric rendering is bandwidth-bound on mobile; cycle #2 mobile
  work proves out the floor.
- The cloud-fidelity cycle hasn't been written; this is a primitive
  for a future direction, not an active proposal.

**Position.** Tier D. Wait for the cloud-fidelity / VODA-followup
direction.

---

## 5. Frontier non-WebGPU primitives

Beyond what BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md covers, or where
re-framing is warranted.

### 5.1 WebGPU adapter `powerPreference` + tier detection

**What.** `navigator.gpu.requestAdapter({ powerPreference: 'low-power' | 'high-performance' })`
lets the engine ask for the integrated GPU explicitly (or
implicitly route mobile to integrated). Adapter info exposes vendor,
architecture, device — usable for tier detection.

**What it unlocks for this game.**
- **Mobile material variants.** Cycle #2 hardens the WebGL2-fallback
  path; the next pivot is *compiling different TSL graphs per device
  tier*. A "mobile" tier could:
  - Skip the triplanar branch entirely (gate at compile time, not
    runtime — flatter graphs are cheaper).
  - Use 4 biomes instead of 8 (cut sampler count in half).
  - Skip the secondary-color path.
- **Desktop variants.** "Cinematic" tier compiles in the volumetric
  fog ComputeNode (§4.5) that the mid-tier desktop skips.

**Cost.**
- TSL graph branching adds compile-time complexity.
- Variant cache management (which graph for which adapter info).

**Position.** Tier B. Natural extension of cycle #2; could even slot
in as a cycle #2 R4 if scope expands. Otherwise immediately after.

### 5.2 WebTransport (QUIC-based UDP)

**What.** WebTransport gives bidirectional streams and reliable +
unreliable datagrams over a single QUIC connection. Chrome 97+; Firefox
trails. Safari trails further.

**What it unlocks.**
- **Multiplayer foundation.** Today the game is single-player. If the
  owner wants a 2-8 player mode (which a war-themed combat game's
  audience would expect), WebTransport is the right wire protocol —
  unreliable datagrams for position updates, reliable streams for
  hits/kills/chat.
- **Spectator streaming.** A central relay could stream a real-time
  view of a session to spectators (low-latency, no rebuffering).
- **Headless server reachable from the browser.** Today the only
  multiplayer story would be peer-to-peer via WebRTC; WebTransport
  enables a real authoritative server.

**Cost.**
- Server-side work (Rust + `quinn` crate or Go + `quic-go`).
- Hosted relay (Cloudflare's smart placement, or a single VPS for
  pilot).
- Deterministic sim work (the C2-determinism-open-sources.md spike's
  outputs would matter here).
- A whole multiplayer game-design conversation that doesn't exist
  today.

**Risk.**
- Safari WebTransport support is a real gap; iOS users would not have
  multiplayer until that lands.
- Server-side state management adds operational burden the project
  doesn't have today.

**Position.** Tier D. Multiplayer is not on the active 12-cycle queue.
This is a "if/when" primitive; document it so it's not forgotten.

### 5.3 WebCodecs (`VideoEncoder` / `VideoDecoder` / `AudioEncoder`)

**What.** WebCodecs gives direct access to hardware video codecs from
the browser. Chrome 94+; Safari 16.4+; Firefox trails on encoding.

**What it unlocks.**
- **Replay capture.** Record gameplay to MP4/WebM from inside the
  browser without screen-capture APIs. Tactical/training-tape use.
- **Spectator stream encoder.** Pairs with §5.2 for a "watch live"
  feature.
- **In-game cinematic playback.** Pre-rendered cinematics streamed at
  low bandwidth.

**Cost.**
- Glue layer reading from `OffscreenCanvas.transferToImageBitmap()`
  feeding into `VideoEncoder.encode()`.

**Risk.**
- Hardware encoders vary in quality/support; CPU fallback is
  expensive.

**Position.** Tier C-D. Pair with multiplayer or a campaign-system
direction.

### 5.4 View Transitions API (`document.startViewTransition`)

**What.** Browser-level cross-fade/morph transitions between UI states.
Chrome 111+, Safari 18+.

**What it unlocks.**
- **Menu-flow polish.** Mode-select → loading → in-game transitions
  can morph instead of cut. Cheap quality bump.
- **HUD state transitions.** Capturing a zone → score-flash → HUD
  resettle can use a single transition instead of bespoke animation.

**Cost.**
- Modest CSS/DOM refactor for the affected UI surfaces. A few hundred
  lines for the major transitions.

**Risk.**
- Firefox trails; need fallback to instant cut.

**Position.** Tier B. Low-risk polish; pairs naturally with any UI
cycle.

### 5.5 OPFS (Origin Private File System)

**What.** A web-only file system, scoped to the origin, accessible via
`navigator.storage.getDirectory()`. ~unbounded quota (subject to
browser eviction policy).

**Coverage in primitives memo.** Already covered in
[BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md §3](BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
as a NEXT-priority recommendation for prebake-asset persistence. Re-
flagging here because it pairs naturally with the PWA service-worker
prebake cache (§2.1) — the two could share the same eviction model.

**Position.** Tier A. Already in BROWSER_RUNTIME_PRIMITIVES; this memo
just notes the pairing with PWA work.

### 5.6 Compression Streams API

**What.** `CompressionStream`/`DecompressionStream` for gzip/deflate/
brotli. Chrome 80+, Safari 16.4+, Firefox 113+.

**What it unlocks.**
- **Asset delta-streaming.** Diffs between deploys could ship as
  compressed binary patches instead of full asset re-downloads.
- **Replay file size.** Replays (if §5.3 ships) compress 3-5x for
  storage/share.

**Position.** Tier C. Wait for an asset-pipeline cycle.

### 5.7 SharedArrayBuffer + Atomics (in scope for re-framing)

**Coverage in primitives memo.** Already covered in
[BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md §3](BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
as NEXT-priority worker pipeline work. Re-flagging because:

- **COOP/COEP is already set on `public/_headers`** (per the same
  primitives memo §1). The crossOriginIsolated bit is already
  earnable; SAB doesn't need a deploy change.
- **The terrain worker pool + navmesh worker would benefit
  immediately** from SAB-backed transferable buffers instead of
  zero-copy ArrayBuffer transfer (which invalidates the sending
  side).
- **Determinism work in the C2 spike outputs** would benefit from a
  shared rng-state buffer between main + worker.

**Position.** Tier A. Cheaper than it looks because the deploy side
is already configured.

---

## 6. Perf and optimization pivots

Game-shape-specific pivots that aren't packaging or primitives but
that the post-WebGPU world makes available.

### 6.1 Per-device-tier TSL graph compilation

Covered in §5.1. Lead pivot post-cycle #2.

### 6.2 Worker physics (Rapier WASM in worker)

**What.** Move the vehicle physics solver into a dedicated worker;
main thread reads transforms via shared buffer or postMessage.

**Coverage in `GROUND_VEHICLE_PHYSICS_2026-05-13.md`.** The 2026-05-13
memo names Rapier as a candidate but gates adoption behind 4
acceptance criteria. The worker-physics pivot would compound the
benefit: even if main-thread Rapier already meets the bar, off-
thread is strictly better for frame-time stability.

**Position.** Tier B-C. Pair with VEKHIKL-3/4 (cycles #8/#9) if
Rapier gets adopted there.

### 6.3 Squad-aggregated strategic sim (the R3 materialization work)

**Coverage.** Already on the hold list as
`cycle-phase-f-r2-r4-on-master`. This memo doesn't add to that
proposal — just notes that it compounds the WebGPU subgroup pivot
(§4.1) because the squad-aggregated path naturally maps to a GPU
compute pass.

### 6.4 GPU-driven indirect drawing

**Coverage.** §4.2. Already queued as
`cycle-konveyer-12-indirect-draw-gpu-culling` hold-list item.

### 6.5 AudioWorklet for vehicle engine sim

**Coverage in BROWSER_RUNTIME_PRIMITIVES.** Already named there. Re-
framing here: with the ground-vehicle direction now leading the
campaign (cycles #4, #6, #8, #9), the AudioWorklet engine-sim use case
is suddenly load-bearing for the M151 + tank chassis cycles. The
existing footstep DSP at `src/systems/audio/FootstepSynthesis.ts`
is a known pattern; engine DSP is a strict extension of it.

**Position.** Tier B. Could slot in as a sub-task of VEKHIKL-3 or as
an interstitial 1-task cycle between VEKHIKL cycles.

### 6.6 Mobile-first variant compilation

Same as §5.1.

---

## 7. Adoption ladder

The 12-cycle campaign is the active commitment. This memo's bets
slot in after it lands.

### Tier A (ship within 2 cycles of campaign close)

1. **PWA install + service-worker prebake cache** (§2.1).
2. **SharedArrayBuffer-flavoured worker buffers** (§5.7) — terrain +
   navmesh worker pools.
3. **GPU timestamp queries** (§4.3) — pairs with this campaign's
   `render-bucket-telemetry-fix`.
4. **Itch.io browser-embed** (§2.4) — half-day distribution add.

### Tier B (next 3-6 months, depending on owner focus)

1. **Per-device-tier TSL graph compilation** (§5.1, §6.1).
2. **WebGPU subgroups POC** (§4.1) — paired with DEFEKT-3 cycle #3.
3. **OPFS prebake cache** (§5.5) — paired with PWA work.
4. **View Transitions API for UI polish** (§5.4).
5. **AudioWorklet vehicle engine sim** (§6.5) — paired with VEKHIKL.

### Tier C (6-12 months, larger commitment)

1. **Tauri 2 desktop wrap** (§2.2) — once the game is worth distributing.
2. **Storage textures + GPU-driven indirect draw** (§4.2,
   `cycle-konveyer-12-...` queued).
3. **TSL ComputeNode particle pipelines** (§4.4).
4. **Engine extraction to `@tjengine/core`** (§3) — if owner
   commits to second 3D-game project.
5. **Worker physics** (§6.2) — pair with Rapier adoption decision.

### Tier D (when there's a triggering project direction)

1. **Capacitor + native mobile** (§2.3) — when mobile is a real
   product direction.
2. **WebTransport multiplayer** (§5.2) — when multiplayer is on the
   roadmap.
3. **WebCodecs replay/spectate** (§5.3) — paired with multiplayer.
4. **Discord activity** (§2.5) — paired with multiplayer.
5. **Volumetric clouds / 3D fog** (§4.5) — paired with VODA cloud-
   fidelity direction.
6. **Steam release** — paired with Tauri base.

---

## 8. Concrete cycle proposals (post-campaign-close)

For the orchestrator to dispatch once the active 12-cycle campaign
lands. Each is shaped to one user-observable gap, fits Phase 0
discipline.

### Proposal A: `cycle-pwa-and-prebake-cache`

Single round. Three tasks.

- `pwa-manifest-and-icons` — `manifest.json`, icon set, splash screens,
  Vite plugin wiring.
- `service-worker-prebake-cache` — Workbox or hand-rolled SW; cache
  Vite bundle + prebaked heightmap/navmesh; cache versioning.
- `install-prompt-ui` — `BeforeInstallPromptEvent` handler + an
  "Install game" entry in the menu.

Files touched: `public/manifest.json` (new), `src/sw/service-worker.ts`
(new), `vite.config.ts`, `src/ui/menus/MainMenu.tsx`.

Closes: a real user-facing distribution gap. Enables offline play.

### Proposal B: `cycle-gpu-timestamp-attribution`

Single round. Two tasks.

- `gpu-timestamp-query-surface` — Expose `WebGPURenderer.getRenderInfo()`
  timestamps through `RendererBackend` to `FrameTimingTracker`.
- `per-pass-attribution-hud` — Surface per-pass GPU time in the debug
  HUD (Shift+\ overlay).

Closes the "GPU cost is dark" gap the
`mobile-startup-and-frame-budget.md` R1 memo flagged. Pairs with
cycle #2's `render-bucket-telemetry-fix`.

### Proposal C: `cycle-sab-worker-pipeline`

Single round. Two tasks.

- `sab-terrain-worker-buffers` — Terrain worker pool migrates from
  transferable ArrayBuffer (zero-copy, invalidates sender) to
  SharedArrayBuffer (shared between main + worker, requires
  Atomics for safety).
- `sab-navmesh-tile-buffers` — Same for navmesh worker.

Closes a frame-time stability gap (main thread waiting on worker
ArrayBuffer round-trip). Cheap because COOP/COEP is already set.

### Proposal D: `cycle-tsl-tier-detection-and-variants`

Two rounds, 4-5 tasks.

- R1: `gpu-tier-detection` — `navigator.gpu.requestAdapter` adapter-
  info parsing into a `GpuTier` enum (mobile / low / mid / high).
- R1: `terrain-tsl-mobile-variant` — Compile a flat-only, 4-biome,
  triplanar-disabled variant of `TerrainMaterial` for the mobile tier.
- R2: `material-cache-by-tier` — Material cache keyed by tier so the
  compile only happens once.
- R2: `tier-override-flag` — `?gpuTier=mobile|mid|high` for testing.

Closes the next mobile-perf gap after cycle #2 (which fixes the
common-case fallback; this adds tier-tailored compilation).

---

## 9. Risk and gating

For all of the above:

- **Don't fragment the campaign.** The active 12-cycle queue is
  committed. Proposals here slot in *after* cycle #12 baseline-refresh,
  or as interstitial single-task cycles between major directions.
- **Don't extract the engine until it has a second consumer.**
  Premature extraction is a known cost trap; the owner's broader 3D-
  game portfolio is the trigger, not internal pressure.
- **Don't ship Tauri without Steam intent.** A desktop binary
  without a distribution story (Steam, itch, owner's site) is overhead
  without payoff.
- **Don't ship Capacitor without a mobile-tuning campaign first.**
  Cycle #2 is the start; before App Store submission, the project
  needs 1-2 more mobile-specific cycles plus content/age-gate work.
- **Multiplayer is a 12-cycle commitment of its own.** Don't open the
  WebTransport door until the owner is ready to commit a campaign
  to it.

---

## 10. Housekeeping the user explicitly requested (2026-05-16)

Surfacing items the user named in the "do some housekeeping" prompt
that aren't memo content:

### 10.1 Stale worktrees holding merged-PR branches

`git worktree list` shows 11 locked worktrees as of 2026-05-16
post-cycle-#1-close + cycle-#2-R1-dispatch. Of these:

| Worktree branch | Status | Action |
|---|---|---|
| `task/sky-dome-tonemap-and-lut-resolution` | merged (#208) | safe to prune |
| `task/sky-hdr-bake-restore` | merged (#210) | safe to prune |
| `task/sky-sun-disc-restore` | merged (#209) | safe to prune |
| `task/mobile-renderer-mode-truth` | merged (#203, prior cycle) | safe to prune |
| `task/tsl-shader-cost-audit` | merged (#204, prior cycle) | safe to prune |
| `task/sky-visual-and-cost-regression` | merged (#205, prior cycle) | safe to prune |
| `task/mobile-startup-and-frame-budget` | merged (#206, prior cycle) | safe to prune |
| `task/webgl-fallback-pipeline-diff` | merged (#207, prior cycle) | safe to prune |
| `task/terrain-tsl-biome-early-out` | open PR #213 | KEEP |
| `task/terrain-tsl-triplanar-gate` | open PR #211 | KEEP |
| `task/render-bucket-telemetry-fix` | open PR #212 | KEEP |

8 prunable worktrees × ~1 GB node_modules + artifacts each ≈ 8 GB of
recoverable local disk. Pruning command (run once the orchestrator
isn't depending on agent-continuation against any of them):

```powershell
git worktree remove --force C:/Users/Mattm/X/games-3d/terror-in-the-jungle/.claude/worktrees/agent-a57d3c3eb19a0b0e2
# ...repeat for the 7 other agentId paths from `git worktree list`
git branch -D task/sky-dome-tonemap-and-lut-resolution task/sky-hdr-bake-restore task/sky-sun-disc-restore task/mobile-renderer-mode-truth task/tsl-shader-cost-audit task/sky-visual-and-cost-regression task/mobile-startup-and-frame-budget task/webgl-fallback-pipeline-diff
```

Remote branches (`origin/task/*`) are still alive on GitHub; pruning
them is a separate decision (`gh api -X DELETE
repos/matthew-kissinger/terror-in-the-jungle/git/refs/heads/task/...`).
Leaving them on remote for audit is the safer default.

### 10.2 mobile-ui CI timeout flake (3-for-3 on cycle #1)

The BACKLOG retro nit "mobile-ui CI timeout 25→30 min headroom" hit
all three cycle #1 PRs at exactly the 30-min boundary (cancelled, not
failed-on-test). Master is unprotected so it doesn't block merge, but
the noise wastes 90 minutes of CI minutes per round and adds visual
red to PR pages. Fix is a one-line bump in
`.github/workflows/ci.yml` `timeout-minutes` from 30 → 40 (or
investigate the underlying mobile-ui job's actual runtime budget).
Worth bundling into the next CI-touch cycle.

### 10.3 `cycle-validate.ts` slug shape mismatch (FIXED in this pass)

Script regex previously enforced `cycle-YYYY-MM-DD-<slug>` only; the
post-WebGPU campaign manifest introduced bare `cycle-<slug>` form
(e.g. `cycle-sky-visual-restore`). Validator rejected those, leaving
the orchestrator's close-validation gate effectively bypassed for the
whole 12-cycle queue. **Fixed in this session** by widening the regex
to accept both shapes with an inline comment explaining the two
conventions (commit accompanying this memo).

### 10.4 Pre-existing docs-lint failure

`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md`
is missing the `Last verified:` header that `npm run lint:docs`
enforces. Pre-dates this session; flag in next docs-touch cycle.

---

## 11. References

- [BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
  — companion CPU/memory/audio inventory.
- [POST_KONVEYER_MIGRATION_2026-05-13.md](POST_KONVEYER_MIGRATION_2026-05-13.md)
  — milestone memo capping KONVEYER.
- [MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
  — the alignment memo driving the active campaign.
- [GROUND_VEHICLE_PHYSICS_2026-05-13.md](GROUND_VEHICLE_PHYSICS_2026-05-13.md)
  — Rapier adoption gates.
- [TANK_SYSTEMS_2026-05-13.md](TANK_SYSTEMS_2026-05-13.md) —
  Rust→WASM ballistic-solver pilot brief.
- [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md) —
  "keep the stack" stance + ground-vehicle addendum.
- [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  — active 12-cycle queue.
- [docs/INTERFACE_FENCE.md](../INTERFACE_FENCE.md) — fence rules
  underpinning the engine-extraction proposal.
