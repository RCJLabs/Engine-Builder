/**
 * The browser's back as the game's Back, on the player page (M4.2, docs/specs/input.md#back): each
 * screen a button opens adds a history entry, and going back closes one. Closing a screen any other
 * way takes history back to match, so the page never holds entries for screens that are gone, and
 * Android's back gesture closes a screen instead of leaving the game.
 */
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

const KEY = 'ebOpened';

const depthIn = (state: unknown): number => {
  const depth = (state as Record<string, unknown> | null)?.[KEY];
  return typeof depth === 'number' ? depth : 0;
};

/** `depth` is how many screens buttons have opened; `closeTo` closes down to that many. */
export function useBackHistory(depth: number, closeTo: (depth: number) => void, enabled: boolean): void {
  const latest = useRef(closeTo);
  latest.current = closeTo;
  // The entries this page has pushed, counted here rather than read from history.state: history.go
  // is answered later, and a screen opened before it is would find the old entry's state there and
  // push nothing for itself.
  // Undefined until the first sync, which starts from whatever entry the page is on: one left by
  // the last game, if a screen was open as it ended, is taken back.
  const pushed = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const popped = (event: PopStateEvent) => {
      pushed.current = depthIn(event.state);
      latest.current(pushed.current);
    };
    window.addEventListener('popstate', popped);
    return () => window.removeEventListener('popstate', popped);
  }, [enabled]);
  // Before the page paints, so a screen that shows has its entry: after paint, a back pressed at
  // once would find none and leave the page (found by the gate's specs).
  useLayoutEffect(() => {
    if (!enabled) return;
    const had = pushed.current ?? depthIn(history.state);
    if (depth > had) {
      for (let d = had + 1; d <= depth; d++) history.pushState({ ...history.state, [KEY]: d }, '');
    } else if (depth < had) {
      // The popstate this makes finds the screens already closed, and closes nothing more.
      history.go(depth - had);
    }
    pushed.current = depth;
  }, [depth, enabled]);
}
