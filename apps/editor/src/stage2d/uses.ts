/**
 * The uses a 2D space offers as buttons over their sprites (M7.1, D83, docs/specs/2d-scenes.md#play):
 * a tap, a click, Tab and Enter, E, or the pad's focus and A all reach them as the page's own
 * buttons. A button covers its sprite's box in CSS pixels, grown about its centre to 44 px at least,
 * as every target on a phone is.
 */
import type { Rect } from './place.ts';

/** The least a target is across and up, in CSS pixels. */
export const TARGET_PX = 44;

/** A box on the canvas, in art pixels, as CSS pixels over it: grown to TARGET_PX about its centre. */
export function targetOf(canvasBox: Rect, scale: number, dpr: number): Rect {
  const k = scale / dpr;
  const [w, h] = [canvasBox.w * k, canvasBox.h * k];
  const [cx, cy] = [canvasBox.x * k + w / 2, canvasBox.y * k + h / 2];
  const [W, H] = [Math.max(w, TARGET_PX), Math.max(h, TARGET_PX)];
  return { x: cx - W / 2, y: cy - H / 2, w: W, h: H };
}

/** The camera that brings a use into view: its box's centre, which clampCamera then keeps within the space. */
export const centreOf = (worldBox: Rect): readonly [number, number] => [
  worldBox.x + worldBox.w / 2,
  worldBox.y + worldBox.h / 2,
];
