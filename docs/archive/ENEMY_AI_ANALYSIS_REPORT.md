# Enemy AI Movement Analysis Report (ARCHIVED)

> **Status**: RESOLVED - Issues identified here have been addressed through subsequent refactoring.
> **Date**: 2025 (original analysis)
> **Resolution**: CombatantSystem was refactored into modular AI state machine (`src/systems/combat/ai/`), combat enablement delay removed, LOD ranges expanded, spawn positions made mode-aware.

---

## Original Issues Identified

1. **Combat enablement delay** (1.5s) - prevented AI from processing during critical startup
2. **Distance-based LOD** - OPFOR spawned too far for proper updates
3. **Zone discovery** - NPCs couldn't find objectives if zones didn't exist yet
4. **Squad leader dependency** - entire squads failed if leader got confused

## How They Were Resolved

- Combat enable delay removed / reduced
- Pre-generation made mode-aware (chunks generated at actual spawn positions before game starts)
- Zone initialization happens before NPC spawning
- AI state machine refactored into separate state classes (patrol, engage, defend)
- LOD manager separated into `CombatantLODManager.ts` with configurable tiers
- Spawn position calculator ensures valid terrain before spawning

## Current AI Architecture

```
src/systems/combat/
├── CombatantAI.ts              # Orchestrates AI updates per LOD tier
├── CombatantLODManager.ts      # Distance-based update frequency
├── ai/
│   ├── AIStatePatrol.ts        # Zone-seeking, wander behavior
│   ├── AIStateEngage.ts        # Combat, burst fire, movement
│   ├── AIStateDefend.ts        # Defensive positioning
│   ├── AILineOfSight.ts        # FOV + range + LOS checks
│   ├── AITargeting.ts          # Priority-based target selection
│   └── RaycastBudget.ts        # Frame-budgeted raycasts
```
