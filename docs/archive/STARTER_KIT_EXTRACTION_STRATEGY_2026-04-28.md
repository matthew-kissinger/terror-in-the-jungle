# Starter Kit Extraction Strategy

Date: 2026-04-28

Related report: `docs/SYSTEM_PACKAGEABILITY_AUDIT_2026-04-28.md`

Close-out status: implemented as sibling repo
`C:\Users\Mattm\X\games-3d\game-field-kits` with initial local commit
`71e2da4 chore: bootstrap starter-kits incubation repo` and agnostic rename
commit `a7b71f1 chore: rename incubation workspace to game field kits`. TIJ
consumes the Wave 1 packages through local `file:` dependencies, now under the
`@game-field-kits/*` package scope. This document now serves as the strategic
extraction rationale; the active package registry, maturity states, CI, and
browser-smoke tooling live in the sibling repo.

## Purpose

This document turns the packageability audit into a practical product and
engineering plan.

The target is not a monolithic "Terror in the Jungle engine." The target is a
library of reusable game-development starting points:

- small primitive packages where the code is genuinely reusable;
- starter kits where the value is the integrated vertical slice;
- templates where a dev should copy/fork a working scene and replace content;
- recipes where the useful artifact is the integration path, not a package;
- reference implementations where the current system is valuable but too
  product-specific to publish as an API.

The working thesis is simple: many systems in this repo implement known game
and Three.js patterns, but the value is that they are integrated, tested in a
real browser game, and backed by validation scripts. Packaging should preserve
that integration value without exporting the current coupling.

## Product Framing

The clearest name for this effort is a starter-kit library, not an engine.

An engine implies one coherent runtime that owns the whole application. That is
not where this codebase is today, and trying to force it there would create a
large rewrite.

A starter-kit library is more honest:

- Each kit solves one recognizable development problem.
- Each kit includes code, examples, tests, and integration notes.
- Some kits depend on Three.js or Vite directly.
- Some kits are copy/fork templates instead of npm packages.
- Each kit can mature into a package after repeated reuse proves the API.

This is a good fit for an intermediate-dev plus agentic workflow because it
does not require every boundary to be perfect on day one. It makes the
boundaries explicit, gives agents smaller scopes, and lets working patterns
graduate only when they have earned it.

## Artifact Types

### Primitive Package

A primitive package is a small, reusable library with a narrow API.

Examples:

- scheduler;
- event bus;
- model draw-call optimizer;
- generic effect pool;
- terrain height provider utilities;
- airframe physics core.

Rules:

- No imports from game-specific systems.
- No process-global singleton as the exported API.
- Constructed through factories or classes.
- Tests run without booting the game.
- Example scene or usage snippet included.

Use this when the abstraction is already clear.

### Adapter Package

An adapter package binds a primitive to a common runtime such as Three.js.

Examples:

- Three.js model optimizer;
- Three.js analytic atmosphere adapter;
- Three.js pooled visual effects;
- Three.js terrain render helper.

Rules:

- Runtime dependency is explicit.
- App-specific policy stays outside the adapter.
- Renderer mutation should be opt-in and isolated.

Use this when a primitive needs a host framework but should not know the app.

### Starter Kit

A starter kit is a working vertical slice intended to be forked, copied, or
used as a reference for integration.

Examples:

- analytic atmosphere starter;
- terrain plus height-query starter;
- combat AI starter;
- vehicle flight starter;
- animated impostor starter.

Rules:

- It can include multiple primitives and adapters.
- It should boot as a real example.
- It should include validation scripts and screenshots where relevant.
- It can be opinionated.
- It should name what is replaceable and what is core.

Use this when the integration pattern is more valuable than a tiny API.

### Template

A template is a new-project starting point.

Examples:

- `vite-three-app-template`;
- `vite-three-atmosphere-template`;
- `vite-three-terrain-template`;
- `vite-three-combat-prototype-template`.

Rules:

- Minimal app shell.
- Clear dev commands.
- No TIJ content, factions, names, or deployment assumptions.
- Designed for quick cloning rather than deep library reuse.

Use this when a developer wants a clean repo to begin from.

### Recipe

A recipe is documentation plus small code fragments.

Examples:

- integrate sky-driven fog into an existing Three renderer;
- migrate from a static skybox to an analytic sky dome;
- convert direct UI system imports into presentation snapshots;
- validate a Cloudflare Pages deployment with an asset manifest.

Rules:

- Problem-oriented.
- Small enough to read in one sitting.
- Includes failure modes and validation commands.

Use this when the value is the path, not the code.

### Reference Implementation

A reference implementation is a working system that is not ready to package.

Examples:

- current `CombatantSystem`;
- current `PlayerController`;
- current `HUDSystem`;
- current `GameModeManager`;
- current `TerrainSystem`;
- current air support runtime.

Rules:

- Do not pretend it is a package.
- Keep it as proof that the pattern can work.
- Mine it for primitives.
- Use it to write recipes.

Use this when the system is valuable but entangled.

## Graduation Model

A system should move through these states:

1. Reference implementation.
2. Extracted primitive inside the app.
3. App-local package folder.
4. Starter kit with example scene.
5. Public package or template.

Skipping states is allowed only for small infrastructure that already has a
clean boundary.

The main graduation question is not "is this code clever?" The question is:

Can another developer use this without importing the game?

If the answer is no, it is still a reference implementation or starter kit.

## Naming Guidance

Avoid names that imply more novelty or completeness than the code has.

Good naming:

- `three-analytic-atmosphere`
- `three-preetham-atmosphere-kit`
- `three-model-optimizer`
- `three-effect-pool`
- `terrain-height-core`
- `airframe-core`
- `browser-game-probes`
- `vite-three-game-template`

Risky naming:

- `engine`
- `HosekWilkie` when the implementation is Preetham-style;
- `ECS combat engine` before the storage decision is made;
- `terrain engine` before the terrain stack is split;
- `AI engine` when the current AI is tied to live combat objects.

The rule: describe what the artifact gives the user today.

## Extraction Principles

### Keep Working Game Code Working

Do not start with a giant repo restructure. Extract from the inside out.

The game remains the proving ground. Packages exist to preserve and reuse
working patterns, not to pause the game until the architecture is perfect.

### Package Behavior, Not Folder Names

Folder boundaries are not package boundaries. A package boundary is defined by:

- imports;
- ownership;
- data shape;
- tests;
- examples;
- validation commands.

If a folder imports combat, player, UI, world state, and renderer globals, it is
not a package boundary.

### Prefer Ports Over Concrete Systems

Packages should depend on capability surfaces:

- `TerrainQueryPort`;
- `SkyRuntimePort`;
- `AudioPort`;
- `AssetManifestPort`;
- `PresentationSnapshot`;
- `InputCommandSource`;
- `RandomSource`;
- `Clock`.

Packages should not depend on:

- `CombatantSystem`;
- `PlayerController`;
- `HUDSystem`;
- `GameModeManager`;
- `ZoneManager`;
- `SystemManager`.

### Factories Over Singletons

A package should let the consuming app create an instance.

Good:

```ts
const bus = createEventBus<GameEvents>();
const scheduler = createScheduler();
const cache = createHeightQueryCache(heightProvider);
```

Bad:

```ts
GlobalEventBus.emit(...);
HeightQueryCache.setProvider(...);
spatialGridManager.setGrid(...);
```

App-level singleton wrappers are fine inside the game, but package exports
should be instance-based.

### Examples Are Part Of The Product

For this effort, the example matters as much as the package.

Every package or starter kit should include:

- a minimal scene;
- setup instructions;
- one or more behavior tests;
- a validation command;
- screenshots or text probe output when visual behavior matters.

This is where the repo's existing validation culture can become a real
differentiator.

### Keep Art And Policy Local

Reusable code should not carry TIJ-specific content.

Keep these in app-local config or examples:

- Vietnam War factions;
- A Shau labels;
- Pixel Forge faction/clip names;
- current weapon names;
- Cloudflare Pages project names;
- game-mode presets;
- HUD copy;
- win/loss/ticket policy.

The package can provide slots for those decisions.

### Do Not Export Transitional Workarounds

Some code exists because this game had to survive drift.

Before packaging, ask:

- Is this a general pattern?
- Is this a compatibility shim?
- Is this a bug workaround?
- Is this a policy decision specific to TIJ?

Only the first category should become a package.

## Proposed Repository Shape

The recommended home is a sibling incubation monorepo, not a nested submodule
inside TIJ.

Proposed path:

```text
C:\Users\Mattm\X\games-3d\game-field-kits\
```

Working term:

- sibling repo;
- incubation monorepo;
- package/kits workspace.

Why not keep it all inside `terror-in-the-jungle`:

- TIJ is the proving ground and product repo. It should not become the public
  package workspace by accident.
- Package/kits work will have its own cadence, examples, docs, and CI.
- Parallel agents can work in the kits repo without touching game code or
  untracked asset handoff folders.
- Public naming, package metadata, and starter docs can evolve without implying
  the game repo itself is an engine.

Why not use a Git submodule at first:

- Submodules add operational friction for humans and agents.
- They make branch/commit state easier to misunderstand.
- They are useful only after both sides are stable enough to need pinned
  cross-repo revisions.

Why a sibling repo first:

- clean parallel development;
- independent history;
- independent CI;
- easy future publishing;
- lower risk to TIJ;
- still close enough on disk for local examples and file-based testing.

The sibling repo can be a monorepo/workspace containing packages, kits,
templates, examples, and recipes:

Suggested future layout:

```text
packages/
  event-bus/
  scheduler/
  three-model-optimizer/
  three-effect-pool/
  three-analytic-atmosphere/
  terrain-height-core/
  airframe-core/
  gunplay-core/

kits/
  atmosphere-starter/
  terrain-starter/
  vehicle-flight-starter/
  combat-ai-starter/
  animated-impostor-starter/

templates/
  vite-three-app/
  vite-three-atmosphere/
  vite-three-terrain/

examples/
  model-optimizer-viewer/
  atmosphere-cycle-viewer/
  terrain-height-provider-viewer/
  airframe-sandbox/

docs/recipes/
  sky-driven-fog.md
  terrain-query-port.md
  ui-presentation-snapshots.md
  browser-runtime-probes.md
```

Do not create all of this at once. The layout is a north star, not a first PR.

## Parallel Development Model

TIJ remains the source-of-truth proving ground until a package or kit is
validated outside the game.

Recommended workflow:

1. Identify a candidate in TIJ.
2. Copy the smallest useful slice into the sibling kits repo.
3. Remove TIJ-specific names, assets, and policy.
4. Add a minimal example and tests in the kits repo.
5. Back-port only the clean API shape to TIJ if it improves the game.
6. When stable, decide whether TIJ consumes the package or keeps an app-local
   implementation with the same contract.

Avoid forcing TIJ to consume a half-baked local package too early. During the
incubation phase, it is acceptable for the kits repo to copy a primitive and
prove it independently. Once the API stabilizes, TIJ can depend on it through:

- a local workspace link during development;
- a private package version;
- a Git tag;
- or a future package registry publish.

The key is that package work should not block game work. Game fixes can keep
shipping while the reusable artifact matures next door.

## Cross-Repo Sync Rules

Every extraction should record provenance:

- source TIJ commit;
- source files;
- intentional deletions;
- renamed concepts;
- removed TIJ-specific policy;
- behavior tests copied or rewritten;
- validation commands.

Suggested provenance block in every package README:

```md
## Provenance

Extracted from Terror in the Jungle at commit <sha>.
Original source files:

- src/...

Changed during extraction:

- removed TIJ scenario names;
- replaced singleton with factory;
- split renderer adapter from state model.
```

For parallel agents:

- one agent may work in TIJ on game correctness;
- one agent may work in `game-field-kits` on package shape;
- integration happens through a short sync note, not through simultaneous edits
  to the same files;
- no generated package output should be copied back into TIJ without a targeted
  review.

## When To Split Into More Repos

Start with one sibling monorepo. Split later only if there is a real reason:

- package has external users;
- CI cost becomes too high;
- release cadence differs sharply;
- ownership differs;
- examples/templates overwhelm package code.

Potential future split:

```text
game-field-kits/        # templates, examples, recipes
game-field-packages/     # small npm packages
browser-game-probes/     # browser validation harnesses
```

Do not split early. Early split creates coordination work before APIs are known.

## Candidate Roadmap

### Phase 0: Baseline And Guardrails

Goal: stop making future extraction harder.

Deliverables:

- dependency graph baseline;
- cycle report;
- forbidden-import rules for future package candidates;
- package-readiness checklist;
- naming glossary.

Validation:

- graph script runs locally;
- current violations are baselined, not all fixed immediately;
- new violations can be detected.

### Phase 1: First Low-Risk Primitive Packages

Goal: prove extraction mechanics without destabilizing gameplay.

Candidates:

- `three-model-optimizer`;
- `three-effect-pool`;
- `scheduler`;
- `event-bus`;
- `ui-core`.

Why these first:

- small APIs;
- useful outside TIJ;
- lower product/gameplay risk;
- easy to test without a full match.

Exit criteria:

- package builds independently;
- tests pass independently;
- TIJ consumes either the package or an app-local equivalent through the same
  public API;
- example scene exists for visual packages.

### Phase 2: Starter Kits From Working Vertical Slices

Goal: preserve integrated value without pretending the APIs are final.

Candidates:

- `atmosphere-starter`;
- `terrain-height-starter`;
- `vehicle-flight-starter`;
- `browser-probe-starter`;
- `animated-impostor-starter`.

Exit criteria:

- each kit boots independently;
- each kit has a "replace this" section;
- each kit has a validation command;
- each kit avoids TIJ-specific product names except in provenance notes.

### Phase 3: Ports Layer

Goal: make future packages communicate through stable capability interfaces.

Deliverables:

- `TerrainQueryPort`;
- `SkyRuntimePort`;
- `RendererLightingPort`;
- `PresentationSnapshot` shapes;
- `VehicleSessionPort`;
- `CombatReadModel`;
- `ObjectiveReadModel`;
- `AssetManifestPort`.

Exit criteria:

- no imports from concrete game systems;
- DTOs are serializable unless a Three.js type is deliberately part of the API;
- at least one existing system consumes a port through an adapter.

### Phase 4: Terrain, Atmosphere, And Asset Runtime Kits

Goal: package the systems that most clearly demonstrate known pattern plus
working integration.

Candidates:

- `terrain-height-core`;
- `three-analytic-atmosphere`;
- `asset-manifest-runtime`;
- `animated-impostor-runtime`.

Exit criteria:

- terrain query authority is instance-based;
- atmosphere state and renderer mutation are split;
- asset schemas are game-agnostic;
- visual examples include screenshots or browser probes.

### Phase 5: Vehicle And Gunplay Cores

Goal: extract reusable feel/math systems only after product validation.

Candidates:

- `airframe-core`;
- `vehicle-session`;
- `gunplay-core`;
- `camera-rig-core`.

Exit criteria:

- human playtest decisions are recorded for flight feel;
- airfield/surface authority is resolved;
- gunplay package is separated from HUD/combat/audio;
- examples show keyboard/mouse and programmatic control.

### Phase 6: Combat AI As Starter Kit, Not Library

Goal: use current combat as a learning/product artifact while avoiding false
cleanliness.

Deliverables:

- `combat-ai-starter`;
- recipe for tactical AI update cadence;
- recipe for actor snapshots and presentation isolation;
- data-oriented/ECS spike result.

Exit criteria:

- no claim that current `CombatantSystem` is a reusable package;
- starter demonstrates AI loop, spatial queries, LOD cadence, damage, and
  debug probes on a small map;
- high-scale combat package decision waits for storage architecture.

## Candidate Artifacts

### `three-model-optimizer`

Type: primitive plus Three.js adapter.

Source:

- `src/systems/assets/ModelDrawCallOptimizer.ts`

Value:

- known problem: static model draw-call reduction;
- real game integration through world features;
- good first package because it is focused.

Package API:

```ts
optimizeStaticModel(root, {
  strategy: 'merge' | 'batched-mesh' | 'none',
  preserveNode: (node) => boolean,
  materialKey: (material) => string,
});
```

Keep app-local:

- airfield placement;
- vehicle rotor preservation policy;
- TIJ asset catalogs.

Starter/example:

- load a GLB;
- visualize before/after draw calls;
- toggle preserve predicates.

### `three-analytic-atmosphere`

Type: adapter package plus starter kit.

Source:

- `AtmosphereSystem`;
- `HosekWilkieSkyBackend`;
- `ScenarioAtmospherePresets`;
- `WeatherAtmosphere`.

Honest framing:

- This is a Preetham-style analytic skydome integration today, now rendered
  through a generated texture on a standard Three material.
- The reusable value is sky/sun/fog/light/weather agreement, not a novel sky
  model.

Package split:

- `AnalyticSkyBackend`: sky dome and CPU samples.
- `AtmosphereState`: sun direction, sun color, zenith, horizon, cloud coverage.
- `ThreeAtmosphereAdapter`: optional renderer/light/fog mutation.
- `WeatherIntent`: fog darken, underwater override, cloud target.

Keep app-local:

- scenario names;
- A Shau/Open Frontier/TDM/Zone Control presets;
- water policy;
- shadow follow policy if tied to the player camera.

Starter/example:

- day/night cycle scene;
- sky-driven fog scene;
- weather transition scene;
- water reflection sun-vector example.

Validation:

- color sample tests;
- no NaN/Inf over presets;
- fog follows horizon sample;
- weather intent does not directly own fog color;
- screenshot probe for several sun angles.

### `scheduler`

Type: primitive package.

Source:

- `SimulationScheduler`;
- parts of `SystemUpdateSchedule`.

Value:

- known pattern: cadence-based update groups;
- useful for AI, LOD, terrain streaming, and expensive probes.

Package API:

```ts
const scheduler = createScheduler({
  groups: {
    frame: { cadence: 'every-frame' },
    ai: { cadence: 'fixed-step', hz: 10 },
    expensive: { cadence: 'interval', ms: 250 },
  },
});
```

Keep app-local:

- TIJ phase names;
- concrete system registry;
- gameplay budgets.

### `event-bus`

Type: primitive package.

Source:

- `GameEventBus`.

Value:

- typed event delivery with explicit flush;
- strong fit for browser game loops and tests.

Required cleanup:

- export factory, not singleton;
- make event map generic;
- keep app singleton wrapper in TIJ.

### `three-effect-pool`

Type: primitive plus Three.js adapter.

Source:

- `EffectPool<T>`;
- tracer/impact/explosion pools as examples.

Value:

- known performance pattern, implemented in a real combat game.

Package API:

```ts
const pool = createEffectPool({
  create: () => new TracerEffect(),
  reset: (effect, args) => effect.reset(args),
  dispose: (effect) => effect.dispose(),
  maxSize: 256,
});
```

Keep app-local:

- weapon-specific colors;
- explosion art;
- smoke gameplay rules.

### `ui-core`

Type: primitive package.

Source:

- `UIComponent`;
- `FocusTrap`;
- responsive utilities after singleton cleanup;
- lightweight state/effect cleanup patterns.

Value:

- useful for small game UIs that need lifecycle hygiene without a full UI
  framework.

Keep app-local:

- HUD;
- minimap;
- full map;
- touch controls;
- game mode screens.

Starter/example:

- menu/screen stack;
- overlay with focus trap;
- responsive HUD shell.

### `terrain-height-core`

Type: primitive package.

Source:

- height providers;
- stamped height provider;
- terrain stamp grid baker;
- slope/normal helpers.

Value:

- reusable terrain data and query layer;
- low-risk first terrain extraction.

Required cleanup:

- no global query cache;
- explicit provider instances;
- no world feature imports.

Keep app-local:

- CDLOD renderer initially;
- vegetation scatter;
- A Shau DEM asset policy;
- airfield feature compilation.

### `terrain-starter`

Type: starter kit.

Value:

- shows how to combine height providers, streaming/render, raycast, and
  gameplay queries.

Should include:

- flat/noise/DEM provider examples;
- height query probe;
- simple player/camera movement;
- optional CDLOD once split enough;
- validation screenshot.

Do not over-package:

- current `TerrainSystem` should remain reference implementation until split.

### `airframe-core`

Type: primitive package after validation.

Source:

- `Airframe`;
- control/state math around fixed-wing sim.

Value:

- high-value reusable sim core;
- stronger than much of the surrounding vehicle code.

Prerequisites:

- human flight-feel sign-off;
- airfield surface authority resolved;
- no dependency on HUD/player/scene graph.

Starter/example:

- simple runway;
- scripted takeoff;
- manual control mode;
- telemetry panel;
- deterministic browser probe.

### `vehicle-flight-starter`

Type: starter kit.

Value:

- integrated input, camera, airframe, terrain probe, and HUD telemetry.

This should be a kit before it is a package because flight feel is an
integration problem.

### `gunplay-core`

Type: primitive package.

Source:

- shot command builder;
- gunplay core;
- recoil/spread/ammo math.

Value:

- reusable shooter mechanics without scene/HUD/combat coupling.

Keep app-local:

- first-person weapon mesh;
- HUD ammo widgets;
- combat damage application;
- audio/effects.

### `combat-ai-starter`

Type: starter kit and reference implementation.

Source:

- current combat AI, spatial, LOD, targeting, damage, and render snapshot work.

Value:

- known patterns implemented together:
  - actor state;
  - faction targeting;
  - update cadence;
  - spatial queries;
  - LOS/raycast budget;
  - LOD throttling;
  - debug probes.

Do not package as:

- `combat-engine`;
- `ai-engine`;
- `3000-agent-sim`.

Why:

- current combat is still in the largest runtime cycle;
- object-map storage may not match the 3,000-agent target;
- UI/world/player imports are too strong.

Starter shape:

- small standalone arena;
- 20-100 actors;
- DTO-based terrain and objective inputs;
- text probe and visual debug overlay;
- clear notes about what was simplified from TIJ.

### `animated-impostor-starter`

Type: starter kit first, possible runtime package later.

Source:

- Pixel Forge NPC package concepts;
- animated impostor metadata;
- current NPC render LOD contract.

Value:

- practical path for close/mid GLBs and far animated impostors.

Keep app-local:

- faction names;
- weapon names;
- TIJ asset manifests;
- review-only assets.

Validation:

- parse manifest;
- load sidecars;
- validate atlas chroma/alpha;
- screenshot close/mid/far transitions.

### `browser-game-probes`

Type: recipe and starter kit first.

Source:

- fixed-wing probe;
- atmosphere evidence;
- HUD/state/mobile checks;
- `window.advanceTime(ms)`;
- `window.render_game_to_text()`.

Value:

- this may be one of the most distinctive parts of the repo.
- agentic workflows need deterministic browser evidence.

Do not package too early:

- current scripts reach into private engine state.

Starter shape:

- minimal browser game with probe hooks;
- Playwright script;
- text render contract;
- screenshot capture;
- console/error gate;
- artifact summary JSON.

## Package Readiness Checklist

A candidate can become a package when all are true:

- It has no imports from `src/systems/combat`, `src/systems/player`,
  `src/systems/world`, or `src/ui` unless that import is explicitly the
  package itself.
- It exports factories/classes, not only process-global singletons.
- It has a public API that can be explained in one page.
- It has behavior tests that run without booting TIJ.
- It has one minimal example.
- It has a validation command.
- It has a README with:
  - what it solves;
  - what it does not solve;
  - integration steps;
  - known limitations;
  - migration notes from TIJ if relevant.
- It does not include TIJ-specific names, factions, scenarios, assets, or
  deployment policy except in examples clearly marked as provenance.

## Starter Kit Readiness Checklist

A candidate can become a starter kit when all are true:

- It boots independently.
- It shows the full vertical slice.
- It includes a "replace these pieces" section.
- It includes a "keep these contracts" section.
- It includes at least one test or probe.
- It includes screenshots or an artifact if visual behavior matters.
- It documents expected performance envelope.
- It names what is known pattern versus custom glue.
- It does not claim to be a generic library if it still expects copy/fork use.

## Recipe Readiness Checklist

A recipe is ready when it answers:

- What problem does this solve?
- What files or systems does a developer need?
- What is the smallest integration path?
- What mistakes did TIJ make that others should avoid?
- How do you validate the result?
- When should a developer choose an off-the-shelf implementation instead?

## Anti-Patterns To Avoid

### Publishing A Tangle

If a package needs `PlayerController`, `HUDSystem`, `CombatantSystem`, and
`GameModeManager`, it is not a package. It is the game.

### Over-Claiming Novelty

It is fine that many systems implement known patterns. Say that directly.

The useful pitch is:

> proven integration of known browser game patterns with tests, probes, and
> examples.

### Hiding App Policy In Libraries

Do not bake A Shau, Vietnam factions, Cloudflare project names, or Pixel Forge
approval state into packages.

### Extracting Before Ownership Is Clear

If two systems still both believe they own the same state, packaging will make
that conflict harder to fix.

Examples:

- terrain query authority;
- airfield surface authority;
- combat spatial storage;
- HUD presentation state;
- weather versus atmosphere color control.

### Treating Tests As The Product

Tests help, but the kit's real value is an understandable working example. A
package with tests and no example will not help the target developer enough.

## Documentation Set To Create

Recommended follow-up docs:

- `docs/recipes/sky-driven-fog.md`
- `docs/recipes/model-draw-call-optimization.md`
- `docs/recipes/height-query-port.md`
- `docs/recipes/effect-pooling.md`
- `docs/recipes/ui-presentation-snapshots.md`
- `docs/recipes/browser-runtime-probes.md`
- `docs/package-readiness-checklist.md`
- `docs/package-candidate-index.md`

Do not move these into `docs/AGENT_ORCHESTRATION.md`; this is product and
architecture strategy, not orchestration policy.

## First Three Concrete Work Items

### Work Item 1: Package Candidate Index - Done

Created in the sibling repo as `docs/package-candidate-index.md` plus the
machine-readable `docs/incubation-registry.json`. The index records:

- artifact type;
- source files;
- owner/dependency risks;
- readiness score;
- next extraction step.

This keeps future agents from rediscovering the same boundaries.

### Work Item 2: `three-model-optimizer` Spike - Done

Extracted as `@game-field-kits/three-model-optimizer` in the sibling repo and
backported into TIJ through the existing `ModelDrawCallOptimizer` wrapper.

It remains private/local and is consumed through a local `file:` dependency.

Acceptance:

- package tests pass;
- TIJ typecheck passes;
- example viewer reports before/after draw calls;
- browser smoke covers the visual example.

### Work Item 3: `three-analytic-atmosphere` Starter - Done As Starter

Implemented as `kits/atmosphere-starter` in the sibling repo. It proves:

- sky dome;
- sun direction;
- horizon/zenith sampling;
- fog color sync;
- weather darken intent;
- screenshot probe at dawn/noon/dusk.

Acceptance:

- the example boots without TIJ;
- tests prove color samples are finite and reactive;
- README is honest that the current model is Preetham-style;
- browser smoke covers desktop/mobile rendering.

## Strategic Read

This direction is realistic if the goal is to turn hard-earned integration work
into reusable development assets. It is not realistic if the goal is to
immediately publish a clean engine from the current repo.

The best near-term product is a set of primitive packages and starter kits that
say:

- here is the known pattern;
- here is a working implementation;
- here is the integration glue people usually miss;
- here is how to validate it;
- here is what not to copy.

That plays to the repo's strengths. The game has scope bloom, but it also has
real systems, real failure evidence, and real validation habits. The extraction
program should turn those into small reusable artifacts without pretending the
current vertical gameplay systems are already clean libraries.

