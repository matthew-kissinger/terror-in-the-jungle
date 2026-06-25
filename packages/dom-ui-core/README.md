# DOM UI Core

Small DOM component lifecycle and focus helpers for canvas apps.

## Provenance

Generalized from TIJ `src/ui/engine/UIComponent.ts` and modal/focus cleanup
patterns. It excludes HUD, minimap, touch controls, gameplay snapshots, and
Preact signals.

## API

- `DisposableScope`
- `UIComponent`
- `FocusTrap`
- `createElement`

## Non-Goals

- No framework runtime.
- No gameplay UI.
- No CSS system.

