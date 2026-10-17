import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { guardUnload } from './current.ts';

describe('guardUnload', () => {
  it('listens for beforeunload only while something is unsaved, and asks then', () => {
    const listening = new Set<(event: Event) => void>();
    const target = {
      addEventListener: (_: 'beforeunload', listener: (event: Event) => void) => void listening.add(listener),
      removeEventListener: (_: 'beforeunload', listener: (event: Event) => void) => void listening.delete(listener),
    };
    const unsaved = signal(false);
    let flushed = 0;
    const stop = guardUnload(target, unsaved, () => flushed++);
    expect(listening.size).toBe(0);
    unsaved.value = true;
    expect(listening.size).toBe(1);
    const event = new Event('beforeunload', { cancelable: true });
    for (const listener of listening) listener(event);
    expect(event.defaultPrevented).toBe(true);
    expect(flushed).toBe(1);
    unsaved.value = false;
    expect(listening.size).toBe(0);
    unsaved.value = true;
    stop();
    expect(listening.size).toBe(0);
  });
});
