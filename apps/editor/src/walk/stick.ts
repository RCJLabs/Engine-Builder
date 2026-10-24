/**
 * The floating stick (M5.8, D70, docs/specs/movement.md#controls): it appears where the left thumb
 * lands and pushes as far as the thumb has moved from there, up to its reach. A push inside the dead
 * zone is none; past 85% of the reach, the walk runs.
 */

/** The stick's width in CSS pixels: its reach is half of it. */
export const STICK_SIZE = 112;
export const DEAD_ZONE = 0.12;
export const RUN_PAST = 0.85;

export interface Push {
  /** Right and forward, each -1 to 1, together at most 1 long. */
  readonly x: number;
  readonly y: number;
  readonly run: boolean;
}

export const NO_PUSH: Push = { x: 0, y: 0, run: false };

/**
 * The push of a thumb that landed at `from` and is now at `at`, in page pixels (y down). Outside the
 * dead zone, the push grows from nothing at its edge to all of it at the reach.
 */
export function pushOf(from: { x: number; y: number }, at: { x: number; y: number }, reach = STICK_SIZE / 2): Push {
  const dx = (at.x - from.x) / reach;
  const dy = (from.y - at.y) / reach;
  const raw = Math.hypot(dx, dy);
  if (raw <= DEAD_ZONE) return NO_PUSH;
  const held = Math.min(1, raw);
  const strength = (held - DEAD_ZONE) / (1 - DEAD_ZONE);
  return { x: (dx / raw) * strength, y: (dy / raw) * strength, run: held > RUN_PAST };
}

/** Where the knob is drawn: the thumb's offset from where it landed, held to the reach. */
export function knobOf(from: { x: number; y: number }, at: { x: number; y: number }, reach = STICK_SIZE / 2) {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const d = Math.hypot(dx, dy);
  return d <= reach ? { x: dx, y: dy } : { x: (dx / d) * reach, y: (dy / d) * reach };
}
