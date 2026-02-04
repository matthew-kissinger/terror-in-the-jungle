import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';

export interface RadioTransmission {
  filename: string;
  buffer?: AudioBuffer;
  lastPlayed?: number;
}

export class RadioTransmissionSystem implements GameSystem {
  private audioListener?: THREE.AudioListener;
  private audioLoader = new THREE.AudioLoader();
  private transmissions: RadioTransmission[] = [];

  // Timing controls
  private minInterval = 30000; // 30 seconds minimum between transmissions
  private maxInterval = 120000; // 2 minutes maximum between transmissions
  private lastTransmissionTime = 0;
  private nextTransmissionTime = 0;

  // Audio controls
  private currentAudio?: THREE.Audio;
  private baseVolume = 0.4; // Base volume for transmissions
  private isEnabled = true;

  constructor() {
    this.scheduleNextTransmission();
  }

  async init(): Promise<void> {
    Logger.info('radio', '📻 Initializing Radio Transmission System...');

    // Discover all transmission files
    await this.discoverTransmissions();

    // Load transmission audio files
    await this.loadTransmissions();

    Logger.info('radio', `📻 Radio Transmission System initialized with ${this.transmissions.length} transmissions`);
  }

  setAudioListener(listener: THREE.AudioListener): void {
    this.audioListener = listener;
  }

  private async discoverTransmissions(): Promise<void> {
    // List of transmission files (from compressed audio)
    const transmissionFiles = [
      'Ghostly_AM_transmiss-1758412869898.ogg',
      'Ghostly_AM_transmiss-1758412899150.ogg',
      'Ghostly_AM_transmiss-1758412906034.ogg',
      'Ghostly_AM_transmiss-#1-1758412910164.ogg',
      'Ghostly_AM_transmiss-#2-1758412922184.ogg',
      'Ghostly_AM_transmiss-#3-1758412924602.ogg',
      'Ghostly_AM_transmiss-1758412930192.ogg',
      'Ghostly_AM_transmiss-#1-1758412939997.ogg',
      'Ghostly_AM_transmiss-#2-1758412942235.ogg',
      'Ghostly_AM_transmiss-#3-1758412951987.ogg'
    ];

    this.transmissions = transmissionFiles.map(filename => ({
      filename,
      lastPlayed: 0
    }));
  }

  private async loadTransmissions(): Promise<void> {
    const loadPromises = this.transmissions.map(transmission => {
      return new Promise<void>((resolve, reject) => {
        this.audioLoader.load(
          `${import.meta.env.BASE_URL}assets/transmissions/${transmission.filename}`,
          (buffer) => {
            transmission.buffer = buffer;
            Logger.info('radio', `📻 Loaded transmission: ${transmission.filename}`);
            resolve();
          },
          undefined,
          (error) => {
            Logger.warn('radio', `📻 Failed to load transmission ${transmission.filename}:`, error);
            resolve(); // Don't fail the entire system for one file
          }
        );
      });
    });

    await Promise.all(loadPromises);

    const loadedCount = this.transmissions.filter(t => t.buffer).length;
    Logger.info('radio', `📻 Successfully loaded ${loadedCount}/${this.transmissions.length} transmissions`);
  }

  private scheduleNextTransmission(): void {
    const randomDelay = Math.random() * (this.maxInterval - this.minInterval) + this.minInterval;
    this.nextTransmissionTime = Date.now() + randomDelay;

    Logger.info('radio', `📻 Next transmission scheduled in ${(randomDelay / 1000).toFixed(1)} seconds`);
  }

  private selectRandomTransmission(): RadioTransmission | null {
    const availableTransmissions = this.transmissions.filter(t =>
      t.buffer && (!t.lastPlayed || Date.now() - t.lastPlayed > 60000) // Don't repeat same transmission within 1 minute
    );

    if (availableTransmissions.length === 0) {
      // If all have been played recently, reset and use any
      Logger.info('radio', '📻 All transmissions played recently, resetting cooldowns');
      return this.transmissions.find(t => t.buffer) || null;
    }

    const randomIndex = Math.floor(Math.random() * availableTransmissions.length);
    return availableTransmissions[randomIndex];
  }

  private playTransmission(transmission: RadioTransmission): void {
    if (!this.audioListener || !transmission.buffer) {
      Logger.warn('radio', '📻 Cannot play transmission - missing audio listener or buffer');
      return;
    }

    // Stop any currently playing transmission
    if (this.currentAudio && this.currentAudio.isPlaying) {
      this.currentAudio.stop();
    }

    // Create new audio instance
    this.currentAudio = new THREE.Audio(this.audioListener);
    this.currentAudio.setBuffer(transmission.buffer);
    this.currentAudio.setVolume(this.baseVolume);
    this.currentAudio.setLoop(false);

    // Play the transmission
    this.currentAudio.play();

    // Update tracking
    transmission.lastPlayed = Date.now();
    this.lastTransmissionTime = Date.now();

    Logger.info('radio', `📻 Playing transmission: ${transmission.filename} at volume ${this.currentAudio.getVolume().toFixed(2)}`);

    // Clean up when finished
    this.currentAudio.onEnded = () => {
      Logger.info('radio', `📻 Transmission ended: ${transmission.filename}`);
      this.scheduleNextTransmission();
    };
  }

  update(deltaTime: number): void {
    if (!this.isEnabled || !this.audioListener) {
      return;
    }

    // Check if it's time for next transmission
    if (Date.now() >= this.nextTransmissionTime) {
      const transmission = this.selectRandomTransmission();

      if (transmission) {
        this.playTransmission(transmission);
      } else {
        Logger.warn('radio', '📻 No transmissions available to play');
        this.scheduleNextTransmission(); // Try again later
      }
    }
  }

  // Manual transmission trigger (for testing or special events)
  playRandomTransmission(): void {
    const transmission = this.selectRandomTransmission();
    if (transmission) {
      this.playTransmission(transmission);
    }
  }

  // Control methods
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    Logger.info('radio', `📻 Radio transmissions ${enabled ? 'enabled' : 'disabled'}`);

    if (!enabled && this.currentAudio && this.currentAudio.isPlaying) {
      this.currentAudio.stop();
      Logger.info('radio', '📻 Stopped current transmission due to disable');
    }
  }

  setVolume(volume: number): void {
    this.baseVolume = Math.max(0, Math.min(1, volume));

    if (this.currentAudio) {
      this.currentAudio.setVolume(this.baseVolume);
    }
  }

  setTransmissionInterval(minSeconds: number, maxSeconds: number): void {
    this.minInterval = minSeconds * 1000;
    this.maxInterval = maxSeconds * 1000;
    Logger.info('radio', `📻 Transmission interval set to ${minSeconds}-${maxSeconds} seconds`);
  }

  // Get status info
  getStatus(): { enabled: boolean; nextTransmissionIn: number; transmissionsLoaded: number } {
    return {
      enabled: this.isEnabled,
      nextTransmissionIn: Math.max(0, this.nextTransmissionTime - Date.now()),
      transmissionsLoaded: this.transmissions.filter(t => t.buffer).length
    };
  }

  dispose(): void {
    if (this.currentAudio && this.currentAudio.isPlaying) {
      this.currentAudio.stop();
    }

    this.transmissions = [];
    this.currentAudio = undefined;

    Logger.info('radio', '🧹 RadioTransmissionSystem disposed');
  }
}
