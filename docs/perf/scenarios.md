# Perf Scenarios

Scenario definitions for `perf:capture:*`. Each scenario combines a game mode,
duration, NPC count, and behavior flags so captures are repeatable. No baseline
is currently tracked (`perf-baselines.json` was removed); baseline policy and
how to re-establish one live in [baselines.md](baselines.md).

## Scenario table

| Scenario | Mode | Duration | NPCs | Purpose |
|----------|------|---------:|-----:|---------|
| `combat120` | AI Sandbox | 90s | 120 | Combat stress, primary regression target |
| `openfrontier:short` | Open Frontier | 180s | 120 | Terrain + draw call pressure |
| `ashau:short` | A Shau Valley | 180s | 60 | Strategy stack + heap peaks |
| `openfrontier:ears` | Open Frontier | 180s | 120 | Dropped-frame completion-lane capture: strict WebGPU, render attribution, no frontline compression |
| `ashau:ears` | A Shau Valley | 180s | 60 | Dropped-frame completion-lane capture: strict WebGPU, render attribution, no frontline compression |
| `frontier30m` | Open Frontier | 30 min | 120 | Long-tail stability soak |
| `zonecontrol` | Zone Control | 120s | 60 | Small-map gameplay |
| `teamdeathmatch` | TDM | 120s | 80 | Kill-race scenario |

Gated scenarios (when a baseline is tracked): `combat120`,
`openfrontier:short`, `ashau:short`, `frontier30m`. For STABILIZAT-4
dropped-frame completion, use the paired `openfrontier:ears` and `ashau:ears`
artifacts with `check:dropped-frame-ears`; other scenarios are diagnostic only.

Open Frontier and A Shau are large-map scenarios, so contact density can vary
between captures even when code is unchanged. A low-contact run is useful
diagnostic evidence for route, terrain, loading, and baseline render pressure,
but it is not comparable completion evidence for STABILIZAT-4. Treat a run as
completion-lane only when the dropped-frame EARS checker also passes active
combat shot/hit thresholds and NPC materialization pressure; otherwise call out
the route/contact variance instead of averaging it into a win or regression.

## Scenario-specific overrides

`frontier30m` uses perf-harness-only URL overrides from
`scripts/perf-capture.ts`:

- `perfMatchDuration=3600` — keeps Open Frontier in its combat phase for the
  full capture window.
- `perfDisableVictory=1` — prevents time-limit, ticket, or total-control
  victory screens from turning the second half into a menu soak.

These overrides are gated to dev/perf-harness builds and do not ship in retail.

`combat120` defaults to AI Sandbox seed `2718` for deterministic spawn layout.

`openfrontier:short` and other Open Frontier captures may pin a pre-baked
terrain seed via `?seed=<n>`. `npm run probe:fixed-wing` uses Open Frontier
seed `42` so airfield coverage is deterministic; general perf captures keep
their existing semantics unless a seed is passed for an A/B pair.

## Environment variables

```bash
PERF_MODE=ai_sandbox|zone_control|team_deathmatch|open_frontier|a_shau_valley
PERF_DURATION=<seconds>
PERF_WARMUP=<seconds>
PERF_NPCS=<count>
PERF_COMBAT=1|0
PERF_ACTIVE_PLAYER=1|0
PERF_PORT=<port>
PERF_DEEP_CDP=1|0
PERF_PREWARM=1|0
PERF_SAMPLE_INTERVAL_MS=<ms>
```

These are read by `scripts/perf-capture.ts` and propagated as perf-harness URL
params or constructor options to the in-page bot driver.

## Capture environment discipline

- Headed perf captures launch Chromium with a fixed `1920x1080` viewport,
  `--window-position=0,0`, `--window-size=1920,1080`, and
  `--force-device-scale-factor=1` / `deviceScaleFactor: 1`. Multi-monitor span
  contaminates frame-time and compositor behavior; the window clamp avoids it.
- Do not refresh baselines or accept perf-acceptance evidence while another
  browser game, browser-test agent, repo overnight agent, or asset bake is
  active on the same device.
- Before any headed or GPU-heavy capture, do a lightweight process/resource
  check for browser, Node, and Bun workloads. If the same stale processes
  remain after roughly three hours, clean them up before resuming, then run
  one final process check before capture.
- GitHub-hosted CI perf remains advisory. Hosted Linux/Xvfb shows
  non-representative scheduling and GPU-readback stalls during `combat120`.
  Authoritative perf gating is local `validate:full`.

### Local laptop Xwayland capture note, 2026-06-19

This laptop session was a Plasma Wayland desktop with Xwayland on `:0`. The
shell had no `DISPLAY` or `XAUTHORITY`, so headed Playwright initially failed
with `Authorization required, but no authorization protocol specified`.

Working invocation:

```bash
DISPLAY=:0 XAUTHORITY=/run/user/1000/xauth_SARRAf npm run perf:quick
```

To rediscover the auth path on this machine:

```bash
ps -eo pid,user,args | rg 'Xwayland|kwin_wayland'
```

Look for the `Xwayland :0 -auth ...` or `kwin_wayland --xwayland-xauthority
...` argument and pass that file as `XAUTHORITY`. The run still used WebGPU's
WebGL2 fallback (`No available adapters`), so treat numbers as laptop-local
evidence only, not a desktop baseline.

The capture artifact
`artifacts/perf/2026-06-19T19-45-32-219Z/` reached startup, active-driver
setup, warmup, and the 30s runtime window, but validation failed. Measurement
trust was usable with caution (`probeAvg=55.24ms`, `probeP95=69.00ms`), frame
progression passed (`947` frames over 30s), and no browser errors were
captured. The failing gates were frame-tail and active-player combat behavior:
peak p99 hit `100ms`, and the harness recorded `0` player shots / `0` hits.
The owner also visually observed that the player bot did not appear to fire on
anyone during the capture.

That no-fire result was a harness-driver bug, not evidence against rendering.
The driver tried to fire (`shotsFired=122`) but every intent was rejected by
the final aim gate (`aimDotGateRejectedShots=122`, engine shots/hits `0/0`).
Diagnostic capture `artifacts/perf/2026-06-19T19-56-25-308Z/` showed
`lastFireProbe.reason=vertical_angle_rejected` while LOS was clear and aim-dot
was valid. The compressed frontline had OPFOR above the player on terrain, so
the camera-to-target vertical component sat around `0.46-0.55`; the old `0.45`
sky-shot guard rejected steep uphill ground fire.

Post-fix capture `artifacts/perf/2026-06-19T20-00-43-943Z/` confirmed the
player bot could fire in the normal `perf:quick` path
(`player_shots_recorded=160`, `player_hits_recorded=16`), but two follow-ups
were still needed. Capture `artifacts/perf/2026-06-19T20-08-35-952Z/` showed
engine-side shot counters were still `0` until `FirstPersonWeapon.setHUDSystem`
wired the HUD-owned `PlayerStatsTracker` into the firing subsystem. That same
short capture exposed the downhill version of the fire-gate bug: the driver
used `abs(verticalComponent)`, so steep downhill ground targets were rejected
the same way steep uphill targets had been.

The final driver fix treats the vertical sky-shot guard as upward-only and
raises the long-range upward threshold to `0.9`. Steep uphill and downhill
ground shots are allowed; near-vertical upward long-range shots are still
suppressed. The active-driver debug snapshot now records `targetVisible`,
`lastTargetLosStatus`, `lastFireLosStatus`, and `lastFireProbe` so future
captures can distinguish LOS, aim-dot, vertical-gate, and successful-fire
decisions.

Capture `artifacts/perf/2026-06-19T20-13-05-386Z/` is the proof artifact for
that fix. It used a shorter 12s runtime window after 8s warmup to recheck the
bug quickly on the laptop, and validation ended at `warn` rather than `fail`:
`player_shots_recorded=67`, `player_hits_recorded=20`,
`harness_min_shots_fired` passed, `harness_min_hits_recorded` passed,
`aimDotGateRejectedShots=0`, and runtime `lastFireProbe.reason=ok` while the
vertical component sat around `0.84-0.86`. Frame-tail caveats remained
laptop-local (`peak_p99_frame_ms=46.60ms`, `avg_frame_ms=28.60ms`,
measurement trust `probeAvg=44.50ms`, `probeP95=58.00ms`), but
`hitch_50ms_percent` passed at `0.46%`.

The stock 30s `npm run perf:quick` path was rerun afterward as
`artifacts/perf/2026-06-19T20-19-36-379Z/`. It still exited nonzero on this
laptop, but for frame-tail gates rather than active-player behavior:
`player_shots_recorded=176`, `player_hits_recorded=11`, engine shots/hits
`177/11`, `movementTransitions=9`, `aimDotGateRejectedShots=0`, and
`losRejectedShots=0`; the failing checks were `peak_p99_frame_ms=66.10ms` and
`hitch_50ms_percent=3.10%`. Tail attribution again ruled out cover search and
showed the tail dominated by render/Other (`57.0ms`, `86%`) with Combat at
`9.1ms` (`14%`). Scene attribution showed `world_static_features` at zero
visible draw calls in AI Sandbox, so the static-impostor win is not expected to
move this scenario materially.

`scripts/perf-capture.ts` now keeps the warmed active driver running and calls
`resetCountersForCapture()` before the measured window instead of stopping and
restarting the bot after warmup. Paired with the existing runtime-metric reset,
that keeps startup/route-settling noise out of the measured shot, hit, damage,
and frame counters while preserving the same in-page driver instance for the
runtime capture.

Do not use these laptop artifacts for baseline refresh or perf-comparison
claims; use them only as proof that the headed Xwayland setup works, that the
active-player firing gate handles hilly ground combat, and that the remaining
warnings are laptop/WebGL2 fallback frame-tail context.

## Active-player driver

Most steady-state scenarios run with the `PerfActivePlayerBot` enabled
(`PERF_ACTIVE_PLAYER=1`, default for `combat120`). The bot:

- Chooses an objective (capture zone or nearest-OPFOR patrol target depending
  on scenario profile).
- Faces its `movementTarget` while moving, swapping to the aim target only
  when firing.
- Reports `objectiveKind`, `objectiveDistance`, `nearestOpforDistance`,
  `nearestPerceivedEnemyDistance`, `perceptionRange`, `pathTargetKind`,
  `pathTargetDistance`, and last query status into `runtime-samples.json` so
  diagnostics can separate objective routing from perception range from
  nav/path failure.

Read those fields straight from `runtime-samples.json` in the latest capture
artifact when investigating objective-routing or perception issues.

## Pre-baked seed registry

`src/config/MapSeedRegistry.ts` holds the rotation of pre-baked Open Frontier,
Zone Control, and TDM seeds. Pre-baked navmeshes and heightmaps live under
`public/data/navmesh/` and `public/data/heightmaps/` and are generated by
`scripts/prebake-navmesh.ts` (run via `npm run navmesh:generate`); the prebake
step skips when assets already exist for a seed. Use `?seed=<n>` to pin a known
variant when comparing A/B captures across runs.
