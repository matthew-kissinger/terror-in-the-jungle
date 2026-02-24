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

  /* Center-aligned slots (tickets, compass, weapon-bar, center) */
  .hud-slot[data-region="tickets"],
  .hud-slot[data-region="compass"],
  .hud-slot[data-region="weapon-bar"],
  .hud-slot[data-region="center"] {
    justify-content: center;
    align-items: center;
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

  /* Touch control slots - right side */
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
   *             |  center    | kill-feed  ← top-right
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

  /* Touch-only slots hidden on desktop */
  [data-device="desktop"] .hud-slot[data-region="joystick"],
  [data-device="desktop"] .hud-slot[data-region="fire"],
  [data-device="desktop"] .hud-slot[data-region="ads"],
  [data-device="desktop"] .hud-slot[data-region="action-btns"],
  [data-device="desktop"] .hud-slot[data-region="menu"] {
    display: none !important;
  }

  /* Objectives hidden on touch */
  [data-device="touch"] .hud-slot[data-region="objectives"] {
    display: none !important;
  }

  /* game-status hidden on phones (too small) */
  [data-layout="mobile-portrait"] .hud-slot[data-region="game-status"],
  [data-layout="mobile-landscape"] .hud-slot[data-region="game-status"] {
    display: none !important;
  }

  /* stats hidden on phones (too small) */
  [data-layout="mobile-portrait"] .hud-slot[data-region="stats"],
  [data-layout="mobile-landscape"] .hud-slot[data-region="stats"] {
    display: none !important;
  }

  /* kill-feed hidden on all touch/mobile layouts */
  [data-device="touch"] .hud-slot[data-region="kill-feed"] {
    display: none !important;
  }

  /* =========================================================
   * MOBILE LANDSCAPE (touch + width > height)
   *
   *  minimap    | weapon-bar |
   *             |  compass   | fire
   *             |  tickets   | ads
   *             |            | action-btns
   *  health     |  center    | ammo
   *  joystick   |            |
   *  joystick   |            | menu
   * ========================================================= */
  @media (pointer: coarse) and (orientation: landscape) {
    #game-hud-root {
      grid-template-columns: minmax(100px, 1fr) minmax(140px, 2fr) minmax(80px, 1fr);
      grid-template-rows:
        auto     /* minimap / weapon-bar */
        auto     /* . / compass / fire */
        auto     /* . / tickets / ads */
        auto     /* . / . / action-btns */
        1fr      /* health / center / ammo */
        auto     /* joystick */
        auto;    /* joystick / . / menu */
      grid-template-areas:
        "minimap     weapon-bar  ."
        ".           compass     fire"
        ".           tickets     ads"
        ".           .           action-btns"
        "health      center      ammo"
        "joystick    .           ."
        "joystick    .           menu";
      gap: 2px;
    }
  }

  /* =========================================================
   * MOBILE PORTRAIT (touch + height > width)
   *
   *  minimap    |            | menu
   *             | weapon-bar |
   *             |  tickets   | fire
   *             |  center    | ads
   *             |            | action-btns
   *  health     |            | ammo
   *  joystick   |            |
   *  joystick   |            |
   * ========================================================= */
  @media (pointer: coarse) and (orientation: portrait) {
    #game-hud-root {
      grid-template-columns: minmax(80px, 1fr) minmax(120px, 2fr) minmax(80px, 1fr);
      grid-template-rows:
        auto     /* minimap / . / menu */
        auto     /* . / weapon-bar */
        auto     /* . / tickets / fire */
        1fr      /* . / center / ads */
        auto     /* . / . / action-btns */
        auto     /* health / . / ammo */
        auto     /* joystick */
        1fr;     /* joystick */
      grid-template-areas:
        "minimap     .           menu"
        ".           weapon-bar  ."
        ".           tickets     fire"
        ".           center      ads"
        ".           .           action-btns"
        "health      .           ammo"
        "joystick    .           ."
        "joystick    .           .";
      gap: 2px;
    }

    /* In portrait, timer and compass are hidden - not enough room */
    .hud-slot[data-region="timer"],
    .hud-slot[data-region="compass"] {
      display: none !important;
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
