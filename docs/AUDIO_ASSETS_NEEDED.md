# Audio Assets Needed for Enhanced Combat Audio

> **Audio system location**: `src/systems/audio/` - AudioPoolManager, FootstepAudioSystem, RadioTransmissionSystem, plus weapon/ambient audio
> **Current assets**: `public/assets/optimized/` - OGG format, compressed

This document describes audio files that would improve the combat audio experience. The system uses placeholder audio (reusing existing sounds) where dedicated files are missing.

## Weapon Sound Variants

### Rifle Variants (3 total)
- `playerGunshot.wav` - Already exists (variant 1)
- `playerGunshot2.wav` - **NEEDED**: Slightly different rifle shot (variant 2)
- `playerGunshot3.wav` - **NEEDED**: Slightly different rifle shot (variant 3)

**Purpose**: Random selection prevents repetitive firing sounds. Each shot should sound similar but with subtle differences in tone, echo, or timbre.

### Shotgun Variants (3 total)
- `playerShotgun.wav` - Already exists (variant 1)
- `playerShotgun2.wav` - **NEEDED**: Slightly different shotgun blast (variant 2)
- `playerShotgun3.wav` - **NEEDED**: Slightly different shotgun blast (variant 3)

**Purpose**: Same as rifle - variety prevents audio fatigue during rapid firing.

### SMG Variants (3 total)
- `playerSMG.wav` - Already exists (variant 1)
- `playerSMG2.wav` - **NEEDED**: Slightly different SMG shot (variant 2)
- `playerSMG3.wav` - **NEEDED**: Slightly different SMG shot (variant 3)

**Purpose**: Critical for SMG due to high rate of fire. Variants mask repetition.

### Enemy Gunshot Variants (3 total)
- `otherGunshot.wav` - Already exists (variant 1)
- `otherGunshot2.wav` - **NEEDED**: Enemy weapon variant 2
- `otherGunshot3.wav` - **NEEDED**: Enemy weapon variant 3

**Purpose**: Makes distant/nearby enemy fire more varied and realistic.

## Reload Sequence Sounds

### Magazine Removal
- `reloadMagOut.ogg` - **NEEDED**: Sound of magazine being pulled out
  - Should include: Metal-on-metal sliding, magazine release click
  - Duration: ~0.3-0.5 seconds
  - Reference timing: Plays at 20% progress in reload animation

### Magazine Insertion
- `reloadMagIn.ogg` - **NEEDED**: Sound of new magazine being inserted and locked
  - Should include: Magazine sliding in, satisfying "click" of lock engaging
  - Duration: ~0.4-0.6 seconds
  - Reference timing: Plays at 50-70% progress in reload animation

### Chamber/Bolt Action
- `reloadChamber.ogg` - **NEEDED**: Sound of chambering a round
  - Should include: Bolt/charging handle being pulled and released
  - Duration: ~0.3-0.4 seconds
  - Reference timing: Plays at 85% progress in reload animation

**Current State**: Using placeholder `playerReload.ogg` for all stages
**Benefit**: Sequenced sounds make reload feel more tactile and satisfying

## Empty Weapon Click

- `emptyClick.ogg` - **NEEDED**: Mechanical click when trigger is pulled on empty weapon
  - Should be: Dry, mechanical "click" or "clack"
  - Duration: ~0.1-0.2 seconds
  - Pitch variation: 5-10% applied programmatically
  - Triggers: When player clicks fire with 0 ammo in magazine

**Current State**: Using placeholder `playerReload.ogg`
**Benefit**: Clear audio feedback that weapon is empty, reinforcing reload urgency

## Impact Sounds (Material-Specific)

### Metal Impact
- `impactMetal.ogg` - **NEEDED**: Bullet hitting metal surface
  - Should sound: Sharp "ping" or "clang", metallic resonance
  - Variations: System applies 10-15% pitch variation
  - Use case: Hitting vehicles, helmets, metal structures

### Dirt Impact
- `impactDirt.ogg` - **NEEDED**: Bullet hitting dirt/ground
  - Should sound: Dull "thud", dust/debris scatter
  - Variations: System applies 15-20% pitch variation
  - Use case: Missed shots hitting terrain

### Vegetation Impact
- `impactVegetation.ogg` - **NEEDED**: Bullet hitting leaves/branches
  - Should sound: Rustling, snapping, organic crunch
  - Variations: System applies 20% pitch variation
  - Use case: Shots hitting jungle foliage

### Water Impact
- `impactWater.ogg` - **NEEDED**: Bullet entering water
  - Should sound: Splash, water displacement
  - Variations: System applies 5-10% pitch variation
  - Use case: Shots hitting water surfaces

### Body Impact
- `impactBody.ogg` - **NEEDED**: Bullet hitting flesh (meatier sound)
  - Should sound: Heavy impact, organic "thud"
  - Variations: System applies 8-10% pitch variation
  - Use case: Non-fatal body hits on enemies

### Headshot Impact
- `impactHeadshot.ogg` - **NEEDED**: Distinct headshot sound
  - Should sound: Sharp crack, more dramatic than body hit
  - Variations: System applies 5-10% pitch variation (higher pitch range)
  - Use case: Fatal headshot hits
  - Special: Plays alongside hit feedback for maximum satisfaction

**Current State**: All using placeholder `playerReload.ogg`
**Benefit**: Material-specific impacts make combat feel more grounded and realistic

## Implementation Details

### Audio Pooling
- All sounds use object pooling to prevent GC pressure
- Pool sizes:
  - Gunshot variants: 20 instances
  - Empty click: 3 instances
  - Reload sequence: 5 instances
  - Impact sounds: 8 instances

### Pitch Variation
The system applies additional programmatic pitch variation on top of using different audio files:
- Weapon sounds: ±5-10% depending on weapon type
- Impact sounds: ±5-20% depending on material type
- This combined with file variants creates rich audio variety

### Spatial Audio
- Enemy gunshots use Three.js PositionalAudio
- Distance-based filtering already implemented (low-pass for distance)
- Impact sounds are currently non-positional but could be upgraded

## Priority Recommendations

**High Priority** (Most noticeable improvements):
1. Weapon sound variants (rifle, shotgun, SMG) - eliminates repetition
2. Empty click sound - critical player feedback
3. Body/Headshot impact sounds - makes hits feel more impactful

**Medium Priority** (Nice to have):
4. Reload sequence (mag out, mag in, chamber) - polish
5. Enemy gunshot variants - distant combat variety

**Low Priority** (Environmental polish):
6. Material-specific impacts (metal, dirt, vegetation, water) - environmental detail

## File Format Recommendations

- **Format**: OGG Vorbis (compressed) or WAV (uncompressed)
- **Sample Rate**: 44.1kHz or 48kHz
- **Bit Depth**: 16-bit (sufficient for game audio)
- **Channels**: Mono (faster loading, smaller files, spatializes better)
- **Compression**: OGG at quality 6-8 for good size/quality balance

## Testing the System

Even with placeholder sounds, the system demonstrates:
- ✅ Random variant selection working
- ✅ Pitch variation applied correctly
- ✅ Audio ducking during combat
- ✅ Proper triggering based on game events
- ✅ Object pooling preventing performance issues

Replace placeholder files in `public/assets/optimized/` with actual sound files matching the names above, and the full experience will activate immediately.
