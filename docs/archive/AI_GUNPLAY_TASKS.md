# AI Gunplay Implementation Tasks (ARCHIVED)

> **Status**: COMPLETE - All tasks implemented. This document is kept for historical reference.
> **Completed**: 2025
> **Current system**: `src/systems/combat/` - CombatantAI, AI state machine (patrol/engage/defend), LOD manager, targeting, LOS

---

## Summary

Transformed AI combatants to fight using the same gunplay mechanics as the player, with skill-based modifiers for realism and fairness. The system now supports 120+ NPCs across game modes with faction-based combat (US vs OPFOR).

## What Was Implemented

1. **CombatantSystem** with full faction support (US vs OPFOR)
2. **AI Skill Profiles** - reaction delay, aim jitter, burst control per soldier role
3. **AI State Machine** - PATROLLING, ALERT, ENGAGING, SUPPRESSING, ADVANCING, DEFENDING, DEAD
4. **Squad Mechanics** - leaders/followers, formation movement, coordinated fire
5. **LOD System** - distance-based update rates for 60+ NPCs at 60fps
6. **GunplayCore Integration** - unified damage model for all combatants
7. **Spatial Systems** - octree for target acquisition, influence maps for territory control

## Architecture (Current)

```
src/systems/combat/
├── CombatantAI.ts              # Main AI logic, state transitions
├── CombatantLODManager.ts      # Distance-based LOD tiers
├── PlayerSquadController.ts    # Player squad coordination
├── SquadManager.ts             # Squad formation and assignment
├── SpawnPositionCalculator.ts  # Safe spawn point selection
├── InfluenceMapSystem.ts       # Territory influence tracking
└── ai/
    ├── AILineOfSight.ts        # LOS checks with raycast budget
    ├── AITargeting.ts          # Target acquisition and priority
    ├── AIStatePatrol.ts        # Patrol behavior
    ├── AIStateEngage.ts        # Combat engagement
    ├── AIStateDefend.ts        # Defensive behavior
    └── RaycastBudget.ts        # Per-frame raycast limiting
```

## Remaining Future Work

- BVH-based terrain occlusion for LOS checks
- Vegetation density concealment
- Debug visualization overlays (vision cones, firing lines)
