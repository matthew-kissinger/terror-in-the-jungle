# Terror in the Jungle

Browser-based 3D FPS focused on large-scale jungle combat, AI squad behavior, and stable frame pacing under high combatant counts.

Live build:
- https://matthew-kissinger.github.io/terror-in-the-jungle/

## Current Focus

- Target: stable 120+ active combatants.
- Priority: frame-time tail stability (`p95`/`p99`), not only average FPS.
- Active workstream: Open Frontier reliability, objective flow, and combat plausibility.

## Quick Start

```bash
npm install
npm run dev
```

Common commands:

```bash
npm run build
npm run test:run
npm run perf:capture
npm run perf:analyze:latest
```

## Modes

| Mode | Map | Teams | Match Length |
|---|---:|---:|---:|
| Zone Control | 400x400 | 15v15 | 3 min |
| Open Frontier | 3200x3200 | 60v60 | 15 min |
| Team Deathmatch | 400x400 | 15v15 | 5 min |
| AI Sandbox | configurable | configurable | configurable |

## Controls

Desktop:
- `WASD` move, `Shift` sprint, `Space` jump
- `LMB` fire, `RMB` ADS, `R` reload
- `1-6` weapon slots, `G` grenade, `B` mortar deploy, `F` mortar fire
- `Z` squad menu, `Tab` scoreboard, `F2` perf overlay

Mobile:
- virtual joystick + touch look
- on-screen fire/ADS/reload/grenade/scoreboard
- touch controls for helicopter, mortar, and sandbags

## Performance Harness

Primary loop commands:

```bash
npm run perf:capture
npm run perf:capture:combat120
npm run perf:capture:openfrontier:short
npm run perf:capture:frontier30m
npm run perf:analyze:latest
```

Harness artifacts are written to `artifacts/perf/<timestamp>/`.

For full usage and flags, see:
- `docs/PROFILING_HARNESS.md`

## Documentation Map

Start here:
- `docs/README.md`

Core docs:
- `docs/PERFORMANCE_FRONTIER_MISSION.md` - autonomous performance frontier operating model
- `docs/ARCHITECTURE_RECOVERY_PLAN.md` - experiment ledger and keep/revert decisions
- `docs/PROFILING_HARNESS.md` - profiling workflow, validation gates, harness flags
- `CLAUDE.md` - implementation notes and repo-level dev guidance
- `docs/AUDIO_ASSETS_NEEDED.md` - audio production backlog/spec

## CI/CD

- `.github/workflows/ci.yml` - lint/build/test on push and PR
- `.github/workflows/deploy.yml` - GitHub Pages deploy on push to `master`
- `.github/workflows/perf-check.yml` - perf regression capture checks

## License

MIT
