# Squad Command System - Rearchitecture Plan

Last updated: 2026-03-06
Status: COMMAND COORDINATOR + QUICK STRIP + MAP-FIRST OVERLAY LIVE ACROSS DESKTOP/TOUCH/GAMEPAD

## Problem Statement

Squad controls are fragmented across platforms with dead code, race conditions, and unintuitive UX. As the game scales from squad FPS to battalion-level RTS, the command interface needs a clean foundation.

## Current Architecture (Broken)

### Input Flow Diagram
```
Desktop:
  Z key -> PlayerInput.onKeyDown() -> callbacks.onSquadCommand() -> PlayerController -> CommandInputManager.toggleCommandMode() -> CommandModeOverlay
  Shift+1-5 -> PlayerInput.onKeyDown() -> InputManager context gate -> PlayerController -> CommandInputManager.issueQuickCommand() -> PlayerSquadController.issueQuickCommand()

Mobile:
  MenuButton "Squad" -> TouchMenuButton callback -> TouchControls -> PlayerInput -> CommandInputManager.toggleCommandMode() -> CommandModeOverlay
  QuickCommandStrip tap -> CommandInputManager.issueQuickCommand() -> PlayerSquadController.issueQuickCommand()

Gamepad:
  R3 click -> GamepadManager.poll() -> callbacks.onSquadCommand() -> CommandInputManager.toggleCommandMode()
```

### Known Issues

| Issue | File | Lines | Severity |
|-------|------|-------|----------|
| TouchActionButtons has no squad button | TouchActionButtons.ts | build():25-27 | RESOLVED - command entry now lives on the menu button and HUD strip, not the action-button stack |
| TouchControls wires case 'squad' that never fires | TouchControls.ts | setCallbacks():102-104 | RESOLVED - dead branch removed |
| SquadRadialMenu touchend fires before touchmove selects | SquadRadialMenu.ts | show():306-308 | HIGH - usability bug |
| Shift+Digit handled outside normal input pipeline | PlayerSquadController.ts | onKeyDown():75-103 | RESOLVED - now routed through PlayerInput/InputManager |
| No always-visible command surface | N/A | N/A | RESOLVED - QuickCommandStrip now mounts into HUD `command-bar` |
| Z-key hint in wrong file | PlayerSquadController.ts | old inline overlay | RESOLVED - dead inline help overlay removed |
| No helicopter check on Shift+Digit commands | PlayerInput.ts | onKeyDown() | RESOLVED - squad shortcuts are gated before callbacks fire |
| Radial menu still uses inline SVG styles | SquadRadialMenu.ts | :66-227 | LOW - not migrated to CSS Modules |
| No haptic feedback on mobile | SquadRadialMenu.ts | - | LOW - usability |
| Time slowdown placeholder never implemented | SquadRadialMenu.ts | - | LOW - deferred feature |

### Files Involved
- `src/systems/combat/CommandInputManager.ts` - command input coordinator, HUD strip bridge
- `src/systems/combat/PlayerSquadController.ts` - command execution backend, squad indicator UI, radial fallback
- `src/ui/hud/CommandTacticalMap.ts` - local tactical map surface for desktop/touch placement orders
- `src/ui/hud/SquadRadialMenu.ts` - radial SVG menu, mouse/touch handling
- `src/ui/hud/QuickCommandStrip.ts` - always-visible HUD quick-command surface
- `src/ui/controls/TouchActionButtons.ts` - mobile action buttons (NO squad button)
- `src/ui/controls/TouchControls.ts` - orchestrator (dead squad wiring)
- `src/systems/player/PlayerInput.ts` - Z-key and gamepad routing
- `src/systems/player/PlayerController.ts` - routes squad input into `CommandInputManager`

## Current Implementation Status

Implemented now:

- centralized squad-command entry through `CommandInputManager`
- `QuickCommandStrip` mounted into the HUD layout `command-bar`
- shared command state propagation from `PlayerSquadController` to HUD
- `CommandModeOverlay` live across desktop, touch, and gamepad as a map-first command surface, with pointer-unlock / close semantics handled by the coordinator
- `CommandTacticalMap` now handles point placement for HOLD, PATROL, and RETREAT plus friendly squad selection when no placement order is armed
- minimap and full map now mirror the squad command position with guidance lines, while the full map also highlights the player squad
- selected-squad detail now renders inside the overlay (squad id, leader, formation, faction)
- existing radial menu is retained only as a compatibility surface, not the primary command-mode path

Still deferred:

- touch cleanup for the dead `TouchActionButtons` squad path
- higher-scale command adapters

## Target Architecture

### Resolved Decisions
- **Fully real-time commanding.** No time slowdown in command mode. Player is vulnerable while commanding.
- **UX must be efficient enough to issue orders under fire.** Minimal menu depth, point-and-click on map, quick-access shortcuts.
- **Player can snap back to FPS instantly** (Escape or Z release). Audio cues for threats while in command view.

### Principles
1. **Single input path:** All command inputs (keyboard, touch, gamepad) flow through `CommandInputManager`
2. **Platform-agnostic:** Same command vocabulary on all devices, different affordances
3. **Scale-aware:** Interface adapts based on units under command (squad -> platoon -> company)
4. **Map-primary:** At platoon+ scale, map IS the command interface, not an overlay
5. **Real-time viable:** Every interaction must be completable in <2 seconds. No multi-step wizards.

### Proposed Command Flow
```
ALL PLATFORMS:
  Command trigger -> CommandInputManager.enterCommandMode()
    -> CommandModeUI.show() (tactical overlay or map view)
    -> user selects target + command
    -> CommandInputManager.executeCommand(target, command)
    -> SquadManager / PlatoonManager / etc.

Quick commands (no mode switch):
  Hotkey -> CommandInputManager.quickCommand(type)
    -> applies to currently selected unit
    -> visual feedback only (no mode switch)
```

### Command Vocabulary (Scale-Dependent)

**Squad (4-12 units):**
- FOLLOW_ME - squad follows player
- HOLD_POSITION - defend current position
- ASSAULT - attack designated point
- DEFEND - dig in at designated point
- RETREAT - fall back to rally point
- FREE_ROAM - autonomous AI

**Platoon (2-4 squads):**
- All squad commands applied to selected squad(s)
- FORMATION - set multi-squad formation (line, wedge, echelon)
- SUPPORT - selected squad provides overwatch for another
- FLANK - coordinated flanking movement

**Company+ (100+ units):**
- ADVANCE - front-line push toward objective
- WITHDRAW - controlled retreat
- REINFORCE - redirect reserves to position
- AIR_SUPPORT - call helicopter/CAS at map point
- ARTILLERY - mortar/indirect fire at map point

### Input Mapping

| Action | Desktop | Mobile | Gamepad |
|--------|---------|--------|---------|
| Enter command mode | Z | Command strip + menu button | R3 |
| Quick: Follow | Shift+1 or F1 | Quick command strip | D-pad Up |
| Quick: Hold | Shift+2 or F2 | Quick command strip | D-pad Right |
| Quick: Patrol | Shift+3 or F3 | Quick command strip | D-pad Down |
| Quick: Retreat | Shift+4 or F4 | Quick command strip | D-pad Left |
| Quick: Auto | Shift+5 or F5 | Quick command strip | Radial fallback |
| Select unit on map | Left click | Tap | A button |
| Set waypoint | Right click | Long press | X button |
| Cancel | Escape / Z release | Back button | B button |

### UI Components Needed

1. **CommandModeOverlay** - UIComponent, replaces SquadRadialMenu
   - Tactical map view (zoom of minimap)
   - Unit selection (click/tap on map icons)
   - Waypoint placement (right-click/long-press on map)
   - Command palette (sidebar or radial, context-dependent)

2. **QuickCommandStrip** - UIComponent, always-visible command shortcuts
   - Desktop: mounted into HUD `command-bar` above the weapon bar
   - Mobile: mounted into HUD `command-bar` as the accessible command surface until a touch-specific overlay exists
   - Shows current command state per selected unit

3. **UnitInfoPanel** - UIComponent, shows selected unit status
   - Squad composition, health, ammo
   - Current command and waypoint
   - Morale/suppression state

4. **WaypointRenderer** - draws command lines/arrows on minimap and full map

## Cleanup Required (Before Rearchitecture)

1. Remove dead `case 'squad'` in TouchControls.setCallbacks() (DONE)
2. Remove dead squad wiring in TouchActionButtons
3. Move Shift+Digit handling from PlayerSquadController to PlayerInput (DONE)
4. Fix SquadRadialMenu touch race condition (interim fix before replacement)
5. Migrate SquadRadialMenu to CSS Modules (if keeping temporarily)

## Implementation Sequence

1. **Cleanup:** Remove dead code, unify input routing (1-2 hours)
2. **CommandInputManager:** Central command input router (DONE)
3. **QuickCommandStrip:** Replace Shift+Digit shortcuts with visible UI (DONE)
4. **CommandModeOverlay:** Replace SquadRadialMenu with map-based commands (DONE - overlay is map-first on desktop, touch, and gamepad)
5. **UnitInfoPanel:** Selected unit status display
6. **WaypointRenderer:** Visual feedback on map (PARTIAL - guidance lines now live in minimap/full-map renderers)
7. **Scale adapters:** Different command vocabulary per unit count
