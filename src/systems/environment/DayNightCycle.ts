import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { IGameRenderer } from '../../types/SystemInterfaces';

export class DayNightCycle implements GameSystem {
  private renderer?: IGameRenderer;
  private scene?: THREE.Scene;
  
  // Time tracking (in hours, 0-24)
  private currentTime: number = 12.0; // Start at noon
  private timeScale: number = 1.0; // 1 game hour = 60 real seconds
  private isNightModeLocked: boolean = false;
  
  // Update throttling (update every 0.5 seconds for performance)
  private updateTimer: number = 0;
  private readonly UPDATE_INTERVAL: number = 0.5;
  
  // Cached base values from renderer
  private baseFogColor: number = 0x0a1012;
  private baseFogDensity: number = 0.008;
  
  // Sky colors for transitions
  private skyColors = {
    midnight: new THREE.Color(0x0a0a1a), // Very dark blue-purple
    dawn: new THREE.Color(0xff6b4a), // Pink-orange
    noon: new THREE.Color(0x87ceeb), // Bright blue
    dusk: new THREE.Color(0xff8c42), // Orange
  };
  
  // Fog colors for transitions
  private fogColors = {
    day: new THREE.Color(0x87ceeb), // Blue fog
    night: new THREE.Color(0x0a1012), // Dark blue-green
    dawnDusk: new THREE.Color(0x8b6f47), // Brownish for dawn/dusk
  };

  // Pre-allocated scratch colors to avoid allocations in update methods
  private readonly _scratchColorA = new THREE.Color();
  private readonly _scratchColorB = new THREE.Color();
  private readonly _scratchSkyColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    Logger.info('environment', 'Day-Night Cycle System initialized');
  }

  setRenderer(renderer: IGameRenderer): void {
    this.renderer = renderer;
    // Cache base values
    if (renderer.fog) {
      this.baseFogColor = renderer.fog.color.getHex();
      this.baseFogDensity = renderer.fog.density;
    }
  }

  update(deltaTime: number): void {
    if (!this.renderer) return;

    // Update timer
    this.updateTimer += deltaTime;
    if (this.updateTimer < this.UPDATE_INTERVAL) return;
    
    deltaTime = this.updateTimer;
    this.updateTimer = 0;

    // Update time of day (unless locked in night mode)
    if (!this.isNightModeLocked) {
      // 1 game hour = 60 real seconds by default
      // deltaTime is in seconds, timeScale adjusts speed
      const hourIncrement = (deltaTime / 60.0) * this.timeScale;
      this.currentTime = (this.currentTime + hourIncrement) % 24;
    }

    // Update lighting based on current time
    this.updateLighting();
    this.updateFog();
    this.updateSkyColor();
  }

  private updateLighting(): void {
    if (!this.renderer) return;

    const time = this.currentTime;
    const nightFactor = this.getNightFactor();
    
    // === SUN/MOON LIGHT (DirectionalLight) ===
    if (this.renderer.moonLight) {
      const sunLight = this.renderer.moonLight;
      
      // Position: Rotate around scene based on time
      // At noon (12h): high in sky (y=80)
      // At midnight (0h/24h): opposite side or low
      const angle = ((time - 6) / 24) * Math.PI * 2; // 6am = horizon
      const distance = 80;
      sunLight.position.set(
        Math.sin(angle) * distance * 0.5,
        Math.cos(angle) * distance,
        -50
      );
      
      // Intensity: Full at noon, minimal at night
      if (time >= 6 && time <= 18) {
        // Daytime (6am - 6pm)
        const dayProgress = (time - 6) / 12;
        const dayIntensity = Math.sin(dayProgress * Math.PI); // 0 at dawn/dusk, 1 at noon
        sunLight.intensity = 0.3 + dayIntensity * 0.7; // 0.3 to 1.0
      } else {
        // Nighttime
        sunLight.intensity = 0.05 + (Math.random() * 0.02); // Minimal moonlight with flicker
      }
      
      // Color: Warm yellow at noon, orange at sunset, blue-white at night
      if (time >= 5 && time < 7) {
        // Dawn (5am - 7am)
        const t = (time - 5) / 2;
        sunLight.color.lerpColors(
          this._scratchColorA.set(0x4a6b8a), // Blue moonlight
          this._scratchColorB.set(0xffb380), // Warm orange
          t
        );
      } else if (time >= 7 && time < 17) {
        // Day (7am - 5pm)
        const t = (time - 7) / 10;
        this._scratchColorA.set(0xffb380); // Orange (morning)
        this._scratchColorB.set(0xfffacd); // Warm yellow (noon)
        if (t < 0.5) {
          sunLight.color.lerpColors(this._scratchColorA, this._scratchColorB, t * 2);
        } else {
          sunLight.color.lerpColors(this._scratchColorB, this._scratchColorA, (t - 0.5) * 2);
        }
      } else if (time >= 17 && time < 19) {
        // Dusk (5pm - 7pm)
        const t = (time - 17) / 2;
        sunLight.color.lerpColors(
          this._scratchColorA.set(0xff8c42), // Orange sunset
          this._scratchColorB.set(0x4a6b8a), // Blue moonlight
          t
        );
      } else {
        // Night
        sunLight.color.set(0x4a6b8a); // Blue-white moonlight
      }
    }
    
    // === AMBIENT LIGHT ===
    if (this.renderer.ambientLight) {
      // Intensity: 0.5 day, 0.15 night
      const dayIntensity = 0.5;
      const nightIntensity = 0.15;
      this.renderer.ambientLight.intensity =
        nightIntensity + (1 - nightFactor) * (dayIntensity - nightIntensity);

      // Color shift: warm day, cool night
      this.renderer.ambientLight.color.lerpColors(
        this._scratchColorA.set(0x1a2f3a), // Dark blue (night)
        this._scratchColorB.set(0xffffff), // White (day)
        1 - nightFactor
      );
    }
    
    // === HEMISPHERE LIGHT ===
    if (this.renderer.hemisphereLight) {
      // Intensity: 0.5 day, 0.2 night
      const dayIntensity = 0.5;
      const nightIntensity = 0.2;
      this.renderer.hemisphereLight.intensity = 
        nightIntensity + (1 - nightFactor) * (dayIntensity - nightIntensity);
    }
  }

  private updateFog(): void {
    if (!this.renderer || !this.renderer.fog) return;

    const time = this.currentTime;
    const nightFactor = this.getNightFactor();
    
    // Fog density: Denser at dawn/dusk, reduced at night (80% of day)
    let densityMultiplier = 1.0;
    
    if ((time >= 5 && time < 7) || (time >= 17 && time < 19)) {
      // Dawn/Dusk: Extra dense fog
      densityMultiplier = 1.5;
    } else if (nightFactor > 0.5) {
      // Night: Slightly reduced visibility
      densityMultiplier = 0.8;
    }
    
    this.renderer.fog.density = this.baseFogDensity * densityMultiplier;
    
    // Fog color: Blue-tinted at night, lighter during day
    const dayFogColor = this.fogColors.day;
    const nightFogColor = this.fogColors.night;
    const dawnDuskColor = this.fogColors.dawnDusk;
    
    if ((time >= 5 && time < 7) || (time >= 17 && time < 19)) {
      // Dawn/Dusk: Use special brown/orange tint
      this.renderer.fog.color.copy(dawnDuskColor);
    } else {
      // Interpolate between day and night
      this.renderer.fog.color.lerpColors(dayFogColor, nightFogColor, nightFactor);
    }
  }

  private updateSkyColor(): void {
    if (!this.scene) return;

    const time = this.currentTime;
    const skyColor = this._scratchSkyColor;

    if (time >= 5 && time < 7) {
      // Dawn (5am - 7am): Pink-orange gradient
      const t = (time - 5) / 2;
      skyColor.lerpColors(this.skyColors.midnight, this.skyColors.dawn, t);
    } else if (time >= 7 && time < 17) {
      // Day (7am - 5pm): Bright blue
      const t = (time - 7) / 10;
      if (t < 0.5) {
        skyColor.lerpColors(this.skyColors.dawn, this.skyColors.noon, t * 2);
      } else {
        skyColor.lerpColors(this.skyColors.noon, this.skyColors.dawn, (t - 0.5) * 2);
      }
    } else if (time >= 17 && time < 19) {
      // Dusk (5pm - 7pm): Orange gradient
      const t = (time - 17) / 2;
      skyColor.lerpColors(this.skyColors.dusk, this.skyColors.midnight, t);
    } else {
      // Night: Dark blue-purple
      skyColor.copy(this.skyColors.midnight);
    }

    // Update scene background
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(skyColor);
    } else {
      this.scene.background = skyColor.clone();
    }
  }

  /**
   * Get night factor: 0.0 at noon, 1.0 at midnight
   * Smooth transition using cosine curve
   */
  getNightFactor(): number {
    const time = this.currentTime;
    // Midnight = 0, Noon = 12
    // Use cosine for smooth transition
    // Shift so midnight (0/24) = 1.0, noon (12) = 0.0
    const normalizedTime = time / 24;
    const factor = (Math.cos(normalizedTime * Math.PI * 2) + 1) / 2;
    return factor;
  }

  /**
   * Manually set time of day
   * @param hour Time in hours (0-24)
   */
  setTimeOfDay(hour: number): void {
    this.currentTime = hour % 24;
    Logger.info('environment', `Time set to ${hour.toFixed(1)}:00`);
  }

  /**
   * Get current time of day
   * @returns Time in hours (0-24)
   */
  getTimeOfDay(): number {
    return this.currentTime;
  }

  /**
   * Set time scale (speed multiplier)
   * @param scale 1.0 = normal (1 game hour = 60 real seconds), 0 = frozen, 10 = 10x speed
   */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
    Logger.info('environment', `Time scale set to ${scale}x`);
  }

  /**
   * Get current time scale
   */
  getTimeScale(): number {
    return this.timeScale;
  }

  /**
   * Lock to night mode (for night operations game mode)
   * @param enabled If true, locks time to nighttime
   */
  setNightMode(enabled: boolean): void {
    this.isNightModeLocked = enabled;
    if (enabled) {
      // Set to midnight
      this.setTimeOfDay(0);
      Logger.info('environment', 'Night mode ENABLED - time locked to midnight');
    } else {
      Logger.info('environment', 'Night mode DISABLED - time cycle resumed');
    }
  }

  /**
   * Check if night mode is active
   */
  isNightMode(): boolean {
    return this.isNightModeLocked;
  }

  /**
   * Get formatted time string (HH:MM format)
   */
  getFormattedTime(): string {
    const hours = Math.floor(this.currentTime);
    const minutes = Math.floor((this.currentTime - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Reset to initial state (for match restart)
   */
  reset(): void {
    this.currentTime = 12.0; // Reset to noon
    this.timeScale = 1.0;
    Logger.info('environment', 'Day-Night Cycle reset to noon');
  }

  dispose(): void {
    // Clean up if needed
  }
}
