/**
 * Design tokens - single source of truth for all UI values.
 * Import from here instead of hardcoding colors, z-indexes, sizes.
 */

/**
 * Field Journal palette (see docs/FIELD_JOURNAL_UI.md). Keys are stable — many
 * JS-driven HUD components import them — only the values changed from the old
 * amber/blue scheme. In-game HUD reads as pencil/ink on dark manila CHIPS, so
 * the text tokens here are LIGHT (paper) and the glass tokens are dark ink: that
 * keeps HUD modules legible over a bright battlefield (FJ pencil-on-acetate).
 */
export const colors = {
  // Faction colors — ALLIED = field green, HOSTILE = stamp red
  us: '#4f6b3a',
  usLight: '#6f8a52',
  usDark: '#3a4f2a',
  opfor: '#9e3b2e',
  opforLight: '#b5472f',
  opforDark: '#7c2c22',

  // UI chrome (loading screen / menus)
  primary: '#2b2620',
  secondary: '#5a5145',
  accent: '#9e3b2e',

  // Feedback
  success: '#4f6b3a',
  warning: '#a8742a',
  danger: '#9e3b2e',
  critical: '#7c2c22',
  headshot: '#a8742a',
  heal: '#4f6b3a',

  // Text — LIGHT, for HUD modules drawn on dark ink chips over the battlefield
  textPrimary: '#e7d9ba',
  textSecondary: '#c9b78a',
  textMuted: '#8a7e6b',

  // Chip backgrounds — dark ink so light HUD text reads over any backdrop
  glassBg: 'rgba(43, 38, 32, 0.78)',
  glassBgDense: 'rgba(43, 38, 32, 0.92)',
  glassBorder: 'rgba(231, 217, 186, 0.4)',
  glassBorderBright: 'rgba(231, 217, 186, 0.6)',

  // HUD chip
  hudGlass: 'rgba(43, 38, 32, 0.78)',
  hudBorder: 'rgba(231, 217, 186, 0.4)',

  // Buttons
  buttonBg: 'rgba(158, 59, 46, 0.18)',
  buttonHover: 'rgba(158, 59, 46, 0.32)',

  // TDM accent
  tdmAccent: '#9e3b2e',
} as const;

export const zIndex = {
  // In-game HUD (100-199)
  hudBase: 100,
  hudStatus: 105,
  hudElevated: 110,
  hudCompass: 115,
  hudWeapon: 120,
  hudOverlay: 150,
  hudFeedback: 200,

  // Map overlays (200-299)
  fullMap: 200,
  fullMapOverlay: 210,

  // Touch controls (999-1002)
  touchLook: 999,
  touchJoystick: 1000,
  touchButtons: 1001,
  touchMenu: 1002,
  /** Full tactical map / touch-blocking modals that must sit above thumb controls */
  fullMapAboveTouch: 1010,

  // Grenade / interaction prompts
  interactionPrompt: 1000,
  victoryScreen: 1000,

  // Notifications (2000-2999)
  notifications: 2000,

  // Fullscreen overlays (9000-9999)
  fullscreen: 9000,
  loadingScreen: 9999,
  zoneCaptureNotification: 9999,
  touchMenuOverlay: 9990,

  // Modals (10000-10099)
  modal: 10000,
  modalOverlay: 10001,
  modalTransition: 10002,

  // Debug (10004+)
  debug: 10004,
  debugLog: 10005,

  // Squad radial (above everything in gameplay)
  squadRadial: 20000,
} as const;

export const breakpoints = {
  phone: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

export const fontStack = {
  ui: "'Courier Prime', 'Courier New', monospace",
  hud: "var(--type, 'Courier Prime', monospace)",
  mono: "var(--type, 'Courier Prime', monospace)",
  /** Special Elite — stamp/heading/big-numeral voice */
  stamp: "var(--type-stamp, 'Special Elite', monospace)",
  /** Caveat — handwritten margin notes / distances */
  hand: "var(--hand, 'Caveat', cursive)",
} as const;
