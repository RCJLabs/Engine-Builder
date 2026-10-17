/**
 * Web Locks as the spec describes them, in memory, for the editor's lock tests: one holder per
 * name, a queue in the order asked, `ifAvailable` that gives null, and `steal` that grants at
 * once and fails the old holder's request with an AbortError. The e2e tests meet the real ones.
 */
import type { LockOptions, Locks } from '../src/editing/projectLock.ts';

interface Waiting {
  grant(): void;
}

export function fakeLocks(): Locks & { held(name: string): boolean } {
  const holders = new Map<string, { abort(): void }>();
  const queues = new Map<string, Waiting[]>();

  const next = (name: string) => {
    holders.delete(name);
    queues.get(name)?.shift()?.grant();
  };

  function request<T>(name: string, options: LockOptions, callback: (lock: unknown) => Promise<T> | T): Promise<T> {
    if (holders.has(name) && options.ifAvailable) return Promise.resolve().then(() => callback(null));
    return new Promise<T>((resolve, reject) => {
      const grant = () => {
        let stolen = false;
        holders.set(name, {
          abort: () => {
            stolen = true;
            reject(new DOMException('The lock was stolen.', 'AbortError'));
          },
        });
        Promise.resolve()
          .then(() => callback({ name }))
          .then(
            (value) => {
              if (stolen) return;
              next(name);
              resolve(value);
            },
            (error: unknown) => {
              if (stolen) return;
              next(name);
              reject(error);
            },
          );
      };
      if (options.steal) {
        holders.get(name)?.abort();
        grant();
        return;
      }
      if (!holders.has(name)) return grant();
      const waiting: Waiting = { grant };
      queues.set(name, [...(queues.get(name) ?? []), waiting]);
      options.signal?.addEventListener('abort', () => {
        queues.set(
          name,
          (queues.get(name) ?? []).filter((w) => w !== waiting),
        );
        reject(new DOMException('Gave up waiting.', 'AbortError'));
      });
    });
  }

  return { request, held: (name) => holders.has(name) };
}
