# Weapons Domain

> Self-contained reference. 5 blocks, shared 1ms tick budget.
> GunplayCore is the shared ballistics kernel - used by both player and AI fire resolution.
> GrenadeSystem and MortarSystem borrow effect pools from CombatantSystem via setter.

[GH]: https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src

---

## Blocks

| Block | File | Tick | Deps | Fan-In |
|-------|------|------|------|--------|
| [GrenadeSystem]([GH]/systems/weapons/GrenadeSystem.ts) | systems/weapons/GrenadeSystem.ts | Weapons (1ms) | 7 | 2 |
| [MortarSystem]([GH]/systems/weapons/MortarSystem.ts) | systems/weapons/MortarSystem.ts | Weapons (1ms) | 4 | 2 |
| [SandbagSystem]([GH]/systems/weapons/SandbagSystem.ts) | systems/weapons/SandbagSystem.ts | Weapons (1ms) | 2 | 1 |
| [AmmoSupplySystem]([GH]/systems/weapons/AmmoSupplySystem.ts) | systems/weapons/AmmoSupplySystem.ts | Weapons (1ms) | 3 | 0 |
| [WeaponPickupSystem]([GH]/systems/weapons/WeaponPickupSystem.ts) | systems/weapons/WeaponPickupSystem.ts | untracked | 0 | 0 |

---

## Module Registry

All files are flat in `src/systems/weapons/` (no subdirectories).

| Module | File | Role |
|--------|------|------|
| [GrenadePhysics]([GH]/systems/weapons/GrenadePhysics.ts) | GrenadePhysics.ts | Projectile integration, bounce, fuse. Also exports `GrenadeSpawner` class. |
| [GrenadeEffects]([GH]/systems/weapons/GrenadeEffects.ts) | GrenadeEffects.ts | Explosion VFX, delegates to shared pools |
| [GrenadeArcRenderer]([GH]/systems/weapons/GrenadeArcRenderer.ts) | GrenadeArcRenderer.ts | Predictive arc line. Also exports `GrenadeHandView` and `GrenadeCooking` classes. |
| [GrenadeCallout]([GH]/systems/weapons/GrenadeCallout.ts) | GrenadeCallout.ts | "Grenade!" voice/UI callout trigger |
| [MortarBallistics]([GH]/systems/weapons/MortarBallistics.ts) | MortarBallistics.ts | Parabolic flight math, terrain intersection |
| [MortarCamera]([GH]/systems/weapons/MortarCamera.ts) | MortarCamera.ts | Top-down targeting camera mode |
| [MortarRoundManager]([GH]/systems/weapons/MortarRoundManager.ts) | MortarRoundManager.ts | Active rounds list, per-round lifecycle |
| [MortarVisuals]([GH]/systems/weapons/MortarVisuals.ts) | MortarVisuals.ts | Round mesh, smoke trail, impact ring |
| [AmmoManager]([GH]/systems/weapons/AmmoManager.ts) | AmmoManager.ts | Per-weapon ammo counts, resupply logic |
| [GunplayCore]([GH]/systems/weapons/GunplayCore.ts) | GunplayCore.ts | **Shared ballistics kernel** - hitscan, damage, spread. Also exports `RecoilPattern` class. |
| [ProgrammaticExplosivesFactory]([GH]/systems/weapons/ProgrammaticExplosivesFactory.ts) | ProgrammaticExplosivesFactory.ts | Procedural geometry for explosive objects |

Note: `GrenadeSpawner`, `GrenadeHandView`, `GrenadeCooking`, and `RecoilPattern` are exported classes within the files above, not separate files.

---

## Wiring

### GrenadeSystem receives (7):

| Dep | Method |
|-----|--------|
| CombatantSystem | setCombatantSystem |
| InventoryManager | setInventoryManager |
| TicketSystem | setTicketSystem |
| AudioManager | setAudioManager |
| PlayerController | setPlayerController |
| FlashbangScreenEffect | setFlashbangEffect |
| VoiceCalloutSystem | setVoiceCalloutSystem |

Also receives `ImpactEffectsPool` + `ExplosionEffectsPool` from CombatantSystem via setter.

### MortarSystem receives (4):
CombatantSystem, InventoryManager, AudioManager, TicketSystem. Same pool injection.

### SandbagSystem receives (2):
InventoryManager, TicketSystem.

### AmmoSupplySystem receives (3):
ZoneManager, InventoryManager, FirstPersonWeapon.

---

## Key Design Notes

- **GunplayCore is shared** - both player weapon fire ([WeaponShotExecutor]([GH]/systems/player/weapon/WeaponShotExecutor.ts)) and AI fire ([CombatantCombat]([GH]/systems/combat/CombatantCombat.ts)) import from GunplayCore. Do not duplicate ballistic logic.
- **Effect pool borrowing** - GrenadeSystem and MortarSystem do not own explosion/impact pools. They receive them from CombatantSystem post-init via SystemConnector.
- **MortarCamera** - skipped when mortar is not deployed, zero cost.
- **WeaponPickupSystem** - zero deps, self-scans scene for pickup objects.

---

## Related

- [Hub](../CODEBASE_BLOCKS.md) | [Player](player.md) | [Combat](combat.md) | [World](world.md)
- [systems/weapons/ directory]([GH]/systems/weapons)
