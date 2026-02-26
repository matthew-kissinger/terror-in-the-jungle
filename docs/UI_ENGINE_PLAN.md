# UI Engine Plan: Option A - Full Rewrite

Last updated: 2026-02-22

## Executive Summary

Replace 108 ad-hoc UI files with a custom UIComponent system powered by
`@preact/signals-core` (1.6KB), CSS Modules (zero runtime), and a three-layer
design token architecture. Every HUD element, screen, and overlay gets rebuilt
with a cohesive military aesthetic inspired by Battlefield/Squad/Insurgency
conventions. The migration is incremental -- new components coexist with old
ones, no big bang.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color & Visual Identity](#2-color--visual-identity)
3. [Typography System](#3-typography-system)
4. [Design Token Architecture](#4-design-token-architecture)
5. [UIComponent Base Class](#5-uicomponent-base-class)
6. [CSS Modules Migration](#6-css-modules-migration)
7. [HUD Component Redesign](#7-hud-component-redesign)
8. [Screen Redesign](#8-screen-redesign)
9. [Responsive & Device Strategy](#9-responsive--device-strategy)
10. [Animation & Juice](#10-animation--juice)
11. [Input Unification](#11-input-unification)
12. [File Structure](#12-file-structure)
13. [Migration Phases](#13-migration-phases)
14. [Testing Strategy](#14-testing-strategy)
15. [Thought Trail](#15-thought-trail)

---

## 1. Design Philosophy

### What We're Building

A game engine UI system, not a website. Every shipped browser FPS (Krunker,
Surviv, Shell Shockers, Venge) uses vanilla DOM for UI. Every native engine
(Unity UIToolkit, Unreal UMG, Godot Control, Bevy bevy_ui) owns its component
system. We follow this pattern.

### Core Principles

**P1: Information Hierarchy Through Restraint**
The 3D world is the content. HUD exists to convey state, not to decorate.
Military shooters trend toward minimal chrome -- text with drop shadows over
transparent backgrounds, not frosted glass panels on everything. Reserve panel
backgrounds for menus and overlays. In-combat HUD should feel etched into the
viewport, not floating on top of it.

Thought: The current design uses `hudGlass` (rgba(8,12,18,0.55) + blur(6px))
on EVERY HUD element -- tickets, timer, ammo, game-status, objectives. This
makes the screen feel heavy with dark rectangles. Battlefield 2042 and Squad
use bare text with shadows for most HUD elements. We should follow suit --
glass panels only on minimap, scoreboard, menus.

**P2: Faction Colors Follow NATO Convention**
Blue = friendly (US), Red = enemy (OPFOR). This is universal across the genre
(BF3/4/2042, Squad, Arma, Hell Let Loose). Our current colors
(us: #5b8cc9, opfor: #c9564a) are already in this family but too pastel/muted
for HUD readability. Increase saturation slightly for on-screen elements while
keeping the current muted tones for menu chrome.

**P3: Two Layouts, Not One Scaled Layout**
Desktop and mobile are not the same layout at different sizes. They are
fundamentally different HUDs sharing the same component implementations.
Desktop has mouse precision, many keys, screen at arm's length. Mobile has
imprecise fingers covering 15-20% of the screen, no physical buttons, screen
in hands. The CSS Grid system already supports this with separate templates --
but the components themselves need to adapt (larger touch targets, contextual
visibility, element promotion/demotion).

**P4: Own the Pipeline**
Zero framework dependencies in the UI system. `@preact/signals-core` is the
only external dep (1.6KB, stable API). Everything else -- component lifecycle,
style scoping, input bridging -- is ours. This ensures native packaging
compatibility (Electron/Tauri/Capacitor) and eliminates upstream breakage risk.

**P5: Incremental Migration**
New UIComponent-based components coexist with old ad-hoc ones in the same grid
layout. Old components mount via `layout.getSlot().appendChild()`. New
components mount via `layout.register()`. Both work. Migration is
per-component, not per-phase.

---

## 2. Color & Visual Identity

### Current Problems

1. **Too many colors** -- tokens.ts defines 23 named colors, many overlapping
   (e.g., `danger` and `opfor` are the same #c9564a; `headshot` and `warning`
   are the same #d4a344).
2. **Pastel faction colors** -- #5b8cc9 (US) and #c9564a (OPFOR) lack punch on
   dark backgrounds. They read well in menus but wash out over jungle terrain.
3. **Glass everywhere** -- Every HUD element gets the same dark glass treatment,
   creating a screen full of dark rectangles.
4. **Hardcoded RGBA** -- Many components hardcode colors inline
   (e.g., HUDBaseStyles uses `rgba(220, 225, 230, 0.95)` directly instead of
   a token).

### New Palette

Three-layer token system (detailed in Section 4). Key changes:

**Primitive palette** (what colors exist):
```
Jungle dark:   #0a0f08  #151d10  #1e2a16  #2d3d22  #3f5530
Olive:         #4a6332  #5a7a3e  #6b904a  #8aad5e  #a8c87a
Steel:         #1a1f2e  #252d3e  #333d50  #4a5568  #64748b
Amber:         #92400e  #b45309  #d97706  #f59e0b  #fbbf24
Crimson:       #7f1d1d  #991b1b  #dc2626  #ef4444  #f87171
Cerulean:      #1e3a5f  #1d4ed8  #3b82f6  #60a5fa  #93c5fd
```

**Semantic tokens** (what they mean):
```
--faction-us:          #60a5fa    (brighter blue, reads on dark bg)
--faction-us-dim:      #3b82f6    (for backgrounds, panel borders)
--faction-opfor:       #ef4444    (brighter red)
--faction-opfor-dim:   #dc2626    (for backgrounds)
--faction-squad:       #4ade80    (green for squad markers)

--text-primary:        #e2e8f0    (slightly warm white)
--text-secondary:      #94a3b8    (cool grey)
--text-muted:          rgba(255,255,255,0.4)

--surface-void:        #0a0f08    (deepest background -- jungle dark)
--surface-panel:       rgba(10,15,8,0.75)   (glass panels)
--surface-panel-hover: rgba(10,15,8,0.85)
--surface-hud:         transparent  (most HUD elements -- no background)

--health-full:         #4ade80
--health-mid:          #fbbf24
--health-low:          #ef4444
--health-critical:     #dc2626

--ammo-normal:         var(--text-primary)
--ammo-low:            #fbbf24
--ammo-empty:          #ef4444

--accent:              #d97706    (amber -- objective markers, active states)
--accent-bright:       #f59e0b    (highlights, progress bars)
--success:             #4ade80
--warning:             #fbbf24
--danger:              #ef4444
--critical:            #dc2626
--headshot:            #fbbf24    (same as warning -- amber flash)
```

Thought: The current palette uses #7fb4d9 (primary) as accent but it's too
close to the US faction blue. This causes visual confusion -- is that blue
element a friendly marker or a UI accent? The fix: use AMBER as the primary
accent (objectives, active states, progress) and reserve BLUE exclusively for
faction identification. Battlefield, Squad, and Arma all do this -- amber/gold
for objectives, blue strictly for friendlies.

**Background strategy:**
- In-combat HUD elements: NO background (text + shadow only)
- Ticket display, timer: thin 1px border, no fill (or very subtle fill)
- Minimap, compass: dark background (needs contrast for canvas content)
- Menus, modals, scoreboard: glass panel (blur + dark fill)
- Loading/end screens: full opaque overlay

### Text Shadow Standard

Every HUD text element over 3D content gets:
```css
text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5);
```
This ensures readability over bright jungle foliage, dark shadows, and muzzle
flashes without needing background panels.

---

## 3. Typography System

### Current Problems

1. **Two font stacks** -- `fontStack.hud` (Rajdhani) and `fontStack.ui`
   (system fonts). Most HUD components use Rajdhani; menus use system fonts.
   This creates a visual disconnect between gameplay and menus.
2. **No tabular figures** -- Numbers jitter as they change because proportional
   figures have different widths (the "1" is narrower than "0").
3. **Inconsistent sizing** -- fontSize tokens use clamp() which is good, but
   components often hardcode px values (e.g., `.timer-display { font-size: 20px }`).
4. **No weight scale** -- Components use font-weight 400, 600, 700 arbitrarily.

### New Type System

**Font:** Rajdhani for everything. It's already loaded, it's a squared
geometric sans-serif in the Purista family (what Battlefield uses), and it
works for both HUD and menus. Remove the system font stack for UI elements.
Keep system fonts only as fallback.

```
--font-primary: 'Rajdhani', -apple-system, sans-serif;
--font-mono:    'JetBrains Mono', 'Courier New', monospace;
```

**Weight scale:**
```
--weight-regular:  400   (body text, descriptions)
--weight-medium:   500   (labels, secondary headings)
--weight-semibold: 600   (HUD readouts, active labels)
--weight-bold:     700   (numbers, titles, emphasis)
```

**Size scale** (8 steps, fluid):
```
--text-2xs:  clamp(0.5625rem, 1vw, 0.625rem)     /* 9-10px  -- fine labels */
--text-xs:   clamp(0.625rem, 1.2vw, 0.75rem)      /* 10-12px -- kill feed, zone status */
--text-sm:   clamp(0.75rem, 1.4vw, 0.875rem)      /* 12-14px -- HUD body text */
--text-base: clamp(0.875rem, 1.6vw, 1rem)         /* 14-16px -- primary readouts */
--text-lg:   clamp(1rem, 2vw, 1.25rem)             /* 16-20px -- timer, ammo */
--text-xl:   clamp(1.25rem, 2.5vw, 1.5rem)         /* 20-24px -- ticket counts */
--text-2xl:  clamp(1.5rem, 3.5vw, 2.25rem)         /* 24-36px -- end screen stats */
--text-3xl:  clamp(2rem, 5vw, 3.5rem)              /* 32-56px -- VICTORY/DEFEAT */
```

**Numeric display rule:**
All numeric content (ammo, tickets, timer, health, scores) uses:
```css
font-variant-numeric: tabular-nums;
font-feature-settings: 'tnum' 1;
```
This prevents layout jitter when numbers change.

**Letter spacing convention:**
```
Labels / uppercase text:  letter-spacing: 0.08em
Body text:                letter-spacing: 0.02em
Numbers:                  letter-spacing: 0.05em (slight spread for readability)
Titles:                   letter-spacing: 0.12em
```

---

## 4. Design Token Architecture

### Current State

`tokens.ts` exports TypeScript objects consumed by template literal CSS.
`styles.ts` provides mixin functions (glassPanel, hudGlass, etc).
`injectSharedStyles()` creates CSS custom properties on :root.

This is functional but creates a split: some values live in JS objects, some
in CSS variables, and components use a mix of both.

### New Architecture

**Single source of truth: CSS custom properties**, organized in three layers.

Layer 1 -- `primitives.module.css`: Raw palette values named by what they ARE.
Layer 2 -- `theme.module.css`: Semantic meanings referencing primitives.
Layer 3 -- Component-level `--component-*` variables in each `.module.css`.

`tokens.ts` still exists but ONLY for values needed in JS logic (z-index
comparisons, breakpoint numbers for JS-side checks, spacing values for
canvas rendering). It does NOT duplicate color definitions.

**Why CSS-first instead of JS-first:**
1. CSS custom properties are live -- changing one value updates all consumers
   instantly without re-rendering
2. They support media queries and data-attribute scoping natively
3. They work with CSS Modules without build-time transformation
4. They survive native packaging (Electron/Tauri) without modification
5. They eliminate the template-literal-CSS pattern entirely

**tokens.ts shrinks to:**
```typescript
export const zIndex = { ... };       // still needed for JS z-comparisons
export const breakpoints = { ... };  // needed for ResizeObserver thresholds
export const timing = { ... };       // animation durations for JS setTimeout
```

**Color values move entirely to CSS custom properties.** Components reference
`var(--faction-us)` in their CSS Modules, not `${colors.us}` in template strings.

---

## 5. UIComponent Base Class

### Design Rationale

Every game engine (Unity UIToolkit, Unreal UMG, Godot Control, Bevy bevy_ui)
provides a base class with: constructor (build DOM), mount (attach + init),
unmount (detach + cleanup), and optionally per-frame update. We need the same.

Existing components already have informal versions of this:
- Constructor creates DOM
- `attachToDOM()` / `mount()` / `mountTo()` appends to parent
- `dispose()` cleans up
- Some have `update(dt)` for per-frame work

The UIComponent base class formalizes this pattern and adds:
- Automatic CSS Module binding
- Signal-based reactive state
- Lifecycle guarantees (mount before update, cleanup on unmount)
- Style scoping via CSS Modules (no more `<style>` tag injection per component)

### Interface

```typescript
import { signal, computed, effect, type Signal } from '@preact/signals-core';

export abstract class UIComponent {
  /** Root DOM element for this component */
  protected readonly root: HTMLDivElement;

  /** Whether this component is currently mounted */
  private _mounted = false;

  /** Active effect disposers (auto-cleaned on unmount) */
  private _disposers: (() => void)[] = [];

  constructor() {
    this.root = document.createElement('div');
    this.build();
  }

  // --- Lifecycle (subclass overrides) ---

  /** Build initial DOM structure. Called once in constructor. */
  protected abstract build(): void;

  /** Called after root is in the DOM. Subscribe to signals, start timers. */
  protected onMount(): void {}

  /** Called before root is removed. Unsub, stop timers. */
  protected onUnmount(): void {}

  /** Per-frame update. Only called when mounted. */
  update(_dt: number): void {}

  // --- Public API ---

  mount(parent: HTMLElement): void {
    if (this._mounted) return;
    parent.appendChild(this.root);
    this._mounted = true;
    this.onMount();
  }

  unmount(): void {
    if (!this._mounted) return;
    this.onUnmount();
    for (const d of this._disposers) d();
    this._disposers = [];
    this.root.remove();
    this._mounted = false;
  }

  get mounted(): boolean { return this._mounted; }
  get element(): HTMLElement { return this.root; }

  dispose(): void {
    this.unmount();
  }

  // --- Reactive Helpers ---

  /** Create a signal scoped to this component */
  protected signal<T>(initial: T): Signal<T> {
    return signal(initial);
  }

  /** Create an effect that auto-disposes on unmount */
  protected effect(fn: () => void | (() => void)): void {
    const dispose = effect(fn);
    this._disposers.push(dispose);
  }

  /** Create a computed signal */
  protected computed<T>(fn: () => T) {
    return computed(fn);
  }

  // --- DOM Helpers ---

  /** Query within this component's root */
  protected $(selector: string): HTMLElement | null {
    return this.root.querySelector(selector);
  }

  /** Set text content of a child element */
  protected text(selector: string, value: string): void {
    const el = this.$(selector);
    if (el) el.textContent = value;
  }
}
```

### Why This Shape

**Constructor builds, onMount initializes:**
Unity UIToolkit uses the exact same pattern -- build DOM in constructor,
defer subscriptions to `AttachToPanelEvent`. This prevents leaked
subscriptions when components are created but not yet mounted.

**Auto-disposing effects:**
`@preact/signals-core` effects return a dispose function. Collecting these
and auto-disposing on unmount prevents the #1 source of memory leaks in
reactive UI systems (forgotten subscriptions).

**No render() method:**
Unlike React/Preact, we don't re-render the entire tree. Effects surgically
update specific DOM nodes when signals change. This is closer to how game
engines work -- mutate existing widgets, don't recreate them.

**CSS Module binding via build():**
Each component imports its `.module.css` and applies scoped class names in
`build()`. Vite handles CSS Module compilation. No runtime `<style>` injection.

### Usage Example

```typescript
import styles from './TicketDisplay.module.css';

export class TicketDisplay extends UIComponent {
  private usTickets = this.signal(0);
  private opforTickets = this.signal(0);

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div class="${styles.faction} ${styles.us}">
        <span class="${styles.label}">US</span>
        <span class="${styles.count}" data-ref="us">0</span>
      </div>
      <span class="${styles.separator}">|</span>
      <div class="${styles.faction} ${styles.opfor}">
        <span class="${styles.label}">OPFOR</span>
        <span class="${styles.count}" data-ref="opfor">0</span>
      </div>
    `;
  }

  protected onMount(): void {
    this.effect(() => {
      this.text('[data-ref="us"]', String(this.usTickets.value));
    });
    this.effect(() => {
      this.text('[data-ref="opfor"]', String(this.opforTickets.value));
    });
  }

  setTickets(us: number, opfor: number): void {
    this.usTickets.value = us;
    this.opforTickets.value = opfor;
  }
}
```

**What changed vs current TicketDisplay:**
- No inline styles
- No `<style>` tag injection
- No manual DOM property setting
- Class names are scoped by CSS Modules (no global collision risk)
- Signal-driven updates (change value -> DOM updates automatically)
- Lifecycle managed by base class

---

## 6. CSS Modules Migration

### Why CSS Modules

1. **Compile-time scoping** -- class names get unique suffixes (`.container_a1b2c3`),
   eliminating global CSS collision without runtime cost
2. **IDE support** -- syntax highlighting, autocomplete, linting all work
3. **Zero runtime** -- Vite compiles them at build time
4. **Works everywhere** -- Electron, Tauri, Capacitor, plain browser
5. **Co-located** -- each component's styles live next to its TypeScript file
6. **Composable** -- can `composes: base from './shared.module.css'`

### Migration Pattern

**Before (current):**
```typescript
// HUDStatusStyles.ts
export const HUDStatusStyles = `
  .ticket-display {
    background: ${colors.hudGlass};
    backdrop-filter: blur(8px);
    padding: 6px 20px;
    border: 1px solid ${colors.hudBorder};
    ...
  }
`;
// Injected via HUDStyles singleton into <style> tag
```

**After:**
```css
/* TicketDisplay.module.css */
.container {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-1) var(--space-4);
}

.count {
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  font-variant-numeric: tabular-nums;
  text-shadow: var(--shadow-text);
}

.us .count { color: var(--faction-us); }
.opfor .count { color: var(--faction-opfor); }

/* Mobile: smaller */
@media (pointer: coarse) {
  .container { padding: var(--space-1) var(--space-2); gap: var(--space-2); }
  .count { font-size: var(--text-lg); }
}
```

### What Gets Deleted

When migration is complete, these files are removed entirely:
- `src/ui/hud/HUDStyles.ts` (singleton style injector)
- `src/ui/hud/HUDBaseStyles.ts` (CSS string constant)
- `src/ui/hud/HUDWeaponStyles.ts` (CSS string constant)
- `src/ui/hud/HUDStatusStyles.ts` (CSS string constant)
- `src/ui/hud/HUDZoneStyles.ts` (CSS string constant)
- `src/ui/hud/ScoreboardStyles.ts` (CSS string constant)
- `src/ui/layout/HUDLayoutStyles.ts` (CSS string constant -- moves to .module.css)
- `src/ui/compass/CompassStyles.ts` (CSS string constant)
- `src/ui/minimap/MinimapStyles.ts` (CSS string constant)
- `src/ui/map/FullMapStyles.ts` (CSS string constant)
- `src/ui/loading/StartScreenStyles.ts` (CSS function returning string)
- `src/ui/loading/LoadingStyles.ts` (CSS string)
- `src/ui/end/MatchEndScreenStyles.ts` (CSS string constant)
- `src/ui/design/styles.ts` (mixin functions -- replaced by CSS Module composition)

That's **14 style files** (combined ~2000 lines) replaced by co-located
`.module.css` files with better tooling, scoping, and no runtime overhead.

### Shared Styles

Common patterns (glass panels, text shadows, touch-safe sizing) become
shared CSS Module files that components compose from:

```css
/* src/ui/engine/shared.module.css */
.glassPanel {
  background: var(--surface-panel);
  backdrop-filter: var(--glass-blur) var(--glass-saturate);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.hudText {
  color: var(--text-primary);
  text-shadow: var(--shadow-text);
  font-family: var(--font-primary);
}

.touchSafe {
  min-height: 44px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
```

Components compose:
```css
/* Scoreboard.module.css */
.overlay {
  composes: glassPanel from '../engine/shared.module.css';
  /* additional scoreboard-specific styles */
}
```

---

## 7. HUD Component Redesign

### Guiding Principle

In-combat HUD should feel like information projected onto the viewport, not
panels floating over it. Remove backgrounds from most HUD elements. Use text
shadows for readability. Reserve glass panels for elements with canvas content
(minimap) or dense information (objectives panel).

### Component-by-Component Plan

#### Timer (top-left)
**Current:** Glass panel with blur, 20px font, warning/critical color states.
**New:** Bare text with shadow. No background. Larger font (--text-lg).
Warning state: amber text + subtle pulse. Critical: red text + faster pulse.
The timer should feel like a heads-up display element, not a sticky note.

#### Ticket Display (top-center)
**Current:** Glass panel, faction names above numbers, separator between.
**New:** Minimal bar -- just the numbers with a thin divider. No panel bg.
Format: `US 247 | 189 OPFOR` in one line, faction-colored numbers.
On mobile: even more compact, just `247 | 189`.

#### Compass (top-center, below tickets)
**Current:** 960px-wide strip with 48 cardinal marks, 144 degree marks,
144 tick marks. Massive DOM (336 positioned divs). Glass panel.
**New:** Canvas-rendered strip (much cheaper than 336 DOM nodes). Same visual
but drawn in 2D context. Transparent bg, text shadows. Zone markers as
colored pips above the strip. Reduces DOM from 336 elements to 1 canvas +
a few marker divs.

Thought: The compass is the single worst DOM offender in the HUD. Each tick
mark is a positioned div. This should have been a canvas from the start.
Canvas strips are standard in the genre (Battlefield, Squad both render
compasses this way).

#### Minimap (top-right)
**Current:** Canvas with surrounding DOM container. Glass panel border.
Sized via JS constant (160px desktop, 120px mobile).
**New:** Same canvas rendering, but CSS Module for container. Keep the glass
panel here -- minimap needs a dark background for contrast. Add subtle
compass rose markers (N/S/E/W) at the edges. Circular clip mask
(`border-radius: 50%` + `overflow: hidden`).

#### Objectives Panel (right side, desktop only)
**Current:** Glass panel listing zone names, status icons, capture bars.
Hidden on touch devices.
**New:** Keep hidden on touch. On desktop, tighten layout. Remove panel
background -- use text with shadows, colored zone pips, and thin capture
progress bars. This reduces visual weight significantly.

#### Kill Feed (center or top-right)
**Current:** Container at center, entries with faction-colored names.
**New:** Top-right (industry convention). Entries slide in from right, fade
out after 5s. Format: `PlayerName [weapon-icon] VictimName`. Headshots get
a skull icon. No background on entries -- text shadow only. Faction colors
on names. Small font (--text-xs).

#### Ammo Display (bottom-right)
**Current:** Glass panel with magazine/separator/reserve.
**New:** Bare text. Large magazine count (--text-lg, bold), small reserve
(--text-sm, muted). No background. Color shifts to amber when low, red when
empty. On mobile: even simpler, just the number.

#### Unified Weapon Bar (bottom-center)
**Current:** Flex row of 6 slots, each with key hint + icon + ammo. Own
`<style>` injection.
**New:** CSS Module. Same visual concept but cleaner. Active slot gets amber
accent border. Key hints hidden on touch (already done via data-device).
Tighter spacing. Transparent bg per slot, very subtle border on active only.

#### Health Bar
**Current:** Not a visible component -- health state communicated via damage
vignette.
**New consideration:** Add a minimal health indicator. Options:
  a) Thin bar at bottom-left edge (Squad style)
  b) Numeric readout near ammo (CoD style)
  c) Color tint on screen edges (current approach)
Decision: Keep current vignette approach. Adding an explicit health bar is a
gameplay decision, not a UI one. Mark as future consideration.

#### Hit Markers (center)
**Current:** CSS-animated rotated squares. Normal/headshot/kill variants.
Good -- keep the animations.
**New:** Same concept, CSS Module. Slightly reduce the animation durations
for snappier feel. Kill marker: add a brief screen-edge red flash.

#### Damage Numbers (floating, world-space)
**Current:** DOM elements positioned via CSS transform from world coords.
**New:** Same approach (DOM is fine for <20 simultaneous numbers). CSS Module.
Add downward float + fade animation. Headshots: amber, larger. Kills: red
flash. Consider capping at 8-10 visible simultaneously.

#### Score Popups (center-screen)
**Current:** "+100 KILL" type popups, DOM positioned.
**New:** CSS Module. Stack upward from center. Subtle amber accent. Auto-fade.

#### Grenade Power Meter (center)
**Current:** Shows when aiming grenade. Glass panel.
**New:** Minimal arc or bar overlay. No panel. Appears/disappears with
smooth transition. Shows power percentage and estimated distance.

#### Interaction Prompt (center)
**Current:** "Press F to..." with pulsing border.
**New:** Simple text prompt with icon. No border pulse -- use opacity pulse
instead (subtler). CSS Module.

#### Respawn Overlay
**Current:** Button in center slot.
**New:** Full-screen dimmed overlay with respawn timer countdown, death cause,
and deploy button. Glass panel for the info card. This is a natural breakpoint
where glass panels are appropriate (player is NOT in active combat).

#### Zone Capture Notification (center)
**Current:** Full-width notification bar, z-index 9999.
**New:** Horizontal bar at top-center (below compass). Faction-colored
background (subtle). Text: "CAPTURING ALPHA" or "ALPHA SECURED". Slide
in/out animation. Lower z-index (within HUD layer, not above everything).

#### Mortar Indicator
**Current:** Canvas overlay showing trajectory.
**New:** Keep canvas approach. CSS Module for container. Add bearing/range
readout text.

#### Helicopter Instruments
**Current:** Panel with collective, RPM, auto-hover, engine boost indicators.
**New:** CSS Module. Keep glass panel (appropriate for instrument cluster).
Clean up layout -- fixed-width gauge area, clear labels.

#### Scoreboard (TAB overlay)
**Current:** Full-screen overlay, glass background, grid layout, two teams.
**New:** CSS Module. Glass panel appropriate here. Tighter table styling.
Faction-colored headers. Cleaner responsive breakpoints. Add faction logo
or emblem above each team column.

#### Personal Stats Panel
**Current:** Side panel with K/D/A stats.
**New:** CSS Module. Keep compact. Show in stats grid slot.

---

## 8. Screen Redesign

### Start Screen

**Current problems:**
- 588-line CSS string (StartScreenStyles.ts) in a template literal
- innerHTML builds entire DOM structure in one shot
- Stale `dismissLandscapePrompt()` call in dispose (method was deleted)
- Mode cards are HTML strings, not components
- Full inline style assignment for fullscreen prompt (15 properties via
  Object.assign)

**New approach:**
The start screen is a `UIComponent` subclass with child components:
- `TitleHeader` -- game title + subtitle
- `ModeSelector` -- mode cards (zone control, open frontier, TDM, A Shau)
- `LoadingBar` -- progress bar with phase text
- `MenuButtons` -- deploy, settings, controls
- `FullscreenHint` -- compact touch fullscreen prompt

Each is its own UIComponent with its own CSS Module. The start screen
orchestrates them.

**Visual direction:**
Dark jungle atmosphere. Background: deep olive-black gradient
(`--surface-void`). Title in large tracked uppercase (--text-3xl). Mode cards
with subtle amber accent border on selected. Deploy button: amber gradient,
large touch target. The whole screen should feel like a military briefing
display.

### Settings Modal

**New:** UIComponent with CSS Module. Glass panel overlay. Organized sections:
Audio, Graphics, Controls. Each setting is a reusable `SettingRow` component
(label + control). Slider, dropdown, toggle components.

### How To Play Modal

**New:** UIComponent. Device-aware content (shows touch controls on touch,
keyboard bindings on desktop). Clean layout with icon + description pairs.

### Match End Screen

**Current problems:**
- Creates DOM on-demand with innerHTML
- Separate style file (436 lines)
- Victory/defeat differentiation via background tint only

**New approach:**
UIComponent with CSS Module. Two visual modes:
- **Victory:** Dark green-tinted overlay, success-colored title, upward
  energy (subtle particle effect or gradient animation)
- **Defeat:** Dark red-tinted overlay, danger-colored title, somber
  (no animation)

Stats panel: glass panel, two columns (team stats, personal stats).
Awards: amber-accented badges. Action buttons: primary (Play Again) and
secondary (Return to Menu).

### Loading Screen / Loading Progress

Part of StartScreen. Progress bar uses amber accent fill. Phase text shows
current loading stage. Tips rotate below. The loading experience should feel
like booting up military equipment.

---

## 9. Responsive & Device Strategy

### Layout Modes

Keep the current three-template CSS Grid approach but refine:

**Desktop (mouse + keyboard):**
```
timer      | tickets   | minimap
.          | compass   | objectives
.          | .         | .
.          | center    | .
.          | kill-feed | .
health     | weapon-bar| ammo
```
Compact, information-dense. All elements visible.

**Mobile Landscape (touch, primary play mode):**
```
minimap    | tickets   | fire
.          | compass   | ads
.          | weapon-bar| action-btns
joystick   | center    | ammo
joystick   | .         | menu
```
Touch controls on sides. Info condensed to center column. Minimap top-left.
Fire/ADS/actions on right side within thumb arc.

**Mobile Portrait (touch, supported but not primary):**
Simplified further. Hide compass, timer. Larger touch targets. Minimap and
menu at top. Joystick bottom-left. Fire/action buttons bottom-right. Center
area for gameplay.

### Device Detection

Keep current approach: `data-device` attribute on `#game-hud-root` drives
CSS visibility. Components don't need to know about device type -- CSS
handles it via attribute selectors.

Refinement: Add `data-input-mode` attribute for fine-grained control:
- `"keyboard-mouse"` -- desktop default
- `"touch"` -- mobile/tablet
- `"gamepad"` -- controller connected (show button prompts instead of keys)

### Touch Target Standards

All interactive elements on touch devices: minimum 44x44px (Apple HIG).
Comfortable targets: 48x48px (Material Design).
Primary actions (fire, ADS): 64-80px.

### Thumb Zone Mapping

Mobile HUD elements positioned within comfortable thumb arcs:
- Bottom 40% sides: primary interaction (joystick, fire, ADS)
- Top corners: information only (minimap, menu -- no accidental taps)
- Center: gameplay area (never obstructed by persistent UI)

---

## 10. Animation & Juice

### Principles

- Elements should never snap in/out. Minimum 100ms ease-out for appear,
  80ms ease-in for disappear.
- Hit feedback should feel impactful: screen shake (CSS transform on canvas
  container), hit marker flash, damage number pop.
- State transitions (phase changes, vehicle enter/exit) use coordinated
  fade-out/fade-in.
- Avoid continuous animations (pulsing, rotating) except for critical alerts.
  They draw attention and become annoying if overused.

### Animation Token Variables

```css
:root {
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);     /* overshoot decel */
  --ease-in:     cubic-bezier(0.7, 0, 0.84, 0);     /* accelerate exit */
  --ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);    /* symmetric */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* bounce overshoot */

  --duration-instant: 80ms;
  --duration-fast:    150ms;
  --duration-normal:  250ms;
  --duration-slow:    400ms;
  --duration-reveal:  600ms;
}
```

### Key Animations

**Kill feed entry:** `translateX(30px) -> 0` with `--ease-out`, 200ms.
**Damage number:** `scale(0.5) -> 1.1 -> 1` with upward drift, 300ms.
**Hit marker:** `scale(0.7) -> 1.05 -> fade` with rotation, 280ms.
**Score popup:** `translateY(20px) -> 0` with `--ease-spring`, 300ms.
**HUD appear:** `opacity 0->1` with `--ease-out`, 200ms.
**HUD disappear:** `opacity 1->0` with `--ease-in`, 150ms.
**Phase transition:** 400ms cross-fade.
**Zone capture bar:** `width` transition, 300ms ease-out.

### Screen Shake

On damage taken, apply brief CSS transform to the canvas container:
```css
@keyframes screen-shake {
  0%, 100% { transform: translate(0); }
  25% { transform: translate(-2px, 1px); }
  50% { transform: translate(2px, -1px); }
  75% { transform: translate(-1px, 2px); }
}
```
Duration: 150ms. Intensity scaled by damage amount.

---

## 11. Input Unification

### Current State

Input is already well-architected: `PlayerInput` dispatches to keyboard/mouse,
`TouchControls`, or `GamepadManager`. Callbacks unify all input sources.
Touch controls use pointer events with setPointerCapture.

### Improvements

1. **Input mode detection signal:** Create a global signal for current input
   mode (`keyboard-mouse` | `touch` | `gamepad`). Components can react to
   input mode changes (e.g., show "Press F" vs "Tap" vs "Press A").

2. **Gamepad button prompts:** When a gamepad is connected, HUD should show
   controller button icons instead of keyboard keys. The weapon bar key hints
   switch from "1-6" to button icons.

3. **Input mode auto-switching:** If user touches screen, switch to touch mode.
   If user moves mouse, switch to keyboard-mouse. If gamepad input detected,
   switch to gamepad. This is how Fortnite/CoD handle mixed-input scenarios.

4. **Focus management:** When modals are open, input should be captured by the
   modal (prevent game input). The UIComponent base class can provide
   `captureInput()` / `releaseInput()` helpers.

---

## 12. File Structure

```
src/ui/
  engine/                          <- NEW: ~400 lines total
    UIComponent.ts                 <- Base class (lifecycle, signals, helpers)
    UIRegistry.ts                  <- Component registry for hot-path lookup
    InputMode.ts                   <- Input mode signal (kb/touch/gamepad)
    shared.module.css              <- Shared CSS compositions (glassPanel, etc)
    theme.css                      <- Layer 2 semantic tokens (imported globally)
    primitives.css                 <- Layer 1 raw palette (imported by theme.css)
    index.ts                       <- Public API exports

  design/
    tokens.ts                      <- KEEP (shrunk: z-index, breakpoints, timing only)
    responsive.ts                  <- KEEP (ViewportManager)
    index.ts                       <- KEEP

  layout/
    HUDLayout.ts                   <- KEEP (minor refactor)
    HUDLayout.module.css           <- NEW (replaces HUDLayoutStyles.ts)
    VisibilityManager.ts           <- KEEP
    types.ts                       <- KEEP (add InputMode type)
    index.ts                       <- KEEP

  hud/
    HUDSystem.ts                   <- KEEP (refactor to use UIComponent)
    HUDElements.ts                 <- REFACTOR (registry-based, not hardcoded)
    TicketDisplay.ts + .module.css <- NEW (replaces inline DOM + CSS string)
    TimerDisplay.ts + .module.css  <- NEW
    CompassStrip.ts + .module.css  <- NEW (canvas-based, replaces 336 divs)
    KillFeed.ts + .module.css      <- REFACTOR (extend UIComponent)
    AmmoDisplay.ts + .module.css   <- REFACTOR
    WeaponBar.ts + .module.css     <- REFACTOR (from UnifiedWeaponBar)
    HitMarker.ts + .module.css     <- REFACTOR
    DamageNumbers.ts + .module.css <- REFACTOR
    ScorePopups.ts + .module.css   <- REFACTOR
    GrenadeMeter.ts + .module.css  <- REFACTOR
    InteractionPrompt.ts + .module.css <- REFACTOR
    RespawnOverlay.ts + .module.css <- REFACTOR
    ZoneCapture.ts + .module.css   <- REFACTOR
    MortarIndicator.ts + .module.css <- REFACTOR
    HelicopterHUD.ts + .module.css <- REFACTOR
    ObjectivesPanel.ts + .module.css <- REFACTOR
    Scoreboard.ts + .module.css    <- REFACTOR
    StatsPanel.ts + .module.css    <- REFACTOR

  minimap/
    MinimapSystem.ts               <- KEEP (refactor to extend UIComponent)
    MinimapRenderer.ts             <- KEEP (canvas drawing)
    Minimap.module.css             <- NEW (replaces MinimapStyles.ts)

  map/
    FullMapSystem.ts               <- REFACTOR (extend UIComponent)
    FullMapInput.ts                <- KEEP
    FullMap.module.css             <- NEW (replaces FullMapStyles.ts)
    FullMapHelpers.ts              <- KEEP (DOM factories)

  controls/
    [all touch controls]           <- REFACTOR incrementally
    [existing structure preserved]

  loading/
    StartScreen.ts                 <- REWRITE (UIComponent, child components)
    StartScreen.module.css         <- NEW
    ModeCard.ts + .module.css      <- REFACTOR (UIComponent)
    LoadingProgress.ts             <- KEEP (data-only)
    SettingsModal.ts + .module.css <- REFACTOR
    HowToPlayModal.ts + .module.css <- REFACTOR

  end/
    MatchEndScreen.ts + .module.css <- REWRITE (UIComponent)

  debug/
    [keep as-is -- debug UI doesn't need the full system]

  loadout/
    [refactor incrementally]

  DELETED (Phase 6b -- already removed):
    src/ui/hud/HUDBaseStyles.ts
    src/ui/hud/HUDWeaponStyles.ts
    src/ui/hud/HUDStatusStyles.ts
    src/ui/hud/ScoreboardStyles.ts
    src/ui/loading/LoadingStyles.ts
    src/ui/hud/TeamScorePanel.ts

  DELETED (future -- when remaining components migrate):
    src/ui/hud/HUDStyles.ts           (when HUDZoneDisplay/ObjectiveDisplay migrate)
    src/ui/hud/HUDZoneStyles.ts       (when HUDZoneDisplay/ObjectiveDisplay migrate)
    src/ui/layout/HUDLayoutStyles.ts
    src/ui/compass/CompassStyles.ts
    src/ui/compass/CompassDOMBuilder.ts
    src/ui/compass/CompassZoneMarkers.ts
    src/ui/minimap/MinimapStyles.ts
    src/ui/minimap/MinimapDOMBuilder.ts
    src/ui/map/FullMapStyles.ts
    src/ui/loading/StartScreenStyles.ts
    src/ui/end/MatchEndScreenStyles.ts
    src/ui/design/styles.ts
```

---

## 13. Migration Phases

### Phase 0: Foundation (no visible changes) [DONE]

**Goal:** Set up infrastructure that all subsequent work depends on.

1. Install `@preact/signals-core` (1.6KB, zero DOM opinion)
2. Create `src/ui/engine/UIComponent.ts` -- base class
3. Create `src/ui/engine/primitives.css` -- Layer 1 palette
4. Create `src/ui/engine/theme.css` -- Layer 2 semantic tokens
5. Create `src/ui/engine/shared.module.css` -- shared compositions
6. Import theme.css in `main.ts` (global CSS custom properties)
7. Verify: existing UI still works, new CSS vars available
8. Update Vite config if needed for CSS Module support (should work OOTB)

**Tests:** Unit test UIComponent lifecycle (mount, unmount, signal effects,
auto-dispose). Verify CSS custom properties render correctly.

**Risk:** None -- additive only, no existing code modified.

### Phase 1: First Component Migration (proof of concept) [DONE]

**Goal:** Migrate one simple HUD component end-to-end to validate the pattern.

Pick: **TicketDisplay** -- simple, visible, few states, easy to verify.

1. Create `TicketDisplay.ts` extending UIComponent
2. Create `TicketDisplay.module.css`
3. Wire into HUDElements.attachToDOM (replace old ticket display)
4. Remove old ticket-related CSS from HUDStatusStyles.ts
5. Verify on desktop and mobile

**Tests:** TicketDisplay unit tests. Visual verification on both form factors.

**Deliverable:** One fully migrated component proving the UIComponent +
CSS Module + signals pattern works end-to-end.

### Phase 2: HUD Core Components [DONE]

**Goal:** Migrate all always-visible HUD elements.

Order (by visibility -- most visible first):
1. TimerDisplay
2. AmmoDisplay
3. CompassStrip (rewrite from 336 divs to canvas)
4. KillFeed
5. WeaponBar (from UnifiedWeaponBar)
6. HitMarker
7. ObjectivesPanel

After each: verify desktop + mobile, run tests, confirm no regressions.

**Milestone:** The main gameplay HUD is fully on the new system.

### Phase 3: Feedback & Overlay Components [DONE]

**Goal:** Migrate transient/overlay components.

1. DamageNumbers
2. ScorePopups
3. WeaponSwitchFeedback
4. GrenadeMeter
5. InteractionPrompt
6. ZoneCapture notification
7. MortarIndicator
8. RespawnOverlay

### Phase 4: System Components [DONE]

**Goal:** Migrate canvas-based and system-level components.

1. MinimapSystem (CSS Module for container, keep canvas renderer)
2. FullMapSystem (CSS Module, keep FullMapInput)
3. HelicopterHUD (instruments, mouse indicator, elevation)
4. Scoreboard
5. PersonalStatsPanel

### Phase 5: Screen Rewrites [DONE]

**Goal:** Rebuild full-screen experiences.

1. StartScreen (decompose into child UIComponents)
2. MatchEndScreen
3. SettingsModal
4. HowToPlayModal

### Phase 6: Cleanup & Polish [DONE]

**Goal:** Remove all legacy style infrastructure.

1. Delete all *Styles.ts files (14 files, ~2000 lines)
2. Delete HUDStyles singleton
3. Remove HUDBaseStyles, HUDWeaponStyles, HUDStatusStyles, HUDZoneStyles
4. Remove `injectSharedStyles()` from bootstrap
5. Remove `styles.ts` mixin functions
6. Shrink `tokens.ts` to JS-only values
7. Remove stale `dismissLandscapePrompt()` from StartScreen.dispose()
8. Audit for any remaining hardcoded colors, z-indexes, or inline styles
9. Final visual QA pass on all devices

**Phase 6b progress (DONE):**
- Deleted 7 dead files (~600 lines): LoadingStyles.ts, TeamScorePanel.ts,
  ScoreboardStyles.ts, HUDStatusStyles.ts, HUDWeaponStyles.ts, HUDBaseStyles.ts,
  (LoadingStyles was never imported; TeamScorePanel was never imported)
- HUDStyles.ts reduced to single HUDZoneStyles import (only remaining non-CSS-Module styles)
- HUDElements.ts: inlined .hud-container and .hit-marker-container styles,
  migrated fadeIn/fadeOut to ui-fadeIn/ui-fadeOut from theme.css
- HUDZoneStyles.ts: migrated `animation: pulse` to `animation: ui-pulse`
- Remaining: HUDZoneStyles.ts (ObjectiveDisplay + HUDZoneDisplay not yet migrated),
  styles.ts (design mixins), tokens.ts shrink

### Phase 7: Touch Controls Integration [DONE]

**Goal:** Bring touch controls into the UIComponent system.

1. Refactor TouchFireButton, TouchADSButton, etc. to extend UIComponent
2. Move inline styles to CSS Modules
3. Replace hardcoded z-indexes (1001, 1000, 999) with token values
4. Add input mode signal integration (gamepad prompts)

---

## 14. Testing Strategy

### Unit Tests (per component)

Every UIComponent subclass gets a test file verifying:
- `build()` creates expected DOM structure
- `mount()` appends to parent, sets `mounted = true`
- `unmount()` removes from DOM, disposes effects
- Signal changes propagate to DOM
- `dispose()` is idempotent

### Visual Regression

Use the existing perf capture harness to screenshot HUD states:
- Default desktop HUD
- Mobile landscape HUD
- Mobile portrait HUD
- ADS mode (dimmed elements)
- Helicopter mode (infantry elements hidden)
- Menu phase (HUD hidden)
- End screen (victory, defeat)

Compare before/after migration for each phase.

### Responsive Verification

Test at key viewport sizes:
- 1920x1080 (desktop)
- 1366x768 (laptop)
- 812x375 (iPhone landscape)
- 926x428 (iPhone 14 Pro Max landscape)
- 1024x768 (tablet landscape)
- 375x812 (iPhone portrait)

### Performance

Measure before/after for each migration phase:
- DOM node count (expect reduction, especially compass)
- Style recalculation time (expect improvement from CSS Modules vs <style> injection)
- Memory (expect slight reduction from fewer <style> elements)
- Frame time (should be neutral -- UI is not a bottleneck)

---

## 15. Thought Trail

### Why not just fix the existing styles?

The current pattern (template literal CSS strings injected via `<style>` tags)
has fundamental problems that can't be fixed incrementally:
- No IDE support (syntax highlighting, autocomplete, lint)
- No scoping (all class names are global -- `.faction-name` appears in both
  HUDStatusStyles and MatchEndScreenStyles with different rules)
- No dead code elimination (unused CSS stays in the string forever)
- JS template interpolation loses CSS tooling (prettier, stylelint can't parse)
- ~15 separate `<style>` tags injected at runtime (browser has to parse each)

CSS Modules fix all of these at zero runtime cost.

### Why signals instead of direct DOM manipulation?

Current pattern: `this.ticketElement.textContent = String(tickets)` in an
update loop. This works but creates tight coupling between update timing and
DOM state. If the update runs before the element is mounted, it silently fails.
If it runs after disposal, it throws.

Signals invert this: `this.usTickets.value = tickets` is a data change.
The effect in `onMount()` handles the DOM update. If not mounted, no effect
runs. If disposed, effects are cleaned up. The data change is always safe.

This also enables derived state: `this.isLow = computed(() => this.usTickets.value < 50)`
can drive a CSS class change without any manual if/else in the update loop.

### Why not React/Preact/Svelte?

Discussed in previous session. Summary: game engines own their UI. Framework
dependency is a liability for native packaging. All shipped browser games use
vanilla DOM. The UIComponent base class is ~100 lines -- simpler than any
framework, fully understood, never breaks from upstream changes.

### Why keep the CSS Grid layout system?

The grid layout system (`HUDLayout.ts`, `VisibilityManager.ts`) is actually
well-designed. Named slots, data-attribute-driven visibility, three responsive
templates -- this is exactly how a game engine UI layout should work. The
problem was never the layout system; it was the components and styles mounted
into it.

### Why amber as the accent instead of blue?

Blue is the US faction color. Using blue as the UI accent creates confusion:
"Is that blue element a friendly marker or a UI button?" Battlefield, Squad,
and Arma all use amber/gold for objectives and UI accents, reserving blue
strictly for faction identification. Amber also has better contrast on dark
backgrounds and evokes military equipment displays (amber CRT terminals,
night vision, instrument lighting).

### Why canvas for the compass?

The current compass creates 336 positioned DOM elements (48 cardinal marks +
144 degree marks + 144 tick marks). Each one is a `div` with inline `left`
and `top` styles. The browser has to layout and composite all 336 elements
every frame as the compass rotates. A single canvas element with `ctx.fillText()`
calls is dramatically cheaper. The visual result is identical. This is the
single biggest DOM optimization opportunity in the HUD.

### Why not merge HUDElements into HUDSystem?

HUDElements is a bag of component instances with backward-compatibility
property aliases. HUDSystem is the lifecycle orchestrator. These are different
concerns. In the new system, HUDSystem stays as the orchestrator, but
HUDElements evolves into a registry pattern where components self-register
rather than being manually wired.

### What about the MobilePauseOverlay?

Keep as-is for now. It's self-contained, works correctly, and isn't part of
the HUD grid system. It can be migrated to UIComponent in Phase 7 as a
low-priority cleanup.

### What about z-index collisions?

Current collisions:
- `interactionPrompt: 1000` = `touchJoystick: 1000`
- `zoneCaptureNotification: 9999` = `loadingScreen: 9999`

The new system uses a cleaner layer hierarchy:
```
Layer 0:    Canvas (Three.js)
Layer 100:  HUD grid root
Layer 100-199: HUD elements (within grid, no z-index needed)
Layer 200:  Feedback overlays (damage numbers, popups)
Layer 300:  Map overlays
Layer 1000: Touch control overlays (joystick, look)
Layer 9000: Fullscreen overlays (loading, zone capture)
Layer 10000: Modals (scoreboard, settings, end screen)
```

Within the grid, z-index is irrelevant -- grid areas don't overlap. Only
elements outside the grid (viewport overlays) need explicit z-index.
