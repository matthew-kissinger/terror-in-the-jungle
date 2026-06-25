// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type EventKey<EventMap> = Extract<keyof EventMap, string>;
export type EventCallback<Payload> = (event: Payload) => void;
export type EventUnsubscribe = () => void;

export interface EventBusOptions<EventMap extends Record<string, unknown>> {
  maxQueuedEvents?: number;
  onListenerError?: <K extends EventKey<EventMap>>(error: unknown, eventType: K, payload: EventMap[K]) => void;
}

export interface EventBus<EventMap extends Record<string, unknown>> {
  subscribe<K extends EventKey<EventMap>>(type: K, callback: EventCallback<EventMap[K]>): EventUnsubscribe;
  emit<K extends EventKey<EventMap>>(type: K, payload: EventMap[K]): void;
  flush(): void;
  clear(): void;
  getPendingCount(): number;
  getListenerCount<K extends EventKey<EventMap>>(type?: K): number;
}

interface QueuedEvent<EventMap extends Record<string, unknown>, K extends EventKey<EventMap> = EventKey<EventMap>> {
  type: K;
  payload: EventMap[K];
}

export function createEventBus<EventMap extends Record<string, unknown>>(
  options: EventBusOptions<EventMap> = {},
): EventBus<EventMap> {
  const listeners = new Map<EventKey<EventMap>, EventCallback<EventMap[EventKey<EventMap>]>[]>();
  let queue: QueuedEvent<EventMap>[] = [];

  function subscribe<K extends EventKey<EventMap>>(
    type: K,
    callback: EventCallback<EventMap[K]>,
  ): EventUnsubscribe {
    const typedCallback = callback as EventCallback<EventMap[EventKey<EventMap>]>;
    const list = listeners.get(type) ?? [];
    list.push(typedCallback);
    listeners.set(type, list);

    return () => {
      const current = listeners.get(type);
      if (!current) {
        return;
      }
      const index = current.indexOf(typedCallback);
      if (index >= 0) {
        current.splice(index, 1);
      }
      if (current.length === 0) {
        listeners.delete(type);
      }
    };
  }

  function emit<K extends EventKey<EventMap>>(type: K, payload: EventMap[K]): void {
    if (options.maxQueuedEvents !== undefined && queue.length >= options.maxQueuedEvents) {
      throw new Error(`Event bus queue exceeded maxQueuedEvents=${options.maxQueuedEvents}`);
    }
    queue.push({ type, payload } as QueuedEvent<EventMap>);
  }

  function flush(): void {
    if (queue.length === 0) {
      return;
    }

    const batch = queue;
    queue = [];

    for (const event of batch) {
      const list = listeners.get(event.type);
      if (!list) {
        continue;
      }

      for (const callback of [...list]) {
        try {
          callback(event.payload);
        } catch (error) {
          if (options.onListenerError) {
            options.onListenerError(error, event.type, event.payload);
          } else {
            throw error;
          }
        }
      }
    }
  }

  return {
    subscribe,
    emit,
    flush,
    clear: () => {
      listeners.clear();
      queue = [];
    },
    getPendingCount: () => queue.length,
    getListenerCount: (type) => {
      if (type) {
        return listeners.get(type)?.length ?? 0;
      }
      let count = 0;
      for (const list of listeners.values()) {
        count += list.length;
      }
      return count;
    },
  };
}