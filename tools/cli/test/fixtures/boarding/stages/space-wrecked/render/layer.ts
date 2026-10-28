// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// An offscreen canvas covering a rect of the screen at `ratio` device pixels
// per CSS pixel. Boards draw a frame into one and copy it to the screen, so
// a frame can be reused, drawn at a lower resolution, or kept (space behind
// a battle map). target is { canvas }: the canvas is made on first use and
// resized only when the size changes. paint(g) draws in CSS pixels.
// Returns the canvas.
import type { Rect } from './orbit.ts';

export interface Layer {
  canvas: OffscreenCanvas | null;
}

export function paintLayer(target: Layer, rect: Rect, ratio: number, paint: (g: OffscreenCanvasRenderingContext2D) => void): OffscreenCanvas {
  // A stage draws in a worker, which has no document: its canvases are
  // OffscreenCanvases.
  target.canvas ??= new OffscreenCanvas(1, 1);
  const [w, h] = [Math.round(rect.w * ratio), Math.round(rect.h * ratio)];
  if (target.canvas.width !== w || target.canvas.height !== h) {
    target.canvas.width = w;
    target.canvas.height = h;
  }
  const g = target.canvas.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D;
  g.setTransform(ratio, 0, 0, ratio, -rect.x * ratio, -rect.y * ratio);
  paint(g);
  return target.canvas;
}
