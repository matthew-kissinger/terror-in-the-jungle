import { describe, expect, it } from 'vitest';
import { WarEventEmitter } from './WarEventEmitter';
import { WarEvent } from './types';
import { Faction } from '../combat/types';

function captured(zoneId: string): WarEvent {
  return { type: 'zone_captured', zoneId, zoneName: zoneId, faction: Faction.US, timestamp: 0 };
}

describe('WarEventEmitter pub/sub', () => {
  it('delivers emitted events to a subscriber only after flush', () => {
    const emitter = new WarEventEmitter();
    const received: WarEvent[][] = [];
    emitter.subscribe((batch) => received.push(batch));

    emitter.emit(captured('a'));
    emitter.emit(captured('b'));

    // Buffered until flush.
    expect(received).toHaveLength(0);

    emitter.flush();

    expect(received).toHaveLength(1);
    expect(received[0].map((e) => (e as any).zoneId)).toEqual(['a', 'b']);
  });

  it('delivers each batch to every subscriber', () => {
    const emitter = new WarEventEmitter();
    const a: WarEvent[] = [];
    const b: WarEvent[] = [];
    emitter.subscribe((batch) => a.push(...batch));
    emitter.subscribe((batch) => b.push(...batch));

    emitter.emit(captured('x'));
    emitter.flush();

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('clears pending events on flush so the next flush is empty', () => {
    const emitter = new WarEventEmitter();
    let flushCalls = 0;
    emitter.subscribe(() => flushCalls++);

    emitter.emit(captured('x'));
    emitter.flush();
    emitter.flush(); // nothing pending

    expect(flushCalls).toBe(1);
  });

  it('does not invoke listeners when there is nothing pending', () => {
    const emitter = new WarEventEmitter();
    let called = false;
    emitter.subscribe(() => {
      called = true;
    });

    emitter.flush();

    expect(called).toBe(false);
  });

  it('stops delivering to a listener after its unsubscribe handle is called', () => {
    const emitter = new WarEventEmitter();
    const received: WarEvent[] = [];
    const unsubscribe = emitter.subscribe((batch) => received.push(...batch));

    emitter.emit(captured('first'));
    emitter.flush();
    expect(received).toHaveLength(1);

    unsubscribe();
    emitter.emit(captured('second'));
    emitter.flush();

    // No further delivery after unsubscribe.
    expect(received).toHaveLength(1);
  });

  it('keeps other listeners active when one unsubscribes', () => {
    const emitter = new WarEventEmitter();
    const kept: WarEvent[] = [];
    const dropped: WarEvent[] = [];
    const unsubscribe = emitter.subscribe((batch) => dropped.push(...batch));
    emitter.subscribe((batch) => kept.push(...batch));

    unsubscribe();
    emitter.emit(captured('only'));
    emitter.flush();

    expect(dropped).toHaveLength(0);
    expect(kept).toHaveLength(1);
  });

  it('clear() drops both pending events and listeners', () => {
    const emitter = new WarEventEmitter();
    let called = false;
    emitter.subscribe(() => {
      called = true;
    });

    emitter.emit(captured('pending'));
    emitter.clear();
    emitter.flush();

    expect(called).toBe(false);
  });
});
