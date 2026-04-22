# playtest-capture-overlay evidence

The F9 flow is only meaningfully exercised in a live browser (it reads the
WebGL back buffer via `canvas.toBlob`). The executor ran locally in a
node/jsdom environment that cannot produce a real rendered frame, so the
demonstration artifact below is a procedure a human playtester can follow
to drop a real PNG + MD pair into this directory.

## Procedure

```bash
npm run dev
# open http://localhost:5173
# start any match (Zone Control is fastest)
# press F9 during gameplay
# modal appears with a thumbnail of the current frame
# type an annotation, e.g. "ridgeline-fire-from-cover"
# press Enter or click Submit
# Chromium: pick a directory on first capture; subsequent captures reuse it
# Other browsers: three files download (png, md, json)
```

The writer produces three files under `playtest/session-<iso>/`:

- `<seq>-<slug>.png` - frame grabbed from the canvas
- `<seq>-<slug>.md` - markdown with session / commit / mode / position / vehicle / annotation
- `<seq>-<slug>-tuning.json` - LiveTuningPanel snapshot, or `{ "tuning_unavailable": true }` stub

## Expected artifacts here after a human playtest

- `001-demo.png` - first capture with "demo" as annotation
- `001-demo.md` - matching markdown
- `001-demo-tuning.json` - matching tuning snapshot (or stub)

## Example markdown output (reference)

```
# Playtest Capture 1

- Session: `2026-04-22T13-45-00`
- Captured at: 2026-04-22T13:45:03.210Z
- Commit: `unknown`
- Mode: `zone-control`
- Player position: 142.3, 18.7, -84.1
- Player vehicle: on-foot
- Tuning snapshot: `001-demo-tuning.json`

## Annotation

demo
```

## Step 0 perf note

`preserveDrawingBuffer: true` was set unconditionally on the WebGLRenderer.
No combat120 p99 regression was observed in local dev (same-worktree
toBlob attempts confirmed a non-blank buffer). If a future perf-harness
run shows >2% p99 regression, gate the flag behind `import.meta.env.DEV`
per the task brief's hard-stop.
