# Terror in the Jungle

[![CI](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/ci.yml)
[![Deploy](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Three.js](https://img.shields.io/badge/three.js-0.184-black)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)

**A browser-based combined-arms FPS and large-scale combat sandbox set in the Vietnam War.**

[Play the live build](https://terror-in-the-jungle.pages.dev/) | [Current repo state](docs/STATE_OF_REPO.md) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](#contributing)

Terror in the Jungle is both a playable WebGL game and a technical experiment:
can a browser tab stage infantry, aircraft, real terrain, mobile controls,
diagnostics, and thousands of strategic combatants without collapsing into a
pile of hidden fallbacks?

The project is in active development. Some systems are production-shaped and
validated; others are under architecture recovery. The current truth anchor is
[docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md), not old roadmap text.

## Why This Exists

Most browser shooters stay small because the hard parts compound quickly:
terrain streaming, AI budgets, navmesh data, culling, service-worker freshness,
input edge cases, aircraft feel, mobile HUDs, and deployment drift all collide.
This repo is a deliberate attempt to solve those problems in the open.

Highlights:

- **Combined arms in a browser.** Infantry, squads, helicopters, fixed-wing
  aircraft, airfields, objectives, tickets, suppression, grenades, and vehicle
  entry/exit are all part of the same runtime.
- **Real terrain target.** A Shau Valley uses real elevation data through a
  Cloudflare R2 manifest path and an explicit terrain/nav startup gate.
- **Large-scale combat design.** A Shau is a 3,000-unit strategic simulation
  with selective local materialization rather than 3,000 fully live NPC meshes.
- **Game-feel instrumentation.** Fixed-wing probes, perf captures, HUD checks,
  state coverage, atmosphere evidence, and playtest checklists exist because
  tests are sensors, not truth.
- **Mobile is not an afterthought.** Touch controls and HUD layout are covered
  by dedicated validation scripts.
- **Agent-resistant architecture work.** The repo contains explicit ownership
  docs, interface fences, and current-state notes so multiple humans and coding
  agents can collaborate without inventing duplicate authorities.

## Playable Modes

| Mode | Current Shape | Purpose |
| --- | --- | --- |
| Zone Control | Small objective battle | Capture zones and drain enemy tickets. |
| Team Deathmatch | Small combat loop | Fast infantry and vehicle combat smoke. |
| Open Frontier | Larger sandbox | Airfields, vehicles, helicopters, armor staging, and 120-NPC perf checks. |
| A Shau Valley | Real-terrain strategic mode | 3,000-unit strategic layer with local materialization on DEM-backed terrain. |
| AI Sandbox | Configurable simulation | Observation, tuning, perf capture, and combat diagnostics. |

## Current Stabilization Focus

Recent work has been aimed at reducing drift caused by overlapping systems:

- vehicle session authority for entering, exiting, ejecting, and switching
  aircraft;
- fixed-wing and helicopter transition validation;
- all-mode atmosphere/cloud evidence after the old flat cloud plane caused
  horizon artifacts;
- A Shau terrain/nav startup gates and removal of silent TileCache fallback
  masking;
- NPC/player scale, fire-height, locomotion, and render-grounding corrections;
- deployment parity between local preview, GitHub Actions, Cloudflare Pages,
  service-worker cache, and R2-hosted terrain assets.

Known open areas include A Shau route-follow quality, airfield surface/taxi
authority, water rendering quality, render/LOD/culling perf audit, and final
human playtest sign-off. See [docs/BACKLOG.md](docs/BACKLOG.md) for the live
queue.

## Screens And Controls

Desktop:

- WASD: move
- Mouse: look and aim
- Space: jump
- Shift: sprint
- E: enter or exit vehicle
- R: reload
- G: grenade

Mobile:

- Virtual movement stick
- Touch look
- Touch fire and action buttons

Pointer-lock support depends on the browser. Normal Chrome/Edge/Firefox are
the main FPS validation path; the in-app Codex browser may need the unlocked
mouse-look fallback described in the current-state docs.

## Run Locally

```bash
npm install
npm run doctor
npm run dev
```

Requirements:

- Node 24, pinned in [.nvmrc](.nvmrc)
- A WebGL2-capable browser
- Playwright browsers for validation scripts

The local dev server is Vite. The production-shaped local path is:

```bash
npm run build
npm run preview
```

## Validation

Fast local gate:

```bash
npm run validate:fast
```

Production-shaped local gate:

```bash
npm run build
npm run smoke:prod
```

Useful domain gates:

```bash
npm run probe:fixed-wing
npm run evidence:atmosphere
npm run check:mobile-ui
npm run check:hud
npm run perf:capture:combat120
npm run perf:compare
```

Game-feel changes still require a human pass through
[docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md). Automated probes are
necessary; they do not prove that flight, infantry pacing, or UI feel is good.

## Tech Stack

- [Three.js](https://threejs.org/) 0.184
- TypeScript 6.0
- Vite 8
- Vitest 4
- Playwright 1.59
- [Recast Navigation](https://github.com/isaac-mason/recast-navigation-js)
- Cloudflare Pages for the app shell
- Cloudflare R2 for large immutable runtime assets

Runtime features include CDLOD terrain, sky/fog/cloud rendering, water,
service-worker freshness control, debug overlays, Tweakpane dev tuning,
queue-and-flush eventing, object pools for hot paths, and seed-keyed prebaked
navmesh/heightmap assets for selected modes.

## Repository Map

| Path | What It Owns |
| --- | --- |
| [src/core](src/core) | Engine loop, system initialization, scheduler, runtime composition. |
| [src/systems/combat](src/systems/combat) | NPC state, AI, LOS, movement, LOD, damage, rendering. |
| [src/systems/navigation](src/systems/navigation) | Recast navmesh loading, static-tiled generation, path queries. |
| [src/systems/terrain](src/systems/terrain) | Terrain runtime, streamed height queries, terrain evidence. |
| [src/systems/vehicle](src/systems/vehicle) | Vehicle session authority, fixed-wing models, adapters, airframe. |
| [src/systems/helicopter](src/systems/helicopter) | Helicopter models, physics, rotors, deployment support. |
| [src/systems/environment](src/systems/environment) | Atmosphere, sky, clouds, weather, water. |
| [src/ui](src/ui) | HUD, controls, screens, icons, loading, UI engine helpers. |
| [scripts](scripts) | Probes, perf capture, deployment helpers, evidence generation. |
| [docs](docs) | Architecture, testing, deployment, backlog, current-state docs. |

## Documentation

Start here:

| Doc | Use It For |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Daily loop, commands, conventions, and hard rules. |
| [docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md) | Verified current state and known drift. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, tick graph, coupling heatmap. |
| [docs/COMBAT.md](docs/COMBAT.md) | Combat ownership, AI, movement, LOD, and scale rules. |
| [docs/TESTING.md](docs/TESTING.md) | Four-layer testing contract. Read before adding tests. |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Perf scenarios, capture workflow, baseline policy. |
| [docs/DEPLOY_WORKFLOW.md](docs/DEPLOY_WORKFLOW.md) | Cloudflare Pages/R2 deploy and cache verification. |
| [docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md) | Human playtest form for feel-sensitive changes. |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Known issues and queued architecture recovery cycles. |

## Contributing

This is a live game repo, so keep changes narrow and evidence-backed.

```bash
npm run validate:fast
```

Before pushing larger or perf-sensitive work, also run the domain-specific
probe that matches the subsystem you touched. Do not change fenced interfaces
in [src/types/SystemInterfaces.ts](src/types/SystemInterfaces.ts) without
explicit approval. Do not add implementation-mirror tests; assert behavior.

Branch naming convention:

```text
task/<descriptive-slug>
```

Commit first line:

```text
<type>(<scope>): <summary> (<slug>)
```

This repo is used by multiple coding agents and humans. If a doc disagrees
with current code/runtime evidence, believe the evidence and update the doc.

## Deployment

Production is hosted on Cloudflare Pages:

[https://terror-in-the-jungle.pages.dev/](https://terror-in-the-jungle.pages.dev/)

Deploys are manual through GitHub Actions. Pushing to `master` is not proof of
production freshness. Use [docs/DEPLOY_WORKFLOW.md](docs/DEPLOY_WORKFLOW.md)
for the full commit, push, deploy, header, service-worker, and live-manifest
verification path.

## License

MIT. See [LICENSE](LICENSE).
