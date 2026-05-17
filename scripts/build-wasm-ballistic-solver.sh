#!/usr/bin/env bash
# POSIX sibling of build-wasm-ballistic-solver.ps1. Build the tank
# ballistic-solver Rust crate to WASM and emit the bundle into
# src/systems/combat/projectiles/wasm/tank-ballistic-solver/.
#
# Requires:
#   - rustup target add wasm32-unknown-unknown
#   - cargo install wasm-pack

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$REPO_ROOT/rust/tank-ballistic-solver"
OUT_DIR="$REPO_ROOT/src/systems/combat/projectiles/wasm/tank-ballistic-solver"

echo "Building tank-ballistic-solver -> $OUT_DIR"

if ! command -v wasm-pack >/dev/null 2>&1; then
    echo "wasm-pack not found in PATH. Install via: cargo install wasm-pack" >&2
    exit 1
fi

cd "$CRATE_DIR"
wasm-pack build --target web --release --out-dir "$OUT_DIR"

# Drop wasm-pack's generated package.json + .gitignore.
rm -f "$OUT_DIR/package.json" "$OUT_DIR/.gitignore"

echo
echo "Artifacts:"
ls -lh "$OUT_DIR"
