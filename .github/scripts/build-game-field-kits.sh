#!/usr/bin/env bash
set -euo pipefail

cd ../game-field-kits

npm ci
npm run build \
  --workspace @game-field-kits/event-bus \
  --workspace @game-field-kits/frame-scheduler \
  --workspace @game-field-kits/three-effect-pool \
  --workspace @game-field-kits/three-model-optimizer
