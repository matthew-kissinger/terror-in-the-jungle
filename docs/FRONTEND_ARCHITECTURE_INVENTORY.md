# Frontend Architecture Inventory

Last updated: 2026-02-23
Scope: HUD composition, input/control flow, responsive viewport/render flow.

## Ownership Map

| Domain | Primary owner | Key files |
|---|---|---|
| HUD composition/layout | `HUDLayout` + `HUDSystem` | `src/ui/layout/HUDLayout.ts`, `src/ui/layout/HUDLayoutStyles.ts`, `src/ui/hud/HUDSystem.ts` |
| HUD component mounting | `HUDElements` | `src/ui/hud/HUDElements.ts` |
| Input normalization | `InputManager` (wrapper) | `src/systems/input/InputManager.ts`, `src/systems/player/PlayerInput.ts` |
| Input context gating | `InputContextManager` | `src/systems/input/InputContextManager.ts`, `src/ui/map/FullMapInput.ts`, `src/core/GameEngineInput.ts` |
| Player action bridge | `PlayerController` | `src/systems/player/PlayerController.ts` |
| Squad command execution | `PlayerSquadController` | `src/systems/combat/PlayerSquadController.ts` |
| Viewport classification | `ViewportManager` | `src/ui/design/responsive.ts` |
| Renderer viewport sync | `GameRenderer` | `src/core/GameRenderer.ts` |
| Design tokens (colors/layers/breakpoints) | `tokens` | `src/ui/design/tokens.ts` |

## HUD Render Flow

1. `HUDSystem.init()` mounts `HUDLayout` root and sets viewport-derived CSS vars.
2. `HUDElements.attachToDOM(layout)` mounts HUD elements into named slots.
3. Scoreboard and stats panels mount under HUD root/slots (not global body ownership for gameplay HUD).
4. Legacy feedback systems (damage numbers, score popups, hit marker) mount into layout center/kill-feed slots while still using screen-space fixed positioning for animation.
5. `HUDSystem.update()` performs 5Hz static updates + per-frame animation updates.

## Input Flow (Current Target Architecture)

1. Device events enter `PlayerInput` (keyboard/mouse/touch/gamepad).
2. `InputManager` wraps callbacks and blocks gameplay actions outside `gameplay` context.
3. `InputContextManager` tracks current context (`gameplay|map|menu|modal`) and is updated by map/menu systems.
4. `PlayerController` receives normalized callbacks and executes gameplay systems.
5. Squad quick commands (`Shift+1..5`) are centralized through `PlayerInput -> InputManager -> PlayerController -> PlayerSquadController.issueQuickCommand()`.

## Responsive + Renderer Flow

1. `ViewportManager` measures viewport class/scale/orientation.
2. `HUDSystem` consumes viewport updates for HUD CSS variable updates.
3. `GameRenderer` subscribes to `ViewportManager` and applies camera + renderer + postprocess sizes from shared viewport data.
4. `GameEngineInput` still listens to `resize`, but resize now re-applies `ViewportManager` state for consistency.

## Conflict Register

| Conflict | Current state | Next migration step |
|---|---|---|
| Multiple top-level key listeners | Reduced by context gating and squad shortcut centralization | Migrate any remaining gameplay-affecting hotkeys into `InputManager` action map |
| HUD layering magic numbers | Converted critical feedback systems to token z-layers | Enforce token-only z-index via lint rule/PR guard |
| HUD direct body mounting | Scoreboard and HUD root ownership moved under layout root for gameplay path | Remove legacy no-layout fallback path after stabilization |
| Viewport split between HUD/renderer | Renderer now follows `ViewportManager` subscriptions | Add explicit safe-area aware camera framing policy |

## External Reference Practices Adopted

- MDN Gamepad guidance: event + per-frame polling model.
- W3C Gamepad WD alignment: normalized axes/buttons and standard mapping assumptions.
- web.dev viewport unit strategy: `dvh`-first layout with legacy fallback.
- Safe-area strategy: `env(safe-area-inset-*)` in HUD root.
- Open-source pattern mirroring:
  - merged-input style action unification (`InputManager` wrapper).
  - virtual-joystick style mobile parity (existing touch controls kept under centralized callbacks).

