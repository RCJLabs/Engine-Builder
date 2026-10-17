/**
 * Showing a panel, whatever the layout: a dock tab on desktop, a zone's tab on tablet and phone,
 * and the bottom sheet for the inspector on a phone. The palette's commands go through here.
 */
import { signal } from '@preact/signals';
import type { DockHandle } from './dock/desktopDock.tsx';
import { type DockPanelId, SHEET, ZONES, zonePanelId } from './layout.ts';
import { activeTabs, layout } from './state.ts';

/** Whether the phone's inspector sheet is open. */
export const sheetOpen = signal(false);
export const SHEET_BODY_ID = 'inspector-sheet-body';

/** Focus goes into the panel shown once it has rendered, so keyboard users land in it. */
const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

let dock: DockHandle | null = null;

/** Set by the desktop layout once its dock is up, and cleared when it goes. */
export function setDock(handle: DockHandle | null): void {
  dock = handle;
}

export const dockReady = () => dock !== null;

export function showPanel(id: DockPanelId): void {
  const current = layout.value;
  if (current === 'desktop' && dock) {
    dock.show(id);
    return;
  }
  if (SHEET[current] === id) {
    sheetOpen.value = true;
    focusSoon(SHEET_BODY_ID);
    return;
  }
  const zone = ZONES[current].find((z) => (z.panels as readonly DockPanelId[]).includes(id));
  if (zone && id !== 'console') {
    activeTabs.value = { ...activeTabs.value, [zone.zone]: id };
    focusSoon(zonePanelId(zone.zone, id));
  }
}

export function resetLayout(): void {
  dock?.reset();
}
