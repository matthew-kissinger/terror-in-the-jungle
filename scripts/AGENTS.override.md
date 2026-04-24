# Scripts Override

- Keep scripts non-interactive by default. New flags should have safe defaults and clear help text.
- Treat script output as machine-consumable. Prefer stable field names and explicit failure messages over prose-only output.
- Write generated artifacts under `artifacts/`, `output/`, or `tmp/`. Do not scatter scratch files in the repo root.
- When changing capture or validation scripts, preserve existing CLI flags unless the task explicitly calls for a breaking change.
- Browser probes should exercise the same user-visible path they claim to validate. If a probe uses a private diagnostic hook, name that limitation in the summary artifact or docs.
