import { signal } from '@preact/signals';
import { type ActiveTabs, type Layout, layoutFor } from './layout.ts';

export const layout = signal<Layout>(layoutFor(typeof window === 'undefined' ? 1280 : window.innerWidth));
export const activeTabs = signal<ActiveTabs>({});

export interface LogLine {
  id: number;
  at: string;
  text: string;
}
export const log = signal<LogLine[]>([]);
let nextLine = 0;

export function note(text: string): void {
  const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  log.value = [...log.value.slice(-49), { id: nextLine++, at, text }];
}

/** Keeps `layout` in step with the window, including rotation and split-screen resizes. */
export function watchLayout(): void {
  const update = (): void => {
    const next = layoutFor(window.innerWidth);
    if (next !== layout.value) layout.value = next;
  };
  window.addEventListener('resize', update);
  update();
}
