export interface SoundConfig {
  path: string;
  volume?: number;
  loop?: boolean;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
}

export const AUDIO_POOL_SIZES = {
  gunshot: 20,
  death: 10,
  explosion: 8
} as const;

export const SOUND_CONFIGS: Record<string, SoundConfig> = {
  playerGunshot: {
    path: 'assets/optimized/playerGunshot.wav',
    volume: 0.7
  },
  playerShotgun: {
    path: 'assets/optimized/playerShotgun.wav',
    volume: 0.85
  },
  otherGunshot: {
    path: 'assets/optimized/otherGunshot.wav',
    volume: 0.6,
    refDistance: 10,
    maxDistance: 100,
    rolloffFactor: 1.5
  },
  allyDeath: {
    path: 'assets/optimized/AllyDeath.wav',
    volume: 0.8,
    refDistance: 5,
    maxDistance: 50,
    rolloffFactor: 2
  },
  enemyDeath: {
    path: 'assets/optimized/EnemyDeath.wav',
    volume: 0.8,
    refDistance: 5,
    maxDistance: 50,
    rolloffFactor: 2
  },
  jungle1: {
    path: 'assets/optimized/jungle1.ogg',
    volume: 0.3,
    loop: true
  },
  jungle2: {
    path: 'assets/optimized/jungle2.ogg',
    volume: 0.25,
    loop: true
  },
  playerReload: {
    path: 'assets/optimized/playerReload.ogg',
    volume: 0.6
  },
  grenadeExplosion: {
    path: 'assets/optimized/grenadeExplosion.wav',
    volume: 0.9,
    refDistance: 15,
    maxDistance: 150,
    rolloffFactor: 1.5
  }
};
