interface WeaponIconData {
  svgPath: string | null;
  textFallback: string;
  color: string;
}

const WEAPON_ICONS: Record<string, WeaponIconData> = {
  rifle:              { svgPath: null, textFallback: '[AR]', color: 'rgba(255, 255, 255, 0.6)' },
  shotgun:            { svgPath: null, textFallback: '[SG]', color: 'rgba(255, 255, 255, 0.6)' },
  smg:                { svgPath: null, textFallback: '[SM]', color: 'rgba(255, 255, 255, 0.6)' },
  pistol:             { svgPath: null, textFallback: '[PI]', color: 'rgba(255, 255, 255, 0.6)' },
  lmg:                { svgPath: null, textFallback: '[LM]', color: 'rgba(255, 255, 255, 0.6)' },
  launcher:           { svgPath: null, textFallback: '[RL]', color: 'rgba(255, 180, 100, 0.7)' },
  grenade:            { svgPath: null, textFallback: '[GR]', color: 'rgba(255, 180, 100, 0.7)' },
  mortar:             { svgPath: null, textFallback: '[MT]', color: 'rgba(255, 140, 100, 0.7)' },
  melee:              { svgPath: null, textFallback: '[ML]', color: 'rgba(255, 255, 255, 0.6)' },
  helicopter_minigun: { svgPath: null, textFallback: '[MG]', color: 'rgba(180, 220, 255, 0.7)' },
  helicopter_rocket:  { svgPath: null, textFallback: '[RK]', color: 'rgba(255, 160, 100, 0.7)' },
  helicopter_doorgun: { svgPath: null, textFallback: '[DG]', color: 'rgba(180, 220, 255, 0.7)' },
  unknown:            { svgPath: null, textFallback: '--',   color: 'rgba(255, 255, 255, 0.4)' },
};

const SVG_BASE_PATH = 'assets/ui/icons';

export function getWeaponIconData(weaponType: string): WeaponIconData {
  return WEAPON_ICONS[weaponType] ?? WEAPON_ICONS.unknown;
}

export function getWeaponIconElement(weaponType: string): HTMLElement {
  const data = getWeaponIconData(weaponType);

  if (data.svgPath) {
    const img = document.createElement('img');
    img.src = `${SVG_BASE_PATH}/icon-${weaponType}.svg`;
    img.alt = weaponType;
    img.style.width = '14px';
    img.style.height = '14px';
    img.style.verticalAlign = 'middle';
    img.style.filter = 'drop-shadow(0 0 2px rgba(0,0,0,0.8))';
    img.onerror = () => {
      const fallback = document.createElement('span');
      fallback.textContent = data.textFallback;
      fallback.style.color = data.color;
      img.replaceWith(fallback);
    };
    return img;
  }

  const span = document.createElement('span');
  span.textContent = data.textFallback;
  span.style.color = data.color;
  return span;
}
