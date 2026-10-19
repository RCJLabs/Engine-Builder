/**
 * The browser's back as the game's Back, on the player page (M4.2, docs/specs/input.md#back): each
 * screen a button opens adds a history entry, and going back closes one. Closing a screen any other
 * way takes history back to match, so the page never holds entries for screens that are gone, and
 * Android's back gesture closes a screen instead of leaving the game.
 */
import { useEffect, useRef } from 'preact/hooks';

const KEY = 'ebOpened';

const depthIn = (state: unknown): number => {
  const depth = (state as Record<string, unknown> | null)?.[KEY];
  return typeof depth === 'number' ? depth : 0;
};

/** `depth` is how many screens buttons have opened; `closeTo` closes down to that many. */
export function useBackHistory(depth: number, closeTo: (depth: number) => void, enabled: boolean): void {
  const latest = useRef(closeTo);
  latest.current = closeTo;
  useEffect(() => {
    if (!enabled) return;
    const popped = (event: PopStateEvent) => latest.current(depthIn(event.state));
    window.addEventListener('popstate', popped);
    return () => window.removeEventListener('popstate', popped);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const had = depthIn(history.state);
    if (depth > had) {
      for (let d = had + 1; d <= depth; d++) history.pushState({ ...history.state, [KEY]: d }, '');
    } else if (depth < had) {
      // The popstate this makes finds the screens already closed, and closes nothing more.
      history.go(depth - had);
    }
  }, [depth, enabled]);
}
