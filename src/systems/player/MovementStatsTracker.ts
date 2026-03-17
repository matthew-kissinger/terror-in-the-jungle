interface LocalAreaTracker {
  originX: number;
  originZ: number;
  dwellMs: number;
  maxRadiusSq: number;
  pinned: boolean;
}

export interface PlayerMovementSummary {
  distanceMeters: number;
  climbSeconds: number;
  pinnedSeconds: number;
  pinnedEvents: number;
  terrainRedirects: number;
  slideSeconds: number;
}

const PLAYER_PIN_RADIUS_SQ = 1.44;
const PLAYER_PIN_RELEASE_RADIUS_SQ = 4.0;
const PINNED_AREA_EVENT_MS = 1200;

export class MovementStatsTracker {
  private static instance: MovementStatsTracker | null = null;

  private summary: PlayerMovementSummary = this.createEmptySummary();
  private playerAreaTracker: LocalAreaTracker | null = null;
  private terrainRedirectActive = false;

  static getInstance(): MovementStatsTracker {
    if (!MovementStatsTracker.instance) {
      MovementStatsTracker.instance = new MovementStatsTracker();
    }
    return MovementStatsTracker.instance;
  }

  startMatch(): void {
    this.summary = this.createEmptySummary();
    this.playerAreaTracker = null;
    this.terrainRedirectActive = false;
  }

  reset(): void {
    this.startMatch();
  }

  recordPlayerSample(
    grounded: boolean,
    requestedSpeed: number,
    actualSpeed: number,
    grade: number,
    sliding: boolean,
    terrainRedirected: boolean,
    deltaTime: number,
    positionX: number,
    positionZ: number,
  ): void {
    if (grounded && actualSpeed > 0.05) {
      this.summary.distanceMeters += actualSpeed * deltaTime;
    }
    if (grounded && actualSpeed > 0.2 && grade > 0.02) {
      this.summary.climbSeconds += deltaTime;
    }
    if (sliding) {
      this.summary.slideSeconds += deltaTime;
    }

    if (terrainRedirected) {
      if (!this.terrainRedirectActive) {
        this.summary.terrainRedirects++;
      }
      this.terrainRedirectActive = true;
    } else {
      this.terrainRedirectActive = false;
    }

    const wantsMovement = requestedSpeed > 0.1;
    this.playerAreaTracker = this.updateLocalAreaTracker(
      this.playerAreaTracker,
      deltaTime,
      positionX,
      positionZ,
      wantsMovement,
    );
  }

  getPlayerSummary(): PlayerMovementSummary {
    const summary = { ...this.summary };
    if (this.playerAreaTracker?.pinned) {
      summary.pinnedSeconds += this.playerAreaTracker.dwellMs / 1000;
    }
    summary.distanceMeters = round(summary.distanceMeters, 1);
    summary.climbSeconds = round(summary.climbSeconds, 1);
    summary.pinnedSeconds = round(summary.pinnedSeconds, 1);
    summary.slideSeconds = round(summary.slideSeconds, 1);
    return summary;
  }

  private createEmptySummary(): PlayerMovementSummary {
    return {
      distanceMeters: 0,
      climbSeconds: 0,
      pinnedSeconds: 0,
      pinnedEvents: 0,
      terrainRedirects: 0,
      slideSeconds: 0,
    };
  }

  private updateLocalAreaTracker(
    existing: LocalAreaTracker | null,
    deltaTime: number,
    x: number,
    z: number,
    wantsMovement: boolean,
  ): LocalAreaTracker | null {
    if (!wantsMovement) {
      if (existing?.pinned) {
        this.summary.pinnedSeconds += existing.dwellMs / 1000;
      }
      return null;
    }

    let tracker = existing;
    if (!tracker) {
      tracker = {
        originX: x,
        originZ: z,
        dwellMs: 0,
        maxRadiusSq: 0,
        pinned: false,
      };
    }

    const dx = x - tracker.originX;
    const dz = z - tracker.originZ;
    const radiusSq = dx * dx + dz * dz;
    tracker.maxRadiusSq = Math.max(tracker.maxRadiusSq, radiusSq);

    if (radiusSq <= PLAYER_PIN_RADIUS_SQ) {
      tracker.dwellMs += deltaTime * 1000;
      if (!tracker.pinned && tracker.dwellMs >= PINNED_AREA_EVENT_MS) {
        tracker.pinned = true;
        this.summary.pinnedEvents++;
      }
      return tracker;
    }

    if (radiusSq <= PLAYER_PIN_RELEASE_RADIUS_SQ && tracker.pinned) {
      tracker.dwellMs += deltaTime * 1000;
      return tracker;
    }

    if (tracker.pinned) {
      this.summary.pinnedSeconds += tracker.dwellMs / 1000;
    }

    return {
      originX: x,
      originZ: z,
      dwellMs: 0,
      maxRadiusSq: 0,
      pinned: false,
    };
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export const movementStatsTracker = MovementStatsTracker.getInstance();
