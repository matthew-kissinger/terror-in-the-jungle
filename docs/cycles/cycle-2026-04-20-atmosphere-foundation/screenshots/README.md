# Visual evidence — `cycle-2026-04-20-atmosphere-foundation`

Screenshot artifacts for the orchestrator-gated visual review described in the
"Visual checkpoints" subsection of `docs/AGENT_ORCHESTRATION.md` for this
cycle.

## Layout

- `_master/` — pre-cycle baseline shots from `master`. Captured by orchestrator
  before Round 1 dispatches. Executors diff their work against these.
- `_orchestrator/<checkpoint>/` — between-round captures by the orchestrator
  for combo tuning. Checkpoints named after the round just merged (e.g.
  `after-round-2-hosek-wilkie/`).
- `<slug>/` — per-task evidence committed inside that task's PR. Each task
  brief lists its required shots under "Screenshot evidence (required for
  merge)."

## Camera coords

Each `<slug>/README.md` should record the camera pose (scenario, position,
yaw, pitch) used so subsequent passes can re-frame the same shot. The first
visible-change task to land seeds the framings for the rest of the cycle.

## Reviewer protocol

Orchestrator reads PNGs via the Read tool (renders inline). On regression,
post `gh pr comment` with the specific issue. Merge only after shots clear.

## Existing reference data

The repo's `artifacts/perf/<timestamp>/final-frame.png` collection already
holds 273 captured frames, but ALL of them are `combat120` (sandbox harness,
bot-POV mid-combat). The most recent — copied here as
`_master/combat120-2026-04-19.png` from
`artifacts/perf/2026-04-19T22-44-23-057Z/` — shows ground-level jungle with
trees occluding the entire sky dome. **Useful as a general-scene reference
(palette, post-process look, banding); NOT useful for atmosphere validation
because no horizon is visible.**

Gaps (no historical final-frame artifacts exist for these scenarios):
`ashau:short`, `openfrontier:short`, `tdm`, `zc`. The
`atmosphere-hosek-wilkie-sky` executor is the natural place to capture fresh
master baselines for these four — `git stash` the WIP, screenshot in the
configured TOD framing, `git stash pop`, screenshot the new sky, commit both.

For older mode-tagged artifacts that may include other scenarios, see the
2026-02-14 batch under `artifacts/perf/`. They predate the current scene
significantly (terrain, lighting, NPC density all shifted), so treat as
historical curiosity rather than diff baselines.
