import * as THREE from 'three';
import { Logger } from '../../utils/Logger';

export interface DamageIndicator {
  direction: number;
  intensity: number;
  timestamp: number;
  fadeTime: number;
}

export class PlayerHealthEffects {
  private damageIndicators: DamageIndicator[] = [];
  private damageOverlay: HTMLCanvasElement;
  private damageContext: CanvasRenderingContext2D;
  private cameraDirection: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
  private boundOnResize: (() => void) | null = null;

  // Audio for heartbeat effect
  private audioContext?: AudioContext;
  private heartbeatGain?: GainNode;
  private isPlayingHeartbeat = false;

  constructor() {
    this.damageOverlay = document.createElement('canvas');
    this.damageOverlay.className = 'damage-overlay';
    this.damageOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 150;
    `;

    this.damageContext = this.damageOverlay.getContext('2d')!;
    this.setupAudio();
  }

  private setupAudio(): void {
    try {
      this.audioContext = new AudioContext();
      this.heartbeatGain = this.audioContext.createGain();
      this.heartbeatGain.connect(this.audioContext.destination);
      this.heartbeatGain.gain.value = 0;
    } catch (_e) {
      Logger.warn('audio', 'Audio context not available for heartbeat effect');
    }
  }

  init(): void {
    document.body.appendChild(this.damageOverlay);
    this.resizeCanvas();
    this.boundOnResize = () => this.resizeCanvas();
    window.addEventListener('resize', this.boundOnResize);

    // Add damage flash animation styles
    const damageFlashStyle = document.createElement('style');
    damageFlashStyle.textContent = `
      @keyframes damageFlash {
        0% { filter: brightness(1); }
        50% { filter: brightness(1.5) saturate(0.5) hue-rotate(-10deg); }
        100% { filter: brightness(1); }
      }
    `;
    document.head.appendChild(damageFlashStyle);
  }

  private resizeCanvas(): void {
    this.damageOverlay.width = window.innerWidth;
    this.damageOverlay.height = window.innerHeight;
  }

  addDamageIndicator(
    amount: number,
    sourcePosition?: THREE.Vector3,
    playerPosition?: THREE.Vector3,
    cameraDirection?: THREE.Vector3
  ): void {
    if (sourcePosition && playerPosition && cameraDirection) {
      // Update camera direction
      this.cameraDirection.copy(cameraDirection);

      // Calculate direction from player to damage source
      const toSource = new THREE.Vector3()
        .subVectors(sourcePosition, playerPosition);
      toSource.y = 0; // Ignore vertical component
      toSource.normalize();

      // Get camera forward direction (ignore vertical)
      const cameraForward = cameraDirection.clone();
      cameraForward.y = 0;
      cameraForward.normalize();

      // Calculate angle relative to camera forward
      // Use atan2 to get the angle in the correct quadrant
      // Note: Negate the cross product to fix left/right reversal
      const angle = Math.atan2(
        -(toSource.x * cameraForward.z - toSource.z * cameraForward.x),
        toSource.x * cameraForward.x + toSource.z * cameraForward.z
      );

      this.damageIndicators.push({
        direction: angle,
        intensity: Math.min(1.0, amount / 50),
        timestamp: Date.now(),
        fadeTime: 2.0
      });
    }

    // Screen flash effect
    this.triggerDamageFlash();
  }

  private triggerDamageFlash(): void {
    document.body.style.animation = 'none';
    setTimeout(() => {
      document.body.style.animation = 'damageFlash 0.2s ease';
      setTimeout(() => {
        document.body.style.animation = 'none';
      }, 200);
    }, 10);
  }

  updateDamageIndicators(_deltaTime: number): void {
    // Remove expired indicators
    this.damageIndicators = this.damageIndicators.filter(indicator => {
      const age = (Date.now() - indicator.timestamp) / 1000;
      return age < indicator.fadeTime;
    });
  }

  renderDamageOverlay(health: number, _maxHealth: number): void {
    this.damageContext.clearRect(0, 0, this.damageOverlay.width, this.damageOverlay.height);

    // Render damage indicators as partial circle arcs
    this.damageIndicators.forEach(indicator => {
      const age = (Date.now() - indicator.timestamp) / 1000;
      const alpha = Math.max(0, (indicator.fadeTime - age) / indicator.fadeTime);

      this.damageContext.save();

      // Calculate opacity based on age and intensity
      const opacity = alpha * indicator.intensity * 0.8;
      this.damageContext.globalAlpha = opacity;

      // Setup indicator position and size
      const centerX = this.damageOverlay.width / 2;
      const centerY = this.damageOverlay.height / 2;
      const radius = Math.min(centerX, centerY) * 0.4; // Distance from center
      const arcWidth = 30; // Width of the arc indicator
      const arcSpread = Math.PI / 6; // 30 degrees spread (1/6 of a circle)

      // Calculate the angle for the indicator
      // Rotate by -90 degrees (PI/2) so 0 is up
      const angle = indicator.direction - Math.PI / 2;

      // Draw the partial circle arc
      const gradient = this.damageContext.createRadialGradient(
        centerX, centerY, radius - arcWidth,
        centerX, centerY, radius + arcWidth
      );
      gradient.addColorStop(0, 'rgba(255, 0, 0, 0)');
      gradient.addColorStop(0.5, 'rgba(255, 50, 50, 1)');
      gradient.addColorStop(1, 'rgba(200, 0, 0, 0.5)');

      this.damageContext.strokeStyle = gradient;
      this.damageContext.lineWidth = arcWidth;
      this.damageContext.lineCap = 'round';

      // Draw the arc
      this.damageContext.beginPath();
      this.damageContext.arc(
        centerX,
        centerY,
        radius,
        angle - arcSpread / 2,
        angle + arcSpread / 2,
        false
      );
      this.damageContext.stroke();

      // Add an inner glow for visibility
      this.damageContext.strokeStyle = `rgba(255, 100, 100, ${opacity * 0.5})`;
      this.damageContext.lineWidth = arcWidth * 0.6;
      this.damageContext.beginPath();
      this.damageContext.arc(
        centerX,
        centerY,
        radius,
        angle - arcSpread / 2,
        angle + arcSpread / 2,
        false
      );
      this.damageContext.stroke();

      this.damageContext.restore();
    });

    // Red screen edge effect when low health
    if (health < 30) {
      const intensity = (30 - health) / 30;
      this.damageContext.save();
      this.damageContext.globalAlpha = intensity * 0.3;

      // Draw red vignette
      const gradient = this.damageContext.createRadialGradient(
        this.damageOverlay.width / 2,
        this.damageOverlay.height / 2,
        0,
        this.damageOverlay.width / 2,
        this.damageOverlay.height / 2,
        Math.max(this.damageOverlay.width, this.damageOverlay.height) / 2
      );
      gradient.addColorStop(0, 'rgba(255, 0, 0, 0)');
      gradient.addColorStop(1, 'rgba(255, 0, 0, 1)');

      this.damageContext.fillStyle = gradient;
      this.damageContext.fillRect(0, 0, this.damageOverlay.width, this.damageOverlay.height);
      this.damageContext.restore();
    }
  }

  startHeartbeat(): void {
    if (!this.audioContext || this.isPlayingHeartbeat) return;

    this.isPlayingHeartbeat = true;
    const playHeartbeat = () => {
      if (!this.isPlayingHeartbeat || !this.audioContext || !this.heartbeatGain) return;

      // Create heartbeat sound using oscillator
      const osc = this.audioContext.createOscillator();
      const envelope = this.audioContext.createGain();

      osc.connect(envelope);
      envelope.connect(this.heartbeatGain);

      osc.frequency.setValueAtTime(80, this.audioContext.currentTime);
      osc.type = 'sine';

      envelope.gain.setValueAtTime(0, this.audioContext.currentTime);
      envelope.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.05);
      envelope.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

      osc.start(this.audioContext.currentTime);
      osc.stop(this.audioContext.currentTime + 0.3);

      // Schedule next heartbeat
      setTimeout(playHeartbeat, 800);
    };

    playHeartbeat();
  }

  stopHeartbeat(): void {
    this.isPlayingHeartbeat = false;
  }

  clearDamageIndicators(): void {
    this.damageIndicators = [];
  }

  dispose(): void {
    this.stopHeartbeat();
    if (this.boundOnResize) {
      window.removeEventListener('resize', this.boundOnResize);
      this.boundOnResize = null;
    }
    if (this.damageOverlay.parentNode) {
      this.damageOverlay.parentNode.removeChild(this.damageOverlay);
    }
  }
}
