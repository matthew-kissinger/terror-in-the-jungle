import { FrameSchedulerController } from '@game-field-kits/frame-scheduler';

export type SimulationGroupId =
  | 'tactical_ui'
  | 'war_sim'
  | 'air_support'
  | 'world_state'
  | 'mode_runtime';

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
  { id: 'mode_runtime', intervalSeconds: 1.0 },
];

export class SimulationScheduler {
  private readonly scheduler: FrameSchedulerController<SimulationGroupId>;

  constructor(groups: SimulationGroupConfig[] = DEFAULT_GROUPS) {
    this.scheduler = new FrameSchedulerController(groups);
  }

  consume(groupId: SimulationGroupId, deltaTime: number): number | null {
    return this.scheduler.consume(groupId, deltaTime);
  }

  reset(groupId?: SimulationGroupId): void {
    this.scheduler.reset(groupId);
  }
}

