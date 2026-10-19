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
  const latest = useRef({ depth, closeTo });
  latest.current = { depth, closeTo };
  // The entries this page has pushed, and whether a step back of its own is still on its way:
  // history.go is answered later, so until its popstate comes, history.state is the old entry's.
  const kept = useRef({ pushed: 0, waiting: false });
  const sync = useRef(() => {
    const at = kept.current;
    if (at.waiting) return;
    const want = latest.current.depth;
    if (want > at.pushed) {
      for (let d = at.pushed + 1; d <= want; d++) history.pushState({ ...history.state, [KEY]: d }, '');
    } else if (want < at.pushed) {
      at.waiting = true;
      history.go(want - at.pushed);
    }
    at.pushed = want;
  });
  useEffect(() => {
    if (!enabled) return;
    kept.current = { pushed: depthIn(history.state), waiting: false };
    const popped = (event: PopStateEvent) => {
      const at = kept.current;
      if (at.waiting) {
        // Our own step back has landed: catch up with whatever opened meanwhile.
        at.waiting = false;
        sync.current();
        return;
      }
      at.pushed = depthIn(event.state);
      latest.current.closeTo(at.pushed);
    };
    window.addEventListener('popstate', popped);
    return () => window.removeEventListener('popstate', popped);
  }, [enabled]);
  useEffect(() => {
    if (enabled) sync.current();
  }, [depth, enabled]);
}
