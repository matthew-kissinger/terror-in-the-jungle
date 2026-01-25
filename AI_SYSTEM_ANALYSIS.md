# AI System Analysis - Complete Documentation

## CRITICAL: Current Issues & Priorities

**The AI system is the #1 development priority.** Current problems:

### Performance Crisis
- **15v15 combat tanks FPS** - AI update loop too expensive
- 100ms throttle not aggressive enough when clustered
- No spatial partitioning for hit detection
- Billboard updates not batched
- **Target**: 60+ NPCs at stable 60fps

### Behavior Improvements Needed
- NPCs are **too predictable** - just charge or stand still
- No **flanking** or **suppression** tactics
- No **cover-seeking** behavior
- Squad coordination is basic
- Pathfinding gets stuck on terrain
- Need **influence maps** for strategic positioning

### Recommended Fixes
1. **ECS Migration** (bitecs) - struct-of-arrays for cache-friendly iteration
2. **Distance-based LOD** - 60Hz near, 5Hz far field
3. **Spatial hashing** for O(1) neighbor queries
4. **Influence maps** computed in Web Worker
5. **Behavior trees** instead of simple state machine

---

## Overview
The game features a sophisticated AI combat system with two factions: **US Forces** and **OPFOR** (Opposing Forces). NPCs engage in dynamic squad-based combat with realistic behaviors, vision systems, and skill variations.

## Faction System

### US Forces (Friendly NPCs)
- **Color**: Allied faction fighting alongside the player
- **Base Location**: Spawns at position (0, 0, -50)
- **Behavior**: Generally defensive, supports player objectives

### OPFOR (Enemy NPCs)
- **Color**: Enemy faction hostile to player and US forces
- **Base Location**: Spawns at position (0, 0, 145)
- **Behavior**: Aggressive, actively hunts player and US forces

## Spawning System

### Initial Deployment
- **Initial Squad Size**: 4 soldiers per faction at game start
- **US Initial Position**: (0, 0, -50)
- **OPFOR Initial Position**: (0, 0, 145)

### Progressive Spawning
- **Queue System**: 6 reinforcement squads pre-queued
- **Spawn Delay**: 1000ms between reinforcement deployments
- **Spawn Check Interval**: Every 3 seconds
- **Maximum Combatants**: 60 total NPCs active simultaneously
- **Despawn Distance**: 150 units from player

### Dynamic Spawning Rules
- **US Minimum**: Maintains at least 10 US combatants
- **OPFOR Minimum**: Maintains at least 15 OPFOR combatants
- **Squad Size**: 4 soldiers per reinforcement squad
- **Spawn Locations**:
  - Prioritizes faction-owned zones
  - Falls back to relative positions around player
  - US spawns 20-40 units behind player
  - OPFOR spawns 80-140 units in front/sides

## Vision System

### Visual Range
- **US Forces**: 120 units maximum detection range
- **OPFOR**: 130 units maximum detection range

### Field of View
- **US Forces**: 120 degrees (60° left/right from facing direction)
- **OPFOR**: 130 degrees (65° left/right from facing direction)

### Line of Sight
- NPCs must have direct line of sight to detect enemies
- Cannot see through terrain or obstacles
- Detection checks both distance AND field of view angle

## AI States

### 1. PATROLLING
- Default state when no enemies detected
- Followers stay within 6 units of squad leader
- Leaders move toward nearest capturable zone
- Fallback: advance toward enemy base territory

### 2. ALERT
- Triggered when enemy spotted
- **Alert Duration**: 1.5 seconds
- **Reaction Delay**:
  - OPFOR Leaders: 400ms
  - OPFOR Followers: 600ms
  - US Leaders: 450ms
  - US Followers: 650ms
- Rotates to face detected target

### 3. ENGAGING
- Active combat state
- Fires weapon at target
- Adjusts position for optimal engagement (30 unit ideal distance)
- Strafes when at ideal range

### 4. SUPPRESSING
- Fires at last known enemy position
- Triggered when target breaks line of sight
- Continues firing to prevent enemy movement

### 5. DEAD
- Removed from active combat
- Affects ticket system

## Combat Behavior (UPDATED)

### Distance-Based Accuracy System
- **Base Accuracy**: Significantly reduced for survivability
- **Distance Degradation**: Exponential falloff beyond 30 units
  - 0-30 units: Base accuracy
  - 30-50 units: ~1.5-2x inaccuracy
  - 50-70 units: ~3-4x inaccuracy
  - 70-90 units: ~5-6x inaccuracy
  - 90+ units: Up to 8x inaccuracy cap

### Shooting Mechanics

#### Burst Fire (Default)
- **OPFOR Leaders**: 4-round bursts, 800ms pause
- **OPFOR Followers**: 3-round bursts, 1000ms pause
- **US Leaders**: 3-round bursts, 900ms pause
- **US Followers**: 3-round bursts, 1100ms pause

#### Full Auto Triggers
1. **Close Range** (< 15 units): 8-round bursts, 200ms pause
2. **Panic Mode** (hit within 2 seconds): 10-round bursts, 150ms pause
3. **Outnumbered** (> 2 enemies within 20 units): 6-round bursts
4. **Suppressing Fire**: 12-round bursts, 100ms pause

### Accuracy System (UPDATED)

#### Base Accuracy (Aim Jitter in degrees)
- **OPFOR Leaders**: 1.2° jitter (was 0.3°)
- **OPFOR Followers**: 1.8° jitter (was 0.5°)
- **US Leaders**: 1.5° jitter (was 0.4°)
- **US Followers**: 2.0° jitter (was 0.6°)

#### Accuracy Modifiers
- **First Shot Accuracy**:
  - OPFOR: 0.4x multiplier (was 0.15x, now less accurate)
  - US: 0.5x multiplier (was 0.2x, now less accurate)
- **Burst Degradation**:
  - OPFOR: 3.5x degradation per shot (was 2.0x)
  - US: 4.0x degradation per shot (was 2.5x)
- **Full Auto Penalty**: Additional 2.0x accuracy reduction (was 1.5x)
- **Maximum Degradation**: Capped at 8.0x (was 4.0x)
- **Distance Penalty**: Exponential growth beyond 30 units

#### Target Leading (UPDATED)
- **OPFOR Leaders**: 70% leading accuracy (was 90%)
- **OPFOR Followers**: 50% leading accuracy (was 80%)
- **US Leaders**: 60% leading accuracy (was 85%)
- **US Followers**: 40% leading accuracy (was 75%)

### Engagement Range & Behavior (UPDATED)

#### Engagement Probability by Distance
- **< 30 units**: 100% engagement chance
- **30-60 units**: 80% engagement chance
- **60-90 units**: 50% engagement chance
- **> 90 units**: 20% engagement chance (suppressing fire only)

#### Objective-Focused NPCs (NEW)
- **40% of OPFOR** are objective-focused
- Will only engage enemies if:
  - Within 30 units (close range)
  - Recently shot (within 3 seconds)
  - Defending captured zone
- Otherwise prioritize zone capture/movement

#### Movement Behavior
- **Maximum Engagement**: 150 units
- **Ideal Combat Distance**: 30 units
- **Advance Threshold**: > 40 units (moves closer)
- **Retreat Threshold**: < 20 units (backs away)

#### Reaction Time Scaling (NEW)
- Base reaction time PLUS:
- **+250ms per 30 units of distance**
- Example: Enemy at 90 units = base + 750ms delay

## Weapon Systems

### US Forces - M16A4
- **Rate of Fire**: 750 RPM
- **ADS Time**: 0.18 seconds
- **Base Spread**: 0.6°
- **Bloom per Shot**: 0.2°
- **Recoil per Shot**: 0.55°
- **Damage Near**: 26 (< 25 units)
- **Damage Far**: 18 (> 65 units)
- **Headshot Multiplier**: 1.7x

### OPFOR - AK-74
- **Rate of Fire**: 600 RPM
- **ADS Time**: 0.20 seconds
- **Base Spread**: 0.8°
- **Bloom per Shot**: 0.3°
- **Recoil per Shot**: 0.75°
- **Damage Near**: 38 (< 20 units)
- **Damage Far**: 26 (> 55 units)
- **Headshot Multiplier**: 1.6x

## Squad Mechanics

### Formation
- **Type**: Wedge formation
- **Leader Position**: Front center
- **Follower Spacing**: 4 meters apart
- **Row Spacing**: 4 meters between rows
- **Random Variation**: ±1.5 meters to avoid perfect grid

### Squad Behavior
- **Follow Distance**: Followers stay within 6 units of leader
- **Leader Promotion**: Automatic if leader dies
- **Squad Dissolution**: Squad removed when all members dead

### Movement Priorities
1. **Leaders**: Move toward nearest capturable zone
2. **Followers**: Stay near squad leader
3. **Fallback**: Advance toward enemy base

## Performance Optimization

### LOD (Level of Detail) System
- **High LOD** (< 150 units): Full AI, movement, combat, rendering
- **Medium LOD** (150-300 units): AI, movement, combat (50ms update rate)
- **Low LOD** (300-500 units): Basic movement only (100ms update rate)
- **Culled** (> 500 units): No updates

### Update Priorities
- Combatants sorted by distance from player
- Closer NPCs receive more frequent updates
- Resource allocation based on player proximity

## Special Behaviors

### Panic System
- **Trigger**: Being hit within last 2 seconds
- **Panic Level**: 0.0 to 1.0
- **Effects**:
  - > 0.5 panic triggers full auto fire
  - Increases with hits (+0.3 per hit)
  - Decays over time (-0.2 per second)

### Suppression System
- **Suppression Level**: 0.0 to 1.0
- **Increase**: +0.3 per hit received
- **Effects**: Affects accuracy and decision-making
- **Resistance**:
  - OPFOR Leaders: 0.8 resistance
  - OPFOR Followers: 0.6 resistance
  - US Leaders: 0.7 resistance
  - US Followers: 0.5 resistance

### Target Priority
1. Player (for OPFOR only)
2. Nearest visible enemy
3. Last known enemy position (suppressing fire)

## Health System
- **Max Health**: 100 HP for all NPCs
- **Death**: Occurs at 0 HP
- **No Regeneration**: Damage is permanent

## Audio Cues
- **Gunshot Sounds**: Play at combatant position
- **Death Sounds**: Different for ally vs enemy deaths
- **Range**: Audible within 200 units of player

## Key Tactical Considerations

### For Players
1. **OPFOR Advantages**:
   - Slightly better vision range (130 vs 120)
   - Faster reaction times
   - More accurate first shots
   - Higher damage weapons

2. **Exploitable Weaknesses**:
   - Limited field of view (can flank)
   - Reaction delay before firing
   - Accuracy degrades during sustained fire
   - Panic when taking damage

3. **Engagement Tips**:
   - Stay beyond 130 units to avoid detection
   - Use terrain to break line of sight
   - Engage at long range to minimize enemy accuracy
   - Target squad leaders to disrupt formations
   - Exploit the sides/rear (outside FOV)

### NPC Advantages by Role
- **Squad Leaders**: Better accuracy, faster reactions, higher suppression resistance
- **Squad Followers**: Coordinate with leader, provide volume of fire

## Combat Flow Example

1. **Detection Phase**:
   - NPC in PATROLLING state
   - Enemy enters 130-unit range AND 65° FOV
   - Line of sight check passes

2. **Alert Phase** (400-650ms):
   - State changes to ALERT
   - NPC rotates toward target
   - Reaction timer counts down

3. **Engagement Phase**:
   - State changes to ENGAGING
   - Begins burst fire pattern
   - Adjusts position for optimal range

4. **Adaptation**:
   - Full auto if target < 15 units
   - Panic fire if taking damage
   - Suppressing fire if target lost

## Technical Implementation Notes

- NPCs update based on distance-based LOD system
- Squad coordination through shared squad IDs
- Visual rotation smoothly interpolated for natural movement
- Terrain following keeps NPCs 3 units above ground
- Effect pools optimize tracer/muzzle flash rendering
- Maximum 60 concurrent NPCs for performance