# preserve-drawing-buffer-dev-gate: gate WebGLRenderer preserveDrawingBuffer behind DEV or opt-in URL flag

**Slug:** `preserve-drawing-buffer-dev-gate`
**Cycle:** `cycle-2026-04-23-debug-cleanup`
**Round:** 1
**Priority:** P0 — pays off an explicit next-cycle TODO called out by the prior cycle's perf-analyst.
**Playtest required:** NO (perf-verifiable; retail heap residual should return to baseline's near-zero territory).
**Estimated risk:** minimal — single-file gate around an already-shipped flag.
**Budget:** ≤60 LOC (including test).
**Files touched:**

- Modify: `src/core/GameRenderer.ts` — compute `preserveDrawingBuffer` from a small helper instead of hardcoding `true`.
- Optional add: `src/core/GameRenderer.test.ts` if no test file exists for the renderer. Otherwise add a focused test for the helper (behavior test only — do NOT mirror implementation).

## Required reading first

- `src/core/GameRenderer.ts:~38-60` — current `WebGLRenderer` constructor options. The `preserveDrawingBuffer: true` line landed in PR #144 (playtest-capture-overlay) and is currently unconditional.
- `src/ui/debug/PlaytestCaptureManager.ts` — the F9 capture consumer. `renderer.domElement.toBlob()` returns a blank transparent image if `preserveDrawingBuffer` is false. So any path where we want F9 capture to work MUST have the flag on.
- `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md` — "preserveDrawingBuffer: true has no measurable CPU cost" section; the only cost is ~+13 MB retail heap residual from the retained back-buffer.

## Diagnosis

`preserveDrawingBuffer: true` landed unconditionally in `src/core/GameRenderer.ts` per PR #144's Step-0 requirement. Retail perf-capture at HEAD `422563e` showed `heap_end_growth = +13.08 MB` vs baseline's `-2.01 MB` — attributable to the WebGL compositor retaining the back-buffer that `.toBlob()` needs. For retail players who never press F9, this is pure tax.

## Fix

### 1. Extract a helper

In `src/core/GameRenderer.ts`, add a narrow helper:

```ts
/**
 * Determine whether the WebGLRenderer should preserve its drawing buffer.
 * Required by PlaytestCaptureManager (F9) for toBlob() — but retaining the
 * back-buffer adds ~13 MB heap residual that retail players who never press
 * F9 shouldn't pay.
 *
 * - Always on in dev builds (F9 + all other debug tooling active by default).
 * - Opt-in on retail via `?capture=1` URL param (lets Cloudflare testers
 *   reach F9 without a local dev checkout).
 * - Off otherwise.
 */
function shouldPreserveDrawingBuffer(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('capture') && params.get('capture') !== '0';
}
```

Use it in the constructor:

```ts
this.renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: shouldPreserveDrawingBuffer(),
});
```

Keep the helper private (not exported) unless the test needs it — if so, export-only-for-test is fine.

### 2. Behavior test

Assert the three branches:

- With `import.meta.env.DEV = true` → `shouldPreserveDrawingBuffer() === true`.
- With DEV false and `?capture=1` → `true`.
- With DEV false and no `capture` param → `false`.
- With DEV false and `?capture=0` → `false` (explicit opt-out).

Use the test harness's existing DEV-env and URL stubs — do not invent new ones. If the test requires stubbing `window.location`, use the jsdom pattern already present in `src/ui/debug/*.test.ts` files (e.g. `LiveTuningPanel.test.ts` or `PlaytestCaptureOverlay.test.ts`).

### 3. PlaytestCaptureManager guard (optional nicety)

If time permits (and budget has room), `PlaytestCaptureManager.capture()` could detect `preserveDrawingBuffer === false` on the renderer and surface a single console warning (`[playtest-capture] preserveDrawingBuffer is off — captures will be blank. Add ?capture=1 to the URL or run a dev build.`) before calling `toBlob()`. Out of scope if it pushes the budget; mention as a follow-up instead.

## Steps

1. Read "Required reading first."
2. Add the helper and wire it into the constructor. Verify `npm run dev` still works (F9 capture still produces a non-blank PNG in dev mode).
3. Add the behavior test.
4. `npm run lint`, `npm run test:run`, `npm run build`.
5. Verify retail build gate: `npm run build && grep -r "preserveDrawingBuffer:true\|preserveDrawingBuffer: true" dist/assets/*.js | head -3`. The flag appears in dist bytes as a computed expression, not a hardcoded `true` — that's expected; the runtime call to `shouldPreserveDrawingBuffer()` without DEV + without `?capture=1` returns false at instantiation.
6. Optional: commit one retail-URL perf capture as evidence — `npm run preview` in one terminal, `npx tsx scripts/perf-capture.ts --headed --mode ai_sandbox --npcs 120 --duration 90 --warmup 15 --seed 2718 --url-suffix "&capture=0"` or similar. If the capture script doesn't accept retail URLs easily, skip — the perf gate post-merge will verify.

## Exit criteria

- Dev server: F9 still captures non-blank PNGs.
- Retail build + default URL: `renderer.domElement.toBlob()` would return blank (but users can't tell because F9 capture isn't a retail entry point without the flag).
- Retail build + `?capture=1` URL: F9 still works.
- Behavior test green across all three branches.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Post-cycle combat120 perf capture shows `heap_end_growth_mb` at or below baseline (R0 was -2.01 MB; post-cycle should be ≤ +2 MB, ideally negative).

## Non-goals

- Do not add a runtime toggle (in-game UI to enable capture). `?capture=1` is the single opt-in.
- Do not rework `PlaytestCaptureManager` or `PlaytestCaptureOverlay` — they stay as-is; the flag gate is the only change.
- Do not rename `preserveDrawingBuffer` or the helper if it's already sensibly named.
- Do not add LocalStorage persistence for the flag. URL param is session-scoped by design.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- Helper evaluation at module-eval time before `window` exists (SSR / test harness boot) → already handled via the `typeof window === 'undefined'` guard; if tests still break, do NOT ship a DEV-only fallback that hides the bug — investigate first.
- Retail combat120 perf regresses against baseline (p99 > +5%) → unexpected; investigate, potentially revert this gate if the back-buffer was cheaper-than-expected and something else caused R3's +13 MB. The gate is the safe default; a real regression would be surprising.

## Report back

```
task_id: preserve-drawing-buffer-dev-gate
branch: task/preserve-drawing-buffer-dev-gate
pr_url: <url>
files_changed: <N files, +A -D lines>
verification:
  - npm run lint: PASS
  - npm run test:run: PASS (X tests, Y ms)
  - npm run build: PASS
  - retail heap residual check: <post-merge perf delta if captured; else DEFERRED to post-cycle gate>
playtest_required: no
surprises: <one line or "none">
fence_change: no
```

## Pairs with

- `world-overlay-debugger-ci-fix` (same cycle; both disjoint single-file tweaks).
