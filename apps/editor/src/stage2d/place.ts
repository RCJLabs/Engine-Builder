/**
 * Where an item lands on the canvas (M7.1, D83, docs/specs/2d-scenes.md#the-view), in whole art
 * pixels, y down as a canvas has it: a sprite's frame with its origin on the item's place, mirrored
 * across that origin when flipped; a box or a sphere standing on its place; a parallax layer at
 * `at + camera·(1 − factor)`, tiled across the view when it repeats; a tilemap (M7.2) up and to the
 * right of its place, its bottom-left corner, and so does a building (M7.3).
 */
import type { SpriteRecord } from '@eb/schema';
import type { Point } from './camera.ts';
import type { Item } from './scene.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A sprite's origin: its own, or its frame's bottom centre. */
export const originOf = (sprite: SpriteRecord): Point => sprite.origin ?? [Math.floor(sprite.frame[0] / 2), 0];

/** The world place an item is drawn at with the camera here: its own, or a parallax layer's. */
export function drawnAt(item: Item, camera: Point): Point {
  const f = item.parallax?.factor;
  if (!f) return [Math.round(item.at[0]), Math.round(item.at[1])];
  return [Math.round(item.at[0] + camera[0] * (1 - f[0])), Math.round(item.at[1] + camera[1] * (1 - f[1]))];
}

/** The item's box in world art pixels (x right, y up from its foot), standing at `at`. */
export function worldBox(item: Item, at: Point, sprite: SpriteRecord | undefined): Rect {
  if (item.look.kind === 'tilemap') {
    const [cols, rows] = item.look.map.size;
    return { x: at[0], y: at[1], w: cols * item.look.tile[0], h: rows * item.look.tile[1] };
  }
  if (item.look.kind === 'building') {
    const { slot, slots, floors } = item.look.building;
    return { x: at[0], y: at[1], w: slot[0] * slots, h: slot[1] * floors };
  }
  const [sx, sy] = [Math.max(1, Math.round(item.scale[0])), Math.max(1, Math.round(item.scale[1]))];
  if (item.look.kind === 'sprite' && sprite) {
    const [ox, oy] = originOf(sprite);
    const [fw, fh] = sprite.frame;
    const left = item.look.flip ? at[0] - (fw - 1 - ox) * sx : at[0] - ox * sx;
    return { x: left, y: at[1] - oy * sy, w: fw * sx, h: fh * sy };
  }
  return { x: at[0] - Math.floor(sx / 2), y: at[1], w: sx, h: item.look.kind === 'sphere' ? sx : sy };
}

/** A world box on a canvas of `rows` art pixels whose bottom-left world pixel is `corner`. */
export const onCanvas = (box: Rect, corner: Point, rows: number): Rect => ({
  x: box.x - corner[0],
  y: rows - (box.y - corner[1]) - box.h,
  w: box.w,
  h: box.h,
});

/** The lefts a repeating layer of width `w` is drawn at to cover a view from `left` for `cols`. */
export function tiles(x: number, w: number, left: number, cols: number): number[] {
  const first = x + Math.floor((left - x) / w) * w;
  const found: number[] = [];
  for (let at = first; at < left + cols; at += w) found.push(at);
  return found;
}
