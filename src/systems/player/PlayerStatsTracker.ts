export interface PlayerStats {
  kills: number;
  deaths: number;
  zonesCaptured: number;
  matchStartTime: number;
}

export class PlayerStatsTracker {
  private stats: PlayerStats = {
    kills: 0,
    deaths: 0,
    zonesCaptured: 0,
    matchStartTime: 0
  };

  startMatch(): void {
    this.stats = {
      kills: 0,
      deaths: 0,
      zonesCaptured: 0,
      matchStartTime: Date.now()
    };
    console.log('📊 Match stats tracking started');
  }

  addKill(): void {
    this.stats.kills++;
  }

  addDeath(): void {
    this.stats.deaths++;
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
      matchStartTime: 0
    };
  }
}
