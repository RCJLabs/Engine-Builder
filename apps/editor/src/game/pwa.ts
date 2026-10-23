/**
 * An exported web build's service worker (docs/specs/export.md#the-service-worker): registered
 * from ./sw.js, which Export writes for each build. A new build waits until the player chooses it
 * on the title (the shell's "Reload to update"); the page asks for one when it opens, when it comes
 * back into view, and every 6 hours while in view (project-ascent M154). No workbox: the worker is
 * the engine's own, so this is the little of workbox-window it needs.
 */
import { signal } from '@preact/signals';
import { applyUpdate } from '../pwa/applyUpdate.ts';
import { shouldCheckForUpdate } from '../pwa/updateGate.ts';

export const updateReady = signal(false);

let waiting: ServiceWorker | null = null;
let applying = false;

/** Marks a worker as the update once it has installed beside one that controls the page. */
function watch(worker: ServiceWorker | null): void {
  if (!worker) return;
  const check = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waiting = worker;
      updateReady.value = true;
    }
  };
  check();
  worker.addEventListener('statechange', check);
}

export function startGamePwa(): void {
  // file:// and itch's iframe have no worker to register (the boot says so for itch).
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only for an update the player chose: the first build's claim mustn't reload a game in play.
    if (applying) window.location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((registration) => {
      watch(registration.waiting);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      let lastCheckedAt: number | null = Date.now();
      const look = () => {
        const now = Date.now();
        if (!shouldCheckForUpdate({ visible: document.visibilityState === 'visible', lastCheckedAt, now })) return;
        lastCheckedAt = now;
        registration.update().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', () => {
        // Coming back into view always asks: an installed game is resumed, not opened.
        if (document.visibilityState === 'visible') lastCheckedAt = null;
        look();
      });
      window.setInterval(look, 60_000);
    })
    .catch(() => undefined);
}

export function applyGameUpdate(): void {
  const worker = waiting;
  if (!worker) return;
  applying = true;
  void applyUpdate(() => worker.postMessage({ type: 'SKIP_WAITING' }));
}
