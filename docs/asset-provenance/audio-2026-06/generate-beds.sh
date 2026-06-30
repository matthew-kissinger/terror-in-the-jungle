#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2025-2026 Matthew Kissinger
#
# Regenerates the FIRST-PARTY PLACEHOLDER ambient beds + wildlife one-shots for
# the day/night SoundscapeDirector (cycle-2026-06-29-soundscape-loop-replacement).
#
# These are synthesized from scratch with ffmpeg/libopus — NOT field recordings.
# See README.md in this directory. Replace with genuine CC0/CC-BY beds when the
# owner sources them; the director needs no code change.
#
# Requires: ffmpeg built with libopus.
# Usage:    ./generate-beds.sh [OUT_DIR]
#           OUT_DIR defaults to public/assets/audio/ambient/ relative to repo root.
set -euo pipefail

OUT="${1:-public/assets/audio/ambient}"
mkdir -p "$OUT"

# DAY BED — steady airy filtered noise (wind through canopy) + faint insect
# shimmer. No fades so the loop has no boundary transient. 18 s, mono, 40 kbps.
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "anoisesrc=color=brown:amplitude=0.20:duration=18:sample_rate=24000" \
  -f lavfi -i "anoisesrc=color=white:amplitude=0.05:duration=18:sample_rate=24000" \
  -filter_complex "[0:a]lowpass=f=900,highpass=f=120[wind];[1:a]highpass=f=3000,volume=0.4[ins];[wind][ins]amix=inputs=2:normalize=0,volume=1.5[a]" \
  -map "[a]" -ac 1 -c:a libopus -b:a 40k -application audio "$OUT/jungle-day.ogg"

# NIGHT BED — low drone + steady cricket shimmer band. 18 s, mono, 40 kbps.
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "anoisesrc=color=brown:amplitude=0.14:duration=18:sample_rate=24000" \
  -f lavfi -i "anoisesrc=color=white:amplitude=0.05:duration=18:sample_rate=24000" \
  -filter_complex "[0:a]lowpass=f=400[drone];[1:a]bandpass=f=4500:width_type=h:w=600,tremolo=f=13:d=0.9,volume=0.5[crk];[drone][crk]amix=inputs=2:normalize=0,volume=1.5[a]" \
  -map "[a]" -ac 1 -c:a libopus -b:a 40k -application audio "$OUT/jungle-night.ogg"

# ONE-SHOT bird chirp ~1.2 s.
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=2100:duration=1.2:sample_rate=24000" \
  -af "vibrato=f=9:d=0.8,tremolo=f=20:d=0.9,afade=t=in:st=0:d=0.04,afade=t=out:st=0.85:d=0.35,volume=0.8" \
  -ac 1 -c:a libopus -b:a 40k "$OUT/wildlife-bird.ogg"

# ONE-SHOT distant call ~1.6 s.
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=560:duration=1.6:sample_rate=24000" \
  -af "vibrato=f=5:d=0.85,lowpass=f=1500,afade=t=in:st=0:d=0.12,afade=t=out:st=1.05:d=0.55,volume=3.0" \
  -ac 1 -c:a libopus -b:a 40k "$OUT/wildlife-call.ogg"

echo "Wrote placeholder beds to $OUT"
