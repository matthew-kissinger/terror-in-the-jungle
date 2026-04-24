# Terrain Override

- `TerrainSystem` is the runtime terrain query authority. New gameplay code should receive terrain/collision queries through wiring, not by reaching for global caches.
- Prefer collision-aware queries (`getEffectiveHeightAt`, raycast, LOS, or sweep APIs) when grounding vehicles, NPCs, or world features. Raw height is not enough for contact decisions.
- Terrain stamps, airfield surfaces, and world-feature placement must stay in sync. If you change one, validate the others with targeted terrain and fixed-wing checks.
- Do not add a second terrain cache or flat-height fallback without documenting the owner and a retirement path.
