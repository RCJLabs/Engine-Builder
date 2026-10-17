import { describe, expect, it } from 'vitest';
import { fakeLocks } from '../../test/fake-locks.ts';
import { takeLock } from './projectLock.ts';

const NAME = 'eb-editor:project:salvage-run';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('takeLock', () => {
  it('takes a free lock and holds it until released', async () => {
    const locks = fakeLocks();
    const held = await takeLock(locks, NAME, { ifAvailable: true });
    expect(held?.name).toBe(NAME);
    expect(locks.held(NAME)).toBe(true);
    held?.release();
    await tick();
    expect(locks.held(NAME)).toBe(false);
  });

  it('gives null at once when another tab holds it and only a free lock will do', async () => {
    const locks = fakeLocks();
    await takeLock(locks, NAME);
    expect(await takeLock(locks, NAME, { ifAvailable: true })).toBeNull();
  });

  it('waits its turn, and gets the lock once the holder lets go', async () => {
    const locks = fakeLocks();
    const first = await takeLock(locks, NAME);
    let second: Awaited<ReturnType<typeof takeLock>> | undefined;
    void takeLock(locks, NAME).then((held) => {
      second = held;
    });
    await tick();
    expect(second).toBeUndefined();
    first?.release();
    await tick();
    expect(second?.name).toBe(NAME);
  });

  it('tells the holder it lost the lock when another tab steals it', async () => {
    const locks = fakeLocks();
    const first = await takeLock(locks, NAME);
    let lost = false;
    void first?.lost.then(() => {
      lost = true;
    });
    const thief = await takeLock(locks, NAME, { steal: true });
    await tick();
    expect(lost).toBe(true);
    expect(thief?.name).toBe(NAME);
  });

  it('rejects when waiting is given up', async () => {
    const locks = fakeLocks();
    await takeLock(locks, NAME);
    const stop = new AbortController();
    const waiting = takeLock(locks, NAME, { signal: stop.signal });
    stop.abort();
    await expect(waiting).rejects.toThrow('Gave up waiting.');
  });
});
