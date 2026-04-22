# playtest-capture-overlay: F9 in-game screenshot + annotation capture

**Slug:** `playtest-capture-overlay`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 2
**Priority:** P1 — tightens the playtest feedback loop (replaces `Win+Shift+S` + external markdown).
**Playtest required:** NO (behavior-testable via synthetic click + file-write assertion in a headless harness).
**Estimated risk:** low — additive overlay + file-writer; no runtime systems touched.
**Budget:** ≤300 LOC.
**Files touched:**

- Create: `src/ui/debug/PlaytestCaptureOverlay.ts` (the modal + annotation prompt).
- Create: `src/ui/debug/PlaytestCaptureManager.ts` (orchestrates capture → prompt → write; session-scoped).
- Modify: `src/core/GameEngineInput.ts` (F9 key handler).
- Modify: `src/core/GameEngine.ts` (instantiate the manager; pass it the renderer reference).
- Possibly register as a `DebugPanel` against `DebugHudRegistry` — if that ships first. If not, mount independently (the registry is not a blocker).
- Add: `src/ui/debug/PlaytestCaptureOverlay.test.ts` (basic behavior: prompt render, submit → file-write invoked, cancel → no write).

## Required reading first

- `src/ui/loading/SettingsModal.ts` — template for a lightweight modal; adopt the form-field + confirm/cancel pattern, strip the settings-specific content.
- `src/core/GameEngineInput.ts:18-45` — key routing pattern for F-keys.
- `src/core/GameEngine.ts` — where to instantiate the manager; where the renderer reference lives.
- Three.js `WebGLRenderer.domElement` — the `<canvas>` we call `toBlob` on.

## Fix

### 1. Capture flow

1. F9 pressed.
2. `PlaytestCaptureManager` freezes the engine (optional; simplest is to skip freeze and capture the current frame).
3. `renderer.domElement.toBlob((blob) => ...)` with format `image/png`.
4. Show `PlaytestCaptureOverlay` — a centered modal with:
   - Thumbnail preview (pass the blob URL as `<img src>`).
   - Text area for annotation.
   - Submit button. Cancel button.
5. On Submit: write both the PNG (the blob) and an `.md` file with the annotation + timestamp + active mode + player position.
6. On Cancel: discard blob; hide overlay.

### 2. Session scoping

Manager stores `sessionId = <ISO timestamp at first capture>` and a monotonic `sequence` counter. Writes go to `artifacts/playtest/session-<sessionId>/<sequence>-<short-slug-from-annotation>.{png,md}`.

The `.md` file shape:

```md
# Playtest Capture <sequence>

- **Session:** <sessionId>
- **Captured at:** <local ISO>
- **Commit:** <reads from window.__engine?.commit or falls back to 'unknown'>
- **Mode:** <GameLaunchSelection.mode>
- **Player position:** <x,y,z>
- **Player vehicle:** <fixed-wing-A1 | helicopter-huey | on-foot>

## Annotation

<user's text verbatim>
```

### 3. File writing

Two strategies in priority order:
- **Preferred:** `window.showSaveFilePicker` or a persistent-directory handle cached via `FileSystemDirectoryHandle` (ask once per session). The "File System Access API" is available in Chromium.
- **Fallback:** create an `<a>` element with `href=blob:` + `download=<name>` and click it. Downloads go to the user's Downloads folder; the user can move them to `artifacts/playtest/` manually.

Detect API availability at runtime. For the test harness, stub the writer to an in-memory array.

### 4. Overlay UX

- Modal has 60% screen width, centered, dark background dim.
- Keyboard: `Enter` submits, `Esc` cancels.
- Input auto-focused on open.
- A single "session active — <N> captures" indicator somewhere unobtrusive (top-right corner, hidden by the debug-hud master toggle).

## Steps

1. Read "Required reading first."
2. Sketch `PlaytestCaptureOverlay` modal based on `SettingsModal` pattern.
3. Build `PlaytestCaptureManager` with in-memory + File System Access writers behind a single interface.
4. Wire F9 handler.
5. Write behavior test (jsdom): render overlay, simulate annotation, submit, assert writer invoked with expected payload. Cancel, assert no writer invocation.
6. Manual smoke: `npm run dev`, play, press F9, confirm modal + capture + write-to-disk prompt.
7. `npm run lint`, `npm run test:run`, `npm run build`.

## Exit criteria

- F9 while playing surfaces the modal.
- Submit writes `.png` + `.md` (via chosen writer path); cancel discards.
- Test asserts both paths behaviorally.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- `.gitignore` already covers `artifacts/` — verify; no new ignore needed unless the writer picks a different root.
- One real `.png + .md` pair committed to `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/playtest-capture-overlay/` as a demonstration artifact.

## Non-goals

- No server-side upload. Captures are local.
- No video capture. Stills only.
- No annotation tagging (severity, system, etc.) — just a free-form text area. Future nice-to-have.
- No auto-capture on a warning/error trigger. Manual-only this cycle.
- Do not integrate with `DebugHudRegistry` if it hasn't shipped — mount independently. Fast-follow migration to registry is trivial.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- `renderer.domElement.toBlob` returns null or throws (e.g., cross-origin issue with WebGL preserveDrawingBuffer) → STOP, file a finding. Fix is likely setting `preserveDrawingBuffer: true` when constructing the renderer, but that's a perf implication worth checking before landing.
- File System Access API permission prompt spams the user with every capture → STOP; cache the directory handle in session storage after the first grant.

## Pairs with

- `debug-hud-registry` (soft dependency: if registry lands, the "session active — N captures" indicator registers as a panel). Not a blocker.
- `airfield-sandbox-mode` (independent; but capture flow is most useful when combined with sandbox mode).
