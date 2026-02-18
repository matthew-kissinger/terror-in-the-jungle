import { WarEvent } from './types';

export type WarEventListener = (events: WarEvent[]) => void;

/**
 * Simple pub/sub for war events. The WarSimulator emits batches of events
 * each update tick, and the StrategicFeedback system subscribes to them.
 */
export class WarEventEmitter {
  private listeners: WarEventListener[] = [];
  private pendingEvents: WarEvent[] = [];

  subscribe(listener: WarEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  emit(event: WarEvent): void {
    this.pendingEvents.push(event);
  }

  flush(): void {
    if (this.pendingEvents.length === 0) return;
    const batch = this.pendingEvents;
    this.pendingEvents = [];
    for (const listener of this.listeners) {
      listener(batch);
    }
  }

  clear(): void {
    this.listeners.length = 0;
    this.pendingEvents.length = 0;
  }
}
