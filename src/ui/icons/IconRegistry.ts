/**
 * IconRegistry - Centralized icon asset management.
 *
 * All UI icon paths are defined here. Components import `icon()` or
 * `iconImg()` instead of manually building paths. This makes it trivial
 * to change asset directory, format, or add cache-busting later.
 *
 * Icons are pixel-art PNGs in `public/assets/ui/icons/`, stored as
 * palette-optimized PNGs (~252KB total for 50 icons).
 *
 * Size categories:
 *   icon-*    48px   Touch buttons, HUD indicators, weapon icons
 *   emblem-*  128px  Faction emblems
 *   map-*     32px   Minimap markers
 *   mode-*    64px   Game mode cards
 *   hint-*    96px   Onboarding tutorial hints
 *   reticle-* 120px  Helicopter weapon pipper overlays
 */

const ICON_BASE = `${import.meta.env.BASE_URL}assets/ui/icons`;

// ---- Path resolver ----

/** Get the full URL for an icon file (without extension -- always .png). */
export function icon(name: string): string {
  return `${ICON_BASE}/${name}.png`;
}

// ---- DOM helpers ----

interface IconImgOptions {
  /** Width in px (default: 14) */
  width?: number;
  /** Height in px (default: same as width) */
  height?: number;
  /** Alt text (default: '') */
  alt?: string;
  /** Extra inline CSS appended after base styles */
  css?: string;
  /** If true, uses `loading="lazy"` and `decoding="async"` */
  lazy?: boolean;
}

const BASE_STYLE = 'object-fit:contain;image-rendering:pixelated;';

/**
 * Create an `<img>` element for an icon.
 *
 * ```ts
 * iconImg('icon-fire', { width: 24, alt: 'Fire' })
 * ```
 */
function iconImg(name: string, opts: IconImgOptions = {}): HTMLImageElement {
  const w = opts.width ?? 14;
  const h = opts.height ?? w;
  const img = document.createElement('img');
  img.src = icon(name);
  img.alt = opts.alt ?? '';
  img.width = w;
  img.height = h;
  img.draggable = false;
  if (opts.lazy) {
    img.loading = 'lazy';
    img.decoding = 'async';
  }
  img.style.cssText = BASE_STYLE + (opts.css ?? '');
  return img;
}

/**
 * Return an HTML string for an inline icon `<img>`.
 * Useful inside template literals / innerHTML builders.
 *
 * ```ts
 * `<div>${iconHtml('icon-fire', { width: 12, alt: 'Fire' })}</div>`
 * ```
 */
export function iconHtml(name: string, opts: IconImgOptions = {}): string {
  const w = opts.width ?? 14;
  const h = opts.height ?? w;
  const alt = opts.alt ?? '';
  const css = BASE_STYLE + (opts.css ?? '');
  return `<img src="${icon(name)}" alt="${alt}" width="${w}" height="${h}" style="${css}" draggable="false">`;
}

// ---- Preload ----

/**
 * Preload a set of icons by creating hidden Image objects to warm the browser cache.
 * Call early (e.g. after engine init) with critical icon names.
 */
export function preloadIcons(names: string[]): void {
  for (const name of names) {
    const img = new Image();
    img.src = icon(name);
  }
}

// ---- Weapon icon lookup ----

interface WeaponIconData {
  /** Filename without extension (e.g. 'icon-rifle') */
  iconFile: string;
  /** Short text for screen readers / fallback alt text */
  label: string;
}

const WEAPON_ICONS: Record<string, WeaponIconData> = {
  rifle:              { iconFile: 'icon-rifle',       label: 'Rifle' },
  shotgun:            { iconFile: 'icon-shotgun',     label: 'Shotgun' },
  smg:                { iconFile: 'icon-smg',         label: 'SMG' },
  pistol:             { iconFile: 'icon-pistol',      label: 'Pistol' },
  lmg:                { iconFile: 'icon-lmg',         label: 'LMG' },
  launcher:           { iconFile: 'icon-launcher',    label: 'Launcher' },
  grenade:            { iconFile: 'icon-grenade',     label: 'Grenade' },
  mortar:             { iconFile: 'icon-mortar',      label: 'Mortar' },
  melee:              { iconFile: 'icon-melee',       label: 'Melee' },
  helicopter_minigun: { iconFile: 'icon-minigun',     label: 'Minigun' },
  helicopter_rocket:  { iconFile: 'icon-rocket-pod',  label: 'Rocket' },
  helicopter_doorgun: { iconFile: 'icon-door-gun',    label: 'Door Gun' },
};

const UNKNOWN_WEAPON: WeaponIconData = { iconFile: '', label: '--' };

export function getWeaponIconData(weaponType: string): WeaponIconData {
  return WEAPON_ICONS[weaponType] ?? UNKNOWN_WEAPON;
}

/**
 * Returns an `<img>` element for a weapon icon.
 * For unknown weapons, returns a `<span>` with '--'.
 */
export function getWeaponIconElement(weaponType: string, size = 14): HTMLElement {
  const data = getWeaponIconData(weaponType);

  if (data.iconFile) {
    return iconImg(data.iconFile, {
      width: size,
      alt: weaponType,
      lazy: true,
      css: 'display:inline-block;vertical-align:middle;filter:drop-shadow(0 0 2px rgba(0,0,0,0.8));',
    });
  }

  const span = document.createElement('span');
  span.textContent = data.label;
  span.style.cssText = 'color:rgba(255,255,255,0.4);font-size:10px;';
  return span;
}

