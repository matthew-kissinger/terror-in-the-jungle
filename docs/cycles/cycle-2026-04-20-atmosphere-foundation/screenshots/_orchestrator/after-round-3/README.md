# after-round-3 — orchestrator ship-gate combo capture

Captured by the orchestrator (main session) against master @ `c9fbb68`,
i.e. with all four atmosphere PRs landed:

- #97 atmosphere-interface-fence
- #102 atmosphere-hosek-wilkie-sky
- #103 atmosphere-fog-tinted-by-sky
- #104 atmosphere-sun-hemisphere-coupling

All five scenarios re-shot via `npx tsx scripts/capture-hosek-wilkie-shots.ts`
at the same camera framings as the per-task evidence in
`atmosphere-hosek-wilkie-sky/`.

## What this captures

- ✅ **Sky-fog seam gone** (most clearly in `combat120-noon`): the white
  horizon dissolves smoothly into the white fog and into a tropical
  foreground without the hard line PR #102 exposed.
- ✅ **Sky gradient quality**: smooth zenith→horizon analytic dome with
  Bayer dither breaking up banding (#101 contribution).
- ⚠️ **Per-preset TOD differentiation** (sun-hemisphere exit criterion):
  not visually reading. Dawn/dusk shots look noon-ish because the
  post-process 24-level color quantize + no tone-mapping clips bright
  in-scattering to white. Math is correct (verified by
  `HosekWilkieSkyBackend.test.ts` and the per-PR backend unit tests);
  the visual surfacing is blocked by a pre-existing post-process
  limitation in `PostProcessingManager.ts` that all three Round 2/3
  executors independently flagged.

## Follow-up

Open a next-cycle task to add tone-mapping (ACES or Reinhard) before
the 24-level quantize in `PostProcessingManager.ts`. That is the missing
piece for warm dawn / dusk colors to read in the dome shots and for the
combined atmosphere stack to fully match its design intent.
