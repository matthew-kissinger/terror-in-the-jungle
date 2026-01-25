#!/bin/bash
cd /home/mkagent/repos/terror-in-the-jungle
git add src/systems/weapons/GrenadeSystem.ts
git commit -m "fix: grenade system polish - AudioContext bug, gravity, landing indicator

- Fix AudioContext bug: Use AudioManager's context instead of creating new one
- Increase gravity from -35 to -52 for snappier, more realistic arcs
- Improve landing indicator visibility: larger ring (2m vs 1m), bright green, more opaque (0.7 vs 0.5)
- Add pulsing animation to landing indicator for better visibility
- Power meter already implemented in HUD and working correctly"
git log -1 --oneline
git branch --show-current
