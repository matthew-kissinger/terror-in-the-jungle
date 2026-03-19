# UI Icon Manifest - Terror in the Jungle

Last updated: 2026-03-19  
Status: **38** PNGs in `public/assets/ui/icons/`; URLs via `src/ui/icons/IconRegistry.ts`

## Removed (2026-03-19)

Unused in `src/`: `emblem-*` (4), `hint-*` (5), `icon-crouch`, `icon-grenade-throw`, `map-village`. Recover from git history if needed.

## Architecture

```ts
import { icon, iconImg, iconHtml } from '../icons/IconRegistry';
icon('icon-fire');
iconHtml('mode-frontier', { width: 36 });
getWeaponIconElement('rifle', 14);
```

## Registry by category

### Weapon & kill feed (15)

`icon-rifle`, `icon-shotgun`, `icon-smg`, `icon-pistol`, `icon-lmg`, `icon-launcher`, `icon-grenade`, `icon-mortar`, `icon-melee`, `icon-sandbag`, `icon-minigun`, `icon-rocket-pod`, `icon-door-gun`, `icon-headshot`, `icon-kill-arrow`

→ `KillFeed`, `UnifiedWeaponBar`, `HelicopterHUD` (weapon row), `IconRegistry` weapon map.

### Helicopter HUD instruments (6)

`icon-altimeter`, `icon-airspeed`, `icon-compass-needle`, `icon-engine-health`, `icon-auto-hover`, `icon-boost` → `HelicopterHUD`.

### Touch (6)

`icon-fire`, `icon-ads`, `icon-reload`, `icon-jump`, `icon-interact`, `icon-menu` → touch button modules.

### Reticles (2)

`reticle-cobra-gun`, `reticle-rocket` → `CrosshairSystem`.

### Mode cards (4)

`mode-tdm`, `mode-conquest`, `mode-frontier`, `mode-ashau` → `ModeSelectScreen`.

### Minimap (5)

`map-helipad`, `map-firebase`, `map-zone-flag`, `map-player`, `map-squad-member` → `MinimapRenderer`.

## Totals

- **38 files** — mono white-on-transparent pixel art unless noted.

## Optimization

Trim, resize, palette-friendly PNG. Source of truth for regeneration: `public/assets/source/ui/icons/` → `npm run assets:optimize -- --category icons`.
