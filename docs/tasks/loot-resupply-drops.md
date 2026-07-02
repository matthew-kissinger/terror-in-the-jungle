# Task: loot-resupply-drops

Campaign: greenlight-followthrough (2026-07-02), Wave 2.
Owner fork **F4 → L1**: resupply drops on `npc_killed` (capped, expiring); delete the
obsolete `WeaponPickupSystem`. Design context:
[docs/rearch/HEALING_AND_LOOTING_SCOPE_2026-06-28.md](../rearch/HEALING_AND_LOOTING_SCOPE_2026-06-28.md)
§2 (Option L1 — pickups grant a *resupply*, not a weapon swap, sidestepping the
`WeaponType` ↔ `LoadoutWeapon` enum reconciliation entirely).

## What shipped

A new `LootResupplySystem` (`src/systems/weapons/LootResupplySystem.ts`):

- **Spawn-on-death.** Self-subscribes to `GameEventBus` `npc_killed` in `init()`
  (position-carrying, fired from both the rifle death path `CombatantDamage` and
  the explosion death path `CombatantSystemDamage`; player-proxy kills excluded
  there to avoid double-count). Rolls a 30% drop chance and spawns a small
  terrain-clamped emissive resupply pack at the death position.
- **Pickup.** Player within 1.8 m presses **E** on foot → grants one magazine of
  reserve ammo for the CURRENT weapon (routed through the existing ammo machinery —
  new `AmmoManager.addReserveAmmo` + `FirstPersonWeapon.resupplyCurrentWeaponMagazine`,
  the fenced `IAmmoManager` interface unchanged), +1 grenade (clamped by
  `InventoryManager.addGrenades`), and +1 bandage **only if** the inventory exposes
  a bandage surface. Bandages are NOT on master yet (sibling `healing-mvp`), so the
  grant is behind a structural `typeof addBandages === 'function'` guard and is a
  no-op today. When healing-mvp lands its `addBandages`, packs will grant bandages
  with no further change here.
- **E double-trigger.** `E` is the universal vehicle-exit binding while seated
  (`PlayerInput` line ~536). The pickup handler gates on a seated predicate
  (`playerController.isInAnyVehicle()`), making pickup (on-foot + proximity) and
  vehicle-exit (seated) mutually exclusive — no double-trigger. Vehicle *boarding*
  is **F** (task `F`, not in scope), so no entry-key conflict either.
- **Lifecycle.** Packs expire after 60 s; hard cap of 24 live packs with
  oldest-evicted. All meshes are pooled (shared geometry/material, recycled `Mesh`
  instances) — no per-frame allocation. Proximity prompt (`E: Resupply`) reuses the
  existing on-foot HUD interaction-prompt machinery (`IHUDSystem.showInteractionPrompt`
  / `hideInteractionPrompt`), same surface `GroundVehicleProximityChecker` uses.

Registered through the standard six-site path (registry type-map + key list,
initializer construction + `allSystems`, updater call, schedule entry under the
`Weapons` phase, composer dependency wiring). The `SystemManager` typed getter is
deliberately omitted — `napalmFireSystem`/`zoneCaptureEffects` set the precedent
(no getter when the system is only reached via `refs`), and adding one would push
the grandfathered `SystemManager.ts` method count past its budget snapshot.

Deleted `WeaponPickupSystem.ts` + its test from `src/systems/weapons/` (dormant
prototype, own 3-weapon enum, placeholder swap, zero production callers).

## Files touched

- **NEW** `src/systems/weapons/LootResupplySystem.ts`
- **NEW** `src/systems/weapons/LootResupplySystem.test.ts`
- `src/systems/weapons/AmmoManager.ts` — `addReserveAmmo(rounds)` (concrete class; fence untouched)
- `src/systems/player/FirstPersonWeapon.ts` — `resupplyCurrentWeaponMagazine()`
- `src/core/SystemRegistry.ts`, `SystemInitializer.ts`, `SystemUpdater.ts`,
  `SystemUpdateSchedule.ts`, `GameplayRuntimeComposer.ts` (+ its test) — registration/wiring
- **DELETED** `WeaponPickupSystem.ts` + `WeaponPickupSystem.test.ts` (were under `src/systems/weapons/`)

## Non-goals / notes

- No weapon swap (that is L2/L3, deferred).
- No new CSS/DOM UI (reuses HUD interaction prompt) — CSS Modules rule not engaged.
- **combat120 implication:** `npc_killed` fires in AI_SANDBOX, so the combat120
  capture will now see packs spawn. The system's per-frame cost is trivial (early-out
  when no live packs; pooled meshes; O(N≤24) proximity scan) and it is scheduled in
  the `Weapons` phase. No allocation on the hot path.

## Validation

- `npm run typecheck` — PASS
- `npm run lint` — PASS (1 pre-existing out-of-scope warning in ZoneManager.test.ts)
- `npm run lint:budget` — PASS (0 failures)
- `npm run check:export-ratchet` — PASS (dead-export surface shrank; deleted system)
- `npm run test:run -- <touched files>` — PASS (99 tests)
- `npm run build` — PASS
