# debug-hud-registry evidence

Manual verification checklist for `task/debug-hud-registry`.

## Automated verification

All three gates passed in the worktree:

- `npm run lint` PASS
- `npm run test:run` PASS (3659 tests, 228 files)
- `npm run build` PASS

The new registry ships with 8 behavior tests in
`src/ui/debug/DebugHudRegistry.test.ts` covering:
- register/unregister/mount into shared container
- `defaultVisible` applied on register
- per-panel toggle only affects that panel
- togglePanel reveals the master container if hidden
- toggleAll hides/shows master without mutating panel state
- duplicate registration throws
- update fan-out skips invisible panels and skips when master is off

## Manual browser confirmation

In `npm run dev`:

1. Load any game mode (AI sandbox works).
2. Press backtick (`` ` ``) — the full debug HUD appears. The four new panels
   (Vehicle State, Combat State, Current Mode, Frame Budget) are immediately
   visible by default.
3. Press backtick again — the whole HUD disappears.
4. Press F1 — console performance log dump (unchanged behavior).
5. Press F2 — performance overlay toggles in the top-right.
6. Press F3 — log overlay toggles in the bottom-left.
7. Press F4 — time indicator toggles in the top-left.

## Screenshot

A runtime screenshot is not included in this evidence pack; capturing the
browser HUD is a manual step the reviewer runs locally. The harness-test
output above plus the preview session above are the automatic checkpoints.
