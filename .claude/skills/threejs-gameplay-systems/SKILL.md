---
name: threejs-gameplay-systems
description: "Build and iterate playable Three.js game systems. Combines starter scaffold creation, architecture, gameplay implementation, and game-feel tuning. Use for first playable slices, new Vite/TypeScript/Three.js game setup, game loops, entity systems, input, collision/physics, scoring, objectives, audio hooks, camera, controls, difficulty, feedback, and maintainable structure."
---

# Three.js Gameplay Systems

## Purpose

Create or evolve a playable browser game loop with clear ownership, responsive controls, deterministic update order, and verified player-facing behavior.

## Use When

Starting a new game, repairing a weak prototype, adding mechanics/entities, designing architecture, tuning camera/controls, implementing rules/objectives, or improving game feel.

## Workflow

Load `references/gameplay-workflows.md` as the first action when the task includes first playable setup, architecture, mechanics, entities, input, camera, collision/physics, scoring, objectives, feedback, or feel tuning.

Load `references/physics-engine-selection.md` before adding or changing physics, collision-heavy gameplay, vehicle movement, rolling balls, mini-golf, pool/snooker, pinball, rigid-body puzzles, character controllers, sensors, high-speed projectiles, moving platforms, or physics QA. Track both references in a reference ledger with yes/no, path, and failure reason. Do not mark the gameplay phase complete while a required reference is skipped.

Load `references/checklists/new-game-definition-of-done.md` before claiming a new game or first playable slice is complete.

Load `references/checklists/endless-runner-premium-quality.md` for endless runner work.

Load `references/prompt-templates.md` only when the user asks for reusable prompts, starter prompts, or a task template.

Load `threejs-audio-generator` when implementing real SFX, ambience, UI sounds, voice/TTS, or audio cleanup beyond simple placeholder hooks. Gameplay code should emit audio events; the audio skill should generate or process the actual assets and define the runtime audio matrix.

1. Inspect project structure, scripts, dependencies, current loop, input, camera, entities, state, UI, and diagnostics.
2. Define the one-sentence playable loop: verb, objective, feedback, fail/retry.
3. Choose small architecture boundaries: `core`, `game`, `entities`, `systems`, `assets`, `ui`, `tests`.
4. Implement mechanics in playable increments: input, state, entity, collision/physics, feedback, HUD/audio hook, diagnostics.
5. Tune feel: movement, acceleration, camera follow/FOV/shake, impact, cooldowns, difficulty, restart loop.
6. Keep hot paths allocation-light and update order explicit.
7. Verify with build, browser, screenshot, canvas pixels, console/page errors, and one real input path.

## Packaged Scaffold

Use the bundled scaffold when starting a new project or when the user asks for a starter game:

```bash
python3 <this-skill-dir>/scripts/create_threejs_game.py ./my-game
```

The script copies `assets/threejs-vite-game/`, rewrites the project name in `package.json` and `package-lock.json`, and keeps generated games self-contained with their own visual test and canvas-inspection script. Use `--force` only when the target directory may be overwritten.

## Library Guidance

- Use TypeScript, Vite, Three.js modules.
- Custom collision for simple arcade triggers and pickups.
- Rapier is the default robust physics engine for serious Three.js browser games with rigid bodies, sensors, balls, ramps, many contacts, or high-speed collisions.
- Use `cannon-es` only as a lightweight JS fallback for small/simple rigid-body scenes.
- Use custom collision when authored arcade feel is more important than simulation.
- `lil-gui` for live-tuned constants when useful.
- Web Audio for runtime playback and procedural feedback; `threejs-audio-generator` for generated game audio assets.

## Common Failure Modes

- Static demo instead of playable loop.
- Mechanic compiles but cannot be triggered by real input.
- Camera/controls feel delayed or hide the next decision.
- State changes do not drive UI/audio/VFX.
- Architecture abstractions appear before mechanics need them.

## Final Response

Report the reference ledger, gameplay checklist outcome, behavior, controls, changed files, architecture choices, tuned values, verification evidence, artifacts, and remaining edge cases.
