#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2025-2026 Matthew Kissinger
#
# Re-fetches and re-encodes the radio-station music tracks for the headless
# RadioStationSystem (cycle-2026-06-29-radio-stations-music).
#
# These are GENUINE CC BY 4.0 tracks by Kevin MacLeod (incompetech.com), fetched
# directly (no credentials) and re-encoded MP3 -> Opus stereo ~80 kbps. See
# README.md in this directory; attribution lives in THIRD-PARTY-ASSETS.md and the
# per-track *.provenance.json. Re-encoding strips source metadata.
#
# Requires: curl, ffmpeg built with libopus.
# Usage:    ./fetch-stations.sh [OUT_DIR]
#           OUT_DIR defaults to public/assets/audio/music/ relative to repo root.
set -euo pipefail

OUT="${1:-public/assets/audio/music}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

BASE="https://incompetech.com/music/royalty-free/mp3-royaltyfree"
UA="Mozilla/5.0"

# title|output-slug
TRACKS=(
  "Volatile Reaction|station-volatile-reaction"
  "Five Armies|station-five-armies"
  "Ossuary 6 - Air|station-ossuary-air"
)

for entry in "${TRACKS[@]}"; do
  title="${entry%%|*}"
  slug="${entry##*|}"
  enc="$(printf '%s' "$title" | sed 's/ /%20/g')"
  echo "Fetching '$title' ..."
  curl -sS -L -A "$UA" --max-time 60 -o "$TMP/$slug.mp3" "$BASE/$enc.mp3"
  echo "Encoding $slug.ogg (Opus stereo 80 kbps) ..."
  ffmpeg -y -hide_banner -loglevel error -i "$TMP/$slug.mp3" \
    -ac 2 -ar 48000 -c:a libopus -b:a 80k -vbr on -application audio \
    -map_metadata -1 "$OUT/$slug.ogg"
done

echo "Wrote radio-station tracks to $OUT"
