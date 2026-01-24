import os

files = [
    "src/systems/combat/types.ts",
    "src/systems/combat/CombatantFactory.ts",
    "src/systems/combat/CombatantMovement.ts",
    "src/systems/combat/CombatantAI.ts",
    "src/systems/combat/CombatantRenderer.ts",
    "src/systems/combat/SquadManager.ts",
    "src/systems/combat/CombatantSystem.ts",
    "src/systems/combat/CombatantCombat.ts"
]

for file in files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            lines = len(f.readlines())
            print(f"{lines:4d} lines: {os.path.basename(file)}")
