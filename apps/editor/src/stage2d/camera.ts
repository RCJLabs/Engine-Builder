/**
 * A 2D space's camera (M7.1, D83, docs/specs/2d-scenes.md#the-view): its centre in whole art
 * pixels, kept within the space's size, and centred on an axis the view is wider than. From
 * 2060td's camera (stage/camera.ts:13-83), without the zoom, which only the editor has.
 */

export type Point = readonly [number, number];

/** The centre kept within `size` for a view of `view` art pixels, at whole pixels. */
export function clampCamera(centre: Point, view: Point, size: Point): Point {
  const axis = (c: number, v: number, s: number) =>
    v >= s ? Math.floor(s / 2) : Math.min(s - Math.ceil(v / 2), Math.max(Math.floor(v / 2), Math.round(c)));
  return [axis(centre[0], view[0], size[0]), axis(centre[1], view[1], size[1])];
}

/** The camera moved by a drag of `css` CSS pixels at `scale` device pixels an art pixel: the world follows the finger. */
export function panned(centre: Point, css: Point, dpr: number, scale: number): Point {
  return [centre[0] - (css[0] * dpr) / scale, centre[1] + (css[1] * dpr) / scale];
}

/** The world's art pixel at the canvas's bottom-left corner, for a view centred on `camera`. */
export const viewCorner = (camera: Point, view: Point): Point => [
  Math.round(camera[0]) - Math.floor(view[0] / 2),
  Math.round(camera[1]) - Math.floor(view[1] / 2),
];
