# NPC Shader Effects Documentation

## Overview
NPCs now have a dual-layer rendering system that creates a visible aura/halo effect around sprites to make them stand out against dense forest backgrounds. The original sprite textures remain untinted, with the aura extending beyond their boundaries.

## Features Implemented

### 1. Dual-Layer Rendering System
- **Base Layer**: Original sprite texture rendered without any color modification
- **Aura Layer**: Larger billboard behind sprite that creates the glow effect
- Uses additive blending for proper light accumulation
- Aura extends beyond sprite boundaries for visibility

### 2. Faction-Based Auras
- **US/Allies**: Blue aura glow (RGB: 0.3, 0.5, 1.0) around sprites
- **OPFOR/Enemies**: Red aura glow (RGB: 1.0, 0.2, 0.2) around sprites
- Auras only appear around the sprite edges, not on the sprite itself
- Creates clear visual distinction without modifying character appearance

### 3. Edge-Based Glow Effect
- Samples sprite texture to determine where glow should appear
- Stronger glow at sprite edges, fades toward center
- Radial gradient creates soft, natural-looking halo
- Respects sprite alpha channel for accurate edge detection

### 4. Dynamic Combat Effects
- Aura pulses during combat states
- Intensity increases when NPCs are alert or engaging
- Combat state affects aura brightness (60% base, 100% in combat)
- Smooth transitions between states

### 5. Visual Effect Presets
- **Default**: Balanced aura intensity for general gameplay
- **Cel-shaded**: Simplified rendering style (future enhancement)
- **Minimal**: No effects, basic rendering
- **Intense**: Maximum aura brightness for high visibility
- **Tactical**: Subtle auras for more realistic appearance

## Usage Example

```typescript
// Access the combatant system and renderer
const combatSystem = gameInstance.getCombatantSystem();
const renderer = combatSystem.getRenderer();

// Apply a preset
renderer.applyPreset('tactical'); // Options: 'default', 'cel-shaded', 'minimal', 'intense', 'tactical'

// Toggle individual effects
renderer.toggleCelShading();
renderer.toggleRimLighting();
renderer.toggleAura();

// Custom configuration
renderer.setShaderSettings({
  celShadingEnabled: 1.0,  // 1.0 = on, 0.0 = off
  rimLightingEnabled: 1.0,
  auraEnabled: 1.0,
  auraIntensity: 0.7       // 0.0 to 1.0
});

// Get current settings
const settings = renderer.getShaderSettings();
console.log('Current shader settings:', settings);
```

## Performance Considerations

- Dual-layer rendering with instanced meshes for both sprites and auras
- Aura meshes share instance matrices with sprite meshes for synchronized movement
- Additive blending for natural light accumulation
- Distance culling applied at 400 units
- Shader uniforms batched per faction-state group

## Technical Implementation

### Dual-Layer Architecture
1. **Sprite Layer**: Original NPC textures rendered with `MeshBasicMaterial`
   - No color tinting preserves original art
   - Render order 2 (on top)
   - Alpha test for pixel-perfect transparency

2. **Aura Layer**: Custom shader creates surrounding glow
   - Larger plane geometry (7x9 vs 5x7 for sprites)
   - Render order 1 (behind sprites)
   - Additive blending for glow effect
   - Samples sprite texture to determine glow shape

### Shader Approach
- **Vertex Shader**: Standard billboard transformation for instanced meshes
- **Fragment Shader**:
  - Samples texture with scaled UV coordinates to create outward glow
  - Radial gradient falloff from sprite edges
  - Combat state modulates intensity and pulse rate
  - Alpha-based edge detection ensures glow follows sprite shape

## Files Modified

1. **src/systems/combat/CombatantRenderer.ts** - Dual-layer rendering system
2. **src/systems/combat/CombatantSystem.ts** - Exposes renderer for configuration
3. **src/systems/combat/CombatantCombat.ts** - Triggers damage effects

## Integration Notes

The aura system:
- Automatically synchronizes with sprite positions
- Updates time uniforms for pulse animations
- Responds to combat state changes
- Creates clear faction distinction without obscuring sprite details
- Provides excellent visibility against complex backgrounds

All effects are GPU-accelerated using instanced rendering for optimal performance with hundreds of NPCs.