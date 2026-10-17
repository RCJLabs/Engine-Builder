import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planRun } from './plan.ts';
import { beginRun, savedRun, saveRun, stepUrl } from './session.ts';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('beginRun', () => {
  it('saves a plan timed by the page’s query and goes to its first step', () => {
    expect(beginRun(false, new URLSearchParams('tier=high&warmup=0.2&measure=0.5'))).toBe(
      '?tier=low&backend=webgl&measuring=1',
    );
    expect(savedRun()).toEqual(planRun(false, 0.2, 0.5));
  });

  it('settles for 3 s and measures for 10 when the query has no usable times', () => {
    expect(beginRun(true, new URLSearchParams('warmup=-1&measure=soon'))).toBe(
      stepUrl({ tier: 'low', backend: 'webgpu' }),
    );
    expect(savedRun()).toEqual(planRun(true, 3, 10));
  });
});

describe('savedRun and saveRun', () => {
  it('drop the run on null', () => {
    saveRun(planRun(false));
    saveRun(null);
    expect(savedRun()).toBeNull();
  });

  it('carry on without storage, which is how a page with it turned off behaves', () => {
    const denied = () => {
      throw new Error('denied');
    };
    vi.stubGlobal('sessionStorage', { getItem: denied, setItem: denied, removeItem: denied });
    expect(() => saveRun(planRun(false))).not.toThrow();
    expect(savedRun()).toBeNull();
  });
});
