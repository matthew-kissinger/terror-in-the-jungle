# UI Standardization Guide

Last updated: 2026-02-23
Scope: visual consistency, CSS debt reduction, component strategy for game UI.

## Executive Direction

- Keep **custom in-game HUD components** (`UIComponent` + CSS Modules) as the core approach.
- Adopt a **small component primitive library only for non-game overlays** (settings/modals/forms), not for combat HUD.
- Standardize all visual styling through `tokens.ts` and shared module primitives.

## Component Library Decision

### Why not a full component lib for gameplay HUD

- HUD elements are highly positional, animated, and tightly coupled to gameplay loops.
- Generic libraries add styling/runtime overhead and often fight with fixed/overlay render constraints.
- Existing architecture already has a custom component runtime (`src/ui/engine/UIComponent.ts`) that is better suited.

### Where a library is useful

- Menus, settings panels, modal dialogs, keyboard navigation, focus management.
- Recommended pattern: use lightweight primitives (e.g., Radix-like approach) wrapped in project styles/tokens.

## CSS Standardization Rules

1. No inline style injection for reusable components.
2. No hardcoded z-index values outside `tokens.zIndex`.
3. No direct `document.body` mounting for gameplay HUD (except top-level app shell).
4. All spacing/sizing/color values should come from design tokens.
5. Every new component should use CSS Modules and shared utility classes from `src/ui/engine/shared.module.css`.

## Visual Cleanup Priorities

1. Consolidate typography scale and remove mixed ad-hoc font sizes.
2. Normalize panel chrome (single glass style family + border style).
3. Increase whitespace on phone layouts (reduce stacked density around center).
4. Add hierarchy rules:
   - primary combat info high contrast
   - secondary context medium contrast
   - tertiary diagnostics low contrast
5. Standardize icon and button sizing by touch target tokens (`44/48/64`).

## “Experienced Game Dev” UI Pass Checklist

- Readability at glance:
  - Can player identify health/ammo/objective in < 500 ms?
- Reachability:
  - Mobile thumb controls reachable without stretch in portrait/landscape.
- Conflict-free states:
  - No accidental input overlap between map/menu/gameplay.
- Safe-area compliance:
  - Critical controls never under notches/home indicators.
- Cognitive load:
  - Remove or dim non-essential HUD in ADS/combat-intense states.

## Next Iteration (Design + Implementation)

1. Run `npm run ui:matrix` and review screenshots/metrics.
2. Resolve any overlap/offscreen/crowding warnings.
3. Migrate remaining legacy inline HUD components to CSS modules.
4. Introduce a `ui-surface` primitive style class family for all overlays.
5. Add a visual QA gate to PR checklist using matrix report artifacts.

