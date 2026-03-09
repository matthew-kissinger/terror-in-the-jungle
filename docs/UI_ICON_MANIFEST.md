# UI Icon Manifest - Terror in the Jungle

Last updated: 2026-03-10
Status: COMPLETE - 50 pixel-art PNG icons, all wired via IconRegistry

## Overview

50 pixel-art PNG icons for HUD, touch controls, kill feed, helicopter instruments, minimap, reticles, faction emblems, and onboarding. White silhouettes on transparent background. Optimized to ~252KB total by `scripts/optimize-icons.mjs` (palette PNG, sharp trim+resize).

## Architecture

All icon references go through `src/ui/icons/IconRegistry.ts`:

```ts
import { icon, iconImg, iconHtml } from '../icons/IconRegistry';

// URL resolver (for src attributes, CSS backgrounds)
icon('icon-fire')  // -> "/assets/ui/icons/icon-fire.png"

// DOM element builder
iconImg('icon-fire', { width: 24, alt: 'Fire', lazy: true })

// HTML string builder (for innerHTML templates)
iconHtml('icon-fire', { width: 24, alt: 'Fire', css: 'opacity:0.8;' })

// Weapon icon lookup (returns <img> or <span> fallback for unknown)
getWeaponIconElement('rifle', 14)
getWeaponIconData('rifle')  // { iconFile, label }
getWeaponIconUrl('rifle')
```

## Asset Directory

`public/assets/ui/icons/` - optimized PNGs, served as static assets.

## Size Categories

| Prefix | Target Size | Use |
|--------|-------------|-----|
| `icon-*` | 48px | Touch buttons, HUD indicators, weapon icons |
| `emblem-*` | 128px | Faction emblems |
| `map-*` | 32px | Minimap markers |
| `mode-*` | 64px | Game mode cards |
| `hint-*` | 96px | Onboarding tutorial hints |
| `reticle-*` | 120px | Helicopter weapon pipper overlays |

---

## 1. Weapon Icons (13)

| ID | Description | Consumers |
|---|---|---|
| `icon-rifle` | M16/AK-47 rifle silhouette | KillFeed, UnifiedWeaponBar |
| `icon-shotgun` | Pump shotgun silhouette | KillFeed, UnifiedWeaponBar |
| `icon-smg` | Compact SMG silhouette | KillFeed, UnifiedWeaponBar |
| `icon-pistol` | Handgun silhouette | KillFeed, UnifiedWeaponBar |
| `icon-lmg` | M60 belt-fed LMG silhouette | KillFeed, UnifiedWeaponBar |
| `icon-launcher` | M79 grenade launcher silhouette | KillFeed, UnifiedWeaponBar |
| `icon-grenade` | Frag grenade silhouette | KillFeed |
| `icon-mortar` | Mortar tube silhouette | KillFeed |
| `icon-melee` | Knife/bayonet silhouette | KillFeed |
| `icon-sandbag` | Sandbag stack | UnifiedWeaponBar |
| `icon-minigun` | Rotary minigun (Cobra nose turret) | KillFeed, HelicopterHUD |
| `icon-rocket-pod` | Rocket pod cluster | KillFeed, HelicopterHUD |
| `icon-door-gun` | Side-mounted M60 (door gunner) | KillFeed |

## 2. Kill Feed Icons (2)

| ID | Description | Consumer |
|---|---|---|
| `icon-headshot` | Skull/crosshair | KillFeed headshot tag |
| `icon-kill-arrow` | Arrow between killer/victim | KillFeed entry |

## 3. HUD Instrument Icons (6)

| ID | Description | Consumer |
|---|---|---|
| `icon-altimeter` | Altitude gauge | HelicopterHUD elevation |
| `icon-airspeed` | Speed indicator | HelicopterHUD airspeed |
| `icon-compass-needle` | Heading indicator | HelicopterHUD heading |
| `icon-engine-health` | Engine condition gauge | HelicopterHUD damage bar |
| `icon-auto-hover` | Hover stabilize | HelicopterHUD status box |
| `icon-boost` | Engine boost | HelicopterHUD status box |

## 4. Touch Control Icons (8)

| ID | Description | Consumer |
|---|---|---|
| `icon-fire` | Trigger/crosshair | TouchFireButton |
| `icon-ads` | Scope/sight | TouchADSButton |
| `icon-reload` | Circular reload arrow | TouchActionButtons |
| `icon-jump` | Upward arrow/figure | TouchActionButtons |
| `icon-interact` | Hand/gear interact | TouchInteractionButton |
| `icon-crouch` | Crouching figure | TouchCrouchButton |
| `icon-menu` | Hamburger menu | TouchMenuButton |
| `icon-grenade-throw` | Grenade with arc line | (grenade quick-throw gesture) |

## 5. Crosshair/Reticle Assets (2)

| ID | Description | Consumer |
|---|---|---|
| `reticle-cobra-gun` | Forward gun pipper | CrosshairSystem attack mode |
| `reticle-rocket` | Rocket pod targeting circle | CrosshairSystem attack mode |

## 6. Faction Emblems (4)

| ID | Description | Consumer |
|---|---|---|
| `emblem-us` | US Forces insignia | StartScreen faction picker |
| `emblem-arvn` | ARVN forces insignia | StartScreen faction picker |
| `emblem-nva` | NVA forces insignia | StartScreen faction picker |
| `emblem-vc` | Viet Cong insignia | StartScreen faction picker |

## 7. Game Mode Icons (4)

| ID | Description | Consumer |
|---|---|---|
| `mode-tdm` | Crossed rifles/skull | StartScreen mode card |
| `mode-conquest` | Flag on territory | StartScreen mode card |
| `mode-frontier` | Helicopter + map | StartScreen mode card |
| `mode-ashau` | Mountain/valley silhouette | StartScreen mode card |

## 8. Minimap/Map Icons (6)

| ID | Description | Consumer |
|---|---|---|
| `map-helipad` | Helicopter landing circle | MinimapRenderer |
| `map-firebase` | Fort/base icon | (available, not yet wired) |
| `map-village` | Hut cluster icon | (available, not yet wired) |
| `map-zone-flag` | Capture zone marker | (available, not yet wired) |
| `map-player` | Player arrow/chevron | (available, not yet wired) |
| `map-squad-member` | Teammate marker | (available, not yet wired) |

## 9. Onboarding Hint Icons (5)

| ID | Description | Consumer |
|---|---|---|
| `hint-wasd` | WASD key cluster diagram | OnboardingOverlay (PC) |
| `hint-mouse` | Mouse with left-click highlight | OnboardingOverlay (PC) |
| `hint-e-key` | E key diagram | OnboardingOverlay (PC) |
| `hint-swipe` | Finger swipe gesture | OnboardingOverlay (mobile) |
| `hint-joystick` | Virtual joystick diagram | OnboardingOverlay (mobile) |

---

## Total: 50 icons (45 wired, 5 minimap POI available but not yet wired)

## Optimization

- `scripts/optimize-icons.mjs` handles trim, resize to target size, palette PNG compression
- `scripts/optimize-icons.mjs` also programmatically generates `icon-menu.png` and `icon-ads.png` from SVG primitives
- Total footprint: ~252KB (50 files)
- Format: PNG (optimal for small pixel art; WebP marginal at these sizes)
