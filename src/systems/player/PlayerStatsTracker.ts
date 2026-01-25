export interface PlayerStats {
  kills: number;
  deaths: number;
  zonesCaptured: number;
  matchStartTime: number;
  currentKillStreak: number;
  bestKillStreak: number;
}

export class PlayerStatsTracker {
  private stats: PlayerStats = {
    kills: 0,
    deaths: 0,
    zonesCaptured: 0,
    matchStartTime: 0,
    currentKillStreak: 0,
    bestKillStreak: 0
  };

  startMatch(): void {
    this.stats = {
      kills: 0,
      deaths: 0,
      zonesCaptured: 0,
      matchStartTime: Date.now(),
      currentKillStreak: 0,
      bestKillStreak: 0
    };
    console.log('📊 Match stats tracking started');
  }

  addKill(): void {
    this.stats.kills++;
    this.stats.currentKillStreak++;

    // Update best kill streak
    if (this.stats.currentKillStreak > this.stats.bestKillStreak) {
      this.stats.bestKillStreak = this.stats.currentKillStreak;
    }
  }

  addDeath(): void {
    this.stats.deaths++;
    this.stats.currentKillStreak = 0; // Reset kill streak on death
  }

  getKillStreakMultiplier(): number {
    const streak = this.stats.currentKillStreak;
    if (streak >= 3) {
      return 2.0; // 3+ kills = 2x multiplier
    } else if (streak >= 2) {
      return 1.5; // 2 kills = 1.5x multiplier
    }
    return 1.0; // No multiplier
  }

  addZoneCapture(): void {
    this.stats.zonesCaptured++;
  }

  getStats(): PlayerStats {
    return { ...this.stats };
  }

  getMatchDuration(): number {
    if (this.stats.matchStartTime === 0) return 0;
    return (Date.now() - this.stats.matchStartTime) / 1000;
  }

  reset(): void {
    this.stats = {
      kills: 0,
      deaths: 0,
      zonesCaptured: 0,
      matchStartTime: 0,
      currentKillStreak: 0,
      bestKillStreak: 0
    };
  }
}
