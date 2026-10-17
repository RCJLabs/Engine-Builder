import { describe, expect, it, vi } from 'vitest';
import { type ApplyDeps, applyUpdate, HANDOVER_MS } from './applyUpdate.ts';
import { DEFER_MS, deferralActive, shouldCheckForUpdate, UPDATE_CHECK_MS, updateVisible } from './updateGate.ts';

describe('update gate', () => {
  it('offers an update only when one is ready and nothing would be lost', () => {
    expect(updateVisible({ ready: true, busy: false, deferred: false })).toBe(true);
    expect(updateVisible({ ready: false, busy: false, deferred: false })).toBe(false);
    expect(updateVisible({ ready: true, busy: true, deferred: false })).toBe(false);
    expect(updateVisible({ ready: true, busy: false, deferred: true })).toBe(false);
  });

  it('checks when visible and due, never in the background', () => {
    expect(shouldCheckForUpdate({ visible: true, lastCheckedAt: null, now: 0 })).toBe(true);
    expect(shouldCheckForUpdate({ visible: true, lastCheckedAt: 0, now: UPDATE_CHECK_MS - 1 })).toBe(false);
    expect(shouldCheckForUpdate({ visible: true, lastCheckedAt: 0, now: UPDATE_CHECK_MS })).toBe(true);
    expect(shouldCheckForUpdate({ visible: false, lastCheckedAt: null, now: 0 })).toBe(false);
  });

  it('lets a deferral run out after a day', () => {
    expect(deferralActive(null, 0)).toBe(false);
    expect(deferralActive(0, DEFER_MS - 1)).toBe(true);
    expect(deferralActive(0, DEFER_MS)).toBe(false);
  });
});

type FakeWorker = { state: string; listeners: (() => void)[]; addEventListener: (t: string, fn: () => void) => void };
const fakeWorker = (state: string): FakeWorker => {
  const w: FakeWorker = { state, listeners: [], addEventListener: (_t, fn) => w.listeners.push(fn) };
  return w;
};

function harness(opts: { controlled: boolean; waiting?: FakeWorker }) {
  const reload = vi.fn();
  const timers: { fn: () => void; ms: number }[] = [];
  const deps: ApplyDeps = {
    registration: async () => ({ waiting: opts.waiting ?? null }) as unknown as ServiceWorkerRegistration,
    controlled: () => opts.controlled,
    reload,
    after: (fn, ms) => {
      timers.push({ fn, ms });
    },
  };
  return { deps, reload, timers };
}

describe('applyUpdate', () => {
  it('leaves the reload to workbox when the page is controlled', async () => {
    const { deps, reload, timers } = harness({ controlled: true });
    const skip = vi.fn();
    await applyUpdate(skip, deps);
    expect(skip).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
    expect(timers).toHaveLength(0);
  });

  it('reloads once the waiting worker activates on a first launch', async () => {
    const waiting = fakeWorker('installed');
    const { deps, reload } = harness({ controlled: false, waiting });
    await applyUpdate(() => {}, deps);
    expect(reload).not.toHaveBeenCalled();
    waiting.state = 'activated';
    for (const fn of waiting.listeners) fn();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('never leaves a dead button: the timer reloads, and only once', async () => {
    const waiting = fakeWorker('installed');
    const { deps, reload, timers } = harness({ controlled: false, waiting });
    await applyUpdate(() => {}, deps);
    expect(timers.map((t) => t.ms)).toEqual([HANDOVER_MS]);
    timers[0]?.fn();
    waiting.state = 'activated';
    for (const fn of waiting.listeners) fn();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads at once when nothing is waiting', async () => {
    const { deps, reload } = harness({ controlled: false });
    await applyUpdate(() => {}, deps);
    expect(reload).toHaveBeenCalledOnce();
  });
});
