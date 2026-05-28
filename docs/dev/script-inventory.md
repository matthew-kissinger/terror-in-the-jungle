# Script Inventory

`scripts/` holds the repo's CLI tooling: build prebakes, lint/check gates,
perf-capture harnesses, mobile playtest drivers, asset pipelines, and
cycle-specific capture/probe one-offs. This note records how we decide what
stays live and where dead one-offs go, so the directory does not silently
re-accumulate drift.

## What "referenced" means

A `scripts/*` file is **referenced** (live) if it is reachable from any of:

- a `package.json` `scripts` entry or the `knip.entry` / `knip.ignore` lists,
- a CI / deploy workflow under `.github/`,
- application or test source under `src/`,
- a doc under `docs/` (prose that documents how to run it),
- the `rust/` crate READMEs (e.g. the WASM benchmark pilot),
- or another live script (transitive `import` / `require` / spawn), including
  the chain of `capture-*-shots.ts` scripts that reuse each other's framing.

Everything not reachable from those roots is **unreferenced**.

## Archive policy

- Unreferenced top-level one-offs move to `scripts/archive/` (via `git mv`,
  never hard-delete) so the history and the script body survive.
- `scripts/audit-archive/` is the pre-existing home for retired perf/diagnostic
  audit packets; several of those are still cited by `docs/` prose and stay put.
- Anything referenced by `package.json`, CI, or an open task brief's acceptance
  (e.g. the `capture-*-shots.ts` evidence scripts) is never moved.

## Archived 2026-05-28 (script-inventory-archival)

Reference-graph pass found these top-level scripts unreferenced by
`package.json`, CI, `src/`, `docs/`, `rust/`, or any other live script. Moved
to `scripts/archive/`:

| File | Why archived |
|------|--------------|
| `capture-water-hydrology-polish.ts` | One-off water-hydrology capture; not wired to any `package.json`/CI gate or open brief. Superseded by the live `capture-of-*-shots.ts` chain. |
| `m151-jeep-integration-smoke.ts` | Cycle-specific smoke for the closed `cycle-vekhikl-1-jeep-drivable` task; not referenced by any current gate. |
| `compress_audio.py` | Legacy WAV->OGG audio pipeline one-off; not in any gate. |
| `compress_audio_simple.py` | Legacy audio pipeline variant; pairs with `compress_audio.py`. |
| `smart_optimize_clean.py` | Legacy image-optimization one-off; superseded by `scripts/optimize-assets.ts` (`npm run assets:optimize`). |
| `process_favicon.py` | One-off favicon generator; assets already baked. |
| `process_favicon1.py` | Favicon-generator variant of the above. |
| `install_tools.bat` | Windows-only Chocolatey installer for pngquant/optipng, used only by `optimize_assets.bat`. |
| `optimize_assets.bat` | Windows-only PNG optimizer batch; superseded by `scripts/optimize-assets.ts`. |

No `package.json` script entry pointed at any moved file, so no `package.json`
change was needed. `npm run validate` (lint + test + build + smoke) confirms no
CI / package.json script broke.
