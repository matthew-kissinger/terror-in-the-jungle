/**
 * CSS Grid layout styles for the HUD system.
 * Three responsive templates: desktop, mobile-landscape, mobile-portrait.
 *
 * The grid container (#game-hud-root) covers the full viewport and divides
 * the screen into named regions. Components mount into their assigned
 * region - no more position:fixed on individual elements.
 *
 * Visibility is controlled via data attributes on #game-hud-root,
 * not inline styles on components.
 *
 * Mobile redesign (2026): Fire/ADS buttons stay fixed-position (thumb-arc
 * ergonomics). Status-bar replaces timer/tickets/compass on mobile.
 * WeaponPill replaces 6-slot weapon bar on mobile.
 */

import { zIndex, fontStack, colors } from '../design/tokens';

export const HUD_LAYOUT_STYLES = `
  /*
   * Layer order: base < hud < touch-controls < overlays
   * This prevents specificity wars between HUD and touch controls.
   */

  /* =========================================================
   * Grid Root - covers full viewport, pointer-events: none
   * so it doesn't intercept clicks on the 3D canvas beneath.
   * Individual slots opt-in to pointer-events: auto.
   * ========================================================= */
  #game-hud-root {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100vh; /* fallback for browsers without dvh support */
    height: 100dvh; /* overrides vh on browsers that support dynamic viewport height */
    z-index: ${zIndex.hudBase};
    pointer-events: none;
    font-family: ${fontStack.hud};
    color: ${colors.textPrimary};
    box-sizing: border-box;
    /* Safe area insets for notched/edge-to-edge devices */
    padding:
      env(safe-area-inset-top, 0px)
      env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px)
      env(safe-area-inset-left, 0px);
    -webkit-tap-highlight-color: transparent;
  }

  /* Slots are grid children. Each one is a named region. */
  .hud-slot {
    pointer-events: auto;
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
  }

  /* Center-aligned slots (tickets, compass, center, status-bar) */
  .hud-slot[data-region="tickets"],
  .hud-slot[data-region="compass"],
  .hud-slot[data-region="center"],
  .hud-slot[data-region="status-bar"] {
    justify-content: center;
    align-items: center;
  }

  /* Weapon-bar: centered on desktop, left-aligned on touch */
  .hud-slot[data-region="weapon-bar"] {
    justify-content: center;
    align-items: center;
  }
  [data-device="touch"] .hud-slot[data-region="weapon-bar"] {
    justify-content: flex-start;
    align-items: flex-end;
    padding-left: 4px;
    padding-bottom: 2px;
  }

  /* Kill-feed: top-right corner on desktop */
  .hud-slot[data-region="kill-feed"] {
    justify-content: flex-end;
    align-items: flex-start;
  }

  /* Top-left slots */
  .hud-slot[data-region="timer"],
  .hud-slot[data-region="game-status"],
  .hud-slot[data-region="stats"] {
    justify-content: flex-start;
    align-items: flex-start;
  }

  /* Desktop left rail: timer, phase/status, and player stats read as one aligned column */
  [data-device="desktop"] .hud-slot[data-region="timer"],
  [data-device="desktop"] .hud-slot[data-region="game-status"],
  [data-device="desktop"] .hud-slot[data-region="stats"] {
    padding-left: 10px;
  }

  [data-device="desktop"] .hud-slot[data-region="stats"] {
    flex-direction: column;
    gap: 6px;
  }

  /* Top-right / right-side slots */
  .hud-slot[data-region="minimap"],
  .hud-slot[data-region="objectives"],
  .hud-slot[data-region="menu"] {
    justify-content: flex-end;
    align-items: flex-start;
  }

  /* Ammo: bottom-right — align-items: flex-end so it sticks to the bottom
   * of its cell on both desktop (auto row) and mobile landscape (1fr row). */
  .hud-slot[data-region="ammo"] {
    justify-content: flex-end;
    align-items: flex-end;
    padding-bottom: 4px;
    padding-right: 4px;
  }

  /* Desktop gets a little more breathing room from the screen edge */
  [data-device="desktop"] .hud-slot[data-region="ammo"] {
    padding-bottom: 8px;
    padding-right: 10px;
  }

  /* Bottom-left */
  .hud-slot[data-region="health"],
  .hud-slot[data-region="joystick"] {
    justify-content: flex-start;
    align-items: flex-end;
  }

  /* Touch control slots - right side (grid placeholders on mobile,
   * fire/ADS stay fixed-position and don't use these slots) */
  .hud-slot[data-region="fire"],
  .hud-slot[data-region="ads"],
  .hud-slot[data-region="action-btns"] {
    justify-content: flex-end;
    align-items: center;
  }

  /* =========================================================
   * DESKTOP LAYOUT (>= 1024px CSS width, non-touch)
   *
   *  timer      |  tickets   | minimap
   *  game-status|  compass   | minimap
   *  stats      |            | objectives
   *             |  center    | kill-feed  <- top-right
   *  health     | weapon-bar | ammo
   * ========================================================= */
  #game-hud-root {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(200px, 2fr) minmax(180px, 1fr);
    grid-template-rows:
      auto     /* timer / tickets / minimap top */
      auto     /* game-status / compass / minimap bottom */
      auto     /* stats / . / objectives */
      1fr      /* center (flexible) / kill-feed top-right */
      auto;    /* health / weapon-bar / ammo */
    grid-template-areas:
      "timer        tickets     minimap"
      "game-status  compass     minimap"
      "stats        .           objectives"
      ".            center      kill-feed"
      "health       weapon-bar  ammo";
    gap: 4px;
  }

  /* Map slot names to grid areas */
  .hud-slot[data-region="timer"]       { grid-area: timer; }
  .hud-slot[data-region="tickets"]     { grid-area: tickets; }
  .hud-slot[data-region="minimap"]     { grid-area: minimap; }
  .hud-slot[data-region="game-status"] { grid-area: game-status; }
  .hud-slot[data-region="compass"]     { grid-area: compass; }
  .hud-slot[data-region="objectives"]  { grid-area: objectives; }
  .hud-slot[data-region="stats"]       { grid-area: stats; }
  .hud-slot[data-region="center"]      { grid-area: center; }
  .hud-slot[data-region="kill-feed"]   { grid-area: kill-feed; }
  .hud-slot[data-region="health"]      { grid-area: health; }
  .hud-slot[data-region="weapon-bar"]  { grid-area: weapon-bar; }
  .hud-slot[data-region="ammo"]        { grid-area: ammo; }
  .hud-slot[data-region="joystick"]    { grid-area: joystick; }
  .hud-slot[data-region="fire"]        { grid-area: fire; }
  .hud-slot[data-region="ads"]         { grid-area: ads; }
  .hud-slot[data-region="action-btns"] { grid-area: action-btns; }
  .hud-slot[data-region="menu"]        { grid-area: menu; }

  /* status-bar: not part of the desktop grid, positioned absolutely on desktop (hidden) */
  .hud-slot[data-region="status-bar"]  { grid-area: status-bar; }

  /* Touch-only slots hidden on desktop */
  [data-device="desktop"] .hud-slot[data-region="joystick"],
  [data-device="desktop"] .hud-slot[data-region="fire"],
  [data-device="desktop"] .hud-slot[data-region="ads"],
  [data-device="desktop"] .hud-slot[data-region="action-btns"],
  [data-device="desktop"] .hud-slot[data-region="menu"] {
    display: none !important;
  }

  /* status-bar hidden on desktop (desktop uses separate timer/tickets/compass) */
  [data-device="desktop"] .hud-slot[data-region="status-bar"] {
    display: none !important;
  }

  /* Objectives hidden on touch */
  [data-device="touch"] .hud-slot[data-region="objectives"] {
    display: none !important;
  }

  /* On mobile, hide the individual timer/tickets/compass/game-status/stats/kill-feed
   * since MobileStatusBar handles the essential info in one compact line */
  [data-device="touch"] .hud-slot[data-region="timer"],
  [data-device="touch"] .hud-slot[data-region="tickets"],
  [data-device="touch"] .hud-slot[data-region="compass"],
  [data-device="touch"] .hud-slot[data-region="game-status"],
  [data-device="touch"] .hud-slot[data-region="stats"],
  [data-device="touch"] .hud-slot[data-region="kill-feed"] {
    display: none !important;
  }

  /* On mobile, fire/ADS/action-btns stay as fixed-position overlays
   * (thumb-arc ergonomics), so their grid slots are empty. Hide them. */
  [data-device="touch"] .hud-slot[data-region="fire"],
  [data-device="touch"] .hud-slot[data-region="ads"],
  [data-device="touch"] .hud-slot[data-region="action-btns"] {
    display: none !important;
  }

  /* On mobile, hide the separate ammo display — WeaponPill already shows ammo */
  [data-device="touch"] .hud-slot[data-region="ammo"] {
    display: none !important;
  }

  /* =========================================================
   * MOBILE LANDSCAPE (touch + width > height)
   *
   * Simplified grid - fire/ADS/actions are fixed-position.
   * Status-bar at top-center provides timer+tickets.
   * Right column kept empty — touch controls are fixed-pos.
   * Weapon-bar + health bottom-left, nothing in screen center.
   *
   *  menu       | status-bar  | minimap
   *             |             |
   *             |             |
   *  weapon-bar |             |
   *  health     |             |
   *  joystick   |             |
   *  joystick   |             |
   * ========================================================= */
  @media (pointer: coarse) and (orientation: landscape) {
    #game-hud-root {
      grid-template-columns: minmax(100px, 1fr) minmax(140px, 2fr) minmax(100px, 1fr);
      grid-template-rows:
        auto     /* menu / status-bar / minimap */
        1fr      /* flex space (center overlay lives here) */
        auto     /* weapon-bar */
        auto     /* health */
        auto     /* joystick */
        auto;    /* joystick */
      grid-template-areas:
        "menu        status-bar  minimap"
        ".           center      ."
        "weapon-bar  .           ."
        "health      .           ."
        "joystick    .           ."
        "joystick    .           .";
      gap: 2px;
    }

    /* Landscape: menu moves to left column — align it left */
    .hud-slot[data-region="menu"] {
      justify-content: flex-start;
    }
  }

  /* =========================================================
   * MOBILE PORTRAIT (touch + height > width)
   *
   * Status-bar at top, weapon pill + health bottom-left.
   * Fire/ADS are fixed-position, not in grid.
   * Right column kept empty — fire/ADS/actions are fixed-pos.
   * Nothing in screen center.
   *
   *  minimap    | status-bar  | menu
   *             |             |
   *             |             |
   *             |             |
   *             |             |
   *  weapon-bar |             |
   *  health     |             |
   *  joystick   |             |
   *  joystick   |             |
   * ========================================================= */
  @media (pointer: coarse) and (orientation: portrait) {
    #game-hud-root {
      grid-template-columns: minmax(80px, 1fr) minmax(120px, 2fr) minmax(80px, 1fr);
      grid-template-rows:
        auto     /* minimap / status-bar / menu */
        1fr      /* flex space */
        1fr      /* flex space (center overlay lives here) */
        1fr      /* flex space */
        auto     /* weapon-bar */
        auto     /* health */
        auto     /* joystick */
        1fr;     /* joystick */
      grid-template-areas:
        "minimap     status-bar  menu"
        ".           .           ."
        ".           center      ."
        ".           .           ."
        "weapon-bar  .           ."
        "health      .           ."
        "joystick    .           ."
        "joystick    .           .";
      gap: 2px;
    }
  }

  /* =========================================================
   * PHASE-BASED VISIBILITY
   * When game is not actively playing, hide HUD slots.
   * ========================================================= */
  [data-phase="menu"] .hud-slot,
  [data-phase="loading"] .hud-slot,
  [data-phase="ended"] .hud-slot {
    display: none !important;
  }

  /* =========================================================
   * VEHICLE-BASED VISIBILITY
   * Hide infantry-only controls when in helicopter.
   * Also hide readouts that are irrelevant while flying:
   *   stats (kill counter), game-status (phase label), ammo.
   * ========================================================= */
  [data-vehicle="helicopter"] .hud-slot[data-show="infantry"] {
    display: none !important;
  }

  [data-vehicle="helicopter"] .hud-slot[data-region="stats"],
  [data-vehicle="helicopter"] .hud-slot[data-region="game-status"],
  [data-vehicle="helicopter"] .hud-slot[data-region="ammo"] {
    display: none !important;
  }

  /* =========================================================
   * ADS MODE
   * When aiming down sights, hide non-essential HUD.
   * ========================================================= */
  [data-ads="true"] .hud-slot[data-region="weapon-bar"],
  [data-ads="true"] .hud-slot[data-region="minimap"],
  [data-ads="true"] .hud-slot[data-region="tickets"],
  [data-ads="true"] .hud-slot[data-region="status-bar"],
  [data-ads="true"] .hud-slot[data-region="kill-feed"],
  [data-ads="true"] .hud-slot[data-region="action-btns"] {
    opacity: 0.3;
    transition: opacity 0.15s ease;
  }

  /* =========================================================
   * CONDITIONAL COMPONENTS
   * Components that are only visible when active (grenade meter,
   * mortar indicator, etc.) use data-active on themselves.
   * ========================================================= */
  .hud-conditional:not([data-active="true"]) {
    display: none !important;
  }
`;
