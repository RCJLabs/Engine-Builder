// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Draws the builder board: the ship as a 3D blueprint over a navy grid, and
// whatever the player is doing on it, or, with the hull on, the ship as it
// looks from outside.
//
// The board needs only deep space from this file, drawSpace: the builder's
// board and the ship's outside it draws (exterior.js, hull.js, shipScene.js
// and the rest) stay behind.
import { seedFrom } from '../core/rng.ts';
import type { Rect } from './orbit.ts';
import { palette, rgba } from './palette.ts';
import { drawStars, makeStarfield } from './starfield.ts';

const SKY = makeStarfield(seedFrom('hull view'), 220);

// Deep space behind the ship seen from outside (and behind a battle map):
// a faint nebula and stars.
export function drawSpace(ctx: OffscreenCanvasRenderingContext2D, rect: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const [cx, cy] = [rect.x + rect.w * 0.6, rect.y + rect.h * 0.4];
  const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rect.w, rect.h) * 0.7);
  haze.addColorStop(0, rgba(palette.nebulaB, 0.4));
  haze.addColorStop(1, rgba(palette.nebulaB, 0));
  ctx.fillStyle = haze;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  drawStars(ctx, SKY, { width: rect.x + rect.w, height: rect.y + rect.h }, 0);
}
