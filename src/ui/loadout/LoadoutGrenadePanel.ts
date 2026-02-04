export const renderGrenadePanel = (): string => `
  <div style="text-align: center; margin-bottom: 40px;">
    <h2 style="font-size: 20px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px;">
      Grenade Type
    </h2>
    <div style="display: flex; gap: 20px; justify-content: center;">
      <!-- Frag Grenade Option -->
      <div class="grenade-option" data-grenade="frag" style="
        flex: 1;
        max-width: 200px;
        background: rgba(20, 20, 30, 0.6);
        border: 3px solid rgba(255, 0, 0, 0.4);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.2s;
      ">
        <div style="font-size: 36px; margin-bottom: 8px;">💣</div>
        <h3 style="font-size: 18px; margin-bottom: 6px; text-transform: uppercase;">Frag</h3>
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
          Lethal explosion with shrapnel
        </div>
      </div>

      <!-- Smoke Grenade Option -->
      <div class="grenade-option" data-grenade="smoke" style="
        flex: 1;
        max-width: 200px;
        background: rgba(20, 20, 30, 0.6);
        border: 3px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.2s;
      ">
        <div style="font-size: 36px; margin-bottom: 8px;">💨</div>
        <h3 style="font-size: 18px; margin-bottom: 6px; text-transform: uppercase;">Smoke</h3>
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
          Blocks line of sight, no damage
        </div>
      </div>

      <!-- Flashbang Option -->
      <div class="grenade-option" data-grenade="flashbang" style="
        flex: 1;
        max-width: 200px;
        background: rgba(20, 20, 30, 0.6);
        border: 3px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.2s;
      ">
        <div style="font-size: 36px; margin-bottom: 8px;">⚡</div>
        <h3 style="font-size: 18px; margin-bottom: 6px; text-transform: uppercase;">Flashbang</h3>
        <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">
          Disorients nearby combatants
        </div>
      </div>
    </div>
  </div>
`;
