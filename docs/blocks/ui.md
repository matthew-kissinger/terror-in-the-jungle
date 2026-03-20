# UI Domain

> Self-contained reference. 4 blocks, 60+ modules across 10 subdirectories under `src/ui/`.
> HUD has NO polling loop for most data - other systems push via direct method calls.
> HUDSystem.update() does only 5Hz zone/ticket polling.
> UIComponent is the abstract base class for all widget modules; it uses @preact/signals-core for reactive state.
> All DOM mounting goes through HUDLayout.getSlot() to preserve the CSS Grid structure.
> GameplayPresentationController / VisibilityManager drive HUD state via data-device, data-phase, data-actor-mode, data-overlay, and data-ads attributes (not per-widget JS style toggles).

[GH]: https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src

---

## Blocks

| Block | Modules | Budget | Update Rate | Fan-in | Notes |
|---|---|---|---|---|---|
| HUDSystem | 29 (see below) | 1ms | push + 5Hz poll | 7 | push-driven; owns HUDZoneDisplay |
| MinimapSystem | MinimapSystem + 3 helpers | 0.5ms | 20Hz | 3 | canvas 2D, downsampled position reads |
| FullMapSystem | FullMapSystem + 6 helpers | 0.5ms | 20Hz (when open) | 4 | paused when closed |
| CompassSystem | CompassSystem + 3 helpers | 0.5ms | 20Hz | 1 | reads player yaw only |

---

## Directory Layout

All UI files live under `src/ui/` (not `src/systems/`):

```
src/ui/
  compass/     CompassSystem, CompassDOMBuilder, CompassStyles, CompassZoneMarkers
  controls/    TouchControls, TouchLook, TouchFireButton, TouchADSButton, TouchActionButtons,
               TouchInteractionButton, TouchMenuButton, TouchMortarButton, TouchRallyPointButton,
               TouchSandbagButtons, TouchHelicopterCyclic, VehicleActionBar, VirtualJoystick,
               GamepadManager, TouchControlLayout
  debug/       PerformanceOverlay, LogOverlay, TimeIndicator
  design/      styles, tokens, responsive, index
  end/         MatchEndScreen
  engine/      UIComponent, css-modules.d, index
  hud/         30 widget modules (see registry below)
  layout/      HUDLayout, HUDLayoutStyles, GameplayPresentationController, VisibilityManager, types, index
  loading/     SettingsModal, LoadingProgress
  loadout/     LoadoutSelector (legacy), LoadoutGrenadePanel, LoadoutTypes
  map/         FullMapSystem, FullMapInput, FullMapStyles, FullMapDOMHelpers,
               OpenFrontierRespawnMap, OpenFrontierRespawnMapRenderer,
               OpenFrontierRespawnMapUtils
  minimap/     MinimapSystem, MinimapDOMBuilder, MinimapRenderer, MinimapStyles
  screens/     GameUI, TitleScreen, ModeSelectScreen, DeployScreen, ScreenPrimitives.module.css
  MobilePauseOverlay.ts
```

---

## HUD Module Registry (30 modules in `ui/hud/`)

| Module | File | Role |
|---|---|---|
| [HUDSystem]([GH]/ui/hud/HUDSystem.ts) | ui/hud/HUDSystem.ts | Top-level block class; owns HUDElements and HUDZoneDisplay; 5Hz zone/ticket poll |
| [HUDElements]([GH]/ui/hud/HUDElements.ts) | ui/hud/HUDElements.ts | Instantiates and wires all widget UIComponent instances |
| [HUDZoneDisplay]([GH]/ui/hud/HUDZoneDisplay.ts) | ui/hud/HUDZoneDisplay.ts | Zone objectives panel, owned by HUDSystem |
| [HUDStyles]([GH]/ui/hud/HUDStyles.ts) | ui/hud/HUDStyles.ts | Injects global HUD CSS at runtime |
| [HUDZoneStyles]([GH]/ui/hud/HUDZoneStyles.ts) | ui/hud/HUDZoneStyles.ts | Zone display CSS styles |
| [ScoreboardPanel]([GH]/ui/hud/ScoreboardPanel.ts) | ui/hud/ScoreboardPanel.ts | Tab-key scoreboard overlay |
| [StatsPanel]([GH]/ui/hud/StatsPanel.ts) | ui/hud/StatsPanel.ts | Per-player stats display within scoreboard |
| [UnifiedWeaponBar]([GH]/ui/hud/UnifiedWeaponBar.ts) | ui/hud/UnifiedWeaponBar.ts | Unified weapon slot bar (replaces 3 legacy duplicates) |
| [WeaponPill]([GH]/ui/hud/WeaponPill.ts) | ui/hud/WeaponPill.ts | Single weapon slot pill inside UnifiedWeaponBar |
| [WeaponSwitchFeedback]([GH]/ui/hud/WeaponSwitchFeedback.ts) | ui/hud/WeaponSwitchFeedback.ts | Brief animation on weapon swap |
| [AmmoDisplay]([GH]/ui/hud/AmmoDisplay.ts) | ui/hud/AmmoDisplay.ts | Current mag / reserve ammo counts |
| [GrenadeMeter]([GH]/ui/hud/GrenadeMeter.ts) | ui/hud/GrenadeMeter.ts | Grenade count + cook progress arc |
| [KillCounter]([GH]/ui/hud/KillCounter.ts) | ui/hud/KillCounter.ts | Running kill tally for player |
| [KillFeed]([GH]/ui/hud/KillFeed.ts) | ui/hud/KillFeed.ts | Scrolling kill feed, auto-expires entries |
| [MatchTimer]([GH]/ui/hud/MatchTimer.ts) | ui/hud/MatchTimer.ts | Countdown timer from TicketSystem |
| [TicketDisplay]([GH]/ui/hud/TicketDisplay.ts) | ui/hud/TicketDisplay.ts | BLUFOR/OPFOR ticket counts |
| [HelicopterHUD]([GH]/ui/hud/HelicopterHUD.ts) | ui/hud/HelicopterHUD.ts | RPM gauge, altitude, airspeed instruments |
| [GameStatusPanel]([GH]/ui/hud/GameStatusPanel.ts) | ui/hud/GameStatusPanel.ts | Mode-specific status text (e.g., "Capturing...") |
| [InteractionPromptPanel]([GH]/ui/hud/InteractionPromptPanel.ts) | ui/hud/InteractionPromptPanel.ts | Context prompt (E to enter helicopter, etc.) |
| [ObjectiveDisplay]([GH]/ui/hud/ObjectiveDisplay.ts) | ui/hud/ObjectiveDisplay.ts | Primary objective text slot |
| [MobileStatusBar]([GH]/ui/hud/MobileStatusBar.ts) | ui/hud/MobileStatusBar.ts | Compact status for portrait-fallback |
| [MortarPanel]([GH]/ui/hud/MortarPanel.ts) | ui/hud/MortarPanel.ts | Mortar targeting UI overlay |
| [CommandModeOverlay]([GH]/ui/hud/CommandModeOverlay.ts) | ui/hud/CommandModeOverlay.ts | Center-slot map-first command panel for desktop, touch, and gamepad with selected-squad detail |
| [CommandTacticalMap]([GH]/ui/hud/CommandTacticalMap.ts) | ui/hud/CommandTacticalMap.ts | Local tactical map used inside the command overlay for point placement orders, squad picking, and gamepad cursor confirmation |
| [DamageNumberSystem]([GH]/ui/hud/DamageNumberSystem.ts) | ui/hud/DamageNumberSystem.ts | Floating damage numbers in world space |
| [HitMarkerFeedback]([GH]/ui/hud/HitMarkerFeedback.ts) | ui/hud/HitMarkerFeedback.ts | Crosshair hit flash |
| [ScorePopupSystem]([GH]/ui/hud/ScorePopupSystem.ts) | ui/hud/ScorePopupSystem.ts | "+100 pts" popups |
| [ZoneCaptureNotification]([GH]/ui/hud/ZoneCaptureNotification.ts) | ui/hud/ZoneCaptureNotification.ts | "Zone captured!" banner on ownership flip |

---

## Layout System (in `ui/layout/`)

| Module | File | Role |
|---|---|---|
| [HUDLayout]([GH]/ui/layout/HUDLayout.ts) | ui/layout/HUDLayout.ts | Creates `#game-hud-root`, 18 named CSS Grid slots, `getSlot(region)` API |
| [HUDLayoutStyles]([GH]/ui/layout/HUDLayoutStyles.ts) | ui/layout/HUDLayoutStyles.ts | CSS Grid template definitions (desktop, mobile-landscape, mobile-portrait) |
| [GameplayPresentationController]([GH]/ui/layout/GameplayPresentationController.ts) | ui/layout/GameplayPresentationController.ts | Canonical gameplay HUD state for phase, device, input mode, actor mode, overlay, scoreboard, interaction prompt, and vehicle context |
| [VisibilityManager]([GH]/ui/layout/VisibilityManager.ts) | ui/layout/VisibilityManager.ts | Back-compatible alias over GameplayPresentationController used by older HUD/layout callers |
| [types]([GH]/ui/layout/types.ts) | ui/layout/types.ts | `HUDRegion` type (18 values), `LayoutMode`, `UIState`, `LayoutComponent`, `LayoutRegistration` |

---

## 18 Named HUD Regions

Source: [types.ts]([GH]/ui/layout/types.ts) `HUDRegion` type

| Region | Category | Default Content |
|---|---|---|
| `timer` | Info | MatchTimer |
| `tickets` | Info | TicketDisplay |
| `game-status` | Info | GameStatusPanel |
| `compass` | Info | CompassSystem |
| `minimap` | Info | MinimapSystem canvas |
| `objectives` | Info | ObjectiveDisplay / HUDZoneDisplay |
| `stats` | Info | StatsPanel (within ScoreboardPanel) |
| `kill-feed` | Info | KillFeed |
| `ammo` | Info | AmmoDisplay |
| `weapon-bar` | Info | UnifiedWeaponBar |
| `center` | Info | hit markers, damage numbers, grenade meter, mortar indicator, CommandModeOverlay |
| `health` | Info | health bar / player status |
| `status-bar` | Mobile | merged timer + tickets in one compact line |
| `joystick` | Touch | VirtualJoystick (left side) |
| `fire` | Touch | TouchFireButton |
| `ads` | Touch | TouchADSButton |
| `action-btns` | Touch | weapon cycler, CMD, MAP, reload, jump buttons |
| `menu` | Touch | TouchMenuButton |

Visibility: desktop/touch shells read `data-show="infantry"` plus `data-actor-mode` / `data-overlay` off `#game-hud-root`. `action-btns` remains a named region for layout bookkeeping, but the touch infantry action stack renders as a body-level fixed overlay so it survives mobile slot suppression.

---

## Touch Control Module Registry (15 modules in `ui/controls/`)

| Module | File | Role |
|---|---|---|
| [TouchControls]([GH]/ui/controls/TouchControls.ts) | ui/controls/TouchControls.ts | Root touch controller, delegates to sub-modules |
| [TouchLook]([GH]/ui/controls/TouchLook.ts) | ui/controls/TouchLook.ts | Right-side swipe -> camera yaw/pitch |
| [TouchFireButton]([GH]/ui/controls/TouchFireButton.ts) | ui/controls/TouchFireButton.ts | Fire button, pointer events |
| [TouchADSButton]([GH]/ui/controls/TouchADSButton.ts) | ui/controls/TouchADSButton.ts | Aim-down-sights toggle |
| [TouchActionButtons]([GH]/ui/controls/TouchActionButtons.ts) | ui/controls/TouchActionButtons.ts | Weapon cycler, CMD, MAP, reload, jump buttons (5 total) |
| [TouchInteractionButton]([GH]/ui/controls/TouchInteractionButton.ts) | ui/controls/TouchInteractionButton.ts | Context interaction (enter helicopter, pick up weapon) |
| [TouchMenuButton]([GH]/ui/controls/TouchMenuButton.ts) | ui/controls/TouchMenuButton.ts | Launcher for the shared gameplay pause/settings surface |
| [TouchMortarButton]([GH]/ui/controls/TouchMortarButton.ts) | ui/controls/TouchMortarButton.ts | Opens mortar targeting mode |
| [TouchRallyPointButton]([GH]/ui/controls/TouchRallyPointButton.ts) | ui/controls/TouchRallyPointButton.ts | Places squad rally point |
| [TouchSandbagButtons]([GH]/ui/controls/TouchSandbagButtons.ts) | ui/controls/TouchSandbagButtons.ts | Place/remove sandbag buttons |
| [TouchHelicopterCyclic]([GH]/ui/controls/TouchHelicopterCyclic.ts) | ui/controls/TouchHelicopterCyclic.ts | Cyclic joystick for helicopter (no collective/yaw on touch) |
| [VehicleActionBar]([GH]/ui/controls/VehicleActionBar.ts) | ui/controls/VehicleActionBar.ts | Capability-driven vehicle action stack (EXIT, FIRE, WPN, MAP, CMD, STAB, LOOK) shared by helicopter and future vehicle modes |
| [VirtualJoystick]([GH]/ui/controls/VirtualJoystick.ts) | ui/controls/VirtualJoystick.ts | Reusable floating joystick widget |
| [GamepadManager]([GH]/ui/controls/GamepadManager.ts) | ui/controls/GamepadManager.ts | Gamepad API polling, axis/button mapping |
| [TouchControlLayout]([GH]/ui/controls/TouchControlLayout.ts) | ui/controls/TouchControlLayout.ts | Positions touch controls on screen, CSS custom properties |

---

## Screen Module Registry (in `ui/screens/`)

| Module | File | Role |
|---|---|---|
| [GameUI]([GH]/ui/screens/GameUI.ts) | ui/screens/GameUI.ts | Screen state machine: LOADING -> TITLE -> MODE SELECT -> PREPARING -> HIDDEN. Drop-in replacement for old StartScreen. |
| [TitleScreen]([GH]/ui/screens/TitleScreen.ts) | ui/screens/TitleScreen.ts | Operations-table entry briefing with boot-status rail, mission brief panel, loading bar, START GAME, and settings utility |
| [ModeSelectScreen]([GH]/ui/screens/ModeSelectScreen.ts) | ui/screens/ModeSelectScreen.ts | Dossier-based mode picker with richer tempo/scale/theater metadata instead of flat cards |
| [DeployScreen]([GH]/ui/screens/DeployScreen.ts) | ui/screens/DeployScreen.ts | Command-surface deploy map with session-aware briefing metadata, map-first selection, and preserved RespawnUI API for PlayerRespawnManager |
| [ScreenPrimitives.module.css]([GH]/ui/screens/ScreenPrimitives.module.css) | ui/screens/ScreenPrimitives.module.css | Shared opaque screen primitives for the operations-table redesign (rails, hero panels, buttons, dossier cards, data rows) |

## Loading / Menu Support (in `ui/loading/`)

| Module | File | Role |
|---|---|---|
| [SettingsModal]([GH]/ui/loading/SettingsModal.ts) | ui/loading/SettingsModal.ts | Shared settings + gameplay pause surface for title/menu utility, desktop `Escape`, and touch menu access; includes resume, squad-command, and quit actions in-match |
| [LoadingProgress]([GH]/ui/loading/LoadingProgress.ts) | ui/loading/LoadingProgress.ts | Progress bar driven by bootstrap events |

---

## Match End (in `ui/end/`)

| Module | File | Role |
|---|---|---|
| [MatchEndScreen]([GH]/ui/end/MatchEndScreen.ts) | ui/end/MatchEndScreen.ts | After-action report overlay with verdict banner, summary metrics, awards, and replay/menu actions |

---

## Loadout (in `ui/loadout/`)

| Module | File | Role |
|---|---|---|
| [LoadoutSelector]([GH]/ui/loadout/LoadoutSelector.ts) | ui/loadout/LoadoutSelector.ts | Legacy grenade picker component retained for isolated UI tests; no longer part of the startup or deploy flow. |
| [LoadoutGrenadePanel]([GH]/ui/loadout/LoadoutGrenadePanel.ts) | ui/loadout/LoadoutGrenadePanel.ts | Grenade selection sub-panel |
| [LoadoutTypes]([GH]/ui/loadout/LoadoutTypes.ts) | ui/loadout/LoadoutTypes.ts | Loadout item types plus faction-aware weapon/equipment pools and preset templates used by the shared deploy flow |

---

## Map / Compass Module Registry

| Module | File | Role |
|---|---|---|
| [MinimapSystem]([GH]/ui/minimap/MinimapSystem.ts) | ui/minimap/MinimapSystem.ts | Canvas 2D minimap, 20Hz, blip rendering |
| [MinimapDOMBuilder]([GH]/ui/minimap/MinimapDOMBuilder.ts) | ui/minimap/MinimapDOMBuilder.ts | Minimap container DOM construction |
| [MinimapRenderer]([GH]/ui/minimap/MinimapRenderer.ts) | ui/minimap/MinimapRenderer.ts | Canvas rendering logic for tactical blips, helipads, and squad command guidance |
| [MinimapStyles]([GH]/ui/minimap/MinimapStyles.ts) | ui/minimap/MinimapStyles.ts | Minimap CSS |
| [FullMapSystem]([GH]/ui/map/FullMapSystem.ts) | ui/map/FullMapSystem.ts | Full-screen map overlay with player squad highlighting, squad command guidance, and command distance label |
| [FullMapInput]([GH]/ui/map/FullMapInput.ts) | ui/map/FullMapInput.ts | Pan/zoom input for full map |
| [FullMapStyles]([GH]/ui/map/FullMapStyles.ts) | ui/map/FullMapStyles.ts | Full map CSS |
| [FullMapDOMHelpers]([GH]/ui/map/FullMapDOMHelpers.ts) | ui/map/FullMapDOMHelpers.ts | DOM helper utilities for full map |
| [OpenFrontierRespawnMap]([GH]/ui/map/OpenFrontierRespawnMap.ts) | ui/map/OpenFrontierRespawnMap.ts | Unified respawn map for all modes (replaced RespawnMapView) |
| [OpenFrontierRespawnMapRenderer]([GH]/ui/map/OpenFrontierRespawnMapRenderer.ts) | ui/map/OpenFrontierRespawnMapRenderer.ts | Renderer for Open Frontier respawn map |
| [OpenFrontierRespawnMapUtils]([GH]/ui/map/OpenFrontierRespawnMapUtils.ts) | ui/map/OpenFrontierRespawnMapUtils.ts | Utility functions for Open Frontier respawn map |
| [CompassSystem]([GH]/ui/compass/CompassSystem.ts) | ui/compass/CompassSystem.ts | Heading compass strip, reads player yaw |
| [CompassDOMBuilder]([GH]/ui/compass/CompassDOMBuilder.ts) | ui/compass/CompassDOMBuilder.ts | Compass container DOM construction |
| [CompassStyles]([GH]/ui/compass/CompassStyles.ts) | ui/compass/CompassStyles.ts | Compass CSS |
| [CompassZoneMarkers]([GH]/ui/compass/CompassZoneMarkers.ts) | ui/compass/CompassZoneMarkers.ts | Zone direction markers on compass |

---

## UI Engine (in `ui/engine/`)

| Module | File | Role |
|---|---|---|
| [UIComponent]([GH]/ui/engine/UIComponent.ts) | ui/engine/UIComponent.ts | Abstract base class; @preact/signals-core reactive state |

---

## Design System (in `ui/design/`)

| Module | File | Role |
|---|---|---|
| [styles]([GH]/ui/design/styles.ts) | ui/design/styles.ts | Shared CSS helper functions |
| [tokens]([GH]/ui/design/tokens.ts) | ui/design/tokens.ts | Design tokens (colors, spacing, typography) |
| [responsive]([GH]/ui/design/responsive.ts) | ui/design/responsive.ts | ViewportManager singleton, breakpoint signals |

---

## Debug Overlays (in `ui/debug/`)

| Module | File | Role |
|---|---|---|
| [PerformanceOverlay]([GH]/ui/debug/PerformanceOverlay.ts) | ui/debug/PerformanceOverlay.ts | F2 real-time perf stats overlay |
| [LogOverlay]([GH]/ui/debug/LogOverlay.ts) | ui/debug/LogOverlay.ts | F3 log message overlay |
| [TimeIndicator]([GH]/ui/debug/TimeIndicator.ts) | ui/debug/TimeIndicator.ts | F4 time indicator |

---

## Other

| Module | File | Role |
|---|---|---|
| [MobilePauseOverlay]([GH]/ui/MobilePauseOverlay.ts) | ui/MobilePauseOverlay.ts | Shown on mobile visibility change (tab backgrounded) |

---

## Wiring

### Deps In (what UI blocks need)

| Dep | Source | Injected Via |
|---|---|---|
| ZoneManager (zone state) | ZoneManager | setter (HUDSystem 5Hz poll) |
| TicketSystem (counts) | TicketSystem | setter (HUDSystem 5Hz poll) |
| CombatantSystem (positions) | CombatantSystem | setter (MinimapSystem, FullMapSystem) |
| PlayerState (position, yaw) | PlayerSystem | setter (CompassSystem, MinimapSystem) |
| HeightQueryCache | TerrainSystem | setter (FullMapSystem terrain overlay) |

### Deps Out (what UI blocks provide - all via direct calls)

| Caller | Method Called | Trigger |
|---|---|---|
| FirstPersonWeapon | hud.updateAmmoDisplay(mag, reserve) | on fire / reload |
| CombatantSystem | hud.addKillToFeed(killer, victim) | on kill event |
| HelicopterModel | hud.showHelicopterInstruments(rpm, alt, spd) | on enter helicopter |
| HelicopterModel | hud.hideHelicopterInstruments() | on exit helicopter |
| GrenadeSystem | hud.updateGrenadeMeter(count, cookProgress) | on cook / throw |
| TicketSystem | hud.handleGameEnd(winner) | on match end |
| PlayerRespawnManager | hud.showRespawnMap() | on player death |
| CombatantSystem | hud.spawnDamageNumber(pos, amount) | on hit |

---

## Data Flow Summary

```
PUSH (most data):
  FirstPersonWeapon   ---ammo--->  HUDSystem.updateAmmoDisplay()
  CombatantSystem     ---kill--->  HUDSystem.addKillToFeed()
  HelicopterModel     ---rpm---->  HUDSystem.showHelicopterInstruments()
  GrenadeSystem       ---count-->  HUDSystem.updateGrenadeMeter()

POLL (5Hz, in HUDSystem.update()):
  ZoneManager.getZones()    -> HUDZoneDisplay.refresh()
  TicketSystem.getTickets() -> TicketDisplay.refresh()

POLL (20Hz, own update()):
  MinimapSystem: CombatantSystem.getPositions(), PlayerState.position
  FullMapSystem: same (only when map is open)
  CompassSystem: PlayerState.yaw
```

---

## Boot Splash

`index.html` contains an inline `#boot-splash` div with the game title and a CSS-only pulsing progress bar. This is visible within ~100ms on cold load, before any JS module graph loads. `GameUI.onMount()` removes `#boot-splash` from the DOM. No external CSS or JS dependencies.

## Loading Progress

`LoadingProgress` drives the progress bar on `TitleScreen`. During boot, `SystemInitializer` wires per-texture and per-audio `onProgress(loaded, total)` callbacks from `AssetLoader.init()` and `AudioManager.init()`. The progress bar transition is `0.15s linear` for responsive feel during rapid increments. During mode startup, `TitleScreen.updateModeLoadProgress()` receives phase events via `GameEventBus` and appends a slow-phase hint ("this may take a few seconds") during the navmesh generation phase.

## Mobile Entry

START GAME button on TitleScreen: calls `document.documentElement.requestFullscreen()` then `screen.orientation.lock('landscape')`. Compact fullscreen prompt auto-fades after 6 seconds. Touch controls activate only in fullscreen landscape.

---

## Related

- [Hub](../CODEBASE_BLOCKS.md) | [Player](player.md) | [Combat](combat.md) | [World](world.md) | [Vehicle](vehicle.md) | [Weapons](weapons.md)
- [src/ui/ directory]([GH]/ui) - full UI tree
- [src/ui/hud/]([GH]/ui/hud) - HUD widget modules
- [src/ui/controls/]([GH]/ui/controls) - touch controls
- [src/ui/layout/]([GH]/ui/layout) - grid layout system
- [src/ui/engine/]([GH]/ui/engine) - UIComponent base class
