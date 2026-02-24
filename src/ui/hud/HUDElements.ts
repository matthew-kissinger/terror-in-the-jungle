import { Logger } from '../../utils/Logger';
import { KillFeed } from './KillFeed';
import { Faction } from '../../systems/combat/types';
import { DamageNumberSystem } from './DamageNumberSystem';
import { ScorePopupSystem } from './ScorePopupSystem';
import { HitMarkerFeedback } from './HitMarkerFeedback';
import { WeaponSwitchFeedback } from './WeaponSwitchFeedback';
import { UnifiedWeaponBar } from './UnifiedWeaponBar';
import { ObjectiveDisplay } from './ObjectiveDisplay';
import { TicketDisplay } from './TicketDisplay';
import { MatchTimer } from './MatchTimer';
import { GameStatusPanel } from './GameStatusPanel';
import { KillCounter } from './KillCounter';
import { AmmoDisplay } from './AmmoDisplay';
import { HelicopterHUD } from './HelicopterHUD';
import { InteractionPromptPanel } from './InteractionPromptPanel';
import { GrenadeMeter } from './GrenadeMeter';
import { MortarPanel } from './MortarPanel';
import { RespawnButton } from './RespawnButton';
import { ZoneCaptureNotification } from './ZoneCaptureNotification';
import { zIndex, fontStack } from '../design/tokens';
import type { HUDLayout } from '../layout/HUDLayout';
import * as THREE from 'three';

export class HUDElements {
  // Main containers
  public hudContainer: HTMLDivElement;

  // UIComponent-based elements
  public objectivesList: HTMLDivElement;
  public ticketDisplay: TicketDisplay;
  public matchTimer: MatchTimer;
  public gameStatusPanel: GameStatusPanel;
  public killCounter: KillCounter;
  public ammoDisplay: AmmoDisplay;

  // Legacy HTMLDivElement properties (not yet migrated)
  public combatStats: HTMLDivElement;
  public hitMarkerContainer: HTMLDivElement;
  public respawnButton: HTMLButtonElement;

  // UIComponent-based elements (Phase 3)
  public interactionPromptPanel: InteractionPromptPanel;
  public grenadeMeter: GrenadeMeter;
  public mortarPanel: MortarPanel;

  // UIComponent-based elements (Phase 4)
  public helicopterHUD: HelicopterHUD;

  // Feedback systems
  public killFeed: KillFeed;
  public damageNumbers?: DamageNumberSystem;
  public scorePopups?: ScorePopupSystem;
  public hitMarkerFeedback?: HitMarkerFeedback;
  public weaponSwitchFeedback?: WeaponSwitchFeedback;
  public zoneCaptureNotification?: ZoneCaptureNotification;
  public unifiedWeaponBar: UnifiedWeaponBar;

  // Legacy module instances (not yet migrated to UIComponent)
  private objectiveDisplay: ObjectiveDisplay;
  private respawnButtonModule: RespawnButton;

  constructor(camera?: THREE.Camera) {
    this.hudContainer = this.createHUDContainer();

    // Initialize UIComponent-based modules
    this.ticketDisplay = new TicketDisplay();
    this.matchTimer = new MatchTimer();
    this.gameStatusPanel = new GameStatusPanel();
    this.killCounter = new KillCounter();
    this.ammoDisplay = new AmmoDisplay();

    // Initialize Phase 3 UIComponent modules
    this.interactionPromptPanel = new InteractionPromptPanel();
    this.grenadeMeter = new GrenadeMeter();
    this.mortarPanel = new MortarPanel();

    // Initialize Phase 4 UIComponent modules
    this.helicopterHUD = new HelicopterHUD();

    // Initialize legacy modules (not yet migrated)
    this.objectiveDisplay = new ObjectiveDisplay();
    this.respawnButtonModule = new RespawnButton();

    // Expose legacy module properties for backward compatibility
    this.objectivesList = this.objectiveDisplay.objectivesList;
    this.combatStats = document.createElement('div'); // hidden, placeholder
    this.combatStats.style.display = 'none';
    this.respawnButton = this.respawnButtonModule.respawnButton;

    // Create hit marker container (simple, no module needed)
    this.hitMarkerContainer = this.createHitMarkerContainer();

    // Initialize feedback systems
    this.killFeed = new KillFeed();

    // Initialize damage number system if camera is provided
    if (camera) {
      this.damageNumbers = new DamageNumberSystem(camera);
    }

    // Initialize score popup system
    this.scorePopups = new ScorePopupSystem();

    // Initialize hit marker feedback system
    this.hitMarkerFeedback = new HitMarkerFeedback();

    // Initialize weapon switch feedback system
    this.weaponSwitchFeedback = new WeaponSwitchFeedback();

    // Initialize zone capture notification system
    this.zoneCaptureNotification = new ZoneCaptureNotification();

    // Initialize unified weapon bar
    this.unifiedWeaponBar = new UnifiedWeaponBar();

    // Assemble HUD structure (fallback for non-grid mode)
    this.hudContainer.appendChild(this.objectivesList);
    this.ticketDisplay.mount(this.hudContainer);
    this.hudContainer.appendChild(this.combatStats);
    this.gameStatusPanel.mount(this.hudContainer);
    this.matchTimer.mount(this.hudContainer);
    this.hudContainer.appendChild(this.hitMarkerContainer);
    this.killCounter.mount(this.hudContainer);
    this.ammoDisplay.mount(this.hudContainer);
    this.interactionPromptPanel.mount(this.hudContainer);
    this.helicopterHUD.mount(this.hudContainer);
    this.grenadeMeter.mount(this.hudContainer);
    this.mortarPanel.mount(this.hudContainer);
    // Removed respawn button from HUD
  }

  private createHUDContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      font-family: ${fontStack.hud};
      color: rgba(220, 225, 230, 0.95);
      z-index: ${zIndex.hudBase};
      letter-spacing: 0.2px;
    `;
    return container;
  }

  private createHitMarkerContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = 'position: relative; width: 0; height: 0; pointer-events: none;';
    return container;
  }

  updateAmmoDisplay(magazine: number, reserve: number): void {
    this.ammoDisplay.setAmmo(magazine, reserve);
  }

  showHitMarker(type: 'hit' | 'kill' | 'headshot' = 'hit'): void {
    // Use new hit marker feedback system
    if (this.hitMarkerFeedback) {
      this.hitMarkerFeedback.showHitMarker(type);
    }

    // Legacy logging
    if (type === 'kill') {
      Logger.info('hud', ' Kill confirmed!');
    } else if (type === 'headshot') {
      Logger.info('hud', ' Headshot!');
    }
  }

  showMessage(message: string, duration: number = 3000): void {
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px;
      font-size: 24px;
      border-radius: 5px;
      text-align: center;
      animation: ui-fadeIn 0.3s ease;
    `;
    messageElement.textContent = message;

    this.hudContainer.appendChild(messageElement);

    setTimeout(() => {
      messageElement.style.animation = 'ui-fadeOut 0.3s ease';
      setTimeout(() => {
        if (messageElement.parentNode) {
          this.hudContainer.removeChild(messageElement);
        }
      }, 300);
    }, duration);
  }

  showInteractionPrompt(text: string): void {
    this.interactionPromptPanel.show(text);
  }

  hideInteractionPrompt(): void {
    this.interactionPromptPanel.hide();
  }

  updateElevation(elevation: number): void {
    this.helicopterHUD.setElevation(elevation);
  }

  // Helicopter mouse control indicator methods
  showHelicopterMouseIndicator(): void {
    this.helicopterHUD.showMouseIndicator();
  }

  hideHelicopterMouseIndicator(): void {
    this.helicopterHUD.hideMouseIndicator();
  }

  updateHelicopterMouseMode(controlMode: boolean): void {
    this.helicopterHUD.setMouseMode(controlMode);
  }

  // Helicopter instruments methods (only visible in helicopter)
  showHelicopterInstruments(): void {
    this.helicopterHUD.show();
    this.helicopterHUD.showInstruments();
  }

  hideHelicopterInstruments(): void {
    this.helicopterHUD.hide();
    this.helicopterHUD.hideInstruments();
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    this.helicopterHUD.setInstruments(collective, rpm, autoHover, engineBoost);
  }

  // Mortar indicator methods
  showMortarIndicator(): void {
    this.mortarPanel.show();
  }

  hideMortarIndicator(): void {
    this.mortarPanel.hide();
  }

  updateMortarState(pitch: number, yaw: number, power: number, isAiming: boolean): void {
    this.mortarPanel.setState(pitch, yaw, power, isAiming);
  }

  // Grenade power meter methods
  showGrenadePowerMeter(): void {
    this.grenadeMeter.show();
  }

  hideGrenadePowerMeter(): void {
    this.grenadeMeter.hide();
  }

  updateGrenadePower(power: number, estimatedDistance?: number, cookingTime?: number): void {
    this.grenadeMeter.setPower(power, estimatedDistance, cookingTime);
  }

  attachToDOM(layout?: HUDLayout): void {
    if (layout) {
      // Mount UIComponent-based elements into grid slots
      this.ticketDisplay.unmount();
      this.ticketDisplay.mount(layout.getSlot('tickets'));

      this.matchTimer.unmount();
      this.matchTimer.mount(layout.getSlot('timer'));

      this.gameStatusPanel.unmount();
      this.gameStatusPanel.mount(layout.getSlot('game-status'));

      this.killCounter.unmount();
      this.killCounter.mount(layout.getSlot('stats'));

      this.ammoDisplay.unmount();
      this.ammoDisplay.mount(layout.getSlot('ammo'));

      // Phase 3 UIComponent elements
      this.interactionPromptPanel.unmount();
      this.interactionPromptPanel.mount(layout.getSlot('center'));

      this.grenadeMeter.unmount();
      this.grenadeMeter.mount(layout.getSlot('center'));

      this.mortarPanel.unmount();
      this.mortarPanel.mount(layout.getSlot('center'));

      // Phase 4 UIComponent elements
      this.helicopterHUD.unmount();
      this.helicopterHUD.mount(layout.getSlot('center'));

      // Legacy HTMLDivElement elements
      layout.getSlot('objectives').appendChild(this.objectivesList);
      layout.getSlot('stats').appendChild(this.combatStats);
      layout.getSlot('center').appendChild(this.hitMarkerContainer);

      // Feedback systems mount to the center slot too
      this.killFeed.attachToDOM(layout.getSlot('kill-feed'));
      if (this.damageNumbers) this.damageNumbers.attachToDOM(layout.getSlot('center'));
      if (this.scorePopups) this.scorePopups.attachToDOM(layout.getSlot('center'));
      if (this.hitMarkerFeedback) this.hitMarkerFeedback.attachToDOM(layout.getSlot('center'));
      if (this.weaponSwitchFeedback) this.weaponSwitchFeedback.attachToDOM(layout.getSlot('center'));
      if (this.zoneCaptureNotification) this.zoneCaptureNotification.mount(layout.getSlot('center'));

      // Unified weapon bar into weapon-bar slot (infantry only)
      const weaponSlot = layout.getSlot('weapon-bar');
      weaponSlot.dataset.show = 'infantry';
      this.unifiedWeaponBar.mount(weaponSlot);

      // hud-container is no longer needed in grid mode, but keep it mounted under HUD root for disposal tracking.
      this.hudContainer.style.display = 'none';
      layout.getRoot().appendChild(this.hudContainer);
    } else {
      // Legacy path: mount everything to body (backward compat)
      document.body.appendChild(this.hudContainer);
      this.killFeed.attachToDOM(document.body);
      if (this.damageNumbers) this.damageNumbers.attachToDOM();
      if (this.scorePopups) this.scorePopups.attachToDOM();
      if (this.hitMarkerFeedback) this.hitMarkerFeedback.attachToDOM();
      if (this.weaponSwitchFeedback) this.weaponSwitchFeedback.attachToDOM();
      if (this.zoneCaptureNotification) this.zoneCaptureNotification.mount(document.body);
    }
  }

  updateKillFeed(deltaTime: number): void {
    this.killFeed.update(deltaTime);
  }

  updateDamageNumbers(): void {
    if (this.damageNumbers) {
      this.damageNumbers.update();
    }
  }

  updateScorePopups(): void {
    if (this.scorePopups) {
      this.scorePopups.update();
    }
  }

  spawnScorePopup(type: 'capture' | 'defend' | 'secured' | 'kill' | 'headshot' | 'assist', points: number, multiplier?: number): void {
    if (this.scorePopups) {
      this.scorePopups.spawn(type, points, multiplier);
    }
  }

  spawnDamageNumber(worldPos: THREE.Vector3, damage: number, isHeadshot: boolean = false, isKill: boolean = false): void {
    if (this.damageNumbers) {
      this.damageNumbers.spawn(worldPos, damage, isHeadshot, isKill);
    }
  }

  addKillToFeed(
    killerName: string,
    killerFaction: Faction,
    victimName: string,
    victimFaction: Faction,
    isHeadshot: boolean = false,
    weaponType: string = 'unknown'
  ): void {
    this.killFeed.addKill(killerName, killerFaction, victimName, victimFaction, isHeadshot, weaponType as any);
  }

  showWeaponSwitch(weaponName: string, weaponIcon: string, ammo: string): void {
    if (this.weaponSwitchFeedback) {
      this.weaponSwitchFeedback.show(weaponName, weaponIcon, ammo);
    }
  }

  dispose(): void {
    if (this.hudContainer.parentNode) {
      this.hudContainer.parentNode.removeChild(this.hudContainer);
    }
    // Dispose UIComponent-based elements
    this.ticketDisplay.dispose();
    this.matchTimer.dispose();
    this.gameStatusPanel.dispose();
    this.killCounter.dispose();
    this.ammoDisplay.dispose();

    // Dispose legacy feedback systems
    this.killFeed.dispose();
    if (this.damageNumbers) {
      this.damageNumbers.dispose();
    }
    if (this.scorePopups) {
      this.scorePopups.dispose();
    }
    if (this.hitMarkerFeedback) {
      this.hitMarkerFeedback.dispose();
    }
    if (this.weaponSwitchFeedback) {
      this.weaponSwitchFeedback.dispose();
    }
    this.unifiedWeaponBar.dispose();
    this.interactionPromptPanel.dispose();
    this.grenadeMeter.dispose();
    this.mortarPanel.dispose();
    this.helicopterHUD.dispose();
  }
}
