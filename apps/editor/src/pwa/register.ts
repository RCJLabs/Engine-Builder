import { registerSW } from 'virtual:pwa-register';
import { signal } from '@preact/signals';
import { note } from '../app/state.ts';
import { applyUpdate } from './applyUpdate.ts';
import { DEFER_MS, deferralActive, shouldCheckForUpdate } from './updateGate.ts';

export const updateReady = signal(false);
export const deferredAt = signal<number | null>(null);

let skipWaiting: ((reloadPage?: boolean) => Promise<void>) | undefined;

/** Asks for a new worker when the editor becomes visible, and every so often while it stays visible. */
function watchForUpdates(registration: ServiceWorkerRegistration): void {
  let lastCheckedAt: number | null = Date.now(); // registering just checked
  const check = (): void => {
    if (deferredAt.value !== null && !deferralActive(deferredAt.value, Date.now())) deferredAt.value = null;
    const now = Date.now();
    if (!shouldCheckForUpdate({ visible: document.visibilityState === 'visible', lastCheckedAt, now })) return;
    lastCheckedAt = now;
    // Offline or a server blip: nothing to report, the next check asks again.
    registration.update().catch(() => {});
  };
  document.addEventListener('visibilitychange', check);
  window.setInterval(check, 60_000);
}

export function startPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  skipWaiting = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady.value = true;
      note('A new version of the editor is ready.');
    },
    onOfflineReady() {
      note('Offline copy saved: the editor now opens without a connection.');
    },
    onRegisteredSW(_url, registration) {
      if (registration) watchForUpdates(registration);
    },
    onRegisterError() {
      note('Offline support is unavailable in this browser.');
    },
  });
}

export function reloadIntoUpdate(): void {
  const skip = skipWaiting;
  if (skip) void applyUpdate(() => void skip(true));
}

export function deferUpdate(): void {
  deferredAt.value = Date.now();
  note(`Update deferred for ${DEFER_MS / 3_600_000} hours.`);
}
