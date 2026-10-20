/**
 * Touch gestures as a state machine fed pointer events (M4.2, docs/specs/input.md#gestures), from
 * Space-Wrecked's gestures.js: idle, pending, drag, held, spent. It adds the swipe, which is all a
 * game's screens use yet; the long press is known so a later widget can use it. A plain function
 * of events and their times, so the thresholds are tested without a finger.
 */

/** How far a press moves before it is a drag, and how long one held still takes to be a long press. */
export const SLOP = 10;
export const LONG_PRESS = 450;
/** A swipe: this far sideways, twice as far as up or down, this quickly. */
export const SWIPE_MIN = 48;
export const SWIPE_TIME = 800;

export interface Point {
  readonly x: number;
  readonly y: number;
  /** Milliseconds. */
  readonly t: number;
}

export type GestureState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' | 'drag' | 'held'; readonly id: number; readonly start: Point }
  | { readonly kind: 'spent'; readonly id: number };

export type PointerEventIn =
  | { readonly kind: 'down' | 'move' | 'up'; readonly id: number; readonly at: Point }
  | { readonly kind: 'cancel'; readonly id: number };

export type Gesture =
  | { readonly kind: 'swipe'; readonly direction: 'left' | 'right' }
  | { readonly kind: 'long-press' }
  | { readonly kind: 'tap' };

export const IDLE: GestureState = { kind: 'idle' };

const moved = (start: Point, at: Point) => Math.hypot(at.x - start.x, at.y - start.y) >= SLOP;

function swipeOf(start: Point, end: Point): Gesture | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 2 * Math.abs(dy) || end.t - start.t > SWIPE_TIME) return undefined;
  return { kind: 'swipe', direction: dx < 0 ? 'left' : 'right' };
}

/** One pointer event: the state after it, and the gesture it ends, if any. */
export function gestureStep(state: GestureState, event: PointerEventIn): { state: GestureState; gesture?: Gesture } {
  if (event.kind === 'down') {
    // A second finger spends the gesture: nothing two fingers do is a swipe.
    if (state.kind !== 'idle') return { state: { kind: 'spent', id: 'id' in state ? state.id : event.id } };
    return { state: { kind: 'pending', id: event.id, start: event.at } };
  }
  if (state.kind === 'idle' || state.id !== event.id) return { state };
  if (event.kind === 'cancel') return { state: IDLE };
  if (state.kind === 'spent') return { state: event.kind === 'up' ? IDLE : state };
  const { start } = state;
  if (event.kind === 'move') {
    if (state.kind === 'pending' && moved(start, event.at)) return { state: { kind: 'drag', id: state.id, start } };
    if (state.kind === 'pending' && event.at.t - start.t >= LONG_PRESS) {
      return { state: { kind: 'held', id: state.id, start } };
    }
    return { state };
  }
  if (state.kind === 'drag') {
    const swipe = swipeOf(start, event.at);
    return swipe ? { state: IDLE, gesture: swipe } : { state: IDLE };
  }
  const long = state.kind === 'held' || event.at.t - start.t >= LONG_PRESS;
  return { state: IDLE, gesture: long ? { kind: 'long-press' } : { kind: 'tap' } };
}
