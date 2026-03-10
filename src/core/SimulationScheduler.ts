type SimulationGroupId =
  | 'tactical_ui'
  | 'war_sim'
  | 'air_support'
  | 'world_state'
  | 'ashau_assist';

interface SimulationGroupConfig {
  id: SimulationGroupId;
  intervalSeconds: number;
}

const DEFAULT_GROUPS: SimulationGroupConfig[] = [
  { id: 'tactical_ui', intervalSeconds: 1 / 20 },
  { id: 'war_sim', intervalSeconds: 1 / 10 },
  // Air support still contains movement-coupled systems, so keep it every frame for now.
  { id: 'air_support', intervalSeconds: 0 },
  { id: 'world_state', intervalSeconds: 1 / 15 },
  { id: 'ashau_assist', intervalSeconds: 1.0 },
];

export class SimulationScheduler {
  private readonly groups = new Map<SimulationGroupId, SimulationGroupConfig>();
  private readonly accumulators = new Map<SimulationGroupId, number>();

  constructor(groups: SimulationGroupConfig[] = DEFAULT_GROUPS) {
    for (const group of groups) {
      this.groups.set(group.id, group);
      this.accumulators.set(group.id, 0);
    }
  }

  consume(groupId: SimulationGroupId, deltaTime: number): number | null {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Unknown simulation group: ${groupId}`);
    }

    if (group.intervalSeconds <= 0) {
      return deltaTime;
    }

    const nextDelta = (this.accumulators.get(groupId) ?? 0) + deltaTime;
    if (nextDelta < group.intervalSeconds) {
      this.accumulators.set(groupId, nextDelta);
      return null;
    }

    this.accumulators.set(groupId, 0);
    return nextDelta;
  }

  reset(groupId?: SimulationGroupId): void {
    if (groupId) {
      this.accumulators.set(groupId, 0);
      return;
    }

    for (const key of this.accumulators.keys()) {
      this.accumulators.set(key, 0);
    }
  }
}
