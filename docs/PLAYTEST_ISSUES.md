# Playtest Issues - 2026-03-17

Validated against current `master` with `master == origin/master` on 2026-03-17 before the latest movement/nav terrain-flow changes were committed.

Purpose:
- separate confirmed live issues from stale diagnoses
- document the real option space for player hill feel and NPC traversal
- make the tradeoffs explicit before any movement rewrite

## Validation Basis

- Focused regression suite passed on current `HEAD`:
  - `CombatantMovement.test.ts`
  - `SlopePhysics.test.ts`
  - `PlayerMovement.test.ts`
  - `LoadoutService.test.ts`
  - `PlayerRespawnManager.test.ts`
- Current movement/navigation code was re-read directly from:
  - `src/systems/player/PlayerMovement.ts`
  - `src/systems/terrain/SlopePhysics.ts`
  - `src/systems/combat/CombatantMovement.ts`
  - `src/systems/combat/StuckDetector.ts`
  - `src/systems/navigation/NavmeshSystem.ts`
  - `src/systems/navigation/NavmeshMovementAdapter.ts`
  - `src/systems/terrain/NoiseHeightProvider.ts`
  - `src/systems/terrain/HeightQueryCache.ts`
- Terrain measurements were run against the actual mode configs and terrain providers for:
  - `zone_control`
  - `open_frontier`
  - `a_shau_valley`
- External references were rechecked from current official docs before writing recommendations.

## Issue Summary

| # | Issue | Current Read | Status |
|---|---|---|---|
| 1 | NPCs stop or bunch on hills | Still open, but the old diagnosis is only partially current | OPEN |
| 2 | Loadout selection not persisting | Not confirmed in current code; needs live repro or end-to-end coverage | NEEDS REPRO |
| 3 | Tower / structure scale issues | Mostly resolved at asset/profile level; remaining risk is normalization contract | WATCH |
| 4 | Ghost radio audio | Already fixed | DONE |
| 5 | Deploy map requires scrolling | Confirmed current UI problem | OPEN |
| 6 | Player hill movement feels bad / stutters uphill | Confirmed current issue | OPEN |
| 7 | M60 model replacement | Low-priority asset polish | OPEN |
| 8 | Animal system removed | Not a current repo issue; local untracked assets only | DONE |

## Core Read

- The repo is no longer in the state described by the old playtest write-up. Crowd-agent double-penalty on slopes has already been removed, and stuck recovery already exists.
- The player problem is still very real. `PlayerMovement` still uses a shared `SlopePhysics` curve that starts penalizing at `0` degrees and still samples a point normal from a very rough procedural surface.
- The far-NPC problem is also still real. Low and culled NPCs still use beeline movement with no terrain-aware steering, and the current fallback logic still allows slope-driven stalls.
- The key terrain fact is not only "the map is steep." It is also "the procedural noise maps change slope quickly over 1-3 meters." That is exactly the scale where player feet and low-LOD NPC heading corrections operate.
- Because of that, player movement and NPC movement should not share the same runtime slope logic.

## What Changed Since The Old Diagnosis

### Confirmed fixed or improved

- Navmesh-steered NPCs no longer receive the shared post-hoc slope multiplier in `CombatantMovement`.
- `StuckDetector` exists and already performs nudges plus navmesh unregister fallback.
- Zone Control base flattening improved through terrain stamps.
- Tower display-scale override chain is gone.

### Still genuinely open

- Player hill feel is still wrong for this terrain.
- Low/culled NPC pathing is still structurally under-specified for hilly procedural maps.
- Navmesh fidelity is still coarse for slope-rich terrain.
- Respawn / deploy UI still needs layout work.

## Movement Decision Frame

Before touching code, these are the real decisions:

1. Do we want player infantry movement to be mobility-first on hills, or do we want a strong realism tax on every slope?
2. Do we want every NPC to have true path planning, or do we only need full path planning for materialized agents near the player?
3. Do we want to preserve the current dramatic terrain silhouette and solve movement semantics, or do we want to reshape routes and corridors?
4. Do we want the next iteration to stay inside the current stack, or do we want to bet on a new navigation or physics library now?

My read:

- Player movement should be mobility-first.
- Full crowd-quality pathing for every far agent is not required; cheap, terrain-aware progress is required.
- The terrain silhouette should mostly stay. The movement semantics are the first thing to fix.
- A major library replacement is optional, not mandatory, for the first successful pass.

## Terrain Reality Check

### Why the current procedural maps feel rougher than A Shau

`NoiseHeightProvider` combines:
- broad continental shape
- ridges at `0.003`
- valleys at `0.008`
- hills at `0.015`, `0.03`, `0.06`
- detail noise at `0.1`

That produces good visual relief, but at locomotion scale it also creates fast normal changes. `HeightQueryCache.getNormalAt()` samples at `1.0m` by default, so both player movement and slope queries are reading a very local surface.

### Measured slope distribution

Measured on current terrain providers and terrain stamps.

| Mode | % at or below 30 deg (1m sample) | % above 45 deg | Avg slope change within 2m | Read |
|---|---:|---:|---:|---|
| Zone Control | 49.6% | 17.1% | 6.61 deg | Rough, fast-changing footscale surface |
| Open Frontier | 54.5% | 14.2% | 7.67 deg | Similar roughness, even stronger local variance |
| A Shau Valley | 78.6% | 1.7% | 0.84 deg | Large macro hills, much less footscale chatter |

Additional measured signal:

- Average difference between 1m and 3m slope read:
  - Zone Control: `2.54 deg`
  - Open Frontier: `3.33 deg`
  - A Shau Valley: `0.33 deg`

Interpretation:

- On the procedural maps, a point normal is not a stable proxy for "how walkable this patch feels."
- On A Shau, the terrain is steep in the large, but much less noisy at the character-footprint scale.

### Direct corridor evidence

These are straight-line samples from home bases / HQs to objectives. They are not the "correct" paths. That is the point: low-LOD beeline movement keeps trying to use these kinds of lines.

| Mode | Avg of route samples over 35 deg | Avg of route samples over 45 deg | Worst route over 45 deg | Read |
|---|---:|---:|---:|---|
| Zone Control | 35.9% | 21.2% | 33.3% | Direct beeline is structurally unreliable |
| Open Frontier | 36.6% | 16.1% | 29.2% | Far-agent beeline is still structurally unreliable |
| A Shau Valley | 9.4% | 1.3% | 9.8% | Much more manageable without procedural micro-chatter |

This is the single most important reason low-LOD NPCs still fail. The current far-agent model aims straight at the destination on maps where straight lines repeatedly cross steep or rapidly changing local grades.

## Issue 1: NPC Traversal On Hills

### Current code read

- High and medium LOD NPCs can register with `DetourCrowd` through `NavmeshMovementAdapter`.
- Low and culled NPCs do not use navmesh crowding and fall back to beeline movement.
- `NavmeshSystem` still uses:
  - `MAX_CROWD_AGENTS = 64`
  - `NAVMESH_CELL_SIZE = 4.0`, with cs scaled by world size (1.0 for <=800m, 1.5 for <=1600m, 2.0 for >1600m)
  - `WALKABLE_CLIMB = 0.6`
  - `WALKABLE_SLOPE_ANGLE = 45`
- `StuckDetector` checks every `1500ms`, confirms stuck after three failed intervals, then nudges or unregisters navmesh after repeated failures.

### What is actually broken now

1. High and medium LOD agents still depend on a navmesh that is coarse for this terrain.
2. Low and culled agents still have no terrain-aware planner or steering layer.
3. Stuck recovery exists, but it is a safety net, not a route-finding strategy.
4. The current architecture still mixes two very different needs:
   - near-player "good local avoidance and believable steering"
   - far-agent "cheap forward progress at scale"
5. The tactical AI already knows how to suppress, flank, defend, and seek cover, but those behaviors still resolve to raw destinations that the locomotion layer may fail to reach on hilly terrain.

### What must be true after the fix

- NPC movement must not zero out its final steering direction because of a post-hoc slope sample.
- Far agents must have at least cheap terrain-aware route shaping.
- Near agents can spend more CPU than far agents.
- Recovery logic should remain as guardrail, not as the normal way agents solve hills.

### Option N0: Remove NPC Runtime Slope Physics Entirely

What it means:

- Delete the runtime `computeSlopeSpeedMultiplier()` application for all NPCs.
- Let path planning and steering decide where to go.
- Keep only hard walkability logic where genuinely necessary.

Pros:

- Simplest behavior change.
- Immediately removes one entire class of freeze-in-place failure.
- Preserves final steering direction instead of post-hoc erasing it.
- Strong emergency fallback if elegance work stalls.

Cons:

- Beeline NPCs can still aim into bad lines and look dumb while doing it.
- On steep terrain, agents may visibly climb slopes that you would rather have them route around.
- Does not solve far-agent route quality.

Best use:

- As an emergency unblock.
- As a base layer combined with a better far-agent steering policy.

### Option N1: Hybrid Recast Near The Player + Terrain-Aware Beeline For Low/Culled NPCs

What it means:

- Keep `DetourCrowd` for high and medium LOD NPCs.
- Remove runtime slope speed tax for NPCs.
- For low and culled NPCs, replace pure beeline with a cheap micro-planner:
  - probe several headings ahead
  - score them by forward progress, slope cost, water risk, local drop, and maybe friendly density
  - pick the best heading at low frequency, for example `2-4Hz`
- On blocked uphill probes, bias sideways along contour instead of into the slope.

Pros:

- Solves the actual failure mode for far agents.
- Cheap enough for frontier-scale counts because it is mostly terrain sampling.
- Preserves current Recast integration where it already helps.
- Fits both procedural maps and A Shau.
- Easy to tune by LOD tier.

Cons:

- More bespoke than a library drop-in.
- Needs careful scoring and cadence tuning.
- It is local route shaping, not full global pathfinding.

Why it fits this game:

- Your combat is objective-based, not city-block tactical indoor navigation.
- Far agents mainly need "keep moving toward the fight without getting trapped by terrain," not perfect corridor-level local avoidance.

### Option N2: Improve Recast Fidelity And Capacity

What it means:

- Keep the current Recast stack.
- Improve navmesh generation quality:
  - smaller `cs`
  - revisit `walkableClimb`
  - use tiled generation more deliberately
  - stream or build tiles in workers
- Raise effective agent capacity through sharding or multiple crowds.

Pros:

- Builds on the existing stack.
- Best option if you want near-player agents to look better without large gameplay changes.
- Official `recast-navigation-js` docs already support worker builds, tiled meshes, tile caches, and fixed-step crowd updates.

Cons:

- This does not solve the whole far-agent problem by itself.
- Lower `cs` increases generation cost and memory pressure.
- Universal crowd simulation is still a bad fit for all agents at frontier scale.

Important note:

- Recast's own `rcConfig` guidance recommends starting `cs` at roughly `agentRadius / 2` or `agentRadius / 3`.
- With `agentRadius = 0.5`, that suggests `0.25` to `0.17`, far below the current effective `1.0`.
- That does not mean we must jump straight to `0.25`, but it does mean the current navmesh is very coarse relative to the terrain detail we ask it to represent.

Practical read:

- A modest move toward `0.5-0.75` is much more realistic for a first pass than insisting on the ideal immediately.

### Option N3: Objective / Trail Corridor Graph + Local Steering

What it means:

- Add a coarse route graph between HQs, zones, strongpoints, trails, and airfields.
- Far agents move node-to-node instead of direct destination-to-destination.
- Keep local terrain-aware steering underneath that.

Pros:

- Strong fit for an objective-based war game.
- Very cheap at scale.
- Produces clearer fronts and reinforcement lanes.
- Works well with existing strategic systems and zone logic.

Cons:

- More authored or semi-authored route data.
- Less flexible than true all-terrain pathfinding.
- Needs graph maintenance when objectives change.

Why it fits this game:

- The missions already revolve around strongpoints, lanes, and pressure corridors.
- This is more aligned with your scale than pretending every far agent needs crowd-level pathfinding.

### Option N4: Flow Fields / Cost Fields

What it means:

- Build a grid or tiled cost field from terrain and obstacles.
- Bake slope costs into the field.
- Agents follow the field gradient instead of doing per-agent pathfinding.

Pros:

- Excellent scale characteristics once the field exists.
- Naturally encodes "avoid steep terrain" as cost rather than as a velocity kill switch.
- Strong fit for very large numbers of agents.

Cons:

- Bigger architecture shift.
- Dynamic goals and many simultaneous objectives complicate memory and update policy.
- Local avoidance still needs a separate layer.
- 2D field assumptions can become awkward around bridges, caves, or stacked geometry.

When to choose it:

- If frontier-scale far-agent routing becomes a primary architecture priority after current gameplay issues are fixed.

### Option N5: Replace Or Supplement Recast With navcat

What it means:

- Evaluate `navcat` as either:
  - a replacement runtime nav stack
  - or a place to prototype custom filters and path logic before larger integration

Pros:

- Pure JavaScript and easier to debug than a WASM boundary.
- Supports `moveAlongSurface`, custom query filters with custom costs, crowd simulation, and a flow-field example.
- Transparent data structures are friendlier for custom pathfinding logic.
- Has explicit three.js integration utilities.

Cons:

- Migration cost.
- Less proven in this repo than the current Recast stack.
- Switching stacks now would expand the work surface immediately.

Current read:

- Strong R&D option.
- Not my first recommendation for the first traversal fix.

### Option N6: Yuka Steering Overlay

What it means:

- Use Yuka for steering composition on top of a chosen route source:
  - follow path
  - separation
  - arrive
  - obstacle avoidance
  - formation-style offsets

Pros:

- Useful toolkit for movement feel without replacing the whole nav stack.
- Works well as an overlay for far-agent contour following or route-graph movement.
- Engine-agnostic and already proven with three.js examples.

Cons:

- Not a complete terrain path planner by itself.
- Another layer to integrate and tune.

Best use:

- As a steering/composition helper, not as the entire navigation answer.

### Option N7: Recovery-First Approach

What it means:

- Keep core planner mostly as-is.
- Make `StuckDetector` more aggressive:
  - more nudges
  - contour sidestep
  - short teleport after timeout

Pros:

- Cheap.
- Easy to ship quickly.

Cons:

- Treats symptoms, not the route problem.
- Can look visibly fake.
- Does not create a stable navigation foundation.

Current read:

- Keep as guardrail only.
- Do not choose as the main design.

### End-to-End Combat Read

This has to be judged as a combat system, not just a locomotion system.

- `CombatantCombat` only fires in `ENGAGING` and `SUPPRESSING`.
- Flankers move in `ADVANCING` while suppressors keep firing.
- `AIStateEngage`, `AIFlankingSystem`, and `AICoverSystem` already provide the right tactical verbs:
  - suppress
  - move to cover
  - flank
  - defend
- The failure is that those tactics still hand locomotion direct points and hope movement solves the terrain.

If the player is on a hill and killing a lot of attackers, the fun answer is not "all NPCs become better at brute-forcing straight uphill." The fun answer is:

- some NPCs maintain pressure with suppression
- some contour around the hill or move toward flank anchors
- some seek terrain or vegetation cover
- squads preserve the defender's elevation advantage without becoming inert

That means the correct planner output is usually not "run directly at the player's current position." It is "pick a better attack position relative to the player, LOS, cover, and slope, then move there robustly."

### Performance Read

This also has to fit the existing update architecture.

- High and medium LOD combatants already pay for AI, LOS, combat, and terrain-aware shooting.
- Low and culled combatants already run on degraded cadences and cheap fallback paths.
- `HeightQueryCache` is still a cross-cutting hotspot, so any new mover must stay low-allocation and low-frequency.

Implication:

- do not add per-frame raycast-heavy pathfinding to every combatant
- do most traversal work with cheap height/normal probes
- prefer squad-shared or low-Hz planning for combat approach decisions
- keep full expensive logic inside the materialized bubble around the player

### NPC Recommendation

Recommended path for this game:

1. Remove NPC runtime slope speed penalty as a steering-stage concept.
2. Introduce one terrain-aware locomotion layer for materialized NPCs that accepts tactical intent:
   - advance
   - seek cover
   - flank
   - defend
3. Convert raw destinations into combat approach anchors when terrain or exposure makes direct assault dumb:
   - contour route
   - flank anchor
   - cover anchor
   - fallback saddle / shoulder / corridor point
4. Use Recast only as an optional route hint or local-avoidance helper for nearby agents where it proves useful, not as the core answer.
5. For simulated and far-motion layers, add a coarse route graph or stamped trail corridors instead of relying on straight-line objective chasing.
6. Keep `StuckDetector`, but turn it into a deterministic guardrail:
   - contour sidestep
   - backtrack to last good progress point
   - only then harder fallback

Why this is the most elegant fit:

- It matches the tactical behaviors the game already has.
- It preserves the player hilltop advantage without making attackers useless.
- It respects the materialized-bubble performance budget.
- It aligns with the existing strategic objective model and the roadmap's future road/trail direction.
- It stops treating "Recast near player" as a magic answer when the real requirement is combat-aware progress on hills.

If forced to pick one direction now:

- short term: remove NPC slope tax and restore reliable forward progress
- real medium-term fix: route graph or corridor hints plus a terrain-aware combat locomotion layer
- not recommended: keep massaging the current split "crowd near / beeline far / random unstuck" design

## Issue 6: Player Hill Feel / Uphill Stutter

### Current code read

`PlayerMovement` still does the following while grounded:

1. Sample a terrain normal at the current player position.
2. Convert that to `slopeValue = 1 - normal.y`.
3. Apply `computeSlopeSpeedMultiplier(slopeValue)`.
4. Lerp horizontal velocity toward a target already reduced by that multiplier.
5. Independently block uphill movement when target terrain is steep or step rise is too high.
6. Slide downhill when the multiplier reaches `0`.

The shared slope curve still behaves like this:

- flat ground: `1.0`
- every non-flat surface: already penalized
- around `45 deg`: down to `0.7`
- `45-60 deg`: crawl zone
- above `60 deg`: hard stop

### Why this feels bad on this game

1. The curve starts taxing the player immediately, even on mild slopes.
2. The sampled normal is too local for the procedural maps.
3. The player is getting both a continuous speed tax and a hard target-blocking check.
4. The same function is shared with NPCs even though the design goals are different.

### What must be true after the fix

- Player movement should feel stable on rough procedural hills.
- Footscale terrain chatter should not constantly modulate speed.
- Uphill should feel deliberate, not sticky or jittery.
- Truly unwalkable terrain should still reject or slide.
- Player slope behavior should no longer share a generic function with NPCs.

### Option P0: Remove Continuous Player Slope Speed Physics Entirely

What it means:

- Stop scaling player speed every frame by a point-sampled slope multiplier.
- Keep only:
  - support-plane or ground-constrained motion
  - a true unwalkable threshold
  - optional downhill slide on clearly unwalkable surfaces
  - autostep / snap-to-ground style smoothing

Pros:

- Cleanest path to "smooth and buttery."
- Removes the source of uphill stutter immediately.
- Best fit if fun traversal matters more than realism tax.
- Strongly aligned with how many FPS controllers actually feel.

Cons:

- Most arcade-feeling option.
- Needs a separate anti-wall-climb rule.
- If done sloppily, can make hills feel too flat in gameplay terms.

My read:

- This is not a reckless option.
- For this game, it is a serious and probably strong default option.

### Option P1: Support-Plane Locomotion + Signed Uphill Curve

What it means:

- Replace point-normal speed tax with a support normal averaged over the player's footprint or lookahead patch.
- Apply no speed penalty below a dead zone, for example `10-20 deg`.
- Apply a mild uphill-only tax after that.
- Do not penalize small downhill or cross-slope motion.

Pros:

- More physically expressive than P0.
- Easier to preserve some "hill effort" without chatter.
- Still much smoother than the current implementation.

Cons:

- More tuning complexity.
- Can still feel mushy if the uphill curve is overdone.
- If the support plane is still too local, the benefit shrinks quickly.

Best use:

- If you want a touch of terrain weight without compromising responsiveness.

### Option P2: Project Desired Movement Onto The Support Plane

What it means:

- Compute desired move on a smoothed support plane.
- Project movement onto that plane instead of reducing scalar speed on every slope.
- Keep constant or near-constant speed on walkable terrain.

Pros:

- Elegant mathematical model.
- Keeps movement direction and contact coherent.
- Reduces the sensation of "invisible glue" on hills.

Cons:

- Needs good support-plane sampling.
- Still needs thresholds for unwalkable surfaces and ledges.
- Can feel slightly floaty if ground adhesion is weak.

Best use:

- As the movement core underneath either P0 or P1.

### Option P3: Rapier Character Controller

What it means:

- Replace the custom grounded movement core with Rapier's kinematic character controller.
- Use its built-in:
  - slope climb angle
  - slope slide angle
  - autostep
  - snap-to-ground
  - move-and-slide behavior

Pros:

- Mature set of locomotion primitives.
- Strong built-in answers for stairs, small ledges, downhill adhesion, and slide thresholds.
- Good escape hatch if custom controller tuning keeps dragging on.

Cons:

- More invasive integration.
- Pulls a physics runtime into a controller that is currently custom and lightweight.
- Needs mapping of existing collision concepts, terrain, and special objects.
- Might be overkill if the custom controller is close to good once slope tax is removed.

Current read:

- Good second-stage option.
- I would not start here unless the next custom pass still fails the feel test.

### Option P4: Use Gameplay Normals Instead Of Point Normals

What it means:

- Keep custom player movement.
- Change terrain reads so locomotion uses a support patch instead of a single point:
  - footprint-average normal
  - forward-biased sample
  - lower-frequency or smoothed normal field

Pros:

- Specifically attacks the real procedural-terrain problem.
- Works well with either P0, P1, or P2.
- Keeps current controller architecture mostly intact.

Cons:

- On its own, it does not fix a bad slope policy.
- Still needs a new policy for speed and walkability.

Current read:

- This is a technique, not the whole answer.
- It should almost certainly be part of the recommended path.

### Option P5: Terrain Retune / Corridor Smoothing

What it means:

- Reduce procedural amplitudes, smooth high-frequency detail, or stamp trails / corridors between objectives.

Pros:

- Improves both player and NPC traversal.
- Preserves core systems if terrain is the main culprit.
- Existing terrain stamp system makes corridor shaping plausible.

Cons:

- Changes map identity.
- Risks solving movement by flattening the game instead of fixing semantics.
- Global terrain retune would ripple into visuals and combat spacing.

Current read:

- Good secondary layer.
- Not the first thing to do.

### Player Recommendation

Recommended path for this game:

1. Retire the shared player use of `computeSlopeSpeedMultiplier()`.
2. Use a support plane averaged over the player's footprint or immediate lookahead.
3. Keep player speed constant or nearly constant on walkable terrain.
4. Use a real walkability threshold for steep surfaces instead of taxing every hill.
5. Add ground adhesion / snap behavior and hysteresis so uphill-to-flat and downhill-to-flat transitions do not chatter.
6. If this custom pass still does not feel right, switch to Rapier's character controller instead of endlessly tuning the current approach.

Most likely best-feeling version:

- P0 + P2 + P4

In plain language:

- remove continuous slope tax
- move along a smoothed support plane
- use slope only to decide walkable vs unwalkable and to handle sliding / adhesion

This is the most elegant fit for a hilly shooter with fast infantry expectations.

## Combinations Worth Taking Seriously

### Package A: Conservative Fix

- Keep current stacks.
- Player: support-plane normal + signed dead-zone curve.
- NPC: remove runtime slope tax, improve Recast a bit, keep stuck detector.

Pros:

- Lowest risk.
- Faster to ship.

Cons:

- May still leave some far-agent ugliness on procedural maps.

### Package B: Recommended Elegant Path

- Player:
  - remove continuous slope tax
  - move on support plane
  - keep only real walkability thresholds
- NPC:
  - remove runtime slope tax
  - use a single terrain-aware combat mover for materialized agents
  - let tactical AI choose contour/flank/cover anchors instead of raw uphill rushes
  - use optional Recast hinting only where it helps
  - use route graph or corridor hints for simulated and far movement
  - keep stuck detector as guardrail
- Terrain:
  - keep silhouette for now
  - optionally add narrow trails or corridor stamps later

Pros:

- Best balance of feel, robustness, and scope.
- Strong fit for both current maps and future frontier scale.
- Preserves a fun hilltop combat fantasy instead of flattening the tactics.

Cons:

- Requires writing a bespoke locomotion layer instead of just tuning numbers.

### Package C: Architecture Push

- Player: custom support-plane controller or Rapier.
- NPC: route graph or flow field for far agents.
- Near agents: Recast or navcat crowd layer.
- Optional WebGPU exploration later.

Pros:

- Best long-term platform if large-scale routing becomes a core feature area.

Cons:

- Higher implementation and validation cost.

### Package D: Full Rollback / Arcade Emergency

- Remove shared slope physics entirely for player and NPCs.
- Keep only hard walkability and simple slide rules.

Pros:

- Fastest way to stop the worst hill pain.

Cons:

- Least nuanced.
- Can look and feel overly permissive if not paired with better thresholds.

## Tricks That Should Stay On The Table

- Support-plane normals sampled over the footprint instead of one point.
- Forward-biased or movement-direction-biased terrain sampling.
- Signed uphill and downhill behavior, not one generic scalar tax.
- Hysteresis between walkable, near-unwalkable, and slide states.
- Ground snapping to avoid "micro-air" during downhill movement.
- Autostep smoothing for small rises and terrain seams.
- Contour-follow behavior when forward probes hit bad grades.
- Last-good-position backtracking for deterministic unstuck.
- Low-frequency steering updates for far agents instead of per-frame expensive logic.
- Squad-shared combat approach anchors so suppressors and flankers do not each solve the same hill independently.
- Existing terrain stamps to create trail corridors, ramps, or softened objective shoulders.
- Mode-aware movement policy:
  - procedural noise modes need more smoothing
  - A Shau needs more macro route logic and less footscale smoothing

## Things I Would Not Recommend

- Do not keep player and NPC slope behavior coupled through one shared function.
- Do not rely on random unstuck nudges as the main traversal strategy.
- Do not make direct player-position rushing the default answer to hilltop combat.
- Do not jump straight to WebGPU or compute shaders for the first fix.
- Do not flatten the whole world before fixing the movement semantics.
- Do not try to crowd-sim every far agent on giant maps.

## Other Issue Validation

### Issue 2: Loadout Selection Not Persisting

Current read:

- Not confirmed as a current bug in source.
- Runtime application path exists.
- Initial deploy application path exists.
- Inventory remapping path exists.
- One real caveat remains: loadout persistence keys are context-based by alliance / faction, not by mode.

Recommendation:

- Do not spend architecture time here until a live repro exists.
- Add one deploy/loadout end-to-end smoke test.

### Issue 3: Tower / Structure Scale

Current read:

- Earlier broken scale-stack diagnosis is stale.
- Tower-specific display-scale overrides are gone.
- Current remaining risk is asset normalization consistency, not the old tower bug.

Recommendation:

- Treat as asset-contract follow-up, not current blocker.

### Issue 5: Spawn Map Requires Scrolling

Current read:

- Still real in current CSS and layout structure.

Recommendation:

- Fix after movement issues unless deploy flow feedback says otherwise.

### Issue 7: M60 Model

Current read:

- Low priority.
- Not part of current movement / performance alignment.

## Research Notes

### Official references reviewed

- Three.js `llms.txt`
  - `https://threejs.org/docs/llms.txt`
  - Current official guidance says to use `WebGLRenderer` as the default mature path and `WebGPURenderer` when you specifically need TSL or compute shaders.
- Recast `rcConfig`
  - `https://recastnav.com/structrcConfig.html`
  - Recommends starting `cs` around `agentRadius / 2` or `agentRadius / 3`.
- recast-navigation-js docs
  - `https://docs.recast-navigation-js.isaacmason.com/`
  - Supports tiled navmeshes, tile cache workflows, worker-based generation, and fixed-step crowd updates with interpolation.
- Rapier Character Controller
  - `https://rapier.rs/docs/user_guides/javascript/character_controller/`
  - Exposes move-and-slide, max slope climb angle, min slide angle, autostep, and snap-to-ground.
- navcat docs
  - `https://navcat.dev/docs/`
  - Provides pure-JS navmesh generation and querying, `moveAlongSurface`, custom query filters with custom costs, crowd simulation, and a flow-field example.
- Yuka
  - `https://mugen87.github.io/yuka/`
  - `https://mugen87.github.io/yuka/docs/FollowPathBehavior.html`
  - `https://mugen87.github.io/yuka/docs/ObstacleAvoidanceBehavior.html`
  - `https://mugen87.github.io/yuka/docs/SeparationBehavior.html`
  - `https://mugen87.github.io/yuka/docs/OffsetPursuitBehavior.html`
  - Useful as a steering toolkit layered on top of a route source.
- Unity Character Controller
  - `https://docs.unity3d.com/Manual/class-CharacterController.html`
  - Exposes `Slope Limit`, `Step Offset`, `Skin Width`, and `Min Move Distance`; official guidance explicitly treats these as locomotion thresholds and anti-jitter controls.
- Unreal walkable slope docs
  - `https://dev.epicgames.com/documentation/en-us/unreal-engine/walkable-slope-in-unreal-engine`
  - Walkable floor angle defaults around `45` degrees and is treated as a walkability threshold, not as a universal speed tax.

## Bottom Line

If we optimize for this game's mission, terrain, and scale:

- Player movement should stop using shared continuous slope physics.
- NPC movement should stop using runtime slope physics as a substitute for route choice.
- Near-player NPCs should keep better local pathing.
- Far NPCs need cheap terrain-aware progress, not crowd-quality simulation.
- WebGPU, full flow fields, and nav-stack replacement are real options, but they are not the first elegant move here.

The most likely correct direction is:

- player: support-plane locomotion with little or no continuous slope tax
- NPCs: hybrid navigation, with Recast near player and terrain-aware contour steering at distance
- terrain: preserve the dramatic look, then add narrow corridor shaping only if the post-fix game still needs stronger lanes
