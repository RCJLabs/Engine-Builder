/**
 * The player's input as a stage reads it (M7.4, D86, docs/specs/stages.md#the-api), as plain
 * functions: one finger or the mouse is a drag, two fingers a twist (turned and pinched), a press
 * that barely moves a tap. Events of a kind in a row are joined, so a frame's list stays short
 * however many pointer events the browser sent.
 */
import type { StageInput } from './api.ts';

/** How far a press may wander, in CSS pixels, and still be a tap. */
export const TAP_SLOP_PX = 8;

export interface Pointer {
  readonly x: number;
  readonly y: number;
  /** Where it went down, and whether it has wandered past the tap's slop since. */
  readonly from: readonly [number, number];
  readonly wandered: boolean;
}

/** An event added to the frame's list, joined to the last when both are drags, twists or wheels. */
export function pushInput(list: StageInput[], event: StageInput): void {
  const last = list[list.length - 1];
  if (last?.kind === 'drag' && event.kind === 'drag')
    list[list.length - 1] = { kind: 'drag', dx: last.dx + event.dx, dy: last.dy + event.dy };
  else if (last?.kind === 'twist' && event.kind === 'twist')
    list[list.length - 1] = { kind: 'twist', angle: last.angle + event.angle, scale: last.scale * event.scale };
  else if (last?.kind === 'wheel' && event.kind === 'wheel')
    list[list.length - 1] = { kind: 'wheel', dy: last.dy + event.dy };
  else list.push(event);
}

/** A pointer moved: its own state, and whether it has now wandered past a tap. */
export function moved(pointer: Pointer, x: number, y: number): Pointer {
  const wandered = pointer.wandered || Math.hypot(x - pointer.from[0], y - pointer.from[1]) > TAP_SLOP_PX;
  return { x, y, from: pointer.from, wandered };
}

/** The angle between two fingers, from the first to the second, in radians. */
const angleOf = (a: Pointer, b: Pointer) => Math.atan2(b.y - a.y, b.x - a.x);

/** The turn between two angles, the short way round. */
function turn(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * What one pointer's move is, given the pointers down before it: a drag with one, a twist with two
 * (the pair before and after), nothing with more.
 */
export function gestureOf(
  before: readonly Pointer[],
  id: number,
  after: Pointer,
  ids: readonly number[],
): StageInput | undefined {
  const at = ids.indexOf(id);
  if (at < 0) return undefined;
  if (before.length === 1)
    return { kind: 'drag', dx: after.x - (before[0] as Pointer).x, dy: after.y - (before[0] as Pointer).y };
  if (before.length !== 2) return undefined;
  const [a, b] = before as [Pointer, Pointer];
  const [a2, b2] = at === 0 ? [after, b] : [a, after];
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const span2 = Math.hypot(b2.x - a2.x, b2.y - a2.y);
  return { kind: 'twist', angle: turn(angleOf(a, b), angleOf(a2, b2)), scale: span > 0 ? span2 / span : 1 };
}

/** The keys a stage hears: the arrows, and + and - (= being + without the shift). */
export const STAGE_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  '+',
  '-',
  '=',
]);
