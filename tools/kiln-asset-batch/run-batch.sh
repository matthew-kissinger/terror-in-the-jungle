#!/usr/bin/env bash
# Drive the Vietnam war-asset regen against a running Kiln Studio server.
# 1) creates the "Vietnam War" palette, 2) locks each pack plan, 3) runs it.
#
#   BASE=http://localhost:3200 USER=dev-admin ./run-batch.sh [pack-id ...]
#
# With no args, processes all packs/*.json. Pass pack ids (e.g. weapons vehicles)
# to run a subset. Requires the server up (cd kiln-studio && bun run dev:server)
# with a GEMINI_API_KEY loaded. dev-admin is cap/quota-exempt.
set -euo pipefail
cd "$(dirname "$0")"

BASE="${BASE:-http://localhost:3200}"
USER_HDR="${USER:-dev-admin}"
H=(-H "content-type: application/json" -H "x-dev-user: ${USER_HDR}")

say() { printf '\033[1;36m%s\033[0m\n' "$*"; }

# 1) Palette -------------------------------------------------------------------
say "==> creating palette 'Vietnam War'"
PAL=$(curl -fsS "${H[@]}" -X POST "${BASE}/api/palettes" \
  --data-binary @vietnam-war.palette.json)
PALETTE_ID=$(printf '%s' "$PAL" | node -e 'process.stdin.on("data",d=>{try{console.log(JSON.parse(d).palette.paletteId)}catch{console.log("vietnam-war")}})')
echo "    paletteId = ${PALETTE_ID}"

# 2+3) Packs -------------------------------------------------------------------
PACKS=("$@")
if [ ${#PACKS[@]} -eq 0 ]; then
  for f in packs/pack-*.json; do PACKS+=("$(basename "$f" .json | sed 's/^pack-//')"); done
fi

for id in "${PACKS[@]}"; do
  file="packs/pack-${id}.json"
  [ -f "$file" ] || { echo "skip: $file not found"; continue; }
  say "==> locking pack '${id}'"
  RES=$(curl -fsS "${H[@]}" -X POST "${BASE}/api/packs" --data-binary @"$file")
  PACK_ID=$(printf '%s' "$RES" | node -e 'process.stdin.on("data",d=>{try{console.log(JSON.parse(d).pack.packId)}catch{console.log("")}})')
  echo "    packId = ${PACK_ID}"
  say "==> running pack '${PACK_ID}'"
  curl -fsS "${H[@]}" -X POST "${BASE}/api/packs/${PACK_ID}/run" --data '{}' >/dev/null
  echo "    queued. poll: curl -s ${H[*]} ${BASE}/api/packs/${PACK_ID} | jq '.pack.members[]?.status'"
done

say "All requested packs queued. Watch progress in the Packs view or GET /api/packs."
