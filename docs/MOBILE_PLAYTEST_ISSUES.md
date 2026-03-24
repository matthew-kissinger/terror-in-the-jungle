# Mobile Playtest Issues

Device: Samsung Galaxy S24+ (SM-S926U), 1080x2340, Chrome
Date: 2026-03-23

---

## Flow / Fullscreen Issues

### F-1: START GAME forces landscape + fullscreen
Tapping START on the portrait title screen immediately triggers fullscreen landscape for mode select. Mode select should work in portrait too - let the user choose when to go landscape.

### F-2: Fullscreen drops between screens
Fullscreen is lost transitioning from mode select to deploy screen. User ends up in portrait with Chrome address bar showing. Fullscreen should persist across screen transitions.

### F-3: Chrome address bar eats vertical space
When fullscreen drops (F-2), Chrome's bar + status bar take ~15% of landscape height, making deploy screen and gameplay severely cramped.

---

## Mode Select Screen

### M-1: Header clipped behind safe area
Thin colored bar visible at top but "SELECT MODE" title is cut off or hidden behind the notch/safe area inset. Needs safe-area-inset-top padding.

### M-2: Mode cards cramped in landscape
All 4 cards visible but tight vertical spacing, no scroll affordance if content overflows.

---

## Deploy Screen

### D-1: Portrait text spacing bad
Headers, body text, map area all have minimal/uneven margins and padding. Line heights too tight. Everything feels crammed together.

### D-2: Dual headers waste space
"FRONTIER INSERTION" and "FRONTIER OPERATIONS MAP - SELECT INSERTION" both show as separate headers. On mobile landscape, this eats into the map's vertical space. Consolidate or hide subtitle on mobile.

### D-3: Map too small
Operations map is small in both portrait and landscape. In landscape it's about 55% of width but vertically squished. Hard to select zones.

### D-4: Portrait "READY FOR INSERTION" cut off
Deploy button partially hidden at bottom edge in portrait.

---

## In-Game HUD - Layout

### H-1: Minimap position and spacing
Minimap should be in the top-left corner with equal spacing from top and left edges. Currently it's attached to the top edge but spaced from the side - should have consistent inset on both axes.

### H-2: Timer/score should be higher
"14:45 984 907" top-center bar should sit closer to the top edge to free up gameplay viewport.

### H-3: Bottom-left HUD clutters joystick zone
Ammo display (AR 30 90), health bar (100%), and weapon pill are all in the bottom-left, directly in the joystick interaction area. This interferes with movement input.

**Proposed fix:** Move ammo info into the weapon swap button (make it more minimal/integrated). Move health bar to below the minimap. Move squad info below health, below minimap.

### H-4: RALLY button placement
Currently centered at bottom, interferes with movement. Should move to below the minimap area in the top-left, grouped with squad/tactical info.

### H-5: Right-side button stacking
Hamburger menu (top-right), ADS button (mid-right), fire/crosshair/arrow cluster - the "AR" label near ADS could collide with the aim reticle button. Needs clearer vertical separation.

### H-6: Minimap overlaps squad text
Minimap sits on top of SQUAD/OPFOR/AUTO text labels. They're layered and hard to read.

---

## In-Game HUD - Proposed Mobile Layout

```
TOP-LEFT (safe inset):        TOP-CENTER:          TOP-RIGHT:
+------------------+          14:45                 [=] menu
| MINIMAP          |          984 vs 907
+------------------+
  Health bar
  Squad: 10
  OPFOR / AUTO
  [RALLY]

BOTTOM-LEFT:                  BOTTOM-CENTER:        BOTTOM-RIGHT:
  (joystick zone -            (clear)               Fire btn
   keep clear!)                                     ADS btn
                                                    Weapon swap
                                                     (w/ ammo)
```

Key principles:
- Bottom-left must be clear for joystick
- Group tactical info (health, squad, rally) under minimap in top-left
- Ammo integrates into weapon swap on right side
- Timer/score as high as possible
- Consistent safe-area insets everywhere

---

## Controls

### C-1: Joystick locks to forward-only after pause/resume
After pausing (hamburger menu?) and resuming, the left joystick only registers forward movement - no strafe or backward. All other controls (look, fire, buttons) still work. Leaving fullscreen and re-entering corrects it. This points to the joystick's coordinate origin or bounding rect getting stale when the pause overlay changes the layout/visibility, and not recalculating on resume. The `fullscreenchange` listener resets work around it but shouldn't be needed.

### C-2: ENTER button overlaps fire button near helicopter
When near a helicopter, an ENTER button appears in the bottom-right directly on top of the fire button cluster. There's also a center-screen text prompt "Tap ENTER to board helicopter". The ENTER button should not overlap the fire/action buttons - it needs its own dedicated spot (maybe above the action cluster or as a contextual replacement for one of the buttons).

### C-3: Aim/look sensitivity
Not yet evaluated.

### C-3: Helicopter HUD left-side overlap
In helicopter mode, the left-side HUD is a mess: minimap, speed/altitude/heading text (US ROAD 46, 10, OPFOR), squad info, and health bar are all overlapping each other in the top-left. The helicopter flight instruments (if any) aren't visible or are buried under the minimap.

### C-4: Helicopter cyclic (right joystick) only registers up and left
The right-side cyclic joystick (visible bottom-right with crosshair) only allows up and left input - can't pitch down or roll right. Same stale-rect issue as C-1 but on the helicopter cyclic. Works correctly outside fullscreen.

### C-5: Helicopter controls - fullscreen breaks input
Helicopter controls only work properly when NOT in fullscreen. Fullscreen causes the cyclic joystick to lose directional range (C-4). This is the same root cause as C-1 - joystick bounding rect goes stale on fullscreen/viewport changes.

### C-6: Vehicle action buttons (STAB/LOCK) placement
Right side shows STAB and LOCK buttons stacked vertically. These plus the other values (10, 15.0) look cramped and overlap with the hamburger menu area.

### C-7: Helicopter portrait mode is unusable
After fullscreen drops, helicopter ends up in portrait with Chrome bar. The entire left side is a wall of overlapping HUD: minimap, flight instruments (52m altitude, 10 speed, SE 155 heading, -1.3 VSI), health 72%, LIFT/thrust bars 1%. Right side has EXIT/MAP/CMD/STAB/LOOK buttons stacked vertically taking up most of the right edge. The cyclic joystick (bottom-right) and collective (bottom-left) are crammed into the bottom third. Viewport for actually flying is maybe 40% of the screen. Helicopter should probably force landscape or at minimum the HUD needs a completely different portrait layout.

### C-ROOT: Pointer lock active on mobile (CONFIRMED root cause of joystick + aim locking)
`document.body` has pointer lock (`document.pointerLockElement === document.body`) even though this is a touch device (`pointer: coarse`, `ontouchstart: true`, `maxTouchPoints: 5`). Pointer lock is a desktop mouse-capture API.

**CONFIRMED via live instrumentation:** With pointer lock active, ALL pointer events report `clientX: 0, clientY: 0`. Only `movementX/movementY` deltas are populated (per spec). The joystick code uses `clientX/clientY` to calculate offset from the base center, so it computes: `(0,0) - baseCenter = always top-left`. Left joystick: offset(-84,-224). Right cyclic: offset(-680,-224). Both permanently pegged to one direction.

This single bug causes: C-1 (joystick forward-only after pause), C-4 (cyclic up-left only), C-5 (fullscreen breaks input), and all aim locking. The detection fails because Chrome Android reports `hover: none` as false, so the game doesn't detect it as mobile.

**Fix:** Never request pointer lock when `pointer: coarse` is true, or exit pointer lock when touch input is detected.

### C-8: Helicopter landscape non-fullscreen - buttons missing, HUD truncated
With Chrome bar visible in landscape, most of the helicopter HUD disappears. Only LOOK button visible on the right (EXIT/MAP/CMD/STAB gone or clipped). Flight instruments (altitude/speed/heading) reduced to just "SE 121" fragment. Left side shows minimap, squad labels (SQUAD/OPFOR), and a partial green bar (health? lift?). The vehicle action buttons (EXIT etc.) appear to be clipped off the top-right by the Chrome address bar. Something labeled "SE 171M" and "STEER" partially visible bottom area. The HUD layout is clearly not adapting to the reduced viewport height when Chrome bars are present - it assumes fullscreen dimensions.

### C-9: Vehicle action bar renders offscreen (y:-155)
The vehicleActionBar is positioned at y:-155, putting EXIT/MAP/CMD buttons above the viewport. Only STAB (y:13) and LOOK (y:69) are visible. This explains the missing buttons in helicopter mode. The CSS positioning doesn't account for the reduced viewport height when Chrome bars are present.

### C-10: Title screen elements still in DOM during gameplay
Title screen H1 ("TERROR IN THE JUNGLE"), loading bar, progress fill, and "Ready" text all have visible rects and non-none display during helicopter gameplay. They may be intercepting touch events or at minimum wasting GPU compositing.

### C-11: Helicopter cyclic zone too small
Cyclic touch zone is {x:452, y:119, w:302, h:179} - only bottom 60% of right side. Upper-right is dead zone for pitch/roll input. Combined with the collective zone only covering bottom 45% of left side, less than half the screen is usable for flight input.

### C-12: Aim/look sensitivity
Not yet evaluated on foot.

---

## Status

### Fixed (2026-03-23)
- [x] C-ROOT: Pointer lock on mobile - `PlayerInput.ts` touch guard, `PlayerRespawnManager.ts` callsite fix
- [x] F-1: Forced fullscreen on START removed
- [x] M-1: Mode select header safe-area + font sizing
- [x] D-4: Deploy screen scrollable (`overflow-y: auto`)
- [x] C-10: Title screen uses `display: none` when hidden
- [x] C-9: Vehicle action bar anchored from joystick base
- [x] C-11: Touch zones expanded to 65% height
- [x] H-3: Bottom-left cleared - weapon-bar hidden on mobile, grid rows removed
- [x] H-1: Health slot alignment changed to flex-start (top-left)
- [x] H-4: RALLY moved to top-left area (38% from top)
- [x] C-2: ENTER button repositioned to center-right (clear of fire/ADS)
- [x] Helicopter HUD repositioned to top-left on landscape mobile
- [x] Vehicle action bar compacted on short viewports (40px buttons, hide non-essential)
- [x] Fullscreen toggle added to Field Menu (Settings modal)

### Needs Retesting (phone unavailable)
- [ ] F-2: Fullscreen persistence across screen transitions
- [ ] H-2: Timer/score position (status-bar flush top)
- [ ] H-5: Right-side button stacking with new interact position
- [ ] H-6: Minimap overlap with squad text
- [ ] C-3: Helicopter HUD overlap with new top-left position
- [ ] C-7: Helicopter portrait mode usability
- [ ] C-8: Helicopter landscape non-fullscreen
- [ ] C-12: Aim/look sensitivity (blocked until pointer lock fix verified)
- [ ] Zone capture notification positioning
- [ ] Overall HUD layout in both orientations x fullscreen states
