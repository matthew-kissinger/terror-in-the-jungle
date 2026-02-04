import { Logger } from '../../utils/Logger';
import { KillFeed } from './KillFeed';
import { Faction } from '../../systems/combat/types';
import { DamageNumberSystem } from './DamageNumberSystem';
import { ScorePopupSystem } from './ScorePopupSystem';
import { HitMarkerFeedback } from './HitMarkerFeedback';
import { WeaponSwitchFeedback } from './WeaponSwitchFeedback';
import { WeaponAmmoDisplay } from './WeaponAmmoDisplay';
import { ObjectiveDisplay } from './ObjectiveDisplay';
import { CombatStatsDisplay } from './CombatStatsDisplay';
import { GameStatusDisplay } from './GameStatusDisplay';
import { HelicopterInstruments } from './HelicopterInstruments';
import { GrenadePowerMeter } from './GrenadePowerMeter';
import { InteractionPrompt } from './InteractionPrompt';
import { RespawnButton } from './RespawnButton';
import * as THREE from 'three';

export class HUDElements {
  // Main containers
  public hudContainer: HTMLDivElement;
  
  // Extracted modules - expose their public properties for backward compatibility
  public objectivesList: HTMLDivElement;
  public ticketDisplay: HTMLDivElement;
  public combatStats: HTMLDivElement;
  public gameStatus: HTMLDivElement;
  public timerElement: HTMLDivElement;
  public hitMarkerContainer: HTMLDivElement;
  public killCounter: HTMLDivElement;
  public ammoDisplay: HTMLDivElement;
  public respawnButton: HTMLButtonElement;
  public interactionPrompt: HTMLDivElement;
  public elevationSlider: HTMLDivElement;
  public helicopterMouseIndicator: HTMLDivElement;
  public helicopterInstruments: HTMLDivElement;
  public grenadePowerMeter: HTMLDivElement;
  public grenadeCookingTimer?: HTMLDivElement;
  
  // Feedback systems
  public killFeed: KillFeed;
  public damageNumbers?: DamageNumberSystem;
  public scorePopups?: ScorePopupSystem;
  public hitMarkerFeedback?: HitMarkerFeedback;
  public weaponSwitchFeedback?: WeaponSwitchFeedback;

  // Module instances
  private weaponAmmoDisplay: WeaponAmmoDisplay;
  private objectiveDisplay: ObjectiveDisplay;
  private combatStatsDisplay: CombatStatsDisplay;
  private gameStatusDisplay: GameStatusDisplay;
  private helicopterInstrumentsModule: HelicopterInstruments;
  private grenadePowerMeterModule: GrenadePowerMeter;
  private interactionPromptModule: InteractionPrompt;
  private respawnButtonModule: RespawnButton;

  constructor(camera?: THREE.Camera) {
    this.hudContainer = this.createHUDContainer();
    
    // Initialize extracted modules
    this.weaponAmmoDisplay = new WeaponAmmoDisplay();
    this.objectiveDisplay = new ObjectiveDisplay();
    this.combatStatsDisplay = new CombatStatsDisplay();
    this.gameStatusDisplay = new GameStatusDisplay();
    this.helicopterInstrumentsModule = new HelicopterInstruments();
    this.grenadePowerMeterModule = new GrenadePowerMeter();
    this.interactionPromptModule = new InteractionPrompt();
    this.respawnButtonModule = new RespawnButton();
    
    // Expose module properties for backward compatibility
    this.objectivesList = this.objectiveDisplay.objectivesList;
    this.ticketDisplay = this.objectiveDisplay.ticketDisplay;
    this.combatStats = this.combatStatsDisplay.combatStats;
    this.gameStatus = this.gameStatusDisplay.gameStatus;
    this.timerElement = this.gameStatusDisplay.timerElement;
    this.killCounter = this.combatStatsDisplay.killCounter;
    this.ammoDisplay = this.weaponAmmoDisplay.ammoDisplay;
    this.respawnButton = this.respawnButtonModule.respawnButton;
    this.interactionPrompt = this.interactionPromptModule.interactionPrompt;
    this.elevationSlider = this.helicopterInstrumentsModule.elevationSlider;
    this.helicopterMouseIndicator = this.helicopterInstrumentsModule.helicopterMouseIndicator;
    this.helicopterInstruments = this.helicopterInstrumentsModule.helicopterInstruments;
    this.grenadePowerMeter = this.grenadePowerMeterModule.grenadePowerMeter;
    this.grenadeCookingTimer = this.grenadePowerMeterModule.grenadeCookingTimer;
    
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

    // Assemble HUD structure
    this.hudContainer.appendChild(this.objectivesList);
    this.hudContainer.appendChild(this.ticketDisplay);
    this.hudContainer.appendChild(this.combatStats);
    this.hudContainer.appendChild(this.gameStatus);
    this.hudContainer.appendChild(this.timerElement);
    this.hudContainer.appendChild(this.hitMarkerContainer);
    this.hudContainer.appendChild(this.killCounter);
    this.hudContainer.appendChild(this.ammoDisplay);
    this.hudContainer.appendChild(this.interactionPrompt);
    this.hudContainer.appendChild(this.elevationSlider);
    this.hudContainer.appendChild(this.helicopterMouseIndicator);
    this.hudContainer.appendChild(this.helicopterInstruments);
    this.hudContainer.appendChild(this.grenadePowerMeter);
    // Removed respawn button from HUD
  }

  private createHUDContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'hud-container';
    return container;
  }

  private createHitMarkerContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'hit-marker-container';
    return container;
  }

  updateAmmoDisplay(magazine: number, reserve: number): void {
    this.weaponAmmoDisplay.updateAmmoDisplay(magazine, reserve);
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
      animation: fadeIn 0.3s ease;
    `;
    messageElement.textContent = message;

    this.hudContainer.appendChild(messageElement);

    setTimeout(() => {
      messageElement.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        if (messageElement.parentNode) {
          this.hudContainer.removeChild(messageElement);
        }
      }, 300);
    }, duration);
  }

  showInteractionPrompt(text: string): void {
    this.interactionPromptModule.showInteractionPrompt(text);
  }

  hideInteractionPrompt(): void {
    this.interactionPromptModule.hideInteractionPrompt();
  }

  updateElevation(elevation: number): void {
    this.helicopterInstrumentsModule.updateElevation(elevation);
  }

  // Helicopter mouse control indicator methods
  showHelicopterMouseIndicator(): void {
    this.helicopterInstrumentsModule.showHelicopterMouseIndicator();
  }

  hideHelicopterMouseIndicator(): void {
    this.helicopterInstrumentsModule.hideHelicopterMouseIndicator();
  }

  updateHelicopterMouseMode(controlMode: boolean): void {
    this.helicopterInstrumentsModule.updateHelicopterMouseMode(controlMode);
  }

  // Helicopter instruments methods (only visible in helicopter)
  showHelicopterInstruments(): void {
    this.helicopterInstrumentsModule.showHelicopterInstruments();
  }

  hideHelicopterInstruments(): void {
    this.helicopterInstrumentsModule.hideHelicopterInstruments();
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    this.helicopterInstrumentsModule.updateHelicopterInstruments(collective, rpm, autoHover, engineBoost);
  }

  // Grenade power meter methods
  showGrenadePowerMeter(): void {
    this.grenadePowerMeterModule.showGrenadePowerMeter();
  }

  hideGrenadePowerMeter(): void {
    this.grenadePowerMeterModule.hideGrenadePowerMeter();
  }

  updateGrenadePower(power: number, estimatedDistance?: number, cookingTime?: number): void {
    this.grenadePowerMeterModule.updateGrenadePower(power, estimatedDistance, cookingTime);
  }

  attachToDOM(): void {
    document.body.appendChild(this.hudContainer);
    this.killFeed.attachToDOM(document.body);
    if (this.damageNumbers) {
      this.damageNumbers.attachToDOM();
    }
    if (this.scorePopups) {
      this.scorePopups.attachToDOM();
    }
    if (this.hitMarkerFeedback) {
      this.hitMarkerFeedback.attachToDOM();
    }
    if (this.weaponSwitchFeedback) {
      this.weaponSwitchFeedback.attachToDOM();
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
  }
}
