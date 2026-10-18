import { signal } from '@preact/signals';
import { type ActiveTabs, type Layout, layoutFor } from './layout.ts';

export const layout = signal<Layout>(layoutFor(typeof window === 'undefined' ? 1280 : window.innerWidth));
export const activeTabs = signal<ActiveTabs>({});

/** An error is something the editor couldn't do, or went wrong in it; anything else is info. */
export type LogLevel = 'info' | 'error';

export interface LogLine {
  readonly id: number;
  readonly at: string;
  readonly text: string;
  readonly level: LogLevel;
  /** How many times it was said in a row: a repeated line is kept once (M2.8). */
  readonly count: number;
}

/** Enough for a bug report's worth of what happened, few enough to draw at once. */
const KEPT = 200;

export const log = signal<LogLine[]>([]);
/** The last error said, for the toast that shows it wherever the console is (M2.8). */
export const lastError = signal<LogLine | null>(null);
let nextLine = 0;

export function note(text: string, level: LogLevel = 'info'): void {
  const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const last = log.value.at(-1);
  const repeat = last !== undefined && last.text === text && last.level === level;
  const line = repeat ? { ...last, at, count: last.count + 1 } : { id: nextLine++, at, text, level, count: 1 };
  const before = repeat ? log.value.slice(0, -1) : log.value;
  log.value = [...before.slice(-(KEPT - 1)), line];
  if (level === 'error') lastError.value = line;
}

export const noteError = (text: string): void => note(text, 'error');

/** How long an error stays on the toast (M2.8). It stays in the console after. */
export const ERROR_SHOWN_MS = 8000;

/** Takes `line` off the toast after `after` ms, unless a newer error has taken its place. Returns the cancel. */
export function expireError(line: LogLine, after = ERROR_SHOWN_MS): () => void {
  const timer = setTimeout(() => {
    if (lastError.value === line) lastError.value = null;
  }, after);
  return () => clearTimeout(timer);
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
