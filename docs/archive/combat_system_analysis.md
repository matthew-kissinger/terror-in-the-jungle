# Combat System Deep Dive Analysis (ARCHIVED)

> **Status**: This analysis was accurate at time of writing but the combat system has been refactored since.
> **Date**: 2025 (original analysis)
> **Current system**: Combat logic split across `src/systems/combat/` (AI) and `src/systems/weapons/` (gunplay)

---

## Current Architecture (Updated)

The monolithic CombatantSystem has been refactored into:

### AI System (`src/systems/combat/`)
- `CombatantAI.ts` - Orchestrates AI updates, state transitions
- `CombatantLODManager.ts` - Distance-based LOD tiers
- `PlayerSquadController.ts` - Player's squad behavior
- `SquadManager.ts` - Squad formation, assignment, coordination
- `SpawnPositionCalculator.ts` - Safe spawn point selection
- `InfluenceMapSystem.ts` - Territory influence tracking
- `ai/AIStatePatrol.ts` - Patrol and zone-seeking behavior
- `ai/AIStateEngage.ts` - Combat engagement logic
- `ai/AIStateDefend.ts` - Defensive positioning
- `ai/AILineOfSight.ts` - FOV, range, LOS checks with raycast budget
- `ai/AITargeting.ts` - Priority-based target selection
- `ai/RaycastBudget.ts` - Per-frame raycast limiting

### Weapon Systems (`src/systems/weapons/`)
- `GunplayCore.ts` - Ballistics, damage calculation, spread/recoil
- `AmmoSupplySystem.ts` - Ammo management and resupply
- `GrenadeSystem.ts` - Grenade throw, trajectory, explosion
- `MortarSystem.ts` - Mortar deploy, aim, fire
- `SandbagSystem.ts` - Fortification placement with collision
- `WeaponPickupSystem.ts` - Dropped weapon pickups

### Player Weapon (`src/systems/player/weapon/`)
- `WeaponInput.ts` - Fire, ADS, reload input handling
- `WeaponRigManager.ts` - First-person weapon model positioning
- `WeaponAmmo.ts` - Magazine and reserve ammo tracking
- `WeaponShotCommandBuilder.ts` - Shot direction calculation
- `WeaponShotExecutor.ts` - Hit detection and damage application

## Key Differences from Original Analysis

- AI state machine extracted into separate state classes (not inline in CombatantSystem)
- Raycast budget system limits per-frame LOS checks
- Spawn position calculator validates terrain before spawning
- LOD manager is a separate, configurable component
- 6 weapon slots instead of single rifle (shotgun, grenade, primary, sandbag, SMG, pistol)
- Sandbag system provides deployable cover with AABB collision
- Zone configurations are mode-specific (different per game mode)

## Balance Values (Still Accurate)

- Player Health: 100 HP, regenerates 20 HP/s after 5s delay
- NPC Health: 100 HP, no regeneration
- Starting Tickets: 300 per faction
- Death Penalty: 2 tickets
- Spawn Protection: 3 seconds
- Zone Capture: presence-based, variable speed
