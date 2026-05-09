# Terror in the Jungle

[![CI](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/ci.yml)
[![Deploy](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/matthew-kissinger/terror-in-the-jungle/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Three.js](https://img.shields.io/badge/three.js-0.184-black)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646cff)](https://vitejs.dev/)

**A browser-based combined-arms FPS / RTS sandbox set in the Vietnam theater, late 1960s.**

[▶ Play the live build](https://terror-in-the-jungle.pages.dev/) · [Directives](docs/DIRECTIVES.md) · [Current state](docs/STATE_OF_REPO.md) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](#contributing)

> **Engine architected for 3,000 combatants via materialization tiers; live-fire
> combat verified at 120 NPCs while the ECS hot path is built out (Phase F).**
> A Shau Valley uses real DEM elevation on a 21 km map, side-mounted helicopter
> rotors over a Huey at low altitude, A-1 Skyraiders coming in for the napalm
> pass — all running in a browser tab without hidden fallbacks. See
> [docs/ROADMAP.md](docs/ROADMAP.md) for the canonical phase status.

Active directives, success criteria, and evidence links live in
[docs/DIRECTIVES.md](docs/DIRECTIVES.md). Carry-overs live in
[docs/CARRY_OVERS.md](docs/CARRY_OVERS.md). When a doc disagrees with the
repository, believe the repository and update the doc.

## Highlights

- **Combined arms in a browser.** Infantry, squads, helicopters (UH-1 Huey,
  UH-1C Gunship, AH-1 Cobra), fixed-wing (A-1 Skyraider, F-4 Phantom, AC-47
  Spooky), airfields, objectives, tickets, suppression, grenades, and vehicle
  enter/exit/eject — all part of the same runtime, all shipped to production.
- **Real terrain target.** A Shau Valley uses real elevation data through a
  Cloudflare R2 manifest path with an explicit terrain/nav startup gate. No
  silent TileCache fallback; if the asset isn't loadable, the mode tells you.
- **Large-scale combat.** A Shau is architected as a ~3,000-unit strategic
  simulation through materialization tiers; the verified live-fire combat
  frontier is currently 120 NPCs while the ECS hot path is built out
  ([Phase F](docs/ROADMAP.md)).
- **Squad command surface.** RTS-style direct orders with Vietnam-era prose:
  Hold, Patrol, Attack Here, Fall Back, Stand Down — issued from minimap
  taps or keyboard, dispatched to AI states with terrain-height-aware world
  markers.
- **Diagnostic toolkit.** Backtick-toggled debug HUD registry, Shift+\
  six-overlay debugger, V/B free-fly + entity inspector, Backspace pause /
  `.` step / `,` slow / `;` fast, F9 playtest capture, ` ` (single backslash)
  Tweakpane live-tuning panel (dev-only), `?mode=terrain-sandbox` URL gate.
- **Game-feel instrumentation.** Fixed-wing probes, perf captures (sparse and
  full combat120), HUD validators, mobile-UI gates, atmosphere evidence, doc
  drift gate, ~70 dedicated `check:projekt-143-*` audit scripts. Tests are
  sensors, not truth.
- **Mobile is not an afterthought.** Touch controls, tactical map command
  dispatch, and HUD layout are covered by dedicated validation scripts.
- **Agent-resistant architecture.** Fenced interfaces in
  [src/types/SystemInterfaces.ts](src/types/SystemInterfaces.ts), explicit
  ownership docs, the codex directive board, and a doc-drift gate so multiple
  humans and coding agents can collaborate without inventing duplicate
  authorities.

## Playable Modes

| Mode | Shape | Purpose |
| --- | --- | --- |
| **Zone Control** | Small objective battle | Capture zones and drain enemy tickets. |
| **Team Deathmatch** | Small combat loop | Fast infantry and vehicle combat smoke. |
| **Open Frontier** | Larger sandbox | Airfields, vehicles, helicopters, armor staging, 120-NPC perf checks. |
| **A Shau Valley** | Real-terrain strategic mode | Architected for ~3,000-unit strategic layer via materialization tiers; live combat verified at 120, on DEM-backed terrain. |
| **AI Sandbox** | Configurable simulation | Observation, tuning, perf capture, combat diagnostics. |

## Latest Cycle

`cycle-2026-05-08-stabilizat-2-closeout` closed **2026-05-08**. Eight PRs
merged, codex revision 1.3 sealed, live release verified at
`https://terror-in-the-jungle.pages.dev/`. Six-themed PR train shepherded
a 143-file working tree (helicopter rotor axis, water audits, terrain +
explosion FX, UX respawn flow, combat AI / squad command / core engine
mega-cluster, docs + 70-script audit catalog) → `master` → CI green →
Cloudflare Pages deploy → 7/7 live-release-proof PASS.

Closed this cycle: STABILIZAT-2/3, SVYAZ-1 stand-down command, SVYAZ-2 squad
pings (Hold / Patrol / Attack Here / Fall Back), UX-1 respawn flow, AVIATSIYA-1
helicopter rotor parity, DEFEKT-5 visual fallback / directionality. STABILIZAT-1
combat120 baseline refresh deferred to Strategic Reserve. Full retrospective:
[docs/cycles/cycle-2026-05-08-stabilizat-2-closeout/RESULT.md](docs/cycles/cycle-2026-05-08-stabilizat-2-closeout/RESULT.md).

Active areas remain DEFEKT-3 combat AI p99 anchor, DEFEKT-4 NPC route quality
runtime acceptance, VODA-1 Open Frontier exposure correction, AVIATSIYA-2/4-7
weapon and maneuver implementations, SVYAZ-3 air-support call-in radio,
VEKHIKL ground-vehicle runtime, and UX-2/3/4 deploy/loadout polish. See
[docs/DIRECTIVES.md](docs/DIRECTIVES.md) for live status.

## Controls

### Desktop — gameplay

| Input | Action |
| --- | --- |
| `WASD` | Move |
| Mouse | Look / aim |
| `Space` | Jump |
| `Shift` | Sprint |
| `E` | Enter / exit / eject vehicle |
| `R` | Reload |
| `G` | Grenade |
| `M` | Map / squad command |

### Desktop — diagnostics and debug

| Input | Action |
| --- | --- |
| `` ` `` (backtick) | Toggle debug HUD registry |
| `Shift+\` | Six-overlay world debugger |
| `V` | Toggle free-fly camera |
| `B` | Toggle entity inspector |
| `Backspace` | Pause / resume |
| `.` | Step one frame |
| `,` / `;` | Slow / fast time scale |
| `F9` | Playtest capture |
| `\` (single, dev-only) | Tweakpane live-tuning panel |

### Mobile

- Virtual movement stick
- Touch look
- Tactical map command dispatch (squad orders)
- Touch fire and action buttons

Pointer-lock support depends on the browser. Chrome/Edge/Firefox are the
primary FPS validation path; in-app embedded browsers may need the unlocked
mouse-look fallback documented in [docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md).

## Run Locally

```bash
npm install
npm run doctor   # environment sanity
npm run dev      # vite dev server
```

Requirements:

- Node 24, pinned in [.nvmrc](.nvmrc)
- A WebGL2-capable browser
- Playwright browsers for validation scripts (`npx playwright install`)

Production-shaped local path:

```bash
npm run build
npm run preview
```

## Validation

Routine gate before any commit:

```bash
npm run validate:fast
```

Release gate (adds `perf:capture:combat120`):

```bash
npm run validate:full
```

Domain-specific gates:

```bash
npm run probe:fixed-wing             # A-1 / F-4 / AC-47 entry, climb, approach, bailout
npm run evidence:atmosphere          # all-mode sky / fog / cloud
npm run check:mobile-ui              # actionability + scroll on mobile viewports
npm run check:hud                    # HUD layout
npm run perf:capture:combat120       # 90s combat sim, 120 NPCs, seed 2718
npm run perf:compare                 # latest capture vs perf-baselines.json
npm run check:doc-drift              # codex / state / performance ↔ artifact paths
npm run check:projekt-143-completion-audit
```

Game-feel changes still require a human pass through
[docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md). Automated probes are
necessary — they do not prove that flight, infantry pacing, squad command
ergonomics, or UI feel is good.

## Tech Stack

- [Three.js](https://threejs.org/) 0.184
- TypeScript 6.0
- Vite 8
- Vitest 4 (~4,100 tests across ~265 files)
- Playwright 1.59
- [Recast Navigation](https://github.com/isaac-mason/recast-navigation-js)
- Tweakpane 4 (dev-only live tuning)
- Cloudflare Pages for the app shell
- Cloudflare R2 for large immutable runtime assets (DEM, navmesh, heightmap)

Runtime features include CDLOD terrain, atmosphere / sky / fog / cloud
rendering, hydrology-driven water surfaces, service-worker freshness control,
debug overlays, queue-and-flush eventing, object pools for hot paths,
seed-keyed prebaked navmesh / heightmap assets, and an explicit
fenced-interface boundary at `src/types/SystemInterfaces.ts`.

## Repository Map

| Path | Owns |
| --- | --- |
| [src/core](src/core) | Engine loop, system initialization, scheduler, runtime composition, time scale, runtime metrics. |
| [src/systems/combat](src/systems/combat) | NPC state, AI, LOS, cover finding, suppression, target acquisition, movement, LOD, damage, rendering. |
| [src/systems/navigation](src/systems/navigation) | Recast navmesh loading, static-tiled generation, path queries. |
| [src/systems/terrain](src/systems/terrain) | CDLOD terrain runtime, streamed height queries, terrain evidence. |
| [src/systems/vehicle](src/systems/vehicle) | Vehicle session authority, fixed-wing models, adapters, airframe. |
| [src/systems/helicopter](src/systems/helicopter) | Helicopter models, physics, rotors, deployment. |
| [src/systems/environment](src/systems/environment) | Atmosphere, sky, clouds, weather, water, hydrology. |
| [src/systems/player](src/systems/player) | Player respawn manager, controller, deploy flow. |
| [src/ui](src/ui) | HUD, controls, screens, icons, loading, deploy / respawn UI, command overlays, tactical map. |
| [scripts](scripts) | Probes, perf capture, deployment helpers, evidence generation, ~70 `projekt-143-*` audit scripts. |
| [docs](docs) | Directives, architecture, testing, deployment, cycles, archives. |
| [docs/cycles/](docs/cycles) | Per-cycle retrospectives (`<cycle-id>/RESULT.md`). |

## Documentation

Start here:

| Doc | Use it for |
| --- | --- |
| [docs/DIRECTIVES.md](docs/DIRECTIVES.md) | Active directive list with status, owning subsystem, success criteria, and latest evidence link. |
| [AGENTS.md](AGENTS.md) | Daily loop, commands, conventions, hard rules. Agent-agnostic. |
| [CLAUDE.md](CLAUDE.md) | Claude-Code-specific harness pieces (slash commands, subagents). |
| [docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md) | Verified current state, post-cycle. |
| [docs/AGENT_ORCHESTRATION.md](docs/AGENT_ORCHESTRATION.md) | Master dispatch + merge protocol, cycle lifecycle. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, tick graph, coupling heatmap. |
| [docs/INTERFACE_FENCE.md](docs/INTERFACE_FENCE.md) | Fenced-interface change rules. |
| [docs/COMBAT.md](docs/COMBAT.md) | Combat ownership, AI, movement, LOD, scale rules. |
| [docs/TESTING.md](docs/TESTING.md) | Four-layer testing contract. Read before adding tests. |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Perf scenarios, capture workflow, baseline policy. |
| [docs/DEPLOY_WORKFLOW.md](docs/DEPLOY_WORKFLOW.md) | Cloudflare Pages / R2 deploy and cache verification. |
| [docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md) | Human playtest form for feel-sensitive changes. |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Strategic Reserve index. Active work routes through `docs/DIRECTIVES.md`. |

## Contributing

This is a live game repo. Keep changes narrow and evidence-backed.

```bash
npm run validate:fast            # before any commit
```

Before pushing larger or perf-sensitive work, also run the domain-specific
probe that matches the subsystem you touched. Hard rules:

- Do not modify [src/types/SystemInterfaces.ts](src/types/SystemInterfaces.ts)
  without explicit approval. Cross-fence accessor changes are limited to ≤20
  LOC per file and require `[interface-change]` in the PR title.
- PR size: ≤500 LOC preferred (GOST-TIJ-001). Larger PRs require a stated
  rationale; tightly cross-coupled clusters get an explicit exception in the
  PR description.
- No implementation-mirror tests. Assert behavior, not internal state names
  or tuning constants.
- Don't push directly to `master`. Open a PR; rebase-merge via `gh pr merge --rebase`.
- Don't use `--no-verify` to bypass hooks.
- Don't refresh `perf-baselines.json` without project-owner authorization.

Branch naming:

```text
task/<descriptive-slug>
```

Commit first line:

```text
<type>(<scope>): <summary> (<slug>)
```

This repo is used by multiple coding agents and humans. If a doc disagrees
with current code or runtime evidence, believe the evidence and update the doc.

## Deployment

Production:

> [https://terror-in-the-jungle.pages.dev/](https://terror-in-the-jungle.pages.dev/)

Deploys are **manual** via GitHub Actions:

```bash
npm run deploy:prod              # = gh workflow run deploy.yml --ref master --watch
```

Pushing to `master` is **not** proof of production freshness — CI runs but
deploy does not. Live release verification:

```bash
npm run check:projekt-143-live-release-proof
```

Verifies seven gates: local-head-pushed, ci-success-for-head, deploy-success-for-head,
live `/asset-manifest.json` SHA matches HEAD, Pages headers (cache-control + COOP +
COEP), R2 DEM accessibility (immutable + CORS), and live browser smoke. See
[docs/DEPLOY_WORKFLOW.md](docs/DEPLOY_WORKFLOW.md) for the full path.

## License

MIT. See [LICENSE](LICENSE).
