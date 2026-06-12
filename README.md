# Terror in the Jungle

[![CI](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/ci.yml)
[![Deploy](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/deploy.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Assets: CC BY-SA 4.0](https://img.shields.io/badge/assets-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-ASSETS)
[![Three.js](https://img.shields.io/badge/three.js-r184-black)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![WebGPU](https://img.shields.io/badge/WebGPU-TSL-005a9c)](https://www.w3.org/TR/webgpu/)

**A combined-arms Vietnam War sandbox that runs in your browser — where you hold a rifle and a radio at the same time.**

[▶ Play the live build](https://terror-in-the-jungle.pages.dev/) · [Vision](docs/ROADMAP.md) · [Current state](docs/state/CURRENT.md) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](#contributing)

---

## The idea

Most shooters make you choose: be the soldier, or be the commander. This is built on the bet that you shouldn't have to.

You drop into first-person infantry combat in the A Shau Valley, late 1960s. Then you pull up the tactical map — **in real time, no pause, no slowdown** — issue orders to your squad, and snap back to your iron sights while the fight keeps moving around you. Hold, Patrol, Attack Here, Fall Back. All of it under fire.

Underneath the game is the real ambition: a **war-simulation engine**, not a single level. The same systems that run an 8-versus-8 skirmish are architected to drive theater-scale combined arms. Vietnam is the first theater; the architecture generalizes to any war with its own factions, terrain, vehicles, and doctrine.

> **Honest scale claim:** the engine is architected for 3,000 combatants via
> materialization tiers; live-fire combat is verified at 120 NPCs while an ECS
> hot path is evaluated (Phase F). A Shau runs as a ~3,000-unit *strategic*
> simulation with selective materialization — not 3,000 simultaneous live
> combatants. The aspirational vision lives in [docs/ROADMAP.md](docs/ROADMAP.md);
> the verified, current truth lives in [docs/state/CURRENT.md](docs/state/CURRENT.md).

## What's in the box

- **Combined arms, one runtime.** Infantry, squads, and crew-served emplacements
  fight alongside helicopters (UH-1 Huey, UH-1C Gunship, AH-1 Cobra), fixed-wing
  aircraft (A-1 Skyraider, F-4 Phantom, AC-47 Spooky), armor (M48 Patton), and
  ground transport (M151 jeep) — with boarding, crews, enter/exit/eject,
  objectives, tickets, suppression, and grenades. All of it ships to production.
  (Watercraft are dormant pending the water-system rework.)
- **Command under fire.** RTS-style direct orders — Hold, Patrol, Attack Here,
  Fall Back, Stand Down — issued from minimap taps or the keyboard and
  dispatched to terrain-aware AI states. Plus an air-support radio: mark a
  target and call in napalm, a Spooky gunship orbit, a rocket run, or a B-52
  Arc Light strike that walks a twelve-bomb stick across the line. No
  time-stop; the war doesn't wait.
- **A living asset catalog.** 191 first-party low-poly models (weapons,
  aircraft, armor, buildings, animals) flow through a generated import
  pipeline — axis normalization, rig-joint grafts, triangle budgets — into a
  single catalog the whole engine consumes, with an in-engine `/gallery`
  review surface. Ambient wildlife (tiger, water buffalo, wild boar, macaque)
  wanders the jungle and flees on approach.
- **Real terrain.** A Shau Valley is built on real DEM elevation across a 21 km
  map, delivered through a Cloudflare R2 manifest with an explicit terrain/nav
  startup gate. If the data can't load, the mode says so — no silent fallback.
- **WebGPU-first rendering.** `master` ships Three.js r184 `WebGPURenderer` with
  TSL node materials across terrain, vegetation and NPC impostors, and a
  LUT-driven Hosek-Wilkie sky — with automatic WebGL2 fallback for browsers
  without WebGPU, and a strict WebGPU mode kept as the renderer-acceptance proof.
- **Atmosphere that holds its budget.** A unified day/night lighting rig drives
  sky, fog, clouds, terrain, foliage, and NPC impostors coherently through the
  full time-of-day cycle (gated by a standing coherence check), with total
  atmosphere CPU cost held under ~1 ms across all five modes.
- **Built to resist drift.** Fenced interfaces, a directive registry, and a
  CI doc-drift gate let one human and a fleet of coding agents collaborate
  without inventing duplicate authorities. Tests and docs are sensors, not truth
  — when a doc disagrees with the code, the code wins and the doc gets fixed.

## Playable modes

| Mode | Shape | Purpose |
| --- | --- | --- |
| **Zone Control** | Objective battle | Capture zones, drain enemy tickets. |
| **Team Deathmatch** | Fast combat loop | Infantry + vehicle combat smoke. |
| **Open Frontier** | Larger sandbox | Airfields, vehicles, helicopters, armor staging, 120-NPC perf checks. |
| **A Shau Valley** | Real-terrain strategic mode | ~3,000-unit strategic layer via materialization tiers on DEM-backed terrain; live combat verified at 120. |
| **AI Sandbox** | Configurable simulation | Observation, tuning, perf capture, combat diagnostics. |

## Controls

### Desktop — gameplay

| Input | Action |
| --- | --- |
| `WASD` | Move |
| Mouse | Look / aim |
| `Space` | Jump |
| `Shift` | Sprint |
| `F` | Board / exit ground & water vehicles (jeep, tank, sampan, PBR, emplacements) |
| `E` | Enter / exit aircraft (helicopter, fixed-wing) |
| `R` | Reload |
| `G` | Grenade |
| `M` | Map / squad command |

### Desktop — diagnostics & debug

| Input | Action |
| --- | --- |
| `` ` `` (backtick) | Toggle debug HUD registry |
| `Shift+\` | Six-overlay world debugger |
| `V` / `B` | Free-fly camera / entity inspector |
| `Backspace` | Pause / resume |
| `.` | Step one frame |
| `,` / `;` | Slow / fast time scale |
| `F9` | Playtest capture |
| `\` (single, dev-only) | Tweakpane live-tuning panel |

### Mobile

Virtual movement stick, touch look, touch fire/action buttons, and tactical-map
command dispatch — the squad-order surface is first-class on touch, not an
afterthought. Pointer-lock depends on the browser; Chrome/Edge/Firefox are the
primary FPS path, and embedded browsers fall back to unlocked mouse-look.

## Run locally

```bash
npm install
npm run doctor   # environment sanity (Node, deps, Playwright browsers)
npm run dev      # vite dev server
```

Requirements:

- **Node 24**, pinned in [.nvmrc](.nvmrc)
- A **WebGPU-capable browser** recommended (Chrome 113+ / Firefox 147+ /
  Safari 26+); WebGL2 fallback is automatic on older browsers
- Playwright browsers for validation scripts (`npx playwright install`)

Production-shaped local path:

```bash
npm run build
npm run preview
```

## Validation

Routine gate before any commit:

```bash
npm run validate:fast        # typecheck + lint + doc-drift + quick tests
```

Release gate (adds the combat120 perf capture):

```bash
npm run validate:full
```

Domain-specific gates:

```bash
npm run probe:fixed-wing     # A-1 / F-4 / AC-47 entry, climb, approach, bailout
npm run evidence:atmosphere  # all-mode sky / fog / cloud
npm run check:mobile-ui      # actionability + scroll on mobile viewports
npm run check:hud            # HUD layout
npm run perf:capture:combat120   # 90s combat sim, 120 NPCs, seed 2718
npm run check:doc-drift      # live docs ↔ real files / scripts / npm targets
npm run check:live-release   # 7-gate production-freshness proof
```

Game-feel changes still need a human pass through
[docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md). Automated probes are
necessary, not sufficient — they don't prove flight, infantry pacing, squad
command ergonomics, or UI feel is *good*.

## Tech stack

- [Three.js](https://threejs.org/) r184 — `WebGPURenderer` + TSL, WebGL2 fallback
- TypeScript 6.0 · Vite 8 · Vitest 4 (5,900+ tests across 396 files)
- Playwright 1.59 for browser-level probes
- [Recast Navigation](https://github.com/isaac-mason/recast-navigation-js) (WASM) for navmesh
- Tweakpane 4 (dev-only live tuning)
- **Cloudflare Pages** for the app shell · **Cloudflare R2** for large immutable
  runtime assets (DEM, navmesh, heightmaps)

Runtime architecture leans on CDLOD terrain, queue-and-flush eventing, object
pools for hot paths, seed-keyed prebaked navmesh/heightmap assets,
service-worker freshness control, and an explicit fenced-interface boundary at
[src/types/SystemInterfaces.ts](src/types/SystemInterfaces.ts).

## Repository map

| Path | Owns |
| --- | --- |
| [src/core](src/core) | Engine loop, system init, scheduler, runtime composition, time scale, metrics. |
| [src/systems/combat](src/systems/combat) | NPC state, AI, LOS, cover search, suppression, targeting, movement, LOD, damage, rendering. |
| [src/systems/navigation](src/systems/navigation) | Recast navmesh loading, static-tiled generation, path queries. |
| [src/systems/terrain](src/systems/terrain) | CDLOD terrain runtime, streamed height queries, terrain evidence. |
| [src/systems/vehicle](src/systems/vehicle) | Vehicle session authority, fixed-wing + ground models, adapters, airframe. |
| [src/systems/helicopter](src/systems/helicopter) | Helicopter models, physics, rotors, deployment. |
| [src/systems/environment](src/systems/environment) | Atmosphere, sky, clouds, weather, unified lighting rig. |
| [src/systems/airsupport](src/systems/airsupport) | Air-support radio call-ins: napalm, Spooky, rocket run, B-52 Arc Light. |
| [src/systems/world](src/systems/world) | World feature placement: firebases, airfields, settlements, parked armor. |
| [src/systems/wildlife](src/systems/wildlife) | Ambient ground wildlife (wander + flee). |
| [src/systems/player](src/systems/player) | Player controller, weapon rig, respawn manager, deploy flow. |
| [src/ui](src/ui) | HUD, controls, screens, icons, loading, deploy/respawn UI, tactical map. |
| [scripts](scripts) | Probes, perf capture, deploy helpers, evidence generation, `check:*` audit gates. |
| [docs](docs) | Vision, current state, directives, architecture, testing, deployment. |

## Documentation

Start here:

| Doc | Use it for |
| --- | --- |
| [docs/state/CURRENT.md](docs/state/CURRENT.md) | Verified current truth — read before making "what's real" claims. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | The vision, phase plan, and canonical scale sentence. |
| [docs/DIRECTIVES.md](docs/DIRECTIVES.md) | Active directive registry: status, owner, success criteria, evidence. |
| [AGENTS.md](AGENTS.md) | Daily loop, commands, conventions, hard rules. Agent-agnostic. |
| [CLAUDE.md](CLAUDE.md) | Claude-Code-specific harness (slash commands, subagents). |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, tick graph, coupling heatmap. |
| [docs/COMBAT.md](docs/COMBAT.md) | Combat ownership, AI, movement, LOD, scale rules. |
| [docs/TESTING.md](docs/TESTING.md) | Four-layer testing contract — read before adding tests. |
| [docs/perf/](docs/perf/) | Perf scenarios, capture workflow, baseline policy, regression playbook. |
| [docs/DEPLOY_WORKFLOW.md](docs/DEPLOY_WORKFLOW.md) | Cloudflare Pages / R2 deploy and cache verification. |

## Contributing

This is a live game repo built by one developer working alongside a fleet of
coding agents, so the rules optimize for **narrow, evidence-backed changes** that
many contributors can make in parallel without stepping on each other.

```bash
npm run validate:fast        # before any commit
```

Before larger or perf-sensitive work, also run the domain probe for the
subsystem you touched. Hard rules:

- Don't modify [src/types/SystemInterfaces.ts](src/types/SystemInterfaces.ts)
  without explicit approval — it's the fence boundary. Cross-fence accessor
  changes are ≤20 LOC/file and need `[interface-change]` in the PR title.
- PRs ≤500 LOC preferred; larger needs a stated rationale.
- No implementation-mirror tests — assert behavior, not internal names or tuning
  constants.
- Branch as `task/<descriptive-slug>`; first commit line
  `<type>(<scope>): <summary> (<slug>)`.
- If a doc disagrees with the code or runtime evidence, believe the evidence and
  fix the doc.
- **Licensing of contributions:** by submitting a contribution you agree to
  license your code under **AGPL-3.0-or-later** and any original assets under
  **CC BY-SA 4.0**, and you certify you have the right to do so. See
  [LICENSING.md](LICENSING.md).

## Deployment

Live: **<https://terror-in-the-jungle.pages.dev/>**

Deploys are **manual** via GitHub Actions — pushing `master` runs CI but does
*not* ship:

```bash
npm run deploy:prod          # gh workflow run deploy.yml --ref master --watch
npm run check:live-release   # 7-gate proof: head pushed, CI green, deploy green,
                             # live asset-manifest SHA, Pages headers, R2 DEM, browser smoke
```

See [docs/DEPLOY_WORKFLOW.md](docs/DEPLOY_WORKFLOW.md) for the full path.

## License

- **Source code** — [GNU AGPL-3.0-or-later](LICENSE). Because this game is served
  over a network, network use counts as distribution: if you run a modified
  version as a network service, its users are entitled to the corresponding
  source.
- **Original assets** (Matthew Kissinger's models, textures, audio, and UI art,
  including everything produced by the first-party "Pixel Forge" pipeline) —
  [CC BY-SA 4.0](LICENSE-ASSETS).
- **Third-party / public-domain inputs** — real-world USGS 3DEP DEM terrain data
  (public domain), bundled fonts (SIL OFL), and npm dependencies — retain their
  own licenses. See [THIRD-PARTY-ASSETS.md](THIRD-PARTY-ASSETS.md).

The running game shows an in-app notice naming the copyright holder and the AGPL
source URL (on the startup / deploy screen and in the in-game Credits panel).
**Modified versions must preserve these notices in reasonably visible
locations.**

Every commit prior to the relicense commit was published under the MIT License
and remains MIT; this change is forward-only. See [LICENSING.md](LICENSING.md).

Copyright (c) 2025-2026 Matthew Kissinger.
