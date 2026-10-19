/**
 * Swipes on the page (M4.2, docs/specs/input.md#gestures): touch and pen pointers fed to the
 * recognizer, and each swipe handed on with where it began. The click a swipe begun on a button
 * would still make is swallowed, so a swipe presses nothing; the next press puts an end to that,
 * since a swipe that makes no click would otherwise eat a quick tap after it.
 */
import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { gestureStep, IDLE, type PointerEventIn } from './gestures.ts';

/** How long after a swipe its click may still come. */
const CLICK_AFTER = 400;

export function useSwipes(
  box: RefObject<HTMLElement | null>,
  swiped: (direction: 'left' | 'right', from: HTMLElement) => void,
): void {
  const latest = useRef(swiped);
  latest.current = swiped;
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let state = IDLE;
    let from: HTMLElement | null = null;
    const swallow = (event: Event) => {
      event.stopPropagation();
      event.preventDefault();
    };
    const feed = (event: PointerEvent) => {
      if (event.type === 'pointerdown') element.removeEventListener('click', swallow, { capture: true });
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      const kind = event.type === 'pointerdown' ? 'down' : event.type === 'pointermove' ? 'move' : 'up';
      const input: PointerEventIn =
        event.type === 'pointercancel'
          ? { kind: 'cancel', id: event.pointerId }
          : { kind, id: event.pointerId, at: { x: event.clientX, y: event.clientY, t: event.timeStamp } };
      if (input.kind === 'down' && state.kind === 'idle') from = event.target as HTMLElement;
      const step = gestureStep(state, input);
      state = step.state;
      if (step.gesture?.kind !== 'swipe' || !from) return;
      element.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => element.removeEventListener('click', swallow, { capture: true }), CLICK_AFTER);
      latest.current(step.gesture.direction, from);
    };
    const kinds = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;
    for (const kind of kinds) element.addEventListener(kind, feed);
    return () => {
      for (const kind of kinds) element.removeEventListener(kind, feed);
    };
  }, [box]);
}
