# Task C4: Dev-mode stability harness (optional helper for C1)

**Phase:** C (parallel; can be folded into C1 if implementer prefers)
**Depends on:** Foundation
**Blocks:** nothing
**Playtest required:** no
**Estimated risk:** low
**Files touched:** `scripts/perf-capture.ts`, `scripts/fixed-wing-runtime-probe.ts`

## Problem

Even if C1 (migrate to build mode) lands, we will still sometimes run the harness in dev mode for debugging. In dev mode, repeated headless captures leave the Vite dev server in a bad state — observed symptoms include `"send was called before connect"` and dynamic-import module fetch failures.

## Goal

Dev-mode captures are robust across repeated runs. Server is explicitly torn down between captures; no lingering state across runs.

## Required reading first

- `scripts/perf-capture.ts` — current server lifecycle (startup, reuse, teardown).
- `scripts/fixed-wing-runtime-probe.ts` — same pattern (they share helpers).

## Suggested approach

1. Change the default server lifecycle in the harness: **start fresh, tear down at end.** Remove the `--reuse-dev-server` default (or invert it to opt-in only).
2. Before starting, kill any process holding the target port (Windows: `netstat -ano | findstr :<port>` + `taskkill /PID <pid> /F`; cross-platform via a small helper).
3. After the capture, ensure the spawned server is definitely killed (taskkill on Windows, SIGKILL fallback on Unix).
4. Add explicit logging of server PID startup/shutdown to the capture log.

This task may be a no-op if C1 fully replaces dev mode with build+preview. In that case, close C4 as subsumed.

## Verification

- Run 3 consecutive `npm run perf:capture:combat120` (dev mode explicitly) with no errors.
- After final capture, no lingering node/vite processes hold the port.
- Run one probe, then immediately one perf capture — both succeed.

## Non-goals

- Don't replicate C1's work.
- Don't add new test scenarios.
- Don't touch Playwright internals.

## Exit criteria

- Dev-mode captures are robust across ≥3 consecutive runs.
- Server lifecycle explicit and logged.
- PR titled `chore(perf-harness): ensure clean dev server lifecycle between captures (C4)`.
- PR body includes evidence of ≥3 consecutive captures without error.
