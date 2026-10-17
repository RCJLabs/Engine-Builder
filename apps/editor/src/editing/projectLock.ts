/**
 * One tab edits a project at a time. Editing holds a Web Lock named for the project; a tab that
 * can't take it opens the project read only, and can ask the editing tab to hand it over. The
 * browser releases a tab's locks when the tab closes or crashes, so a lock never outlives it.
 */

export interface LockOptions {
  readonly ifAvailable?: boolean;
  readonly steal?: boolean;
  readonly signal?: AbortSignal;
}

/** The part of navigator.locks this uses, so the tests can hand it a fake. */
export interface Locks {
  request<T>(name: string, options: LockOptions, callback: (lock: unknown) => Promise<T> | T): Promise<T>;
}

export interface HeldLock {
  readonly name: string;
  /** Lets the lock go, for another tab to take. */
  release(): void;
  /** Settles if another tab takes the lock away: this tab must stop saving at once. */
  readonly lost: Promise<void>;
}

export const browserLocks = (): Locks | null => (globalThis.navigator as { locks?: Locks } | undefined)?.locks ?? null;

export const projectLockName = (folder: string) => `eb-editor:project:${folder}`;
export const folderLockName = (key: number | string) => `eb-editor:folder:${key}`;

/** A promise and the function that settles it. */
function later(): { promise: Promise<void>; settle: () => void } {
  let settle: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    settle = done;
  });
  return { promise, settle };
}

/**
 * Takes the lock. With `ifAvailable` it resolves to null at once when another tab holds it;
 * otherwise it waits its turn, or with `steal` takes it from the holder. `signal` gives up waiting.
 */
export function takeLock(locks: Locks, name: string, options: LockOptions = {}): Promise<HeldLock | null> {
  return new Promise((resolve, reject) => {
    const released = later();
    const lost = later();
    let granted = false;
    locks
      .request(name, options, (lock) => {
        if (!lock) return resolve(null);
        granted = true;
        resolve({ name, release: released.settle, lost: lost.promise });
        // The lock lasts as long as this promise does.
        return released.promise;
      })
      .catch((error: unknown) => {
        // Before the grant, the request failed or was given up; after it, another tab stole the lock.
        if (granted) lost.settle();
        else reject(error);
      });
  });
}
