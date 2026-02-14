export const renderGrenadePanel = (): string => `
  <div style="text-align: center; margin-bottom: 40px;">
    <div style="display: flex; gap: 16px; justify-content: center;">
      <!-- Frag Grenade Option -->
      <div class="grenade-option" data-grenade="frag" style="
        flex: 1;
        max-width: 220px;
        background: rgba(8, 12, 18, 0.6);
        border: 1px solid rgba(201, 86, 74, 0.3);
        border-radius: 6px;
        padding: 24px 20px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      ">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 10px; color: rgba(201, 86, 74, 0.8); letter-spacing: 1px;">FRAG</div>
        <h3 style="font-size: 20px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; color: rgba(220, 225, 230, 0.9);">Frag</h3>
        <div style="font-size: 12px; color: rgba(220, 225, 230, 0.45); margin-bottom: 10px;">
          Lethal explosion with shrapnel
        </div>
        <div style="font-size: 11px; color: rgba(201, 86, 74, 0.6); font-style: italic;">
          Best for clearing enemies from cover
        </div>
      </div>

      <!-- Smoke Grenade Option -->
      <div class="grenade-option" data-grenade="smoke" style="
        flex: 1;
        max-width: 220px;
        background: rgba(8, 12, 18, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 24px 20px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      ">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 10px; color: rgba(154, 168, 178, 0.8); letter-spacing: 1px;">SMK</div>
        <h3 style="font-size: 20px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; color: rgba(220, 225, 230, 0.9);">Smoke</h3>
        <div style="font-size: 12px; color: rgba(220, 225, 230, 0.45); margin-bottom: 10px;">
          Blocks line of sight, no damage
        </div>
        <div style="font-size: 11px; color: rgba(91, 140, 201, 0.6); font-style: italic;">
          Best for crossing open ground safely
        </div>
      </div>

      <!-- Flashbang Option -->
      <div class="grenade-option" data-grenade="flashbang" style="
        flex: 1;
        max-width: 220px;
        background: rgba(8, 12, 18, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 24px 20px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      ">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 10px; color: rgba(212, 163, 68, 0.8); letter-spacing: 1px;">FBG</div>
        <h3 style="font-size: 20px; margin-bottom: 8px; text-transform: uppercase; font-weight: 700; color: rgba(220, 225, 230, 0.9);">Flashbang</h3>
        <div style="font-size: 12px; color: rgba(220, 225, 230, 0.45); margin-bottom: 10px;">
          Disorients nearby combatants
        </div>
        <div style="font-size: 11px; color: rgba(212, 163, 68, 0.6); font-style: italic;">
          Best for pushing into held positions
        </div>
      </div>
    </div>
  </div>
`;
