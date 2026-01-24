#!/usr/bin/env python3
"""
Quick analysis for remaining refactoring work
"""

remaining_files = [
    (
        "GlobalBillboardSystem",
        733,
        "src/systems/world/billboard/GlobalBillboardSystem.ts",
    ),
    ("PlayerHealthSystem", 682, "src/systems/player/PlayerHealthSystem.ts"),
    ("HUDSystem", 621, "src/ui/hud/HUDSystem.ts"),
    ("PixelArtSandbox", 573, "src/core/PixelArtSandbox.ts"),
    ("ImprovedChunk", 503, "src/systems/terrain/ImprovedChunk.ts"),
    ("FirstPersonWeapon", 409, "src/systems/player/FirstPersonWeapon.ts"),
]

print("\n=== REMAINING REFACTORING WORK ===\n")
total_lines = sum(f[1] for f in remaining_files)
print(f"Total lines to refactor: {total_lines}")
print(f"Files remaining: {len(remaining_files)}")
print("Target: All files under 400 lines\n")

for name, lines, path in remaining_files:
    reduction_needed = lines - 400
    if reduction_needed > 0:
        print(f"• {name}: {lines} lines (need to extract {reduction_needed} lines)")
        # Estimate modules needed
        modules_needed = (lines // 300) + (1 if lines % 300 > 100 else 0)
        print(f"  Suggested split: {modules_needed} modules")
    else:
        print(f"• {name}: {lines} lines (close to target, minor refactor)")
