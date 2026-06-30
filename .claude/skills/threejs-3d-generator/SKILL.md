---
name: threejs-3d-generator
description: "Generate, texture, rig, animate, stylize, convert, and download 3D assets for Three.js games using the Tripo API. Use for text-to-3D, image-to-3D, 2D concept to 3D conversion, game-ready GLB/FBX assets, characters, creatures, buildings, props, weapons, terrain pieces, auto-rigging, animation retargeting, model texturing, LEGO/voxel/Minecraft-style stylization, low-poly/quad conversion, and browser asset pipelines. Pair with threejs-image-generator for concepts, texture references, sky/background/terrain textures, logos, icons, and GUI art before image-to-3D generation."
---

# Three.js 3D Generator

## Purpose

Create production-oriented 3D assets, then prepare them for Three.js games. This is the Three.js game system's 3D-generation layer; it uses Tripo as the provider for text-to-3D, image-to-3D, texturing, rigging, retargeting, stylization, conversion, and downloadable GLB/FBX outputs.

## API Key

Never store API keys in skill files or client-side game code. The script checks:

1. `--api-key`
2. `TRIPO_API_KEY`

Step 0 before declaring the key unavailable:

```bash
bash ~/.claude/skills/threejs-game-director/scripts/probe_asset_credentials.sh
```

For Codex installs:

```bash
bash ~/.codex/skills/threejs-game-director/scripts/probe_asset_credentials.sh
```

Paste the literal `TRIPO_API_KEY=SET|MISSING` output in the report. Do not conclude the key is unavailable from a plain non-interactive shell until this probe has sourced the user's shell profiles.

When the probe says SET but `threejs_3d_asset.py` reports a missing key, the key is exported in an interactive-only profile (e.g. `~/.zshrc`). Wrap script invocations the same way the probe does:

```bash
zsh -c 'source "$HOME/.zprofile" 2>/dev/null; source "$HOME/.zshrc" 2>/dev/null; python3 .../threejs_3d_asset.py ...'
```

Use the API only from local/server-side tooling. Generated model download URLs expire quickly, so download outputs immediately after successful tasks.

## Tool Script

Reference gate:

- Load `references/api-notes.md` before provider API work, endpoint/task decisions, model-version choices, polling, postprocess, conversion, rigging, animation, or download handling.
- Load `references/threejs-integration.md` before importing Tripo outputs into a browser game or advising GLB/FBX integration.
- Load `references/image-generator-workflows.md` before pairing `threejs-image-generator` with this skill for 2D concepts, texture references, UI art, logos, decals, or image-to-3D inputs.

Track required references in a reference ledger with yes/no, path, and failure reason. Do not mark an asset pipeline complete while a required reference is skipped.

Run from the user's current project directory:

```bash
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py --help
```

If installed in Codex instead of Claude, use:

```bash
python3 ~/.codex/skills/threejs-3d-generator/scripts/threejs_3d_asset.py --help
```

## Common Commands

Recommended premium game hero model:

```bash
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py text \
  --prompt "game-ready [hero asset], strong readable silhouette, layered hard-surface detail, PBR materials, clean topology for browser game, centered pivot, 3/4 view, no text" \
  --model-version v3.1-20260211 \
  --texture-quality detailed \
  --geometry-quality detailed \
  --wait --download --out-dir assets/models/hero
```

Text to 3D:

```bash
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py text \
  --prompt "game-ready sci-fi hover bike, sleek armored panels, readable silhouette, PBR, front facing" \
  --model-version v3.1-20260211 \
  --texture-quality detailed \
  --geometry-quality detailed \
  --wait --download --out-dir assets/models/hover-bike
```

Image to 3D from a local `threejs-image-generator` concept:

```bash
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py image \
  --image assets/concepts/hover-bike-front.png \
  --model-version v3.1-20260211 \
  --enable-image-autofix \
  --texture-alignment original_image \
  --texture-quality detailed \
  --wait --download --out-dir assets/models/hover-bike
```

Status and download:

```bash
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py status TASK_ID
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py download TASK_ID --out-dir assets/models
```

Texture, rig, animate, or convert:

```bash
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py postprocess \
  --type texture_model --original-task-id TASK_ID \
  --texture-prompt "brushed gunmetal, orange hazard decals, worn edges" \
  --wait --download --out-dir assets/models/retextured

python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py postprocess \
  --type animate_prerigcheck --original-task-id TASK_ID --wait

python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py postprocess \
  --type animate_rig --original-task-id TASK_ID --rig-type biped --spec tripo --wait

# animate_retarget takes the RIG task ID, not the generation task ID.
# Batch up to 5 presets per task via --animations.
# NEVER pass --animate-in-place: it corrupts the bake (mirrored limbs / exploded
# skinning). Strip root motion in the engine instead.
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py postprocess \
  --type animate_retarget --original-task-id RIG_TASK_ID --model-version v2.5-20260210 \
  --animations preset:idle,preset:walk,preset:run \
  --wait --download --out-dir assets/models/animated

python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py postprocess \
  --type conversion --original-task-id TASK_ID --format GLTF \
  --face-limit 20000 --wait --download --out-dir assets/models/gltf

python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py postprocess \
  --type stylize_model --original-task-id TASK_ID --style voxel \
  --wait --download --out-dir assets/models/voxel
```

Animated character pipeline (generation -> prerigcheck -> validated rig with retries -> retargets -> downloads). The pipeline routes itself by body plan: biped characters automatically use the v1.0-20240301 anatomical rig with one FBX per animation (plain preset names are mapped onto the preset:biped:* library); creatures use the v2.5-20260210 rig with GLB clips:

```bash
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py character-pipeline \
  --prompt "stylized cyber runner character, T-pose, full body, game-ready outfit, readable silhouette" \
  --animations preset:idle,preset:walk,preset:run,preset:jump \
  --out-dir assets/models/cyber-runner

# Creature example: stance language matters — generate in the pose the preset expects.
python3 ~/.claude/skills/threejs-3d-generator/scripts/threejs_3d_asset.py character-pipeline \
  --prompt "stylized wolf, quadrupedal stance, all four legs planted and separated, full body" \
  --rig-type quadruped --animations preset:quadruped:walk \
  --out-dir assets/models/wolf
```

## Three.js Image Generator Pairing

Use `threejs-image-generator` before 3D generation when the asset benefits from a strong 2D reference:

- Character concept, full-body T-pose/A-pose, front/side/back variants.
- Building, prop, vehicle, weapon, pickup, enemy, obstacle, or terrain tile reference.
- Style sheet for a whole asset family.
- Texture references: terrain, rock, metal, fabric, decals, skyboxes, backgrounds, UI materials.
- Logos, faction marks, pickup icons, hazard signs, cockpit decals, HUD symbols, and GUI panels.

Load `references/image-generator-workflows.md` for prompt patterns before generating or editing 2D inputs.

## Three.js Integration

Load `references/threejs-integration.md` before importing Tripo outputs into a browser game. In short:

- Prefer GLB/PBR outputs for Three.js.
- Use `GLTFLoader` for loading.
- Use `AnimationMixer` for rigged/animated GLBs.
- Keep generated model files out of client-side API flows; generation is a tooling step.
- Inspect triangle count, texture count, material count, file size, scale, pivot, bounds, and animation clips.
- Use generated 3D assets as hero/high-fidelity content, then build surrounding prop kits procedurally or with additional `threejs-3d-generator` / `threejs-image-generator` passes.

## Rigging and Animation Reliability

Load `references/api-notes.md` for the full parameter tables. The rules that prevent most failures:

- Generate characters as one fused mesh: keep `--quad` and `--generate-parts` off (`generate_parts` disables texturing; `quad` forces FBX output).
- Require full-body T-pose or A-pose, arms away from body, symmetric, no props fused to the silhouette. Verify the rendered preview is actually in T/A-pose before rigging; regenerate if not.
- Run `animate_prerigcheck` first (it takes no model version) and use the detected `rig_type` for `animate_rig` and preset selection. `riggable=false` means regenerate with a clearer pose, not force-rig.
- `riggable=true` does not guarantee a usable rig. After rigging, validate the skeleton before retargeting: `threejs_3d_asset.py validate-rig rig-model.glb --rig-type biped` (the `character-pipeline` does this automatically). Check both presence AND chain depth: a rig with a 1-bone leg or 2-bone arm warps every clip.
- Auto-rigging is nondeterministic. On validation failure, retry the rig task (~25 credits) before regenerating the model — `character-pipeline --rig-retries N` (default 2) automates this, and `--model-task-id TASK_ID` resumes from an existing generation. Armored/hard-surface characters need the most retries; organic meshes usually rig first try.
- Creatures get exactly one preset (walk/march). For multi-mode creatures (crawl + fly dragons), rig the same model twice — ground rig type for the locomotion preset, `avian` for wing chains — and drive wings procedurally in Three.js or via external clips on a `mixamo`-spec rig.
- Retargeted clips are named `NlaTrack`, `NlaTrack.001`, … in request order — map by index and rename after import.
- Rig version is the main quality lever, and it differs by body plan (measured June 2026). The `character-pipeline` routes this automatically; only override `--rig-model-version` deliberately:
  - HUMANOIDS: `v1.0-20240301` (anatomical Mixamo-like skeleton with twist bones + the large `preset:biped:*` clip library: idle, walk, run, slash, jump, dances, ...). The v2.x limb-chain rigger went 0/16 on humanoid meshes — armored or not, T-pose or A-pose — always producing asymmetric chains.
  - CREATURES: `v2.5-20260210` (v2.x handles quadruped/avian well: symmetric 5-6 bone chains).
- For v1.0 rigs, retarget with `--model-version default` (omit the version): the retarget enum rejects explicit `v1.0-20240301` (HTTP 400 code 2017) but the server default handles v1.0 rigs.
- v1.0 retargets must use `--out-format fbx` (the script enforces this): Tripo's GLB bake on this path exports twist-bone transforms in the wrong space and limbs collapse into the torso — the FBX of the same task is correct. Load with three.js `FBXLoader` or convert offline. v2.5 creature retargets are fine as GLB.
- Use `--spec tripo` (default) when Tripo presets will be retargeted; `--spec mixamo` rigs cannot be used with Tripo retarget and are only for external animation pipelines.
- `animate_retarget` takes the RIG task ID. Batch up to 5 presets per task with `--animations`.
- Only 16 presets exist for v2.5 rigs (no `preset:attack`; use `preset:slash`/`preset:shoot`). Non-biped rig types have a single locomotion preset each; plan extra creature motion procedurally or via external retargeting.
- A creature's MESH STANCE drives how presets read: a quadruped walk on an upright-standing dragon looks like a human walking. Generate creatures in the stance the animation expects (horizontal body, all fours planted) — the pipeline only auto-appends T-pose language for biped rigs.
- After download, run `threejs_3d_asset.py validate-animation clip.glb` (keyframe QA: flags scale tracks, limb-stretching translation tracks, extreme rotations, and reports per-clip duration/channel coverage), then verify motion visually in the engine.
- Never use `--animate-in-place` (verified to corrupt clips: mirrored/crossed limbs on v1.0 rigs, exploded skinning on v2.5). Keep root motion baked and convert to in-place at import: zero only the HORIZONTAL components of the root bone's position track, keep vertical (jumps and gait bob live there). Gameplay code then drives locomotion. Exact snippet in `threejs-integration.md`.
- After download, inspect `gltf.animations` clip names and counts before wiring the `AnimationMixer`.

## Quality Rules

- Improve the user's prompt with material, silhouette, camera/readability, scale, and game-use constraints.
- For riggable characters, include full-body T-pose or A-pose in the prompt or create a T-pose reference image first.
- For Three.js games, request GLB/PBR, reasonable face limits, and texture quality matched to the performance budget.
- For mobile/browser games, favor `smart_low_poly`, `face_limit`, later conversion, or low-poly postprocess when the asset is too expensive.
- Always download output URLs immediately after success.
- Report the credential probe output, reference ledger, task IDs, output paths, model version, texture/geometry settings, animations, conversion settings, Three.js import notes, and any missing/failed steps.
