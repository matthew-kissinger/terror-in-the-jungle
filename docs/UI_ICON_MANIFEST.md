# UI Icon Manifest - Terror in the Jungle

Last updated: 2026-03-09
Status: DRAFT - Generation queue for icon/SVG assets

## Overview

~50 SVG icon assets needed for HUD, touch controls, kill feed, helicopter instruments, minimap, and onboarding. All icons are monochrome using `currentColor` for CSS color control. Military/tactical aesthetic, clean silhouettes, must be legible at both 16px and 48px.

## Delivery Format

- Individual SVG files in `public/assets/ui/icons/`
- Naming: `{id}.svg` (e.g., `icon-rifle.svg`)
- ViewBox sizes noted per category
- Fill: `currentColor` (CSS controls color)
- Style: military/tactical, muted, clean silhouettes

---

## 1. Weapon Icons (SVG, 24x24 viewBox)

| ID | Description | Consumers |
|---|---|---|
| `icon-rifle` | M16/AK-47 rifle silhouette | KillFeed, WeaponPill, UnifiedWeaponBar |
| `icon-shotgun` | Pump shotgun silhouette | KillFeed, WeaponPill, UnifiedWeaponBar |
| `icon-smg` | Compact SMG silhouette | KillFeed, WeaponPill, UnifiedWeaponBar |
| `icon-pistol` | Handgun silhouette | KillFeed, WeaponPill, UnifiedWeaponBar |
| `icon-lmg` | M60 belt-fed LMG silhouette | KillFeed, WeaponPill, UnifiedWeaponBar |
| `icon-launcher` | M79 grenade launcher silhouette | KillFeed, WeaponPill, UnifiedWeaponBar |
| `icon-grenade` | Frag grenade silhouette | KillFeed, GrenadeMeter |
| `icon-mortar` | Mortar tube silhouette | KillFeed, MortarPanel |
| `icon-melee` | Knife/bayonet silhouette | KillFeed |
| `icon-sandbag` | Sandbag stack | UnifiedWeaponBar |

## 2. Helicopter Weapon Icons (SVG, 24x24)

| ID | Description |
|---|---|
| `icon-minigun` | Rotary minigun (Cobra nose turret) |
| `icon-rocket-pod` | Rocket pod cluster |
| `icon-door-gun` | Side-mounted M60 (door gunner) |

## 3. Kill Feed Icons (SVG, 16x16)

| ID | Description |
|---|---|
| `icon-headshot` | Skull or crosshair-on-head |
| `icon-kill-arrow` | Right arrow between killer/victim names |

## 4. HUD Instrument Icons (SVG, 20x20)

| ID | Description |
|---|---|
| `icon-altimeter` | Altitude gauge |
| `icon-airspeed` | Speed indicator |
| `icon-compass-needle` | Heading indicator |
| `icon-engine-health` | Engine condition gauge |
| `icon-auto-hover` | Hover stabilize (replaces `H` text) |
| `icon-boost` | Engine boost (replaces `B` text) |

## 5. Touch Control Icons (SVG, 32x32, white `currentColor`)

| ID | Description | Replaces |
|---|---|---|
| `icon-fire` | Trigger/crosshair symbol | `FIRE` text |
| `icon-ads` | Scope/sight symbol | `ADS` text |
| `icon-reload` | Circular reload arrow | `R` text |
| `icon-jump` | Upward arrow/figure | `JUMP` text |
| `icon-interact` | Hand/gear interact | `E` text |
| `icon-crouch` | Crouching figure | (new button) |
| `icon-menu` | Hamburger/gear | `MENU` text |
| `icon-grenade-throw` | Grenade with arc line | (new gesture) |

## 6. Crosshair/Reticle Assets (SVG, 60x60)

| ID | Description |
|---|---|
| `reticle-cobra-gun` | Forward gun pipper (circle + range hash marks) |
| `reticle-rocket` | Rocket pod targeting circle (wider, hash marks at 12/3/6/9) |

## 7. Faction Emblems (SVG, 32x32)

| ID | Description |
|---|---|
| `emblem-us` | US Forces insignia |
| `emblem-arvn` | ARVN forces insignia |
| `emblem-nva` | NVA forces insignia |
| `emblem-vc` | Viet Cong insignia |

## 8. Game Mode Icons (SVG, 24x24)

| ID | Description |
|---|---|
| `mode-tdm` | Crossed rifles/skull (deathmatch) |
| `mode-conquest` | Flag on territory (zone control) |
| `mode-frontier` | Helicopter + map (open frontier) |
| `mode-ashau` | Mountain/valley silhouette (A Shau) |

## 9. Minimap/Map Icons (SVG, 16x16)

| ID | Description | Replaces |
|---|---|---|
| `map-helipad` | Helicopter landing circle | `H` text on minimap |
| `map-firebase` | Fort/base icon | colored dot |
| `map-village` | Hut cluster icon | colored dot |
| `map-zone-flag` | Capture zone marker | letter + circle |
| `map-player` | Player arrow/chevron | white dot |
| `map-squad-member` | Teammate marker | small dot |

## 10. Onboarding Hint Icons (SVG, 48x48)

| ID | Description |
|---|---|
| `hint-wasd` | WASD key cluster diagram |
| `hint-mouse` | Mouse with left-click highlight |
| `hint-e-key` | E key diagram |
| `hint-swipe` | Finger swipe gesture |
| `hint-joystick` | Virtual joystick diagram |

---

## Total: ~50 icon assets

## Design Notes

1. Vietnam War era military aesthetic - not modern/futuristic
2. NATO color convention: Blue = US/allied, Red = OPFOR/enemy, Amber = warning
3. Icons must read clearly as small as 16px (kill feed) and as large as 48px (onboarding)
4. Use `currentColor` fill so consuming CSS can set color per context
5. Avoid fine detail that disappears at small sizes - bold silhouettes preferred
6. Weapon silhouettes should be recognizable side profiles
7. Faction emblems should be simplified/stylized versions of historical insignia
