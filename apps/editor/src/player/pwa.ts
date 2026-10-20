/**
 * The player page's service worker (M4.3): the editor's, which holds this page too, registered so
 * a new version waits for the player to choose it. The shell offers it on the title only, never in
 * play (docs/specs/shell.md#the-title); Reload is safe there, as every game saved at its last step.
 */

import { registerSW } from 'virtual:pwa-register';
import { signal } from '@preact/signals';
import { applyUpdate } from '../pwa/applyUpdate.ts';

export const updateReady = signal(false);

let skipWaiting: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function startPlayerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  skipWaiting = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady.value = true;
    },
    onRegisteredSW(_url, registration) {
      // Looked for again whenever the page comes back into view, as the editor does.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration?.update().catch(() => undefined);
      });
    },
  });
}

export function applyPlayerUpdate(): void {
  const skip = skipWaiting;
  if (skip) void applyUpdate(() => void skip(true));
}
