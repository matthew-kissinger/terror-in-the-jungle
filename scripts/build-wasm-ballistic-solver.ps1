# Build the tank ballistic-solver Rust crate to WASM and emit the bundle
# into src/systems/combat/projectiles/wasm/tank-ballistic-solver/.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/build-wasm-ballistic-solver.ps1
#
# Requires:
#   - rustup target add wasm32-unknown-unknown
#   - cargo install wasm-pack
#
# The artifacts are committed to the repo so CI does not need the Rust
# toolchain. Run this script whenever the crate changes; commit the
# resulting wasm/ folder contents.

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$crateDir = Join-Path $repoRoot 'rust/tank-ballistic-solver'
$outDir = Join-Path $repoRoot 'src/systems/combat/projectiles/wasm/tank-ballistic-solver'

Write-Host "Building tank-ballistic-solver -> $outDir"

if (-not (Get-Command wasm-pack -ErrorAction SilentlyContinue)) {
    Write-Error "wasm-pack not found in PATH. Install via: cargo install wasm-pack"
    exit 1
}

Push-Location $crateDir
try {
    wasm-pack build --target web --release --out-dir $outDir
    if ($LASTEXITCODE -ne 0) {
        throw "wasm-pack exited with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# Drop wasm-pack's package.json + .gitignore — they would shadow the repo's
# expectations. The TS wrapper imports the glue + WASM directly.
$packageJson = Join-Path $outDir 'package.json'
if (Test-Path $packageJson) { Remove-Item $packageJson }
$packGitignore = Join-Path $outDir '.gitignore'
if (Test-Path $packGitignore) { Remove-Item $packGitignore }

Write-Host ''
Write-Host 'Artifacts:'
Get-ChildItem $outDir | ForEach-Object {
    $sizeKB = [math]::Round($_.Length / 1024, 2)
    Write-Host ("  {0} ({1} KB)" -f $_.Name, $sizeKB)
}
