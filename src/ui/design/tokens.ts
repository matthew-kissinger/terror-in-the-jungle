/**
 * Design tokens - single source of truth for all UI values.
 * Import from here instead of hardcoding colors, z-indexes, sizes.
 */

export const colors = {
  // Faction colors - muted military tones
  us: '#5b8cc9',
  usLight: '#7ba8dd',
  usDark: '#3d6a9e',
  opfor: '#c9564a',
  opforLight: '#d97a70',
  opforDark: '#a03a30',

  // UI chrome (loading screen / menus)
  primary: '#7fb4d9',
  secondary: '#5a8fb5',
  accent: '#9fcfeb',

  // Feedback - muted, not neon
  success: '#5cb85c',
  warning: '#d4a344',
  danger: '#c9564a',
  critical: '#b83a5e',
  headshot: '#d4a344',
  heal: '#6ab87a',

  // Text
  textPrimary: '#d8dfe3',
  textSecondary: '#9aa8b2',
  textMuted: '#6b7780',

  // Glass backgrounds
  glassBg: 'rgba(20, 35, 50, 0.4)',
  glassBgDense: 'rgba(20, 35, 50, 0.9)',
  glassBorder: 'rgba(127, 180, 217, 0.2)',
  glassBorderBright: 'rgba(127, 180, 217, 0.3)',

  // HUD glass - slightly more visible for readability
  hudGlass: 'rgba(8, 12, 18, 0.55)',
  hudBorder: 'rgba(255, 255, 255, 0.08)',

  // Buttons
  buttonBg: 'rgba(90, 143, 181, 0.3)',
  buttonHover: 'rgba(90, 143, 181, 0.5)',

  // TDM accent
  tdmAccent: '#c9564a',
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

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
  '4xl': '64px',
} as const;

export const fontSize = {
  xs: 'clamp(0.625rem, 1.2vw, 0.75rem)',    // 10-12px
  sm: 'clamp(0.6875rem, 1.4vw, 0.875rem)',  // 11-14px
  base: 'clamp(0.75rem, 1.6vw, 1rem)',      // 12-16px
  lg: 'clamp(0.875rem, 2vw, 1.125rem)',      // 14-18px
  xl: 'clamp(1rem, 2.5vw, 1.375rem)',        // 16-22px
  '2xl': 'clamp(1.25rem, 3vw, 1.75rem)',     // 20-28px
  '3xl': 'clamp(1.5rem, 4vw, 2.5rem)',       // 24-40px
} as const;

export const touchTarget = {
  minimum: '44px',
  standard: '48px',
  large: '64px',
  xlarge: '80px',
} as const;

export const borderRadius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '20px',
  pill: '50px',
  circle: '50%',
} as const;

export const breakpoints = {
  phone: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

export const fontStack = {
  ui: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif",
  hud: "'Rajdhani', 'Segoe UI', sans-serif",
  mono: "'Courier New', monospace",
} as const;
