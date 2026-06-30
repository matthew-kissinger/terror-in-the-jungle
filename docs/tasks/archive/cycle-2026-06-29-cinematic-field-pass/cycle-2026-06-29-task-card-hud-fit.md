<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase 2). -->
# cycle-2026-06-29-task-card-hud-fit

Phase 2 — fix the tasking-director task card that overlaps the objectives panel
and is invisible/broken on mobile. Root cause: `HudTaskCard.mount()` does
`insertBefore` INSIDE the objectives glass panel (parasitizing it), and the
whole objectives slot is `display:none` on touch so the card never renders there.
Give it a proper device-aware home. Pure DOM/CSS; independent of all other phases.

## Files touched

- `src/ui/hud/HudTaskCard.ts`
- `src/ui/layout/HUDLayoutStyles.ts`
- `src/ui/hud/HUDSystem.ts` (ONE net-neutral mount line — file is at ratchet ceiling 878/89)
- `src/ui/hud/HudTaskCard.test.ts`

## Scope

1. Desktop: mount the card as a SIBLING in the objectives grid slot (not inside the panel); set the slot `flex-direction:column; gap:6px` and `overflow:visible` so the stack is not clipped.
2. Touch: mount under `MobileStatusBar` (status-bar slot); branch by `isTouchDevice()` in a single net-neutral line in `HUDSystem.ts`.
3. Touch styling via descendant selector `[data-device="touch"] .hud-task-card`: `width:min(80vw,360px)`, ≥40px buttons, title `nowrap`+ellipsis, `margin-top:env(safe-area-inset-top)`.

## Non-goals

- This is NOT the radio redesign (that is `radio-dial-revival`).
- NO new HUD grid region; NO growth of `HUDSystem.ts` past its 878/89 snapshot.
- The card never carries `data-device` itself — selector must be descendant-based.

## Acceptance

- [ ] Desktop: card no longer overlaps the objectives title/zone list.
- [ ] Touch: card renders, legible, ≥40px tap targets, respects safe-area.
- [ ] `npx tsx scripts/lint-source-budget.ts` confirms `HUDSystem.ts` net-neutral.
- [ ] `npm run lint && npm run test:run && npm run build` green.

## Dependencies

- Independent; can land early in parallel with P1.
