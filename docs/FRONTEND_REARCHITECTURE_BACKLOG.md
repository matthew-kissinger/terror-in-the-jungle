# Frontend Rearchitecture Backlog

Last updated: 2026-02-23
Owner: frontend/runtime

## Scope

This backlog operationalizes the frontend rearchitecture across:
- action-based input + context routing
- unified HUD composition + tokenized layering
- viewport-synchronous HUD/render behavior
- cross-device validation gates

## Phase Board

| Phase | Outcome | Status | Acceptance criteria |
|---|---|---|---|
| Phase 1 | Inventory + guardrails | DONE | Ownership map published, conflict register published, context manager introduced |
| Phase 2 | Input consolidation | IN_PROGRESS | `InputManager` wrapper active in player flow, squad quick commands centralized, context gating applied in map/debug paths |
| Phase 3 | HUD composition unification | IN_PROGRESS | Scoreboard/HUD gameplay mounting under layout root, key feedback z-layers tokenized |
| Phase 4 | Responsive/viewport unification | IN_PROGRESS | Renderer subscribes to `ViewportManager`, shared viewport source between HUD and renderer |
| Phase 5 | Validation hardening | TODO | Device matrix, input conflict checks, HUD overlap checks, perf-tail check integrated into release gate |

## Immediate Implementation Tasks

1. Remove last gameplay UI body-mount fallback path in `HUDElements` after migration burn-in.
2. Move map hotkey handling under input action map to eliminate direct window key ownership.
3. Migrate squad command feedback and panel from inline styles to CSS module + tokens.
4. Add gamepad-specific UI prompt mode using `InputManager.onInputModeChange()`.
5. Integrate safe-area rectangle into renderer camera framing policy.

## Device Matrix (Required Before Feature Complete)

| Device profile | Input mode | Required checks |
|---|---|---|
| Desktop 1080p | Keyboard+mouse | pointer lock, HUD overlap, squad quick commands, map context lockout |
| Desktop 1080p | Gamepad | right-stick look, weapon switching, scoreboard/menu behavior, prompt switching |
| Phone portrait | Touch | joystick/fire/ADS reachability, safe-area clipping, portrait HUD readability |
| Phone landscape | Touch | command/menu access, minimap readability, no accidental map/gameplay conflict |
| Tablet landscape | Touch + optional gamepad | runtime mode switching, HUD scaling, combat readability |

## Validation Gates

### Input conflict gate
- No duplicated command firing for `Shift+1..5`, `Z`, `M`, `Esc`.
- No gameplay actions processed while context is `map`, `menu`, or `modal`.

### HUD layout gate
- No critical overlap for weapon bar, minimap, ammo, interaction prompts, and touch controls.
- No hidden-by-notch critical text or controls on tested mobile devices.

### Render/viewport gate
- Renderer and postprocessing dimensions track `ViewportManager` values during orientation and resize events.
- No camera aspect mismatch or stretched output after orientation changes.

### Performance gate
- No regression in frame-time tails on baseline scenarios (`combat120` and target map smoke pass).
- HUD/input changes do not increase per-frame allocations in hot paths.

