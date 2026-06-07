# Deploy Armory Loadout Rearch

Date: 2026-06-07
Status: spike + implementation plan
Scope: deploy loadout UX, weapon-slot input routing, runtime equip alignment

## Problem

The loadout system exists, but the player-facing flow does not read like an intentional pre-deploy armory:

- The loadout editor is buried late in the deploy sidebar after spawn, vehicle, sequence, and legend panels.
- Keyboard `Q` cycles every enabled inventory slot, including equipment, instead of only weapons.
- Gamepad `Y` cycles `(current + 1) % 3`, which assumes legacy slot order and lands on throwable/equipment slots.
- Touch weapon cycling uses a hard-coded six-slot list and static labels, so it can select equipment or disabled slots after a loadout changes.
- The desktop HUD can optimistically highlight a disabled slot before rejecting selection.
- The deploy UI does not show a kit preview, so loadout changes feel abstract and disconnected from the eventual in-hand weapon.

That explains how UX-3/UX-5 can be code-complete while the player experience still feels broken.

## R&D

- Unreal Lyra separates inventory from equipment: inventory is persistent data owned by the controller; equipment is the currently held/worn/used runtime representation owned by the pawn. Its quickbar equips inventory items and the equipped item owns visible actors/abilities. Reference: <https://dev.epicgames.com/documentation/en-us/unreal-engine/lyra-inventory-and-equipment-in-unreal-engine>
- Unity's UI Toolkit Dragon Crashers sample treats character/inventory screens as separate menu surfaces with character preview and data-backed item slots. The useful principle is not the framework; it is decoupling UI layout from backend item data while giving the player a visual preview. Reference: <https://unity.com/blog/try-the-new-ui-toolkit-sample-now-available-on-the-asset-store>
- Tried-and-true FPS quickbars keep "select/cycle weapons" distinct from "use equipment." Equipment may occupy nearby HUD space, but quick-switch must traverse only currently usable weapon entries.

## First-Principles Boundary

1. **Catalog and persistence**: `LoadoutTypes` and `LoadoutService` own faction pools, presets, saved loadouts, and sanitization.
2. **Deploy edit surface**: `DeployScreen` edits the active loadout through callbacks; it should not equip runtime meshes directly.
3. **Runtime inventory**: `InventoryManager` projects the selected loadout into enabled runtime slots and knows which slots are weapons.
4. **Equip/render state**: `PlayerController` and `FirstPersonWeapon` turn a selected runtime weapon slot into visible first-person assets and ammo state.
5. **Input/HUD surfaces**: keyboard, gamepad, touch, and HUD must all consume the same `getWeaponCycleSlots()` contract.

This keeps the change fence-safe: no `src/types/SystemInterfaces.ts` change is needed.

## Target UX

Use a Call-of-Duty-like structure without cloning its presentation:

- Deployment has two first-class views: **Insertion** and **Armory**.
- Insertion keeps the map, spawn list, vehicle markers, threat readout, and deploy button.
- Armory gets a full deploy sub-screen with:
  - a paper-doll character silhouette,
  - asset-backed primary/secondary/equipment icons,
  - preset controls,
  - primary, secondary, equipment, and ammo-load selectors,
  - faction availability chips.
- The deploy button remains pinned so loadout customization is part of deployment, not a separate dead-end menu.
- Runtime equip remains driven by `LoadoutService.applyToRuntime()` when the player deploys.

## Implementation Slice

1. Add DeployScreen view state:
   - `Insertion` tab shows map + spawn/vehicle/list panels.
   - `Armory` tab shows armory preview + loadout controls.
   - Keep existing DOM ids for deploy/loadout tests.
2. Add armory preview:
   - Use existing pixel UI icons from `IconRegistry`.
   - Use CSS paper-doll silhouette instead of a real character GLB for this slice; a real model preview should wait until there is an accepted character-preview asset and render-texture/viewer budget.
3. Fix weapon-cycle contract:
   - `InventoryManager.cycleWeapon()` uses `getWeaponCycleSlots()`.
   - `PlayerInput` gets `setWeaponCycleSlots()` and gamepad `Y` cycles that data.
   - `PlayerController.syncLoadoutHud()` pushes slot labels and weapon-cycle slots into HUD and touch controls.
   - `TouchActionButtons` cycles only configured weapon slots and renders configured labels.
   - `UnifiedWeaponBar` only highlights selectable enabled slots.
4. Add behavior tests:
   - keyboard Q skips equipment,
   - gamepad Y uses configured weapon cycle slots,
   - touch swipe/chevrons use configured weapon cycle slots and labels,
   - deploy armory view is discoverable and preview updates from loadout.

## Deferred Work

- True 3D character preview with attached weapon GLBs. This needs a bounded mini-scene/render-texture plan and asset acceptance; doing it in this pass risks loading/runtime complexity in the deploy overlay.
- Direct click-to-pick option grid per slot. The current service supports cycling; a grid picker can follow once the view/state split is stable.
- Loadout changes while already spawned. Current scope is pre-deploy customization; live inventory swapping should remain a separate design.

## Validation

- Run focused Vitest files for inventory/input/touch/deploy screen.
- Run `npm run typecheck`, `npm run lint`, and `npm run test:quick` or `npm run validate:fast` depending on runtime.
- Browser smoke the deploy screen and armory tab with local Vite.
- Human playtest still required for final feel sign-off because this changes deployment UX and weapon switching.
