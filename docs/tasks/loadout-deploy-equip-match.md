<!-- 80 LOC cap. Diagnosis handed down from the 2026-06-04 deploy/zone/vehicle triage. -->
# loadout-deploy-equip-match

Owner report: "weapon loadout deployed is not the same as one I had on me — state
must match default or selected state." When the player deploys, the weapon
actually equipped in-hand does not match the loadout they selected (or the
default). Closes UX-5. The player will see: pick loadout L on the deploy screen →
spawn holding exactly L's primary weapon, every time, on first deploy and on
every respawn.

## Required reading first

- `src/systems/player/PlayerRespawnManager.ts` — respawn path `respawn()` :409 →
  `applyActiveLoadout()` :647; `confirmRespawn()` **returns early for `initial`
  and never calls `respawn()`** :521; `syncLoadoutContext()` :660.
- `src/core/InitialDeployStartup.ts` — initial deploy applies the loadout through
  a SEPARATE path: `applyConfiguredLoadout()` :32, called :58 (note: relative to
  `startGame` in `src/core/GameEngineInit.ts` :154-161 — check for a clobber).
- `src/systems/player/LoadoutService.ts` — `applyToRuntime()` :516 (writes BOTH
  InventoryManager and FirstPersonWeapon).
- `src/systems/player/InventoryManager.ts` — `setLoadout()` :116 (currentSlot
  preservation heuristic), `reset()` :283.
- `docs/TESTING.md` before writing the test.

## Files touched

- `src/systems/player/PlayerRespawnManager.ts` and/or `src/core/InitialDeployStartup.ts`
- `src/systems/player/LoadoutService.ts` and/or `src/systems/player/InventoryManager.ts`
- `src/.../<deploy-equip>.test.ts` (new)

## Scope

1. **Repro first.** Add a deterministic L3 test driving deploy→spawn for BOTH
   initial deploy and respawn, asserting: equipped weapon (FirstPersonWeapon
   primary) == selected `loadout.primaryWeapon` AND `InventoryManager` active slot
   == primary slot. This test is the disambiguator — write it before any fix.
2. Fix the divergence the test exposes. Two leading suspects: (a) initial deploy
   applies the loadout before `startGame` weapon-init resets it to a default;
   (b) InventoryManager slot vs FirstPersonWeapon rendered-weapon desync.
3. Make the apply path idempotent: after spawn the equipped weapon deterministically
   equals the loadout primary, regardless of which slot the player held pre-death.
4. Cover a non-default preset and a faction switch (US ↔ VC) in the test.

## Non-goals

- No fenced-interface change (`IFirstPersonWeapon` / `IAmmoManager` stay as-is). If
  a fix seems to need one, STOP and surface the delta for `[interface-change]`.
- No loadout UI restyle, no new loadout/ammo features. Behavior-correctness only.

## Acceptance

- [ ] New L3 test green: equipped == selected for initial deploy + 2 respawns +
      faction switch + non-default preset.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR against `master` linking this brief; owner playtest deferred to
      `docs/PLAYTEST_PENDING.md`.
