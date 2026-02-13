import { LoadoutWeapon } from './LoadoutTypes';

interface WeaponStats {
  damage: string;
  range: string;
  fireRate: string;
  description: string;
}

export const WEAPON_STATS: Record<LoadoutWeapon, WeaponStats> = {
  [LoadoutWeapon.RIFLE]: {
    damage: '●●●○○',
    range: '●●●●●',
    fireRate: '●●●●○',
    description: 'Balanced assault rifle - accurate at range'
  },
  [LoadoutWeapon.SHOTGUN]: {
    damage: '●●●●●',
    range: '●●○○○',
    fireRate: '●●○○○',
    description: 'Devastating close-range powerhouse'
  },
  [LoadoutWeapon.SMG]: {
    damage: '●●○○○',
    range: '●●●○○',
    fireRate: '●●●●●',
    description: 'High fire rate - spray and pray'
  },
  [LoadoutWeapon.PISTOL]: {
    damage: '●●○○○',
    range: '●●●○○',
    fireRate: '●●●○○',
    description: 'Lightweight sidearm - reliable backup'
  }
};

export const renderWeaponPanel = (): string => `
  <div style="display: flex; gap: 24px; justify-content: center; margin-bottom: 40px;">
    <!-- Rifle Option -->
    <div class="loadout-option" data-weapon="rifle" style="
      flex: 1;
      max-width: 260px;
      background: rgba(20, 20, 30, 0.6);
      border: 3px solid rgba(0, 255, 100, 0.4);
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
    ">
      <div style="font-size: 48px; margin-bottom: 12px;">🔫</div>
      <h2 style="font-size: 24px; margin-bottom: 8px; text-transform: uppercase;">Rifle</h2>
      <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-bottom: 16px;">
        ${WEAPON_STATS[LoadoutWeapon.RIFLE].description}
      </div>
      <div style="text-align: left; font-size: 13px; line-height: 1.8;">
        <div><strong>Damage:</strong> ${WEAPON_STATS[LoadoutWeapon.RIFLE].damage}</div>
        <div><strong>Range:</strong> ${WEAPON_STATS[LoadoutWeapon.RIFLE].range}</div>
        <div><strong>Fire Rate:</strong> ${WEAPON_STATS[LoadoutWeapon.RIFLE].fireRate}</div>
      </div>
    </div>

    <!-- Shotgun Option -->
    <div class="loadout-option" data-weapon="shotgun" style="
      flex: 1;
      max-width: 260px;
      background: rgba(20, 20, 30, 0.6);
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
    ">
      <div style="font-size: 48px; margin-bottom: 12px;">💥</div>
      <h2 style="font-size: 24px; margin-bottom: 8px; text-transform: uppercase;">Shotgun</h2>
      <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-bottom: 16px;">
        ${WEAPON_STATS[LoadoutWeapon.SHOTGUN].description}
      </div>
      <div style="text-align: left; font-size: 13px; line-height: 1.8;">
        <div><strong>Damage:</strong> ${WEAPON_STATS[LoadoutWeapon.SHOTGUN].damage}</div>
        <div><strong>Range:</strong> ${WEAPON_STATS[LoadoutWeapon.SHOTGUN].range}</div>
        <div><strong>Fire Rate:</strong> ${WEAPON_STATS[LoadoutWeapon.SHOTGUN].fireRate}</div>
      </div>
    </div>

    <!-- SMG Option -->
    <div class="loadout-option" data-weapon="smg" style="
      flex: 1;
      max-width: 260px;
      background: rgba(20, 20, 30, 0.6);
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
    ">
      <div style="font-size: 48px; margin-bottom: 12px;"></div>
      <h2 style="font-size: 24px; margin-bottom: 8px; text-transform: uppercase;">SMG</h2>
      <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-bottom: 16px;">
        ${WEAPON_STATS[LoadoutWeapon.SMG].description}
      </div>
      <div style="text-align: left; font-size: 13px; line-height: 1.8;">
        <div><strong>Damage:</strong> ${WEAPON_STATS[LoadoutWeapon.SMG].damage}</div>
        <div><strong>Range:</strong> ${WEAPON_STATS[LoadoutWeapon.SMG].range}</div>
        <div><strong>Fire Rate:</strong> ${WEAPON_STATS[LoadoutWeapon.SMG].fireRate}</div>
      </div>
    </div>

    <!-- Pistol Option -->
    <div class="loadout-option" data-weapon="pistol" style="
      flex: 1;
      max-width: 260px;
      background: rgba(20, 20, 30, 0.6);
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.2s;
    ">
      <div style="font-size: 48px; margin-bottom: 12px;">🔫</div>
      <h2 style="font-size: 24px; margin-bottom: 8px; text-transform: uppercase;">Pistol</h2>
      <div style="font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-bottom: 16px;">
        ${WEAPON_STATS[LoadoutWeapon.PISTOL].description}
      </div>
      <div style="text-align: left; font-size: 13px; line-height: 1.8;">
        <div><strong>Damage:</strong> ${WEAPON_STATS[LoadoutWeapon.PISTOL].damage}</div>
        <div><strong>Range:</strong> ${WEAPON_STATS[LoadoutWeapon.PISTOL].range}</div>
        <div><strong>Fire Rate:</strong> ${WEAPON_STATS[LoadoutWeapon.PISTOL].fireRate}</div>
      </div>
    </div>
  </div>
`;
