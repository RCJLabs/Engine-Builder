/**
 * Showing a panel, whatever the layout: a dock tab on desktop, a zone's tab on tablet and phone,
 * and the bottom sheet for the inspector on a phone. The palette's commands go through here.
 */
import { signal } from '@preact/signals';
import type { DockHandle } from './dock/desktopDock.tsx';
import { type DockPanelId, SHEET, tabOf, zoneOf, zonePanelId } from './layout.ts';
import { activeTabs, layout } from './state.ts';

/** Whether the phone's inspector sheet is open. */
export const sheetOpen = signal(false);
export const SHEET_BODY_ID = 'inspector-sheet-body';
/** The console's lines where the console is no tab: the tablet's strip, or desktop's while its dock is down. */
export const CONSOLE_STRIP_ID = 'console-strip-lines';

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
  // By its tab, or behind a phone's More (D37), whose tab is then the one chosen.
  const zone = zoneOf(current, id);
  if (zone) {
    activeTabs.value = { ...activeTabs.value, [zone]: id };
    focusSoon(zonePanelId(zone, tabOf(current, id)));
  } else if (id === 'console') {
    // Behind a phone's More, but in view in no zone on a tablet: focus goes to it there.
    focusSoon(CONSOLE_STRIP_ID);
  }
}

export function resetLayout(): void {
  dock?.reset();
}
