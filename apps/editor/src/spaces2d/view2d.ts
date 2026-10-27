/**
 * The Scene panel's 2D view as plain values (M7.1, D83, docs/specs/2d-scenes.md#the-editor): where
 * it looks, in world art pixels, and its zoom, a whole number of device pixels an art pixel, so every
 * art pixel is drawn as a whole square; screen points to world points and back; a pan by a drag; a
 * zoom by a step that keeps the point under the pointer still; and Frame, which fits boxes at the
 * largest whole zoom they fit.
 */
import { type Point, viewCorner } from '../stage2d/camera.ts';
import type { Rect } from '../stage2d/place.ts';

export interface View2d {
  /** The world art pixel at the view's middle. */
  readonly centre: Point;
  /** Device pixels an art pixel: a whole number from 1 to ZOOM_MOST. */
  readonly zoom: number;
}

export const ZOOM_MOST = 16;
/** The art pixels Frame leaves round what it fits, on each side. */
const MARGIN = 8;

export const clampZoom = (zoom: number): number => Math.min(ZOOM_MOST, Math.max(1, Math.round(zoom)));

/** The canvas's size in art pixels for a box of `css` CSS pixels at `dpr`. */
export const artSize = (css: Point, dpr: number, zoom: number): Point => [
  Math.max(1, Math.ceil((css[0] * dpr) / zoom)),
  Math.max(1, Math.ceil((css[1] * dpr) / zoom)),
];

/** The world point under a point of the box, in CSS pixels from its top-left: y up, fractions kept. */
export function toWorld(view: View2d, at: Point, css: Point, dpr: number): Point {
  const art = artSize(css, dpr, view.zoom);
  const corner = viewCorner(view.centre, art);
  return [corner[0] + (at[0] * dpr) / view.zoom, corner[1] + art[1] - (at[1] * dpr) / view.zoom];
}

/** A world box on the box, in CSS pixels from its top-left. */
export function toScreen(view: View2d, box: Rect, css: Point, dpr: number): Rect {
  const art = artSize(css, dpr, view.zoom);
  const corner = viewCorner(view.centre, art);
  const k = view.zoom / dpr;
  return { x: (box.x - corner[0]) * k, y: (corner[1] + art[1] - box.y - box.h) * k, w: box.w * k, h: box.h * k };
}

/** The view moved by a drag of `by` CSS pixels: the world follows the finger, kept at whole pixels. */
export function panned(view: View2d, from: Point, by: Point, dpr: number): View2d {
  const k = dpr / view.zoom;
  return { ...view, centre: [Math.round(from[0] - by[0] * k), Math.round(from[1] + by[1] * k)] };
}

/** The view zoomed by `steps` whole steps, the world point under `at` staying under it. */
export function zoomedAt(view: View2d, steps: number, at: Point, css: Point, dpr: number): View2d {
  const zoom = clampZoom(view.zoom + steps);
  if (zoom === view.zoom) return view;
  const before = toWorld(view, at, css, dpr);
  const moved = toWorld({ ...view, zoom }, at, css, dpr);
  return {
    zoom,
    centre: [Math.round(view.centre[0] + before[0] - moved[0]), Math.round(view.centre[1] + before[1] - moved[1])],
  };
}

/** The boxes' union, or null for none. */
export function unionOf(boxes: readonly Rect[]): Rect | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((b) => b.x));
  const bottom = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: left, y: bottom, w: right - left, h: top - bottom };
}

/** Frame: the boxes in view at the largest whole zoom they fit with a margin, centred on them. */
export function framed(boxes: readonly Rect[], css: Point, dpr: number): View2d | null {
  const all = unionOf(boxes);
  if (!all) return null;
  const fits = Math.floor(Math.min((css[0] * dpr) / (all.w + 2 * MARGIN), (css[1] * dpr) / (all.h + 2 * MARGIN)));
  return {
    zoom: clampZoom(fits),
    centre: [Math.round(all.x + all.w / 2), Math.round(all.y + all.h / 2)],
  };
}

/** A pinch's whole steps from the zoom it began at: that zoom scaled by the fingers' spread, rounded. */
export const pinchSteps = (from: number, to: number, zoom: number): number =>
  from <= 0 || to <= 0 ? 0 : clampZoom(zoom * (to / from)) - zoom;
