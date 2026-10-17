/**
 * Pressing "Reload" and having it work, including on the first launch after an install.
 *
 * Ported from project-ascent (src/lib/swUpdate.ts, M302). With `registerType: 'prompt'` the
 * generated worker never calls `clients.claim()`, so a page opened before any worker existed
 * is not controlled. workbox-window then never fires the reload it would on an ordinary
 * update, and the skip-waiting message still drops the old precache: the button does nothing
 * and lazy chunks start to 404. So: hold the waiting worker before messaging it, reload once
 * it reports `activated`, and reload anyway after HANDOVER_MS rather than leave a dead button.
 */
export const HANDOVER_MS = 4_000;

export interface ApplyDeps {
  registration: () => Promise<ServiceWorkerRegistration | undefined>;
  controlled: () => boolean;
  reload: () => void;
  after: (fn: () => void, ms: number) => void;
}

const browserDeps = (): ApplyDeps => ({
  registration: () => navigator.serviceWorker.getRegistration(),
  controlled: () => Boolean(navigator.serviceWorker?.controller),
  reload: () => window.location.reload(),
  after: (fn, ms) => {
    window.setTimeout(fn, ms);
  },
});

export async function applyUpdate(skipWaiting: () => void, deps: ApplyDeps = browserDeps()): Promise<void> {
  // Read `waiting` before the message: skip-waiting is what clears it.
  const waiting = deps.controlled() ? undefined : (await deps.registration().catch(() => undefined))?.waiting;

  skipWaiting();

  // The ordinary path: workbox reloads on its own `controlling` event; a second reload would race it.
  if (deps.controlled()) return;

  let done = false;
  const once = (): void => {
    if (done) return;
    done = true;
    deps.reload();
  };
  deps.after(once, HANDOVER_MS);

  if (!waiting || waiting.state === 'activated') {
    once();
    return;
  }
  waiting.addEventListener('statechange', () => {
    if (waiting.state === 'activated') once();
  });
}
