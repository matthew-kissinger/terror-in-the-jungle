---
name: threejs-audio-generator
description: "Generate, convert, clean, and prepare audio assets for Three.js browser games using ElevenLabs. Use for sound effects, looping ambience, UI sounds, impact/weapon/vehicle audio, creature or boss stingers, announcer/dialogue TTS, scratch-performance voice conversion, voice cleanup/isolation, audio manifests, and game-ready web audio integration."
---

# Three.js Audio Generator

## Purpose

Create game-ready audio assets for Three.js projects. This skill consolidates game sound generation, voice generation/conversion, audio cleanup, credential probing, and runtime integration into one Three.js-focused production workflow.

Provider: ElevenLabs.

## When To Use

Use this skill for:

- SFX: jumps, hits, weapons, explosions, coins, pickups, collisions, UI clicks, confirms, errors.
- Ambience: wind, rain, city bed, engine hum, portal loop, dungeon room tone, battle arena beds.
- Voice: announcer barks, boss lines, tutorial prompts, menu narration, generated placeholder dialogue.
- Voice conversion: convert a scratch performance into a target character voice while preserving timing and emotion.
- Cleanup: isolate or denoise dialogue before voice conversion, TTS replacement, or transcription.
- Three.js integration: Web Audio loading, looping, sprite/manifest mapping, volume groups, pause/resume, user gesture unlock.

For premium/AAA/showcase game work, audio is not cosmetic. Generate or integrate at least a minimal interaction audio set for the main loop unless the user explicitly requests mute/offline-only output or credentials/API attempts are blocked.

## API Key

Never store API keys in skill files or browser/game code. The script checks:

1. `--api-key`
2. `ELEVENLABS_API_KEY`

Before declaring the key unavailable in a `threejs-game-director` workflow, run the director credential probe and paste its literal SET/MISSING output:

```bash
bash ~/.codex/skills/threejs-game-director/scripts/probe_asset_credentials.sh
```

For Claude installs:

```bash
bash ~/.claude/skills/threejs-game-director/scripts/probe_asset_credentials.sh
```

If the probe says `ELEVENLABS_API_KEY=SET` but the script sees no key, run through a shell that sources the user's profile:

```bash
zsh -c 'source "$HOME/.zprofile" 2>/dev/null; source "$HOME/.zshrc" 2>/dev/null; python3 ~/.codex/skills/threejs-audio-generator/scripts/threejs_audio_asset.py probe'
```

## Required Reference

Load `references/audio-workflows.md` before building a game audio plan, generating multiple assets, wiring runtime audio, cleaning/converting voices, or claiming premium game audio.

Track it in the reference ledger. Do not mark the audio phase complete while this reference is skipped.

## Tool Script

Run from the user's current game project directory:

```bash
python3 ~/.codex/skills/threejs-audio-generator/scripts/threejs_audio_asset.py --help
```

Claude install path:

```bash
python3 ~/.claude/skills/threejs-audio-generator/scripts/threejs_audio_asset.py --help
```

Probe:

```bash
python3 ~/.codex/skills/threejs-audio-generator/scripts/threejs_audio_asset.py probe
```

Generate SFX:

```bash
python3 ~/.codex/skills/threejs-audio-generator/scripts/threejs_audio_asset.py sfx \
  --prompt "tight futuristic boost pickup, bright transient, short sparkling tail, arcade racing game" \
  --duration 1.2 \
  --prompt-influence 0.65 \
  --out assets/audio/sfx/boost-pickup.mp3
```

Generate looping ambience:

```bash
python3 ~/.codex/skills/threejs-audio-generator/scripts/threejs_audio_asset.py sfx \
  --prompt "seamless cyber resort mini golf ambience, distant surf, soft neon transformer hum, gentle crowd bed" \
  --duration 12 \
  --loop \
  --prompt-influence 0.45 \
  --out assets/audio/ambience/cyber-resort-loop.mp3
```

Generate TTS/announcer line:

```bash
python3 ~/.codex/skills/threejs-audio-generator/scripts/threejs_audio_asset.py tts \
  --text "Perfect shot." \
  --voice-id JBFqnCBsd6RMkjVDRZzb \
  --out assets/audio/voice/perfect-shot.mp3
```

Clean dialogue:

```bash
python3 ~/.codex/skills/threejs-audio-generator/scripts/threejs_audio_asset.py isolate \
  --input assets/audio/source/noisy-boss-line.wav \
  --out assets/audio/voice/boss-line-clean.mp3
```

Convert a scratch performance to a target voice:

```bash
python3 ~/.codex/skills/threejs-audio-generator/scripts/threejs_audio_asset.py voice-change \
  --input assets/audio/source/scratch-boss-line.wav \
  --voice-id JBFqnCBsd6RMkjVDRZzb \
  --remove-background-noise \
  --out assets/audio/voice/boss-line-final.mp3
```

## Game Audio Defaults

- SFX: `mp3_44100_128`, 0.5-2.5s, prompt influence `0.55-0.8`.
- UI: 0.15-0.8s, high prompt influence, keep transients clear.
- Ambience loops: 8-30s, `--loop`, prompt influence `0.3-0.55`.
- Voice: TTS for clean generated lines; voice-change when timing/acting from a scratch performance matters.
- Cleanup: isolate noisy speech before voice-change or final dialogue use.
- Runtime: generate locally, commit/import files, and load them via Web Audio/Three.js integration. Never put API keys in browser code.

## Required Report

Report:

- Credential probe output or real blocker.
- Reference ledger.
- Generated/processed file paths.
- Prompts/text/input files, voice IDs, durations, loop flags, and output formats.
- Runtime integration notes: audio groups, trigger events, loop behavior, unlock gesture, pause/resume, volume/mute controls.
- Remaining audio gaps and any licensing/plan assumptions tied to the user's ElevenLabs account.
