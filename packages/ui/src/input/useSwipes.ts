/**
 * Swipes on the page (M4.2, docs/specs/input.md#gestures): touch and pen pointers fed to the
 * recognizer, and each swipe handed on with where it began. A swipe begun on a button presses
 * nothing without help: a touch that moves past the browser's own tap slop, as every swipe does,
 * makes no click.
 */
import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { gestureStep, IDLE, type PointerEventIn } from './gestures.ts';

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
    const feed = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      const kind = event.type === 'pointerdown' ? 'down' : event.type === 'pointermove' ? 'move' : 'up';
      const input: PointerEventIn =
        event.type === 'pointercancel'
          ? { kind: 'cancel', id: event.pointerId }
          : { kind, id: event.pointerId, at: { x: event.clientX, y: event.clientY, t: event.timeStamp } };
      if (input.kind === 'down' && state.kind === 'idle') from = event.target as HTMLElement;
      const step = gestureStep(state, input);
      state = step.state;
      if (step.gesture?.kind === 'swipe' && from) latest.current(step.gesture.direction, from);
    };
    const kinds = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;
    for (const kind of kinds) element.addEventListener(kind, feed);
    return () => {
      for (const kind of kinds) element.removeEventListener(kind, feed);
    };
  }, [box]);
}
