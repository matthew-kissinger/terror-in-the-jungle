# live-tuning-panel evidence

The panel renders only in dev mode (`import.meta.env.DEV`). To capture a
screenshot:

```bash
npm run dev
# open http://localhost:5173
# press \ (backslash) to reveal the Live Tuning panel
# expand at least one folder and save a screenshot here as panel-open.png
```

Files expected in this directory once a human playtest has captured them:

- `panel-open.png` — panel revealed, Flight folder expanded showing the A-1
  clamp knob at its shipping default (0.22).
- `retail-leak-check.txt` — output of:
  ```bash
  npm run build
  find dist -type f | xargs grep -l "tweakpane\|LiveTuningPanel"
  # expect empty output
  ```

The retail-leak check was verified automatically during this task's local
verification run and returned no matches (see PR description).
