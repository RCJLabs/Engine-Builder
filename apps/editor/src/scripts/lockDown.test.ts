import { describe, expect, it } from 'vitest';
import { HOST_NAMES, lockDown } from './lockDown.ts';

describe('locking the script worker down', () => {
  it('takes the network and storage off the global, own or inherited, and says what it couldn’t', () => {
    const proto = {};
    Object.defineProperty(proto, 'navigator', { get: () => ({ storage: {} }), configurable: true });
    const scope = Object.create(proto) as Record<string, unknown>;
    scope.fetch = () => 'sent';
    scope.indexedDB = {};
    Object.defineProperty(scope, 'caches', { value: {}, configurable: false, writable: false });
    scope.postMessage = () => undefined;
    expect(lockDown(scope)).toEqual(['caches']);
    expect(scope.fetch).toBeUndefined();
    expect(scope.indexedDB).toBeUndefined();
    expect(scope.navigator).toBeUndefined();
    // What the worker needs to answer stays.
    expect(typeof scope.postMessage).toBe('function');
  });

  it('names the ways a script could reach past the sim', () => {
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'indexedDB', 'caches', 'navigator', 'importScripts'])
      expect(HOST_NAMES).toContain(name);
  });
});
