# Terror in the Jungle

A browser-based combined-arms Vietnam War shooter. No install. Up to **3,000 AI combatants** in a single match, 6 flyable aircraft, and an hour-long strategic campaign on real USGS elevation data from A Shau Valley.

**[Play in your browser →](https://terror-in-the-jungle.pages.dev)**

---

## What's interesting about it

- **Scale that shouldn't fit in a tab.** The 60-minute A Shau campaign runs a 3,000-unit war simulator with selective materialization — only the ~60 combatants near the player are full entities; the rest resolve as abstract squads on a strategy graph. Stable frame-time tails under load are a feature, not a hope.
- **Real terrain.** A 21km CDLOD heightmap built from USGS DEM data, with streamed chunks and biome-aware vegetation. Not a concept scene.
- **Combined arms.** 3 helicopters (UH-1 Huey, UH-1C Gunship, AH-1 Cobra) + 3 fixed-wing (A-1 Skyraider, AC-47 Spooky, F-4 Phantom). Door gunners, airfield spawns, ground↔aircraft handoff for both player and NPC pilots.
- **Squad AI with doctrine.** State machine + utility scoring tuned per faction. US, ARVN, NVA, and VC don't just share skins — they have different engagement distances, cover preferences, and suppression response through a `FactionCombatTuning` lookup.
- **Playable on a phone.** Touch controls with virtual joystick are a first-class path through a dedicated mobile-UI CI gate, not a toy mode.
- **Deep debug surface.** Dev builds ship with a backtick-toggled HUD registry, live Tweakpane tuning (flight/clouds/atmosphere/combat/weather), six scene-space overlays (navmesh, LOS, squad influence, LOD tier, aircraft contact, terrain chunks), a detachable free-fly camera + click-to-inspect entity inspector, a Time-Scale (pause/step/slow/fast), and an F9 annotated playtest capture. All DEV-gated out of the retail bundle.

## Game modes

| Mode | Scale | Duration | What you do |
|---|---:|---:|---|
| Zone Control | 20 | 3 min | Capture and hold zones; drain the enemy ticket pool |
| Team Deathmatch | 30 | 5 min | First team to the kill target wins |
| Open Frontier | 120 | 15 min | Large-scale engagement with helicopters, airfields, armor staging |
| A Shau Valley | 3,000 strategic / 60 local | 60 min | Historical campaign on real-terrain DEM with a war simulator |
| AI Sandbox | configurable | 60 min | Watch the AI fight itself — useful for tuning, recording, or observation |

## Playing

- **Desktop:** WASD + mouse · Space jump · Shift sprint · E to enter vehicles · R reload · G grenade.
- **Mobile:** virtual stick + look, touch-fire. Ships through the mobile-UI gate.
- **Try it right now:** [terror-in-the-jungle.pages.dev](https://terror-in-the-jungle.pages.dev). First load warms a service worker; reloads are instant.

## Run it locally

```bash
npm install
npm run doctor        # verify Node + Playwright browsers
npm run dev           # Vite dev server with HMR
```

Requires **Node 24** (pinned in `.nvmrc`) and a WebGL2 browser. Full daily loop, commands, and conventions live in [AGENTS.md](AGENTS.md).

## Developer surface

All debug surfaces are DEV-gated (retail bundle stays lean; gates verified via retail-bundle DCE):

| Key | What it does |
|---|---|
| `` ` `` | Master HUD toggle. F1–F4 for individual panels (performance, combat state, vehicle, frame-budget). |
| `\` | Tweakpane live-tuning — flight, clouds, atmosphere, combat, weather. Named presets, localStorage persist, export/import. |
| `Shift+\` | Master toggle for six scene-space debug overlays. N navmesh · L LOS rays · I squad influence · T LOD tiers · C aircraft contacts · X terrain chunks. |
| `V` / `B` | Detach / reattach free-fly camera. Click while detached to open an entity inspector (Combatant / Vehicle / Prop / Player). |
| `Backspace` / `.` / `,` / `;` | Pause / step one frame / slow / fast. `TimeScale` threaded through `GameEngineLoop.dispatch`. |
| `F9` | Playtest capture — PNG + annotation + bundled tuning-state JSON. Retail opt-in via `?capture=1`. |
| `?mode=terrain-sandbox` | DEV-only URL mode. Isolated noise/heightmap playground with PNG + seed-registry export. |

## Tech stack

[Three.js](https://threejs.org/) 0.184 · TypeScript 6.0 · Vite 8 · Vitest 4 · Playwright 1.59 · [Recast Navigation](https://github.com/isaac-mason/recast-navigation-js) (WASM navmesh) · [Tweakpane](https://tweakpane.github.io) (DEV-only).

44 runtime systems, 75 GLB models, 38 pixel-art UI icons, CDLOD terrain, selective materialization, ObjectPool for hot paths, GameEventBus for queue-and-flush cross-system messaging.

Shipped on [Cloudflare Pages](https://terror-in-the-jungle.pages.dev). CI gates: **lint · test (3,700+ cases) · build · smoke · perf · mobile-ui**. Manual deploy via `gh workflow run deploy.yml`.

## Forking or building on it

The repo is structured for agent-assisted iteration — multiple Claude Code / Codex / Cursor / Gemini sessions can run cycles against it. Where to start:

| Read | For |
|---|---|
| [AGENTS.md](AGENTS.md) | Daily loop, commands, conventions, gotchas. Start here. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tick graph, system overview, coupling heatmap |
| [docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md) | What's currently verified green on master |
| [docs/COMBAT.md](docs/COMBAT.md) | Combat subsystem architecture |
| [docs/TESTING.md](docs/TESTING.md) | Four-layer test contract — read before writing tests |
| [docs/INTERFACE_FENCE.md](docs/INTERFACE_FENCE.md) | The small set of "don't touch without approval" interfaces |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Perf scenarios, gates, how to capture and compare |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Open work, carry-overs, architecture debt |

**Multi-agent workflow.** Cycles run via the `/orchestrate` slash command. Task briefs live in `docs/tasks/*.md` and archive to `docs/tasks/archive/<cycle-id>/` on close. See [docs/AGENT_ORCHESTRATION.md](docs/AGENT_ORCHESTRATION.md) for the dispatch/merge runbook and `.claude/agents/` for executor / reviewer / perf-analyst specs. The patterns themselves are agent-agnostic.

**Performance harness.** `npm run perf:capture:combat120` runs the 90-second / 120-NPC benchmark; `npm run perf:compare` diffs against tracked baselines. Captured artifacts under `artifacts/perf/` include runtime samples, startup timeline, a final frame PNG, and a movement-viewer HTML.

## Contributing

```bash
npm run validate:fast    # typecheck + lint + test:quick
npm run validate         # full gate: lint + test + build + smoke
```

Branches are `task/<slug>`. Commit first line: `<type>(<scope>): <summary> (<slug>)`. Behavior tests only — no implementation-mirror asserts; see [docs/TESTING.md](docs/TESTING.md). Full pre-push checklist and deploy workflow in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## License

MIT — see [LICENSE](LICENSE).
