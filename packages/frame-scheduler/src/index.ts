// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export interface FrameGroupConfig<GroupId extends string> {
  id: GroupId;
  intervalSeconds: number;
  maxDeltaSeconds?: number;
}

export interface FrameScheduler<GroupId extends string> {
  consume(groupId: GroupId, deltaSeconds: number): number | null;
  reset(groupId?: GroupId): void;
  getAccumulator(groupId: GroupId): number;
  getGroups(): FrameGroupConfig<GroupId>[];
}

export function createFrameScheduler<GroupId extends string>(
  groups: readonly FrameGroupConfig<GroupId>[],
): FrameScheduler<GroupId> {
  const groupMap = new Map<GroupId, FrameGroupConfig<GroupId>>();
  const accumulators = new Map<GroupId, number>();

  for (const group of groups) {
    if (group.intervalSeconds < 0) {
      throw new Error(`Frame group ${group.id} has negative intervalSeconds`);
    }
    groupMap.set(group.id, { ...group });
    accumulators.set(group.id, 0);
  }

  function requireGroup(groupId: GroupId): FrameGroupConfig<GroupId> {
    const group = groupMap.get(groupId);
    if (!group) {
      throw new Error(`Unknown frame scheduler group: ${groupId}`);
    }
    return group;
  }

  return {
    consume(groupId, deltaSeconds) {
      const group = requireGroup(groupId);
      const clampedDelta = group.maxDeltaSeconds === undefined
        ? deltaSeconds
        : Math.min(deltaSeconds, group.maxDeltaSeconds);

      if (group.intervalSeconds <= 0) {
        return clampedDelta;
      }

      const nextDelta = (accumulators.get(groupId) ?? 0) + clampedDelta;
      if (nextDelta < group.intervalSeconds) {
        accumulators.set(groupId, nextDelta);
        return null;
      }

      accumulators.set(groupId, 0);
      return nextDelta;
    },
    reset(groupId) {
      if (groupId !== undefined) {
        requireGroup(groupId);
        accumulators.set(groupId, 0);
        return;
      }

      for (const key of accumulators.keys()) {
        accumulators.set(key, 0);
      }
    },
    getAccumulator(groupId) {
      requireGroup(groupId);
      return accumulators.get(groupId) ?? 0;
    },
    getGroups() {
      return [...groupMap.values()].map((group) => ({ ...group }));
    },
  };
}

export class FrameSchedulerController<GroupId extends string> implements FrameScheduler<GroupId> {
  private readonly scheduler: FrameScheduler<GroupId>;

  constructor(groups: readonly FrameGroupConfig<GroupId>[]) {
    this.scheduler = createFrameScheduler(groups);
  }

  consume(groupId: GroupId, deltaSeconds: number): number | null {
    return this.scheduler.consume(groupId, deltaSeconds);
  }

  reset(groupId?: GroupId): void {
    this.scheduler.reset(groupId);
  }

  getAccumulator(groupId: GroupId): number {
    return this.scheduler.getAccumulator(groupId);
  }

  getGroups(): FrameGroupConfig<GroupId>[] {
    return this.scheduler.getGroups();
  }
}